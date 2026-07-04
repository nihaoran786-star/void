import { describe, expect, it } from 'vitest';
import type { Session } from '../types/flow-chat';
import { resolveSessionOpenIntent } from './sessionOpenIntent';

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'session-1',
    title: 'Session',
    dialogTurns: [],
    status: 'idle',
    config: { agentType: 'agentic' },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    todos: [],
    mode: 'agentic',
    workspacePath: 'D:/workspace/void',
    sessionKind: 'normal',
    ...overrides,
  };
}

describe('sessionOpenIntent', () => {
  it('represents missing selection explicitly instead of treating empty lists as state', () => {
    expect(resolveSessionOpenIntent({ requestedSessionId: 'missing-1', session: null })).toMatchObject({
      sessionId: 'missing-1',
      status: 'missing',
      source: 'none',
      action: 'none',
      error: {
        code: 'session_missing',
      },
    });
  });

  it('keeps a new runtime session distinct from missing or empty history', () => {
    expect(resolveSessionOpenIntent({ session: createSession({ historyState: 'new' }) })).toMatchObject({
      status: 'new',
      source: 'runtime',
      action: 'show_empty',
      turnCount: 0,
    });
  });

  it('requests historical hydration for metadata-only sessions with workspace scope', () => {
    expect(resolveSessionOpenIntent({
      session: createSession({
        isHistorical: true,
        historyState: 'metadata-only',
        workspacePath: 'D:/workspace/void',
      }),
    })).toMatchObject({
      status: 'loading',
      source: 'history',
      action: 'load_history',
      historyState: 'metadata-only',
    });
  });

  it('renders loading while a history request is already in flight', () => {
    expect(resolveSessionOpenIntent({
      loadInFlight: true,
      session: createSession({
        isHistorical: true,
        historyState: 'metadata-only',
      }),
    })).toMatchObject({
      status: 'loading',
      source: 'history',
      action: 'show_loading',
    });
  });

  it('reports history failures with explicit source and error code', () => {
    expect(resolveSessionOpenIntent({
      session: createSession({
        isHistorical: true,
        historyState: 'failed',
        error: 'disk unavailable',
      }),
    })).toMatchObject({
      status: 'error',
      source: 'history',
      action: 'show_error',
      error: {
        code: 'history_load_failed',
        message: 'disk unavailable',
      },
    });
  });

  it('does not load historical metadata without workspace scope', () => {
    expect(resolveSessionOpenIntent({
      session: createSession({
        isHistorical: true,
        historyState: 'metadata-only',
        workspacePath: '',
      }),
    })).toMatchObject({
      status: 'unsupported',
      source: 'history',
      action: 'show_error',
      error: {
        code: 'history_workspace_missing',
      },
    });
  });

  it('keeps partial history visible with explicit counts', () => {
    expect(resolveSessionOpenIntent({
      session: createSession({
        historyState: 'ready',
        isPartial: true,
        loadedTurnCount: 30,
        totalTurnCount: 120,
        dialogTurns: [{ id: 'turn-1' } as Session['dialogTurns'][number]],
      }),
    })).toMatchObject({
      status: 'partial',
      source: 'history',
      action: 'show_partial_history',
      loadedTurnCount: 30,
      totalTurnCount: 120,
    });
  });

  it('separates backend context restore from history visibility', () => {
    expect(resolveSessionOpenIntent({
      session: createSession({
        historyState: 'ready',
        contextRestoreState: 'pending',
        dialogTurns: [{ id: 'turn-1' } as Session['dialogTurns'][number]],
      }),
    })).toMatchObject({
      status: 'context_pending',
      source: 'context_restore',
      action: 'restore_context_before_send',
    });
  });
});
