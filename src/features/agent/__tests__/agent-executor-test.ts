import { describe, expect, it } from 'vitest'
import { extractAgentActions, executeAgentAction, revertAgentAction } from '../agentActionExecutor'
import {
  defaultAvatarColors,
  defaultAvatarEyes,
  type StudioAvatar,
} from '@/features/avatar/avatars'
import { surfacePresets } from '@/features/avatar/surfaces'
import { initialExpressions } from '@/features/avatar/presets'
import { createInitialSequences } from '@/features/animation/sequences'
import type { StudioController } from '@/features/studio/useStudioController'

describe('agent action parser', () => {
  it('extracts avatar-action code blocks from markdown assistant responses', () => {
    const markdown = `
Here is a customized cyberpunk avatar:

\`\`\`avatar-action
{
  "action": "create_avatar",
  "name": "Neon Droid",
  "body": {
    "primary": { "type": "cube", "width": 140, "height": 140, "depth": 140, "roundness": 0.4 },
    "nodes": []
  },
  "colors": { "body": "#00f0ff", "eyes": "#ff0077" }
}
\`\`\`

And here is an expression for it:

\`\`\`avatar-action
{
  "action": "create_expression",
  "expression": {
    "id": "neon-wink",
    "widthLeft": 28,
    "widthRight": 28,
    "heightLeft": 10,
    "heightRight": 32,
    "spacing": 36,
    "positionXLeft": 0,
    "positionXRight": 0,
    "positionYLeft": 0,
    "positionYRight": 0,
    "leftAngle": 0,
    "rightAngle": 0
  }
}
\`\`\`
`
    const actions = extractAgentActions(markdown)
    expect(actions).toHaveLength(2)
    expect(actions[0].action).toBe('create_avatar')
    expect(actions[1].action).toBe('create_expression')
  })

  it('extracts batched actions from an actions envelope', () => {
    const actions = extractAgentActions(`
\`\`\`avatar-action
{"actions":[{"action":"set_pose","pose":{"mouth":"smirk"}},{"action":"play_reaction","reaction":"success"}]}
\`\`\``)

    expect(actions.map(action => action.action)).toEqual(['set_pose', 'play_reaction'])
  })

  it('handles empty or malformed text gracefully', () => {
    expect(extractAgentActions('')).toEqual([])
    expect(extractAgentActions('No code block here')).toEqual([])
    expect(extractAgentActions('```avatar-action\n{ bad json }\n```')).toEqual([])
  })
})

describe('agent action execution and reversion', () => {
  const createMockController = (): Partial<StudioController> => {
    const avatar: StudioAvatar = {
      id: 'avatar-1',
      name: 'Initial Avatar',
      body: { primary: surfacePresets.sphere, nodes: [] },
      colors: { ...defaultAvatarColors },
      eyes: { ...defaultAvatarEyes },
      eyeRenderer: 'classic',
      creaturePaletteIndex: 52,
    }
    const avatars = [avatar]
    const avatarsRef = { current: avatars }
    const expressions = [...initialExpressions]
    const sequences = createInitialSequences()

    return {
      activeAvatarId: 'avatar-1',
      activeAvatar: avatar,
      activeAvatarEyes: { ...defaultAvatarEyes },
      avatars,
      avatarsRef,
      surface: surfacePresets.sphere,
      bodyNodes: [],
      expressions,
      sequences,
      setAvatars: ((next: StudioAvatar[] | ((prev: StudioAvatar[]) => StudioAvatar[])) => {
        avatarsRef.current = typeof next === 'function' ? next(avatarsRef.current) : next
      }) as unknown as StudioController['setAvatars'],
      updateStudioLibrary: () =>
        ({}) as unknown as ReturnType<StudioController['updateStudioLibrary']>,
      activateAvatar: () => {},
      renameActiveAvatar: (name: string) => {
        avatar.name = name
      },
      updateAvatarColors: (changes: Partial<typeof defaultAvatarColors>) => {
        Object.assign(avatar.colors, changes)
      },
      updateAvatarEyes: (changes: Partial<typeof defaultAvatarEyes>) => {
        Object.assign(avatar.eyes, changes)
      },
      updateSurface: () => {},
      updateBodyNodes: () => {},
      selectBodyNode: () => {},
      setExpressions: ((
        next:
          | typeof initialExpressions
          | ((prev: typeof initialExpressions) => typeof initialExpressions)
      ) => {
        const resolved = typeof next === 'function' ? next(expressions) : next
        expressions.length = 0
        expressions.push(...resolved)
      }) as unknown as StudioController['setExpressions'],
      updateStudioExpressions: () => {},
      transitionToExpression: () => {},
      setSequences: ((next: typeof sequences | ((prev: typeof sequences) => typeof sequences)) => {
        const resolved = typeof next === 'function' ? next(sequences) : next
        sequences.length = 0
        sequences.push(...resolved)
      }) as unknown as StudioController['setSequences'],
      updateStudioSequences: () => {},
    }
  }

  it('creates an avatar and provides a revert snapshot', () => {
    const controller = createMockController() as StudioController
    const res = executeAgentAction(
      {
        action: 'create_avatar',
        name: 'Cyber Fox',
        body: { primary: surfacePresets.diamond, nodes: [] },
        colors: { body: '#ff6b4a', eyes: '#0f172a' },
      },
      controller
    )

    expect(res.success).toBe(true)
    expect(controller.avatarsRef.current).toHaveLength(2)
    expect(controller.avatarsRef.current[1].name).toBe('Cyber Fox')

    // Revert
    if (res.snapshot) {
      const reverted = revertAgentAction(res.snapshot, controller)
      expect(reverted).toBe(true)
      expect(controller.avatarsRef.current).toHaveLength(1)
      expect(controller.avatarsRef.current[0].name).toBe('Initial Avatar')
    }
  })

  it('creates an expression preset and supports reversion', () => {
    const controller = createMockController() as StudioController
    const initialCount = controller.expressions.length

    const res = executeAgentAction(
      {
        action: 'create_expression',
        expression: {
          ...initialExpressions[0],
          id: 'custom-wink',
          heightLeft: 8,
          heightRight: 34,
        },
      },
      controller
    )

    expect(res.success).toBe(true)
    expect(controller.expressions).toHaveLength(initialCount + 1)
    expect(controller.expressions[controller.expressions.length - 1].id).toBe('custom-wink')

    if (res.snapshot) {
      revertAgentAction(res.snapshot, controller)
      expect(controller.expressions).toHaveLength(initialCount)
    }
  })
})
