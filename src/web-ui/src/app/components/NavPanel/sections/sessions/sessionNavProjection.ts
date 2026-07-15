import { useCallback, useRef, useSyncExternalStore } from 'react';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { FlowChatState, Session } from '@/flow_chat/types/flow-chat';
import {
  deriveSessionReviewActivities,
  isReviewActivityBlocking,
} from '@/flow_chat/utils/sessionReviewActivity';

function latestTurnStatus(session: Session): string | null {
  if (session.sessionKind !== 'review' && session.sessionKind !== 'deep_review') {
    return null;
  }

  return session.dialogTurns[session.dialogTurns.length - 1]?.status ?? null;
}

function sessionNavFingerprint(session: Session): string {
  return JSON.stringify([
    session.sessionId,
    session.title ?? null,
    session.titleSource ?? null,
    session.titleI18nKey ?? null,
    session.titleI18nParams ?? null,
    session.mode ?? null,
    session.createdAt,
    Boolean(session.error),
    session.workspacePath ?? null,
    session.remoteConnectionId ?? null,
    session.remoteSshHost ?? null,
    session.sessionKind,
    session.parentSessionId ?? null,
    session.btwOrigin?.requestId ?? null,
    session.btwOrigin?.parentSessionId ?? null,
    session.btwOrigin?.parentDialogTurnId ?? null,
    session.btwOrigin?.parentTurnIndex ?? null,
    session.parentToolCallId ?? null,
    session.subagentType ?? null,
    session.hasUnreadCompletion ?? null,
    session.needsUserAttention ?? null,
    session.isAutomationSession === true,
    session.isTransient === true,
    latestTurnStatus(session),
  ]);
}

function reviewActivityBadgeFingerprint(state: FlowChatState): string {
  return JSON.stringify(
    Array.from(deriveSessionReviewActivities(state).entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([parentSessionId, activity]) => [
        parentSessionId,
        isReviewActivityBlocking(activity) ? activity.kind : null,
      ]),
  );
}

function sessionNavFingerprints(
  sessions: ReadonlyMap<string, Session>,
  cache: WeakMap<Session, string>,
): Map<string, string> {
  const fingerprints = new Map<string, string>();
  for (const [sessionId, session] of sessions) {
    let fingerprint = cache.get(session);
    if (fingerprint === undefined) {
      fingerprint = sessionNavFingerprint(session);
      cache.set(session, fingerprint);
    }
    fingerprints.set(sessionId, fingerprint);
  }
  return fingerprints;
}

function fingerprintsEqual(
  previous: ReadonlyMap<string, string>,
  next: ReadonlyMap<string, string>,
): boolean {
  if (previous.size !== next.size) {
    return false;
  }

  for (const [sessionId, fingerprint] of next) {
    if (previous.get(sessionId) !== fingerprint) {
      return false;
    }
  }
  return true;
}

/** Keeps the navigation snapshot stable for streamed content-only changes. */
export function createSessionNavProjectionSelector(): (
  state: FlowChatState,
) => FlowChatState {
  let projection: FlowChatState | undefined;
  let sourceState: FlowChatState | undefined;
  let fingerprints = new Map<string, string>();
  let reviewActivityBadge = '';
  const fingerprintCache = new WeakMap<Session, string>();

  return (state: FlowChatState): FlowChatState => {
    if (projection && sourceState === state) {
      return projection;
    }

    const nextFingerprints = sessionNavFingerprints(state.sessions, fingerprintCache);
    const nextReviewActivityBadge = reviewActivityBadgeFingerprint(state);
    sourceState = state;
    if (
      projection &&
      projection.activeSessionId === state.activeSessionId &&
      fingerprintsEqual(fingerprints, nextFingerprints) &&
      reviewActivityBadge === nextReviewActivityBadge
    ) {
      return projection;
    }

    fingerprints = nextFingerprints;
    reviewActivityBadge = nextReviewActivityBadge;
    projection = {
      activeSessionId: state.activeSessionId,
      sessions: state.sessions,
    };
    return projection;
  };
}

const selectSessionNavProjection = createSessionNavProjectionSelector();

function getSessionNavProjection(): FlowChatState {
  return selectSessionNavProjection(flowChatStore.getState());
}

/**
 * Starts the store listener only after the surrounding session section is
 * visible. Every visible section shares the memoized projection calculation.
 */
export function subscribeToSessionNavProjection(
  onStoreChange: () => void,
): () => void {
  let current = getSessionNavProjection();

  return flowChatStore.subscribe(state => {
    const next = selectSessionNavProjection(state);
    if (next === current) {
      return;
    }
    current = next;
    onStoreChange();
  });
}

/** Freezes navigation presentation while hidden and commit-checks on resume. */
export function useSessionNavProjection(isVisible: boolean): FlowChatState {
  const frozenSnapshotRef = useRef<{ value: FlowChatState } | null>(null);
  frozenSnapshotRef.current ??= { value: getSessionNavProjection() };
  const frozenSnapshot = frozenSnapshotRef.current;

  const subscribe = useCallback((onStoreChange: () => void) => (
    isVisible ? subscribeToSessionNavProjection(onStoreChange) : () => {}
  ), [isVisible]);

  const getSnapshot = useCallback(() => {
    if (isVisible) {
      frozenSnapshot.value = getSessionNavProjection();
    }
    return frozenSnapshot.value;
  }, [frozenSnapshot, isVisible]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
