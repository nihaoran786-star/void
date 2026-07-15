import { useCallback, useRef, useSyncExternalStore } from 'react';
import {
  useModernFlowChatStore,
  type VirtualItem,
  type VisibleTurnInfo,
} from '../../store/modernFlowChatStore';
import type { Session } from '../../types/flow-chat';
import { useFlowChatPresentationActive } from './FlowChatPresentationActivity';

type ModernFlowChatState = ReturnType<typeof useModernFlowChatStore.getState>;

const selectVirtualItems = (state: ModernFlowChatState): VirtualItem[] => state.virtualItems;
const selectActiveSession = (state: ModernFlowChatState): Session | null => state.activeSession;
const selectVisibleTurnInfo = (state: ModernFlowChatState): VisibleTurnInfo | null => state.visibleTurnInfo;

/**
 * Subscribes only while the presentation is active and freezes the last
 * snapshot while hidden. This keeps multiple mounted FlowChat surfaces from
 * waking one another through the shared modern projection store.
 */
function usePresentationSelector<T>(
  selector: (state: ModernFlowChatState) => T,
  activeOverride?: boolean,
): T {
  const contextActive = useFlowChatPresentationActive();
  const isActive = activeOverride ?? contextActive;
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const snapshotRef = useRef(selector(useModernFlowChatStore.getState()));

  const readSnapshot = useCallback(() => {
    if (isActive) {
      const next = selectorRef.current(useModernFlowChatStore.getState());
      if (!Object.is(snapshotRef.current, next)) snapshotRef.current = next;
    }
    return snapshotRef.current;
  }, [isActive]);

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!isActive) return () => undefined;

    return useModernFlowChatStore.subscribe(state => {
      const next = selectorRef.current(state);
      if (Object.is(snapshotRef.current, next)) return;
      snapshotRef.current = next;
      onStoreChange();
    });
  }, [isActive]);

  return useSyncExternalStore(subscribe, readSnapshot, readSnapshot);
}

export function usePresentationVirtualItems(activeOverride?: boolean): VirtualItem[] {
  return usePresentationSelector(selectVirtualItems, activeOverride);
}

export function usePresentationActiveSession(activeOverride?: boolean): Session | null {
  return usePresentationSelector(selectActiveSession, activeOverride);
}

export function usePresentationVisibleTurnInfo(activeOverride?: boolean): VisibleTurnInfo | null {
  return usePresentationSelector(selectVisibleTurnInfo, activeOverride);
}
