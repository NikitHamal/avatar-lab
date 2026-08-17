import type { CreatureEyeFrame } from '@/features/avatar/geometry'
import {
  CREATURE_NATIVE_EYE_CENTER_X,
  CREATURE_NATIVE_EYE_CENTER_Y,
} from '@/features/creature/creatureExpression'

import {
  creatureWasmPaletteIndex,
  type CreatureShape,
  type CreatureShapeKey,
  SHAPE_MAP,
} from './creatureSwatches'

export type RenderPath = {
  path: Path2D
  fillStyle: string
  blend: number // 0 = sclera/base, 1 = background, 2 = clipped pupil/inner slit
  pts: Float32Array
}

export type CreatureEngineInstance = {
  handle: number
  shape: CreatureShape
  paletteIndex: number
  lookX: number
  lookY: number
  targetLookX: number
  targetLookY: number
  destroy: () => void
  setShape: (shape: CreatureShape) => void
  setPalette: (index: number) => void
  setLookDirection: (dx: number, dy: number, isUser?: boolean) => void
  tick: (deltaMs: number) => RenderPath[]
  triggerBlink: () => void
  triggerRandomRotation: () => void
}

let wasmModulePromise: Promise<any> | null = null
let animDataBuffer: Uint8Array | null = null

export async function getCreatureWasmModule(): Promise<any> {
  if (wasmModulePromise) return wasmModulePromise

  wasmModulePromise = (async () => {
    // 1. Fetch anim_data.bin
    const animResp = await fetch('/creature/anim_data.bin')
    if (!animResp.ok) throw new Error(`Failed to load anim_data.bin: ${animResp.status}`)
    const animArrayBuf = await animResp.arrayBuffer()
    animDataBuffer = new Uint8Array(animArrayBuf)

    // 2. Fetch wasm binary
    const wasmResp = await fetch('/creature/animation_renderer.wasm')
    if (!wasmResp.ok) throw new Error(`Failed to load animation_renderer.wasm: ${wasmResp.status}`)
    const wasmBinary = await wasmResp.arrayBuffer()

    // 3. Load animation_renderer.js script
    const scriptResp = await fetch('/creature/animation_renderer.js')
    const scriptCode = await scriptResp.text()

    const Module: any = {
      wasmBinary,
      locateFile: (path: string) => `/creature/${path}`,
    }

    // Evaluate Emscripten module wrapper
    const fn = new Function('Module', `${scriptCode}\nreturn Module;`)
    const m = fn(Module)

    await new Promise<void>(resolve => {
      m.onRuntimeInitialized = () => resolve()
      if (m.calledRun) resolve()
    })

    return m
  })()

  return wasmModulePromise
}

function buildPath2D(floats: Float32Array, offset: number, count: number): Path2D {
  const p = new Path2D()
  const startX = floats[offset]
  const startY = floats[offset + 1]
  if (Number.isNaN(startX) || Number.isNaN(startY)) return p
  p.moveTo(startX, startY)

  for (let j = 1; j + 1 < count; j += 3) {
    const cp1x = floats[offset + j * 2]
    const cp1y = floats[offset + j * 2 + 1]
    const cp2x = floats[offset + (j + 1) * 2]
    const cp2y = floats[offset + (j + 1) * 2 + 1]
    const nextIdx = (j + 2) % count
    const endX = floats[offset + nextIdx * 2]
    const endY = floats[offset + nextIdx * 2 + 1]

    if (
      !Number.isNaN(cp1x) &&
      !Number.isNaN(cp1y) &&
      !Number.isNaN(cp2x) &&
      !Number.isNaN(cp2y) &&
      !Number.isNaN(endX) &&
      !Number.isNaN(endY)
    ) {
      p.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY)
    }
  }

  p.closePath()
  return p
}

const BUFFER_FLOATS = 16384
const BLINK_ANIMS = ['blink', 'blink2', 'blink3']
const ROT_ANIMS = ['rot_1', 'rot_2', 'rot_3', 'rot_4', 'rot3d_1', 'rot3d_2']
const IDLE_ACCENT_ANIMS = ['pup_mov_1', 'pup_mov_2', 'pup_scale']

