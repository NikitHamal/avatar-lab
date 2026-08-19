import { ArrowLeft, Copy, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useState, type RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Switch } from '@/components/ui/switch'
import { useStudioLanguage } from '@/i18n'

import { ControlSection } from '@/app/components/common'
import { AmbientMotionField, ColorField, LinkButton, NumericField } from '@/app/components/controls'
import { emptyBodyNodes, getPreviewGeometry, resolveColors, type Side } from '@/app/studio-utils'
import {
  type AvatarColors,
  type AvatarEyeDefaults,
  type AvatarEyeRenderer,
  type AvatarRenderStyle,
} from '@/features/avatar/avatars'
import { type BodyNode } from '@/features/avatar/body'
import { scaleEye, updateEyeDimension } from '@/features/avatar/expressionEditing'
import { type CreatureEyeFrame, type Expression, type EyeStyle } from '@/features/avatar/geometry'
import { AvatarEffectLayer } from '@/features/rendering/avatarEffects'
import {
  CREATURE_NATIVE_EYE_CENTER_X,
  CREATURE_NATIVE_EYE_CENTER_Y,
} from '@/features/creature/creatureExpression'
import { CREATURE_COLORWAYS } from '@/features/creature/creatureSwatches'
import { defaultExpression, getExpressionDisplayName } from '@/features/avatar/presets'
import { type SurfaceConfig } from '@/features/avatar/surfaces'
import {
  nodeGradientId,
  nodeShouldGlow,
  nodeUsesGradient,
  resolveNodeFill,
  resolveNodeOpacity,
} from '@/features/rendering/nodePaint'
import { StaticPixelAvatarCanvas } from '@/features/rendering/components/PixelAvatarCanvas'

type PreviewPoint = readonly [number, number]

const smoothPreviewPath = (points: PreviewPoint[]) => {
  if (points.length < 3) return ''
  const first = points[0]
  let result = `M${first[0].toFixed(2)} ${first[1].toFixed(2)}`
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const afterNext = points[(index + 2) % points.length]
    const control1: PreviewPoint = [
      current[0] + (next[0] - previous[0]) / 6,
      current[1] + (next[1] - previous[1]) / 6,
    ]
    const control2: PreviewPoint = [
      next[0] - (afterNext[0] - current[0]) / 6,
      next[1] - (afterNext[1] - current[1]) / 6,
    ]
    result += `C${control1[0].toFixed(2)} ${control1[1].toFixed(2)} ${control2[0].toFixed(2)} ${control2[1].toFixed(2)} ${next[0].toFixed(2)} ${next[1].toFixed(2)}`
  }
  return `${result}Z`
}

const creaturePreviewPoint = (eyeStyle: EyeStyle, layer: 'outer' | 'inner', angle: number) => {
  if (layer === 'inner') return [Math.cos(angle) * 0.082, Math.sin(angle) * 0.11] as const

  if (eyeStyle === 'circle') {
    return [Math.cos(angle) * 0.39, Math.sin(angle) * 0.39] as const
  }
  if (eyeStyle === 'cat') {
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    return [cosine * 0.43, Math.sign(sine) * Math.abs(sine) ** 1.35 * 0.34] as const
  }
  if (eyeStyle === 'acorn') {
    const sine = Math.sin(angle)
    const taper = 0.82 + (sine + 1) * 0.09
    return [Math.cos(angle) * 0.4 * taper, sine * 0.44] as const
  }
  return [Math.cos(angle) * 0.35, Math.sin(angle) * 0.42] as const
}

