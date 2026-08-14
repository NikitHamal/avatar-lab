import type { StudioAvatar } from './avatars'
import { MAX_BODY_NODES, type BodyNode } from './body'
import { surfacePresets, type SurfaceType } from './surfaces'

const remixSurfaces: SurfaceType[] = [
  'sphere',
  'egg',
  'bean',
  'pebble',
  'droplet',
  'heart',
  'cube',
  'capsule',
  'diamond',
  'pyramid',
]

const palettes = [
  ['#6d5dfc', '#f8f7ff'],
  ['#111827', '#67e8f9'],
  ['#ff7a59', '#2b1510'],
  ['#0f766e', '#ecfeff'],
  ['#e879f9', '#3b0764'],
  ['#facc15', '#422006'],
  ['#60a5fa', '#071a2f'],
  ['#86efac', '#163a2a'],
  ['#fb7185', '#4c0519'],
  ['#f5f3ff', '#312e81'],
] as const

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const jitter = (amount: number) => (Math.random() * 2 - 1) * amount
const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]

export const createAvatarRemix = (source: StudioAvatar, intensity = 0.55): StudioAvatar => {
  const strength = clamp(intensity, 0.1, 1)
  const avatar = structuredClone(source)
  const palette = pick(palettes)
  const shouldSwapSurface = Math.random() < 0.28 * strength
  const targetType = shouldSwapSurface ? pick(remixSurfaces) : avatar.body.primary.type
  const targetPreset = surfacePresets[targetType]
  const current = avatar.body.primary
  const base = shouldSwapSurface ? targetPreset : current

  avatar.id = `avatar-${crypto.randomUUID()}`
  avatar.name = `${source.name} Remix`
  avatar.body.primary = {
    ...base,
    width: clamp(base.width * (1 + jitter(0.11 * strength)), 90, 280),
    height: clamp(base.height * (1 + jitter(0.12 * strength)), 90, 290),
    depth: clamp(base.depth * (1 + jitter(0.1 * strength)), 70, 270),
    roundness: clamp((base.roundness ?? 1) + jitter(0.25 * strength), 0, 2),
  }
  avatar.colors = { body: palette[0], eyes: palette[1] }
  avatar.eyes = {
    ...avatar.eyes,
    widthLeft: clamp(avatar.eyes.widthLeft + jitter(7 * strength), 12, 54),
    widthRight: clamp(avatar.eyes.widthRight + jitter(7 * strength), 12, 54),
    heightLeft: clamp(avatar.eyes.heightLeft + jitter(9 * strength), 10, 58),
    heightRight: clamp(avatar.eyes.heightRight + jitter(9 * strength), 10, 58),
    spacing: clamp(avatar.eyes.spacing + jitter(10 * strength), 18, 70),
    positionYLeft: clamp(avatar.eyes.positionYLeft + jitter(7 * strength), -34, 26),
    positionYRight: clamp(avatar.eyes.positionYRight + jitter(7 * strength), -34, 26),
    leftAngle: clamp(avatar.eyes.leftAngle + jitter(10 * strength), -32, 32),
    rightAngle: clamp(avatar.eyes.rightAngle + jitter(10 * strength), -32, 32),
  }
  avatar.body.nodes = avatar.body.nodes.slice(0, MAX_BODY_NODES).map((node, index): BodyNode => ({
    ...node,
    position: [
      node.position[0] * (1 + jitter(0.055 * strength)),
      node.position[1] * (1 + jitter(0.055 * strength)),
      node.position[2] + jitter(8 * strength),
    ] as const,
    rotation: [
      node.rotation[0] + jitter(5 * strength),
      node.rotation[1] + jitter(5 * strength),
      node.rotation[2] + jitter(8 * strength),
    ] as const,
    color:
      node.color && Math.random() < 0.42 * strength
        ? index % 2 === 0
          ? palette[0]
          : palette[1]
        : node.color,
  }))
  return avatar
}