export async function createCreatureInstance(
  initialShape: CreatureShape = 'cat',
  initialPalette = 52, // seaglass by default
  autonomous = true
): Promise<CreatureEngineInstance> {
  const Module = await getCreatureWasmModule()
  if (!animDataBuffer) throw new Error('animDataBuffer not initialized')

  const handle = Module.ccall('create_renderer_instance', 'number', [], [])
  const dataPtr = Module._malloc(animDataBuffer.length)
  Module.HEAPU8.set(animDataBuffer, dataPtr)
  const initSuccess = Module.ccall(
    'init_renderer_instance_ptr',
    'number',
    ['number', 'number', 'number'],
    [handle, dataPtr, animDataBuffer.length]
  )
  Module._free(dataPtr)

  if (!initSuccess) {
    throw new Error('Failed to initialize creature renderer instance')
  }

  // Set initial shape & palette
  const shapeKey = SHAPE_MAP[initialShape] || 'neutral_c'
  Module.ccall(
    'move_to_state_instance',
    null,
    ['number', 'string', 'boolean', 'boolean'],
    [handle, shapeKey, false, true]
  )
  const normalizedInitialPalette = Math.min(99, Math.max(0, Math.round(initialPalette)))
  Module.ccall(
    'set_palette_instance',
    null,
    ['number', 'number'],
    [handle, creatureWasmPaletteIndex(normalizedInitialPalette)]
  )
  Module.ccall('set_playing_instance', null, ['number', 'boolean'], [handle, true])

  // Play base idle animation (starts facing directly forward)
  Module.ccall(
    'add_playing_animation_instance',
    'number',
    ['number', 'string', 'boolean'],
    [handle, 'idle', true]
  )

  const renderBufPtr = Module._malloc(BUFFER_FLOATS * 4)

  let currentShape = initialShape
  let currentPalette = normalizedInitialPalette
  let lookX = 0
  let lookY = 0
  let targetLookX = 0
  let targetLookY = 0
  let userInteracting = false
  let destroyed = false
  let elapsedMs = 0

  const triggerBlink = () => {
    if (destroyed) return
    const randomBlink = BLINK_ANIMS[Math.floor(Math.random() * BLINK_ANIMS.length)]
    Module.ccall(
      'add_playing_animation_instance',
      'number',
      ['number', 'string', 'boolean'],
      [handle, randomBlink, true]
    )
  }

  const triggerRandomRotation = () => {
    if (destroyed) return
    const randomRot = ROT_ANIMS[Math.floor(Math.random() * ROT_ANIMS.length)]
    Module.ccall(
      'add_playing_animation_instance',
      'number',
      ['number', 'string', 'boolean'],
      [handle, randomRot, true]
    )
  }

  // Natural blink rhythm: mostly single blinks with an occasional soft double blink.
  let blinkTimeout: ReturnType<typeof setTimeout> | null = null
  const scheduleNextBlink = () => {
    if (destroyed) return
    const delay = 2600 + Math.random() * 3900
    blinkTimeout = setTimeout(() => {
      triggerBlink()
      if (Math.random() < 0.14) {
        setTimeout(() => triggerBlink(), 150 + Math.random() * 110)
      }
      scheduleNextBlink()
    }, delay)
  }
  if (autonomous) scheduleNextBlink()

  // Start centered and dwell there. Idle gaze then favors side glances and returns to front.
  let gazeTimeout: ReturnType<typeof setTimeout> | null = null
  let nextHorizontalDirection: -1 | 1 = Math.random() < 0.5 ? -1 : 1
  const scheduleNextGaze = (initial = false) => {
    if (destroyed) return
    const delay = initial ? 2800 + Math.random() * 1200 : 1500 + Math.random() * 2600
    gazeTimeout = setTimeout(() => {
      if (!destroyed && !userInteracting) {
        const choice = Math.random()
        if (choice < 0.56) {
          targetLookX = 0
          targetLookY = 0
        } else if (choice < 0.9) {
          targetLookX = nextHorizontalDirection * (0.28 + Math.random() * 0.34)
          targetLookY = (Math.random() - 0.5) * 0.12
          nextHorizontalDirection = nextHorizontalDirection === -1 ? 1 : -1
        } else {
          targetLookX = (Math.random() - 0.5) * 0.18
          targetLookY = (Math.random() < 0.5 ? -1 : 1) * (0.1 + Math.random() * 0.16)
        }
      }
      scheduleNextGaze()
    }, delay)
  }
  if (autonomous) scheduleNextGaze(true)

  // Small pupil accents keep the face alive without changing its default forward orientation.
  let accentTimeout: ReturnType<typeof setTimeout> | null = null
  const scheduleNextAccent = () => {
    if (destroyed) return
    accentTimeout = setTimeout(
      () => {
        if (!destroyed && !userInteracting) {
          const accent = IDLE_ACCENT_ANIMS[Math.floor(Math.random() * IDLE_ACCENT_ANIMS.length)]
          Module.ccall(
            'add_playing_animation_instance',
            'number',
            ['number', 'string', 'boolean'],
            [handle, accent, true]
          )
        }
        scheduleNextAccent()
      },
      5400 + Math.random() * 6200
    )
  }
  if (autonomous) scheduleNextAccent()

  const instance: CreatureEngineInstance = {
    handle,
    get shape() {
      return currentShape
    },
    get paletteIndex() {
      return currentPalette
    },
    get lookX() {
      return lookX
    },
    get lookY() {
      return lookY
    },
    get targetLookX() {
      return targetLookX
    },
    get targetLookY() {
      return targetLookY
    },
    setShape(shape: CreatureShape) {
      if (destroyed) return
      currentShape = shape
      const key = SHAPE_MAP[shape] || 'neutral_c'
      Module.ccall(
        'move_to_state_instance',
        null,
        ['number', 'string', 'boolean', 'boolean'],
        [handle, key, true, true]
      )
    },
    setPalette(index: number) {
      if (destroyed) return
      const normalized = Math.min(99, Math.max(0, Math.round(index)))
      currentPalette = normalized
      Module.ccall(
        'set_palette_instance',
        null,
        ['number', 'number'],
        [handle, creatureWasmPaletteIndex(normalized)]
      )
    },
    setLookDirection(dx: number, dy: number, isUser = false) {
      targetLookX = Math.max(-1, Math.min(1, dx))
      targetLookY = Math.max(-1, Math.min(1, dy))
      userInteracting = isUser
    },
    tick(deltaMs: number): RenderPath[] {
      if (destroyed) return []

      elapsedMs += deltaMs
      // Smooth gaze tracking interpolation with organic inertia (tau ~ 150ms).
      const factor = 1 - Math.exp(-deltaMs / 150)
      lookX += (targetLookX - lookX) * factor
      lookY += (targetLookY - lookY) * factor

      const idleMicroX = userInteracting
        ? 0
        : Math.sin(elapsedMs / 780) * 0.009 + Math.sin(elapsedMs / 1730) * 0.006
      const idleMicroY = userInteracting
        ? 0
        : Math.cos(elapsedMs / 910) * 0.006 + Math.sin(elapsedMs / 2110) * 0.004

      Module.ccall(
        'set_look_direction_instance',
        null,
        ['number', 'number', 'number'],
        [handle, lookX + idleMicroX, lookY + idleMicroY]
      )
      Module.ccall('tick_instance', null, ['number', 'number'], [handle, deltaMs])
      Module.ccall('update_scene_instance', null, ['number'], [handle])

      const count = Module.ccall(
        'get_render_paths_instance',
        'number',
        ['number', 'number', 'number'],
        [handle, renderBufPtr, BUFFER_FLOATS]
      )

      if (!count) return []

      const floats = new Float32Array(Module.HEAPF32.buffer, renderBufPtr, count)
      const pathCount = floats[0]
      const paths: RenderPath[] = []
      let cursor = 1

      for (let p = 0; p < pathCount; p++) {
        const ptCount = floats[cursor]
        const blend = floats[cursor + 1]
        const r = Math.round(Math.min(255, Math.max(0, floats[cursor + 2] * 255)))
        const g = Math.round(Math.min(255, Math.max(0, floats[cursor + 3] * 255)))
        const b = Math.round(Math.min(255, Math.max(0, floats[cursor + 4] * 255)))
        const a = Math.min(1, Math.max(0, floats[cursor + 5]))
        const pts = floats.slice(cursor + 6, cursor + 6 + ptCount * 2)
        const path = buildPath2D(floats, cursor + 6, ptCount)

        paths.push({
          path,
          fillStyle: `rgba(${r},${g},${b},${a})`,
          blend,
          pts,
        })

        cursor += 6 + ptCount * 2
      }

      return paths
    },
    triggerBlink,
    triggerRandomRotation,
    destroy() {
      if (destroyed) return
      destroyed = true
      if (blinkTimeout) clearTimeout(blinkTimeout)
      if (gazeTimeout) clearTimeout(gazeTimeout)
      if (accentTimeout) clearTimeout(accentTimeout)
      Module._free(renderBufPtr)
      Module.ccall('cleanup_instance', null, ['number'], [handle])
    },
  }

  return instance
}

