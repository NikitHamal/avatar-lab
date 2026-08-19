import type { AvatarVisualEffect } from '../avatar/geometry'

const CONFETTI_COLORS = ['#ff4d8d', '#ffd166', '#38d9a9', '#5b8cff', '#a970ff', '#ff7a45']
const TAU = Math.PI * 2

const hash01 = (seed: number) => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

const starPath = (cx: number, cy: number, radius: number) => {
  const points: string[] = []
  for (let index = 0; index < 8; index += 1) {
    const angle = -Math.PI / 2 + (index / 8) * TAU
    const r = index % 2 === 0 ? radius : radius * 0.34
    points.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`)
  }
  return `M${points.join(' L')} Z`
}

const heartPath = (cx: number, cy: number, scale: number) =>
  `M${cx} ${cy + 7 * scale} C${cx - 18 * scale} ${cy - 4 * scale} ${cx - 12 * scale} ${cy - 20 * scale} ${cx} ${cy - 10 * scale} C${cx + 12 * scale} ${cy - 20 * scale} ${cx + 18 * scale} ${cy - 4 * scale} ${cx} ${cy + 7 * scale}Z`

export function AvatarEffectLayer({ effect = 'none' }: { effect?: AvatarVisualEffect }) {
  if (!effect || effect === 'none') return null

  if (effect === 'confetti') {
    return (
      <g className="avatar-effect avatar-effect-confetti" pointerEvents="none" aria-hidden="true">
        {Array.from({ length: 22 }, (_, index) => {
          const x = -138 + hash01(index + 1) * 276
          const startY = -160 - hash01(index + 31) * 90
          const duration = 1.35 + hash01(index + 71) * 1.05
          const delay = -hash01(index + 103) * duration
          const rotation = 180 + Math.round(hash01(index + 151) * 540)
          const width = 5 + hash01(index + 191) * 5
          const height = 2.8 + hash01(index + 211) * 3
          return (
            <g key={index}>
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`0 ${startY};0 155`}
                dur={`${duration}s`}
                begin={`${delay}s`}
                repeatCount="indefinite"
              />
              <rect
                x={x}
                y="0"
                width={width}
                height={height}
                rx="1.5"
                fill={CONFETTI_COLORS[index % CONFETTI_COLORS.length]}
                opacity="0.95"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values={`0 ${x} 0;${rotation} ${x} 0`}
                  dur={`${duration * 0.72}s`}
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.08;0.82;1"
                  dur={`${duration}s`}
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
              </rect>
            </g>
          )
        })}
      </g>
    )
  }

  if (effect === 'sparkles' || effect === 'introGlow') {
    const positions = [
      [-104, -78, 10],
      [108, -55, 8],
      [-118, 45, 7],
      [112, 64, 11],
      [78, -112, 6],
    ] as const
    return (
      <g
        className={`avatar-effect avatar-effect-${effect}`}
        pointerEvents="none"
        aria-hidden="true"
      >
        {effect === 'introGlow' && (
          <>
            <circle
              cx="0"
              cy="0"
              r="126"
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="2"
              opacity="0.16"
            >
              <animate attributeName="r" values="112;136;112" dur="2.4s" repeatCount="indefinite" />
              <animate
                attributeName="opacity"
                values="0.05;0.24;0.05"
                dur="2.4s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx="0"
              cy="0"
              r="136"
              fill="none"
              stroke="#bae6fd"
              strokeWidth="1"
              opacity="0.1"
            >
              <animate attributeName="r" values="126;146;126" dur="3.2s" repeatCount="indefinite" />
            </circle>
          </>
        )}
        {positions.map(([x, y, radius], index) => (
          <path
            key={index}
            d={starPath(x, y, radius)}
            fill={CONFETTI_COLORS[(index + 1) % CONFETTI_COLORS.length]}
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              values={`0 ${x} ${y};180 ${x} ${y};360 ${x} ${y}`}
              dur={`${1.1 + index * 0.17}s`}
              begin={`${index * -0.21}s`}
              repeatCount="indefinite"
              additive="sum"
            />
            <animate
              attributeName="opacity"
              values="0.2;1;0.2"
              dur={`${1.1 + index * 0.17}s`}
              begin={`${index * -0.21}s`}
              repeatCount="indefinite"
            />
          </path>
        ))}
      </g>
    )
  }

  if (effect === 'hearts') {
    return (
      <g className="avatar-effect avatar-effect-hearts" pointerEvents="none" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => {
          const x = -88 + index * 29 + (index % 2 ? 8 : -4)
          const startY = 106 + (index % 3) * 10
          const endY = -116 - (index % 2) * 16
          const duration = 1.9 + (index % 3) * 0.35
          return (
            <path
              key={index}
              d={heartPath(x, startY, 0.58 + (index % 3) * 0.11)}
              fill={index % 2 ? '#ff4d8d' : '#ff7aa8'}
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`0 0;${index % 2 ? 10 : -10} ${endY - startY}`}
                dur={`${duration}s`}
                begin={`${index * -0.28}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;0.9;0.9;0"
                keyTimes="0;0.15;0.75;1"
                dur={`${duration}s`}
                begin={`${index * -0.28}s`}
                repeatCount="indefinite"
              />
            </path>
          )
        })}
      </g>
    )
  }

  if (effect === 'alert') {
    return (
      <g className="avatar-effect avatar-effect-alert" pointerEvents="none" aria-hidden="true">
        <circle cx="0" cy="0" r="126" fill="none" stroke="#ffd166" strokeWidth="4" opacity="0.1">
          <animate attributeName="r" values="112;142" dur="0.9s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0" dur="0.9s" repeatCount="indefinite" />
        </circle>
        <path d="M0 -140 L-8 -122 L8 -122 Z" fill="#ffd166">
          <animate
            attributeName="opacity"
            values="0.25;1;0.25"
            dur="0.72s"
            repeatCount="indefinite"
          />
        </path>
      </g>
    )
  }

  if (effect === 'successBurst') {
    return (
      <g className="avatar-effect avatar-effect-success" pointerEvents="none" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index / 12) * TAU
          const x1 = Math.cos(angle) * 112
          const y1 = Math.sin(angle) * 112
          const x2 = Math.cos(angle) * 137
          const y2 = Math.sin(angle) * 137
          return (
            <line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={CONFETTI_COLORS[index % CONFETTI_COLORS.length]}
              strokeWidth="4"
              strokeLinecap="round"
            >
              <animate
                attributeName="opacity"
                values="0.2;1;0.2"
                dur="0.9s"
                begin={`${index * -0.04}s`}
                repeatCount="indefinite"
              />
            </line>
          )
        })}
      </g>
    )
  }

  if (effect === 'errorPulse') {
    return (
      <g className="avatar-effect avatar-effect-error" pointerEvents="none" aria-hidden="true">
        <circle cx="0" cy="0" r="126" fill="none" stroke="#ff5f6d" strokeWidth="4">
          <animate attributeName="opacity" values="0;0.72;0" dur="0.56s" repeatCount="indefinite" />
          <animate attributeName="r" values="116;138" dur="0.56s" repeatCount="indefinite" />
        </circle>
      </g>
    )
  }

  if (effect === 'zzz' || effect === 'question') {
    const text = effect === 'zzz' ? 'Z' : '?'
    return (
      <g
        className={`avatar-effect avatar-effect-${effect}`}
        pointerEvents="none"
        aria-hidden="true"
        fill="#64748b"
      >
        {[0, 1, 2].map(index => (
          <text
            key={index}
            x={76 + index * 20}
            y={-78 - index * 22}
            fontSize={18 + index * 5}
            fontWeight="700"
            textAnchor="middle"
            opacity="0.72"
          >
            {text}
            <animate
              attributeName="opacity"
              values="0.18;0.85;0.18"
              dur={`${1.7 + index * 0.25}s`}
              begin={`${index * -0.3}s`}
              repeatCount="indefinite"
            />
          </text>
        ))}
      </g>
    )
  }

  return null
}

export { avatarEffectSvgMarkup } from '../avatar/avatarEffectsMarkup'
