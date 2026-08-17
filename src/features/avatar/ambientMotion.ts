import type { BodyMotion, Expression, EyeMotion } from './geometry'

export const eyeMotionModes = [
  'none',
  'microSaccades',
  'wander',
  'lookAround',
  'focusPulse',
  'shake',
  'dart',
  'orbit',
  'squintPulse',
  'sparkle',
  'anticipate',
] as const
export const bodyMotionModes = [
  'none',
  'slowDrift',
  'breathe',
  'bob',
  'bounce',
  'sway',
  'float',
  'shake',
] as const
const eyeMotionSet = new Set<string>(eyeMotionModes)
const bodyMotionSet = new Set<string>(bodyMotionModes)
export const isEyeMotion = (value: unknown): value is EyeMotion =>
  typeof value === 'string' && eyeMotionSet.has(value)
export const isBodyMotion = (value: unknown): value is BodyMotion =>
  typeof value === 'string' && bodyMotionSet.has(value)

const smoothstep = (value: number) => value * value * (3 - 2 * value)
const hash = (value: number) => {
  const raw = Math.sin(value * 127.1 + 311.7) * 43758.5453
  return (raw - Math.floor(raw)) * 2 - 1
}

const expressionSeed = (expression: Expression) =>
  expression.headX * 0.71 + expression.headY * 1.13 + expression.headZ * 1.37
const EYE_MOTION_SEED = 17.29

const smoothNoise = (elapsedMs: number, axis: number, seed: number, interval: number) => {
  const progress = elapsedMs / interval
  const step = Math.floor(progress)
  const blend = smoothstep(progress - step)
  const previous = hash(step * 3 + axis + seed)
  const next = hash((step + 1) * 3 + axis + seed)
  return previous + (next - previous) * blend
}

const saccade = (elapsedMs: number, axis: number, seed: number) => {
  const interval = 1100
  const duration = 140
  if (elapsedMs <= 0) return 0
  const step = Math.floor(elapsedMs / interval)
  const progress = (elapsedMs - step * interval) / duration
  const blend = smoothstep(Math.min(progress, 1))
  const previous = step === 0 ? 0 : hash((step - 1) * 2 + axis + seed)
  const next = hash(step * 2 + axis + seed)
  return previous + (next - previous) * blend
}

export const hasAmbientMotion = (expression: Expression) =>
  expression.eyeMotion !== 'none' || expression.bodyMotion !== 'none'

export const ambientBodyOffset = (expression: Expression, elapsedMs: number, strength = 1) => {
  const seed = expressionSeed(expression)
  if (expression.bodyMotion === 'slowDrift') {
    return {
      x: smoothNoise(elapsedMs, 3, seed, 2900) * 1.45 * strength,
      y: smoothNoise(elapsedMs, 4, seed, 3700) * 1.1 * strength,
    }
  }
  if (expression.bodyMotion === 'breathe') {
    const time = elapsedMs / 1000
    return { x: 0, y: Math.sin(time * 1.7) * 1.15 * strength }
  }
  if (expression.bodyMotion === 'bob') {
    const time = elapsedMs / 1000
    return { x: 0, y: Math.sin(time * 3.2) * 2.2 * strength }
  }
  if (expression.bodyMotion === 'bounce') {
    const time = elapsedMs / 1000
    return {
      x: Math.sin(time * 2.4) * 0.9 * strength,
      y: -Math.abs(Math.sin(time * 3.6)) * 4.2 * strength,
    }
  }
  if (expression.bodyMotion === 'sway') {
    const time = elapsedMs / 1000
    return { x: Math.sin(time * 1.8) * 2.1 * strength, y: Math.cos(time * 1.4) * 0.55 * strength }
  }
  if (expression.bodyMotion === 'float') {
    return {
      x: smoothNoise(elapsedMs, 5, seed, 4200) * 2.2 * strength,
      y: smoothNoise(elapsedMs, 6, seed, 5100) * 2.5 * strength,
    }
  }
  if (expression.bodyMotion === 'shake') {
    const time = elapsedMs / 1000
    return {
      x: (Math.sin(time * 31) + Math.sin(time * 53) * 0.45) * 1.35 * strength,
      y: (Math.sin(time * 37) + Math.sin(time * 61) * 0.4) * 1.1 * strength,
    }
  }
  return { x: 0, y: 0 }
}

