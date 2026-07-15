import { useEffect, useState } from 'react';
import { flowChatStore } from '../../store/FlowChatStore';
import type { FlowChatState, Session } from '../../types/flow-chat';

const reviewResultFingerprintCache = new WeakMap<object, string>();

export interface BtwPresentationSessionSnapshot {
  childSessionId: string | null;
  parentSessionId: string | null;
  childSession?: Session;
  parentSession?: Session;
}

export interface BtwReviewLifecycleSignal {
  requestedSessionId: string | null;
  sessionExists: boolean;
  sessionId: string | null;
  sessionStatus: Session['status'] | null;
  sessionError: string | null;
  turnCount: number;
  lastTurnId: string | null;
  lastTurnStatus: string | null;
  lastTurnError: string | null;
  roundCount: number;
  lastRoundId: string | null;
  lastRoundStatus: string | null;
  lastRoundError: string | null;
  lastRoundIsStreaming: boolean | null;
  lastRoundIsComplete: boolean | null;
  itemCount: number;
  lastItemId: string | null;
  lastItemType: string | null;
  lastItemStatus: string | null;
  lastItemIsStreaming: boolean | null;
  lastItemToolName: string | null;
  lastItemToolCallId: string | null;
  lastItemToolResultSuccess: boolean | null;
  lastItemToolResultError: string | null;
  lastItemReviewResultFingerprint: string | null;
}

export interface BtwReviewLifecycleSnapshot {
  session?: Session;
  signal: BtwReviewLifecycleSignal;
}

export interface UseBtwSessionSnapshotsOptions {
  childSessionId?: string;
  parentSessionId?: string;
  isActive: boolean;
}

export interface BtwSessionSnapshots {
  childSession?: Session;
  parentSession?: Session;
  reviewSession?: Session;
  reviewSignal: BtwReviewLifecycleSignal;
}

export function readBtwPresentationSessionSnapshot(
  state: FlowChatState,
  childSessionId?: string,
  parentSessionId?: string,
): BtwPresentationSessionSnapshot {
  return {
    childSessionId: childSessionId ?? null,
    parentSessionId: parentSessionId ?? null,
    childSession: childSessionId ? state.sessions.get(childSessionId) : undefined,
    parentSession: parentSessionId ? state.sessions.get(parentSessionId) : undefined,
  };
}

export function deriveBtwReviewLifecycleSignal(
  session: Session | undefined,
  requestedSessionId?: string,
): BtwReviewLifecycleSignal {
  const lastTurn = session?.dialogTurns[session.dialogTurns.length - 1];
  const lastRound = lastTurn?.modelRounds[lastTurn.modelRounds.length - 1];
  const lastItem = lastRound?.items[lastRound.items.length - 1];
  const lastToolItem = lastItem?.type === 'tool' ? lastItem : undefined;
  const lastItemIsStreaming = lastItem && 'isStreaming' in lastItem
    ? Boolean(lastItem.isStreaming)
    : null;

  return {
    requestedSessionId: requestedSessionId ?? null,
    sessionExists: Boolean(session),
    sessionId: session?.sessionId ?? null,
    sessionStatus: session?.status ?? null,
    sessionError: session?.error ?? null,
    turnCount: session?.dialogTurns.length ?? 0,
    lastTurnId: lastTurn?.id ?? null,
    lastTurnStatus: lastTurn?.status ?? null,
    lastTurnError: lastTurn?.error ?? null,
    roundCount: lastTurn?.modelRounds.length ?? 0,
    lastRoundId: lastRound?.id ?? null,
    lastRoundStatus: lastRound?.status ?? null,
    lastRoundError: lastRound?.error ?? null,
    lastRoundIsStreaming: lastRound?.isStreaming ?? null,
    lastRoundIsComplete: lastRound?.isComplete ?? null,
    itemCount: lastRound?.items.length ?? 0,
    lastItemId: lastItem?.id ?? null,
    lastItemType: lastItem?.type ?? null,
    lastItemStatus: lastItem?.status ?? null,
    lastItemIsStreaming,
    lastItemToolName: lastToolItem?.toolName ?? null,
    lastItemToolCallId: lastToolItem?.toolCall.id ?? null,
    lastItemToolResultSuccess: lastToolItem?.toolResult?.success ?? null,
    lastItemToolResultError: lastToolItem?.toolResult?.error ?? null,
    lastItemReviewResultFingerprint: lastToolItem?.toolName === 'submit_code_review'
      ? fingerprintReviewResult(lastToolItem.toolResult?.result, lastToolItem)
      : null,
  };
}

