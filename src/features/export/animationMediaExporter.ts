import {
  ambientBodyOffset,
  ambientEyeOffset,
  applyAmbientBodyMotion,
} from '../avatar/ambientMotion'
import { applyAvatarEyeDefaults, type AvatarColors, type StudioAvatar } from '../avatar/avatars'
import {
  expressionFields,
  poseFromExpression,
  renderAvatar,
  type Expression,
  type ExpressionNumericField,
} from '../avatar/geometry'
import type { AvatarSequence, SequenceTransition } from '../animation/sequences'
import { GifEncoder } from './gifEncoder'
import { avatarEffectSvgMarkup } from '../rendering/avatarEffects'
import { createCreatureInstance, creaturePathSide, creaturePathToSvg } from '../creature/creatureEngine'
import type { CreatureShape } from '../creature/creatureSwatches'
import type { CreatureEyeFrame } from '../avatar/geometry'
import { canUseFastWebmEncoder, encodeCanvasFramesToWebm } from './webmVideoEncoder'
import type { SnapshotBackground } from './snapshotExporter'
import {
  resolveNodeFill,
  resolveNodeFilter,
  resolveNodeOpacity,
  serializeNodePaintDefinitions,
} from '../rendering/nodePaint'

export type AnimationMediaFormat = 'gif' | 'webm' | 'mp4'
export type AnimationExportQuality = 'fast' | 'balanced' | 'high'

export type AnimationMediaOptions = {
  format: AnimationMediaFormat
  size: number
  fps: number
  background: SnapshotBackground
  colorFrom: string
  colorTo: string
  loops?: number
  quality?: AnimationExportQuality
  playbackRate?: number
}

export type AnimationExportProgress = (progress: number, label: string) => void

export const defaultAnimationMediaOptions: AnimationMediaOptions = {
  format: 'gif',
  size: 512,
  fps: 24,
  background: 'transparent',
  colorFrom: '#0d1117',
  colorTo: '#1e293b',
  loops: 1,
  quality: 'balanced',
  playbackRate: 1.15,
}

const escapeXml = (value: string) =>
  value.replace(/[&<>"]/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const easeTransition = (progress: number, transition: SequenceTransition) => {
  const p = clamp01(progress)
  if (transition === 'smooth') return p * p * (3 - 2 * p)
  if (transition === 'snappy') return 1 - (1 - p) ** 3
  // spring
  return 1 - Math.exp(-6 * p) * Math.cos(8 * p)
}

const nearestAngle = (target: number, current: number) => {
  let resolved = target
  while (resolved - current > 180) resolved -= 360
  while (resolved - current < -180) resolved += 360
  return resolved
}

const parseHex = (color: string): [number, number, number] => {
  const cleaned = color.replace('#', '').trim()
  const hex =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map(c => c + c)
          .join('')
      : cleaned
  const numeric = Number.parseInt(hex || '000000', 16)
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255]
}

