import type { Session } from '../types/flow-chat';
import { resolveSessionRelationship } from './sessionMetadata';
import { sessionBelongsToWorkspaceNavRow } from './sessionOrdering';

export type ComposerTargetSelection =
  | { kind: 'main' }
  | { kind: 'child'; sessionId: string };

export interface ActiveChildPanelTarget {
  childSessionId: string;
  parentSessionId: string;
}

export type ComposerTargetUnavailableReason =
  | 'missing_main_session'
  | 'missing_child_session'
  | 'panel_closed'
  | 'parent_mismatch'
  | 'workspace_mismatch'
  | 'unsupported_child_kind';

export type ComposerTarget =
  | {
      status: 'ready';
      kind: 'main';
      sessionId: string;
    }
  | {
      status: 'ready';
      kind: 'child';
      sessionId: string;
      parentSessionId: string;
      sessionKind: 'btw' | 'subagent';
      agentType: string;
    }
  | {
      status: 'unavailable';
      kind: ComposerTargetSelection['kind'];
      reason: ComposerTargetUnavailableReason;
      requestedSessionId?: string;
    };

export interface ResolveComposerTargetInput {
  mainSessionId: string | null;
  selectedTarget: ComposerTargetSelection;
  activeChildPanel: ActiveChildPanelTarget | null;
  sessions: ReadonlyMap<string, Session>;
}

function sessionsShareComposerWorkspace(main: Session, child: Session): boolean {
  const mainWorkspaceId = main.workspaceId?.trim();
  const childWorkspaceId = child.workspaceId?.trim();
  if (mainWorkspaceId && childWorkspaceId && mainWorkspaceId !== childWorkspaceId) {
    return false;
  }

  const mainPath = main.workspacePath?.trim();
  if (!mainPath) {
    return Boolean(mainWorkspaceId && childWorkspaceId);
  }

  return sessionBelongsToWorkspaceNavRow(
    child,
    mainPath,
    main.remoteConnectionId,
    main.remoteSshHost,
  );
}

export function resolveComposerTarget(
  input: ResolveComposerTargetInput,
): ComposerTarget {
  if (input.selectedTarget.kind === 'child') {
    const unavailable = (
      reason: ComposerTargetUnavailableReason,
    ): ComposerTarget => ({
      status: 'unavailable',
      kind: 'child',
      reason,
      requestedSessionId: input.selectedTarget.kind === 'child'
        ? input.selectedTarget.sessionId
        : undefined,
    });
    if (!input.mainSessionId) {
      return unavailable('missing_main_session');
    }
    const mainSession = input.sessions.get(input.mainSessionId);
    if (!mainSession) {
      return unavailable('missing_main_session');
    }
    if (
      !input.activeChildPanel
      || input.activeChildPanel.childSessionId !== input.selectedTarget.sessionId
    ) {
      return unavailable('panel_closed');
    }
    if (input.activeChildPanel.parentSessionId !== input.mainSessionId) {
      return unavailable('parent_mismatch');
    }
    const childSession = input.sessions.get(input.selectedTarget.sessionId);
    if (!childSession) {
      return unavailable('missing_child_session');
    }
    if (!sessionsShareComposerWorkspace(mainSession, childSession)) {
      return unavailable('workspace_mismatch');
    }
    const relationship = resolveSessionRelationship(childSession);
    if (relationship.parentSessionId !== input.mainSessionId) {
      return unavailable('parent_mismatch');
    }
    if (relationship.kind !== 'btw' && relationship.kind !== 'subagent') {
      return unavailable('unsupported_child_kind');
    }
    const sessionKind = relationship.kind;
    return {
      status: 'ready',
      kind: 'child',
      sessionId: childSession.sessionId,
      parentSessionId: input.mainSessionId,
      sessionKind,
      agentType:
        sessionKind === 'subagent'
          ? childSession.subagentType || childSession.mode || 'agentic'
          : childSession.mode || 'agentic',
    };
  }

  if (input.mainSessionId && input.sessions.has(input.mainSessionId)) {
    return {
      status: 'ready',
      kind: 'main',
      sessionId: input.mainSessionId,
    };
  }

  return {
    status: 'unavailable',
    kind: 'main',
    reason: 'missing_main_session',
  };
}
