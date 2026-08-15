import type {
  CanvasSurfaceDefinitionContext,
  CanvasSurfacePreparationResult,
} from '@/shared/services/canvas';
import { areCanvasWorkspacePathsEquivalent } from '@/shared/services/canvas';

export interface ShortDramaCanvasSessionFacts {
  sessionId: string;
  workspaceId?: string;
  workspacePath?: string;
  remoteConnectionId?: string;
  mode?: string;
  sessionKind?: string;
}

export interface ShortDramaCanvasOpenPolicyDependencies {
  readSession: (sessionId: string) => ShortDramaCanvasSessionFacts | undefined;
  readActiveSessionId: () => string | null;
}

export function createShortDramaCanvasOpenPolicy(
  dependencies: ShortDramaCanvasOpenPolicyDependencies,
): (
  context: CanvasSurfaceDefinitionContext,
) => Promise<CanvasSurfacePreparationResult> {
  return async context => {
    const sourceSessionId = context.sourceSessionId?.trim();
    if (!sourceSessionId) {
      return { status: 'restricted', reason: 'source_session_required' };
    }

    const session = dependencies.readSession(sourceSessionId);
    if (!session || session.sessionId !== sourceSessionId) {
      return { status: 'restricted', reason: 'source_session_unavailable' };
    }
    if (dependencies.readActiveSessionId() !== sourceSessionId) {
      return { status: 'unavailable', reason: 'source_session_inactive' };
    }
    if (
      session.mode?.trim().toLowerCase() !== 'media'
      || session.sessionKind === 'subagent'
    ) {
      return { status: 'restricted', reason: 'media_session_required' };
    }
    if (
      (session.workspaceId && session.workspaceId !== context.workspace.workspaceId)
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
    ) {
      return { status: 'restricted', reason: 'session_workspace_mismatch' };
    }

    return { status: 'ready' };
  };
}
