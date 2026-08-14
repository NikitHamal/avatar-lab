import {
  getStandardAnimationAvailabilityV1,
  STANDARD_ANIMATIONS_V1,
  type AnimationKey,
  type AvatarAnimationDefinition,
  type AvatarDefinition,
  type AvatarExpressionDefinition,
  type ExpressionKey,
} from './avatarDefinition'
import { applyAmbientMotion } from './ambientMotion'
import { interpolatePose, poseFromExpression } from './geometry'
import { expressionFromDefinition, renderAvatarExpression, type AvatarScene } from './scene'

export type AvatarRuntimeError = {
  code: 'unknown_animation' | 'unavailable_standard_animation' | 'unknown_expression'
  key: string
  message: string
}

export type AvatarCommandResult<T> =
  { ok: true; value: T } | { ok: false; error: AvatarRuntimeError }

export const resolveExpression = (
  definition: Readonly<AvatarDefinition>,
  key: ExpressionKey
): AvatarCommandResult<Readonly<AvatarExpressionDefinition>> => {
  const expression = definition.expressions[key]
  return expression
    ? { ok: true, value: expression }
    : {
        ok: false,
        error: { code: 'unknown_expression', key, message: `Unknown expression '${key}'` },
      }
}

export const resolveAnimation = (
  definition: Readonly<AvatarDefinition>,
  key: AnimationKey
): AvatarCommandResult<Readonly<AvatarAnimationDefinition>> => {
  const explicit = definition.animations[key]
  if (explicit) return { ok: true, value: explicit }
  if (!(key in STANDARD_ANIMATIONS_V1)) {
    return {
      ok: false,
      error: { code: 'unknown_animation', key, message: `Unknown animation '${key}'` },
    }
  }
  const availability = getStandardAnimationAvailabilityV1(definition.expressions)
  const unavailable = availability.unavailable.find(item => item.key === key)
  if (unavailable) {
    return {
      ok: false,
      error: {
        code: 'unavailable_standard_animation',
        key,
        message: `Animation '${key}' requires: ${unavailable.missingExpressions.join(', ')}`,
      },
    }
  }
  const { requiredExpressions: _requiredExpressions, ...animation } =
    STANDARD_ANIMATIONS_V1[key as keyof typeof STANDARD_ANIMATIONS_V1]
  return { ok: true, value: animation }
}

export type AvatarPlaybackState = {
  activeAnimation?: AnimationKey
  activeExpression: ExpressionKey
  status: 'playing' | 'paused' | 'stopped'
  stepIndex: number
  direction: 1 | -1
  phase: 'transition' | 'hold'
  phaseStartedAt: number
  transitionFrom: ExpressionKey
  pausedAt?: number
  blinkDueAt?: number
  blinkStartedAt?: number
  directTransition?: {
    from: ExpressionKey
    startedAt: number
    durationMs: number
    transition: AvatarAnimationDefinition['steps'][number]['transition']
  }
}

export type AvatarRuntimeEnvironment = {
  random: () => number
  reduceMotion?: boolean
}

export const createAvatarPlaybackState = (): AvatarPlaybackState => ({
  activeExpression: 'neutral',
  status: 'stopped',
  stepIndex: 0,
  direction: 1,
  phase: 'transition',
  phaseStartedAt: 0,
  transitionFrom: 'neutral',
})

export const playAvatarAnimation = (
  definition: Readonly<AvatarDefinition>,
  key: AnimationKey,
  now: number
): AvatarCommandResult<AvatarPlaybackState> => {
  const result = resolveAnimation(definition, key)
  if (!result.ok) return result
  return {
    ok: true,
    value: {
      activeAnimation: key,
      activeExpression: result.value.steps[0]?.expression ?? 'neutral',
      status: 'playing',
      stepIndex: 0,
      direction: 1,
      phase: 'transition',
      phaseStartedAt: now,
      transitionFrom: 'neutral',
      blinkDueAt: now + result.value.blink.initialDelayMs,
    },
  }
}

const nextCursor = (
  animation: Readonly<AvatarAnimationDefinition>,
  state: AvatarPlaybackState
): { stepIndex: number; direction: 1 | -1; complete: boolean } => {
  const last = animation.steps.length - 1
  if (state.stepIndex < last && state.direction === 1) {
    return { stepIndex: state.stepIndex + 1, direction: state.direction, complete: false }
  }
  if (state.stepIndex > 0 && state.direction === -1) {
    return { stepIndex: state.stepIndex - 1, direction: state.direction, complete: false }
  }
  if (animation.playbackMode === 'once') {
    return { stepIndex: state.stepIndex, direction: state.direction, complete: true }
  }
  if (animation.playbackMode === 'pingPong' && last > 0) {
    const direction = state.direction === 1 ? -1 : 1
    return { stepIndex: state.stepIndex + direction, direction, complete: false }
  }
  return { stepIndex: 0, direction: 1 as const, complete: false }
}

