import { useCallback, useRef, useSyncExternalStore } from 'react';

import { stateMachineManager } from '@/flow_chat/state-machine';
import { SessionExecutionState } from '@/flow_chat/state-machine/types';
import type { Session } from '@/flow_chat/types/flow-chat';

const EMPTY_RUNNING_SESSION_IDS: ReadonlySet<string> = new Set();

/** Returns stable set identities while nav-visible execution state is unchanged. */
export function createRunningSessionIdsSelector(): (
  sessions: ReadonlyMap<string, Session>,
) => ReadonlySet<string> {
  let fingerprint: string | undefined;
  let snapshot = EMPTY_RUNNING_SESSION_IDS;

  return sessions => {
    const runningIds: string[] = [];
    const presentationStates: Array<[string, 'running' | 'review-error' | 'idle']> = [];
    for (const [sessionId, session] of sessions) {
      const state = stateMachineManager.getCurrentState(sessionId);
      const running = (
        state === SessionExecutionState.PROCESSING ||
        state === SessionExecutionState.FINISHING
      );
      if (running) {
        runningIds.push(sessionId);
      }
      presentationStates.push([
        sessionId,
        running
          ? 'running'
          : (
              (session.sessionKind === 'review' || session.sessionKind === 'deep_review') &&
              state === SessionExecutionState.ERROR
            )
            ? 'review-error'
            : 'idle',
      ]);
    }

    const nextFingerprint = JSON.stringify(presentationStates);
    if (nextFingerprint === fingerprint) {
      return snapshot;
    }

    fingerprint = nextFingerprint;
    snapshot = new Set(runningIds);
    return snapshot;
  };
}

/**
 * Samples running state during render so the first visible commit is correct.
 * Hidden lists retain their last presentation snapshot and hold no global
 * state-machine subscription.
 */
export function useSessionRunningPresentation(
  sessions: ReadonlyMap<string, Session>,
  isVisible: boolean,
): ReadonlySet<string> {
  const selectorRef = useRef<ReturnType<typeof createRunningSessionIdsSelector> | null>(null);
  selectorRef.current ??= createRunningSessionIdsSelector();
  const frozenSnapshotRef = useRef<ReadonlySet<string>>(EMPTY_RUNNING_SESSION_IDS);

  const readVisibleSnapshot = useCallback(
    () => selectorRef.current!(sessions),
    [sessions],
  );

  const getSnapshot = useCallback(() => {
    if (isVisible) {
      frozenSnapshotRef.current = readVisibleSnapshot();
    }
    return frozenSnapshotRef.current;
  }, [isVisible, readVisibleSnapshot]);

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!isVisible) {
      return () => {};
    }

    let current = readVisibleSnapshot();
    return stateMachineManager.subscribeGlobal(sessionId => {
      if (!sessions.has(sessionId)) {
        return;
      }

      const next = readVisibleSnapshot();
      if (next === current) {
        return;
      }
      current = next;
      onStoreChange();
    });
  }, [isVisible, readVisibleSnapshot, sessions]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
