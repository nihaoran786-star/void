import { describe, expect, it } from 'vitest';

import type { Session } from '../types/flow-chat';
import { resolveComposerTarget } from './composerTarget';

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'main-session',
    title: 'Main session',
    titleStatus: 'generated',
    dialogTurns: [],
    status: 'idle',
    config: {
      modelName: 'gpt-test',
      agentType: 'agentic',
    },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    todos: [],
    maxContextTokens: 128128,
    mode: 'agentic',
    workspaceId: 'workspace-1',
    workspacePath: 'D:\\workspace',
    parentSessionId: undefined,
    sessionKind: 'normal',
    lastFinishedAt: undefined,
    btwThreads: [],
    btwOrigin: undefined,
    ...overrides,
  };
}

describe('resolveComposerTarget', () => {
  it.each([
    ['subagent', 'video-agent'],
    ['btw', 'agentic'],
  ] as const)(
    'binds an independent %s composer to its persistent child session',
    (sessionKind, expectedAgentType) => {
      const mainSession = createSession();
      const childSession = createSession({
        sessionId: `${sessionKind}-session`,
        parentSessionId: mainSession.sessionId,
        sessionKind,
        subagentType: sessionKind === 'subagent' ? 'video-agent' : undefined,
      });

      expect(resolveComposerTarget({
        mainSessionId: mainSession.sessionId,
        targetSessionId: childSession.sessionId,
        parentSessionId: mainSession.sessionId,
        sessions: new Map([
          [mainSession.sessionId, mainSession],
          [childSession.sessionId, childSession],
        ]),
      })).toEqual({
        status: 'ready',
        kind: 'child',
        sessionId: childSession.sessionId,
        parentSessionId: mainSession.sessionId,
        sessionKind,
        agentType: expectedAgentType,
      });
    },
  );

  it('keeps the primary composer bound to the active main session', () => {
    const mainSession = createSession();

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      sessions: new Map([[mainSession.sessionId, mainSession]]),
    })).toEqual({
      status: 'ready',
      kind: 'main',
      sessionId: mainSession.sessionId,
    });
  });

  it('rejects a child binding whose explicit parent differs from the active main session', () => {
    const mainSession = createSession();
    const childSession = createSession({
      sessionId: 'subagent-session',
      parentSessionId: mainSession.sessionId,
      sessionKind: 'subagent',
    });

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      targetSessionId: childSession.sessionId,
      parentSessionId: 'different-main-session',
      sessions: new Map([
        [mainSession.sessionId, mainSession],
        [childSession.sessionId, childSession],
      ]),
    })).toEqual({
      status: 'unavailable',
      kind: 'child',
      reason: 'parent_mismatch',
      requestedSessionId: childSession.sessionId,
    });
  });

  it('reports a missing explicit child without falling back to the main session', () => {
    const mainSession = createSession();

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      targetSessionId: 'missing-child',
      parentSessionId: mainSession.sessionId,
      sessions: new Map([[mainSession.sessionId, mainSession]]),
    })).toEqual({
      status: 'unavailable',
      kind: 'child',
      reason: 'missing_child_session',
      requestedSessionId: 'missing-child',
    });
  });

  it('rejects review panels because they do not accept composer messages', () => {
    const mainSession = createSession();
    const reviewSession = createSession({
      sessionId: 'review-session',
      parentSessionId: mainSession.sessionId,
      sessionKind: 'review',
    });

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      targetSessionId: reviewSession.sessionId,
      parentSessionId: mainSession.sessionId,
      sessions: new Map([
        [mainSession.sessionId, mainSession],
        [reviewSession.sessionId, reviewSession],
      ]),
    })).toEqual({
      status: 'unavailable',
      kind: 'child',
      reason: 'unsupported_child_kind',
      requestedSessionId: reviewSession.sessionId,
    });
  });

  it('rejects a child from another workspace even when paths match', () => {
    const mainSession = createSession();
    const childSession = createSession({
      sessionId: 'foreign-child',
      workspaceId: 'workspace-2',
      parentSessionId: mainSession.sessionId,
      sessionKind: 'subagent',
    });

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      targetSessionId: childSession.sessionId,
      parentSessionId: mainSession.sessionId,
      sessions: new Map([
        [mainSession.sessionId, mainSession],
        [childSession.sessionId, childSession],
      ]),
    })).toEqual({
      status: 'unavailable',
      kind: 'child',
      reason: 'workspace_mismatch',
      requestedSessionId: childSession.sessionId,
    });
  });

  it('rejects the same remote path when the SSH host differs', () => {
    const mainSession = createSession({
      workspaceId: undefined,
      workspacePath: '/srv/project',
      remoteConnectionId: 'ssh-user@host-a:22',
      remoteSshHost: 'host-a',
    });
    const childSession = createSession({
      sessionId: 'foreign-remote-child',
      workspaceId: undefined,
      workspacePath: '/srv/project',
      remoteConnectionId: 'ssh-user@host-b:22',
      remoteSshHost: 'host-b',
      parentSessionId: mainSession.sessionId,
      sessionKind: 'subagent',
    });

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      targetSessionId: childSession.sessionId,
      parentSessionId: mainSession.sessionId,
      sessions: new Map([
        [mainSession.sessionId, mainSession],
        [childSession.sessionId, childSession],
      ]),
    })).toEqual({
      status: 'unavailable',
      kind: 'child',
      reason: 'workspace_mismatch',
      requestedSessionId: childSession.sessionId,
    });
  });

  it('reports a missing main session for either composer kind', () => {
    expect(resolveComposerTarget({
      mainSessionId: null,
      sessions: new Map(),
    })).toEqual({
      status: 'unavailable',
      kind: 'main',
      reason: 'missing_main_session',
    });

    expect(resolveComposerTarget({
      mainSessionId: null,
      targetSessionId: 'child',
      parentSessionId: 'parent',
      sessions: new Map(),
    })).toEqual({
      status: 'unavailable',
      kind: 'child',
      reason: 'missing_main_session',
      requestedSessionId: 'child',
    });
  });
});
