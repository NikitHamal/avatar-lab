import { useEffect, useId, useRef, useState } from 'react'

import type { CreatureEyeFrame } from '@/features/avatar/geometry'
import {
  createCreatureInstance,
  creaturePathSide,
  creaturePathToSvg,
  type CreatureEngineInstance,
} from '@/features/creature/creatureEngine'
import type { CreatureShape } from '@/features/creature/creatureSwatches'
import type { RenderedCreatureEyePath } from '@/features/rendering/renderedScene'

const PATH_SLOTS = 12

type FrameRef = { current: CreatureEyeFrame }

export function CreatureEyeSvgLayer({
  shape,
  paletteIndex,
  frame,
  interactive = true,
  onReadyChange,
  pathSnapshot,
}: {
  shape: CreatureShape
  paletteIndex: number
  frame: FrameRef
  interactive?: boolean
  onReadyChange?: (ready: boolean) => void
  pathSnapshot?: { current: RenderedCreatureEyePath[] }
}) {
  const groupRef = useRef<SVGGElement>(null)
  const outerRefs = useRef<(SVGPathElement | null)[]>([])
  const outerClipRefs = useRef<(SVGPathElement | null)[]>([])
  const innerRefs = useRef<(SVGPathElement | null)[]>([])
  const [instance, setInstance] = useState<CreatureEngineInstance | null>(null)
  const instanceRef = useRef<CreatureEngineInstance | null>(null)
  const pointerGazeRef = useRef(false)
  const expressionGazeLockedRef = useRef(false)
  instanceRef.current = instance
  const clipId = `creature-eye-clip-${useId().replaceAll(':', '')}`

  useEffect(() => {
    let active = true
    onReadyChange?.(false)
    let created: CreatureEngineInstance | null = null

    createCreatureInstance(shape, paletteIndex)
      .then(next => {
        if (!active) {
          next.destroy()
          return
        }
        created = next
        setInstance(next)
        onReadyChange?.(true)
      })
      .catch(error => {
        onReadyChange?.(false)
        console.error('Failed to create Creature eye layer:', error)
      })

    return () => {
      active = false
      created?.destroy()
    }
  }, [onReadyChange])

  useEffect(() => {
    if (instance && instance.shape !== shape) instance.setShape(shape)
  }, [instance, shape])

  useEffect(() => {
    if (instance && instance.paletteIndex !== paletteIndex) instance.setPalette(paletteIndex)
  }, [instance, paletteIndex])

  useEffect(() => {
    if (!instance) return

    let animationFrame = 0
    let lastTime = performance.now()

    const clearUnused = (refs: { current: (SVGPathElement | null)[] }, from: number) => {
      for (let index = from; index < PATH_SLOTS; index += 1) {
        const element = refs.current[index]
        if (element) element.setAttribute('d', '')
      }
    }

    const render = (time: number) => {
      const deltaMs = Math.min(100, Math.max(1, time - lastTime))
      lastTime = time
      const currentFrame = frame.current
      if (!pointerGazeRef.current) {
        if (currentFrame.rig.lockGaze) {
          instance.setLookDirection(currentFrame.rig.gazeX, currentFrame.rig.gazeY, true)
          expressionGazeLockedRef.current = true
        } else if (expressionGazeLockedRef.current) {
          instance.setLookDirection(0, 0, false)
          expressionGazeLockedRef.current = false
        }
      }
      const paths = instance.tick(deltaMs)
      let outerIndex = 0
      let innerIndex = 0
      const snapshotPaths: RenderedCreatureEyePath[] = []

      for (const item of paths) {
        const side = creaturePathSide(item.pts)
        const d = creaturePathToSvg(item.pts, currentFrame, side)
        if (!d) continue
        snapshotPaths.push({ d, fill: item.fillStyle, blend: item.blend })

        if (item.blend === 2) {
          if (innerIndex >= PATH_SLOTS) continue
          const element = innerRefs.current[innerIndex]
          if (element) {
            element.setAttribute('d', d)
            element.setAttribute('fill', item.fillStyle)
          }
          innerIndex += 1
          continue
        }

        if (outerIndex >= PATH_SLOTS) continue
        const element = outerRefs.current[outerIndex]
        const clipElement = outerClipRefs.current[outerIndex]
        if (element) {
          element.setAttribute('d', d)
          element.setAttribute('fill', item.fillStyle)
        }
        if (clipElement) clipElement.setAttribute('d', d)
        outerIndex += 1
      }

      clearUnused(outerRefs, outerIndex)
      clearUnused(outerClipRefs, outerIndex)
      clearUnused(innerRefs, innerIndex)
      if (pathSnapshot) pathSnapshot.current = snapshotPaths
      if (groupRef.current) {
        groupRef.current.style.opacity = currentFrame.visible && outerIndex > 0 ? '1' : '0'
      }
      animationFrame = requestAnimationFrame(render)
    }

    animationFrame = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(animationFrame)
      if (pathSnapshot) pathSnapshot.current = []
    }
  }, [frame, instance, pathSnapshot])

  useEffect(() => {
    if (!interactive) return

    let releaseTimer: ReturnType<typeof setTimeout> | null = null
    const resetGaze = () => {
      if (releaseTimer) clearTimeout(releaseTimer)
      releaseTimer = null
      pointerGazeRef.current = false
      if (!frame.current.rig.lockGaze) instanceRef.current?.setLookDirection(0, 0, false)
    }
    const scheduleRelease = () => {
      if (releaseTimer) clearTimeout(releaseTimer)
      releaseTimer = setTimeout(resetGaze, 900)
    }
    const onPointerMove = (event: PointerEvent) => {
      const current = instanceRef.current
      const group = groupRef.current
      const svg = group?.ownerSVGElement
      if (!current || !svg || event.buttons !== 0) {
        resetGaze()
        return
      }

      const matrix = svg.getScreenCTM()
      if (!matrix) return
      const center = new DOMPoint(frame.current.center[0], frame.current.center[1]).matrixTransform(
        matrix
      )
      const rectangle = svg.getBoundingClientRect()
      const range = Math.max(96, Math.min(rectangle.width, rectangle.height) * 0.36)
      const distance = Math.hypot(event.clientX - center.x, event.clientY - center.y)
      if (distance > range) {
        resetGaze()
        return
      }

      const dx = (event.clientX - center.x) / (range * 0.82)
      const dy = -(event.clientY - center.y) / (range * 0.82)
      pointerGazeRef.current = true
      current.setLookDirection(dx * 0.62, dy * 0.46, true)
      scheduleRelease()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('blur', resetGaze)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', resetGaze)
      resetGaze()
    }
  }, [frame, interactive])

  return (
    <g ref={groupRef} className="creature-eye-svg-layer" pointerEvents="none" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          {Array.from({ length: PATH_SLOTS }, (_, index) => (
            <path
              key={`clip-${index}`}
              ref={element => {
                outerClipRefs.current[index] = element
              }}
              d=""
              fillRule="evenodd"
              clipRule="evenodd"
            />
          ))}
        </clipPath>
      </defs>
      {Array.from({ length: PATH_SLOTS }, (_, index) => (
        <path
          key={`outer-${index}`}
          ref={element => {
            outerRefs.current[index] = element
          }}
          d=""
          fillRule="evenodd"
        />
      ))}
      <g clipPath={`url(#${clipId})`}>
        {Array.from({ length: PATH_SLOTS }, (_, index) => (
          <path
            key={`inner-${index}`}
            ref={element => {
              innerRefs.current[index] = element
            }}
            d=""
            fillRule="evenodd"
          />
        ))}
      </g>
    </g>
  )
}
