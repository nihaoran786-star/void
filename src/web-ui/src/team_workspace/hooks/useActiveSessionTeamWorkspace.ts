import { useEffect, useMemo, useState } from 'react';
import { isTauriRuntime } from '@/infrastructure/runtime';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { FlowChatState } from '@/flow_chat/types/flow-chat';
import type {
  ActiveTeamWorkspaceState,
  TeamWorkspaceProjectionReader,
} from '../types';
import { useActiveTeamWorkspace } from './useActiveTeamWorkspace';

interface ActiveTeamSelection {
  sessionId: string | null;
  workspacePath?: string;
  teamDefinitionId: string | null;
  teamInstanceId: string | null;
  bindingKey: string | null;
  refreshKey: string | null;
}

export interface UseActiveSessionTeamWorkspaceInput {
  workspacePath?: string;
  reader?: TeamWorkspaceProjectionReader;
  supported?: boolean;
  pollIntervalMs?: number;
  refreshOnFocus?: boolean;
}

export interface ActiveSessionTeamWorkspaceState
  extends ActiveTeamWorkspaceState {
  sessionId: string | null;
  hasTeamBinding: boolean;
  teamBindingKey: string | null;
  displayName?: string;
  presentationStatus: TeamWorkspaceRailStatus;
}

export type TeamWorkspaceRailStatus =
  | 'disabled'
  | 'unsupported'
  | 'loading'
  | 'ready'
  | 'running'
  | 'attention'
  | 'completed'
  | 'error';

export function deriveTeamWorkspaceRailStatus(
  state: ActiveTeamWorkspaceState,
): TeamWorkspaceRailStatus {
  if (state.status === 'partial') return 'attention';
  if (state.status !== 'ready') return state.status;

  const activeTeam = state.snapshot?.activeTeam;
  if (activeTeam?.lifecycle === 'provisioning') return 'loading';
  if (activeTeam?.lifecycle === 'unavailable') return 'error';
  if (activeTeam?.lifecycle === 'archived') return 'completed';

  const runStatus = activeTeam?.activeRun?.status;
  if (runStatus === 'queued' || runStatus === 'running') return 'running';
  if (
    runStatus === 'waiting_user'
    || runStatus === 'blocked'
    || runStatus === 'interrupted'
  ) return 'attention';
  if (runStatus === 'completed') return 'completed';
  if (runStatus === 'failed' || runStatus === 'cancelled') return 'error';
  return 'ready';
}

function emptySelection(workspacePath?: string): ActiveTeamSelection {
  return {
    sessionId: null,
    workspacePath,
    teamDefinitionId: null,
    teamInstanceId: null,
    bindingKey: null,
    refreshKey: null,
  };
}

function selectActiveTeam(state: FlowChatState): ActiveTeamSelection {
  const sessionId = state.activeSessionId;
  const session = sessionId ? state.sessions.get(sessionId) : undefined;
  const binding = session?.activePersonaBinding;
  if (
    !sessionId
    || !session
    || session.sessionKind !== 'normal'
    || binding?.kind !== 'team_lead'
    || !binding.personaId?.trim()
    || !binding.teamDefinitionId?.trim()
    || !binding.teamInstanceId?.trim()
    || binding.personaRevision.status !== 'known'
    || !binding.personaRevision.value.trim()
  ) {
    return emptySelection(session?.workspacePath);
  }

  const revision = binding.personaRevision.value;
  const teamDefinitionId = binding.teamDefinitionId.trim();
  const teamInstanceId = binding.teamInstanceId.trim();
  const bindingKey = JSON.stringify([
    sessionId,
    binding.personaId,
    revision,
    teamDefinitionId,
    teamInstanceId,
  ]);
  const lastTurn = session.dialogTurns[session.dialogTurns.length - 1];
  return {
    sessionId,
    workspacePath: session.workspacePath,
    teamDefinitionId,
    teamInstanceId,
    bindingKey,
    refreshKey: JSON.stringify([
      bindingKey,
      session.dialogTurns.length,
      lastTurn?.id ?? '',
      lastTurn?.status ?? '',
    ]),
  };
}

function isSameSelection(
  left: ActiveTeamSelection,
  right: ActiveTeamSelection,
): boolean {
  return left.sessionId === right.sessionId
    && left.workspacePath === right.workspacePath
    && left.teamDefinitionId === right.teamDefinitionId
    && left.teamInstanceId === right.teamInstanceId
    && left.bindingKey === right.bindingKey
    && left.refreshKey === right.refreshKey;
}

export function useActiveSessionTeamWorkspace({
  workspacePath,
  reader,
  supported = isTauriRuntime(),
  pollIntervalMs,
  refreshOnFocus = true,
}: UseActiveSessionTeamWorkspaceInput = {}): ActiveSessionTeamWorkspaceState {
  const [selection, setSelection] = useState(() => (
    selectActiveTeam(flowChatStore.getState())
  ));

  useEffect(() => {
    const update = (state: FlowChatState) => {
      const next = selectActiveTeam(state);
      setSelection(current => isSameSelection(current, next) ? current : next);
    };
    const unsubscribe = flowChatStore.subscribe(update);
    update(flowChatStore.getState());
    return unsubscribe;
  }, []);

  const workspaceState = useActiveTeamWorkspace({
    sessionId: selection.sessionId,
    workspacePath: workspacePath ?? selection.workspacePath,
    teamDefinitionId: selection.teamDefinitionId ?? undefined,
    teamInstanceId: selection.teamInstanceId ?? undefined,
    refreshKey: selection.refreshKey,
    enabled: Boolean(selection.bindingKey),
    supported,
    reader,
    pollIntervalMs,
    refreshOnFocus,
  });

  return useMemo(() => ({
    ...workspaceState,
    sessionId: selection.sessionId,
    hasTeamBinding: Boolean(selection.bindingKey),
    teamBindingKey: selection.bindingKey,
    displayName: workspaceState.snapshot?.activeTeam?.definition.displayName,
    presentationStatus: deriveTeamWorkspaceRailStatus(workspaceState),
  }), [selection.bindingKey, selection.sessionId, workspaceState]);
}
