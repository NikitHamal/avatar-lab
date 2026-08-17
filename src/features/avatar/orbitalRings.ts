export type OrbitalArcSeed = {
  a: number
  k: number
  tilt: number
  speed: number
  phase: number
  sweep: number
  hue: number
  hueSpan: number
  width: number
  cx: number
  cy: number
}

export type RenderedOrbitalArc = {
  id: string
  front: string
  back: string
  width: number
  opacity: number
  grad: {
    x1: number
    y1: number
    x2: number
    y2: number
    stops: [string, string, string]
  }
}

const TAU = Math.PI * 2

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const round2 = (n: number) => Math.round(n * 100) / 100

// Exact Bloub color generator: zo(hue, sat = 0.55, light = 0.62)
export function bloubColor(hue: number, sat = 0.55, light = 0.62): string {
  const r = ((hue % 360) + 360) % 360
  const i = (1 - Math.abs(2 * light - 1)) * sat
  const a = i * (1 - Math.abs(((r / 60) % 2) - 1))
  const o = light - i / 2
  let s = 0,
    c = 0,
    l = 0
  if (r < 60) {
    s = i
    c = a
  } else if (r < 120) {
    s = a
    c = i
  } else if (r < 180) {
    c = i
    l = a
  } else if (r < 240) {
    c = a
    l = i
  } else if (r < 300) {
    s = a
    l = i
  } else {
    s = i
    l = a
  }
  const toHex = (val: number) =>
    Math.round((val + o) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(s)}${toHex(c)}${toHex(l)}`
}

// Exact Bloub 3D arc evaluator: Bo(seed, t, scale, id, opacity)
export function computeOrbitalArc(
  seed: OrbitalArcSeed,
  timeSec: number,
  scale: number,
  id: string,
  opacity = 1
): RenderedOrbitalArc {
  const angle = seed.phase + timeSec * seed.speed * TAU
  const cosTilt = Math.cos(seed.tilt)
  const sinTilt = Math.sin(seed.tilt)
  const kz = Math.sqrt(Math.max(0, 1 - seed.k * seed.k))
  const sweepAngle = seed.sweep * TAU

  let frontPath = ''
  let backPath = ''
  let wasBehind: boolean | null = null

  const STEPS = 64
  for (let i = 0; i <= STEPS; i++) {
    const theta = angle + (i / STEPS) * sweepAngle
    const cosTheta = Math.cos(theta)
    const sinTheta = Math.sin(theta)

    const x = seed.a * (cosTheta * cosTilt + sinTheta * -sinTilt * seed.k) + seed.cx
    const y = seed.a * (cosTheta * sinTilt + sinTheta * cosTilt * seed.k) + seed.cy
    const isBehind = seed.a * sinTheta * kz < 0

    const px = round2(x * scale)
    const py = round2(y * scale)
    const cmd = isBehind === wasBehind ? 'L' : 'M'

    if (isBehind) {
      backPath += `${cmd}${px} ${py}`
    } else {
      frontPath += `${cmd}${px} ${py}`
    }
    wasBehind = isBehind
  }

  const gradPx = Math.cos(seed.tilt) * seed.a * scale
  const gradPy = Math.sin(seed.tilt) * seed.a * scale

  return {
    id,
    front: frontPath,
    back: backPath,
    width: Math.max(1, seed.width * scale),
    opacity,
    grad: {
      x1: round2(seed.cx * scale - gradPx),
      y1: round2(seed.cy * scale - gradPy),
      x2: round2(seed.cx * scale + gradPx),
      y2: round2(seed.cy * scale + gradPy),
      stops: [
        bloubColor(seed.hue),
        bloubColor(seed.hue + seed.hueSpan * 0.5),
        bloubColor(seed.hue + seed.hueSpan),
      ],
    },
  }
}

// Exact seeded Ho array from Bloub (Ro(659918))
export const ORBIT_RING_SEEDS: readonly OrbitalArcSeed[] = [
  {
    a: 1.3743155926233157,
    k: 0.27493661139160397,
    tilt: 0.11163715459406376,
    speed: 3.5312514966120943,
    phase: 3.5215805556682933,
    sweep: 0.7452879050048068,
    hue: 4.53815097687766,
    hueSpan: 63.32831121515483,
    width: 0.0526062230002135,
    cx: 0,
    cy: 0.1,
  },
  {
    a: 1.3478030681610107,
    k: 0.3169440078549087,
    tilt: 1.0093109920668266,
    speed: 3.4112522192532198,
    phase: 6.146908005905841,
    sweep: 0.6468076598481275,
    hue: 81.64599264739081,
    hueSpan: 66.51980398222804,
    width: 0.06018400430120528,
    cx: 0,
    cy: 0.1,
  },
  {
    a: 1.396025489922613,
    k: 0.40733767822384837,
    tilt: 1.1039764153167309,
    speed: 3.6806644265307114,
    phase: 1.0627643605614534,
    sweep: 0.8412599016679451,
    hue: 149.84371276572347,
    hueSpan: 61.366802947595716,
    width: 0.056177541773766285,
    cx: 0,
    cy: 0.1,
  },
  {
    a: 1.3853965060785414,
    k: 0.3961880846880376,
    tilt: 1.9961215903193246,
    speed: 3.015525759500451,
    phase: 1.1164722730487298,
    sweep: 0.6740480975364335,
    hue: 185.79063047189265,
    hueSpan: 108.99123252835125,
    width: 0.051692712741903964,
    cx: 0,
    cy: 0.1,
  },
  {
    a: 1.3750752961495891,
    k: 0.41330388756468894,
    tilt: 2.554288128433131,
    speed: 3.306340780830942,
    phase: 5.341917949124536,
    sweep: 0.8341249540331773,
    hue: 269.8505696724169,
    hueSpan: 73.29493375495076,
    width: 0.05261907224263996,
    cx: 0,
    cy: 0.1,
  },
  {
    a: 1.3038241447415204,
    k: 0.3598543989472091,
    tilt: 3.0157889269994764,
    speed: 3.219781908742152,
    phase: 2.6741883493986927,
    sweep: 0.6721552689792588,
    hue: 327.09959444822744,
    hueSpan: 87.62834109831601,
    width: 0.055451622528955344,
    cx: 0,
    cy: 0.1,
  },
]

// Exact Uo array from Bloub
export const PLAY_ARC_SEEDS: readonly OrbitalArcSeed[] = [
  {
    a: 0.78,
    k: 0.05,
    tilt: -0.62,
    speed: 0.3,
    phase: 0,
    sweep: 0.4,
    hue: 95,
    hueSpan: 100,
    width: 0.05,
    cx: 0,
    cy: -0.12,
  },
  {
    a: 0.98,
    k: 0.07,
    tilt: -0.57,
    speed: 0.3,
    phase: 0.06,
    sweep: 0.4,
    hue: 157,
    hueSpan: 100,
    width: 0.05,
    cx: 0,
    cy: -0.12,
  },
  {
    a: 1.18,
    k: 0.09,
    tilt: -0.52,
    speed: 0.3,
    phase: 0.12,
    sweep: 0.4,
    hue: 219,
    hueSpan: 100,
    width: 0.05,
    cx: 0,
    cy: -0.12,
  },
  {
    a: 1.38,
    k: 0.11,
    tilt: -0.47,
    speed: 0.3,
    phase: 0.18,
    sweep: 0.4,
    hue: 281,
    hueSpan: 100,
    width: 0.05,
    cx: 0,
    cy: -0.12,
  },
]

export function evaluateOrbitArcs(
  timeSec: number,
  scale = 120,
  baseOpacity = 1
): RenderedOrbitalArc[] {
  const loopT = ((timeSec % 3.4) + 3.4) % 3.4
  const envelope = clamp01(loopT / 0.8) * clamp01((3.6 - loopT) / 0.9) * baseOpacity
  if (envelope < 0.005) return []

  return ORBIT_RING_SEEDS.map((seed, i) => {
    const stagger = clamp01((loopT - i * 0.13) / 0.3)
    return computeOrbitalArc(seed, timeSec, scale, `orbit-${i}`, envelope * stagger)
  })
}

export function evaluatePlayArcs(
  timeSec: number,
  scale = 120,
  baseOpacity = 1
): RenderedOrbitalArc[] {
  const loopT = ((timeSec % 2.0) + 2.0) % 2.0
  const envelope = clamp01(loopT / 0.35) * clamp01((2.2 - loopT) / 0.5) * baseOpacity
  if (envelope < 0.005) return []

  return PLAY_ARC_SEEDS.map((seed, i) => {
    const shiftedSeed: OrbitalArcSeed = {
      ...seed,
      cx: 0.45 - loopT * 0.42,
    }
    return computeOrbitalArc(shiftedSeed, timeSec, scale, `play-${i}`, envelope)
  })
}