const interpolateColor = (fromHex: string, toHex: string, progress: number): string => {
  const p = clamp01(progress)
  const from = parseHex(fromHex)
  const to = parseHex(toHex)
  const r = Math.round(from[0] + (to[0] - from[0]) * p)
  const g = Math.round(from[1] + (to[1] - from[1]) * p)
  const b = Math.round(from[2] + (to[2] - from[2]) * p)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

const pathMarkup = (d: string, fill: string, opacity = 1, filter?: string) =>
  d
    ? `<path d="${escapeXml(d)}" fill="${escapeXml(fill)}"${opacity < 1 ? ` opacity="${opacity}"` : ''}${filter ? ` filter="${escapeXml(filter)}"` : ''}/>`
    : ''

const backgroundMarkup = (options: AnimationMediaOptions) => {
  if (options.background === 'transparent') return ''
  const fill =
    options.background === 'solid'
      ? options.colorFrom
      : options.background === 'linear'
        ? 'url(#anim-linear)'
        : 'url(#anim-radial)'
  return `<rect x="-150" y="-150" width="300" height="300" fill="${fill}"/>`
}

const gradientMarkup = (options: AnimationMediaOptions) => {
  if (options.background === 'linear') {
    return `<linearGradient id="anim-linear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${options.colorFrom}"/><stop offset="1" stop-color="${options.colorTo}"/></linearGradient>`
  }
  if (options.background === 'radial') {
    return `<radialGradient id="anim-radial" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="${options.colorFrom}"/><stop offset="1" stop-color="${options.colorTo}"/></radialGradient>`
  }
  return ''
}

export type SampledAnimationFrame = {
  svg: string
  delayMs: number
  elapsedMs: number
  creatureEyeFrame?: CreatureEyeFrame
  creatureShape?: CreatureShape
  fallbackEyeMarkup?: string
}

/**
 * Samples all discrete animation frames over time for a given avatar sequence.
 */
export const sampleAnimationFrames = (
  avatar: StudioAvatar,
  sequence: AvatarSequence,
  expressions: Expression[],
  options: AnimationMediaOptions
): SampledAnimationFrame[] => {
  const expressionById = new Map(
    expressions.map(exp => [exp.id, applyAvatarEyeDefaults(exp, avatar.eyes)])
  )

  const steps = sequence.steps.filter(step => expressionById.has(step.expressionId))
  if (!steps.length) {
    const fallbackExp = expressions[0] ?? {
      id: 'default',
      headX: 0,
      headY: 0,
      headZ: 0,
      widthLeft: 30,
      widthRight: 30,
      heightLeft: 38,
      heightRight: 38,
      spacing: 50,
      positionXLeft: -25,
      positionXRight: 25,
      positionYLeft: 0,
      positionYRight: 0,
      leftAngle: 0,
      rightAngle: 0,
      perspective: 0.08,
      eyeMotion: 'none',
      bodyMotion: 'none',
    }
    const renderFallbackExpression = avatar.mouthEnabled
      ? fallbackExp
      : { ...fallbackExp, mouth: 'none' as const }
    const pose = poseFromExpression(renderFallbackExpression)
    const scene = renderAvatar(pose, avatar.body.primary, 1, { bodyNodes: avatar.body.nodes })
    const paintPrefix = 'frame-node-0'
    const nodePaintDefs = serializeNodePaintDefinitions(
      scene.nodeStyles,
      paintPrefix,
      avatar.colors.body
    )
    const renderNodes = (paths: string[], ids: (string | null)[]) =>
      paths
        .map((pathValue, index) => {
          const nodeId = ids[index]
          const style = nodeId ? scene.nodeStyles[nodeId] : undefined
          const fill =
            resolveNodeFill(style, avatar.colors.body, paintPrefix, nodeId) || avatar.colors.body
          return pathMarkup(
            pathValue,
            fill,
            resolveNodeOpacity(style) ?? 1,
            resolveNodeFilter(style, paintPrefix, nodeId)
          )
        })
        .join('')
    const mouthMarkup =
      avatar.mouthEnabled && scene.mouthVisible && scene.mouthPath
        ? `<path d="${escapeXml(scene.mouthPath)}" stroke="${escapeXml(avatar.colors.eyes)}" stroke-width="${(renderFallbackExpression.mouthStrokeWidth ?? 3.2).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
        : ''

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-150 -150 300 300" width="${options.size}" height="${options.size}">
  <defs>${gradientMarkup(options)}${nodePaintDefs}<clipPath id="frame-clip-0"><path d="${escapeXml(scene.headPath)}"/></clipPath></defs>
  ${backgroundMarkup(options)}
  <g>${renderNodes(scene.backPaths, scene.backNodeIds)}${pathMarkup(scene.headPath, avatar.colors.body)}<g clip-path="url(#frame-clip-0)">${scene.leftVisible ? pathMarkup(scene.leftPath, avatar.colors.eyes) : ''}${scene.rightVisible ? pathMarkup(scene.rightPath, avatar.colors.eyes) : ''}${mouthMarkup}</g>${renderNodes(scene.frontPaths, scene.frontNodeIds)}</g>
</svg>`
    return [{ svg, delayMs: 1000, elapsedMs: 0 }]
  }

  // Build step timelines
  type StepTimeline = {
    stepIndex: number
    expression: Expression
    nextExpression: Expression
    holdMs: number
    transitionMs: number
    transition: SequenceTransition
    startMs: number
    transitionStartMs: number
    endMs: number
  }

  const stepList: StepTimeline[] = []
  let accumulatedMs = 0

  // If playbackMode is pingPong, we expand steps forward then backward
  const expandedSteps =
    sequence.playbackMode === 'pingPong' && steps.length > 2
      ? [...steps, ...steps.slice(1, -1).reverse()]
      : steps

  const numLoops = Math.max(1, options.loops || 1)
  const playbackRate = Math.max(0.5, Math.min(2, options.playbackRate || 1))

  for (let loop = 0; loop < numLoops; loop++) {
    for (let i = 0; i < expandedSteps.length; i++) {
      const step = expandedSteps[i]
      const exp = expressionById.get(step.expressionId)!
      const isFinalOnceStep = sequence.playbackMode === 'once' && loop === numLoops - 1 && i === expandedSteps.length - 1
      const nextStep = isFinalOnceStep ? step : expandedSteps[(i + 1) % expandedSteps.length]
      const nextExp = expressionById.get(nextStep.expressionId)!

      const hold = Math.max(20, step.holdMs / playbackRate)
      // Sequence transitionMs describes the transition *into* a step. While sampling from an
      // already established first frame, the transition that follows this hold therefore belongs
      // to the next step. One-shot sequences intentionally dwell on their final expression.
      const transition = isFinalOnceStep ? 0 : Math.max(0, nextStep.transitionMs / playbackRate)
      const startMs = accumulatedMs
      const transitionStartMs = startMs + hold
      const endMs = transitionStartMs + transition
      accumulatedMs = endMs

      stepList.push({
        stepIndex: i,
        expression: exp,
        nextExpression: nextExp,
        holdMs: hold,
        transitionMs: transition,
        transition: isFinalOnceStep ? step.transition : nextStep.transition,
        startMs,
        transitionStartMs,
        endMs,
      })
    }
  }

  const totalDurationMs = Math.max(100, accumulatedMs)
  const quality = options.quality ?? 'balanced'
  const requestedFps = Math.max(1, Number(options.fps) || 24)
  // GIF encoding cost grows brutally with both resolution and frame count. Keep the authored
  // timing, but avoid sampling visually redundant frames by quality tier. Video can stay denser
  // because WebCodecs handles it off the main playback clock.
  const maxSamplingFps =
    options.format === 'gif'
      ? quality === 'fast' ? 12 : quality === 'high' ? 30 : 18
      : quality === 'fast' ? 24 : quality === 'high' ? 60 : 30
  const effectiveFps = Math.min(requestedFps, maxSamplingFps)
  const requestedIntervalMs = Math.max(16, 1000 / effectiveFps)
  const baseFrameBudget =
    options.format === 'gif'
      ? quality === 'fast' ? 140 : quality === 'high' ? 420 : 240
      : quality === 'fast' ? 520 : quality === 'high' ? 2200 : 1200
  const gifResolutionScale =
    options.format !== 'gif' ? 1 : options.size >= 1024 ? 0.55 : options.size >= 768 ? 0.75 : 1
  const frameBudget = Math.max(80, Math.round(baseFrameBudget * gifResolutionScale))
  const frameIntervalMs = Math.max(16, Math.round(Math.max(requestedIntervalMs, totalDurationMs / frameBudget)))
  const frames: SampledAnimationFrame[] = []

  const blinkSettings = sequence.blink
  const blinkInterval = blinkSettings.enabled
    ? (blinkSettings.minIntervalMs + blinkSettings.maxIntervalMs) / 2
    : 4000
  const blinkDuration = blinkSettings.durationMs || 160

  let frameCounter = 0
  let stepCursor = 0

  for (let t = 0; t < totalDurationMs; t += frameIntervalMs) {
    frameCounter++
    while (stepCursor < stepList.length - 1 && t >= stepList[stepCursor].endMs) stepCursor += 1
    const currentStep = stepList[stepCursor] || stepList[stepList.length - 1]

    let interpolated: Expression
    let bodyColor = currentStep.expression.bodyColor || avatar.colors.body
    let eyeColor = currentStep.expression.eyeColor || avatar.colors.eyes

    if (t < currentStep.transitionStartMs || currentStep.transitionMs <= 0) {
      interpolated = { ...currentStep.expression }
    } else {
      const rawProgress = (t - currentStep.transitionStartMs) / currentStep.transitionMs
      const progress = easeTransition(rawProgress, currentStep.transition)
      const from = currentStep.expression
      const to = currentStep.nextExpression

      const blended: Partial<Expression> = {
        id: `interp-${t}`,
        eyeMotion: to.eyeMotion !== 'none' ? to.eyeMotion : from.eyeMotion,
        bodyMotion: to.bodyMotion !== 'none' ? to.bodyMotion : from.bodyMotion,
        eyeStyle: progress >= 0.5 ? to.eyeStyle ?? from.eyeStyle : from.eyeStyle ?? to.eyeStyle,
        mouth: progress >= 0.5 ? to.mouth ?? from.mouth : from.mouth ?? to.mouth,
        effect: progress >= 0.16 ? to.effect ?? 'none' : from.effect ?? 'none',
      }
      const optionalMouthFields = [
        'mouthScale', 'mouthOffsetX', 'mouthOffsetY', 'mouthWidth', 'mouthCurve', 'mouthStrokeWidth',
      ] as const
      optionalMouthFields.forEach(field => {
        const fromValue = from[field] ?? (field === 'mouthOffsetX' || field === 'mouthOffsetY' ? 0 : field === 'mouthStrokeWidth' ? 3.2 : 1)
        const toValue = to[field] ?? (field === 'mouthOffsetX' || field === 'mouthOffsetY' ? 0 : field === 'mouthStrokeWidth' ? 3.2 : 1)
        blended[field] = fromValue + (toValue - fromValue) * progress
      })

      // Angles need nearest-angle resolution
      const targetHeadX = nearestAngle(to.headX, from.headX)
      const targetHeadY = nearestAngle(to.headY, from.headY)
      const targetHeadZ = nearestAngle(to.headZ, from.headZ)
      const targetLeftAngle = nearestAngle(to.leftAngle, from.leftAngle)
      const targetRightAngle = nearestAngle(to.rightAngle, from.rightAngle)

      blended.headX = from.headX + (targetHeadX - from.headX) * progress
      blended.headY = from.headY + (targetHeadY - from.headY) * progress
      blended.headZ = from.headZ + (targetHeadZ - from.headZ) * progress
      blended.leftAngle = from.leftAngle + (targetLeftAngle - from.leftAngle) * progress
      blended.rightAngle = from.rightAngle + (targetRightAngle - from.rightAngle) * progress

      for (const field of expressionFields) {
        if (
          field !== 'headX' &&
          field !== 'headY' &&
          field !== 'headZ' &&
          field !== 'leftAngle' &&
          field !== 'rightAngle'
        ) {
          const fromVal = from[field as ExpressionNumericField]
          const toVal = to[field as ExpressionNumericField]
          blended[field as ExpressionNumericField] = fromVal + (toVal - fromVal) * progress
        }
      }

      const fromBody = from.bodyColor || avatar.colors.body
      const toBody = to.bodyColor || avatar.colors.body
      const fromEye = from.eyeColor || avatar.colors.eyes
      const toEye = to.eyeColor || avatar.colors.eyes

      bodyColor = interpolateColor(fromBody, toBody, progress)
      eyeColor = interpolateColor(fromEye, toEye, progress)

      interpolated = blended as Expression
    }

    // Compute blinks
    let blinkAmount = 1
    if (blinkSettings.enabled) {
      const initialDelay = Math.max(0, blinkSettings.initialDelayMs || 600)
      const cycleTime = t >= initialDelay ? (t - initialDelay) % blinkInterval : Number.POSITIVE_INFINITY
      if (cycleTime < blinkDuration) {
        const blinkProgress = cycleTime / blinkDuration
        // Dip to 0 (closed) and back up to 1
        blinkAmount =
          Math.sin(blinkProgress * Math.PI) > 0.5
            ? 0.05
            : 1 - Math.sin(blinkProgress * Math.PI) * 0.95
      }
    }

    // Apply ambient motion
    const ambientExpression = applyAmbientBodyMotion(interpolated, t)
    const renderExpression = avatar.mouthEnabled
      ? ambientExpression
      : { ...ambientExpression, mouth: 'none' as const }
    const bodyOffset = ambientBodyOffset(interpolated, t)
    const eyeOffset = ambientEyeOffset(interpolated, t)

    const pose = poseFromExpression(renderExpression)
    const scene = renderAvatar(pose, avatar.body.primary, blinkAmount, {
      bodyNodes: avatar.body.nodes,
      eyeOffset,
    })

    const clipId = `frame-clip-${frameCounter}`
    const offsetX = (bodyOffset.x || 0).toFixed(2)
    const offsetY = (bodyOffset.y || 0).toFixed(2)

    const backPathsMarkup = scene.backPaths
      .map((p, index) => {
        const nodeId = scene.backNodeIds[index]
        const style = nodeId ? scene.nodeStyles[nodeId] : undefined
        const paintPrefix = `frame-node-${frameCounter}`
        const fill = resolveNodeFill(style, bodyColor, paintPrefix, nodeId) || bodyColor
        const opacity = resolveNodeOpacity(style) ?? 1
        const filter = resolveNodeFilter(style, paintPrefix, nodeId)
        return pathMarkup(p, fill, opacity, filter)
      })
      .join('')

    const frontPathsMarkup = scene.frontPaths
      .map((p, index) => {
        const nodeId = scene.frontNodeIds[index]
        const style = nodeId ? scene.nodeStyles[nodeId] : undefined
        const paintPrefix = `frame-node-${frameCounter}`
        const fill = resolveNodeFill(style, bodyColor, paintPrefix, nodeId) || bodyColor
        const opacity = resolveNodeOpacity(style) ?? 1
        const filter = resolveNodeFilter(style, paintPrefix, nodeId)
        return pathMarkup(p, fill, opacity, filter)
      })
      .join('')

    const mouthMarkup =
      avatar.mouthEnabled && scene.mouthVisible && scene.mouthPath
        ? `<path d="${escapeXml(scene.mouthPath)}" stroke="${escapeXml(eyeColor)}" stroke-width="${(renderExpression.mouthStrokeWidth ?? 3.2).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
        : ''
    const fallbackEyeMarkup = `${scene.leftVisible ? pathMarkup(scene.leftPath, eyeColor) : ''}${scene.rightVisible ? pathMarkup(scene.rightPath, eyeColor) : ''}`
    const classicEyeMarkup = avatar.eyeRenderer === 'creature' ? '<!--CREATURE_EYES-->' : fallbackEyeMarkup
    const effectMarkup = avatarEffectSvgMarkup(renderExpression.effect, t)

    const decalsMarkup = (scene.decals ?? [])
      .map(decal => pathMarkup(decal.path, decal.fill, decal.opacity ?? 1))
      .join('')

    const nodePaintDefs = serializeNodePaintDefinitions(
      scene.nodeStyles,
      `frame-node-${frameCounter}`,
      bodyColor
    )

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-150 -150 300 300" width="${options.size}" height="${options.size}">
  <defs>${gradientMarkup(options)}${nodePaintDefs}<clipPath id="${clipId}"><path d="${escapeXml(scene.headPath)}"/></clipPath><!--CREATURE_EYE_DEFS--></defs>
  ${backgroundMarkup(options)}
  <g transform="translate(${offsetX} ${offsetY})">${backPathsMarkup}${pathMarkup(scene.headPath, bodyColor)}<g clip-path="url(#${clipId})">${decalsMarkup}${classicEyeMarkup}${mouthMarkup}</g>${frontPathsMarkup}</g>${effectMarkup}
</svg>`

    frames.push({
      svg,
      delayMs: frameIntervalMs,
      elapsedMs: t,
      creatureEyeFrame: avatar.eyeRenderer === 'creature' ? scene.creatureEyeFrame : undefined,
      creatureShape: avatar.eyeRenderer === 'creature'
        ? ((renderExpression.eyeStyle ?? avatar.eyes.eyeStyle ?? 'dot') as CreatureShape)
        : undefined,
      fallbackEyeMarkup,
    })
  }

  return frames
}

const hydrateCreatureEyeFrames = async (
  avatar: StudioAvatar,
  frames: SampledAnimationFrame[],
  onProgress?: AnimationExportProgress
): Promise<SampledAnimationFrame[]> => {
  if (avatar.eyeRenderer !== 'creature' || !frames.some(frame => frame.creatureEyeFrame)) return frames

  const firstShape = frames.find(frame => frame.creatureShape)?.creatureShape ?? 'dot'
  let instance: Awaited<ReturnType<typeof createCreatureInstance>> | null = null
  try {
    instance = await createCreatureInstance(firstShape, avatar.creaturePaletteIndex, false)
    return frames.map((frame, index) => {
      const eyeFrame = frame.creatureEyeFrame
      const shape = frame.creatureShape ?? firstShape
      if (!eyeFrame) {
        return {
          ...frame,
          svg: frame.svg
            .replace('<!--CREATURE_EYE_DEFS-->', '')
            .replace('<!--CREATURE_EYES-->', frame.fallbackEyeMarkup ?? ''),
        }
      }

      if (instance!.shape !== shape) instance!.setShape(shape)
      if (eyeFrame.rig.lockGaze) {
        instance!.setLookDirection(eyeFrame.rig.gazeX, eyeFrame.rig.gazeY, true)
      } else {
        instance!.setLookDirection(0, 0, false)
      }
      const paths = instance!.tick(Math.max(1, frame.delayMs))
      const outer: { d: string; fill: string }[] = []
      const inner: { d: string; fill: string }[] = []
      paths.forEach(item => {
        const d = creaturePathToSvg(item.pts, eyeFrame, creaturePathSide(item.pts))
        if (!d) return
        const target = item.blend === 2 ? inner : outer
        target.push({ d, fill: item.fillStyle })
      })

      const clipId = `creature-export-clip-${index}`
      const defs = outer.length
        ? `<clipPath id="${clipId}">${outer.map(item => `<path d="${escapeXml(item.d)}" fill-rule="evenodd" clip-rule="evenodd"/>`).join('')}</clipPath>`
        : ''
      const eyes = outer.length
        ? `${outer.map(item => pathMarkup(item.d, item.fill)).join('')}<g clip-path="url(#${clipId})">${inner.map(item => pathMarkup(item.d, item.fill)).join('')}</g>`
        : frame.fallbackEyeMarkup ?? ''

      if (onProgress && (index % 12 === 0 || index === frames.length - 1)) {
        const percent = Math.round(((index + 1) / frames.length) * 12)
        onProgress(percent, `Préparation des yeux expressifs (${percent}%)...`)
      }
      return {
        ...frame,
        svg: frame.svg.replace('<!--CREATURE_EYE_DEFS-->', defs).replace('<!--CREATURE_EYES-->', eyes),
      }
    })
  } catch (error) {
    console.warn('Creature export hydration failed; using classic eye fallback.', error)
    return frames.map(frame => ({
      ...frame,
      svg: frame.svg
        .replace('<!--CREATURE_EYE_DEFS-->', '')
        .replace('<!--CREATURE_EYES-->', frame.fallbackEyeMarkup ?? ''),
    }))
  } finally {
    instance?.destroy()
  }
}

const prepareAnimationFrames = async (
  avatar: StudioAvatar,
  sequence: AvatarSequence,
  expressions: Expression[],
  options: AnimationMediaOptions,
  onProgress?: AnimationExportProgress
) => hydrateCreatureEyeFrames(avatar, sampleAnimationFrames(avatar, sequence, expressions, options), onProgress)

/**
 * Loads an SVG string and draws it onto a canvas.
 */
export const renderSvgToCanvas = async (
  svgString: string,
  canvas: HTMLCanvasElement,
  size: number,
  context?: CanvasRenderingContext2D
): Promise<void> => {
  const ctx = context ?? canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  ctx.clearRect(0, 0, size, size)

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      ctx.drawImage(bitmap, 0, 0, size, size)
      bitmap.close()
      return
    } catch {
      // Safari and older Chromium builds can reject SVG blobs here; use the Image fallback below.
    }
  }

  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = url
    })
    ctx.drawImage(img, 0, 0, size, size)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Exports an individual animation to an animated GIF Blob.
 */
