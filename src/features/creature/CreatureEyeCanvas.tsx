import { useEffect, useRef, useState } from 'react'
import {
  createCreatureInstance,
  drawCreaturePaths,
  type CreatureEngineInstance,
} from './creatureEngine'
import { CREATURE_COLORWAYS, type CreatureShape } from './creatureSwatches'

export type CreatureEyeCanvasProps = {
  shape?: CreatureShape
  paletteIndex?: number
  size?: number
  interactive?: boolean
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export function CreatureEyeCanvas({
  shape = 'cat',
  paletteIndex = 52, // seaglass
  size = 320,
  interactive = true,
  className = '',
  style = {},
  onClick,
}: CreatureEyeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [instance, setInstance] = useState<CreatureEngineInstance | null>(null)
  const instanceRef = useRef<CreatureEngineInstance | null>(null)
  instanceRef.current = instance

  // Initialize engine instance
  useEffect(() => {
    let active = true
    let created: CreatureEngineInstance | null = null

    createCreatureInstance(shape, paletteIndex)
      .then(inst => {
        if (!active) {
          inst.destroy()
          return
        }
        created = inst
        setInstance(inst)
      })
      .catch(err => {
        console.error('Failed to create Creature instance:', err)
      })

    return () => {
      active = false
      if (created) created.destroy()
    }
  }, [])

  // Sync shape prop changes
  useEffect(() => {
    if (instance && instance.shape !== shape) {
      instance.setShape(shape)
    }
  }, [instance, shape])

  // Sync paletteIndex prop changes
  useEffect(() => {
    if (instance && instance.paletteIndex !== paletteIndex) {
      instance.setPalette(paletteIndex)
    }
  }, [instance, paletteIndex])

  // Animation render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !instance) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let lastTime = performance.now()

    const render = (time: number) => {
      const deltaMs = Math.min(100, Math.max(1, time - lastTime))
      lastTime = time

      const dpr = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr
        canvas.height = height * dpr
      }

      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      // Draw creature body circle (always black)
      const radius = Math.min(width, height) * 0.46
      ctx.beginPath()
      ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2)
      ctx.fillStyle = '#000000'
      ctx.fill()

      const paths = instance.tick(deltaMs)
      const renderSize = Math.min(width, height) * 0.72
      drawCreaturePaths(ctx, paths, width / 2, height / 2, renderSize)

      ctx.restore()
      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [instance, paletteIndex])

  // Interactive mouse tracking
  useEffect(() => {
    if (!interactive) return
    const canvas = canvasRef.current
    if (!canvas) return

    let releaseTimer: ReturnType<typeof setTimeout> | null = null
    const resetGaze = () => {
      if (releaseTimer) clearTimeout(releaseTimer)
      releaseTimer = null
      instanceRef.current?.setLookDirection(0, 0, false)
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!instanceRef.current) return
      const rect = canvas.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy)
      const range = Math.max(96, Math.min(rect.width, rect.height) * 1.35)
      if (dist < range) {
        const dx = (e.clientX - cx) / (range * 0.82)
        const dy = -(e.clientY - cy) / (range * 0.82) // Creature Y is positive up
        instanceRef.current.setLookDirection(dx * 0.62, dy * 0.46, true)
        if (releaseTimer) clearTimeout(releaseTimer)
        releaseTimer = setTimeout(resetGaze, 900)
      } else {
        resetGaze()
      }
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    canvas.addEventListener('mouseleave', resetGaze)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', resetGaze)
      resetGaze()
    }
  }, [interactive])

  const handleClick = () => {
    if (instance) {
      if (Math.random() > 0.4) {
        instance.triggerBlink()
      } else {
        instance.triggerRandomRotation()
      }
    }
    onClick?.()
  }

  return (
    <canvas
      ref={canvasRef}
      className={`creature-eye-canvas ${className}`}
      style={{
        width: size,
        height: size,
        display: 'block',
        touchAction: 'none',
        cursor: interactive ? 'pointer' : 'default',
        ...style,
      }}
      onClick={handleClick}
    />
  )
}
