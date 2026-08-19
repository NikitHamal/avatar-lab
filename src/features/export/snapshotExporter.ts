import type { AvatarColors, AvatarEyeRenderer } from '../avatar/avatars'
import type { AvatarVisualEffect } from '../avatar/geometry'
import { avatarEffectSvgMarkup } from '../rendering/avatarEffects'
import type { RenderedScene } from '../rendering/renderedScene'
import {
  resolveNodeFill,
  resolveNodeFilter,
  resolveNodeOpacity,
  serializeNodePaintDefinitions,
} from '../rendering/nodePaint'
import {
  defaultSnapshotComposition,
  normalizeSnapshotComposition,
  snapshotCornerRadius,
  type SnapshotComposition,
} from './snapshotComposition'

export type SnapshotBackground = 'transparent' | 'solid' | 'linear' | 'radial'

export type SnapshotOptions = {
  background: SnapshotBackground
  colorFrom: string
  colorTo: string
  size: number
  composition?: SnapshotComposition
}

export type SnapshotRenderOptions = {
  effect?: AvatarVisualEffect
  elapsedMs?: number
  mouthStrokeWidth?: number
}

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })

const path = (value: string, fill: string, opacity = 1, filter?: string) =>
  value
    ? `<path d="${escapeXml(value)}" fill="${escapeXml(fill)}" opacity="${opacity}"${filter ? ` filter="${escapeXml(filter)}"` : ''}/>`
    : ''

const backgroundMarkup = (options: SnapshotOptions) => {
  if (options.background === 'transparent') return ''
  const fill =
    options.background === 'solid'
      ? options.colorFrom
      : options.background === 'linear'
        ? 'url(#snapshot-linear)'
        : 'url(#snapshot-radial)'
  return `<rect x="-150" y="-150" width="300" height="300" fill="${fill}"/>`
}

const gradientMarkup = (options: SnapshotOptions) => {
  if (options.background === 'linear') {
    return `<linearGradient id="snapshot-linear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${options.colorFrom}"/><stop offset="1" stop-color="${options.colorTo}"/></linearGradient>`
  }
  if (options.background === 'radial') {
    return `<radialGradient id="snapshot-radial" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="${options.colorFrom}"/><stop offset="1" stop-color="${options.colorTo}"/></radialGradient>`
  }
  return ''
}