const creaturePreviewPath = (
  frame: CreatureEyeFrame,
  side: -1 | 1,
  layer: 'outer' | 'inner',
  eyeStyle: EyeStyle
) => {
  if (!frame.visible) return ''
  const rig = side < 0 ? frame.rig.left : frame.rig.right
  const anchorX = side * CREATURE_NATIVE_EYE_CENTER_X
  const anchorY = CREATURE_NATIVE_EYE_CENTER_Y
  const pupilOffsetX = layer === 'inner' ? -side * 0.12 + frame.rig.gazeX * 0.08 : 0
  const pupilOffsetY = layer === 'inner' ? -frame.rig.gazeY * 0.07 : 0
  const cosine = Math.cos(rig.rotation)
  const sine = Math.sin(rig.rotation)

  const points = Array.from({ length: 24 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2
    const [contourX, contourY] = creaturePreviewPoint(eyeStyle, layer, angle)
    const sourceX = anchorX + pupilOffsetX + contourX
    const sourceY = anchorY + pupilOffsetY + contourY
    const localX = (sourceX - anchorX) * rig.widthScale
    const localY = (sourceY - anchorY) * rig.heightScale
    const rotatedX = localX * cosine - localY * sine
    const rotatedY = localX * sine + localY * cosine
    const x = anchorX + rig.offsetX + rotatedX
    const y = anchorY + rig.offsetY + rotatedY
    return [
      frame.center[0] + frame.xAxis[0] * x + frame.yAxis[0] * y,
      frame.center[1] + frame.xAxis[1] * x + frame.yAxis[1] * y,
    ] as PreviewPoint
  })
  return smoothPreviewPath(points)
}

export function SurfaceThumbnail({ surface }: { surface: SurfaceConfig }) {
  const geometry = getPreviewGeometry(defaultExpression, surface, emptyBodyNodes)
  return (
    <svg viewBox="-150 -150 300 300" aria-hidden="true">
      {geometry.backPaths.map((pathValue, index) => (
        <path d={pathValue} key={index} />
      ))}
      <path d={geometry.headPath} />
    </svg>
  )
}

