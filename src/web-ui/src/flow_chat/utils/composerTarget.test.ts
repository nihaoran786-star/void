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
  it('routes an explicitly selected child panel to its persistent child session', () => {
    const mainSession = createSession();
    const childSession = createSession({
      sessionId: 'subagent-session',
      title: 'Video agent',
      parentSessionId: mainSession.sessionId,
      sessionKind: 'subagent',
      subagentType: 'video-agent',
    });

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      selectedTarget: {
        kind: 'child',
        sessionId: childSession.sessionId,
      },
      activeChildPanel: {
        childSessionId: childSession.sessionId,
        parentSessionId: mainSession.sessionId,
      },
      sessions: new Map([
        [mainSession.sessionId, mainSession],
        [childSession.sessionId, childSession],
      ]),
    })).toEqual({
      status: 'ready',
      kind: 'child',
      sessionId: childSession.sessionId,
      parentSessionId: mainSession.sessionId,
      sessionKind: 'subagent',
      agentType: 'video-agent',
    });
  });

  it('rejects a selected child when the active panel belongs to another parent', () => {
    const mainSession = createSession();
    const childSession = createSession({
      sessionId: 'subagent-session',
      parentSessionId: mainSession.sessionId,
      sessionKind: 'subagent',
    });

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      selectedTarget: {
        kind: 'child',
        sessionId: childSession.sessionId,
      },
      activeChildPanel: {
        childSessionId: childSession.sessionId,
        parentSessionId: 'different-main-session',
      },
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

  it('does not fall back to the main session when the selected child panel is closed', () => {
    const mainSession = createSession();
    const childSession = createSession({
      sessionId: 'btw-session',
      parentSessionId: mainSession.sessionId,
      sessionKind: 'btw',
    });

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      selectedTarget: {
        kind: 'child',
        sessionId: childSession.sessionId,
      },
      activeChildPanel: null,
      sessions: new Map([
        [mainSession.sessionId, mainSession],
        [childSession.sessionId, childSession],
      ]),
    })).toEqual({
      status: 'unavailable',
      kind: 'child',
      reason: 'panel_closed',
      requestedSessionId: childSession.sessionId,
    });
  });

  it('reports a missing selected child session without rerouting the message', () => {
    const mainSession = createSession();

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      selectedTarget: {
        kind: 'child',
        sessionId: 'missing-child',
      },
      activeChildPanel: {
        childSessionId: 'missing-child',
        parentSessionId: mainSession.sessionId,
      },
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
      selectedTarget: {
        kind: 'child',
        sessionId: reviewSession.sessionId,
      },
      activeChildPanel: {
        childSessionId: reviewSession.sessionId,
        parentSessionId: mainSession.sessionId,
      },
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

  it('rejects a selected child from another workspace even when paths match', () => {
    const mainSession = createSession();
    const childSession = createSession({
      sessionId: 'foreign-child',
      workspaceId: 'workspace-2',
      parentSessionId: mainSession.sessionId,
      sessionKind: 'subagent',
    });

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      selectedTarget: {
        kind: 'child',
        sessionId: childSession.sessionId,
      },
      activeChildPanel: {
        childSessionId: childSession.sessionId,
        parentSessionId: mainSession.sessionId,
      },
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
      selectedTarget: {
        kind: 'child',
        sessionId: childSession.sessionId,
      },
      activeChildPanel: {
        childSessionId: childSession.sessionId,
        parentSessionId: mainSession.sessionId,
      },
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

  it('keeps an explicit main target while a valid child panel remains open', () => {
    const mainSession = createSession();
    const childSession = createSession({
      sessionId: 'child-session',
      parentSessionId: mainSession.sessionId,
      sessionKind: 'btw',
    });

    expect(resolveComposerTarget({
      mainSessionId: mainSession.sessionId,
      selectedTarget: { kind: 'main' },
      activeChildPanel: {
        childSessionId: childSession.sessionId,
        parentSessionId: mainSession.sessionId,
      },
      sessions: new Map([
        [mainSession.sessionId, mainSession],
        [childSession.sessionId, childSession],
      ]),
    })).toEqual({
      status: 'ready',
      kind: 'main',
      sessionId: mainSession.sessionId,
    });
  });
});
