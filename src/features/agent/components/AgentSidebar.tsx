import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  BrainCircuit,
  Eye,
  Globe,
  Image as ImageIcon,
  Loader2,
  PanelRightClose,
  Paperclip,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { AgentController } from '../useAgentController'
import { ThinkingAccordion } from './ThinkingAccordion'
import { ActionCard } from './ActionCard'
import type { StudioController } from '@/features/studio/useStudioController'

const INSPIRATION_CHIPS = [
  {
    label: '🦊 Cybernetic Fox',
    prompt:
      'Create a stylish cybernetic fox avatar with glowing eyes, pointed ears, and a sleek head shape.',
  },
  {
    label: '🌸 Kawaii Cat',
    prompt:
      'Create a super cute pastel kawaii cat avatar with round ears, pink cheeks, and cheerful eyes.',
  },
  {
    label: '🤖 Retro Droid',
    prompt:
      'Create a retro sci-fi robot avatar with antennas, angular boxy head, and expressive robotic eyes.',
  },
  {
    label: '✨ 5 Expressive Faces',
    prompt:
      'Generate 5 distinct facial expressions for this avatar: joyful wink, surprised, sleepy, anime crying, and suspicious squint.',
  },
  {
    label: '🎬 Dynamic Talk Cycle',
    prompt: 'Create a smooth talking and laughing animation sequence with natural blinking.',
  },
]

