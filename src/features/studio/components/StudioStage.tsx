import { Camera, Info } from 'lucide-react'
import { motion } from 'motion/react'
import { type CSSProperties } from 'react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { type StudioLanguage } from '@/i18n'

import { AvatarCanvas } from '@/features/rendering/components/AvatarCanvas'
import type { StudioController } from '@/features/studio/useStudioController'

export function StudioStage({ controller }: { controller: StudioController }) {
  const {
    activeAvatarEyes,
    activeSequenceLabel,
    bodyEditing,
    canvasExpression,
    commitBodyNode,
    editing,
    expression,
    freezeLivePreviewForManipulation,
    highlight,
    language,
    linked,
    mode,
    persistEditedEyeExpression,
    photoFlash,
    playbackStatus,
    previewCanvasExpression,
    previewExpressionDraft,
    previewSelectedBodyNode,
    renderedColors,
    renderedRotationGizmo,
    renderedScene,
    selectBodyNode,
    selectedBodyNode,
    selectedBodyNodeId,
    selectedEyeSide,
    setEditing,
    setLanguage,
    setSelectedEyeSide,
    showWire,
    snapshotFormat,
    surface,
    t,
    takePicture,
    transitionToExpression,
    updateHighlight,
    updateImmediate,
  } = controller
  return (
    <motion.section
      className="stage-column"
      style={
        {
          '--avatar-body-color': renderedColors.body,
          '--avatar-eye-color': renderedColors.eyes,
        } as CSSProperties
      }
    >
      <div className="brand">
        <span className="brand-mark" />
        Bible Strong <em>Avatar Lab</em>
      </div>
      <div className="language-picker">
        <span aria-hidden="true">{language === 'en' ? '🇬🇧' : language === 'fr' ? '🇫🇷' : '🇨🇳'}</span>
        <Select
          value={language}
          items={[
            { value: 'en', label: 'English' },
            { value: 'fr', label: 'Français' },
            { value: 'zh-CN', label: '中文' },
          ]}
          onValueChange={next => next && setLanguage(next as StudioLanguage)}
        >
          <SelectTrigger aria-label={t('Langue de l’interface')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="zh-CN">中文</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <AvatarCanvas
        expression={canvasExpression}
        avatarEyes={activeAvatarEyes}
        surface={surface}
        scene={renderedScene}
        rotationGizmo={renderedRotationGizmo}
        showWire={showWire}
        bodyEditing={bodyEditing}
        selectedBodyNodeId={selectedBodyNodeId}
        selectedBodyNode={selectedBodyNode}
        selectedSide={selectedEyeSide}
        linked={linked}
        highlight={highlight}
        onHighlightChange={updateHighlight}
        onBodyNodeSelect={selectBodyNode}
        onBodyNodePreview={previewSelectedBodyNode}
        onBodyNodeChange={commitBodyNode}
        onEyeSelect={setSelectedEyeSide}
        onPreview={previewCanvasExpression}
        onChange={editing ? previewExpressionDraft : updateImmediate}
        onReset={next => {
          if (editing) {
            setEditing(current => (current ? { ...current, draft: next } : current))
          }
          transitionToExpression(next)
        }}
        onEyeChange={
          editing ? previewExpressionDraft : bodyEditing ? persistEditedEyeExpression : undefined
        }
        playback={
          activeSequenceLabel && playbackStatus !== 'stopped'
            ? { name: activeSequenceLabel, status: playbackStatus }
            : null
        }
        onManipulationStart={freezeLivePreviewForManipulation}
      />
      {photoFlash > 0 && (
        <motion.div
          className="photo-flash"
          key={photoFlash}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.92, 0] }}
          transition={{ duration: 0.38, times: [0, 0.16, 1], ease: 'easeOut' }}
        />
      )}
      <TooltipProvider>
        <div className="photo-capture-bar">
          <Button className="photo-capture-button" type="button" onClick={takePicture}>
            <Camera />
            {t('Prendre une photo')}
            <span className="photo-format-badge">{snapshotFormat.toUpperCase()}</span>
          </Button>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  className="photo-help-button"
                  variant="secondary"
                  size="icon-sm"
                  type="button"
                  aria-label={t('Informations sur le mode photo')}
                />
              }
            >
              <Info />
            </TooltipTrigger>
            <TooltipContent side="top" className="photo-help-tooltip">
              {t('Tu peux modifier le format, le fond et la définition du mode photo dans Export.')}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </motion.section>
  )
}
