import { useCallback, useRef, useSyncExternalStore } from 'react';
import {
  useModernFlowChatStore,
  type VirtualItem,
  type VisibleTurnInfo,
} from '../../store/modernFlowChatStore';
import type { Session } from '../../types/flow-chat';
import {
  resolveSessionRelationship,
  type ResolvedSessionRelationship,
} from '../../utils/sessionMetadata';
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

export function usePresentationActiveSessionId(activeOverride?: boolean): string | null {
  return usePresentationSelector(
    state => state.activeSession?.sessionId ?? null,
    activeOverride,
  );
}

/**
 * How the active session relates to other sessions.
 *
 * The fields behind this are fixed for a session's lifetime, so the selector
 * tracks them as one key and the relationship is resolved only when that key
 * changes. Subscribing to the session object instead would re-render every
 * mounted message on every streamed flush.
 */
export function usePresentationSessionRelationship(
  activeOverride?: boolean,
): ResolvedSessionRelationship {
  const relationshipKey = usePresentationSelector(state => {
    const session = state.activeSession;
    if (!session) return '';
    return [
      session.sessionKind ?? '',
      session.parentSessionId ?? '',
      session.btwOrigin?.parentSessionId ?? '',
      session.parentToolCallId ?? '',
      session.subagentType ?? '',
    ].join('|');
  }, activeOverride);

  // The key is the subscription; the session read is the source of truth. They
  // are cached together so the resolved relationship keeps a stable identity
  // until one of those fields really changes.
  const cacheRef = useRef<{ key: string; value: ResolvedSessionRelationship } | null>(null);
  if (cacheRef.current?.key !== relationshipKey) {
    cacheRef.current = {
      key: relationshipKey,
      value: resolveSessionRelationship(useModernFlowChatStore.getState().activeSession),
    };
  }

  return cacheRef.current.value;
}

/** Position of one turn in the active session, or -1 when it is not there. */
export function usePresentationTurnIndex(turnId: string, activeOverride?: boolean): number {
  return usePresentationSelector(
    state => state.activeSession?.dialogTurns.findIndex(turn => turn.id === turnId) ?? -1,
    activeOverride,
  );
}

/** Status of one turn in the active session, or null when it is not there. */
export function usePresentationTurnStatus(
  turnId: string,
  activeOverride?: boolean,
): string | null {
  return usePresentationSelector(
    state => state.activeSession?.dialogTurns.find(turn => turn.id === turnId)?.status ?? null,
    activeOverride,
  );
}
