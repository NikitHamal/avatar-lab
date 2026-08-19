import { RotateCcw } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useStudioLanguage } from '@/i18n'

import { PlaybackIdentity } from '@/app/components/common'
import {
  bounded,
  poseWithAvatarEyes,
  useEscapeToCancel,
  type Highlight,
  type PlaybackStatus,
} from '@/app/studio-utils'
import {
  applyAvatarEyeDefaults,
  type AvatarEyeDefaults,
  type AvatarEyeRenderer,
  type AvatarRenderStyle,
} from '@/features/avatar/avatars'
import { type BodyNode } from '@/features/avatar/body'
import { scaleEye, updateEyeDimension } from '@/features/avatar/expressionEditing'
import {
  poseFromExpression,
  renderBodyNodeEditor,
  renderEyeEditor,
  rotateBodyNodeAroundLocalAxis,
  rotateExpressionAroundAxis,
  rotateExpressionAroundCamera,
  rotateExpressionWithArcball,
  rotationRing,
  translateBodyNodeAlongLocalAxis,
  translateBodyNodeInCameraPlane,
  type AvatarNodeStyle,
  type AvatarPose,
  type AvatarVisualEffect,
  type Expression,
  type Point3,
} from '@/features/avatar/geometry'
import {
  beginManipulation,
  beginManipulationFromRenderedValue,
  finishManipulation,
  previewManipulation,
  type ManipulationSession,
} from '@/features/avatar/manipulationSession'
import { type SurfaceConfig } from '@/features/avatar/surfaces'
import { CreatureEyeSvgLayer } from '@/features/creature/CreatureEyeSvgLayer'
import type { CreatureShape } from '@/features/creature/creatureSwatches'
import { type CanvasPreviewTarget } from '@/features/rendering/canvasPreview'
import { AvatarEffectLayer } from '@/features/rendering/avatarEffects'
import {
  evaluateOrbitArcs,
  evaluatePlayArcs,
  type RenderedOrbitalArc,
} from '@/features/avatar/orbitalRings'
import { LivePixelAvatarCanvas } from '@/features/rendering/components/PixelAvatarCanvas'
import { type RenderedRotationGizmo } from '@/features/rendering/renderedRotationGizmo'
import {
  findBodyNodePath,
  type RenderedColors,
  type RenderedScene,
} from '@/features/rendering/renderedScene'
import {
  nodeFilterId,
  nodeGradientId,
  nodeShouldGlow,
  nodeUsesGradient,
  resolveNodeFill,
  resolveNodeOpacity,
} from '@/features/rendering/nodePaint'
export function RotationGizmo({
  expression,
  rendered,
  onPreview,
  onChange,
  onActiveChange,
  onReset,
}: {
  expression: Expression
  rendered: RenderedRotationGizmo
  onPreview: (next: Expression) => void
  onChange: (next: Expression) => void
  onActiveChange: (active: boolean) => void
  onReset: () => void
}) {
  const { t } = useStudioLanguage()
  const drag = useRef<
    | {
        type: 'axis'
        axis: 'x' | 'y' | 'z'
        startPoint: readonly [number, number]
        tangent: readonly [number, number]
        expression: Expression
      }
    | { type: 'view'; startAngle: number; expression: Expression }
    | null
  >(null)
  const latestExpression = useRef(expression)
  const pose = poseFromExpression(expression)
  const rings = {
    x: rotationRing(pose, 'x'),
    y: rotationRing(pose, 'y'),
    z: rotationRing(pose, 'z'),
  }
  const toLocal = (event: React.PointerEvent<SVGElement>): readonly [number, number] => {
    const rectangle = event.currentTarget.ownerSVGElement!.getBoundingClientRect()
    return [
      ((event.clientX - rectangle.left) / rectangle.width) * 86 - 43,
      ((event.clientY - rectangle.top) / rectangle.height) * 86 - 43,
    ]
  }
  const unitVector = (from: Point3, to: Point3): readonly [number, number] => {
    const x = to[0] - from[0]
    const y = to[1] - from[1]
    const length = Math.hypot(x, y) || 1
    return [x / length, y / length]
  }
  const startAxis = (axis: 'x' | 'y' | 'z', event: React.PointerEvent<SVGElement>) => {
    event.stopPropagation()
    onActiveChange(true)
    const point = toLocal(event)
    const ring = rings[axis]
    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY
    ring.slice(0, -1).forEach((ringPoint, index) => {
      const distance = Math.hypot(ringPoint[0] - point[0], ringPoint[1] - point[1])
      if (distance < closestDistance) {
        closestIndex = index
        closestDistance = distance
      }
    })
    const previous = ring[(closestIndex - 1 + ring.length - 1) % (ring.length - 1)]
    const next = ring[(closestIndex + 1) % (ring.length - 1)]
    drag.current = {
      type: 'axis',
      axis,
      startPoint: point,
      tangent: unitVector(previous, next),
      expression,
    }
    latestExpression.current = expression
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const startView = (event: React.PointerEvent<SVGElement>) => {
    event.stopPropagation()
    onActiveChange(true)
    const point = toLocal(event)
    drag.current = { type: 'view', startAngle: Math.atan2(point[1], point[0]), expression }
    latestExpression.current = expression
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: React.PointerEvent<SVGElement>) => {
    if (!drag.current) return
    const point = toLocal(event)
    if (drag.current.type === 'view') {
      const currentAngle = Math.atan2(point[1], point[0])
      const delta = Math.atan2(
        Math.sin(currentAngle - drag.current.startAngle),
        Math.cos(currentAngle - drag.current.startAngle)
      )
      const next = rotateExpressionAroundCamera(drag.current.expression, delta)
      latestExpression.current = next
      onPreview(next)
      return
    }
    const signedDistance =
      (point[0] - drag.current.startPoint[0]) * drag.current.tangent[0] +
      (point[1] - drag.current.startPoint[1]) * drag.current.tangent[1]
    const next = rotateExpressionAroundAxis(
      drag.current.expression,
      drag.current.axis,
      signedDistance * 1.5
    )
    latestExpression.current = next
    onPreview(next)
  }
  const stop = () => {
    if (drag.current) onChange(latestExpression.current)
    drag.current = null
    onActiveChange(false)
  }
  const cancel = () => {
    if (drag.current) {
      onPreview(drag.current.expression)
      onChange(drag.current.expression)
    }
    drag.current = null
    onActiveChange(false)
  }
  useEscapeToCancel(cancel)
  return (
    <div className="gizmo-cluster">
      <svg className="gizmo" viewBox="-43 -43 86 86" aria-label={t('Gizmo de rotation')}>
        <circle
          className="gizmo-orbit gizmo-camera"
          cx="0"
          cy="0"
          r="38"
          onPointerDown={startView}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={cancel}
        />
        <motion.path
          className="gizmo-orbit gizmo-y"
          d={rendered.yPath}
          onPointerDown={event => startAxis('y', event)}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={cancel}
        />
        <motion.path
          className="gizmo-orbit gizmo-x"
          d={rendered.xPath}
          onPointerDown={event => startAxis('x', event)}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={cancel}
        />
        <motion.path
          className="gizmo-orbit gizmo-z"
          d={rendered.zPath}
          onPointerDown={event => startAxis('z', event)}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={cancel}
        />
      </svg>
      <Button
        className="gizmo-reset"
        variant="secondary"
        size="icon-sm"
        aria-label={t('Réinitialiser la rotation de la tête')}
        onClick={onReset}
      >
        <RotateCcw />
      </Button>
    </div>
  )
}

type TransformAxis = 'x' | 'y' | 'z'

export function BodyNodeGizmo({
  svgRef,
  pose,
  node,
  onPreview,
  onCommit,
}: {
  svgRef: React.RefObject<SVGSVGElement | null>
  pose: AvatarPose
  node: BodyNode
  onPreview: (next: BodyNode) => void
  onCommit: (next: BodyNode) => void
}) {
  const { t } = useStudioLanguage()
  const geometry = renderBodyNodeEditor(pose, node)
  const [activeControl, setActiveControl] = useState<
    { mode: 'translate' | 'rotate'; axis: TransformAxis } | { mode: 'plane' } | undefined
  >(undefined)
  const drag = useRef<
    | {
        mode: 'translate' | 'rotate'
        axis: TransformAxis
        startPoint: readonly [number, number]
        direction: readonly [number, number]
        scale: number
        node: BodyNode
      }
    | {
        mode: 'plane'
        startPoint: readonly [number, number]
        node: BodyNode
      }
    | undefined
  >(undefined)
  const latestNode = useRef(node)
  const manipulation = useRef<ManipulationSession<BodyNode> | null>(null)
  const previewFrame = useRef<number | undefined>(undefined)
  const axes: TransformAxis[] = ['x', 'y', 'z']
  const toSvg = (event: React.PointerEvent<SVGElement>): readonly [number, number] => {
    const rectangle = svgRef.current!.getBoundingClientRect()
    return [
      ((event.clientX - rectangle.left) / rectangle.width) * 300 - 150,
      ((event.clientY - rectangle.top) / rectangle.height) * 300 - 150,
    ]
  }
  const directionBetween = (from: Point3, to: Point3): readonly [number, number] => {
    const x = to[0] - from[0]
    const y = to[1] - from[1]
    const length = Math.hypot(x, y) || 1
    return [x / length, y / length]
  }
  const ringPath = (points: Point3[]) =>
    `M${points.map(point => `${point[0]} ${point[1]}`).join('L')}Z`
  const startTranslate = (axis: TransformAxis, event: React.PointerEvent<SVGElement>) => {
    event.stopPropagation()
    const endpoint = geometry.axes[axis]
    const length = Math.max(
      Math.hypot(endpoint[0] - geometry.center[0], endpoint[1] - geometry.center[1]),
      1
    )
    drag.current = {
      mode: 'translate',
      axis,
      startPoint: toSvg(event),
      direction: directionBetween(geometry.center, endpoint),
      scale: 34 / length,
      node,
    }
    setActiveControl({ mode: 'translate', axis })
    latestNode.current = node
    manipulation.current = beginManipulation(node)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const startRotate = (axis: TransformAxis, event: React.PointerEvent<SVGElement>) => {
    event.stopPropagation()
    const point = toSvg(event)
    const ring = geometry.rings[axis]
    let closestIndex = 0
    let closestDistance = Infinity
    ring.slice(0, -1).forEach((ringPoint, index) => {
      const distance = Math.hypot(ringPoint[0] - point[0], ringPoint[1] - point[1])
      if (distance < closestDistance) {
        closestIndex = index
        closestDistance = distance
      }
    })
    const previous = ring[(closestIndex - 1 + ring.length - 1) % (ring.length - 1)]
    const next = ring[(closestIndex + 1) % (ring.length - 1)]
    const radius = Math.max(
      Math.hypot(
        ring[closestIndex][0] - geometry.center[0],
        ring[closestIndex][1] - geometry.center[1]
      ),
      8
    )
    drag.current = {
      mode: 'rotate',
      axis,
      startPoint: point,
      direction: directionBetween(previous, next),
      scale: 180 / Math.PI / radius,
      node,
    }
    setActiveControl({ mode: 'rotate', axis })
    latestNode.current = node
    manipulation.current = beginManipulation(node)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const startPlaneTranslate = (event: React.PointerEvent<SVGElement>) => {
    event.stopPropagation()
    drag.current = { mode: 'plane', startPoint: toSvg(event), node }
    setActiveControl({ mode: 'plane' })
    latestNode.current = node
    manipulation.current = beginManipulation(node)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: React.PointerEvent<SVGElement>) => {
    if (!drag.current) return
    const interaction = drag.current
    const point = toSvg(event)
    const deltaX = point[0] - interaction.startPoint[0]
    const deltaY = point[1] - interaction.startPoint[1]
    const next = (() => {
      if (interaction.mode === 'plane') {
        return translateBodyNodeInCameraPlane(interaction.node, pose, deltaX, deltaY)
      }
      const delta =
        (deltaX * interaction.direction[0] + deltaY * interaction.direction[1]) * interaction.scale
      return interaction.mode === 'translate'
        ? translateBodyNodeAlongLocalAxis(interaction.node, interaction.axis, delta)
        : rotateBodyNodeAroundLocalAxis(interaction.node, interaction.axis, delta)
    })()
    latestNode.current = next
    if (manipulation.current) {
      previewManipulation(manipulation.current, next)
    }
    if (previewFrame.current !== undefined) return
    previewFrame.current = requestAnimationFrame(() => {
      previewFrame.current = undefined
      onPreview(latestNode.current)
    })
  }
  const stop = () => {
    if (previewFrame.current !== undefined) cancelAnimationFrame(previewFrame.current)
    previewFrame.current = undefined
    if (manipulation.current) {
      finishManipulation(manipulation.current, 'commit', { preview: onPreview, commit: onCommit })
    }
    manipulation.current = null
    drag.current = undefined
    setActiveControl(undefined)
  }
  const cancel = () => {
    if (previewFrame.current !== undefined) cancelAnimationFrame(previewFrame.current)
    previewFrame.current = undefined
    if (manipulation.current) {
      finishManipulation(manipulation.current, 'cancel', { preview: onPreview, commit: onCommit })
    }
    manipulation.current = null
    drag.current = undefined
    setActiveControl(undefined)
  }
  useEscapeToCancel(cancel)
  const resetTransform = (event: React.MouseEvent<SVGGElement>) => {
    event.stopPropagation()
    const resetNode: BodyNode = { ...node, position: [0, 0, 0], rotation: [0, 0, 0] }
    latestNode.current = resetNode
    onCommit(resetNode)
  }

  useEffect(
    () => () => {
      if (previewFrame.current !== undefined) cancelAnimationFrame(previewFrame.current)
    },
    []
  )

  return (
    <g className="body-node-gizmo" aria-label={`${t('Transformer')} ${t(node.name)}`}>
      {axes.map(axis => (
        <g key={`ring-${axis}`}>
          <path
            className="body-gizmo-hitbox body-gizmo-ring-hitbox"
            d={ringPath(geometry.rings[axis])}
            onPointerDown={event => startRotate(axis, event)}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={cancel}
          />
          <path
            className={`body-gizmo-ring gizmo-${axis}${activeControl?.mode === 'rotate' && activeControl.axis === axis ? ' is-active' : ''}`}
            d={ringPath(geometry.rings[axis])}
            pointerEvents="none"
          />
        </g>
      ))}
      {axes.map(axis => (
        <g key={`axis-${axis}`}>
          <path
            className="body-gizmo-hitbox body-gizmo-axis-hitbox"
            d={`M${geometry.center[0]} ${geometry.center[1]}L${geometry.axes[axis][0]} ${geometry.axes[axis][1]}`}
            onPointerDown={event => startTranslate(axis, event)}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={cancel}
          />
          <path
            className={`body-gizmo-axis gizmo-${axis}${activeControl?.mode === 'translate' && activeControl.axis === axis ? ' is-active' : ''}`}
            d={`M${geometry.center[0]} ${geometry.center[1]}L${geometry.axes[axis][0]} ${geometry.axes[axis][1]}`}
            pointerEvents="none"
          />
          <circle
            className={`body-gizmo-handle gizmo-${axis}`}
            cx={geometry.axes[axis][0]}
            cy={geometry.axes[axis][1]}
            r="3.5"
            pointerEvents="none"
          />
          <text
            className={`body-gizmo-label body-gizmo-label-${axis}`}
            x={geometry.axes[axis][0]}
            y={geometry.axes[axis][1] - 5}
          >
            {axis.toUpperCase()}
          </text>
        </g>
      ))}
      <circle
        className="body-gizmo-plane-hitbox"
        cx={geometry.center[0]}
        cy={geometry.center[1]}
        r="11"
        aria-label={t('Déplacer dans le plan de la caméra')}
        onPointerDown={startPlaneTranslate}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={cancel}
      />
      <circle
        className={`body-gizmo-origin${activeControl?.mode === 'plane' ? ' is-active' : ''}`}
        cx={geometry.center[0]}
        cy={geometry.center[1]}
        r="4"
        pointerEvents="none"
      />
      <g
        className="body-gizmo-reset"
        role="button"
        tabIndex={0}
        aria-label={t(`Réinitialiser la position et la rotation de ${node.name}`)}
        transform={`translate(${bounded(geometry.center[0] + 32, -140, 140)} ${bounded(geometry.center[1] - 32, -140, 140)})`}
        onClick={resetTransform}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          const resetNode: BodyNode = { ...node, position: [0, 0, 0], rotation: [0, 0, 0] }
          latestNode.current = resetNode
          onCommit(resetNode)
        }}
      >
        <circle r="6.5" />
        <text y="2.5">↺</text>
      </g>
    </g>
  )
}

function OrbitalArcsCanvasDefs({
  effect,
  scale = 120,
}: {
  effect?: AvatarVisualEffect
  scale?: number
}) {
  const [arcs, setArcs] = useState<RenderedOrbitalArc[]>([])
  useEffect(() => {
    if (effect !== 'orbit' && effect !== 'playArcs') {
      setArcs([])
      return
    }
    let handle: number
    const tick = (now: number) => {
      const timeSec = now / 1000
      const current =
        effect === 'orbit' ? evaluateOrbitArcs(timeSec, scale) : evaluatePlayArcs(timeSec, scale)
      setArcs(current)
      handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [effect, scale])

  if (!arcs.length) return null

  return (
    <>
      {arcs.map(arc => (
        <linearGradient
          key={`stage-grad-${arc.id}`}
          id={`stage-grad-${arc.id}`}
          gradientUnits="userSpaceOnUse"
          x1={arc.grad.x1}
          y1={arc.grad.y1}
          x2={arc.grad.x2}
          y2={arc.grad.y2}
        >
          {arc.grad.stops.map((stopColor, idx) => (
            <stop
              key={idx}
              offset={`${(idx / (arc.grad.stops.length - 1)) * 100}%`}
              stopColor={stopColor}
            />
          ))}
        </linearGradient>
      ))}
    </>
  )
}

function OrbitalArcsCanvasLayer({
  effect,
  scale = 120,
  layer,
}: {
  effect?: AvatarVisualEffect
  scale?: number
  layer: 'front' | 'back'
}) {
  const [arcs, setArcs] = useState<RenderedOrbitalArc[]>([])
  useEffect(() => {
    if (effect !== 'orbit' && effect !== 'playArcs') {
      setArcs([])
      return
    }
    let handle: number
    const tick = (now: number) => {
      const timeSec = now / 1000
      const current =
        effect === 'orbit' ? evaluateOrbitArcs(timeSec, scale) : evaluatePlayArcs(timeSec, scale)
      setArcs(current)
      handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [effect, scale])

  if (!arcs.length) return null

  return (
    <g className={`avatar-orbital-arcs-${layer}`}>
      {arcs
        .filter(arc => (layer === 'front' ? arc.front : arc.back) && arc.opacity > 0.005)
        .map(arc => (
          <path
            key={`${layer}-${arc.id}`}
            d={layer === 'front' ? arc.front : arc.back}
            stroke={`url(#stage-grad-${arc.id})`}
            strokeWidth={arc.width}
            strokeLinecap="round"
            fill="none"
            opacity={arc.opacity}
            pointerEvents="none"
          />
        ))}
    </g>
  )
}

export function AvatarCanvas({
  expression,
  avatarEyes,
  eyeRenderer,
  creaturePaletteIndex,
  surface,
  scene,
  colors,
  renderStyle,
  rotationGizmo,
  showWire,
  bodyEditing,
  selectedBodyNodeId,
  selectedBodyNode,
  selectedSide,
  linked,
  highlight,
  onHighlightChange,
  onBodyNodeSelect,
  onBodyNodePreview,
  onBodyNodeChange,
  onEyeSelect,
  onPreview,
  onChange,
  onReset,
  onEyeChange,
  playback,
  onManipulationStart,
  renderedColors,
  visualEffect,
}: {
  expression: Expression
  avatarEyes: AvatarEyeDefaults
  eyeRenderer: AvatarEyeRenderer
  creaturePaletteIndex: number
  surface: SurfaceConfig
  colors: RenderedColors
  scene: RenderedScene
  renderStyle: AvatarRenderStyle
  renderedColors?: RenderedColors
  visualEffect?: AvatarVisualEffect
  rotationGizmo: RenderedRotationGizmo
  showWire: boolean
  bodyEditing: boolean
  selectedBodyNodeId: 'primary' | string | null
  selectedBodyNode: BodyNode | null
  selectedSide: -1 | 1 | null
  linked: { width: boolean; height: boolean; size: boolean }
  highlight: Highlight
  onHighlightChange: (highlight: Highlight) => void
  onBodyNodeSelect: (id: 'primary' | string | null) => void
  onBodyNodePreview: (next: BodyNode) => void
  onBodyNodeChange: (next: BodyNode) => void
  onEyeSelect: (side: -1 | 1) => void
  onPreview: (next: Expression, target: CanvasPreviewTarget) => void
  onChange: (next: Expression) => void
  onReset: (next: Expression) => void
  onEyeChange?: (next: Expression) => void
  playback: { name: string; status: Exclude<PlaybackStatus, 'stopped'> } | null
  onManipulationStart: () => Expression
}) {
  const { t } = useStudioLanguage()
  const {
    wirePaths,
    backPaths,
    frontPaths,
    backNodeIds,
    frontNodeIds,
    headPath,
    leftPath,
    rightPath,
    leftPupilPath,
    rightPupilPath,
    leftOpacity,
    rightOpacity,
    mouthPath,
    mouthOpacity,
    decalPaths,
    decalFills,
    decalOpacities,
    nodeStyles,
    offsetX,
    offsetY,
    creatureEyeFrame,
    creatureEyePaths,
  } = scene
  const activeEffect = visualEffect ?? expression.effect
  const creatureEyesActive = eyeRenderer === 'creature'
  const [creatureEyesReady, setCreatureEyesReady] = useState(false)
  const creatureShape = (expression.eyeStyle ?? avatarEyes.eyeStyle ?? 'dot') as CreatureShape
  const svgRef = useRef<SVGSVGElement>(null)
  const [activeDragType, setActiveDragType] = useState<
    'arcball' | 'width' | 'height' | 'size' | 'spacing' | 'rotate' | null
  >(null)
  const drag = useRef<
    | {
        type: 'arcball'
        startPoint: readonly [number, number]
        expression: Expression
      }
    | {
        type: 'width' | 'height' | 'size' | 'spacing' | 'rotate'
        side: -1 | 1
        startPoint: readonly [number, number]
        expression: Expression
        center: Point3
        widthAxis: readonly [number, number]
        heightAxis: readonly [number, number]
        spacingAxis: readonly [number, number]
        startPointerAngle: number
        startDistance: number
      }
    | null
  >(null)
  const canvasManipulation = useRef<ManipulationSession<Expression> | null>(null)
  useEffect(() => {
    if (!creatureEyesActive) setCreatureEyesReady(false)
  }, [creatureEyesActive])
  const editor =
    selectedSide === null
      ? null
      : renderEyeEditor(poseWithAvatarEyes(expression, avatarEyes), surface, selectedSide)
  const selectedBodyPath = (() => {
    if (!bodyEditing || !selectedBodyNodeId) return null
    return findBodyNodePath(scene, selectedBodyNodeId)
  })()

  const toSvg = (event: React.PointerEvent<SVGElement>): readonly [number, number] => {
    const rectangle = svgRef.current!.getBoundingClientRect()
    return [
      ((event.clientX - rectangle.left) / rectangle.width) * 300 - 150,
      ((event.clientY - rectangle.top) / rectangle.height) * 300 - 150,
    ]
  }
  const unitVector = (from: Point3, to: Point3): readonly [number, number] => {
    const x = to[0] - from[0]
    const y = to[1] - from[1]
    const length = Math.hypot(x, y) || 1
    return [x / length, y / length]
  }
  const startDrag = (event: React.PointerEvent<SVGElement>) => {
    const session = beginManipulationFromRenderedValue(onManipulationStart)
    const renderedExpression = session.initial
    onBodyNodeSelect('primary')
    onHighlightChange('head')
    drag.current = {
      type: 'arcball',
      startPoint: toSvg(event),
      expression: renderedExpression,
    }
    canvasManipulation.current = session
    setActiveDragType('arcball')
    svgRef.current!.setPointerCapture(event.pointerId)
  }
  const selectBodyPath = (
    event: React.PointerEvent<SVGPathElement>,
    nodeId: string | null | undefined
  ) => {
    if (!nodeId || !bodyEditing) {
      startDrag(event)
      return
    }
    event.stopPropagation()
    onBodyNodeSelect(nodeId)
  }
  const selectEye = (side: -1 | 1, event: React.PointerEvent<SVGPathElement>) => {
    event.stopPropagation()
    onBodyNodeSelect(null)
    onEyeSelect(side)
  }
  const startHandle = (
    type: 'width' | 'height' | 'size' | 'spacing' | 'rotate',
    event: React.PointerEvent<SVGElement>
  ) => {
    event.stopPropagation()
    if (selectedSide === null || !editor) return
    const session = beginManipulationFromRenderedValue(onManipulationStart)
    const renderedExpression = session.initial
    onHighlightChange(selectedSide < 0 ? 'left' : 'right')
    const point = toSvg(event)
    const editableExpression = bodyEditing
      ? applyAvatarEyeDefaults(renderedExpression, avatarEyes)
      : renderedExpression
    const livePose = poseWithAvatarEyes(renderedExpression, avatarEyes)
    const liveEditor = renderEyeEditor(livePose, surface, selectedSide)
    const leftEditor = renderEyeEditor(livePose, surface, -1)
    const rightEditor = renderEyeEditor(livePose, surface, 1)
    drag.current = {
      type,
      side: selectedSide,
      startPoint: point,
      expression: editableExpression,
      center: liveEditor.center,
      widthAxis: unitVector(liveEditor.center, liveEditor.widthHandle),
      heightAxis: unitVector(liveEditor.center, liveEditor.heightHandle),
      spacingAxis: unitVector(leftEditor.center, rightEditor.center),
      startPointerAngle: Math.atan2(
        point[1] - liveEditor.center[1],
        point[0] - liveEditor.center[0]
      ),
      startDistance: Math.max(
        Math.hypot(point[0] - liveEditor.center[0], point[1] - liveEditor.center[1]),
        1
      ),
    }
    canvasManipulation.current = beginManipulation(editableExpression)
    setActiveDragType(type)
    svgRef.current!.setPointerCapture(event.pointerId)
  }
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return
    const point = toSvg(event)
    if (drag.current.type === 'arcball') {
      const next = rotateExpressionWithArcball(
        drag.current.expression,
        drag.current.startPoint,
        point
      )
      if (canvasManipulation.current) {
        previewManipulation(canvasManipulation.current, next, value => onPreview(value, 'head'))
      }
      return
    }
    const interaction = drag.current
    const suffix = interaction.side < 0 ? 'Left' : 'Right'
    const deltaX = point[0] - interaction.startPoint[0]
    const deltaY = point[1] - interaction.startPoint[1]
    const along = (axis: readonly [number, number]) => deltaX * axis[0] + deltaY * axis[1]
    let next = { ...interaction.expression }
    const side = interaction.side < 0 ? 'Left' : 'Right'
    if (interaction.type === 'width') {
      const value = bounded(
        interaction.expression[`width${suffix}`] + along(interaction.widthAxis) * 2,
        10,
        100
      )
      next = updateEyeDimension(interaction.expression, side, 'width', value, linked.width)
    } else if (interaction.type === 'height') {
      const value = bounded(
        interaction.expression[`height${suffix}`] + along(interaction.heightAxis) * 2,
        10,
        100
      )
      next = updateEyeDimension(interaction.expression, side, 'height', value, linked.height)
    } else if (interaction.type === 'size') {
      const distance = Math.hypot(
        point[0] - interaction.center[0],
        point[1] - interaction.center[1]
      )
      const factor = distance / interaction.startDistance
      const targetSize =
        Math.max(
          interaction.expression[`width${suffix}`],
          interaction.expression[`height${suffix}`]
        ) * factor
      next = scaleEye(interaction.expression, side, targetSize, linked.size)
    } else if (interaction.type === 'spacing') {
      const startSpacing = interaction.expression.spacing
      const spacing = bounded(startSpacing + along(interaction.spacingAxis), 0, 150)
      next.spacing = spacing
    } else {
      const currentAngle = Math.atan2(
        point[1] - interaction.center[1],
        point[0] - interaction.center[0]
      )
      const deltaAngle = Math.atan2(
        Math.sin(currentAngle - interaction.startPointerAngle),
        Math.cos(currentAngle - interaction.startPointerAngle)
      )
      next[interaction.side < 0 ? 'leftAngle' : 'rightAngle'] =
        interaction.expression[interaction.side < 0 ? 'leftAngle' : 'rightAngle'] +
        (deltaAngle * 180) / Math.PI
    }
    const targetExpression = onPreview(next, 'eyes') ?? next
    if (canvasManipulation.current) {
      previewManipulation(canvasManipulation.current, targetExpression)
    }
  }
  const commitDrag = () => {
    const interaction = drag.current
    const session = canvasManipulation.current
    if (interaction && session) {
      finishManipulation(session, 'commit', {
        preview: value => onPreview(value, interaction.type === 'arcball' ? 'head' : 'eyes'),
        commit: interaction.type === 'arcball' ? onChange : (onEyeChange ?? onChange),
      })
    }
    canvasManipulation.current = null
    drag.current = null
    setActiveDragType(null)
    onHighlightChange(null)
  }
  const cancelDrag = () => {
    const interaction = drag.current
    const session = canvasManipulation.current
    if (interaction && session) {
      finishManipulation(session, 'cancel', {
        preview: value => onPreview(value, interaction.type === 'arcball' ? 'head' : 'eyes'),
        commit: onChange,
      })
    }
    canvasManipulation.current = null
    drag.current = null
    setActiveDragType(null)
    onHighlightChange(null)
  }
  useEscapeToCancel(cancelDrag)
  return (
    <div className={`avatar-wrap${renderStyle.type === 'pixel' ? ' is-pixel-rendered' : ''}`}>
      {playback && (
        <motion.div
          className="stage-playback-status"
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
        >
          <PlaybackIdentity name={playback.name} status={playback.status} />
        </motion.div>
      )}
      {renderStyle.type === 'pixel' && (
        <LivePixelAvatarCanvas
          scene={scene}
          colors={colors}
          style={renderStyle}
          className="avatar-pixel-canvas"
        />
      )}
      <svg
        ref={svgRef}
        className="avatar"
        viewBox="-150 -150 300 300"
        role="img"
        aria-label={t('Avatar procédural')}
        onPointerMove={move}
        onPointerUp={commitDrag}
        onPointerCancel={cancelDrag}
      >
        <defs>
          <clipPath id="avatar-head-clip">
            <motion.path d={headPath} />
          </clipPath>
          <clipPath id="avatar-left-eye-clip">
            <motion.path d={leftPath} />
          </clipPath>
          <clipPath id="avatar-right-eye-clip">
            <motion.path d={rightPath} />
          </clipPath>
          <linearGradient id="liquid-glass-blue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="1" />
          </linearGradient>
          <radialGradient id="cloud-ambient-grad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#e8f3fe" />
            <stop offset="85%" stopColor="#c5e1fd" />
            <stop offset="100%" stopColor="#99c8fc" />
          </radialGradient>
          <linearGradient id="halo-glow-grad" x1="0%" y1="0%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#bae6fd" />
            <stop offset="50%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="nebians-book-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <filter id="glass-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {Object.entries(nodeStyles.current).map(([nodeId, style]: [string, AvatarNodeStyle]) => {
            if (!nodeUsesGradient(style)) return null
            const gradientId = nodeGradientId('stage-node', nodeId)
            const from = style.color || 'var(--avatar-body-color, #5b7fe5)'
            const to = style.colorTo || (style.material === 'metallic' ? '#f8fafc' : from)
            if (style.gradientType === 'radial' || style.gradientType === 'glow') {
              return (
                <radialGradient key={gradientId} id={gradientId} cx="34%" cy="28%" r="74%">
                  <stop
                    offset="0%"
                    stopColor={to}
                    stopOpacity={style.material === 'glass' ? 0.9 : 1}
                  />
                  <stop offset="58%" stopColor={from} />
                  <stop
                    offset="100%"
                    stopColor={style.colorTo || from}
                    stopOpacity={style.material === 'glass' ? 0.76 : 1}
                  />
                </radialGradient>
              )
            }
            return (
              <linearGradient key={gradientId} id={gradientId} x1="12%" y1="8%" x2="88%" y2="92%">
                <stop offset="0%" stopColor={style.material === 'metallic' ? '#f8fafc' : from} />
                <stop offset="48%" stopColor={from} />
                <stop offset="100%" stopColor={to} />
              </linearGradient>
            )
          })}
          {Object.entries(nodeStyles.current).map(([nodeId, style]: [string, AvatarNodeStyle]) =>
            nodeShouldGlow(style) ? (
              <filter
                key={nodeFilterId('stage-node', nodeId)}
                id={nodeFilterId('stage-node', nodeId)}
                x="-35%"
                y="-35%"
                width="170%"
                height="170%"
              >
                <feGaussianBlur stdDeviation="4.5" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ) : null
          )}
          <OrbitalArcsCanvasDefs effect={activeEffect} scale={surface.width * 0.52} />
        </defs>
        <motion.g style={{ x: offsetX, y: offsetY }}>
          <OrbitalArcsCanvasLayer effect={activeEffect} scale={surface.width * 0.52} layer="back" />
          {backPaths.map((pathValue: any, index: number) => {
            const nodeId = backNodeIds.current[index]
            const style = nodeId ? nodeStyles.current[nodeId] : undefined
            const fill = resolveNodeFill(style, undefined, 'stage-node', nodeId)
            const opacity = resolveNodeOpacity(style)
            const filter =
              nodeId && nodeShouldGlow(style)
                ? `url(#${nodeFilterId('stage-node', nodeId)})`
                : undefined
            return (
              <motion.path
                className={`avatar-head ${highlight === 'head' ? 'cyan-outline' : ''}`}
                d={pathValue}
                key={index}
                style={{
                  fill,
                  opacity,
                  filter,
                }}
                onPointerDown={event => selectBodyPath(event, backNodeIds.current[index])}
              />
            )
          })}
          <motion.path
            className={`avatar-head ${highlight === 'head' ? 'cyan-outline' : ''}`}
            d={headPath}
            onPointerDown={event => {
              onBodyNodeSelect('primary')
              startDrag(event)
            }}
          />
          <g clipPath="url(#avatar-head-clip)">
            {decalPaths.map((pathValue: any, index: number) => {
              const fill = decalFills.current[index]
              if (!fill) return null
              return (
                <motion.path
                  key={`decal-${index}`}
                  d={pathValue}
                  style={{
                    fill,
                    opacity: decalOpacities.current[index] ?? 1,
                  }}
                />
              )
            })}
            {(showWire || highlight === 'head') &&
              wirePaths.map((pathValue: any, index: number) => (
                <motion.path className="wire" d={pathValue} key={index} />
              ))}
            {(!creatureEyesActive || !creatureEyesReady) && (
              <>
                <motion.path
                  className={`avatar-eye ${selectedSide === -1 || highlight === 'left' || highlight === 'both' ? 'cyan-outline' : ''}`}
                  d={leftPath}
                  opacity={leftOpacity}
                  style={renderedColors ? { fill: renderedColors.eyes } : undefined}
                  onPointerDown={event => selectEye(-1, event)}
                />
                <motion.path
                  className="avatar-pupil"
                  d={leftPupilPath}
                  opacity={leftOpacity}
                  style={
                    renderedColors
                      ? { fill: renderedColors.pupil }
                      : { fill: 'var(--avatar-pupil-color, var(--avatar-eye-color))' }
                  }
                  pointerEvents="none"
                />
                <motion.path
                  className={`avatar-eye ${selectedSide === 1 || highlight === 'right' || highlight === 'both' ? 'cyan-outline' : ''}`}
                  d={rightPath}
                  opacity={rightOpacity}
                  style={renderedColors ? { fill: renderedColors.eyes } : undefined}
                  onPointerDown={event => selectEye(1, event)}
                />
                <motion.path
                  className="avatar-pupil"
                  d={rightPupilPath}
                  opacity={rightOpacity}
                  style={
                    renderedColors
                      ? { fill: renderedColors.pupil }
                      : { fill: 'var(--avatar-pupil-color, var(--avatar-eye-color))' }
                  }
                  pointerEvents="none"
                />
              </>
            )}
            {creatureEyesActive && (
              <>
                <CreatureEyeSvgLayer
                  shape={creatureShape}
                  paletteIndex={creaturePaletteIndex}
                  frame={creatureEyeFrame}
                  pathSnapshot={creatureEyePaths}
                  onReadyChange={setCreatureEyesReady}
                />
                <motion.path
                  className={`creature-eye-hit-target ${selectedSide === -1 || highlight === 'left' || highlight === 'both' ? 'cyan-outline' : ''}`}
                  d={leftPath}
                  opacity={
                    selectedSide === -1 || highlight === 'left' || highlight === 'both'
                      ? leftOpacity
                      : 0
                  }
                  onPointerDown={event => selectEye(-1, event)}
                />
                <motion.path
                  className={`creature-eye-hit-target ${selectedSide === 1 || highlight === 'right' || highlight === 'both' ? 'cyan-outline' : ''}`}
                  d={rightPath}
                  opacity={
                    selectedSide === 1 || highlight === 'right' || highlight === 'both'
                      ? rightOpacity
                      : 0
                  }
                  onPointerDown={event => selectEye(1, event)}
                />
              </>
            )}
            <motion.path
              className="avatar-mouth"
              d={mouthPath}
              opacity={mouthOpacity}
              stroke="var(--avatar-eye-color, #111316)"
              strokeWidth={expression.mouthStrokeWidth ?? 3.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
          {frontPaths.map((pathValue: any, index: number) => {
            const nodeId = frontNodeIds.current[index]
            const style = nodeId ? nodeStyles.current[nodeId] : undefined
            const fill = resolveNodeFill(style, undefined, 'stage-node', nodeId)
            const opacity = resolveNodeOpacity(style)
            const filter =
              nodeId && nodeShouldGlow(style)
                ? `url(#${nodeFilterId('stage-node', nodeId)})`
                : undefined
            return (
              <motion.path
                className={`avatar-head ${highlight === 'head' ? 'cyan-outline' : ''}`}
                d={pathValue}
                key={index}
                style={{
                  fill,
                  opacity,
                  filter,
                }}
                onPointerDown={event => selectBodyPath(event, frontNodeIds.current[index])}
              />
            )
          })}
          <OrbitalArcsCanvasLayer
            effect={activeEffect}
            scale={surface.width * 0.52}
            layer="front"
          />
        </motion.g>
        <AvatarEffectLayer effect={visualEffect} />
        {selectedBodyPath && (
          <motion.path className="selection-outline body-selection-outline" d={selectedBodyPath} />
        )}
        {bodyEditing && selectedBodyNode && (
          <BodyNodeGizmo
            svgRef={svgRef}
            pose={poseWithAvatarEyes(expression, avatarEyes)}
            node={selectedBodyNode}
            onPreview={onBodyNodePreview}
            onCommit={onBodyNodeChange}
          />
        )}
        {editor?.visible && (
          <g className="eye-editor">
            {activeDragType !== null && activeDragType !== 'arcball' && (
              <path className="selection-outline" d={editor.selectionPath} />
            )}
            <path className="editor-guide" d={editor.widthGuide} />
            <path className="editor-guide" d={editor.heightGuide} />
            <path className="editor-guide" d={editor.rotationGuide} />
            <path className="editor-guide" d={editor.spacingGuide} />
            <EditorCircle point={editor.widthHandle} label="L" type="width" onStart={startHandle} />
            <EditorCircle
              point={editor.heightHandle}
              label="H"
              type="height"
              onStart={startHandle}
            />
            <EditorCircle
              point={editor.rotateHandle}
              label="R"
              type="rotate"
              onStart={startHandle}
            />
            <EditorSquare point={editor.sizeHandle} label="S" type="size" onStart={startHandle} />
            <EditorSquare
              point={editor.spacingHandle}
              label="E"
              type="spacing"
              onStart={startHandle}
            />
          </g>
        )}
      </svg>
      <RotationGizmo
        expression={expression}
        rendered={rotationGizmo}
        onPreview={next => onPreview(next, 'head')}
        onChange={onChange}
        onActiveChange={active => onHighlightChange(active ? 'head' : null)}
        onReset={() => onReset({ ...expression, headX: 0, headY: 0, headZ: 0 })}
      />
      <div className="axis-key">
        <i className="x" />X <i className="y" />Y <i className="z" />Z
      </div>
    </div>
  )
}

type EyeHandle = 'width' | 'height' | 'size' | 'spacing' | 'rotate'
type HandleStart = (type: EyeHandle, event: React.PointerEvent<SVGElement>) => void

export function EditorCircle({
  point,
  label,
  type,
  onStart,
}: {
  point: Point3
  label: string
  type: EyeHandle
  onStart: HandleStart
}) {
  return (
    <g
      className="editor-control"
      data-eye-handle={type}
      onPointerDown={event => onStart(type, event)}
    >
      <circle className="editor-handle" cx={point[0]} cy={point[1]} r="5.5" />
      <text className="editor-label" x={point[0]} y={point[1] + 2.6}>
        {label}
      </text>
    </g>
  )
}

export function EditorSquare({
  point,
  label,
  type,
  onStart,
}: {
  point: Point3
  label: string
  type: EyeHandle
  onStart: HandleStart
}) {
  return (
    <g
      className="editor-control"
      data-eye-handle={type}
      onPointerDown={event => onStart(type, event)}
    >
      <rect
        className="editor-handle"
        x={point[0] - 5}
        y={point[1] - 5}
        width="10"
        height="10"
        rx="2"
      />
      <text className="editor-label" x={point[0]} y={point[1] + 2.6}>
        {label}
      </text>
    </g>
  )
}
