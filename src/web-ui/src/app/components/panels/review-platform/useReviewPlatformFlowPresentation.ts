import { useCallback, useRef, useSyncExternalStore } from 'react';

import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { FlowChatState } from '@/flow_chat/types/flow-chat';

/**
 * Keep the Review Platform's Flow Chat projection live only while presented.
 * Review execution remains owned by FlowChatStore and continues while hidden.
 */
export function useReviewPlatformFlowPresentation(isActive: boolean): FlowChatState {
  const frozenSnapshotRef = useRef<{ value: FlowChatState } | null>(null);
  if (frozenSnapshotRef.current === null) {
    frozenSnapshotRef.current = { value: flowChatStore.getState() };
  }
  const frozenSnapshot = frozenSnapshotRef.current;

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!isActive) {
      return () => {};
    }
    return flowChatStore.subscribe(onStoreChange);
  }, [isActive]);

  const getSnapshot = useCallback(() => {
    if (!isActive) {
      return frozenSnapshot.value;
    }

    const snapshot = flowChatStore.getState();
    frozenSnapshot.value = snapshot;
    return snapshot;
  }, [frozenSnapshot, isActive]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
