import { useEffect, useRef, useState } from 'react'
import type { StudioController } from '../studio/useStudioController'
import type {
  AgentActionItem,
  AgentAttachment,
  AgentMessage,
  AgentModel,
  AgentProvider,
} from './types'
import {
  DEFAULT_MODELS,
  fetchAvailableModels,
  streamChatCompletion,
  uploadReferenceFile,
} from './agentService'
import { extractAgentActions, executeAgentAction, revertAgentAction } from './agentActionExecutor'
import { AGENT_SYSTEM_PROMPT, buildStudioContextPrompt } from './agentPrompt'

const AGENT_OPEN_KEY = 'avatar-agent-open'
const AGENT_WIDTH_KEY = 'avatar-agent-width'
const AGENT_MODEL_KEY = 'avatar-agent-model'
const AGENT_AUTO_APPLY_KEY = 'avatar-agent-auto-apply'
const AGENT_MESSAGES_KEY = 'avatar-agent-chat-history'

const INITIAL_GREETING: AgentMessage = {
  id: 'msg-welcome',
  role: 'assistant',
  content:
    '👋 **Hello! I am your Avatar Lab AI Agent.**\n\nI can create custom 3D avatars, sculpt accessories and body parts, author emotional facial expressions, choreograph fluid animations, or generate avatars directly from your uploaded reference images.\n\nTry asking me to:\n- *"Create a cute cybernetic fox with glowing eyes and pointed ears"*\n- *"Generate 5 expressive anime faces for this avatar"*\n- *"Make a smooth speaking animation loop"*',
  timestamp: Date.now(),
  status: 'done',
}