export function ExpressionPreview({
  expression,
  surface,
  bodyNodes,
  colors,
  avatarEyes,
  eyeRenderer = 'classic',
  creaturePaletteIndex = 52,
  renderStyle = { type: 'vector' },
  id,
}: {
  expression: Expression
  surface: SurfaceConfig
  bodyNodes: BodyNode[]
  colors: AvatarColors
  avatarEyes: AvatarEyeDefaults
  eyeRenderer?: AvatarEyeRenderer
  creaturePaletteIndex?: number
  renderStyle?: AvatarRenderStyle
  id: string
}) {
  const geometry = getPreviewGeometry(expression, surface, bodyNodes, avatarEyes)
  const resolvedColors = resolveColors(expression, colors)

  if (renderStyle?.type === 'pixel') {
    return (
      <StaticPixelAvatarCanvas
        className="avatar-preview"
        style={renderStyle}
        frame={{
          headPath: geometry.headPath,
          backPaths: geometry.backPaths,
          frontPaths: geometry.frontPaths,
          leftPath: geometry.leftPath,
          rightPath: geometry.rightPath,
          leftOpacity: geometry.leftVisible ? 1 : 0,
          rightOpacity: geometry.rightVisible ? 1 : 0,
          offsetX: 0,
          offsetY: 0,
          bodyColor: resolvedColors.body,
          eyeColor: resolvedColors.eyes,
        }}
      />
    )
  }

  const creatureColorway =
    CREATURE_COLORWAYS[creaturePaletteIndex] ?? CREATURE_COLORWAYS[52] ?? CREATURE_COLORWAYS[0]
  const creatureFrame = geometry.creatureEyeFrame
  const creatureEyeStyle = expression.eyeStyle ?? avatarEyes.eyeStyle ?? 'dot'
  const creatureLeftOuter =
    eyeRenderer === 'creature' && creatureFrame
      ? creaturePreviewPath(creatureFrame, -1, 'outer', creatureEyeStyle)
      : ''
  const creatureRightOuter =
    eyeRenderer === 'creature' && creatureFrame
      ? creaturePreviewPath(creatureFrame, 1, 'outer', creatureEyeStyle)
      : ''
  const creatureLeftInner =
    eyeRenderer === 'creature' && creatureFrame
      ? creaturePreviewPath(creatureFrame, -1, 'inner', creatureEyeStyle)
      : ''
  const creatureRightInner =
    eyeRenderer === 'creature' && creatureFrame
      ? creaturePreviewPath(creatureFrame, 1, 'inner', creatureEyeStyle)
      : ''
  const clipId = `preview-${id}`
  return (
    <svg className="avatar-preview" viewBox="-150 -150 300 300" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={geometry.headPath} />
        </clipPath>
        {Object.entries(geometry.nodeStyles ?? {}).map(([nodeId, style]) => {
          if (!nodeUsesGradient(style)) return null
          const gradientId = nodeGradientId(clipId, nodeId)
          const from = style.color || resolvedColors.body
          const to = style.colorTo || (style.material === 'metallic' ? '#f8fafc' : from)
          if (style.gradientType === 'radial' || style.gradientType === 'glow') {
            return (
              <radialGradient key={gradientId} id={gradientId} cx="34%" cy="28%" r="74%">
                <stop offset="0%" stopColor={to} />
                <stop offset="58%" stopColor={from} />
                <stop offset="100%" stopColor={style.colorTo || from} />
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
        <filter id={`${clipId}-glow`} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="4" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {geometry.orbitalArcs?.map(arc => (
          <linearGradient
            key={`grad-${arc.id}`}
            id={`${clipId}-grad-${arc.id}`}
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
      </defs>
      {geometry.orbitalArcs
        ?.filter(arc => arc.back && arc.opacity > 0.01)
        .map(arc => (
          <path
            key={`back-${arc.id}`}
            d={arc.back}
            stroke={`url(#${clipId}-grad-${arc.id})`}
            strokeWidth={arc.width}
            strokeLinecap="round"
            fill="none"
            opacity={arc.opacity}
          />
        ))}
      {geometry.backPaths.map((pathValue, index) => {
        const nodeId = geometry.backNodeIds[index]
        const style = nodeId ? geometry.nodeStyles?.[nodeId] : undefined
        const fill = resolveNodeFill(style, resolvedColors.body, clipId, nodeId)
        const opacity = resolveNodeOpacity(style)
        const filter = nodeShouldGlow(style) ? `url(#${clipId}-glow)` : undefined
        return (
          <path
            className="preview-head"
            d={pathValue}
            key={index}
            style={{ fill, opacity, filter }}
          />
        )
      })}
      <path className="preview-head" d={geometry.headPath} style={{ fill: resolvedColors.body }} />
      <g clipPath={`url(#${clipId})`}>
        {geometry.decals?.map((decal, index) => (
          <path
            key={`decal-${index}`}
            d={decal.path}
            fill={decal.fill}
            opacity={decal.opacity ?? 1}
          />
        ))}
        {eyeRenderer === 'creature' && creatureFrame ? (
          <>
            <path
              className="preview-eye preview-creature-eye"
              d={creatureLeftOuter}
              opacity={geometry.leftVisible ? 1 : 0}
              style={{ fill: creatureColorway.body }}
            />
            <path
              className="preview-eye preview-creature-eye"
              d={creatureRightOuter}
              opacity={geometry.rightVisible ? 1 : 0}
              style={{ fill: creatureColorway.body }}
            />
            <path
              className="preview-pupil preview-creature-pupil"
              d={creatureLeftInner}
              opacity={geometry.leftVisible ? 1 : 0}
              style={{ fill: creatureColorway.pupil ?? creatureColorway.eyes }}
            />
            <path
              className="preview-pupil preview-creature-pupil"
              d={creatureRightInner}
              opacity={geometry.rightVisible ? 1 : 0}
              style={{ fill: creatureColorway.pupil ?? creatureColorway.eyes }}
            />
          </>
        ) : (
          <>
            <path
              className="preview-eye"
              d={geometry.leftPath}
              opacity={geometry.leftVisible ? 1 : 0}
              style={{ fill: resolvedColors.eyes }}
            />
            {geometry.leftPupilPath && (
              <path
                className="preview-pupil"
                d={geometry.leftPupilPath}
                opacity={geometry.leftVisible ? 1 : 0}
                style={{ fill: resolvedColors.pupil || resolvedColors.eyes }}
              />
            )}
            <path
              className="preview-eye"
              d={geometry.rightPath}
              opacity={geometry.rightVisible ? 1 : 0}
              style={{ fill: resolvedColors.eyes }}
            />
            {geometry.rightPupilPath && (
              <path
                className="preview-pupil"
                d={geometry.rightPupilPath}
                opacity={geometry.rightVisible ? 1 : 0}
                style={{ fill: resolvedColors.pupil || resolvedColors.eyes }}
              />
            )}
          </>
        )}
        {geometry.mouthVisible && geometry.mouthPath && (
          <path
            d={geometry.mouthPath}
            stroke={resolvedColors.eyes}
            strokeWidth={expression.mouthStrokeWidth ?? 3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
      </g>
      {geometry.frontPaths.map((pathValue, index) => {
        const nodeId = geometry.frontNodeIds[index]
        const style = nodeId ? geometry.nodeStyles?.[nodeId] : undefined
        const fill = resolveNodeFill(style, resolvedColors.body, clipId, nodeId)
        const opacity = resolveNodeOpacity(style)
        const filter = nodeShouldGlow(style) ? `url(#${clipId}-glow)` : undefined
        return (
          <path
            className="preview-head"
            d={pathValue}
            key={`front-${index}`}
            style={{ fill, opacity, filter }}
          />
        )
      })}
      {geometry.orbitalArcs
        ?.filter(arc => arc.front && arc.opacity > 0.01)
        .map(arc => (
          <path
            key={`front-${arc.id}`}
            d={arc.front}
            stroke={`url(#${clipId}-grad-${arc.id})`}
            strokeWidth={arc.width}
            strokeLinecap="round"
            fill="none"
            opacity={arc.opacity}
          />
        ))}
      <AvatarEffectLayer effect={expression.effect} />
    </svg>
  )
}

export function ExpressionCard({
  expression,
  index,
  active,
  surface,
  bodyNodes,
  colors,
  avatarEyes,
  eyeRenderer = 'classic',
  creaturePaletteIndex = 52,
  renderStyle,
  previewId,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  draggable,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDrop,
  onDragEnd,
  runtimeError,
}: {
  expression: Expression
  index: number
  active: boolean
  surface: SurfaceConfig
  bodyNodes: BodyNode[]
  colors: AvatarColors
  avatarEyes: AvatarEyeDefaults
  eyeRenderer?: AvatarEyeRenderer
  creaturePaletteIndex?: number
  renderStyle: AvatarRenderStyle
  previewId: string
  onSelect: () => void
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  draggable?: boolean
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragEnter?: () => void
  onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void
  onDrop?: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd?: () => void
  runtimeError: string | null
}) {
  const { t } = useStudioLanguage()
  const card = (
    <Button
      className="expression-card"
      variant="outline"
      aria-pressed={active}
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onDoubleClick={onEdit}
    >
      <ExpressionPreview
        expression={expression}
        surface={surface}
        bodyNodes={bodyNodes}
        colors={colors}
        avatarEyes={avatarEyes}
        eyeRenderer={eyeRenderer}
        creaturePaletteIndex={creaturePaletteIndex}
        renderStyle={renderStyle}
        id={previewId}
      />
      {runtimeError && (
        <i
          className="runtime-key-missing"
          role="img"
          aria-label={runtimeError}
          title={runtimeError}
        >
          !
        </i>
      )}
      <span title={expression.id}>{t(getExpressionDisplayName(expression, index))}</span>
    </Button>
  )
  if (!onEdit) return card
  return (
    <ContextMenu>
      <ContextMenuTrigger render={card} />
      <ContextMenuContent>
        <ContextMenuItem onClick={onEdit}>
          <Pencil /> {t('Modifier')}
        </ContextMenuItem>
        {onDuplicate && (
          <ContextMenuItem onClick={onDuplicate}>
            <Copy /> {t('Dupliquer')}
          </ContextMenuItem>
        )}
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 /> {t('Supprimer')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function ExpressionWorkspace({
  editing,
  avatarColors,
  mouthEnabled,
  onMouthEnabledChange,
  backButtonRef,
  onChange,
  onCancel,
  onSave,
  onDuplicate,
  onDelete,
  semanticKeyError,
}: {
  editing: { index: number | null; draft: Expression }
  avatarColors: AvatarColors
  mouthEnabled: boolean
  onMouthEnabledChange: (enabled: boolean) => void
  backButtonRef: RefObject<HTMLButtonElement | null>
  onChange: (draft: Expression) => void
  onCancel: () => void
  onSave: () => void
  onDuplicate: () => void
  onDelete: () => void
  semanticKeyError: string | null
}) {
  const { t } = useStudioLanguage()
  const [linked, setLinked] = useState({
    width: true,
    height: true,
    size: true,
    rotation: true,
  })
  const update = (changes: Partial<Expression>) => onChange({ ...editing.draft, ...changes })
  const updateDimension = (side: Side, dimension: 'width' | 'height', value: number) => {
    onChange(updateEyeDimension(editing.draft, side, dimension, value, linked[dimension]))
  }
  const updateSize = (side: Side, value: number) => {
    onChange(scaleEye(editing.draft, side, value, linked.size))
  }
  const updateRotation = (side: Side, value: number) => {
    onChange({
      ...editing.draft,
      [side === 'Left' ? 'leftAngle' : 'rightAngle']: value,
      ...(linked.rotation ? { [side === 'Left' ? 'rightAngle' : 'leftAngle']: -value } : {}),
    })
  }

  return (
    <>
      <header className="workspace-header">
        <Button
          ref={backButtonRef}
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label={t('Retour aux expressions')}
        >
          <ArrowLeft />
        </Button>
        <div className="workspace-heading">
          <p className="eyebrow">{t('Preset en mémoire')}</p>
          <h1>
            {editing.index === null
              ? t('Nouvelle expression')
              : t(`Modifier l’expression ${String(editing.index).padStart(2, '0')}`)}
          </h1>
          <p>{t('L’avatar à gauche affiche cette expression en direct.')}</p>
        </div>
        {editing.index === null && (
          <Button
            className="workspace-header-reset"
            variant="outline"
            size="icon"
            type="button"
            aria-label={t('Réinitialiser')}
            onClick={() => onChange({ ...defaultExpression })}
          >
            <RotateCcw />
          </Button>
        )}
      </header>
      <div className="workspace-scroll">
        <div className="dialog-fields">
          <ControlSection
            title="Identité runtime"
            subtitle="Nom public stable utilisé par les applications qui chargent cet avatar."
            compact
          >
            <Card className="dialog-group semantic-key-card">
              <Field>
                <label
                  className="semantic-key-label"
                  htmlFor={`expression-key-${editing.draft.id}`}
                >
                  {t('Clé sémantique')}
                </label>
                <Input
                  id={`expression-key-${editing.draft.id}`}
                  value={editing.draft.semanticKey ?? ''}
                  maxLength={64}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  aria-invalid={Boolean(semanticKeyError)}
                  aria-describedby={`expression-key-help-${editing.draft.id}`}
                  onChange={event =>
                    update({ semanticKey: event.currentTarget.value || undefined })
                  }
                />
                <p
                  id={`expression-key-help-${editing.draft.id}`}
                  className={semanticKeyError ? 'semantic-key-error' : 'field-help'}
                  role={semanticKeyError ? 'alert' : undefined}
                >
                  {semanticKeyError ??
                    t('Clé publique stable utilisée par l’API runtime, par exemple happy-smile.')}
                </p>
              </Field>
            </Card>
          </ControlSection>
          <ControlSection
            title="Corps"
            subtitle="Apparence et orientation générale de l’avatar."
            compact
          >
            <Card className="dialog-group color-panel">
              <h3>{t('Couleur du corps')}</h3>
              <ColorField
                label="Corps"
                value={editing.draft.bodyColor ?? avatarColors.body}
                onChange={bodyColor => update({ bodyColor })}
              />
              {editing.draft.bodyColor && (
                <Button
                  className="inherit-colors"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('Reprendre la couleur de l’avatar')}
                  onClick={() => {
                    const draft = { ...editing.draft }
                    delete draft.bodyColor
                    onChange(draft)
                  }}
                >
                  <RotateCcw />
                </Button>
              )}
            </Card>
            <Card className="dialog-group">
              <h3>{t('Mouvement perpétuel')}</h3>
              <AmbientMotionField
                label="Corps"
                value={editing.draft.bodyMotion}
                options={[
                  { value: 'none', label: 'Aucun mouvement' },
                  { value: 'slowDrift', label: 'Dérive lente' },
                  { value: 'breathe', label: 'Respiration' },
                  { value: 'bob', label: 'Hochement doux' },
                  { value: 'bounce', label: 'Rebond' },
                  { value: 'sway', label: 'Balancement' },
                  { value: 'float', label: 'Flottement' },
                  { value: 'shake', label: 'Tremblement' },
                ]}
                onChange={bodyMotion => update({ bodyMotion })}
              />
              <p className="field-help">
                {t('Ajoute une légère présence ou un tremblement continu au corps.')}
              </p>
            </Card>
            <Card className="dialog-group color-panel">
              <h3>{t('Rotation de la tête')}</h3>
              {(['headX', 'headY', 'headZ'] as const).map(field => (
                <NumericField
                  key={field}
                  label={`Rotation ${field.at(-1)?.toUpperCase()}`}
                  value={editing.draft[field]}
                  unit="°"
                  onChange={value => update({ [field]: value })}
                />
              ))}
            </Card>
          </ControlSection>
          <ControlSection
            title="Yeux"
            subtitle="Forme, placement et orientation propres au regard."
            compact
          >
            <Card className="dialog-group color-panel">
              <h3>{t('Couleur des yeux')}</h3>
              <ColorField
                label="Yeux"
                value={editing.draft.eyeColor ?? avatarColors.eyes}
                onChange={eyeColor => update({ eyeColor })}
              />
              {editing.draft.eyeColor && (
                <Button
                  className="inherit-colors"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('Reprendre la couleur de l’avatar')}
                  onClick={() => {
                    const draft = { ...editing.draft }
                    delete draft.eyeColor
                    onChange(draft)
                  }}
                >
                  <RotateCcw />
                </Button>
              )}
            </Card>
            <Card className="dialog-group">
              <h3>{t('Mouvement perpétuel')}</h3>
              <AmbientMotionField
                label="Yeux"
                value={editing.draft.eyeMotion}
                options={[
                  { value: 'none', label: 'Aucun mouvement' },
                  { value: 'microSaccades', label: 'Micro-ajustements' },
                  { value: 'wander', label: 'Regard errant' },
                  { value: 'lookAround', label: 'Balayage du regard' },
                  { value: 'focusPulse', label: 'Focus vivant' },
                  { value: 'dart', label: 'Saccades rapides' },
                  { value: 'orbit', label: 'Orbites / eye-roll' },
                  { value: 'squintPulse', label: 'Plissement vivant' },
                  { value: 'sparkle', label: 'Pétillant / euphorique' },
                  { value: 'anticipate', label: 'Anticipation' },
                  { value: 'shake', label: 'Tremblement' },
                ]}
                onChange={eyeMotion => update({ eyeMotion })}
              />
              <p className="field-help">
                {t(
                  'Anime le regard avec des micro-jeux, darts, squints, orbites et anticipations pensés pour jouer l’émotion sans bouche.'
                )}
              </p>
            </Card>
            {(['width', 'height', 'size'] as const).map(dimension => (
              <Card className="dialog-group" key={dimension}>
                <div className="panel-inline-title">
                  <h3>
                    {t(
                      { width: 'Largeur', height: 'Hauteur', size: 'Taille proportionnelle' }[
                        dimension
                      ]
                    )}
                  </h3>
                  <LinkButton
                    linked={linked[dimension]}
                    label={`Lier ${dimension}`}
                    onClick={() =>
                      setLinked(current => ({ ...current, [dimension]: !current[dimension] }))
                    }
                  />
                </div>
                <div className="eye-columns">
                  {(['Left', 'Right'] as Side[]).map(side => {
                    const width = editing.draft[`width${side}`]
                    const height = editing.draft[`height${side}`]
                    const value =
                      dimension === 'width'
                        ? width
                        : dimension === 'height'
                          ? height
                          : Math.max(width, height)
                    return (
                      <NumericField
                        key={side}
                        label={side === 'Left' ? 'Œil gauche' : 'Œil droit'}
                        value={value}
                        min={10}
                        max={dimension === 'size' ? 110 : 100}
                        unit="u"
                        onChange={next =>
                          dimension === 'size'
                            ? updateSize(side, next)
                            : updateDimension(side, dimension, next)
                        }
                      />
                    )
                  })}
                </div>
              </Card>
            ))}
            <Card className="dialog-group">
              <h3>{t('Position et espacement')}</h3>
              <div className="eye-columns">
                {(['Left', 'Right'] as Side[]).map(side => (
                  <div className="eye-column" key={side}>
                    <h3>{t(side === 'Left' ? 'Œil gauche' : 'Œil droit')}</h3>
                    <NumericField
                      label="Horizontale"
                      value={editing.draft[`positionX${side}`]}
                      unit="u"
                      onChange={value => update({ [`positionX${side}`]: value })}
                    />
                    <NumericField
                      label="Verticale"
                      value={editing.draft[`positionY${side}`]}
                      unit="u"
                      onChange={value => update({ [`positionY${side}`]: value })}
                    />
                  </div>
                ))}
              </div>
              <div className="position-spacing">
                <NumericField
                  label="Espacement"
                  value={editing.draft.spacing}
                  min={0}
                  max={150}
                  unit="u"
                  onChange={value => update({ spacing: value })}
                />
              </div>
            </Card>
            <Card className="dialog-group">
              <div className="panel-inline-title">
                <h3>{t('Rotation locale')}</h3>
                <LinkButton
                  linked={linked.rotation}
                  label="Lier les rotations"
                  onClick={() =>
                    setLinked(current => ({ ...current, rotation: !current.rotation }))
                  }
                />
              </div>
              <div className="eye-columns">
                <NumericField
                  label="Œil gauche"
                  value={editing.draft.leftAngle}
                  unit="°"
                  onChange={value => updateRotation('Left', value)}
                />
                <NumericField
                  label="Œil droit"
                  value={editing.draft.rightAngle}
                  unit="°"
                  onChange={value => updateRotation('Right', value)}
                />
              </div>
            </Card>
          </ControlSection>
          <ControlSection
            title="Bouche & personnalité"
            subtitle="Ajoute une bouche procédurale légère sans casser le style minimal de l’avatar."
            compact
          >
            <Card className="dialog-group">
              <div className="switch">
                <div>
                  <strong>{t('Bouche de cet avatar')}</strong>
                  <small>
                    {t('Désactivée par défaut : le jeu émotionnel reste porté par les yeux.')}
                  </small>
                </div>
                <Switch
                  checked={mouthEnabled}
                  onCheckedChange={onMouthEnabledChange}
                  aria-label={t('Activer la bouche pour cet avatar')}
                />
              </div>
              {mouthEnabled && (
                <>
                  <div className="switch">
                    <span>{t('Bouche dans cette expression')}</span>
                    <Switch
                      checked={Boolean(editing.draft.mouth && editing.draft.mouth !== 'none')}
                      onCheckedChange={enabled => update({ mouth: enabled ? 'smile' : 'none' })}
                      aria-label={t('Bouche dans cette expression')}
                    />
                  </div>
                  {editing.draft.mouth && editing.draft.mouth !== 'none' && (
                    <>
                      <AmbientMotionField<NonNullable<Expression['mouth']>>
                        label="Style de bouche"
                        value={editing.draft.mouth}
                        options={[
                          { value: 'none', label: 'Aucune' },
                          { value: 'smile', label: 'Sourire' },
                          { value: 'grin', label: 'Grand sourire' },
                          { value: 'openSmile', label: 'Sourire ouvert' },
                          { value: 'flat', label: 'Neutre' },
                          { value: 'frown', label: 'Triste' },
                          { value: 'smirk', label: 'Malicieux' },
                          { value: 'cat', label: 'Chat' },
                          { value: 'oMouth', label: 'Surprise' },
                          { value: 'kiss', label: 'Bisou' },
                        ]}
                        onChange={mouth => update({ mouth })}
                      />
                      <NumericField
                        label="Taille"
                        value={editing.draft.mouthScale ?? 1}
                        min={0.45}
                        max={1.8}
                        step={0.05}
                        unit="×"
                        onChange={mouthScale => update({ mouthScale })}
                      />
                      <NumericField
                        label="Largeur"
                        value={editing.draft.mouthWidth ?? 1}
                        min={0.45}
                        max={2.2}
                        step={0.05}
                        unit="×"
                        onChange={mouthWidth => update({ mouthWidth })}
                      />
                      <div className="eye-columns">
                        <NumericField
                          label="Position X"
                          value={editing.draft.mouthOffsetX ?? 0}
                          min={-48}
                          max={48}
                          step={1}
                          unit="u"
                          onChange={mouthOffsetX => update({ mouthOffsetX })}
                        />
                        <NumericField
                          label="Position Y"
                          value={editing.draft.mouthOffsetY ?? 0}
                          min={-48}
                          max={48}
                          step={1}
                          unit="u"
                          onChange={mouthOffsetY => update({ mouthOffsetY })}
                        />
                      </div>
                      <NumericField
                        label="Courbure"
                        value={editing.draft.mouthCurve ?? 1}
                        min={0.2}
                        max={2.4}
                        step={0.05}
                        unit="×"
                        onChange={mouthCurve => update({ mouthCurve })}
                      />
                      <NumericField
                        label="Épaisseur"
                        value={editing.draft.mouthStrokeWidth ?? 3.2}
                        min={1}
                        max={8}
                        step={0.2}
                        unit="px"
                        onChange={mouthStrokeWidth => update({ mouthStrokeWidth })}
                      />
                    </>
                  )}
                </>
              )}
            </Card>
          </ControlSection>
          <ControlSection
            title="Projection"
            subtitle="Perspective appliquée à la surface active."
            compact
          >
            <Card className="dialog-group">
              <NumericField
                label="Perspective"
                value={editing.draft.perspective}
                step={0.01}
                unit="×"
                onChange={value => update({ perspective: value })}
              />
            </Card>
          </ControlSection>
        </div>
      </div>
      <footer className="workspace-footer">
        <div className="workspace-footer-secondary">
          {editing.index !== null && (
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 />
              {t('Supprimer')}
            </Button>
          )}
          <Button variant="outline" onClick={onDuplicate}>
            <Copy />
            {t('Dupliquer')}
          </Button>
        </div>
        <div className="dialog-actions-main">
          <Button onClick={onSave}>{t('Enregistrer')}</Button>
        </div>
      </footer>
    </>
  )
}