export const serializeAvatarSnapshot = (
  name: string,
  scene: RenderedScene,
  colors: AvatarColors,
  options: SnapshotOptions,
  eyeRenderer: AvatarEyeRenderer = 'classic',
  renderOptions: SnapshotRenderOptions = {}
) => {
  const composition = normalizeSnapshotComposition(
    options.composition ?? defaultSnapshotComposition
  )
  const headPath = scene.headPath.get()
  const backPaths = scene.backPaths
    .map((item, index) => {
      const p = item.get()
      if (!p) return ''
      const nodeId = scene.backNodeIds.current[index]
      const style = nodeId ? scene.nodeStyles.current[nodeId] : undefined
      const fill = resolveNodeFill(style, colors.body, 'snapshot-node', nodeId) || colors.body
      const opacity = resolveNodeOpacity(style) ?? 1
      const filter = resolveNodeFilter(style, 'snapshot-node', nodeId)
      return path(p, fill, opacity, filter)
    })
    .join('')
  const frontPaths = scene.frontPaths
    .map((item, index) => {
      const p = item.get()
      if (!p) return ''
      const nodeId = scene.frontNodeIds.current[index]
      const style = nodeId ? scene.nodeStyles.current[nodeId] : undefined
      const fill = resolveNodeFill(style, colors.body, 'snapshot-node', nodeId) || colors.body
      const opacity = resolveNodeOpacity(style) ?? 1
      const filter = resolveNodeFilter(style, 'snapshot-node', nodeId)
      return path(p, fill, opacity, filter)
    })
    .join('')
  const offsetX = scene.offsetX.get()
  const offsetY = scene.offsetY.get()
  const mouthPath = scene.mouthPath.get()
  const mouthOpacity = scene.mouthOpacity.get()
  const mouthMarkup =
    mouthPath && mouthOpacity > 0
      ? `<path d="${escapeXml(mouthPath)}" stroke="${escapeXml(colors.eyes)}" stroke-width="${(renderOptions.mouthStrokeWidth ?? 3.2).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${mouthOpacity}"/>`
      : ''

  const decalsMarkup = (scene.decals.current ?? [])
    .map(decal => path(decal.path, decal.fill, decal.opacity ?? 1))
    .join('')

  const nodePaintDefs = serializeNodePaintDefinitions(
    scene.nodeStyles.current,
    'snapshot-node',
    colors.body
  )

  const pupilColor = colors.pupil || colors.eyes
  const leftPupil = scene.leftPupilPath?.get()
  const rightPupil = scene.rightPupilPath?.get()
  const leftPupilMarkup = leftPupil
    ? `<g clip-path="url(#snapshot-left-eye-clip)">${path(leftPupil, pupilColor, scene.leftOpacity.get())}</g>`
    : ''
  const rightPupilMarkup = rightPupil
    ? `<g clip-path="url(#snapshot-right-eye-clip)">${path(rightPupil, pupilColor, scene.rightOpacity.get())}</g>`
    : ''

  const creaturePaths = eyeRenderer === 'creature' ? scene.creatureEyePaths.current : []
  const creatureOuter = creaturePaths.filter(item => item.blend !== 2)
  const creatureInner = creaturePaths.filter(item => item.blend === 2)
  const creatureEyeMarkup = creatureOuter.length
    ? `${creatureOuter.map(item => path(item.d, item.fill)).join('')}<g clip-path="url(#snapshot-creature-eye-clip)">${creatureInner.map(item => path(item.d, item.fill)).join('')}</g>`
    : ''
  const creatureClipDefinition = creatureOuter.length
    ? `<clipPath id="snapshot-creature-eye-clip">${creatureOuter.map(item => `<path d="${escapeXml(item.d)}" fill="white" fill-rule="evenodd" clip-rule="evenodd"/>`).join('')}</clipPath>`
    : ''
  const classicEyeMarkup = `${path(scene.leftPath.get(), colors.eyes, scene.leftOpacity.get())}${leftPupilMarkup}${path(scene.rightPath.get(), colors.eyes, scene.rightOpacity.get())}${rightPupilMarkup}`
  const eyeMarkup = creatureEyeMarkup || classicEyeMarkup

  const effectMarkup = avatarEffectSvgMarkup(renderOptions.effect, renderOptions.elapsedMs ?? 0)

  const orbitalArcs = scene.orbitalArcs?.current ?? []
  const orbitalDefs = orbitalArcs
    .map(
      arc =>
        `<linearGradient id="snapshot-grad-${arc.id}" gradientUnits="userSpaceOnUse" x1="${arc.grad.x1}" y1="${arc.grad.y1}" x2="${arc.grad.x2}" y2="${arc.grad.y2}">${arc.grad.stops
          .map(
            (stopColor, idx) =>
              `<stop offset="${((idx / (arc.grad.stops.length - 1)) * 100).toFixed(1)}%" stop-color="${escapeXml(stopColor)}"/>`
          )
          .join('')}</linearGradient>`
    )
    .join('')
  const orbitalBackMarkup = orbitalArcs
    .filter(arc => arc.back && arc.opacity > 0.01)
    .map(
      arc =>
        `<path d="${escapeXml(arc.back)}" stroke="url(#snapshot-grad-${arc.id})" stroke-width="${arc.width.toFixed(2)}" stroke-linecap="round" fill="none" opacity="${arc.opacity.toFixed(2)}"/>`
    )
    .join('')
  const orbitalFrontMarkup = orbitalArcs
    .filter(arc => arc.front && arc.opacity > 0.01)
    .map(
      arc =>
        `<path d="${escapeXml(arc.front)}" stroke="url(#snapshot-grad-${arc.id})" stroke-width="${arc.width.toFixed(2)}" stroke-linecap="round" fill="none" opacity="${arc.opacity.toFixed(2)}"/>`
    )
    .join('')

  const body = [
    orbitalBackMarkup,
    backPaths,
    path(headPath, colors.body),
    `<g clip-path="url(#snapshot-head-clip)">${decalsMarkup}${eyeMarkup}${mouthMarkup}</g>`,
    frontPaths,
    orbitalFrontMarkup,
  ].join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-150 -150 300 300" width="${options.size}" height="${options.size}" role="img" aria-label="${escapeXml(name)}">
  <defs>${gradientMarkup(options)}${nodePaintDefs}${orbitalDefs}<clipPath id="snapshot-frame-clip"><rect x="-150" y="-150" width="300" height="300" rx="${snapshotCornerRadius(composition.cornerRadius)}"/></clipPath><clipPath id="snapshot-head-clip"><path d="${escapeXml(headPath)}"/></clipPath><clipPath id="snapshot-left-eye-clip"><path d="${escapeXml(scene.leftPath.get())}"/></clipPath><clipPath id="snapshot-right-eye-clip"><path d="${escapeXml(scene.rightPath.get())}"/></clipPath>${creatureClipDefinition}</defs>
  <g clip-path="url(#snapshot-frame-clip)">
    ${backgroundMarkup(options)}
    <g transform="translate(${composition.x} ${composition.y}) scale(${composition.scale})"><g transform="translate(${offsetX} ${offsetY})">${body}</g></g>${effectMarkup}
  </g>
</svg>`
}

export const serializePixelSnapshot = (name: string, imageDataUrl: string, size: number) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${escapeXml(name)}">
  <image href="${escapeXml(imageDataUrl)}" width="${size}" height="${size}" image-rendering="pixelated"/>
</svg>`

export const snapshotFileName = (name: string, extension: 'svg' | 'png' = 'svg') => {
  const slug =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'avatar'
  return `${slug}-snapshot.${extension}`
}
