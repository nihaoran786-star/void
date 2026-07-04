interface SessionNavRowActiveInput {
  rowSessionId: string;
  activeTabId?: string | null;
  activeSessionId?: string | null;
  activeChildSessionId?: string | null;
  activeChildParentSessionId?: string | null;
}

interface SessionNavListStateInput {
  visibleTopLevelCount: number;
  totalTopLevelCount: number;
  hasMoreUnloaded: boolean;
  isLoading: boolean;
}

export type SessionNavListStatus = 'empty' | 'loading' | 'ready';
export type SessionNavListSource = 'local' | 'metadata_page';
export type SessionNavListAction = 'none' | 'show_loading' | 'show_rows';

export interface SessionNavListState {
  status: SessionNavListStatus;
  source: SessionNavListSource;
  action: SessionNavListAction;
  showExpandToggle: boolean;
}

const SESSION_TAB_ID = 'session';
const SESSIONS_LEVEL_0 = 5;

export function isSessionNavRowActive({
  rowSessionId,
  activeTabId,
  activeSessionId,
  activeChildSessionId,
  activeChildParentSessionId,
}: SessionNavRowActiveInput): boolean {
  if (activeTabId !== SESSION_TAB_ID || !activeSessionId) {
    return false;
  }

  if (activeChildSessionId && activeChildParentSessionId === activeSessionId) {
    return rowSessionId === activeChildSessionId;
  }

  return rowSessionId === activeSessionId;
}

export function resolveSessionNavListState({
  visibleTopLevelCount,
  totalTopLevelCount,
  hasMoreUnloaded,
  isLoading,
}: SessionNavListStateInput): SessionNavListState {
  const normalizedVisible = Math.max(visibleTopLevelCount, 0);
  const normalizedTotal = Math.max(totalTopLevelCount, normalizedVisible);
  const source: SessionNavListSource =
    hasMoreUnloaded || normalizedTotal > normalizedVisible
      ? 'metadata_page'
      : 'local';

  if (normalizedVisible === 0) {
    return {
      status: isLoading ? 'loading' : 'empty',
      source,
      action: isLoading ? 'show_loading' : 'none',
      showExpandToggle: false,
    };
  }

  return {
    status: 'ready',
    source,
    action: 'show_rows',
    showExpandToggle: normalizedTotal > SESSIONS_LEVEL_0 || hasMoreUnloaded,
  };
}
