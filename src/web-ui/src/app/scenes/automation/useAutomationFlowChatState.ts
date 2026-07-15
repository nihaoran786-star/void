import { useCallback, useRef, useSyncExternalStore } from 'react';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { FlowChatState } from '@/flow_chat/types/flow-chat';

/**
 * Keeps the retained Automation scene's presentation snapshot frozen while it
 * is hidden. Automation jobs and their lifecycle remain owned by the scene;
 * only the high-frequency FlowChat presentation subscription is paused.
 */
export function useAutomationFlowChatState(isActive: boolean): FlowChatState {
  const frozenSnapshotRef = useRef<{ value: FlowChatState } | null>(null);
  frozenSnapshotRef.current ??= { value: flowChatStore.getState() };
  const frozenSnapshot = frozenSnapshotRef.current;

  const subscribe = useCallback((onStoreChange: () => void) => {
    return isActive ? flowChatStore.subscribe(onStoreChange) : () => {};
  }, [isActive]);

  const getSnapshot = useCallback(() => {
    if (isActive) {
      frozenSnapshot.value = flowChatStore.getState();
    }
    return frozenSnapshot.value;
  }, [frozenSnapshot, isActive]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
