import type { Expression } from '@/features/avatar/geometry'

export type CreatureEyeSideRig = {
  widthScale: number
  heightScale: number
  offsetX: number
  offsetY: number
  rotation: number
}

export type CreatureEyeRig = {
  left: CreatureEyeSideRig
  right: CreatureEyeSideRig
  gazeX: number
  gazeY: number
  lockGaze: boolean
}

export const CREATURE_NATIVE_EYE_CENTER_X = 0.379
export const CREATURE_NATIVE_EYE_CENTER_Y = -0.054
export const CREATURE_FRAME_HALF_WIDTH = 42
export const CREATURE_FRAME_HALF_HEIGHT = 58

const BASE_WIDTH = 20
const BASE_HEIGHT = 50
const BASE_SPACING = 35
const BASE_Y = -7

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const widthScale = (width: number) =>
  clamp(0.64 + Math.pow(Math.max(8, width) / BASE_WIDTH, 0.92) * 0.36, 0.62, 1.72)

// Expression height was authored for the classic eye renderer. Map that range to
// the Creature rig non-linearly so sleepy/wink poses can genuinely close while
// ordinary expressions keep the authored Creature silhouette instead of looking
// vertically squashed.
const heightScale = (height: number, blink: number) => {
  const authored = clamp((Math.max(5, height) - 5) / (BASE_HEIGHT - 5), 0, 1.65)
  const expressionScale = 0.055 + Math.pow(authored, 0.74) * 0.945
  const blinkScale = 0.055 + clamp(blink, 0, 1) * 0.945
  return clamp(expressionScale * blinkScale, 0.045, 1.52)
}

const gazeNeedsLock = (expression: Expression, avgX: number, avgY: number, avgHeight: number) =>
  avgHeight < 30 ||
  Math.abs(expression.heightLeft - expression.heightRight) > 7 ||
  Math.abs(expression.leftAngle) > 4 ||
  Math.abs(expression.rightAngle) > 4 ||
  Math.abs(avgX) > 3 ||
  Math.abs(avgY - BASE_Y) > 7 ||
  expression.eyeMotion === 'wander' ||
  expression.eyeMotion === 'lookAround' ||
  expression.eyeMotion === 'focusPulse' ||
  expression.eyeMotion === 'shake' ||
  expression.eyeMotion === 'microSaccades' ||
  expression.eyeMotion === 'dart' ||
  expression.eyeMotion === 'orbit' ||
  expression.eyeMotion === 'squintPulse' ||
  expression.eyeMotion === 'sparkle' ||
  expression.eyeMotion === 'anticipate'

export const creatureEyeRigFromExpression = (
  expression: Expression,
  blink = 1,
  eyeOffset: Readonly<{ x: number; y: number }> = { x: 0, y: 0 }
): CreatureEyeRig => {
  const spacingShift = (expression.spacing - BASE_SPACING) / (CREATURE_FRAME_HALF_WIDTH * 2)
  const avgX = (expression.positionXLeft + expression.positionXRight) / 2 + eyeOffset.x
  const avgY = (expression.positionYLeft + expression.positionYRight) / 2 + eyeOffset.y
  const avgHeight = (expression.heightLeft + expression.heightRight) / 2

  const side = (suffix: 'Left' | 'Right', direction: -1 | 1): CreatureEyeSideRig => ({
    widthScale: widthScale(expression[`width${suffix}`]),
    heightScale: heightScale(expression[`height${suffix}`], blink),
    offsetX:
      direction * spacingShift +
      (expression[`positionX${suffix}`] + eyeOffset.x) / CREATURE_FRAME_HALF_WIDTH,
    offsetY: (expression[`positionY${suffix}`] - BASE_Y + eyeOffset.y) / CREATURE_FRAME_HALF_HEIGHT,
    rotation: ((suffix === 'Left' ? expression.leftAngle : expression.rightAngle) * Math.PI) / 180,
  })

  // Classic expressions encode a strong gaze cue in eye translation. Preserve
  // that cue in Creature mode, while leaving truly neutral/manual poses free to
  // use the Creature engine's natural front -> side -> front idle choreography.
  const gazeX = clamp(avgX / 14.5, -0.94, 0.94)
  const gazeY = clamp(-(avgY - BASE_Y) / 16.5, -0.78, 0.78)

  return {
    left: side('Left', -1),
    right: side('Right', 1),
    gazeX,
    gazeY,
    lockGaze: gazeNeedsLock(expression, avgX, avgY, avgHeight),
  }
}
