import { AgentSidebar } from '@/features/agent/components/AgentSidebar'
import { useAgentController } from '@/features/agent/useAgentController'
import { StudioDialogs } from '@/features/studio/components/StudioDialogs'
import { StudioInspector } from '@/features/studio/components/StudioInspector'
import { StudioStage } from '@/features/studio/components/StudioStage'
import type { StudioController } from '@/features/studio/useStudioController'

export function StudioView(controller: StudioController) {
  const agent = useAgentController(controller)

  return (
    <div className="studio-root" lang={controller.language}>
      <div className="studio studio-with-agent">
        <StudioStage controller={controller} />
        <StudioInspector controller={controller} />
        <AgentSidebar agent={agent} studioController={controller} />
      </div>
      <StudioDialogs controller={controller} />
    </div>
  )
}
