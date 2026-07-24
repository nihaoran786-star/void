import type { WorkspaceInfo } from '@/shared/types';
import {
  type NewSessionDraftWorkspace,
  type SessionMode,
  useSessionModeStore,
} from '@/app/stores/sessionModeStore';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';

function toDraftWorkspace(
  workspace?: WorkspaceInfo | null,
): NewSessionDraftWorkspace | null {
  if (!workspace?.id || !workspace.rootPath) {
    return null;
  }

  return {
    id: workspace.id,
    name: workspace.name,
    rootPath: workspace.rootPath,
    remoteConnectionId: workspace.connectionId,
    remoteSshHost: workspace.sshHost,
  };
}

/**
 * Opens an unpersisted new-session draft.
 *
 * The previous session remains in the store and can be restored from the
 * navigation list. Only the active projection is cleared; the first send
 * creates the real backend session using the selected draft workspace.
 */
export function beginNewSessionDraft(
  mode: SessionMode,
  suggestedWorkspace?: WorkspaceInfo | null,
): void {
  useSessionModeStore.getState().beginDraft(
    mode,
    toDraftWorkspace(suggestedWorkspace),
  );
  flowChatStore.setState(previous => ({
    ...previous,
    activeSessionId: null,
  }));
}

export function selectNewSessionDraftWorkspace(
  workspace: WorkspaceInfo | null,
): void {
  useSessionModeStore.getState().setDraftWorkspace(toDraftWorkspace(workspace));
}

export function completeNewSessionDraft(): void {
  useSessionModeStore.getState().clearDraft();
}
