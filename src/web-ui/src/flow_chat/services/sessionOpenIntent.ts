import type { Session } from '../types/flow-chat';

export type SessionOpenIntentStatus =
  | 'missing'
  | 'new'
  | 'loading'
  | 'ready'
  | 'partial'
  | 'context_pending'
  | 'error'
  | 'unsupported';

export type SessionOpenIntentSource =
  | 'none'
  | 'runtime'
  | 'history'
  | 'context_restore';

export type SessionOpenIntentAction =
  | 'none'
  | 'show_empty'
  | 'load_history'
  | 'show_loading'
  | 'show_history'
  | 'show_partial_history'
  | 'restore_context_before_send'
  | 'show_error';

export interface SessionOpenIntentError {
  code:
    | 'session_missing'
    | 'history_load_failed'
    | 'history_workspace_missing'
    | 'context_restore_failed';
  message: string;
}

export interface ResolveSessionOpenIntentInput {
  session?: Pick<
    Session,
    | 'sessionId'
    | 'dialogTurns'
    | 'historyState'
    | 'contextRestoreState'
    | 'isHistorical'
    | 'isPartial'
    | 'loadedTurnCount'
    | 'totalTurnCount'
    | 'workspacePath'
    | 'error'
  > | null;
  requestedSessionId?: string | null;
  loadInFlight?: boolean;
}

export interface SessionOpenIntent {
  sessionId: string | null;
  status: SessionOpenIntentStatus;
  source: SessionOpenIntentSource;
  action: SessionOpenIntentAction;
  error?: SessionOpenIntentError;
  historyState?: Session['historyState'];
  contextRestoreState?: Session['contextRestoreState'];
  turnCount: number;
  loadedTurnCount?: number;
  totalTurnCount?: number;
}

const normalizeMessage = (value: unknown, fallback: string): string => {
  if (value instanceof Error && value.message.trim()) return value.message;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
};

export function resolveSessionOpenIntent(
  input: ResolveSessionOpenIntentInput
): SessionOpenIntent {
  const session = input.session ?? null;
  if (!session) {
    const sessionId = input.requestedSessionId?.trim() || null;
    return {
      sessionId,
      status: 'missing',
      source: 'none',
      action: 'none',
      turnCount: 0,
      error: {
        code: 'session_missing',
        message: sessionId
          ? `Session '${sessionId}' is not available in the current store.`
          : 'No session is selected.',
      },
    };
  }

  const turnCount = session.dialogTurns?.length ?? 0;
  const historyState = session.historyState ?? (session.isHistorical ? 'metadata-only' : 'new');

  if (
    session.isHistorical &&
    (historyState === 'metadata-only' || historyState === 'hydrating') &&
    !session.workspacePath?.trim()
  ) {
    return {
      sessionId: session.sessionId,
      status: 'unsupported',
      source: 'history',
      action: 'show_error',
      historyState,
      contextRestoreState: session.contextRestoreState,
      turnCount,
      loadedTurnCount: session.loadedTurnCount,
      totalTurnCount: session.totalTurnCount,
      error: {
        code: 'history_workspace_missing',
        message: 'Session history cannot load without a workspace path.',
      },
    };
  }

  if (historyState === 'failed') {
    return {
      sessionId: session.sessionId,
      status: 'error',
      source: 'history',
      action: 'show_error',
      historyState,
      contextRestoreState: session.contextRestoreState,
      turnCount,
      loadedTurnCount: session.loadedTurnCount,
      totalTurnCount: session.totalTurnCount,
      error: {
        code: 'history_load_failed',
        message: normalizeMessage(session.error, 'Session history did not load.'),
      },
    };
  }

  if (historyState === 'metadata-only') {
    return {
      sessionId: session.sessionId,
      status: 'loading',
      source: 'history',
      action: input.loadInFlight ? 'show_loading' : 'load_history',
      historyState,
      contextRestoreState: session.contextRestoreState,
      turnCount,
      loadedTurnCount: session.loadedTurnCount,
      totalTurnCount: session.totalTurnCount,
    };
  }

  if (historyState === 'hydrating') {
    return {
      sessionId: session.sessionId,
      status: 'loading',
      source: 'history',
      action: 'show_loading',
      historyState,
      contextRestoreState: session.contextRestoreState,
      turnCount,
      loadedTurnCount: session.loadedTurnCount,
      totalTurnCount: session.totalTurnCount,
    };
  }

  if (session.contextRestoreState === 'failed') {
    return {
      sessionId: session.sessionId,
      status: 'error',
      source: 'context_restore',
      action: 'show_error',
      historyState,
      contextRestoreState: session.contextRestoreState,
      turnCount,
      loadedTurnCount: session.loadedTurnCount,
      totalTurnCount: session.totalTurnCount,
      error: {
        code: 'context_restore_failed',
        message: normalizeMessage(session.error, 'Session runtime context did not restore.'),
      },
    };
  }

  if (session.contextRestoreState === 'pending') {
    return {
      sessionId: session.sessionId,
      status: 'context_pending',
      source: 'context_restore',
      action: 'restore_context_before_send',
      historyState,
      contextRestoreState: session.contextRestoreState,
      turnCount,
      loadedTurnCount: session.loadedTurnCount,
      totalTurnCount: session.totalTurnCount,
    };
  }

  if (session.isPartial) {
    return {
      sessionId: session.sessionId,
      status: 'partial',
      source: 'history',
      action: 'show_partial_history',
      historyState,
      contextRestoreState: session.contextRestoreState,
      turnCount,
      loadedTurnCount: session.loadedTurnCount,
      totalTurnCount: session.totalTurnCount,
    };
  }

  if (turnCount === 0 && historyState === 'new') {
    return {
      sessionId: session.sessionId,
      status: 'new',
      source: 'runtime',
      action: 'show_empty',
      historyState,
      contextRestoreState: session.contextRestoreState,
      turnCount,
    };
  }

  return {
    sessionId: session.sessionId,
    status: 'ready',
    source: historyState === 'ready' ? 'history' : 'runtime',
    action: 'show_history',
    historyState,
    contextRestoreState: session.contextRestoreState,
    turnCount,
    loadedTurnCount: session.loadedTurnCount,
    totalTurnCount: session.totalTurnCount,
  };
}