export const exportAnimationToGif = async (
  avatar: StudioAvatar,
  sequence: AvatarSequence,
  expressions: Expression[],
  options: AnimationMediaOptions,
  onProgress?: AnimationExportProgress
): Promise<{ blob: Blob; filename: string }> => {
  const size = Number(options.size) || 512
  const frames = await prepareAnimationFrames(avatar, sequence, expressions, options, onProgress)
  const encoder = new GifEncoder(size, size)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not create Canvas 2D context')

  const total = frames.length
  const transparent = options.background === 'transparent'

  for (let i = 0; i < total; i++) {
    const frame = frames[i]
    await renderSvgToCanvas(frame.svg, canvas, size, ctx)
    const imageData = ctx.getImageData(0, 0, size, size)

    encoder.addFrame(imageData.data, {
      delayMs: frame.delayMs,
      transparent,
    })

    if (onProgress) {
      const percent = Math.round(((i + 1) / total) * 100)
      onProgress(percent, `Génération du GIF (${percent}%)...`)
    }
  }

  const blob = encoder.toBlob()
  const filename = animationMediaFileName(avatar.name, sequence.name, 'gif')
  return { blob, filename }
}

/**
 * Exports an individual animation to WebM/MP4. WebM prefers an offline WebCodecs path;
 * MediaRecorder remains the compatibility path when the browser cannot encode offline.
 */