export const advanceAvatarPlayback = (
  definition: Readonly<AvatarDefinition>,
  state: Readonly<AvatarPlaybackState>,
  now: number,
  environment: AvatarRuntimeEnvironment
): AvatarPlaybackState => {
  if (state.directTransition) {
    if (now < state.directTransition.startedAt + state.directTransition.durationMs) {
      return { ...state }
    }
    const { directTransition: _directTransition, ...next } = state
    return { ...next, status: 'stopped' }
  }
  if (state.status !== 'playing' || !state.activeAnimation) return { ...state }
  const resolved = resolveAnimation(definition, state.activeAnimation)
  if (!resolved.ok || !resolved.value.steps.length) return { ...createAvatarPlaybackState() }
  const animation = resolved.value
  let next = { ...state }
  if (animation.blink.enabled && next.blinkDueAt !== undefined && now >= next.blinkDueAt) {
    const startedAt = next.blinkDueAt
    const interval =
      animation.blink.minIntervalMs +
      Math.max(0, Math.min(1, environment.random())) *
        (animation.blink.maxIntervalMs - animation.blink.minIntervalMs)
    next.blinkStartedAt = startedAt
    next.blinkDueAt = startedAt + animation.blink.durationMs + interval
  }
  let safety = animation.steps.length * 4 + 4
  while (safety-- > 0) {
    const step = animation.steps[next.stepIndex]
    const duration = next.phase === 'transition' ? step.transitionMs : step.holdMs
    if (now < next.phaseStartedAt + duration) break
    next.phaseStartedAt += duration
    if (next.phase === 'transition') {
      next.phase = 'hold'
      next.activeExpression = step.expression
      continue
    }
    const cursor = nextCursor(animation, next)
    if (cursor.complete) {
      next.status = 'stopped'
      delete next.activeAnimation
      break
    }
    next.stepIndex = cursor.stepIndex
    next.direction = cursor.direction
    next.phase = 'transition'
    next.transitionFrom = next.activeExpression
    next.activeExpression = animation.steps[cursor.stepIndex].expression
  }
  return next
}

export const pauseAvatarPlayback = (
  state: Readonly<AvatarPlaybackState>,
  now: number
): AvatarPlaybackState =>
  state.status === 'playing' ? { ...state, status: 'paused', pausedAt: now } : { ...state }

export const resumeAvatarPlayback = (
  state: Readonly<AvatarPlaybackState>,
  now: number
): AvatarPlaybackState => {
  if (state.status !== 'paused' || state.pausedAt === undefined) return { ...state }
  const pauseDuration = now - state.pausedAt
  return {
    ...state,
    status: 'playing',
    phaseStartedAt: state.phaseStartedAt + pauseDuration,
    ...(state.blinkDueAt === undefined ? {} : { blinkDueAt: state.blinkDueAt + pauseDuration }),
    ...(state.blinkStartedAt === undefined
      ? {}
      : { blinkStartedAt: state.blinkStartedAt + pauseDuration }),
    pausedAt: undefined,
  }
}

const easing = (
  transition: AvatarAnimationDefinition['steps'][number]['transition'],
  value: number
) => {
  const progress = Math.max(0, Math.min(1, value))
  if (transition === 'smooth') return progress * progress * (3 - 2 * progress)
  if (transition === 'snappy') return 1 - (1 - progress) ** 3
  const end = 1 - Math.exp(-6) * Math.cos(8)
  return Math.max(0, Math.min(1, (1 - Math.exp(-6 * progress) * Math.cos(8 * progress)) / end))
}

export const blinkOpacityAt = (
  animation: Readonly<AvatarAnimationDefinition>,
  state: Readonly<AvatarPlaybackState>,
  now: number
) => {
  if (!animation.blink.enabled || state.blinkStartedAt === undefined) return 1
  const progress = (now - state.blinkStartedAt) / animation.blink.durationMs
  if (progress < 0 || progress >= 1) return 1
  return Math.abs(progress * 2 - 1)
}

export const renderAvatarFrame = (
  definition: Readonly<AvatarDefinition>,
  state: Readonly<AvatarPlaybackState>,
  now: number,
  environment: AvatarRuntimeEnvironment
): AvatarScene => {
  const targetDefinition = definition.expressions[state.activeExpression]
  if (!targetDefinition)
    return renderAvatarExpression(
      definition,
      expressionFromDefinition('neutral', definition.expressions.neutral)
    )
  let expression = expressionFromDefinition(state.activeExpression, targetDefinition)
  let blink = 1
  if (state.directTransition && !environment.reduceMotion) {
    const fromDefinition = definition.expressions[state.directTransition.from]
    if (fromDefinition) {
      const from = expressionFromDefinition(state.directTransition.from, fromDefinition)
      const progress = easing(
        state.directTransition.transition,
        (now - state.directTransition.startedAt) / Math.max(state.directTransition.durationMs, 1)
      )
      expression = interpolatePose(
        poseFromExpression(from),
        poseFromExpression(expression),
        progress
      ).expression
    }
  } else if (state.activeAnimation) {
    const resolved = resolveAnimation(definition, state.activeAnimation)
    if (resolved.ok) {
      const step = resolved.value.steps[state.stepIndex]
      if (state.phase === 'transition' && step && !environment.reduceMotion) {
        const fromDefinition = definition.expressions[state.transitionFrom]
        if (fromDefinition) {
          const from = expressionFromDefinition(state.transitionFrom, fromDefinition)
          const duration = Math.max(step.transitionMs, 1)
          const progress = easing(step.transition, (now - state.phaseStartedAt) / duration)
          expression = interpolatePose(
            poseFromExpression(from),
            poseFromExpression(expression),
            progress
          ).expression
        }
      }
      blink = blinkOpacityAt(resolved.value, state, now)
    }
  }
  if (!environment.reduceMotion) expression = applyAmbientMotion(expression, now)
  return renderAvatarExpression(definition, expression, targetDefinition.colors, blink)
}