export type CreatureEyeSide = -1 | 1

export function creaturePathSide(points: Float32Array): CreatureEyeSide {
  const count = Math.floor(points.length / 2)
  if (!count) return 1
  let totalX = 0
  for (let index = 0; index < count; index += 1) totalX += points[index * 2]
  return totalX / count < 200 ? -1 : 1
}

export function creaturePathToSvg(
  points: Float32Array,
  frame: CreatureEyeFrame,
  side: CreatureEyeSide = creaturePathSide(points)
) {
  const count = Math.floor(points.length / 2)
  if (count < 2 || !frame.visible) return ''
  const rig = side < 0 ? frame.rig.left : frame.rig.right
  const anchorX = side * CREATURE_NATIVE_EYE_CENTER_X
  const anchorY = CREATURE_NATIVE_EYE_CENTER_Y
  const cosine = Math.cos(rig.rotation)
  const sine = Math.sin(rig.rotation)

  const mapPoint = (index: number) => {
    const sourceX = (points[index * 2] - 200) / 200
    const sourceY = (points[index * 2 + 1] - 200) / 200
    const localX = (sourceX - anchorX) * rig.widthScale
    const localY = (sourceY - anchorY) * rig.heightScale
    const rotatedX = localX * cosine - localY * sine
    const rotatedY = localX * sine + localY * cosine
    const x = anchorX + rig.offsetX + rotatedX
    const y = anchorY + rig.offsetY + rotatedY
    return [
      frame.center[0] + frame.xAxis[0] * x + frame.yAxis[0] * y,
      frame.center[1] + frame.xAxis[1] * x + frame.yAxis[1] * y,
    ] as const
  }

  const start = mapPoint(0)
  let d = `M${start[0]} ${start[1]}`
  for (let j = 1; j + 1 < count; j += 3) {
    const cp1 = mapPoint(j)
    const cp2 = mapPoint(j + 1)
    const end = mapPoint((j + 2) % count)
    d += `C${cp1[0]} ${cp1[1]} ${cp2[0]} ${cp2[1]} ${end[0]} ${end[1]}`
  }
  return `${d}Z`
}

/**
 * Draws the creature eyes onto a 2D canvas context with perfect dual-layer clipping.
 */
export function drawCreaturePaths(
  ctx: CanvasRenderingContext2D,
  paths: RenderPath[],
  centerX: number,
  centerY: number,
  size: number
) {
  if (!paths.length) return

  // The engine produces paths in a 400x400 normalized coordinate system
  const scale = size / 400
  ctx.save()
  ctx.translate(centerX - 200 * scale, centerY - 200 * scale)
  ctx.scale(scale, scale)

  let clipRegion: Path2D | null = null

  for (const item of paths) {
    ctx.fillStyle = item.fillStyle

    if (item.blend === 2 && clipRegion) {
      // Inner Pupil layer: Clipped strictly inside the outer eye contour!
      ctx.save()
      ctx.clip(clipRegion, 'evenodd')
      ctx.fill(item.path, 'evenodd')
      ctx.restore()
    } else {
      // Outer Sclera / Base Eye layer
      ctx.fill(item.path, 'evenodd')
      if (!clipRegion) clipRegion = new Path2D()
      clipRegion.addPath(item.path)
    }
  }

  ctx.restore()
}
