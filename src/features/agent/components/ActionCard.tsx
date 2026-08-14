import { Check, Play, RotateCcw, Sparkles, AlertCircle, Wand2, Eye, Box, Film } from 'lucide-react'
import type { AgentActionItem } from '../types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function ActionCard({
  item,
  onApply,
  onRevert,
}: {
  item: AgentActionItem
  onApply: () => void
  onRevert: () => void
}) {
  const { action, status, error } = item

  const getActionIcon = () => {
    switch (action.action) {
      case 'create_avatar':
        return <Wand2 size={14} className="text-violet-400" />
      case 'update_avatar':
        return <Sparkles size={14} className="text-indigo-400" />
      case 'add_body_node':
      case 'update_body_node':
      case 'remove_body_node':
        return <Box size={14} className="text-blue-400" />
      case 'create_expression':
      case 'update_expression':
        return <Eye size={14} className="text-amber-400" />
      case 'create_animation':
      case 'play_animation':
        return <Film size={14} className="text-emerald-400" />
      default:
        return <Sparkles size={14} className="text-blue-400" />
    }
  }

  const getActionTitle = () => {
    switch (action.action) {
      case 'create_avatar':
        return `Create Avatar: ${action.name}`
      case 'update_avatar':
        return action.name ? `Update Avatar: ${action.name}` : 'Update Avatar'
      case 'add_body_node':
        return `Add Shape: ${action.node.name}`
      case 'update_body_node':
        return `Update Shape: ${action.nodeId}`
      case 'remove_body_node':
        return `Remove Shape: ${action.nodeId}`
      case 'create_expression':
        return `Expression: ${action.expression.id}`
      case 'update_expression':
        return `Update Expression: ${action.expressionId}`
      case 'create_animation':
        return `Animation: ${action.sequence.name}`
      case 'play_animation':
        return `Play Animation: ${action.sequenceId}`
      case 'apply_preset':
        return `Shape Preset: ${action.presetName}`
      case 'import_studio_document':
        return 'Import Studio Project'
      default:
        return 'Avatar Action'
    }
  }

  const getDetailsSummary = () => {
    switch (action.action) {
      case 'create_avatar':
        return (
          <div className="agent-action-details">
            <span className="agent-action-chip">Primary: {action.body.primary.type}</span>
            <span className="agent-action-chip">Nodes: {action.body.nodes?.length || 0}</span>
            <span
              className="agent-action-color-chip"
              style={{ backgroundColor: action.colors.body }}
            />
            <span
              className="agent-action-color-chip"
              style={{ backgroundColor: action.colors.eyes }}
            />
          </div>
        )
      case 'add_body_node':
        return (
          <div className="agent-action-details">
            <span className="agent-action-chip">{action.node.surface.type}</span>
            <span className="agent-action-chip">Pos: [{action.node.position.join(', ')}]</span>
          </div>
        )
      case 'create_expression':
        return (
          <div className="agent-action-details">
            <span className="agent-action-chip">
              Eyes: {action.expression.widthLeft}x{action.expression.heightLeft}
            </span>
            <span className="agent-action-chip">
              Tilt: {action.expression.leftAngle}° / {action.expression.rightAngle}°
            </span>
          </div>
        )
      case 'create_animation':
        return (
          <div className="agent-action-details">
            <span className="agent-action-chip">{action.sequence.steps?.length || 0} steps</span>
            <span className="agent-action-chip">
              Blink: {action.sequence.blink?.enabled ? 'ON' : 'OFF'}
            </span>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className={`agent-action-card agent-action-${status}`}>
      <div className="agent-action-header">
        <div className="agent-action-title-group">
          {getActionIcon()}
          <span className="agent-action-title">{getActionTitle()}</span>
        </div>
        <Badge
          variant={status === 'applied' ? 'default' : status === 'failed' ? 'outline' : 'secondary'}
          className={`agent-action-badge ${status === 'failed' ? 'border-red-500/50 text-red-400' : ''}`}
        >
          {status === 'applied' && <Check size={11} className="mr-1 inline" />}
          {status === 'failed' && <AlertCircle size={11} className="mr-1 inline" />}
          {status}
        </Badge>
      </div>

      {getDetailsSummary()}

      {error && <div className="agent-action-error">{error}</div>}

      <div className="agent-action-controls">
        {status !== 'applied' ? (
          <Button
            size="sm"
            variant="default"
            className="agent-action-btn agent-action-btn-apply"
            onClick={onApply}
          >
            <Play size={12} className="mr-1" /> Apply
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="agent-action-btn agent-action-btn-revert"
            onClick={onRevert}
          >
            <RotateCcw size={12} className="mr-1" /> Revert
          </Button>
        )}
      </div>
    </div>
  )
}
