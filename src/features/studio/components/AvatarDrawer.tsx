import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { defaultAvatarEyes } from '@/features/avatar/avatars'
import { ExpressionPreview } from '@/features/avatar/components/ExpressionWorkspace'
import { defaultExpression } from '@/features/avatar/presets'
import type { StudioController } from '@/features/studio/useStudioController'

export function AvatarDrawer({
  controller,
  onOpenChange,
}: {
  controller: StudioController
  onOpenChange: (open: boolean) => void
}) {
  const {
    activateAvatar,
    activeAvatarId,
    avatarDragOrigin,
    avatarDragPreview,
    avatars,
    avatarsRef,
    cancelAvatarMove,
    commitAvatarMove,
    createNewAvatar,
    draggedAvatarId,
    draggingAvatarId,
    duplicateAvatar,
    expressions,
    previewAvatarMove,
    reduceMotion,
    setDeleteAvatarOpen,
    setDraggingAvatarId,
    setFocusAvatarName,
    t,
  } = controller

  return (
    <DrawerContent className="avatar-drawer">
      <DrawerClose className="drawer-handle" aria-label="Close avatar picker">
        <span />
      </DrawerClose>
      <div className="avatar-drawer-heading">
        <div>
          <DrawerTitle>Avatars</DrawerTitle>
          <DrawerDescription>{t('Double-clic pour modifier')}</DrawerDescription>
        </div>
        <span>{avatars.length}</span>
      </div>
      <section className="avatar-shelf" aria-label={t('Choisir un avatar')}>
        <div className="avatar-grid">
          {avatars.map(avatar => (
            <motion.div
              className="avatar-sort-item"
              data-dragging={draggingAvatarId === avatar.id || undefined}
              key={avatar.id}
              layout="position"
              animate={{
                opacity: draggingAvatarId === avatar.id ? 0.28 : 1,
                scale: draggingAvatarId === avatar.id ? 0.96 : 1,
              }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 }
              }
            >
              <ContextMenu>
                <ContextMenuTrigger
                  render={
                    <Button
                      className="avatar-card"
                      variant="outline"
                      aria-pressed={activeAvatarId === avatar.id}
                      type="button"
                      draggable
                      onDragStart={event => {
                        avatarDragOrigin.current = avatarsRef.current
                        avatarDragPreview.current = avatarsRef.current
                        draggedAvatarId.current = avatar.id
                        setDraggingAvatarId(avatar.id)
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnter={() => previewAvatarMove(avatar.id)}
                      onDragOver={event => {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={event => {
                        event.preventDefault()
                        commitAvatarMove(avatar.id)
                      }}
                      onDragEnd={cancelAvatarMove}
                      onClick={() => activateAvatar(avatar.id, false, true)}
                      onDoubleClick={() => {
                        setFocusAvatarName(false)
                        activateAvatar(avatar.id, true)
                        onOpenChange(false)
                      }}
                    >
                      <ExpressionPreview
                        expression={expressions[0] ?? defaultExpression}
                        surface={avatar.body.primary}
                        bodyNodes={avatar.body.nodes}
                        colors={avatar.colors}
                        avatarEyes={avatar.eyes ?? defaultAvatarEyes}
                        id={`avatar-${avatar.id}`}
                      />
                      <span>{avatar.name}</span>
                    </Button>
                  }
                />
                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => {
                      setFocusAvatarName(false)
                      activateAvatar(avatar.id, true)
                      onOpenChange(false)
                    }}
                  >
                    <Pencil /> {t('Modifier')}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => duplicateAvatar(avatar)}>
                    <Copy /> {t('Dupliquer')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    disabled={avatars.length <= 1}
                    onClick={() => {
                      activateAvatar(avatar.id, false, true)
                      onOpenChange(false)
                      setDeleteAvatarOpen(true)
                    }}
                  >
                    <Trash2 /> {t('Supprimer')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </motion.div>
          ))}
          <Button
            variant="outline"
            className="avatar-add creation-card"
            onClick={() => {
              createNewAvatar()
              onOpenChange(false)
            }}
            aria-label={t('Nouvel avatar')}
          >
            <Plus />
          </Button>
        </div>
      </section>
    </DrawerContent>
  )
}
