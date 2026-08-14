import {
  advanceAvatarPlayback,
  createAvatarPlaybackState,
  playAvatarAnimation,
  pauseAvatarPlayback,
  renderAvatarDefinition,
  renderAvatarFrame,
  resolveAnimation,
  resolveExpression,
  resumeAvatarPlayback,
  validateAvatarDefinition,
  type AnimationKey,
  type AvatarDefinition,
  type AvatarPlaybackState as CorePlaybackState,
  type AvatarRuntimeError as CoreRuntimeError,
  type ExpressionKey,
} from '@bible-strong/avatar-core'
import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'

import './styles.css'

const validatedDefinitions = new WeakSet<object>()
const controlledExpressionTransitionMs = 420

const assertValidDefinition = (definition: AvatarDefinition) => {
  if (validatedDefinitions.has(definition)) return
  const result = validateAvatarDefinition(definition)
  if (!result.ok) {
    throw new Error(`Invalid avatar definition: ${result.errors[0]?.message}`)
  }
  validatedDefinitions.add(definition)
}

export type AvatarRuntimeError =
  | CoreRuntimeError
  | {
      code: 'controlled_by_props'
      key: string
      message: string
    }

export type AvatarCommandResult = { ok: true } | { ok: false; error: AvatarRuntimeError }

export type AvatarPlaybackState = Pick<
  CorePlaybackState,
  'activeAnimation' | 'activeExpression' | 'status'
>

export type AvatarController = {
  play(animation: AnimationKey): AvatarCommandResult
  setExpression(expression: ExpressionKey): AvatarCommandResult
  pause(): void
  stop(): void
  getState(): AvatarPlaybackState
}

export type AvatarPosition = { x: number; y: number }
export type FloatingInitialPosition =
  AvatarPosition | { top?: number; right?: number; bottom?: number; left?: number }

export type AvatarProps = {
  definition: AvatarDefinition
  ref?: Ref<AvatarController>
  animation?: AnimationKey
  expression?: ExpressionKey
  defaultAnimation?: AnimationKey
  defaultExpression?: ExpressionKey
  autoplay?: boolean
  size?: number | string
  className?: string
  style?: CSSProperties
  mode?: 'embedded' | 'floating'
  portalContainer?: HTMLElement
  draggable?: boolean
  constrainTo?: 'none' | 'viewport' | 'parent'
  position?: AvatarPosition
  initialPosition?: FloatingInitialPosition
  zIndex?: number
  ariaLabel?: string
  onPositionPreview?: (position: AvatarPosition) => void
  onPositionCommit?: (position: AvatarPosition) => void
  /** Suggested clamped position when controlled bounds change. */
  onPositionChange?: (position: AvatarPosition) => void
  onDragStart?: () => void
  onDragEnd?: (position: AvatarPosition) => void
  onAnimationEnd?: (animation: AnimationKey) => void
  onExpressionChange?: (expression: ExpressionKey) => void
}

const samePlayback = (left: CorePlaybackState, right: CorePlaybackState) =>
  left.activeAnimation === right.activeAnimation &&
  left.activeExpression === right.activeExpression &&
  left.status === right.status &&
  left.stepIndex === right.stepIndex &&
  left.direction === right.direction &&
  left.phase === right.phase &&
  left.phaseStartedAt === right.phaseStartedAt &&
  left.transitionFrom === right.transitionFrom &&
  left.blinkDueAt === right.blinkDueAt &&
  left.blinkStartedAt === right.blinkStartedAt &&
  left.directTransition?.from === right.directTransition?.from &&
  left.directTransition?.startedAt === right.directTransition?.startedAt &&
  left.directTransition?.durationMs === right.directTransition?.durationMs &&
  left.directTransition?.transition === right.directTransition?.transition

const samePosition = (left: AvatarPosition, right: AvatarPosition) =>
  left.x === right.x && left.y === right.y

const sizeInPixels = (size: number | string | undefined) => (typeof size === 'number' ? size : 240)

const initialPoint = (
  value: FloatingInitialPosition | undefined,
  width: number,
  height: number
): AvatarPosition => {
  if (!value) return { x: 32, y: 32 }
  if ('x' in value && 'y' in value) return { x: value.x, y: value.y }
  const x = value.left ?? Math.max(0, width - (value.right ?? 32))
  const y = value.top ?? Math.max(0, height - (value.bottom ?? 32))
  return { x, y }
}

