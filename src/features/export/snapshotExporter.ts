import type { AvatarColors } from '../avatar/avatars'
import type { RenderedScene } from '../rendering/renderedScene'
import {
  resolveNodeFill,
  resolveNodeFilter,
  resolveNodeOpacity,
  serializeNodePaintDefinitions,
} from '../rendering/nodePaint'

export type SnapshotBackground = 'transparent' | 'solid' | 'linear' | 'radial'

export type SnapshotOptions = {
  background: SnapshotBackground
  colorFrom: string
  colorTo: string
  size: number
}

const escapeXml = (value: string) =>
  value.replace(/[&<>"]/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
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
  options: SnapshotOptions
) => {
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
      ? `<path d="${escapeXml(mouthPath)}" stroke="${escapeXml(colors.eyes)}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${mouthOpacity}"/>`
      : ''

  const decalsMarkup = (scene.decals.current ?? [])
    .map(decal => path(decal.path, decal.fill, decal.opacity ?? 1))
    .join('')

  const nodePaintDefs = serializeNodePaintDefinitions(
    scene.nodeStyles.current,
    'snapshot-node',
    colors.body
  )

  const body = [
    backPaths,
    path(headPath, colors.body),
    `<g clip-path="url(#snapshot-head-clip)">${decalsMarkup}${path(scene.leftPath.get(), colors.eyes, scene.leftOpacity.get())}${path(scene.rightPath.get(), colors.eyes, scene.rightOpacity.get())}${mouthMarkup}</g>`,
    frontPaths,
  ].join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-150 -150 300 300" width="${options.size}" height="${options.size}" role="img" aria-label="${escapeXml(name)}">
  <defs>${gradientMarkup(options)}${nodePaintDefs}<clipPath id="snapshot-head-clip"><path d="${escapeXml(headPath)}"/></clipPath></defs>
  ${backgroundMarkup(options)}
  <g transform="translate(${offsetX} ${offsetY})">${body}</g>
</svg>`
}

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
