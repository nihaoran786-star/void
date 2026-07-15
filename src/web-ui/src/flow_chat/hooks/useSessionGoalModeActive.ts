import { useCallback, useRef, useSyncExternalStore } from 'react';
import { flowChatStore } from '../store/FlowChatStore';

const noopUnsubscribe = () => undefined;
const getServerSnapshot = () => false;

export function useSessionGoalModeActive(
  sessionId: string | undefined,
  enabled = true,
): boolean {
  const snapshotRef = useRef<{
    initialized: boolean;
    sessionId: string | undefined;
    value: boolean;
  }>({
    initialized: false,
    sessionId: undefined,
    value: false,
  });

  const subscribe = useCallback((callback: () => void) => {
    if (!enabled || !sessionId) {
      return noopUnsubscribe;
    }

    return flowChatStore.subscribe(() => callback());
  }, [enabled, sessionId]);

  const getSnapshot = useCallback(() => {
    if (!sessionId) {
      snapshotRef.current = {
        initialized: true,
        sessionId: undefined,
        value: false,
      };
      return false;
    }

    const shouldRefresh = enabled
      || !snapshotRef.current.initialized
      || snapshotRef.current.sessionId !== sessionId;

    if (shouldRefresh) {
      snapshotRef.current = {
        initialized: true,
        sessionId,
        value: Boolean(
          flowChatStore.getState().sessions.get(sessionId)?.goalModeActive,
        ),
      };
    }

    return snapshotRef.current.value;
  }, [enabled, sessionId]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