export function Avatar({
  definition,
  ref,
  animation,
  expression,
  defaultAnimation,
  defaultExpression,
  autoplay,
  size = 240,
  className,
  style,
  mode = 'embedded',
  portalContainer,
  draggable = false,
  constrainTo,
  position,
  initialPosition,
  zIndex = 1000,
  ariaLabel = 'Procedural avatar',
  onPositionPreview,
  onPositionCommit,
  onPositionChange,
  onDragStart,
  onDragEnd,
  onAnimationEnd,
  onExpressionChange,
}: AvatarProps): ReactElement {
  if (animation !== undefined && expression !== undefined) {
    throw new Error('Avatar accepts either animation or expression, not both.')
  }
  assertValidDefinition(definition)

  const clipId = `${useId().replaceAll(':', '')}-head`
  const wrapperRef = useRef<HTMLDivElement>(null)
  const clipPathRef = useRef<SVGPathElement>(null)
  const headPathRef = useRef<SVGPathElement>(null)
  const leftPathRef = useRef<SVGPathElement>(null)
  const rightPathRef = useRef<SVGPathElement>(null)
  const backPathRefs = useRef<(SVGPathElement | null)[]>([])
  const frontPathRefs = useRef<(SVGPathElement | null)[]>([])
  const defaultPlaybackStarted = useRef(false)
  const floatingPositionInitialized = useRef(false)
  const previewFrame = useRef<number | undefined>(undefined)
  const completedAnimation = useRef<AnimationKey | undefined>(undefined)
  const playbackRef = useRef<CorePlaybackState>(createAvatarPlaybackState())
  const drag = useRef<
    | {
        pointerId: number
        pointer: AvatarPosition
        origin: AvatarPosition
        current: AvatarPosition
      }
    | undefined
  >(undefined)
  const [mounted, setMounted] = useState(false)
  const [internalPosition, setInternalPosition] = useState<AvatarPosition>({ x: 0, y: 0 })
  const [playback, setPlayback] = useState<CorePlaybackState>(() => {
    const key = animation ?? defaultAnimation
    if (key) {
      const result = resolveAnimation(definition, key)
      if (result.ok) {
        return {
          ...createAvatarPlaybackState(),
          activeExpression: result.value.steps[0]?.expression ?? 'neutral',
        }
      }
    }
    const keyExpression = expression ?? defaultExpression ?? 'neutral'
    return { ...createAvatarPlaybackState(), activeExpression: keyExpression }
  })
  playbackRef.current = playback
  const authoritativePosition = position ?? internalPosition
  const effectiveConstraint = constrainTo ?? (mode === 'floating' ? 'viewport' : 'none')

  const applyTransform = (point: AvatarPosition) => {
    if (wrapperRef.current) {
      wrapperRef.current.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`
    }
  }

  const clampPosition = (point: AvatarPosition): AvatarPosition => {
    const element = wrapperRef.current
    if (!element || effectiveConstraint === 'none') return point
    const width = element.offsetWidth
    const height = element.offsetHeight
    if (effectiveConstraint === 'viewport') {
      return {
        x: Math.min(Math.max(point.x, 0), Math.max(window.innerWidth - width, 0)),
        y: Math.min(Math.max(point.y, 0), Math.max(window.innerHeight - height, 0)),
      }
    }
    const parent = element.parentElement
    if (!parent) return point
    return {
      x: Math.min(Math.max(point.x, 0), Math.max(parent.clientWidth - width, 0)),
      y: Math.min(Math.max(point.y, 0), Math.max(parent.clientHeight - height, 0)),
    }
  }

  const commitPosition = (next: AvatarPosition) => {
    const clamped = clampPosition(next)
    applyTransform(position ?? clamped)
    if (!position) setInternalPosition(clamped)
    onPositionCommit?.(clamped)
    return clamped
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    defaultPlaybackStarted.current = false
    completedAnimation.current = undefined
    const key = animation ?? defaultAnimation
    if (key) {
      const result = resolveAnimation(definition, key)
      if (result.ok) {
        const next = {
          ...createAvatarPlaybackState(),
          activeExpression: result.value.steps[0]?.expression ?? 'neutral',
        }
        playbackRef.current = next
        setPlayback(next)
        return
      }
    }
    const keyExpression = expression ?? defaultExpression ?? 'neutral'
    const resolved = resolveExpression(definition, keyExpression)
    const next = {
      ...createAvatarPlaybackState(),
      activeExpression: resolved.ok ? keyExpression : 'neutral',
    }
    playbackRef.current = next
    setPlayback(next)
  }, [definition])

  useEffect(() => {
    if (
      defaultPlaybackStarted.current ||
      animation !== undefined ||
      expression !== undefined ||
      defaultAnimation === undefined ||
      autoplay === false
    ) {
      return
    }
    defaultPlaybackStarted.current = true
    const result = playAvatarAnimation(definition, defaultAnimation, performance.now())
    if (result.ok) setPlayback(result.value)
  }, [animation, autoplay, defaultAnimation, definition, expression])

  useEffect(() => {
    if (mode === 'floating') {
      if (floatingPositionInitialized.current) {
        applyTransform(position ?? internalPosition)
        return
      }
      floatingPositionInitialized.current = true
      const fallbackPixels = sizeInPixels(size)
      const measuredWidth = wrapperRef.current?.offsetWidth || fallbackPixels
      const measuredHeight = wrapperRef.current?.offsetHeight || fallbackPixels
      const point = initialPoint(
        initialPosition,
        window.innerWidth - measuredWidth,
        window.innerHeight - measuredHeight
      )
      const clamped = clampPosition(position ?? point)
      if (!position) setInternalPosition(clamped)
      applyTransform(position ?? clamped)
    } else {
      floatingPositionInitialized.current = false
      applyTransform(position ?? internalPosition)
    }
  }, [mode, position, size, internalPosition])

  useEffect(() => {
    if (!mounted) return
    const reClamp = () => {
      const current = position ?? internalPosition
      const clamped = clampPosition(current)
      if (samePosition(current, clamped)) return
      if (position) {
        applyTransform(position)
        onPositionChange?.(clamped)
        return
      }
      applyTransform(clamped)
      setInternalPosition(clamped)
    }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(reClamp)
    if (wrapperRef.current) observer?.observe(wrapperRef.current)
    if (effectiveConstraint === 'parent' && wrapperRef.current?.parentElement && observer) {
      observer.observe(wrapperRef.current.parentElement)
    }
    window.addEventListener('resize', reClamp)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', reClamp)
    }
  }, [mounted, position, internalPosition, effectiveConstraint, onPositionChange])

  useEffect(() => {
    if (expression !== undefined) {
      const resolved = resolveExpression(definition, expression)
      if (resolved.ok) {
        const current = playbackRef.current
        const next = {
          ...createAvatarPlaybackState(),
          activeExpression: expression,
          ...(current.activeExpression === expression
            ? {}
            : {
                status: 'playing' as const,
                directTransition: {
                  from: current.activeExpression,
                  startedAt: performance.now(),
                  durationMs: controlledExpressionTransitionMs,
                  transition: 'smooth' as const,
                },
              }),
        }
        playbackRef.current = next
        setPlayback(next)
      }
      return
    }
    if (animation !== undefined) {
      const result = playAvatarAnimation(definition, animation, performance.now())
      if (result.ok) setPlayback(result.value)
    }
  }, [animation, definition, expression])

  useEffect(() => {
    onExpressionChange?.(playback.activeExpression)
  }, [playback.activeExpression, onExpressionChange])

  useEffect(() => {
    if (playback.status !== 'playing') return
    let frame = 0
    const tick = (now: number) => {
      const current = playbackRef.current
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const next = advanceAvatarPlayback(definition, current, now, {
        random: Math.random,
        reduceMotion,
      })
      playbackRef.current = next
      if (!samePlayback(current, next)) setPlayback(next)
      if (
        current.status === 'playing' &&
        next.status === 'stopped' &&
        current.activeAnimation &&
        completedAnimation.current !== current.activeAnimation
      ) {
        completedAnimation.current = current.activeAnimation
        onAnimationEnd?.(current.activeAnimation)
      }
      const frameScene = renderAvatarFrame(definition, next, now, {
        random: Math.random,
        reduceMotion,
      })
      headPathRef.current?.setAttribute('d', frameScene.geometry.headPath)
      clipPathRef.current?.setAttribute('d', frameScene.geometry.headPath)
      headPathRef.current?.setAttribute('fill', frameScene.colors.body)
      leftPathRef.current?.setAttribute('d', frameScene.geometry.leftPath)
      leftPathRef.current?.setAttribute('fill', frameScene.colors.eyes)
      leftPathRef.current?.setAttribute('opacity', frameScene.geometry.leftVisible ? '1' : '0')
      rightPathRef.current?.setAttribute('d', frameScene.geometry.rightPath)
      rightPathRef.current?.setAttribute('fill', frameScene.colors.eyes)
      rightPathRef.current?.setAttribute('opacity', frameScene.geometry.rightVisible ? '1' : '0')
      frameScene.geometry.backPaths.forEach((path, index) => {
        backPathRefs.current[index]?.setAttribute('d', path)
        backPathRefs.current[index]?.setAttribute('fill', frameScene.colors.body)
      })
      frameScene.geometry.frontPaths.forEach((path, index) => {
        frontPathRefs.current[index]?.setAttribute('d', path)
        frontPathRefs.current[index]?.setAttribute('fill', frameScene.colors.body)
      })
      if (next.status === 'playing') frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [definition, playback.status, onAnimationEnd])

  const controlled = animation !== undefined || expression !== undefined
  useImperativeHandle(ref, () => ({
    play(key) {
      if (controlled) {
        return {
          ok: false,
          error: {
            code: 'controlled_by_props',
            key,
            message: 'Playback is controlled by Avatar props.',
          },
        }
      }
      const current = playbackRef.current
      if (
        current.status === 'paused' &&
        current.activeAnimation === key &&
        current.pausedAt !== undefined
      ) {
        const now = performance.now()
        const resumed = resumeAvatarPlayback(current, now)
        playbackRef.current = resumed
        setPlayback(resumed)
        return { ok: true }
      }
      const result = playAvatarAnimation(definition, key, performance.now())
      if (!result.ok) return { ok: false, error: result.error }
      completedAnimation.current = undefined
      playbackRef.current = result.value
      setPlayback(result.value)
      return { ok: true }
    },
    setExpression(key) {
      if (controlled) {
        return {
          ok: false,
          error: {
            code: 'controlled_by_props',
            key,
            message: 'Expression is controlled by Avatar props.',
          },
        }
      }
      const result = resolveExpression(definition, key)
      if (!result.ok) return { ok: false, error: result.error }
      const next = { ...createAvatarPlaybackState(), activeExpression: key }
      playbackRef.current = next
      setPlayback(next)
      return { ok: true }
    },
    pause() {
      const current = playbackRef.current
      if (current.status !== 'playing') return
      const next = pauseAvatarPlayback(current, performance.now())
      playbackRef.current = next
      setPlayback(next)
    },
    stop() {
      if (!controlled) {
        const next = createAvatarPlaybackState()
        playbackRef.current = next
        setPlayback(next)
      }
    },
    getState() {
      const current = playbackRef.current
      return {
        ...(current.activeAnimation ? { activeAnimation: current.activeAnimation } : {}),
        activeExpression: current.activeExpression,
        status: current.status,
      }
    },
  }))

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable || event.button !== 0) return
    if (
      mode === 'floating' &&
      !(event.target instanceof Element && event.target.closest('.bs-avatar__drag-grip'))
    ) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      pointer: { x: event.clientX, y: event.clientY },
      origin: authoritativePosition,
      current: authoritativePosition,
    }
    event.currentTarget.classList.add('bs-avatar--dragging')
    onDragStart?.()
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    const next = clampPosition({
      x: active.origin.x + event.clientX - active.pointer.x,
      y: active.origin.y + event.clientY - active.pointer.y,
    })
    active.current = next
    applyTransform(next)
    if (previewFrame.current === undefined) {
      previewFrame.current = requestAnimationFrame(() => {
        previewFrame.current = undefined
        if (drag.current) onPositionPreview?.(drag.current.current)
      })
    }
  }

  const endDrag = (cancelled: boolean) => {
    const active = drag.current
    if (!active) return
    if (previewFrame.current !== undefined) cancelAnimationFrame(previewFrame.current)
    previewFrame.current = undefined
    const finalPosition = commitPosition(cancelled ? active.origin : active.current)
    wrapperRef.current?.classList.remove('bs-avatar--dragging')
    drag.current = undefined
    if (
      wrapperRef.current?.hasPointerCapture?.(active.pointerId) &&
      wrapperRef.current.releasePointerCapture
    ) {
      wrapperRef.current.releasePointerCapture(active.pointerId)
    }
    onDragEnd?.(finalPosition)
  }

  const moveByKeyboard = (x: number, y: number) => {
    const next = commitPosition({ x: authoritativePosition.x + x, y: authoritativePosition.y + y })
    onPositionPreview?.(next)
  }

  const scene = renderAvatarDefinition(
    definition,
    mode === 'floating' && !mounted ? 'neutral' : playback.activeExpression
  )
  const wrapper = (
    <div
      ref={wrapperRef}
      className={[
        'bs-avatar',
        `bs-avatar--${mode}`,
        draggable ? 'bs-avatar--draggable' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ...style,
        width: size,
        height: size,
        zIndex: mode === 'floating' ? zIndex : style?.zIndex,
        transform: `translate3d(${authoritativePosition.x}px, ${authoritativePosition.y}px, 0)`,
      }}
      role={draggable ? 'group' : 'img'}
      aria-label={ariaLabel}
      aria-description={
        draggable
          ? 'Use the drag handle, arrow keys or move controls to reposition the avatar.'
          : undefined
      }
      tabIndex={draggable ? 0 : undefined}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={() => endDrag(false)}
      onPointerCancel={() => endDrag(true)}
      onLostPointerCapture={() => endDrag(false)}
      onKeyDown={event => {
        if (!draggable) return
        const amount = event.shiftKey ? 1 : 10
        if (event.key === 'ArrowLeft') moveByKeyboard(-amount, 0)
        else if (event.key === 'ArrowRight') moveByKeyboard(amount, 0)
        else if (event.key === 'ArrowUp') moveByKeyboard(0, -amount)
        else if (event.key === 'ArrowDown') moveByKeyboard(0, amount)
        else if (event.key === 'Escape') endDrag(true)
        else return
        event.preventDefault()
      }}
    >
      {draggable && <div className="bs-avatar__drag-grip" aria-hidden="true" title="Drag avatar" />}
      <svg className="bs-avatar__svg" viewBox="-150 -150 300 300" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <path ref={clipPathRef} d={scene.geometry.headPath} />
          </clipPath>
        </defs>
        {scene.geometry.backPaths.map((path, index) => (
          <path
            ref={element => {
              backPathRefs.current[index] = element
            }}
            d={path}
            fill={scene.colors.body}
            key={`back-${index}`}
          />
        ))}
        <path ref={headPathRef} d={scene.geometry.headPath} fill={scene.colors.body} />
        <g clipPath={`url(#${clipId})`} fill={scene.colors.eyes}>
          <path
            ref={leftPathRef}
            d={scene.geometry.leftPath}
            opacity={scene.geometry.leftVisible ? 1 : 0}
          />
          <path
            ref={rightPathRef}
            d={scene.geometry.rightPath}
            opacity={scene.geometry.rightVisible ? 1 : 0}
          />
        </g>
        {scene.geometry.frontPaths.map((path, index) => (
          <path
            ref={element => {
              frontPathRefs.current[index] = element
            }}
            d={path}
            fill={scene.colors.body}
            key={`front-${index}`}
          />
        ))}
      </svg>
      {draggable && (
        <div className="bs-avatar__move-controls">
          {(
            [
              ['Move avatar left', -10, 0, '\u2190'],
              ['Move avatar right', 10, 0, '\u2192'],
              ['Move avatar up', 0, -10, '\u2191'],
              ['Move avatar down', 0, 10, '\u2193'],
            ] as const
          ).map(([label, x, y, symbol]) => (
            <button
              type="button"
              aria-label={label}
              onPointerDown={event => event.stopPropagation()}
              onClick={() => moveByKeyboard(x, y)}
              key={label}
            >
              <span aria-hidden="true">{symbol}</span>
            </button>
          ))}
          <button
            className="bs-avatar__reset"
            type="button"
            aria-label="Reset avatar position"
            onPointerDown={event => event.stopPropagation()}
            onClick={() => commitPosition({ x: 0, y: 0 })}
          >
            <span aria-hidden="true">\u21ba</span>
          </button>
        </div>
      )}
    </div>
  )

  if (mode === 'floating' && mounted) {
    return createPortal(wrapper, portalContainer ?? document.body)
  }
  return wrapper
}