export function AgentSidebar({
  agent,
  studioController,
}: {
  agent: AgentController
  studioController: StudioController
}) {
  const {
    isOpen,
    toggleOpen,
    sidebarWidth,
    setSidebarWidth,
    availableModels,
    model,
    setModel,
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
    sendMessage,
    stopGeneration,
    clearChat,
    applyAction,
    revertAction,
  } = agent

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  // Drag resizing handler
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = sidebarWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX
      setSidebarWidth(startWidth + deltaX)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // File upload trigger
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      Array.from(files).forEach(file => addAttachment(file))
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(file => addAttachment(file))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isStreaming) sendMessage()
    }
  }

  if (!isOpen) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                className="agent-dock-collapsed-btn"
                variant="default"
                size="icon"
                onClick={() => toggleOpen(true)}
                aria-label={studioController.t('Ouvrir l’agent IA')}
              >
                <Sparkles className="animate-pulse text-amber-300" size={18} />
              </Button>
            }
          />
          <TooltipContent side="left">
            <p>{studioController.t('Ouvrir l’agent IA (Nebians Qwen / Laguna / K2Think)')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const qwenModels = availableModels.filter(m => m.provider === 'qwen')
  const poolsideModels = availableModels.filter(m => m.provider === 'poolside')
  const k2thinkModels = availableModels.filter(m => m.provider === 'k2think')

  return (
    <aside
      className={`agent-sidebar-container ${isResizing ? 'resizing' : ''}`}
      style={{ width: `${sidebarWidth}px` }}
      onDragOver={e => {
        e.preventDefault()
        setIsDraggingOver(true)
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      {/* Resizing Handle on left edge */}
      <div
        className="agent-sidebar-resize-handle"
        onMouseDown={handleMouseDownResize}
        title={studioController.t('Glisser pour redimensionner')}
      />

      {/* Header */}
      <header className="agent-sidebar-header">
        <div className="agent-header-top">
          <div className="agent-brand">
            <span className="agent-avatar-icon">
              <Bot size={18} className="text-violet-400" />
            </span>
            <div className="agent-title-group">
              <h2 className="agent-title">Avatar Lab Agent</h2>
              <span className="agent-subtitle">Nebians Proxy AI</span>
            </div>
          </div>

          <div className="agent-header-actions">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="agent-header-btn"
                      onClick={clearChat}
                      aria-label={studioController.t('Effacer la conversation')}
                    >
                      <Trash2 size={15} />
                    </Button>
                  }
                />
                <TooltipContent side="bottom">
                  <p>{studioController.t('Effacer la conversation')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="agent-header-btn"
                      onClick={() => toggleOpen(false)}
                      aria-label={studioController.t('Réduire l’agent IA')}
                    >
                      <PanelRightClose size={16} />
                    </Button>
                  }
                />
                <TooltipContent side="bottom">
                  <p>{studioController.t('Réduire l’agent IA')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Model Selector Bar */}
        <div className="agent-model-toolbar">
          <Select
            value={model}
            onValueChange={(val: string | null) => {
              if (val) setModel(val)
            }}
          >
            <SelectTrigger className="agent-model-select-trigger">
              <SelectValue placeholder="Select LLM Model" />
            </SelectTrigger>
            <SelectContent className="agent-model-select-content">
              {qwenModels.length > 0 && (
                <div>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                    Qwen (Vision & Multimodal)
                  </div>
                  {qwenModels.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </div>
              )}
              {poolsideModels.length > 0 && (
                <div>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                    Poolside Laguna 2.1
                  </div>
                  {poolsideModels.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </div>
              )}
              {k2thinkModels.length > 0 && (
                <div>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                    MBZUAI K2 Think
                  </div>
                  {k2thinkModels.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </div>
              )}
            </SelectContent>
          </Select>

          {/* Badges & Auto-Apply */}
          <div className="agent-capabilities-strip">
            <div className="agent-caps-badges">
              {currentModelInfo.capabilities.vision && (
                <span className="agent-cap-tag" title="Supports Image & Vision Reference Uploads">
                  <Eye size={12} className="mr-1 inline text-blue-400" /> Vision
                </span>
              )}
              {currentModelInfo.capabilities.thinking && (
                <span className="agent-cap-tag" title="Deep Reasoning & Thinking Traces">
                  <BrainCircuit size={12} className="mr-1 inline text-purple-400" /> Reasoning
                </span>
              )}
              {currentModelInfo.capabilities.search && (
                <span className="agent-cap-tag" title="Live Web Search Enabled">
                  <Globe size={12} className="mr-1 inline text-emerald-400" /> Web
                </span>
              )}
            </div>

            <label className="agent-auto-apply-label">
              <span>Auto-apply</span>
              <Switch checked={autoApply} onCheckedChange={setAutoApply} />
            </label>
          </div>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className={`agent-messages-scroll ${isDraggingOver ? 'drag-over' : ''}`}>
        {isDraggingOver && (
          <div className="agent-drag-overlay">
            <ImageIcon size={36} className="text-violet-400 animate-bounce" />
            <p>Drop reference image for AI analysis</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`agent-message-bubble-wrapper agent-msg-${msg.role}`}>
            <div className="agent-message-bubble">
              {/* Message Attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="agent-message-attachments">
                  {msg.attachments.map(att => (
                    <div key={att.id} className="agent-attachment-preview-card">
                      {att.previewUrl ? (
                        <img src={att.previewUrl} alt={att.name} className="agent-attachment-img" />
                      ) : (
                        <Paperclip size={14} />
                      )}
                      <span className="agent-attachment-name">{att.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Live / Finished Reasoning Trace */}
              {msg.thought && (
                <ThinkingAccordion thought={msg.thought} isStreaming={msg.status === 'streaming'} />
              )}

              {/* Message Markdown / Content */}
              {msg.content && (
                <div className="agent-message-text">
                  {msg.content.split('\n\n').map((para, pIdx) => {
                    if (para.startsWith('```avatar-action')) return null
                    return <p key={pIdx}>{para}</p>
                  })}
                </div>
              )}

              {/* Action Cards */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="agent-actions-list">
                  {msg.actions.map((actItem, actIdx) => (
                    <ActionCard
                      key={actItem.id || actIdx}
                      item={actItem}
                      onApply={() => applyAction(msg.id, actIdx)}
                      onRevert={() => revertAction(msg.id, actIdx)}
                    />
                  ))}
                </div>
              )}

              {/* Error banner */}
              {msg.error && (
                <div className="agent-msg-error-alert">
                  <p>{msg.error}</p>
                </div>
              )}

              {msg.status === 'streaming' && !msg.content && !msg.thought && (
                <div className="agent-loading-dots">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      {messages.length <= 2 && (
        <div className="agent-inspiration-chips">
          {INSPIRATION_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              className="agent-chip-btn"
              onClick={() => sendMessage(chip.prompt)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <footer className="agent-input-container">
        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="agent-pending-attachments">
            {pendingAttachments.map(att => (
              <div key={att.id} className="agent-pending-chip">
                {att.previewUrl && (
                  <img src={att.previewUrl} alt={att.name} className="agent-pending-thumb" />
                )}
                <span className="agent-pending-filename">{att.name}</span>
                {att.uploading ? (
                  <Loader2 size={12} className="animate-spin text-violet-400" />
                ) : (
                  <button
                    type="button"
                    className="agent-pending-remove-btn"
                    onClick={() => removeAttachment(att.id)}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="agent-input-row">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"
            className="hidden"
            id="agent-file-upload-input"
          />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="agent-input-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach reference image or document"
                  >
                    <Paperclip size={18} />
                  </Button>
                }
              />
              <TooltipContent side="top">
                <p>Attach image for Vision / Reference</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <textarea
            ref={textareaRef}
            className="agent-textarea"
            placeholder={studioController.t(
              'Demandez à l’agent de créer un avatar, des expressions...'
            )}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />

          {isStreaming ? (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="agent-send-btn"
              onClick={stopGeneration}
              aria-label="Stop generation"
            >
              <Square size={16} />
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="icon"
              className="agent-send-btn"
              disabled={!inputText.trim() && pendingAttachments.length === 0}
              onClick={() => sendMessage()}
              aria-label="Send message"
            >
              <Send size={16} />
            </Button>
          )}
        </div>
      </footer>
    </aside>
  )
}
