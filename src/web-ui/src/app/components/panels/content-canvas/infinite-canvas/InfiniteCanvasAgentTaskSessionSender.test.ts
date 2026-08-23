/**
 * K2 review regressions for the flow-chat seam:
 * - a throwing sendMessage comes back as a typed error, never an exception
 *   (the gateway/panel roll the pending card back to a retryable failure);
 * - the active-session fallback never crosses workspaces (fail-closed when
 *   the session's workspace cannot be verified).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flowChat = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  state: {
    sessions: new Map<string, { workspacePath?: string; config?: { workspacePath?: string } }>(),
    activeSessionId: null as string | null,
  },
}));

vi.mock('@/flow_chat/services/FlowChatManager', () => ({
  FlowChatManager: {
    getInstance: () => ({ sendMessage: flowChat.sendMessage }),
  },
}));

vi.mock('@/flow_chat/store/FlowChatStore', () => ({
  flowChatStore: {
    getState: () => flowChat.state,
  },
}));

import type { InfiniteCanvasAgentTaskSendRequest } from '@/shared/services/infinite-canvas';
import {
  createInfiniteCanvasAgentTaskSessionSender,
  createInfiniteCanvasSessionResolvers,
} from './InfiniteCanvasAgentTaskSessionSender';

const SEND_REQUEST: InfiniteCanvasAgentTaskSendRequest = {
  targetSessionId: 'session-1',
  message: 'task message',
  inputSummary: 'summary',
  binding: {
    workspaceId: 'workspace-1',
    documentId: 'doc-1',
    nodeId: 'card-1',
    resultMode: 'self',
    toolId: 'generate',
    operationId: 'op-1',
  },
};

beforeEach(() => {
  flowChat.sendMessage.mockReset();
  flowChat.state.sessions = new Map();
  flowChat.state.activeSessionId = null;
});

describe('createInfiniteCanvasAgentTaskSessionSender', () => {
  it('returns ready with the target session on a successful send', async () => {
    flowChat.sendMessage.mockResolvedValue(undefined);
    const sender = createInfiniteCanvasAgentTaskSessionSender();

    const result = await sender.sendImageGenerationTask(SEND_REQUEST);

    expect(result).toEqual({ status: 'ready', targetSessionId: 'session-1' });
    expect(flowChat.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('converts a throwing sendMessage into a typed error result', async () => {
    flowChat.sendMessage.mockRejectedValue(new Error('ipc channel closed'));
    const sender = createInfiniteCanvasAgentTaskSessionSender();

    const result = await sender.sendImageGenerationTask(SEND_REQUEST);

    expect(result).toEqual({
      status: 'error',
      error: { message: 'ipc channel closed' },
    });
  });

  it('converts a non-Error throw into a typed error result with a stable message', async () => {
    flowChat.sendMessage.mockRejectedValue('boom');
    const sender = createInfiniteCanvasAgentTaskSessionSender();

    const result = await sender.sendImageGenerationTask(SEND_REQUEST);

    expect(result).toEqual({
      status: 'error',
      error: { message: 'Failed to send the image generation task.' },
    });
  });
});

describe('createInfiniteCanvasSessionResolvers active-session fallback', () => {
  const CANVAS_WORKSPACE_PATH = 'C:/workspaces/canvas-a';

  function resolvers() {
    return createInfiniteCanvasSessionResolvers({
      workspacePath: CANVAS_WORKSPACE_PATH,
    });
  }

  it('accepts an active session of the same workspace (path-normalized)', () => {
    flowChat.state.sessions.set('session-active', {
      workspacePath: 'c:\\workspaces\\canvas-a',
    });
    flowChat.state.activeSessionId = 'session-active';

    expect(resolvers().getActiveSessionId()).toBe('session-active');
  });

  it('rejects an active session that belongs to another workspace', () => {
    flowChat.state.sessions.set('session-active', {
      workspacePath: 'C:/workspaces/other-b',
    });
    flowChat.state.activeSessionId = 'session-active';

    expect(resolvers().getActiveSessionId()).toBeUndefined();
  });

  it('rejects an active session whose workspace cannot be verified (fail-closed)', () => {
    flowChat.state.sessions.set('session-active', {});
    flowChat.state.activeSessionId = 'session-active';

    expect(resolvers().getActiveSessionId()).toBeUndefined();
  });

  it('falls back to the session config workspacePath when the session field is unset', () => {
    flowChat.state.sessions.set('session-active', {
      config: { workspacePath: CANVAS_WORKSPACE_PATH },
    });
    flowChat.state.activeSessionId = 'session-active';

    expect(resolvers().getActiveSessionId()).toBe('session-active');
  });

  it('keeps the pre-review behavior when the canvas workspace path is not provided', () => {
    flowChat.state.sessions.set('session-active', {
      workspacePath: 'C:/workspaces/other-b',
    });
    flowChat.state.activeSessionId = 'session-active';

    const unbound = createInfiniteCanvasSessionResolvers({});
    expect(unbound.getActiveSessionId()).toBe('session-active');
  });

  it('still prefers the source session while it exists', () => {
    flowChat.state.sessions.set('session-src', {
      workspacePath: CANVAS_WORKSPACE_PATH,
    });
    const bound = createInfiniteCanvasSessionResolvers({
      sourceSessionId: 'session-src',
      workspacePath: CANVAS_WORKSPACE_PATH,
    });

    expect(bound.getSourceSessionId()).toBe('session-src');

    flowChat.state.sessions.delete('session-src');
    expect(bound.getSourceSessionId()).toBeUndefined();
  });
});
