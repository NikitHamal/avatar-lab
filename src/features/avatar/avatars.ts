import { parseAvatarBody, type AvatarBody } from './body'
import { defaultExpression, initialExpressions } from './presets'
import { surfacePresets } from './surfaces'
import { CREATURE_COLORWAYS } from '../creature/creatureSwatches'
import type { Expression, EyeStyle } from './geometry'
import { isBodyMotion, isEyeMotion } from './ambientMotion'
import {
  normalizeSequencesForExpressions,
  parseSequences,
  type AvatarSequence,
} from '../animation/sequences'

export type AvatarBehaviorLibrary = {
  expressions: Expression[]
  sequences: AvatarSequence[]
}

export type AvatarEyeRenderer = 'classic' | 'creature'

export const defaultCreaturePaletteIndex = 52

export type StudioAvatar = {
  id: string
  name: string
  body: AvatarBody
  colors: AvatarColors
  eyes: AvatarEyeDefaults
  eyeRenderer: AvatarEyeRenderer
  creaturePaletteIndex: number
  mouthEnabled: boolean
  behavior?: AvatarBehaviorLibrary
}

export type AvatarColors = { body: string; eyes: string; pupil?: string }
export type AvatarEyeDefaults = Pick<
  Expression,
  | 'widthLeft'
  | 'widthRight'
  | 'heightLeft'
  | 'heightRight'
  | 'spacing'
  | 'positionXLeft'
  | 'positionXRight'
  | 'positionYLeft'
  | 'positionYRight'
  | 'leftAngle'
  | 'rightAngle'
> & {
  eyeStyle?: EyeStyle
}
export const defaultAvatarColors: AvatarColors = { body: '#5b7fe5', eyes: '#111316' }
export const defaultAvatarEyes: AvatarEyeDefaults = {
  widthLeft: defaultExpression.widthLeft,
  widthRight: defaultExpression.widthRight,
  heightLeft: defaultExpression.heightLeft,
  heightRight: defaultExpression.heightRight,
  spacing: defaultExpression.spacing,
  positionXLeft: defaultExpression.positionXLeft,
  positionXRight: defaultExpression.positionXRight,
  positionYLeft: defaultExpression.positionYLeft,
  positionYRight: defaultExpression.positionYRight,
  leftAngle: defaultExpression.leftAngle,
  rightAngle: defaultExpression.rightAngle,
  eyeStyle: 'dot',
}

export type ColorwayPreset = {
  id: string
  name: string
  body: string
  eyes: string
  eyeStyle: EyeStyle
}

export const creatureColorways: ColorwayPreset[] = [
  { id: 'cat-seaglass', name: 'Cat Seaglass', body: '#fbfbfb', eyes: '#167b61', eyeStyle: 'cat' },
  { id: 'nightlight', name: 'Nightlight', body: '#7768fe', eyes: '#55fc87', eyeStyle: 'circle' },
  { id: 'slushie', name: 'Slushie', body: '#c206ad', eyes: '#49f6d9', eyeStyle: 'dot' },
  { id: 'lobster', name: 'Lobster', body: '#f95320', eyes: '#044a5f', eyeStyle: 'acorn' },
  { id: 'blacklight', name: 'Blacklight', body: '#6922f0', eyes: '#a3f410', eyeStyle: 'cat' },
  { id: 'matcha', name: 'Matcha', body: '#c7fba6', eyes: '#5e6e06', eyeStyle: 'acorn' },
  { id: 'sunset', name: 'Sunset', body: '#ae2400', eyes: '#f855fc', eyeStyle: 'circle' },
  { id: 'neapolitan', name: 'Neapolitan', body: '#87493b', eyes: '#eb76dd', eyeStyle: 'dot' },
]

const hexColor = /^#[0-9a-f]{6}$/i
const parseEyeRenderer = (value: unknown): AvatarEyeRenderer =>
  value === 'creature' ? 'creature' : 'classic'
const parseCreaturePaletteIndex = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value)
    ? Math.min(99, Math.max(0, value))
    : defaultCreaturePaletteIndex
const parseColors = (value: unknown): AvatarColors => {
  const candidate = value as Partial<AvatarColors> | null
  const pupil =
    typeof candidate?.pupil === 'string' && hexColor.test(candidate.pupil)
      ? candidate.pupil
      : undefined
  return {
    body:
      typeof candidate?.body === 'string' && hexColor.test(candidate.body)
        ? candidate.body
        : defaultAvatarColors.body,
    eyes:
      typeof candidate?.eyes === 'string' && hexColor.test(candidate.eyes)
        ? candidate.eyes
        : defaultAvatarColors.eyes,
    ...(pupil ? { pupil } : {}),
  }
}