export const exportAnimationToVideo = async (
  avatar: StudioAvatar,
  sequence: AvatarSequence,
  expressions: Expression[],
  options: AnimationMediaOptions,
  onProgress?: AnimationExportProgress
): Promise<{ blob: Blob; filename: string }> => {
  const size = Number(options.size) || 512
  const requestedFps = Number(options.fps) || 24
  const frames = await prepareAnimationFrames(avatar, sequence, expressions, options, onProgress)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not create Canvas 2D context')

  const sampledFps = frames[0]?.delayMs
    ? Math.max(1, Math.min(requestedFps, Math.round(1000 / frames[0].delayMs)))
    : requestedFps

  // WebM gets a true offline encode path: frames are rasterized and handed directly to
  // WebCodecs, so a four-second intro does not have to spend four wall-clock seconds recording.
  if (options.format === 'webm' && (await canUseFastWebmEncoder(size, size, sampledFps))) {
    try {
      const blob = await encodeCanvasFramesToWebm({
        canvas,
        fps: sampledFps,
        frames: frames.map(frame => ({
          timestampMs: frame.elapsedMs,
          durationMs: frame.delayMs,
          draw: () => renderSvgToCanvas(frame.svg, canvas, size, ctx),
        })),
        onFrame: (index, total) => {
          if (!onProgress) return
          const percent = 12 + Math.round((index / total) * 88)
          onProgress(percent, `Encodage WebM accéléré (${percent}%)...`)
        },
      })
      return { blob, filename: animationMediaFileName(avatar.name, sequence.name, 'webm') }
    } catch (error) {
      console.warn('Fast WebM export failed; falling back to MediaRecorder.', error)
    }
  }

  // Compatibility path for MP4 and browsers without WebCodecs. MediaRecorder timestamps are
  // wall-clock based, so it still runs in real time, but the refined sequence timing and frame
  // budget keep this fallback substantially shorter than the legacy exporter.
  const isMp4 = options.format === 'mp4'
  let mimeType = 'video/webm;codecs=vp9'
  if (isMp4 && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
    mimeType = 'video/mp4;codecs=avc1'
  } else if (isMp4 && MediaRecorder.isTypeSupported('video/mp4')) {
    mimeType = 'video/mp4'
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
    mimeType = 'video/webm;codecs=vp9'
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
    mimeType = 'video/webm;codecs=vp8'
  } else if (MediaRecorder.isTypeSupported('video/webm')) {
    mimeType = 'video/webm'
  } else {
    mimeType = ''
  }

  const stream = canvas.captureStream(sampledFps)
  const quality = options.quality ?? 'balanced'
  const bitsPerSecond = quality === 'fast' ? 4_000_000 : quality === 'high' ? 12_000_000 : 7_000_000
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond })
    : new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) chunks.push(event.data)
  }
  const recordPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = event => reject(event)
    recorder.onstop = () =>
      resolve(
        new Blob(chunks, {
          type: recorder.mimeType || (isMp4 ? 'video/mp4' : 'video/webm'),
        })
      )
  })

  recorder.start()
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]
    await renderSvgToCanvas(frame.svg, canvas, size, ctx)
    if (onProgress) {
      const percent = 12 + Math.round(((index + 1) / frames.length) * 86)
      onProgress(percent, `Enregistrement de compatibilité (${percent}%)...`)
    }
    await new Promise(resolve => setTimeout(resolve, Math.max(1, frame.delayMs)))
  }

  recorder.stop()
  const blob = await recordPromise
  stream.getTracks().forEach(track => track.stop())
  const extension = recorder.mimeType?.includes('mp4') ? 'mp4' : 'webm'
  onProgress?.(100, 'Export terminé.')
  return { blob, filename: animationMediaFileName(avatar.name, sequence.name, extension) }
}

/**
 * Creates a clean slugged file name for animation media downloads.
 */
export const animationMediaFileName = (
  avatarName: string,
  sequenceName: string,
  extension: string
): string => {
  const clean = (val: string) =>
    val
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'avatar'

  const aSlug = clean(avatarName)
  const sSlug = clean(sequenceName)
  return `${aSlug}-${sSlug}.${extension.toLowerCase()}`
}

/**
 * Helper to download any Blob in the browser.
 */
export const downloadMediaBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
