import { SessionExecutionState } from '../state-machine/types';
import type { DialogTurn, FlowChatState, Session } from '../types/flow-chat';

export type SessionReviewActivityKind = 'review' | 'deep_review';
export type SessionReviewActivityLifecycle =
  | 'running'
  | 'finishing'
  | 'completed'
  | 'cancelled'
  | 'error'
  | 'idle';

export interface SessionReviewActivity {
  parentSessionId: string;
  childSessionId: string;
  kind: SessionReviewActivityKind;
  lifecycle: SessionReviewActivityLifecycle;
  isBlocking: boolean;
  startedAt: number;
  updatedAt: number;
}

interface ReviewActivitySelection {
  latest: SessionReviewActivity | null;
  latestBlocking: SessionReviewActivity | null;
}

export type SessionExecutionStateResolver = (
  sessionId: string,
) => SessionExecutionState | undefined;

const BLOCKING_LIFECYCLES = new Set<SessionReviewActivityLifecycle>([
  'running',
  'finishing',
]);

function deriveLifecycleFromTurn(
  turn?: DialogTurn,
  session?: Session,
): SessionReviewActivityLifecycle {
  if (session?.error) {
    return 'error';
  }

  switch (turn?.status) {
    case 'pending':
    case 'image_analyzing':
    case 'processing':
      return 'running';
    case 'finishing':
      return 'finishing';
    case 'cancelled':
      return 'cancelled';
    case 'error':
      return 'error';
    case 'completed':
      return 'completed';
    default:
      return 'idle';
  }
}

function deriveLifecycle(
  session: Session,
  executionState?: SessionExecutionState,
): SessionReviewActivityLifecycle {
  if (session.error) {
    return 'error';
  }

  switch (executionState) {
    case SessionExecutionState.PROCESSING:
      return 'running';
    case SessionExecutionState.FINISHING:
      return 'finishing';
    case SessionExecutionState.ERROR:
      return 'error';
    case SessionExecutionState.IDLE:
    default:
      return deriveLifecycleFromTurn(
        session.dialogTurns[session.dialogTurns.length - 1],
        session,
      );
  }
}

function toReviewActivity(
  session: Session,
  parentSessionId: string,
  resolveExecutionState?: SessionExecutionStateResolver,
): SessionReviewActivity | null {
  const kind = session.sessionKind === 'deep_review'
    ? 'deep_review'
    : session.sessionKind === 'review'
      ? 'review'
      : null;
  if (
    !kind ||
    session.parentSessionId !== parentSessionId
  ) {
    return null;
  }

  const lifecycle = deriveLifecycle(
    session,
    resolveExecutionState?.(session.sessionId),
  );

  return {
    parentSessionId,
    childSessionId: session.sessionId,
    kind,
    lifecycle,
    isBlocking: BLOCKING_LIFECYCLES.has(lifecycle),
    startedAt: session.createdAt,
    updatedAt: session.lastActiveAt || session.updatedAt || session.createdAt,
  };
}

function isNewerReviewActivity(
  candidate: SessionReviewActivity,
  current: SessionReviewActivity | null,
): boolean {
  return (
    current === null ||
    candidate.updatedAt > current.updatedAt ||
    (
      candidate.updatedAt === current.updatedAt &&
      candidate.startedAt > current.startedAt
    )
  );
}

function addReviewActivity(
  selection: ReviewActivitySelection,
  activity: SessionReviewActivity,
): void {
  if (isNewerReviewActivity(activity, selection.latest)) {
    selection.latest = activity;
  }
  if (
    activity.isBlocking &&
    isNewerReviewActivity(activity, selection.latestBlocking)
  ) {
    selection.latestBlocking = activity;
  }
}

function selectedReviewActivity(
  selection?: ReviewActivitySelection,
): SessionReviewActivity | null {
  return selection?.latestBlocking ?? selection?.latest ?? null;
}

export function isReviewActivityBlocking(
  activity?: SessionReviewActivity | null,
): boolean {
  return Boolean(activity?.isBlocking);
}

export function deriveSessionReviewActivity(
  state: FlowChatState,
  parentSessionId?: string | null,
  resolveExecutionState?: SessionExecutionStateResolver,
): SessionReviewActivity | null {
  if (!parentSessionId) {
    return null;
  }

  const selection: ReviewActivitySelection = {
    latest: null,
    latestBlocking: null,
  };
  for (const session of state.sessions.values()) {
    const activity = toReviewActivity(
      session,
      parentSessionId,
      resolveExecutionState,
    );
    if (activity) {
      addReviewActivity(selection, activity);
    }
  }
  return selectedReviewActivity(selection);
}

/** Derives every parent badge in one pass for list projections. */
export function deriveSessionReviewActivities(
  state: FlowChatState,
  resolveExecutionState?: SessionExecutionStateResolver,
): ReadonlyMap<string, SessionReviewActivity> {
  const selections = new Map<string, ReviewActivitySelection>();

  for (const session of state.sessions.values()) {
    const parentSessionId = session.parentSessionId;
    if (!parentSessionId) {
      continue;
    }
    const activity = toReviewActivity(
      session,
      parentSessionId,
      resolveExecutionState,
    );
    if (!activity) {
      continue;
    }

    let selection = selections.get(parentSessionId);
    if (!selection) {
      selection = { latest: null, latestBlocking: null };
      selections.set(parentSessionId, selection);
    }
    addReviewActivity(selection, activity);
  }

  const selected = new Map<string, SessionReviewActivity>();
  for (const [parentSessionId, selection] of selections) {
    const activity = selectedReviewActivity(selection);
    if (activity) {
      selected.set(parentSessionId, activity);
    }
  }
  return selected;
}