export const ambientEyeOffset = (expression: Expression, elapsedMs: number, strength = 1) => {
  if (expression.eyeMotion === 'microSaccades') {
    return {
      x: saccade(elapsedMs, 0, EYE_MOTION_SEED) * 1.5 * strength,
      y: saccade(elapsedMs, 1, EYE_MOTION_SEED) * 0.9 * strength,
    }
  }
  if (expression.eyeMotion === 'wander') {
    return {
      x: smoothNoise(elapsedMs, 9, EYE_MOTION_SEED, 2100) * 3.2 * strength,
      y: smoothNoise(elapsedMs, 10, EYE_MOTION_SEED, 2700) * 1.8 * strength,
    }
  }
  if (expression.eyeMotion === 'lookAround') {
    const time = elapsedMs / 1000
    return {
      x: Math.sin(time * 1.8) * 4.2 * strength,
      y: Math.sin(time * 0.9 + 0.7) * 1.4 * strength,
    }
  }
  if (expression.eyeMotion === 'focusPulse') {
    const time = elapsedMs / 1000
    return { x: Math.sin(time * 5.2) * 0.35 * strength, y: Math.cos(time * 4.8) * 0.25 * strength }
  }
  if (expression.eyeMotion === 'shake') {
    const time = elapsedMs / 1000
    return {
      x: (Math.sin(time * 47) + Math.sin(time * 71) * 0.45) * 1.2 * strength,
      y: (Math.sin(time * 59) + Math.sin(time * 83) * 0.4) * 0.8 * strength,
    }
  }
  if (expression.eyeMotion === 'dart') {
    const time = elapsedMs / 1000
    const snap = Math.tanh(Math.sin(time * 3.8) * 4.2)
    return {
      x: snap * 5.6 * strength,
      y: Math.sin(time * 1.9 + 0.8) * 1.15 * strength,
    }
  }
  if (expression.eyeMotion === 'orbit') {
    const time = elapsedMs / 1000
    return {
      x: Math.sin(time * 2.15) * 5.1 * strength,
      y: -Math.cos(time * 2.15) * 3.2 * strength,
    }
  }
  if (expression.eyeMotion === 'squintPulse') {
    const time = elapsedMs / 1000
    return { x: Math.sin(time * 2.1) * 0.45 * strength, y: Math.cos(time * 1.7) * 0.3 * strength }
  }
  if (expression.eyeMotion === 'sparkle') {
    const time = elapsedMs / 1000
    return {
      x: (Math.sin(time * 4.7) + Math.sin(time * 11.3) * 0.3) * 0.75 * strength,
      y: (Math.cos(time * 5.1) + Math.sin(time * 9.4) * 0.25) * 0.5 * strength,
    }
  }
  if (expression.eyeMotion === 'anticipate') {
    const time = elapsedMs / 1000
    const pulse = (1 - Math.cos(time * 3.2)) * 0.5
    return { x: Math.sin(time * 1.6) * 0.55 * strength, y: -pulse * 1.1 * strength }
  }
  return { x: 0, y: 0 }
}

