import { useCallback, useEffect, useRef, useState } from 'react';
import { teamWorkspaceProjectionService } from '../services/TeamWorkspaceProjectionService';
import type {
  ActiveTeamWorkspaceState,
  TeamWorkspaceIssue,
  TeamWorkspaceProjectionReader,
} from '../types';

const DEFAULT_POLL_INTERVAL_MS = 2_000;

export interface UseActiveTeamWorkspaceInput {
  sessionId?: string | null;
  workspacePath?: string;
  teamDefinitionId?: string;
  teamInstanceId?: string;
  /**
   * Stable caller-owned signal for runtime events that do not change the
   * session identity (for example a newly completed parent turn).
   */
  refreshKey?: string | number | null;
  enabled?: boolean;
  supported?: boolean;
  reader?: TeamWorkspaceProjectionReader;
  pollIntervalMs?: number;
  refreshOnFocus?: boolean;
}

type InternalState = Omit<ActiveTeamWorkspaceState, 'reload'>;

function unsupportedIssue(): TeamWorkspaceIssue {
  return {
    code: 'unsupported_transport',
    source: 'projection',
    message: 'Team Workspace is unsupported by the current host.',
    retryable: false,
  };
}

export function useActiveTeamWorkspace({
  sessionId,
  workspacePath,
  teamDefinitionId,
  teamInstanceId,
  refreshKey,
  enabled = true,
  supported = true,
  reader = teamWorkspaceProjectionService,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  refreshOnFocus = false,
}: UseActiveTeamWorkspaceInput): ActiveTeamWorkspaceState {
  const [reloadToken, setReloadToken] = useState(0);
  const requestSequence = useRef(0);
  const [state, setState] = useState<InternalState>(() => (
    !enabled || !sessionId
      ? { status: 'disabled' }
      : !supported
        ? { status: 'unsupported', error: unsupportedIssue() }
        : { status: 'loading' }
  ));

  const reload = useCallback(() => {
    setReloadToken(token => token + 1);
  }, []);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;

    const isCurrent = () => !cancelled && requestSequence.current === sequence;
    const clearPoll = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    if (!enabled || !sessionId) {
      setState({ status: 'disabled' });
      return () => {
        cancelled = true;
        clearPoll();
      };
    }
    if (!supported) {
      setState({ status: 'unsupported', error: unsupportedIssue() });
      return () => {
        cancelled = true;
        clearPoll();
      };
    }

    const parentSessionId = sessionId;
    setState({ status: 'loading' });
    async function load(initial: boolean) {
      if (!isCurrent() || inFlight) return;
      inFlight = true;
      try {
        const snapshot = await reader.read({
          parentSessionId,
          workspacePath,
          teamDefinitionId,
          teamInstanceId,
        });
        if (!isCurrent()) return;
        setState({
          status: snapshot.status,
          snapshot,
          error: snapshot.status === 'error' ? snapshot.issues[0] : undefined,
        });
        if (snapshot.shouldPoll) schedulePoll();
        else clearPoll();
      } catch (error) {
        if (!isCurrent()) return;
        const issue: TeamWorkspaceIssue = {
          code: 'runtime_read_failed',
          source: 'projection',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        };
        setState({ status: 'error', error: issue });
        clearPoll();
      } finally {
        inFlight = false;
        if (!initial && !isCurrent()) clearPoll();
      }
    }
    function schedulePoll() {
      clearPoll();
      timer = setTimeout(() => {
        timer = undefined;
        void load(false);
      }, Math.max(DEFAULT_POLL_INTERVAL_MS, pollIntervalMs));
    }

    void load(true);
    const onFocus = () => {
      if (!refreshOnFocus || !isCurrent() || inFlight) return;
      clearPoll();
      void load(false);
    };
    if (refreshOnFocus) window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearPoll();
      if (refreshOnFocus) window.removeEventListener('focus', onFocus);
    };
  }, [
    enabled,
    pollIntervalMs,
    reader,
    refreshOnFocus,
    refreshKey,
    reloadToken,
    sessionId,
    supported,
    teamDefinitionId,
    teamInstanceId,
    workspacePath,
  ]);

  return { ...state, reload };
}
