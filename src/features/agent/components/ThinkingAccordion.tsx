import { useState } from 'react'
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'

export function ThinkingAccordion({
  thought,
  isStreaming,
}: {
  thought: string
  isStreaming?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)

  if (!thought) return null

  return (
    <div className="agent-thinking-wrapper">
      <button
        type="button"
        className="agent-thinking-trigger"
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
      >
        <span className="agent-thinking-icon">
          <Sparkles className={isStreaming ? 'animate-spin' : ''} size={13} />
        </span>
        <span className="agent-thinking-label">
          {isStreaming ? 'Thinking & Reasoning...' : 'Reasoning Process'}
        </span>
        <span className="agent-thinking-chevron">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {isOpen && (
        <div className="agent-thinking-content">
          <pre>{thought}</pre>
        </div>
      )}
    </div>
  )
}
