import type { AvatarVisualEffect } from './geometry'

export const CONFETTI_COLORS = ['#ff4d8d', '#ffd166', '#38d9a9', '#5b8cff', '#a970ff', '#ff7a45']
const TAU = Math.PI * 2

export const hash01 = (seed: number) => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

export const starPath = (cx: number, cy: number, radius: number) => {
  const points: string[] = []
  for (let index = 0; index < 8; index += 1) {
    const angle = -Math.PI / 2 + (index / 8) * TAU
    const r = index % 2 === 0 ? radius : radius * 0.34
    points.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`)
  }
  return `M${points.join(' L')} Z`
}

export const heartPath = (cx: number, cy: number, scale: number) =>
  `M${cx} ${cy + 7 * scale} C${cx - 18 * scale} ${cy - 4 * scale} ${cx - 12 * scale} ${cy - 20 * scale} ${cx} ${cy - 10 * scale} C${cx + 12 * scale} ${cy - 20 * scale} ${cx + 18 * scale} ${cy - 4 * scale} ${cx} ${cy + 7 * scale}Z`

export const avatarEffectSvgMarkup = (
  effect: AvatarVisualEffect | undefined,
  elapsedMs: number = 0
) => {
  if (!effect || effect === 'none') return ''
  const time = elapsedMs / 1000

  if (effect === 'confetti') {
    return Array.from({ length: 22 }, (_, index) => {
      const xBase = -138 + hash01(index + 1) * 276
      const speed = 95 + hash01(index + 31) * 85
      const y = ((-170 + speed * time + hash01(index + 71) * 260 + 180) % 350) - 180
      const sway = Math.sin(time * (2.2 + hash01(index + 91) * 2.4) + index) * 10
      const rotation = (time * (180 + hash01(index + 111) * 420) + index * 37) % 360
      const width = 5 + hash01(index + 131) * 5
      const height = 2.8 + hash01(index + 151) * 3
      return `<rect x="${(xBase + sway).toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="1.5" fill="${CONFETTI_COLORS[index % CONFETTI_COLORS.length]}" opacity="0.94" transform="rotate(${rotation.toFixed(2)} ${(xBase + sway).toFixed(2)} ${y.toFixed(2)})"/>`
    }).join('')
  }

  if (effect === 'hearts') {
    return Array.from({ length: 7 }, (_, index) => {
      const progress = (time / (1.9 + (index % 3) * 0.35) + index * 0.17) % 1
      const x = -88 + index * 29 + Math.sin(progress * TAU + index) * 8
      const y = 112 - progress * 238
      const opacity = Math.sin(Math.min(1, progress) * Math.PI) * 0.9
      return `<path d="${heartPath(x, y, 0.58 + (index % 3) * 0.11)}" fill="${index % 2 ? '#ff4d8d' : '#ff7aa8'}" opacity="${opacity.toFixed(3)}"/>`
    }).join('')
  }

  if (effect === 'sparkles' || effect === 'introGlow') {
    const positions = [
      [-104, -78, 10],
      [108, -55, 8],
      [-118, 45, 7],
      [112, 64, 11],
      [78, -112, 6],
    ]
    const rings =
      effect === 'introGlow'
        ? `<circle cx="0" cy="0" r="${(124 + Math.sin(time * 2.4) * 10).toFixed(2)}" fill="none" stroke="#93c5fd" stroke-width="2" opacity="0.18"/><circle cx="0" cy="0" r="${(136 + Math.cos(time * 1.9) * 8).toFixed(2)}" fill="none" stroke="#60a5fa" stroke-width="1" opacity="0.12"/>`
        : ''
    return (
      rings +
      positions
        .map((entry, index) => {
          const [x, y, r] = entry
          const pulse = 0.72 + (Math.sin(time * (4 + index * 0.33) + index) + 1) * 0.22
          return `<path d="${starPath(x, y, r * pulse)}" fill="${CONFETTI_COLORS[(index + 1) % CONFETTI_COLORS.length]}" opacity="${(0.45 + pulse * 0.45).toFixed(3)}"/>`
        })
        .join('')
    )
  }

  if (effect === 'alert') {
    const phase = (time % 0.9) / 0.9
    return `<circle cx="0" cy="0" r="${(112 + phase * 30).toFixed(2)}" fill="none" stroke="#ffd166" stroke-width="4" opacity="${(0.55 * (1 - phase)).toFixed(3)}"/><path d="M0 -140 L-8 -122 L8 -122 Z" fill="#ffd166" opacity="${(0.55 + Math.sin(time * 8.5) * 0.35).toFixed(3)}"/>`
  }

  if (effect === 'successBurst') {
    return Array.from({ length: 12 }, (_, index) => {
      const angle = (index / 12) * TAU
      const pulse = 0.45 + (Math.sin(time * 6.4 - index * 0.2) + 1) * 0.25
      return `<line x1="${(Math.cos(angle) * 112).toFixed(2)}" y1="${(Math.sin(angle) * 112).toFixed(2)}" x2="${(Math.cos(angle) * 137).toFixed(2)}" y2="${(Math.sin(angle) * 137).toFixed(2)}" stroke="${CONFETTI_COLORS[index % CONFETTI_COLORS.length]}" stroke-width="4" stroke-linecap="round" opacity="${pulse.toFixed(3)}"/>`
    }).join('')
  }

  if (effect === 'errorPulse') {
    const phase = (time % 0.56) / 0.56
    return `<circle cx="0" cy="0" r="${(116 + phase * 22).toFixed(2)}" fill="none" stroke="#ff5f6d" stroke-width="4" opacity="${(0.72 * Math.sin(phase * Math.PI)).toFixed(3)}"/>`
  }

  if (effect === 'zzz' || effect === 'question') {
    const text = effect === 'zzz' ? 'Z' : '?'
    return [0, 1, 2]
      .map(
        index =>
          `<text x="${76 + index * 20}" y="${-78 - index * 22}" font-size="${18 + index * 5}" font-weight="700" text-anchor="middle" fill="#64748b" opacity="${(0.45 + Math.sin(time * (2.2 + index * 0.2) + index) * 0.25).toFixed(3)}">${text}</text>`
      )
      .join('')
  }

  return ''
}
