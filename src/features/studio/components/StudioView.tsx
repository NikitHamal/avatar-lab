import { StudioDialogs } from '@/features/studio/components/StudioDialogs'
import { StudioInspector } from '@/features/studio/components/StudioInspector'
import { StudioStage } from '@/features/studio/components/StudioStage'
import type { StudioController } from '@/features/studio/useStudioController'

export function StudioView(controller: StudioController) {
  return (
    <div className="studio" lang={controller.language}>
      <StudioStage controller={controller} />
      <StudioInspector controller={controller} />
      <StudioDialogs controller={controller} />
    </div>
  )
}
