import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type {
  DialogTurn,
  FlowChatState,
  FlowItem,
  Session,
} from '@/flow_chat/types/flow-chat';
import type {
  ShortDramaTeamAgentStatusProjection,
  ShortDramaTeamAgentStatusTarget,
} from '@/flow_chat/types/short-drama-team-status';
import { areShortDramaTeamStatusProjectionsEqual } from '@/flow_chat/types/short-drama-team-status';

const activeTurnStatuses = new Set<DialogTurn['status']>([
  'pending',
  'image_analyzing',
  'processing',
  'finishing',
  'cancelling',
]);

const activeItemStatuses = new Set<FlowItem['status']>([
  'pending',
  'preparing',
  'running',
  'streaming',
  'receiving',
  'analyzing',
]);

export function deriveShortDramaTeamAgentStatus(
  session: Session | undefined,
): Omit<ShortDramaTeamAgentStatusProjection, 'tabId'> {
  if (!session) {
    return { status: 'waiting' };
  }

  const lastTurn = session.dialogTurns[session.dialogTurns.length - 1];
  const lastRound = lastTurn?.modelRounds[lastTurn.modelRounds.length - 1];
  const lastItem = lastRound?.items[lastRound.items.length - 1];
  const lastToolItem = lastItem?.type === 'tool' ? lastItem : undefined;

  if (
    session.status === 'error'
    || Boolean(session.error)
    || session.historyState === 'failed'
    || session.hasUnreadCompletion === 'error'
    || session.hasUnreadCompletion === 'interrupted'
    || lastTurn?.status === 'error'
    || lastRound?.status === 'error'
    || lastItem?.status === 'error'
    || lastToolItem?.toolResult?.success === false
  ) {
    return { status: 'failed' };
  }

  if (
    lastTurn?.status === 'cancelled'
    || lastRound?.status === 'cancelled'
    || lastItem?.status === 'cancelled'
  ) {
    return { status: 'cancelled' };
  }

  if (
    session.needsUserAttention
    || lastItem?.status === 'pending_confirmation'
  ) {
    return {
      status: 'attention',
      activity: session.needsUserAttention ? 'needs_attention' : 'waiting_permission',
    };
  }

  const runtimeActivity = lastItem?.type === 'text'
    ? lastItem.runtimeStatus?.phase
    : undefined;
  if (
    (lastTurn && activeTurnStatuses.has(lastTurn.status))
    || lastRound?.status === 'pending'
    || lastRound?.status === 'streaming'
    || lastRound?.isStreaming
    || (lastItem && activeItemStatuses.has(lastItem.status))
    || (lastItem && 'isStreaming' in lastItem && Boolean(lastItem.isStreaming))
  ) {
    return {
      status: 'live',
      activity: runtimeActivity
        ?? (lastToolItem ? 'running_tool' : 'streaming'),
    };
  }

  if (
    lastTurn?.status === 'completed'
    || lastRound?.status === 'completed'
    || lastItem?.status === 'completed'
    || session.hasUnreadCompletion === 'completed'
  ) {
    return { status: 'completed' };
  }

  return { status: 'waiting' };
}

export function selectShortDramaTeamStatusProjection(
  targets: readonly ShortDramaTeamAgentStatusTarget[],
  state: FlowChatState,
): ShortDramaTeamAgentStatusProjection[] {
  return targets.map(target => ({
    tabId: target.tabId,
    ...deriveShortDramaTeamAgentStatus(
      target.sessionId
        ? state.sessions.get(target.sessionId)
        : undefined,
    ),
  }));
}

export function readShortDramaTeamStatusProjection(
  targets: readonly ShortDramaTeamAgentStatusTarget[],
): ShortDramaTeamAgentStatusProjection[] {
  return selectShortDramaTeamStatusProjection(targets, flowChatStore.getState());
}

export function subscribeShortDramaTeamStatusProjection(
  targets: readonly ShortDramaTeamAgentStatusTarget[],
  listener: (projection: readonly ShortDramaTeamAgentStatusProjection[]) => void,
): () => void {
  let previous = readShortDramaTeamStatusProjection(targets);

  return flowChatStore.subscribe(state => {
    const next = selectShortDramaTeamStatusProjection(targets, state);
    if (areShortDramaTeamStatusProjectionsEqual(previous, next)) {
      return;
    }

    previous = next;
    listener(next);
  });
}
