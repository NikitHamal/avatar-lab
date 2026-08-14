import type { AvatarNodeStyle } from '../avatar/geometry'

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-')

export const nodeGradientId = (prefix: string, nodeId: string) =>
  `${safeId(prefix)}-${safeId(nodeId)}-paint`

export const nodeFilterId = (prefix: string, nodeId: string) =>
  `${safeId(prefix)}-${safeId(nodeId)}-filter`

export const nodeUsesGradient = (style?: AvatarNodeStyle) =>
  Boolean(
    style &&
    style.color &&
    (style.colorTo ||
      style.gradientType === 'linear' ||
      style.gradientType === 'radial' ||
      style.gradientType === 'glow' ||
      style.material === 'metallic' ||
      style.material === 'glass')
  )

export const resolveNodeFill = (
  style: AvatarNodeStyle | undefined,
  fallback: string | undefined,
  prefix: string,
  nodeId: string | null | undefined
) => {
  if (!style || !nodeId) return fallback
  if (nodeUsesGradient(style)) return `url(#${nodeGradientId(prefix, nodeId)})`
  return style.color || fallback
}

export const resolveNodeOpacity = (style?: AvatarNodeStyle) => {
  if (!style) return undefined
  if (typeof style.opacity === 'number') return style.opacity
  if (style.material === 'glass') return 0.76
  return undefined
}

export const nodeShouldGlow = (style?: AvatarNodeStyle) =>
  style?.material === 'glow' || style?.gradientType === 'glow'

const escapeSvgAttribute = (value: string) =>
  value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return entities[character]
  })

export const serializeNodePaintDefinitions = (
  styles: Record<string, AvatarNodeStyle>,
  prefix: string,
  fallback: string
) =>
  Object.entries(styles)
    .map(([nodeId, style]) => {
      const definitions: string[] = []
      if (nodeUsesGradient(style)) {
        const id = nodeGradientId(prefix, nodeId)
        const from = escapeSvgAttribute(style.color || fallback)
        const to = escapeSvgAttribute(
          style.colorTo || (style.material === 'metallic' ? '#f8fafc' : style.color || fallback)
        )
        if (style.gradientType === 'radial' || style.gradientType === 'glow') {
          definitions.push(
            `<radialGradient id="${id}" cx="34%" cy="28%" r="74%"><stop offset="0" stop-color="${to}"/><stop offset="0.58" stop-color="${from}"/><stop offset="1" stop-color="${escapeSvgAttribute(style.colorTo || style.color || fallback)}"/></radialGradient>`
          )
        } else {
          const first = escapeSvgAttribute(
            style.material === 'metallic' ? '#f8fafc' : style.color || fallback
          )
          definitions.push(
            `<linearGradient id="${id}" x1="12%" y1="8%" x2="88%" y2="92%"><stop offset="0" stop-color="${first}"/><stop offset="0.48" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`
          )
        }
      }
      if (nodeShouldGlow(style)) {
        const filterId = nodeFilterId(prefix, nodeId)
        definitions.push(
          `<filter id="${filterId}" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="4.5" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
        )
      }
      return definitions.join('')
    })
    .join('')

export const resolveNodeFilter = (
  style: AvatarNodeStyle | undefined,
  prefix: string,
  nodeId: string | null | undefined
) =>
  style && nodeId && nodeShouldGlow(style) ? `url(#${nodeFilterId(prefix, nodeId)})` : undefined
