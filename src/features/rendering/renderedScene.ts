import { motionValue, type MotionValue } from 'motion'

import type { AvatarColors } from '../avatar/avatars'
import { MAX_BODY_NODES } from '../avatar/body'
import type { AvatarGeometry, AvatarNodeStyle, DecalPath } from '../avatar/geometry'

const bodyPathSlots = MAX_BODY_NODES + 2
const decalPathSlots = 4

export type RenderedScene = {
  headPath: MotionValue<string>
  backPaths: MotionValue<string>[]
  frontPaths: MotionValue<string>[]
  backNodeIds: { current: (string | null)[] }
  frontNodeIds: { current: (string | null)[] }
  nodeStyles: { current: Record<string, AvatarNodeStyle> }
  decals: { current: DecalPath[] }
  decalPaths: MotionValue<string>[]
  decalFills: { current: string[] }
  decalOpacities: { current: number[] }
  leftPath: MotionValue<string>
  rightPath: MotionValue<string>
  leftOpacity: MotionValue<number>
  rightOpacity: MotionValue<number>
  mouthPath: MotionValue<string>
  mouthOpacity: MotionValue<number>
  offsetX: MotionValue<number>
  offsetY: MotionValue<number>
  wirePaths: MotionValue<string>[]
}

export type RenderedColors = {
  body: MotionValue<string>
  eyes: MotionValue<string>
}

export const createRenderedColors = (colors: AvatarColors): RenderedColors => ({
  body: motionValue(colors.body),
  eyes: motionValue(colors.eyes),
})

export const paintRenderedColors = (rendered: RenderedColors, colors: AvatarColors) => {
  rendered.body.set(colors.body)
  rendered.eyes.set(colors.eyes)
}

export const paintRenderedOffset = (scene: RenderedScene, offset: { x: number; y: number }) => {
  scene.offsetX.set(offset.x)
  scene.offsetY.set(offset.y)
}

export const createRenderedScene = (geometry: AvatarGeometry): RenderedScene => ({
  headPath: motionValue(geometry.headPath),
  backPaths: Array.from({ length: bodyPathSlots }, (_, index) =>
    motionValue(geometry.backPaths[index] ?? '')
  ),
  frontPaths: Array.from({ length: bodyPathSlots }, (_, index) =>
    motionValue(geometry.frontPaths[index] ?? '')
  ),
  backNodeIds: { current: geometry.backNodeIds },
  frontNodeIds: { current: geometry.frontNodeIds },
  nodeStyles: { current: geometry.nodeStyles ?? {} },
  decals: { current: geometry.decals ?? [] },
  decalPaths: Array.from({ length: decalPathSlots }, (_, index) =>
    motionValue(geometry.decals[index]?.path ?? '')
  ),
  decalFills: { current: (geometry.decals ?? []).map(d => d.fill) },
  decalOpacities: { current: (geometry.decals ?? []).map(d => d.opacity ?? 1) },
  leftPath: motionValue(geometry.leftPath),
  rightPath: motionValue(geometry.rightPath),
  leftOpacity: motionValue(geometry.leftVisible ? 1 : 0),
  rightOpacity: motionValue(geometry.rightVisible ? 1 : 0),
  mouthPath: motionValue(geometry.mouthPath ?? ''),
  mouthOpacity: motionValue(geometry.mouthVisible ? 1 : 0),
  offsetX: motionValue(0),
  offsetY: motionValue(0),
  wirePaths: geometry.wirePaths.map(path => motionValue(path)),
})

export const paintRenderedScene = (scene: RenderedScene, geometry: AvatarGeometry) => {
  scene.headPath.set(geometry.headPath)
  scene.backNodeIds.current = geometry.backNodeIds
  scene.frontNodeIds.current = geometry.frontNodeIds
  scene.nodeStyles.current = geometry.nodeStyles ?? {}
  scene.decals.current = geometry.decals ?? []
  scene.decalPaths.forEach((path, index) => path.set(geometry.decals[index]?.path ?? ''))
  scene.decalFills.current = (geometry.decals ?? []).map(d => d.fill)
  scene.decalOpacities.current = (geometry.decals ?? []).map(d => d.opacity ?? 1)
  scene.backPaths.forEach((path, index) => path.set(geometry.backPaths[index] ?? ''))
  scene.frontPaths.forEach((path, index) => path.set(geometry.frontPaths[index] ?? ''))
  scene.leftPath.set(geometry.leftPath)
  scene.rightPath.set(geometry.rightPath)
  scene.leftOpacity.set(geometry.leftVisible ? 1 : 0)
  scene.rightOpacity.set(geometry.rightVisible ? 1 : 0)
  scene.mouthPath.set(geometry.mouthPath ?? '')
  scene.mouthOpacity.set(geometry.mouthVisible ? 1 : 0)
  scene.wirePaths.forEach((path, index) => path.set(geometry.wirePaths[index] ?? ''))
}

export const findBodyNodePath = (scene: RenderedScene, selectedBodyNodeId: 'primary' | string) => {
  if (selectedBodyNodeId === 'primary') return scene.headPath
  const backIndex = scene.backNodeIds.current.indexOf(selectedBodyNodeId)
  if (backIndex >= 0) return scene.backPaths[backIndex]
  const frontIndex = scene.frontNodeIds.current.indexOf(selectedBodyNodeId)
  return frontIndex >= 0 ? scene.frontPaths[frontIndex] : null
}
