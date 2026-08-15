import type { StudioController } from '../studio/useStudioController'
import type {
  AgentAction,
  CreateAvatarAction,
  UpdateAvatarAction,
  AddBodyNodeAction,
  UpdateBodyNodeAction,
  RemoveBodyNodeAction,
  CreateExpressionAction,
  UpdateExpressionAction,
  CreateAnimationAction,
  PlayAnimationAction,
  ApplyCharacterPresetAction,
  RemixAvatarAction,
  SetPoseAction,
  PlayReactionAction,
  ApplyPresetAction,
  StudioDocumentSnapshot,
} from './types'
import {
  defaultAvatarColors,
  defaultAvatarEyes,
  defaultCreaturePaletteIndex,
  parseExpressions,
  type StudioAvatar,
} from '../avatar/avatars'
import { createAvatarRemix } from '../avatar/avatarRemix'
import { surfacePresets, type SurfaceType } from '../avatar/surfaces'
import { MAX_BODY_NODES, parseAvatarBody, type BodyNode } from '../avatar/body'
import { defaultExpression } from '../avatar/presets'
import type { Expression } from '../avatar/geometry'
import {
  normalizeSequencesForExpressions,
  parseSequences,
  type AvatarSequence,
} from '../animation/sequences'

function normalizeAction(raw: unknown): AgentAction | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Record<string, unknown>
  const actionName = candidate.action || candidate.type
  if (typeof actionName !== 'string') return null
  const normalizedAction = actionName
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
  return { ...candidate, action: normalizedAction } as AgentAction
}

/**
 * Extracts all valid avatar-action JSON blocks from an AI assistant markdown response.
 */