export function useAgentController(studioController: StudioController) {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const stored = window.localStorage.getItem(AGENT_OPEN_KEY)
      return stored !== null ? stored === 'true' : true
    } catch {
      return true
    }
  })

  const [sidebarWidth, setSidebarWidthState] = useState(() => {
    try {
      const stored = window.localStorage.getItem(AGENT_WIDTH_KEY)
      const parsed = stored ? parseInt(stored, 10) : 440
      return Number.isFinite(parsed) && parsed >= 340 && parsed <= 800 ? parsed : 440
    } catch {
      return 440
    }
  })

  const [availableModels, setAvailableModels] = useState<AgentModel[]>(DEFAULT_MODELS)
  const [model, setModelState] = useState(() => {
    try {
      return window.localStorage.getItem(AGENT_MODEL_KEY) || 'qwen3.8-max'
    } catch {
      return 'qwen3.8-max'
    }
  })

  const currentModelInfo = availableModels.find(m => m.id === model) || DEFAULT_MODELS[0]
  const provider: AgentProvider = currentModelInfo.provider

  const [autoApply, setAutoApplyState] = useState(() => {
    try {
      const stored = window.localStorage.getItem(AGENT_AUTO_APPLY_KEY)
      return stored !== null ? stored === 'true' : true
    } catch {
      return true
    }
  })

  const [messages, setMessages] = useState<AgentMessage[]>(() => {
    try {
      const stored = window.localStorage.getItem(AGENT_MESSAGES_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {
      // fallback
    }
    return [INITIAL_GREETING]
  })

  const [inputText, setInputText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<AgentAttachment[]>([])
  const [error, setError] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const studioControllerRef = useRef(studioController)
  studioControllerRef.current = studioController

  // Fetch live models catalog
  useEffect(() => {
    let active = true
    fetchAvailableModels().then(models => {
      if (active && models.length > 0) {
        setAvailableModels(models)
      }
    })
    return () => {
      active = false
    }
  }, [])

  // Persist preferences
  const toggleOpen = (next?: boolean) => {
    setIsOpen(current => {
      const val = next !== undefined ? next : !current
      try {
        window.localStorage.setItem(AGENT_OPEN_KEY, String(val))
      } catch {}
      return val
    })
  }

  const setSidebarWidth = (width: number) => {
    const clamped = Math.max(340, Math.min(800, width))
    setSidebarWidthState(clamped)
    try {
      window.localStorage.setItem(AGENT_WIDTH_KEY, String(clamped))
    } catch {}
  }

  const setModel = (nextModel: string) => {
    setModelState(nextModel)
    try {
      window.localStorage.setItem(AGENT_MODEL_KEY, nextModel)
    } catch {}
  }

  const setAutoApply = (val: boolean) => {
    setAutoApplyState(val)
    try {
      window.localStorage.setItem(AGENT_AUTO_APPLY_KEY, String(val))
    } catch {}
  }

  const saveMessages = (msgs: AgentMessage[]) => {
    setMessages(msgs)
    try {
      window.localStorage.setItem(
        AGENT_MESSAGES_KEY,
        JSON.stringify(msgs.slice(-30)) // keep last 30 messages
      )
    } catch {}
  }

  const addAttachment = async (file: File) => {
    const tempId = `att-temp-${crypto.randomUUID()}`
    const previewUrl = URL.createObjectURL(file)
    const tempAttachment: AgentAttachment = {
      id: tempId,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      previewUrl,
      uploading: true,
    }

    setPendingAttachments(prev => [...prev, tempAttachment])

    try {
      const uploaded = await uploadReferenceFile(file)
      setPendingAttachments(prev =>
        prev.map(att => (att.id === tempId ? { ...uploaded, previewUrl } : att))
      )
    } catch (err) {
      setPendingAttachments(prev =>
        prev.map(att =>
          att.id === tempId
            ? { ...att, uploading: false, error: err instanceof Error ? err.message : String(err) }
            : att
        )
      )
    }
  }

  const removeAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(att => att.id !== id))
  }

  const clearChat = () => {
    saveMessages([INITIAL_GREETING])
  }

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsStreaming(false)
  }

  const applyAction = (messageId: string, actionIndex: number) => {
    const msg = messages.find(m => m.id === messageId)
    if (!msg || !msg.actions || !msg.actions[actionIndex]) return

    const actionItem = msg.actions[actionIndex]
    const result = executeAgentAction(actionItem.action, studioControllerRef.current)

    const updatedActions = msg.actions.map((item, idx) =>
      idx === actionIndex
        ? {
            ...item,
            status: result.success ? ('applied' as const) : ('failed' as const),
            error: result.message,
            snapshot: result.snapshot,
          }
        : item
    )

    const nextMessages = messages.map(m =>
      m.id === messageId ? { ...m, actions: updatedActions } : m
    )
    saveMessages(nextMessages)
  }

  const revertAction = (messageId: string, actionIndex: number) => {
    const msg = messages.find(m => m.id === messageId)
    if (!msg || !msg.actions || !msg.actions[actionIndex]) return

    const actionItem = msg.actions[actionIndex]
    if (actionItem.snapshot) {
      revertAgentAction(actionItem.snapshot, studioControllerRef.current)
      const updatedActions = msg.actions.map((item, idx) =>
        idx === actionIndex ? { ...item, status: 'reverted' as const } : item
      )
      const nextMessages = messages.map(m =>
        m.id === messageId ? { ...m, actions: updatedActions } : m
      )
      saveMessages(nextMessages)
    }
  }

  const sendMessage = async (overridePrompt?: string) => {
    const prompt = (overridePrompt || inputText).trim()
    if (!prompt && pendingAttachments.length === 0) return

    const userMessageId = `msg-user-${crypto.randomUUID()}`
    const assistantMessageId = `msg-assistant-${crypto.randomUUID()}`

    const userMsg: AgentMessage = {
      id: userMessageId,
      role: 'user',
      content: prompt,
      attachments: [...pendingAttachments],
      timestamp: Date.now(),
      status: 'done',
    }

    const assistantMsg: AgentMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      thought: '',
      timestamp: Date.now(),
      status: 'streaming',
    }

    const nextConversation = [...messages, userMsg, assistantMsg]
    setMessages(nextConversation)
    setInputText('')
    setPendingAttachments([])
    setIsStreaming(true)
    setError(null)

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    let accumulatedContent = ''
    let accumulatedThought = ''

    const liveStudioContext = buildStudioContextPrompt(studioControllerRef.current)
    const systemPrompt = `${AGENT_SYSTEM_PROMPT}\n\n${liveStudioContext}`

    await streamChatCompletion(
      {
        messages: [...messages, userMsg],
        provider,
        model,
        systemPrompt,
        signal: abortController.signal,
      },
      {
        onText: delta => {
          accumulatedContent += delta
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessageId
                ? { ...m, content: accumulatedContent, status: 'streaming' }
                : m
            )
          )
        },
        onThought: delta => {
          accumulatedThought += delta
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessageId
                ? { ...m, thought: accumulatedThought, status: 'streaming' }
                : m
            )
          )
        },
        onDone: () => {
          setIsStreaming(false)
          abortControllerRef.current = null

          // Parse and extract actions from accumulatedContent
          const parsedActions = extractAgentActions(accumulatedContent)
          const actionItems: AgentActionItem[] = parsedActions.map(act => ({
            id: `act-${crypto.randomUUID()}`,
            action: act,
            status: 'pending' as const,
          }))

          // Auto-apply if enabled
          if (autoApply && actionItems.length > 0) {
            actionItems.forEach(item => {
              const res = executeAgentAction(item.action, studioControllerRef.current)
              item.status = res.success ? 'applied' : 'failed'
              item.error = res.message
              item.snapshot = res.snapshot
            })
          }

          const finalMessages = nextConversation.map(m =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: accumulatedContent,
                  thought: accumulatedThought,
                  actions: actionItems,
                  status: 'done' as const,
                }
              : m
          )
          saveMessages(finalMessages)
        },
        onError: err => {
          setIsStreaming(false)
          abortControllerRef.current = null
          setError(err)
          const finalMessages = nextConversation.map(m =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: accumulatedContent || '*(Failed to generate response)*',
                  thought: accumulatedThought,
                  status: 'error' as const,
                  error: err,
                }
              : m
          )
          saveMessages(finalMessages)
        },
      }
    )
  }

  return {
    isOpen,
    toggleOpen,
    sidebarWidth,
    setSidebarWidth,
    availableModels,
    model,
    setModel,
    provider,
    currentModelInfo,
    autoApply,
    setAutoApply,
    messages,
    inputText,
    setInputText,
    isStreaming,
    pendingAttachments,
    addAttachment,
    removeAttachment,
    error,
    sendMessage,
    stopGeneration,
    clearChat,
    applyAction,
    revertAction,
  }
}

export type AgentController = ReturnType<typeof useAgentController>