const inferLegacyCreaturePaletteIndex = (colors: AvatarColors): number | undefined => {
  if (!colors.pupil) return undefined
  const eye = colors.eyes.toLowerCase()
  const pupil = colors.pupil.toLowerCase()
  return CREATURE_COLORWAYS.find(
    swatch =>
      swatch.body.toLowerCase() === eye && (swatch.pupil ?? swatch.eyes).toLowerCase() === pupil
  )?.index
}

const isEyeStyle = (value: unknown): value is EyeStyle =>
  value === 'dot' || value === 'circle' || value === 'cat' || value === 'acorn'

const eyeDefaultFields = Object.keys(defaultAvatarEyes).filter(
  key => key !== 'eyeStyle'
) as (keyof Omit<AvatarEyeDefaults, 'eyeStyle'>)[]

export const parseAvatarEyeDefaults = (value: unknown): AvatarEyeDefaults => {
  const candidate = value as Partial<AvatarEyeDefaults> | null
  const parsed = { ...defaultAvatarEyes }
  eyeDefaultFields.forEach(field => {
    const stored = candidate?.[field]
    if (typeof stored === 'number' && Number.isFinite(stored)) parsed[field] = stored
  })
  if (isEyeStyle(candidate?.eyeStyle)) {
    parsed.eyeStyle = candidate.eyeStyle
  }
  return parsed
}

export const applyAvatarEyeDefaults = (
  expression: Expression,
  eyes: AvatarEyeDefaults = defaultAvatarEyes
): Expression => {
  const result = { ...expression }
  eyeDefaultFields.forEach(field => {
    result[field] = expression[field] + eyes[field] - defaultAvatarEyes[field]
  })
  result.widthLeft = Math.max(10, result.widthLeft)
  result.widthRight = Math.max(10, result.widthRight)
  result.heightLeft = Math.max(10, result.heightLeft)
  result.heightRight = Math.max(10, result.heightRight)
  if (eyes.eyeStyle && eyes.eyeStyle !== 'dot') {
    result.eyeStyle = eyes.eyeStyle
  }
  return result
}

export type AvatarLibrary = {
  activeAvatarId: string
  avatars: StudioAvatar[]
}

const cloneExpressions = (expressions: Expression[]) => expressions.map(item => ({ ...item }))
export const parseExpressions = (value: unknown): Expression[] => {
  if (!Array.isArray(value) || !value.length) return cloneExpressions(initialExpressions)
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return { ...defaultExpression, id: `expression-${String(index).padStart(2, '0')}` }
    }
    const candidate = item as Partial<Expression>
    const storedEyeMotion = (item as { eyeMotion?: unknown }).eyeMotion
    const storedBodyMotion = (item as { bodyMotion?: unknown }).bodyMotion
    const parsed = Object.fromEntries(
      Object.entries(defaultExpression).map(([field, fallback]) => {
        if (field === 'id') {
          return [
            field,
            typeof candidate.id === 'string' && candidate.id
              ? candidate.id
              : `expression-${String(index).padStart(2, '0')}`,
          ]
        }
        const stored = candidate[field as keyof Expression]
        return [field, typeof stored === 'number' && Number.isFinite(stored) ? stored : fallback]
      })
    ) as Expression
    if (typeof candidate.bodyColor === 'string' && hexColor.test(candidate.bodyColor))
      parsed.bodyColor = candidate.bodyColor
    if (typeof candidate.eyeColor === 'string' && hexColor.test(candidate.eyeColor))
      parsed.eyeColor = candidate.eyeColor
    if (isEyeStyle(candidate.eyeStyle)) parsed.eyeStyle = candidate.eyeStyle
    parsed.eyeMotion = isEyeMotion(storedEyeMotion) ? storedEyeMotion : defaultExpression.eyeMotion
    parsed.bodyMotion = isBodyMotion(storedBodyMotion)
      ? storedBodyMotion
      : defaultExpression.bodyMotion
    const storedMouth = (item as { mouth?: unknown }).mouth
    if (
      typeof storedMouth === 'string' &&
      [
        'smile',
        'openSmile',
        'oMouth',
        'flat',
        'cat',
        'frown',
        'smirk',
        'grin',
        'kiss',
        'none',
      ].includes(storedMouth)
    ) {
      parsed.mouth = storedMouth as Expression['mouth']
    } else {
      parsed.mouth = defaultExpression.mouth
    }
    const storedMouthScale = (item as { mouthScale?: unknown }).mouthScale
    parsed.mouthScale =
      typeof storedMouthScale === 'number' && Number.isFinite(storedMouthScale)
        ? Math.min(1.8, Math.max(0.45, storedMouthScale))
        : defaultExpression.mouthScale
    const numericMouthFields = {
      mouthOffsetX: [-48, 48, 0],
      mouthOffsetY: [-48, 48, 0],
      mouthWidth: [0.45, 2.2, 1],
      mouthCurve: [0.2, 2.4, 1],
      mouthStrokeWidth: [1, 8, 3.2],
    } as const
    for (const [field, [minimum, maximum, fallback]] of Object.entries(numericMouthFields)) {
      const stored = (item as Record<string, unknown>)[field]
      ;(parsed as unknown as Record<string, unknown>)[field] =
        typeof stored === 'number' && Number.isFinite(stored)
          ? Math.min(maximum, Math.max(minimum, stored))
          : (defaultExpression as unknown as Record<string, unknown>)[field] ?? fallback
    }
    const storedEffect = (item as { effect?: unknown }).effect
    if (
      typeof storedEffect === 'string' &&
      [
        'none',
        'confetti',
        'sparkles',
        'hearts',
        'alert',
        'successBurst',
        'errorPulse',
        'zzz',
        'question',
        'introGlow',
      ].includes(storedEffect)
    ) {
      parsed.effect = storedEffect as Expression['effect']
    } else {
      parsed.effect = defaultExpression.effect
    }
    return parsed
  })
}