export function extractAgentActions(text: string): AgentAction[] {
  const actions: AgentAction[] = []
  if (!text) return actions

  // Match ```avatar-action ... ``` or ```json:avatar-action ... ``` blocks
  const actionBlockRegex = /```(?:avatar-action|json:avatar-action)\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null

  while ((match = actionBlockRegex.exec(text)) !== null) {
    const rawJson = match[1].trim()
    try {
      const parsed = JSON.parse(rawJson)
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as { actions?: unknown[] }).actions)
          ? (parsed as { actions: unknown[] }).actions
          : [parsed]
      candidates.forEach(item => {
        const action = normalizeAction(item)
        if (action) actions.push(action)
      })
    } catch (e) {
      console.debug('Failed to parse avatar-action block:', rawJson, e)
    }
  }

  return actions
}

/**
 * Captures current studio snapshot for reversible AI execution.
 */
export function captureStudioSnapshot(controller: StudioController): StudioDocumentSnapshot {
  const activeAvatar = controller.activeAvatar ?? {
    id: controller.activeAvatarId,
    name: 'Avatar',
    body: { primary: controller.surface, nodes: controller.bodyNodes },
    colors: controller.renderedColors
      ? { body: controller.renderedColors.body.get(), eyes: controller.renderedColors.eyes.get() }
      : defaultAvatarColors,
    eyes: controller.activeAvatarEyes ?? defaultAvatarEyes,
  }

  return {
    avatarId: controller.activeAvatarId,
    avatar: structuredClone(activeAvatar),
    avatars: structuredClone(controller.avatars),
    expressions: structuredClone(controller.expressions),
    sequences: structuredClone(controller.sequences),
  }
}

/**
 * Executes a single AgentAction on the StudioController.
 */
export function executeAgentAction(
  action: AgentAction,
  controller: StudioController
): { success: boolean; message?: string; snapshot?: StudioDocumentSnapshot } {
  const snapshot = captureStudioSnapshot(controller)

  try {
    switch (action.action) {
      case 'create_avatar': {
        const rawAct = action as CreateAvatarAction & { avatar?: Partial<StudioAvatar> }
        const payload = rawAct.avatar || rawAct
        const newAvatarId = `avatar-${crypto.randomUUID()}`
        const primarySurface = payload.body?.primary
          ? {
              ...surfacePresets[payload.body.primary.type || 'sphere'],
              ...payload.body.primary,
            }
          : surfacePresets.sphere

        const newAvatar: StudioAvatar = {
          id: newAvatarId,
          name: payload.name || 'New Avatar',
          body: parseAvatarBody(
            {
              primary: primarySurface,
              nodes: Array.isArray(payload.body?.nodes) ? payload.body.nodes : [],
            },
            surfacePresets.sphere
          ),
          colors: {
            body: payload.colors?.body || defaultAvatarColors.body,
            eyes: payload.colors?.eyes || defaultAvatarColors.eyes,
          },
          eyes: {
            ...defaultAvatarEyes,
            ...(payload.eyes || {}),
          },
          eyeRenderer: payload.eyeRenderer === 'creature' ? 'creature' : 'classic',
          creaturePaletteIndex:
            typeof payload.creaturePaletteIndex === 'number' &&
            Number.isInteger(payload.creaturePaletteIndex)
              ? Math.min(99, Math.max(0, payload.creaturePaletteIndex))
              : defaultCreaturePaletteIndex,
        }

        const nextAvatars = [...controller.avatars, newAvatar]
        controller.avatarsRef.current = nextAvatars
        controller.setAvatars(nextAvatars)
        controller.updateStudioLibrary({ activeAvatarId: newAvatarId, avatars: nextAvatars })
        controller.activateAvatar(newAvatarId)
        return { success: true, message: `Created avatar "${newAvatar.name}"`, snapshot }
      }

      case 'update_avatar': {
        const updateAct = action as UpdateAvatarAction
        if (updateAct.name) {
          controller.renameActiveAvatar(updateAct.name)
        }
        if (updateAct.colors) {
          controller.updateAvatarColors(updateAct.colors)
        }
        if (updateAct.eyes) {
          controller.updateAvatarEyes({
            ...controller.activeAvatarEyes,
            ...updateAct.eyes,
          })
        }
        if (updateAct.eyeRenderer) {
          controller.updateAvatarEyeRenderer(updateAct.eyeRenderer)
        }
        if (typeof updateAct.creaturePaletteIndex === 'number') {
          controller.updateAvatarCreaturePalette(updateAct.creaturePaletteIndex)
        }
        if (updateAct.body) {
          const parsedBody = parseAvatarBody(
            { ...controller.activeAvatar.body, ...updateAct.body },
            controller.activeAvatar.body.primary
          )
          controller.updateSurface(parsedBody.primary)
          controller.updateBodyNodes(parsedBody.nodes)
        }
        return { success: true, message: 'Updated avatar properties', snapshot }
      }

      case 'add_body_node': {
        const addNodeAct = action as AddBodyNodeAction
        const rawNode = addNodeAct.node
        if (controller.bodyNodes.length >= MAX_BODY_NODES) {
          return {
            success: false,
            message: `Avatar already has the maximum of ${MAX_BODY_NODES} nodes`,
          }
        }
        const requestedType = (rawNode?.surface?.type || 'sphere') as SurfaceType
        const type = surfacePresets[requestedType] ? requestedType : 'sphere'
        const nodeSurface = { ...surfacePresets[type], ...(rawNode?.surface || {}), type }
        const newNode: BodyNode = {
          id: rawNode?.id || `shape-${crypto.randomUUID()}`,
          name: rawNode?.name || `Shape ${controller.bodyNodes.length + 1}`,
          surface: nodeSurface,
          position: rawNode?.position || [0, 0, 0],
          rotation: rawNode?.rotation || [0, 0, 0],
          color: rawNode?.color,
          colorTo: rawNode?.colorTo,
          gradientType: rawNode?.gradientType,
          opacity: rawNode?.opacity,
          material: rawNode?.material,
        }

        const nextNodes = parseAvatarBody(
          { primary: controller.surface, nodes: [...controller.bodyNodes, newNode] },
          controller.surface
        ).nodes
        controller.updateBodyNodes(nextNodes)
        controller.selectBodyNode(newNode.id)
        return { success: true, message: `Added body node "${newNode.name}"`, snapshot }
      }

      case 'update_body_node': {
        const updNodeAct = action as UpdateBodyNodeAction
        const nextNodes = controller.bodyNodes.map(node => {
          if (node.id === updNodeAct.nodeId) {
            return {
              ...node,
              ...updNodeAct.updates,
              surface: updNodeAct.updates.surface
                ? { ...node.surface, ...updNodeAct.updates.surface }
                : node.surface,
            }
          }
          return node
        })
        const parsedNodes = parseAvatarBody(
          { primary: controller.surface, nodes: nextNodes },
          controller.surface
        ).nodes
        controller.updateBodyNodes(parsedNodes)
        return { success: true, message: `Updated node ${updNodeAct.nodeId}`, snapshot }
      }

      case 'remove_body_node': {
        const remNodeAct = action as RemoveBodyNodeAction
        const nextNodes = controller.bodyNodes.filter(node => node.id !== remNodeAct.nodeId)
        controller.updateBodyNodes(nextNodes)
        controller.selectBodyNode('primary')
        return { success: true, message: `Removed node ${remNodeAct.nodeId}`, snapshot }
      }

      case 'create_expression': {
        const createExpAct = action as CreateExpressionAction
        const exp = createExpAct.expression
        const newExpression = parseExpressions([
          {
            ...defaultExpression,
            ...exp,
            id: exp.id || `exp-${crypto.randomUUID()}`,
          },
        ])[0]

        const existingIndex = controller.expressions.findIndex(e => e.id === newExpression.id)
        let nextExpressions: Expression[]
        if (existingIndex >= 0) {
          nextExpressions = controller.expressions.map((e, idx) =>
            idx === existingIndex ? newExpression : e
          )
        } else {
          nextExpressions = [...controller.expressions, newExpression]
        }

        controller.setExpressions(nextExpressions)
        controller.updateStudioExpressions(nextExpressions)
        controller.transitionToExpression(newExpression)
        return { success: true, message: `Created expression "${newExpression.id}"`, snapshot }
      }

      case 'update_expression': {
        const updExpAct = action as UpdateExpressionAction
        const nextExpressions = controller.expressions.map(e =>
          e.id === updExpAct.expressionId
            ? parseExpressions([{ ...e, ...updExpAct.updates, id: e.id }])[0]
            : e
        )
        controller.setExpressions(nextExpressions)
        controller.updateStudioExpressions(nextExpressions)
        const updated = nextExpressions.find(e => e.id === updExpAct.expressionId)
        if (updated) controller.transitionToExpression(updated)
        return { success: true, message: `Updated expression ${updExpAct.expressionId}`, snapshot }
      }

      case 'create_animation': {
        const createSeqAct = action as CreateAnimationAction
        const seq = createSeqAct.sequence
        const newSequence: AvatarSequence = {
          id: seq.id || `seq-${crypto.randomUUID()}`,
          name: seq.name || 'Custom Animation',
          group: seq.group || 'AI Generated',
          description: seq.description || '',
          builtIn: false,
          playbackMode: seq.playbackMode || 'loop',
          steps: Array.isArray(seq.steps) ? seq.steps : [],
          blink: {
            enabled: seq.blink?.enabled !== false,
            durationMs: seq.blink?.durationMs || 140,
            initialDelayMs: seq.blink?.initialDelayMs || 400,
            minIntervalMs: seq.blink?.minIntervalMs || 2200,
            maxIntervalMs: seq.blink?.maxIntervalMs || 5000,
          },
        }

        const parsedSequence = normalizeSequencesForExpressions(
          parseSequences([newSequence]),
          controller.expressions
        )[0]
        const existingIndex = controller.sequences.findIndex(s => s.id === parsedSequence.id)
        let nextSequences: AvatarSequence[]
        if (existingIndex >= 0) {
          nextSequences = controller.sequences.map((s, idx) =>
            idx === existingIndex ? parsedSequence : s
          )
        } else {
          nextSequences = [...controller.sequences, parsedSequence]
        }

        controller.setSequences(nextSequences)
        controller.updateStudioSequences(nextSequences)
        return { success: true, message: `Created animation "${parsedSequence.name}"`, snapshot }
      }

      case 'play_animation': {
        const playAct = action as PlayAnimationAction
        const seq = controller.sequences.find(s => s.id === playAct.sequenceId)
        if (seq) {
          controller.launchSequence(seq)
          return { success: true, message: `Playing animation "${seq.name}"`, snapshot }
        }
        return { success: false, message: `Animation ${playAct.sequenceId} not found` }
      }

      case 'apply_character_preset': {
        const presetAct = action as ApplyCharacterPresetAction
        const query = presetAct.presetName.trim().toLowerCase()
        const preset = controller.avatars.find(
          avatar => avatar.id.toLowerCase() === query || avatar.name.toLowerCase() === query
        )
        if (!preset)
          return { success: false, message: `Character preset "${presetAct.presetName}" not found` }
        const duplicate: StudioAvatar = {
          ...structuredClone(preset),
          id: `avatar-${crypto.randomUUID()}`,
          name: presetAct.newName?.trim() || `${preset.name} Variant`,
        }
        const nextAvatars = [...controller.avatars, duplicate]
        controller.avatarsRef.current = nextAvatars
        controller.setAvatars(nextAvatars)
        controller.updateStudioLibrary({ activeAvatarId: duplicate.id, avatars: nextAvatars })
        controller.activateAvatar(duplicate.id, false, true)
        return { success: true, message: `Created character from "${preset.name}"`, snapshot }
      }

      case 'remix_avatar': {
        const remixAct = action as RemixAvatarAction
        if (!controller.activeAvatar)
          return { success: false, message: 'No active avatar to remix' }
        const remix = createAvatarRemix(controller.activeAvatar, remixAct.intensity ?? 0.55)
        const nextAvatars = [...controller.avatars, remix]
        controller.avatarsRef.current = nextAvatars
        controller.setAvatars(nextAvatars)
        controller.updateStudioLibrary({ activeAvatarId: remix.id, avatars: nextAvatars })
        controller.activateAvatar(remix.id, false, true)
        return { success: true, message: `Created remix "${remix.name}"`, snapshot }
      }

      case 'set_pose': {
        const poseAct = action as SetPoseAction
        const next = parseExpressions([
          { ...controller.expression, ...poseAct.pose, id: controller.expression.id },
        ])[0]
        controller.updateImmediate(next)
        return { success: true, message: 'Updated live pose', snapshot }
      }

      case 'play_reaction': {
        const reactionAct = action as PlayReactionAction
        const query = reactionAct.reaction.trim().toLowerCase()
        const seq = controller.sequences.find(
          sequence => sequence.id.toLowerCase() === query || sequence.name.toLowerCase() === query
        )
        if (!seq) return { success: false, message: `Reaction "${reactionAct.reaction}" not found` }
        controller.launchSequence(seq)
        return { success: true, message: `Playing reaction "${seq.name}"`, snapshot }
      }

      case 'apply_preset': {
        const presetAct = action as ApplyPresetAction
        const presetType = presetAct.presetName as SurfaceType
        if (surfacePresets[presetType]) {
          controller.updateSurface(surfacePresets[presetType])
          return {
            success: true,
            message: `Applied shape preset "${presetAct.presetName}"`,
            snapshot,
          }
        }
        const avatarPreset = controller.avatars.find(
          avatar => avatar.name.toLowerCase() === presetAct.presetName.toLowerCase()
        )
        if (avatarPreset) {
          controller.activateAvatar(avatarPreset.id, false, true)
          return {
            success: true,
            message: `Applied character preset "${avatarPreset.name}"`,
            snapshot,
          }
        }
        return { success: false, message: `Unknown preset "${presetAct.presetName}"` }
      }

      default:
        return {
          success: false,
          message: `Unknown action "${(action as Record<string, unknown>).action}"`,
        }
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
      snapshot,
    }
  }
}

/**
 * Reverts an action execution back to its snapshot state.
 */
export function revertAgentAction(
  snapshot: StudioDocumentSnapshot,
  controller: StudioController
): boolean {
  try {
    const nextAvatars = structuredClone(
      snapshot.avatars?.length ? snapshot.avatars : [snapshot.avatar]
    )
    controller.avatarsRef.current = nextAvatars
    controller.setAvatars(nextAvatars)
    controller.updateStudioLibrary({ activeAvatarId: snapshot.avatarId, avatars: nextAvatars })
    controller.activateAvatar(snapshot.avatarId)

    controller.setExpressions(snapshot.expressions)
    controller.updateStudioExpressions(snapshot.expressions)

    controller.setSequences(snapshot.sequences)
    controller.updateStudioSequences(snapshot.sequences)
    return true
  } catch (e) {
    console.error('Failed to revert action snapshot:', e)
    return false
  }
}
