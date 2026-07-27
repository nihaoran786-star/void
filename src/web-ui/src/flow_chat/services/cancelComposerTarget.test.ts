import { describe, expect, it, vi } from 'vitest';

import type { Session } from '../types/flow-chat';
import { cancelComposerTarget } from './cancelComposerTarget';

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'main-session',
    title: 'Session',
    dialogTurns: [],
    status: 'idle',
    config: { modelName: 'gpt-test', agentType: 'agentic' },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    maxContextTokens: 128128,
    mode: 'agentic',
    sessionKind: 'normal',
    ...overrides,
  };
}

describe('cancelComposerTarget', () => {
  it('cancels a subagent by its exact child session id', async () => {
    const cancelSubagent = vi.fn().mockResolvedValue(undefined);
    const cancelMain = vi.fn();
    const cancelBtw = vi.fn();

    await cancelComposerTarget(
      createSession({
        sessionId: 'child-agent',
        sessionKind: 'subagent',
        parentSessionId: 'main-session',
      }),
      { cancelMain, cancelBtw, cancelSubagent },
    );

    expect(cancelSubagent).toHaveBeenCalledWith('child-agent');
    expect(cancelMain).not.toHaveBeenCalled();
    expect(cancelBtw).not.toHaveBeenCalled();
  });

  it('cancels the latest active BTW request instead of a stale origin request', async () => {
    const cancelBtw = vi.fn().mockResolvedValue(undefined);

    await cancelComposerTarget(
      createSession({
        sessionId: 'child-btw',
        sessionKind: 'btw',
        parentSessionId: 'main-session',
        btwOrigin: {
          requestId: 'stale-request',
          parentSessionId: 'main-session',
        },
        dialogTurns: [
          {
            id: 'btw-turn-active-request',
            status: 'processing',
            userMessage: {
              id: 'user-1',
              content: 'Continue',
              timestamp: 1,
            },
            modelRounds: [],
          },
        ],
      }),
      {
        cancelMain: vi.fn(),
        cancelBtw,
        cancelSubagent: vi.fn(),
      },
    );

    expect(cancelBtw).toHaveBeenCalledWith('active-request');
  });

  it('keeps the existing main-session cancellation path', async () => {
    const cancelMain = vi.fn().mockResolvedValue(true);

    await cancelComposerTarget(createSession(), {
      cancelMain,
      cancelBtw: vi.fn(),
      cancelSubagent: vi.fn(),
    });

    expect(cancelMain).toHaveBeenCalledOnce();
  });
});
