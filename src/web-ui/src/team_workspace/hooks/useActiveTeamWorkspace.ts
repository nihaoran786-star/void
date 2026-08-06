import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { teamWorkspaceProjectionService } from '../services/TeamWorkspaceProjectionService';
import type {
  ActiveTeamWorkspaceState,
  TeamWorkspaceIssue,
  TeamWorkspaceProjectionReader,
  TeamWorkspaceSnapshot,
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

type InternalState = Omit<ActiveTeamWorkspaceState, 'reload'> & {
  requestKey: string | null;
};

function unsupportedIssue(): TeamWorkspaceIssue {
  return {
    code: 'unsupported_transport',
    source: 'projection',
    message: 'Team Workspace is unsupported by the current host.',
    retryable: false,
  };
}

function snapshotsAreEqual(
  left: TeamWorkspaceSnapshot | undefined,
  right: TeamWorkspaceSnapshot,
): boolean {
  if (left === right) return true;
  if (!left) return false;
  return JSON.stringify(left) === JSON.stringify(right);
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
  const activeRequestKey = enabled && sessionId && supported
    ? JSON.stringify([
        sessionId,
        workspacePath ?? '',
        teamDefinitionId ?? '',
        teamInstanceId ?? '',
      ])
    : null;
  const [reloadToken, setReloadToken] = useState(0);
  const requestSequence = useRef(0);
  const settledRequestKey = useRef<string | null>(null);
  const [state, setState] = useState<InternalState>(() => (
    !enabled || !sessionId
      ? { requestKey: null, status: 'disabled' }
      : !supported
        ? { requestKey: null, status: 'unsupported', error: unsupportedIssue() }
        : { requestKey: activeRequestKey, status: 'loading' }
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
      settledRequestKey.current = null;
      setState({ requestKey: null, status: 'disabled' });
      return () => {
        cancelled = true;
        clearPoll();
      };
    }
    if (!supported) {
      settledRequestKey.current = null;
      setState({
        requestKey: null,
        status: 'unsupported',
        error: unsupportedIssue(),
      });
      return () => {
        cancelled = true;
        clearPoll();
      };
    }

    const parentSessionId = sessionId;
    const requestKey = activeRequestKey!;
    setState(current => (
      current.requestKey === requestKey
      && settledRequestKey.current === requestKey
      && current.snapshot
        ? current
        : { requestKey, status: 'loading' }
    ));
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
        settledRequestKey.current = requestKey;
        setState(current => {
          const error = snapshot.status === 'error'
            ? snapshot.issues[0]
            : undefined;
          const canReuseCurrent = current.requestKey === requestKey;
          if (
            canReuseCurrent
            && snapshot.status === 'error'
            && current.snapshot?.activeTeam
          ) {
            const errorUnchanged = current.error === error
              || JSON.stringify(current.error) === JSON.stringify(error);
            return errorUnchanged ? current : { ...current, error };
          }
          const snapshotUnchanged = canReuseCurrent
            && snapshotsAreEqual(current.snapshot, snapshot);
          const errorUnchanged = current.error === error
            || JSON.stringify(current.error) === JSON.stringify(error);
          if (
            snapshotUnchanged
            && current.status === snapshot.status
            && errorUnchanged
          ) {
            return current;
          }
          return {
            requestKey,
            status: snapshot.status,
            snapshot: snapshotUnchanged
              ? current.snapshot
              : snapshot,
            error,
          };
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
        settledRequestKey.current = requestKey;
        setState(current => current.requestKey === requestKey && current.snapshot
          ? { ...current, error: issue }
          : { requestKey, status: 'error', error: issue });
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
    activeRequestKey,
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

  const visibleState = useMemo<Omit<ActiveTeamWorkspaceState, 'reload'>>(() => {
    if (!enabled || !sessionId) return { status: 'disabled' };
    if (!supported) return { status: 'unsupported', error: unsupportedIssue() };
    if (state.requestKey !== activeRequestKey) return { status: 'loading' };
    return {
      status: state.status,
      snapshot: state.snapshot,
      error: state.error,
    };
  }, [activeRequestKey, enabled, sessionId, state, supported]);

  return useMemo(
    () => ({ ...visibleState, reload }),
    [reload, visibleState],
  );
}
