import type { AvatarBody, BodyNode } from '../avatar/body'
import type { AvatarColors, AvatarEyeDefaults, StudioAvatar } from '../avatar/avatars'
import type { Expression } from '../avatar/geometry'
import type { AvatarSequence } from '../animation/sequences'
import type { StudioDocument } from '../studio/studioDocument'

export type AgentProvider = 'qwen' | 'poolside' | 'k2think'

export type AgentModelCapabilities = {
  chat?: boolean
  stream?: boolean
  vision?: boolean
  thinking?: boolean
  search?: boolean
  document?: boolean
  tools?: boolean
}

export type AgentModel = {
  id: string
  name: string
  provider: AgentProvider
  capabilities: AgentModelCapabilities
  max_context_length?: number
  is_active?: boolean
}

export type AgentAttachment = {
  id: string
  name: string
  mimeType: string
  size: number
  previewUrl?: string
  dataUrl?: string
  fileObj?: Record<string, unknown>
  uploading?: boolean
  error?: string
}

// Structured Agent Actions
export type CreateAvatarAction = {
  action: 'create_avatar'
  name: string
  body: AvatarBody
  colors: AvatarColors
  eyes?: AvatarEyeDefaults
  eyeRenderer?: StudioAvatar['eyeRenderer']
  creaturePaletteIndex?: number
}

export type UpdateAvatarAction = {
  action: 'update_avatar'
  name?: string
  body?: Partial<AvatarBody>
  colors?: Partial<AvatarColors>
  eyes?: Partial<AvatarEyeDefaults>
  eyeRenderer?: StudioAvatar['eyeRenderer']
  creaturePaletteIndex?: number
}

export type AddBodyNodeAction = {
  action: 'add_body_node'
  node: BodyNode
}

export type UpdateBodyNodeAction = {
  action: 'update_body_node'
  nodeId: string
  updates: Partial<BodyNode>
}

export type RemoveBodyNodeAction = {
  action: 'remove_body_node'
  nodeId: string
}

export type CreateExpressionAction = {
  action: 'create_expression'
  expression: Partial<Expression> & { id: string }
}

export type UpdateExpressionAction = {
  action: 'update_expression'
  expressionId: string
  updates: Partial<Expression>
}

export type CreateAnimationAction = {
  action: 'create_animation'
  sequence: Partial<AvatarSequence> & { id: string; name: string }
}

export type PlayAnimationAction = {
  action: 'play_animation'
  sequenceId: string
}

export type ApplyCharacterPresetAction = {
  action: 'apply_character_preset'
  presetName: string
  newName?: string
}

export type RemixAvatarAction = {
  action: 'remix_avatar'
  intensity?: number
}

export type SetPoseAction = {
  action: 'set_pose'
  pose: Partial<Expression>
}

export type PlayReactionAction = {
  action: 'play_reaction'
  reaction: string
}

export type ApplyPresetAction = {
  action: 'apply_preset'
  presetName: string
}

export type ImportStudioDocumentAction = {
  action: 'import_studio_document'
  document: StudioDocument
}

export type AgentAction =
  | CreateAvatarAction
  | UpdateAvatarAction
  | AddBodyNodeAction
  | UpdateBodyNodeAction
  | RemoveBodyNodeAction
  | CreateExpressionAction
  | UpdateExpressionAction
  | CreateAnimationAction
  | PlayAnimationAction
  | ApplyCharacterPresetAction
  | RemixAvatarAction
  | SetPoseAction
  | PlayReactionAction
  | ApplyPresetAction
  | ImportStudioDocumentAction

export type ActionExecutionStatus = 'pending' | 'applied' | 'reverted' | 'failed'

export type AgentActionItem = {
  id: string
  action: AgentAction
  status: ActionExecutionStatus
  error?: string
  snapshot?: StudioDocumentSnapshot
}

export type StudioDocumentSnapshot = {
  avatarId: string
  avatar: StudioAvatar
  avatars: StudioAvatar[]
  expressions: Expression[]
  sequences: AvatarSequence[]
}

export type AgentMessageRole = 'user' | 'assistant' | 'system'

export type AgentMessage = {
  id: string
  role: AgentMessageRole
  content: string
  thought?: string
  attachments?: AgentAttachment[]
  actions?: AgentActionItem[]
  timestamp: number
  status: 'idle' | 'streaming' | 'done' | 'error'
  error?: string
}

export type AgentControllerState = {
  isOpen: boolean
  sidebarWidth: number
  provider: AgentProvider
  model: string
  availableModels: AgentModel[]
  messages: AgentMessage[]
  isStreaming: boolean
  autoApply: boolean
  pendingAttachments: AgentAttachment[]
  error: string | null
}
