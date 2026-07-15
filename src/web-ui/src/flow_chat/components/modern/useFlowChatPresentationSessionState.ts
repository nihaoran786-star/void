import { useEffect, useState } from 'react';
import { flowChatStore } from '../../store/FlowChatStore';
import { stateMachineManager } from '../../state-machine';
import type { ActiveSessionState } from '../../hooks/useActiveSessionState';
import { useFlowChatPresentationActive } from './FlowChatPresentationActivity';

function readActiveSessionState(): ActiveSessionState {
  const session = flowChatStore.getActiveSession();
  const machine = session ? stateMachineManager.get(session.sessionId) : null;

  return {
    sessionId: session?.sessionId ?? null,
    isProcessing: machine?.getCurrentState() === 'processing',
    processingPhase: machine?.getContext().processingPhase ?? null,
    error: session?.error ?? null,
    status: session?.status ?? 'idle',
  };
}

function statesMatch(left: ActiveSessionState, right: ActiveSessionState): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.isProcessing === right.isProcessing &&
    left.processingPhase === right.processingPhase &&
    left.error === right.error &&
    left.status === right.status
  );
}

/**
 * Presentation-scoped projection of the legacy session state machine.
 * Hidden views freeze their last snapshot and release both global subscriptions;
 * resuming performs one immediate read before listening again.
 */
export function useFlowChatPresentationSessionState(): ActiveSessionState {
  const isActive = useFlowChatPresentationActive();
  const [snapshot, setSnapshot] = useState(readActiveSessionState);

  useEffect(() => {
    if (!isActive) return;

    const syncSnapshot = () => {
      const next = readActiveSessionState();
      setSnapshot(previous => statesMatch(previous, next) ? previous : next);
    };

    syncSnapshot();
    const unsubscribeStore = flowChatStore.subscribe(syncSnapshot);
    const unsubscribeMachine = stateMachineManager.subscribeGlobal((sessionId) => {
      if (flowChatStore.getActiveSession()?.sessionId === sessionId) {
        syncSnapshot();
      }
    });

    return () => {
      unsubscribeStore();
      unsubscribeMachine();
    };
  }, [isActive]);

  return snapshot;
}
