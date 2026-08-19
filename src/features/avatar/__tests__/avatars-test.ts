import { defaultExpression } from '@/features/avatar/presets'
import { createInitialSequences } from '@/features/animation/sequences'
import {
  applyAvatarEyeDefaults,
  cloneAvatarBehavior,
  createAvatar,
  createUnkeyedExpressionCopy,
  defaultAvatarEyes,
  parseAvatarEyeDefaults,
  parseAvatarLibrary,
  parseAvatarRenderStyle,
  resolveAvatarBehavior,
  parseExpressions,
} from '@/features/avatar/avatars'
import { initialExpressions } from '@/features/avatar/presets'

describe('avatar eye defaults', () => {
  it('clears the public semantic key when creating custom content from a preset', () => {
    const source = { ...defaultExpression, semanticKey: 'attentive-left' }

    const copy = createUnkeyedExpressionCopy(source, 'expression-copy')

    expect(copy.id).toBe('expression-copy')
    expect(copy.semanticKey).toBeUndefined()
    expect(source.semanticKey).toBe('attentive-left')
  })

  it('keeps the historical rendering when using default values', () => {
    expect(applyAvatarEyeDefaults(defaultExpression, defaultAvatarEyes)).toEqual(defaultExpression)
  })

  it('composes avatar defaults as variations around the neutral expression', () => {
    const expression = { ...defaultExpression, widthLeft: 28, positionYLeft: 5 }
    const eyes = { ...defaultAvatarEyes, widthLeft: 30, positionYLeft: -12 }

    const result = applyAvatarEyeDefaults(expression, eyes)

    expect(result.widthLeft).toBe(38)
    expect(result.positionYLeft).toBe(0)
    expect(expression.widthLeft).toBe(28)
  })

  it('keeps classic eyes by default while storing Creature renderer choices per avatar', () => {
    const avatar = createAvatar('Eyes')

    expect(avatar.eyeRenderer).toBe('classic')
    expect(avatar.creaturePaletteIndex).toBe(52)
  })

  it('migrates a legacy Creature colorway selection to the expressive renderer', () => {
    const avatar = createAvatar('Legacy Lobster')
    const legacy = {
      ...avatar,
      colors: { ...avatar.colors, eyes: '#F95320', pupil: '#044A5F' },
    } as Partial<typeof avatar> & { id: string; name: string }
    delete legacy.eyeRenderer
    delete legacy.creaturePaletteIndex

    const library = parseAvatarLibrary(
      { activeAvatarId: avatar.id, avatars: [legacy] },
      { activeAvatarId: avatar.id, avatars: [avatar] },
      { expressions: initialExpressions, sequences: createInitialSequences() }
    )

    expect(library.avatars[0].eyeRenderer).toBe('creature')
    expect(library.avatars[0].creaturePaletteIndex).toBe(4)
  })

  it('preserves procedural mouth and expanded motion values when parsing expressions', () => {
    const parsed = parseExpressions([
      {
        ...defaultExpression,
        id: 'agent-reaction',
        mouth: 'smirk',
        mouthScale: 1.35,
        eyeMotion: 'lookAround',
        bodyMotion: 'breathe',
      },
    ])

    expect(parsed[0].mouth).toBe('smirk')
    expect(parsed[0].mouthScale).toBe(1.35)
    expect(parsed[0].eyeMotion).toBe('lookAround')
    expect(parsed[0].bodyMotion).toBe('breathe')
  })

  it('sanitizes partial persisted values and supports eyeStyle', () => {
    const result = parseAvatarEyeDefaults({
      widthLeft: 42,
      heightRight: Number.NaN,
      eyeStyle: 'cat',
    })

    expect(result.widthLeft).toBe(42)
    expect(result.heightRight).toBe(defaultAvatarEyes.heightRight)
    expect(result.spacing).toBe(defaultAvatarEyes.spacing)
    expect(result.eyeStyle).toBe('cat')
  })
})

describe('avatar render style', () => {
  it('keeps vector rendering as the compatible default', () => {
    expect(parseAvatarRenderStyle(undefined)).toEqual({ type: 'vector' })
  })

  it('falls back to vector rendering while pixel mode is disabled', () => {
    expect(
      parseAvatarRenderStyle({
        type: 'pixel',
        resolution: 500,
      })
    ).toEqual({ type: 'vector' })
    expect(parseAvatarRenderStyle({ type: 'pixel', resolution: 1 })).toEqual({ type: 'vector' })
  })
})

describe('avatar behavior library', () => {
  const base = {
    expressions: initialExpressions,
    sequences: createInitialSequences(),
  }

  it('inherits the base library until the avatar owns a customization', () => {
    const avatar = createAvatar('Strobi')

    expect(resolveAvatarBehavior(avatar, base)).toBe(base)
  })

  it('clones expressions, animations and nested steps as one independent library', () => {
    const behavior = cloneAvatarBehavior(base)

    expect(behavior).not.toBe(base)
    expect(behavior.expressions).not.toBe(base.expressions)
    expect(behavior.sequences).not.toBe(base.sequences)
    expect(behavior.sequences[0].steps).not.toBe(base.sequences[0].steps)
    expect(behavior.sequences[0].blink).not.toBe(base.sequences[0].blink)
  })
})
