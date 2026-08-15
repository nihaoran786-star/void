import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import { SHORT_DRAMA_TEAM_CATALOG_ID } from '@/shared/services/customization/fixedTeamIds';
import { removeDuplicateTeamMemberCanvasTabs } from '@/app/presentation/TeamMemberCanvasPresentation';
import { useAgentCanvasStore } from '../stores';
import { createShortDramaCanvasOpenPolicy } from './ShortDramaCanvasOpenPolicy';
import {
  areCanvasWorkspacePathsEquivalent,
  type CanvasSurfaceDefinitionContext,
} from '@/shared/services/canvas';

export const prepareShortDramaCanvasOpen = createShortDramaCanvasOpenPolicy({
  readSession: sessionId => flowChatStore.getState().sessions.get(sessionId),
  readActiveSessionId: () => flowChatStore.getState().activeSessionId,
});

export function beforeShortDramaCanvasHostMutation(
  context: CanvasSurfaceDefinitionContext,
): void {
  const sourceSessionId = context.sourceSessionId?.trim();
  if (!sourceSessionId) return;
  const state = flowChatStore.getState();
  if (state.activeSessionId !== sourceSessionId) return;
  const session = state.sessions.get(sourceSessionId);
  if (
    !session
    || (session.workspaceId && session.workspaceId !== context.workspace.workspaceId)
    || (
      session.workspacePath
      && !areCanvasWorkspacePathsEquivalent(
        session.workspacePath,
        context.workspace.workspacePath,
        context.workspace.backend,
      )
    )
    || (
      context.workspace.backend === 'local'
        ? Boolean(session.remoteConnectionId)
        : session.remoteConnectionId !== context.workspace.remoteConnectionId
    )
    || session.activePersonaBinding?.kind !== 'team_lead'
    || session.activePersonaBinding.teamDefinitionId !== SHORT_DRAMA_TEAM_CATALOG_ID
  ) {
    return;
  }
  removeDuplicateTeamMemberCanvasTabs(useAgentCanvasStore.getState(), {
    parentSessionId: sourceSessionId,
    workspacePath: context.workspace.workspacePath,
    removeShortDramaWorkspaceTabs: true,
  });
}
