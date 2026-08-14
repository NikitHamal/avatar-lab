import type { AgentAttachment, AgentMessage, AgentModel, AgentProvider } from './types'
import { AGENT_SYSTEM_PROMPT } from './agentPrompt'

const API_BASE = ''
const MAX_REFERENCE_FILE_BYTES = 12 * 1024 * 1024
const MAX_UPLOADED_REFERENCES_PER_REQUEST = 24

export const DEFAULT_MODELS: AgentModel[] = [
  {
    id: 'qwen3.8-max',
    name: 'Qwen 3.8 Max (Flagship + Vision)',
    provider: 'qwen',
    capabilities: {
      chat: true,
      stream: true,
      vision: true,
      thinking: true,
      search: true,
      tools: true,
    },
  },
  {
    id: 'qwen3.8-max-preview',
    name: 'Qwen 3.8 Max Preview',
    provider: 'qwen',
    capabilities: {
      chat: true,
      stream: true,
      vision: true,
      thinking: true,
      search: true,
      tools: true,
    },
  },
  {
    id: 'qwen3.7-plus',
    name: 'Qwen 3.7 Plus (Vision + Fast)',
    provider: 'qwen',
    capabilities: {
      chat: true,
      stream: true,
      vision: true,
      thinking: true,
      search: true,
      tools: true,
    },
  },
  {
    id: 'qwen3.6-plus',
    name: 'Qwen 3.6 Plus',
    provider: 'qwen',
    capabilities: {
      chat: true,
      stream: true,
      vision: true,
      thinking: true,
      search: true,
      tools: true,
    },
  },
  {
    id: 'laguna-s-2.1',
    name: 'Laguna S 2.1 (Poolside AI)',
    provider: 'poolside',
    capabilities: { chat: true, stream: true, vision: false, thinking: false, search: true },
  },
  {
    id: 'laguna-xs-2.1',
    name: 'Laguna XS 2.1 (Poolside AI)',
    provider: 'poolside',
    capabilities: { chat: true, stream: true, vision: false, thinking: false, search: true },
  },
  {
    id: 'MBZUAI-IFM/K2-Think-v2',
    name: 'K2 Think V2 (Deep Reasoning)',
    provider: 'k2think',
    capabilities: { chat: true, stream: true, vision: false, thinking: true, search: false },
  },
]

async function fetchAI(endpoint: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, init)
    if (res.status === 502 || res.status === 504) {
      return await fetch(`http://127.0.0.1:8765${endpoint}`, init)
    }
    return res
  } catch (err) {
    try {
      return await fetch(`http://127.0.0.1:8765${endpoint}`, init)
    } catch {
      throw err
    }
  }
}

export async function fetchAvailableModels(): Promise<AgentModel[]> {
  try {
    const res = await fetchAI('/api/ai/models', {
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data.models) && data.models.length > 0) {
        return data.models.map((m: Record<string, unknown>) => {
          let provider: AgentProvider = 'qwen'
          const id = String(m.id || '')
          if (id.startsWith('laguna')) provider = 'poolside'
          else if (id.includes('K2-Think') || id === 'k2think') provider = 'k2think'

          return {
            id,
            name: String(m.name || id),
            provider: (m.provider as AgentProvider) || provider,
            capabilities: (m.capabilities as Record<string, boolean>) || {},
            max_context_length: Number(m.max_context_length) || 128000,
            is_active: m.is_active !== false,
          }
        })
      }
    }
  } catch (e) {
    console.debug('Failed to fetch live models from proxy, using fallbacks:', e)
  }
  return DEFAULT_MODELS
}

export async function uploadReferenceFile(file: File): Promise<AgentAttachment> {
  const attachment: AgentAttachment = {
    id: `att-${crypto.randomUUID()}`,
    name: file.name,
    mimeType: file.type,
    size: file.size,
  }

  if (file.size > MAX_REFERENCE_FILE_BYTES) {
    return {
      ...attachment,
      error: `Reference file is larger than ${Math.round(MAX_REFERENCE_FILE_BYTES / 1024 / 1024)} MB`,
    }
  }

  try {
    const formData = new FormData()
    formData.append('file', file, file.name)
    const res = await fetchAI('/api/ai/upload', {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Upload failed (${res.status}): ${text.slice(0, 150)}`)
    }
    const data = await res.json()
    if (!data.success || !data.file) {
      throw new Error(data.error || 'Upload was unsuccessful')
    }
    return {
      ...attachment,
      fileObj: data.file,
    }
  } catch (err) {
    return {
      ...attachment,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export type StreamChatCallbacks = {
  onText: (delta: string) => void
  onThought: (delta: string) => void
  onDone: () => void
  onError: (error: string) => void
}

export async function streamChatCompletion(
  options: {
    messages: AgentMessage[]
    provider: AgentProvider
    model: string
    systemPrompt?: string
    signal?: AbortSignal
  },
  callbacks: StreamChatCallbacks
): Promise<void> {
  const { messages, provider, model, systemPrompt, signal } = options

  // Collect uploaded file references from all messages
  const uploadedFiles: unknown[] = []
  const formattedMessages = messages.map(m => {
    if (m.attachments && m.attachments.length > 0) {
      m.attachments.forEach(att => {
        if (att.fileObj) uploadedFiles.push(att.fileObj)
      })
    }
    return {
      role: m.role,
      content: m.content,
    }
  })

  const payload = {
    provider,
    model,
    messages: formattedMessages,
    uploaded_files: uploadedFiles.slice(-MAX_UPLOADED_REFERENCES_PER_REQUEST),
    system_prompt: systemPrompt || AGENT_SYSTEM_PROMPT,
  }

  try {
    const res = await fetchAI('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(payload),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      callbacks.onError(`Proxy error ${res.status}: ${errText.slice(0, 200)}`)
      return
    }

    if (!res.body) {
      callbacks.onError('Response body is empty')
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const rawJson = trimmed.slice(5).trim()
        if (!rawJson || rawJson === '[DONE]') {
          callbacks.onDone()
          return
        }

        try {
          const event = JSON.parse(rawJson)
          if (event.type === 'text' && event.content) {
            callbacks.onText(event.content)
          } else if (event.type === 'thought' && event.content) {
            callbacks.onThought(event.content)
          } else if (event.type === 'error') {
            callbacks.onError(event.error || 'Stream error')
            return
          } else if (event.type === 'done') {
            callbacks.onDone()
            return
          }
        } catch {
          // ignore transient json chunk errors
        }
      }
    }

    callbacks.onDone()
  } catch (err) {
    if (signal?.aborted) return
    callbacks.onError(err instanceof Error ? err.message : String(err))
  }
}
