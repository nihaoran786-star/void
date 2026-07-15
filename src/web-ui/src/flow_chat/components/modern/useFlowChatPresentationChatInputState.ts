import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useChatInputState } from '../../store/chatInputStateStore';
import { useFlowChatPresentationActive } from './FlowChatPresentationActivity';

type ChatInputStoreState = ReturnType<typeof useChatInputState.getState>;

export interface FlowChatPresentationChatInputState {
  isActive: boolean;
  isExpanded: boolean;
  inputHeight: number;
}

const selectChatInputPresentationState = (
  state: ChatInputStoreState,
): FlowChatPresentationChatInputState => ({
  isActive: state.isActive,
  isExpanded: state.isExpanded,
  inputHeight: state.inputHeight,
});

const isSameSnapshot = (
  previous: FlowChatPresentationChatInputState,
  next: FlowChatPresentationChatInputState,
): boolean => (
  previous.isActive === next.isActive &&
  previous.isExpanded === next.isExpanded &&
  previous.inputHeight === next.inputHeight
);

/**
 * Keeps the footer-layout snapshot current only while this FlowChat surface is
 * visible. Hidden surfaces release the Zustand listener and resume from the
 * latest store snapshot when presentation activity returns.
 */
export function useFlowChatPresentationChatInputState(
  activeOverride?: boolean,
): FlowChatPresentationChatInputState {
  const contextActive = useFlowChatPresentationActive();
  const isPresentationActive = activeOverride ?? contextActive;
  const snapshotRef = useRef<FlowChatPresentationChatInputState | null>(null);

  const getRetainedSnapshot = useCallback(() => {
    if (!snapshotRef.current) {
      snapshotRef.current = selectChatInputPresentationState(useChatInputState.getState());
    }
    return snapshotRef.current;
  }, []);

  const readSnapshot = useCallback(() => {
    if (isPresentationActive) {
      const next = selectChatInputPresentationState(useChatInputState.getState());
      if (!isSameSnapshot(getRetainedSnapshot(), next)) snapshotRef.current = next;
    }
    return getRetainedSnapshot();
  }, [getRetainedSnapshot, isPresentationActive]);

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!isPresentationActive) return () => undefined;

    return useChatInputState.subscribe((state) => {
      const next = selectChatInputPresentationState(state);
      if (isSameSnapshot(getRetainedSnapshot(), next)) return;
      snapshotRef.current = next;
      onStoreChange();
    });
  }, [getRetainedSnapshot, isPresentationActive]);

  return useSyncExternalStore(subscribe, readSnapshot, readSnapshot);
}