export const applyAmbientBodyMotion = (
  expression: Expression,
  elapsedMs: number,
  strength = 1
): Expression => {
  const next = { ...expression }
  const seed = expressionSeed(expression)

  if (expression.bodyMotion === 'slowDrift') {
    next.headX += smoothNoise(elapsedMs, 0, seed, 2600) * 0.8 * strength
    next.headY += smoothNoise(elapsedMs, 1, seed, 3300) * 1.15 * strength
    next.headZ += smoothNoise(elapsedMs, 2, seed, 4100) * 0.45 * strength
  } else if (expression.bodyMotion === 'breathe') {
    const time = elapsedMs / 1000
    next.headX += Math.sin(time * 1.7) * 0.45 * strength
  } else if (expression.bodyMotion === 'bob') {
    const time = elapsedMs / 1000
    next.headX += Math.sin(time * 3.2) * 1.4 * strength
  } else if (expression.bodyMotion === 'bounce') {
    const time = elapsedMs / 1000
    next.headZ += Math.sin(time * 3.6) * 2.2 * strength
  } else if (expression.bodyMotion === 'sway') {
    const time = elapsedMs / 1000
    next.headZ += Math.sin(time * 1.8) * 3.4 * strength
    next.headY += Math.sin(time * 0.9) * 1.2 * strength
  } else if (expression.bodyMotion === 'float') {
    next.headX += smoothNoise(elapsedMs, 7, seed, 4200) * 1.25 * strength
    next.headY += smoothNoise(elapsedMs, 8, seed, 5100) * 1.8 * strength
    next.headZ += smoothNoise(elapsedMs, 9, seed, 4700) * 0.9 * strength
  } else if (expression.bodyMotion === 'shake') {
    const time = elapsedMs / 1000
    next.headX += (Math.sin(time * 31) + Math.sin(time * 53) * 0.45) * 1.15 * strength
    next.headY += (Math.sin(time * 37) + Math.sin(time * 61) * 0.4) * 1.35 * strength
    next.headZ += Math.sin(time * 43) * 0.7 * strength
  }

  const eyeTime = elapsedMs / 1000
  const scaleEyes = (widthFactor: number, heightFactor: number) => {
    next.widthLeft = Math.max(5, next.widthLeft * (1 + (widthFactor - 1) * strength))
    next.widthRight = Math.max(5, next.widthRight * (1 + (widthFactor - 1) * strength))
    next.heightLeft = Math.max(5, next.heightLeft * (1 + (heightFactor - 1) * strength))
    next.heightRight = Math.max(5, next.heightRight * (1 + (heightFactor - 1) * strength))
  }

  if (expression.eyeMotion === 'focusPulse') {
    const pulse = Math.sin(eyeTime * 4.8)
    scaleEyes(1 + pulse * 0.025, 1 - pulse * 0.055)
  } else if (expression.eyeMotion === 'squintPulse') {
    const pulse = (Math.sin(eyeTime * 2.6) + 1) * 0.5
    scaleEyes(1 + pulse * 0.04, 0.82 + pulse * 0.18)
  } else if (expression.eyeMotion === 'sparkle') {
    const pulse = (Math.sin(eyeTime * 5.4) + 1) * 0.5
    scaleEyes(0.98 + pulse * 0.08, 0.96 + pulse * 0.12)
    next.leftAngle += Math.sin(eyeTime * 3.1) * 1.6 * strength
    next.rightAngle -= Math.sin(eyeTime * 3.1) * 1.6 * strength
  } else if (expression.eyeMotion === 'anticipate') {
    const pulse = (1 - Math.cos(eyeTime * 3.2)) * 0.5
    scaleEyes(1 + pulse * 0.1, 1 + pulse * 0.16)
  } else if (expression.eyeMotion === 'orbit') {
    next.leftAngle += Math.sin(eyeTime * 2.15) * 3 * strength
    next.rightAngle -= Math.sin(eyeTime * 2.15) * 3 * strength
  }

  return next
}

export const applyAmbientMotion = (
  expression: Expression,
  elapsedMs: number,
  strength = 1
): Expression => {
  const next = applyAmbientBodyMotion(expression, elapsedMs, strength)
  const eyeOffset = ambientEyeOffset(expression, elapsedMs, strength)
  next.positionXLeft += eyeOffset.x
  next.positionXRight += eyeOffset.x
  next.positionYLeft += eyeOffset.y
  next.positionYRight += eyeOffset.y
  return next
}