export function areBtwReviewLifecycleSignalsEqual(
  left: BtwReviewLifecycleSignal,
  right: BtwReviewLifecycleSignal,
): boolean {
  return (
    left.requestedSessionId === right.requestedSessionId &&
    left.sessionExists === right.sessionExists &&
    left.sessionId === right.sessionId &&
    left.sessionStatus === right.sessionStatus &&
    left.sessionError === right.sessionError &&
    left.turnCount === right.turnCount &&
    left.lastTurnId === right.lastTurnId &&
    left.lastTurnStatus === right.lastTurnStatus &&
    left.lastTurnError === right.lastTurnError &&
    left.roundCount === right.roundCount &&
    left.lastRoundId === right.lastRoundId &&
    left.lastRoundStatus === right.lastRoundStatus &&
    left.lastRoundError === right.lastRoundError &&
    left.lastRoundIsStreaming === right.lastRoundIsStreaming &&
    left.lastRoundIsComplete === right.lastRoundIsComplete &&
    left.itemCount === right.itemCount &&
    left.lastItemId === right.lastItemId &&
    left.lastItemType === right.lastItemType &&
    left.lastItemStatus === right.lastItemStatus &&
    left.lastItemIsStreaming === right.lastItemIsStreaming &&
    left.lastItemToolName === right.lastItemToolName &&
    left.lastItemToolCallId === right.lastItemToolCallId &&
    left.lastItemToolResultSuccess === right.lastItemToolResultSuccess &&
    left.lastItemToolResultError === right.lastItemToolResultError &&
    left.lastItemReviewResultFingerprint === right.lastItemReviewResultFingerprint
  );
}

export function readBtwReviewLifecycleSnapshot(
  state: FlowChatState,
  childSessionId?: string,
): BtwReviewLifecycleSnapshot {
  const session = childSessionId ? state.sessions.get(childSessionId) : undefined;
  return {
    session,
    signal: deriveBtwReviewLifecycleSignal(session, childSessionId),
  };
}

function arePresentationSnapshotsEqual(
  left: BtwPresentationSessionSnapshot,
  right: BtwPresentationSessionSnapshot,
): boolean {
  return (
    left.childSessionId === right.childSessionId &&
    left.parentSessionId === right.parentSessionId &&
    left.childSession === right.childSession &&
    left.parentSession === right.parentSession
  );
}

/**
 * Splits mounted BTW state into two lifecycles:
 * - presentation sessions freeze and unsubscribe while their retained tab is hidden;
 * - review lifecycle stays subscribed, but only publishes semantic state changes.
 */
export function useBtwSessionSnapshots({
  childSessionId,
  parentSessionId,
  isActive,
}: UseBtwSessionSnapshotsOptions): BtwSessionSnapshots {
  const [presentationSnapshot, setPresentationSnapshot] = useState(() =>
    readBtwPresentationSessionSnapshot(flowChatStore.getState(), childSessionId, parentSessionId),
  );
  const [reviewSnapshot, setReviewSnapshot] = useState(() =>
    readBtwReviewLifecycleSnapshot(flowChatStore.getState(), childSessionId),
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const syncPresentationSnapshot = (state: FlowChatState) => {
      const next = readBtwPresentationSessionSnapshot(state, childSessionId, parentSessionId);
      setPresentationSnapshot(previous =>
        arePresentationSnapshotsEqual(previous, next) ? previous : next,
      );
    };

    syncPresentationSnapshot(flowChatStore.getState());
    return flowChatStore.subscribe(syncPresentationSnapshot);
  }, [childSessionId, isActive, parentSessionId]);

  useEffect(() => {
    const syncReviewSnapshot = (state: FlowChatState) => {
      const nextSession = childSessionId ? state.sessions.get(childSessionId) : undefined;
      setReviewSnapshot(previous => {
        if (previous.session === nextSession) {
          return previous;
        }

        const next = {
          session: nextSession,
          signal: deriveBtwReviewLifecycleSignal(nextSession, childSessionId),
        };
        return areBtwReviewLifecycleSignalsEqual(previous.signal, next.signal) ? previous : next;
      });
    };

    syncReviewSnapshot(flowChatStore.getState());
    return flowChatStore.subscribe(syncReviewSnapshot);
  }, [childSessionId]);

  const requestedChildSessionId = childSessionId ?? null;
  const requestedParentSessionId = parentSessionId ?? null;
  const currentPresentationSnapshot = isActive
    ? readBtwPresentationSessionSnapshot(
        flowChatStore.getState(),
        childSessionId,
        parentSessionId,
      )
    : presentationSnapshot.childSessionId === requestedChildSessionId &&
        presentationSnapshot.parentSessionId === requestedParentSessionId
      ? presentationSnapshot
      : readBtwPresentationSessionSnapshot(
          flowChatStore.getState(),
          childSessionId,
          parentSessionId,
        );
  const currentReviewSnapshot =
    reviewSnapshot.signal.requestedSessionId === requestedChildSessionId
      ? reviewSnapshot
      : readBtwReviewLifecycleSnapshot(flowChatStore.getState(), childSessionId);

  return {
    childSession: currentPresentationSnapshot.childSession,
    parentSession: currentPresentationSnapshot.parentSession,
    reviewSession: currentReviewSnapshot.session,
    reviewSignal: currentReviewSnapshot.signal,
  };
}

function fingerprintReviewResult(value: unknown, cacheOwner?: object): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const cacheKey = typeof value === 'object' ? value : cacheOwner;
  if (cacheKey) {
    const cached = reviewResultFingerprintCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  let serialized: string;
  if (typeof value === 'string') {
    serialized = value;
  } else {
    try {
      const json = JSON.stringify(value);
      serialized = typeof json === 'string' ? json : String(value);
    } catch {
      if (cacheKey) {
        reviewResultFingerprintCache.set(cacheKey, 'unserializable');
      }
      return 'unserializable';
    }
  }

  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const fingerprint = `${serialized.length}:${(hash >>> 0).toString(36)}`;
  if (cacheKey) {
    reviewResultFingerprintCache.set(cacheKey, fingerprint);
  }
  return fingerprint;
}
