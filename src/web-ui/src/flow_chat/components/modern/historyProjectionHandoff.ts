import type { VirtualItem } from '../../store/modernFlowChatStore';

export const SESSION_OPEN_HANDOFF_ITEM_BUDGET = 24;

export interface HistoryProjectionHandoffSnapshot {
  sessionId: string;
  reason: string;
  createdAtMs: number;
  items: VirtualItem[];
  mode: 'bottom-tail';
  targetTurnId: string | null;
  footerHeightPx: number;
}

export interface SelectSessionOpenHistoryProjectionHandoffParams {
  activeSessionId: string | null;
  previousActiveSessionId: string | null | undefined;
  historyState?: string | null;
  isPartial?: boolean | null;
  useStaticInitialHistoryWindow: boolean;
  latestTurnId: string | null;
  latestUserMessageIndex: number;
  virtualItems: VirtualItem[];
  footerHeightPx: number;
  nowMs: number;
  alreadyActivatedSessionId: string | null;
  activeHandoffSessionId: string | null;
}

export function activeSessionHistoryProjectionHandoff(
  snapshot: HistoryProjectionHandoffSnapshot | null,
  activeSessionId: string | null,
): HistoryProjectionHandoffSnapshot | null {
  return snapshot?.sessionId === activeSessionId ? snapshot : null;
}

export function selectSessionOpenHistoryProjectionHandoff(
  params: SelectSessionOpenHistoryProjectionHandoffParams,
): HistoryProjectionHandoffSnapshot | null {
  const {
    activeSessionId,
    previousActiveSessionId,
    historyState,
    isPartial,
    useStaticInitialHistoryWindow,
    latestTurnId,
    latestUserMessageIndex,
    virtualItems,
    footerHeightPx,
    nowMs,
    alreadyActivatedSessionId,
    activeHandoffSessionId,
  } = params;

  const isSessionSwitch = (
    previousActiveSessionId !== undefined &&
    previousActiveSessionId !== activeSessionId
  );

  if (
    !activeSessionId ||
    !isSessionSwitch ||
    historyState !== 'ready' ||
    isPartial === true ||
    useStaticInitialHistoryWindow ||
    !latestTurnId ||
    virtualItems.length < SESSION_OPEN_HANDOFF_ITEM_BUDGET ||
    alreadyActivatedSessionId === activeSessionId ||
    activeHandoffSessionId === activeSessionId
  ) {
    return null;
  }

  const budgetStartIndex = Math.max(0, virtualItems.length - SESSION_OPEN_HANDOFF_ITEM_BUDGET);
  const latestStartIndex = Math.max(0, Math.min(latestUserMessageIndex, virtualItems.length - 1));
  const startIndex = Math.min(budgetStartIndex, latestStartIndex);
  const items = virtualItems.slice(startIndex);

  if (items.length === 0) {
    return null;
  }

  return {
    sessionId: activeSessionId,
    reason: 'session-open',
    createdAtMs: nowMs,
    items,
    mode: 'bottom-tail',
    targetTurnId: latestTurnId,
    footerHeightPx,
  };
}