const cloneSequences = (sequences: AvatarSequence[]) =>
  sequences.map(sequence => ({
    ...sequence,
    steps: sequence.steps.map(step => ({ ...step })),
    blink: { ...sequence.blink },
  }))

export const cloneAvatarBehavior = (behavior: AvatarBehaviorLibrary): AvatarBehaviorLibrary => ({
  expressions: cloneExpressions(behavior.expressions),
  sequences: cloneSequences(behavior.sequences),
})

export const resolveAvatarBehavior = (
  avatar: StudioAvatar,
  base: AvatarBehaviorLibrary
): AvatarBehaviorLibrary => avatar.behavior ?? base

const parseAvatarBehavior = (
  value: unknown,
  base: AvatarBehaviorLibrary
): AvatarBehaviorLibrary | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<AvatarBehaviorLibrary>
  if (!Array.isArray(candidate.expressions) || !candidate.expressions.length) return undefined
  const expressions = parseExpressions(candidate.expressions)
  const sequences = normalizeSequencesForExpressions(
    Array.isArray(candidate.sequences)
      ? parseSequences(candidate.sequences)
      : cloneSequences(base.sequences),
    expressions
  )
  return { expressions, sequences }
}

export const createAvatar = (name: string): StudioAvatar => ({
  id: `avatar-${crypto.randomUUID()}`,
  name: name.trim() || 'Nouvel avatar',
  body: { primary: { ...surfacePresets.sphere }, nodes: [] },
  colors: { ...defaultAvatarColors },
  eyes: { ...defaultAvatarEyes },
  eyeRenderer: 'classic',
  creaturePaletteIndex: defaultCreaturePaletteIndex,
  mouthEnabled: false,
})

export const parseAvatarLibrary = (
  value: unknown,
  fallback: AvatarLibrary,
  baseBehavior: AvatarBehaviorLibrary
): AvatarLibrary => {
  try {
    const parsed = value as Partial<AvatarLibrary> | null
    if (!parsed || !Array.isArray(parsed.avatars) || !parsed.avatars.length) return fallback
    const seenIds = new Set<string>()
    const avatars = parsed.avatars
      .filter(avatar => {
        if (!avatar || typeof avatar.id !== 'string' || typeof avatar.name !== 'string')
          return false
        if (seenIds.has(avatar.id)) return false
        seenIds.add(avatar.id)
        return true
      })
      .map(avatar => {
        const behavior = parseAvatarBehavior(avatar.behavior, baseBehavior)
        const colors = parseColors(avatar.colors)
        const hasStoredEyeRenderer =
          avatar.eyeRenderer === 'classic' || avatar.eyeRenderer === 'creature'
        const hasStoredCreaturePalette =
          typeof avatar.creaturePaletteIndex === 'number' &&
          Number.isInteger(avatar.creaturePaletteIndex)
        const legacyCreaturePaletteIndex =
          !hasStoredEyeRenderer && !hasStoredCreaturePalette
            ? inferLegacyCreaturePaletteIndex(colors)
            : undefined
        return {
          id: avatar.id,
          name: avatar.name,
          body: parseAvatarBody(avatar.body, surfacePresets.sphere),
          colors,
          eyes: parseAvatarEyeDefaults(avatar.eyes),
          eyeRenderer: hasStoredEyeRenderer
            ? parseEyeRenderer(avatar.eyeRenderer)
            : legacyCreaturePaletteIndex === undefined
              ? 'classic'
              : 'creature',
          creaturePaletteIndex: hasStoredCreaturePalette
            ? parseCreaturePaletteIndex(avatar.creaturePaletteIndex)
            : (legacyCreaturePaletteIndex ?? defaultCreaturePaletteIndex),
          mouthEnabled: avatar.mouthEnabled === true,
          ...(behavior ? { behavior } : {}),
        }
      })
    if (!avatars.length) return fallback
    const activeAvatarId = avatars.some(avatar => avatar.id === parsed.activeAvatarId)
      ? parsed.activeAvatarId!
      : avatars[0].id
    return { activeAvatarId, avatars }
  } catch {
    return fallback
  }
}
