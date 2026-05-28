import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../types/flow-chat';
import {
  buildCompactChatPresentation,
  buildCompactChatPresentationFromSession,
  emitCompactChatPresentation,
  listenCompactChatCancelTaskRequests,
  listenCompactChatPresentationRequests,
  requestCompactChatCancelTask,
  requestCompactChatPresentation,
  sendCompactChatMessage,
  subscribeCompactChatPresentationSources,
} from './CompactChatPresentationBridge';
import { flowChatStore } from '../store/FlowChatStore';

const tauriEvent = vi.hoisted(() => ({
  emit: vi.fn(),
  emitTo: vi.fn(),
  listen: vi.fn(),
}));

const runtimeMock = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
}));

vi.mock('@tauri-apps/api/event', () => tauriEvent);
vi.mock('@/infrastructure/runtime', () => runtimeMock);

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'session-1',
    title: 'Active session',
    dialogTurns: [],
    status: 'idle',
    config: { agentType: 'agentic' },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    historyState: 'new',
    mode: 'agentic',
    workspacePath: 'D:/workspace/Void',
    sessionKind: 'normal',
    ...overrides,
  };
}

describe('CompactChatPresentationBridge', () => {
  afterEach(() => {
    tauriEvent.emit.mockReset();
    tauriEvent.emitTo.mockReset();
    tauriEvent.listen.mockReset();
    runtimeMock.isTauriRuntime.mockReturnValue(true);
    flowChatStore.setState(() => ({
      sessions: new Map(),
      activeSessionId: null,
    }));
  });

  it('builds a presentation mirror from the current active session', () => {
    const active = createSession();
    const inactive = createSession({ sessionId: 'session-2', title: 'Other' });
    flowChatStore.setState(() => ({
      sessions: new Map([
        [active.sessionId, active],
        [inactive.sessionId, inactive],
      ]),
      activeSessionId: active.sessionId,
    }));

    expect(buildCompactChatPresentation()).toEqual({
      status: 'ready',
      activeSession: {
        sessionId: active.sessionId,
        title: active.title,
        status: active.status,
        dialogTurns: active.dialogTurns,
      },
    });
  });

  it('uses an unavailable presentation instead of creating a hidden session', () => {
    expect(buildCompactChatPresentation()).toEqual({
      status: 'unavailable',
      reason: 'no-active-session',
    });
  });

  it('can build a presentation from an already resolved active session fallback', () => {
    const active = createSession({ sessionId: 'modern-session', title: 'Modern active' });

    expect(buildCompactChatPresentationFromSession(active)).toEqual({
      status: 'ready',
      activeSession: {
        sessionId: active.sessionId,
        title: active.title,
        status: active.status,
        dialogTurns: active.dialogTurns,
      },
    });
  });

  it('keeps the desktop presentation payload bounded to recent turns', () => {
    const active = createSession({
      dialogTurns: Array.from({ length: 20 }, (_, index) => ({
        id: `turn-${index}`,
        sessionId: 'session-1',
        userMessage: {
          id: `message-${index}`,
          content: `message ${index}`,
          timestamp: index,
        },
        modelRounds: [],
        status: 'completed',
        startTime: index,
      })),
    });

    const presentation = buildCompactChatPresentationFromSession(active);

    expect(presentation.status).toBe('ready');
    if (presentation.status !== 'ready') return;
    expect(presentation.activeSession.dialogTurns).toHaveLength(12);
    expect(presentation.activeSession.dialogTurns[0]?.id).toBe('turn-8');
  });

  it('emits active-session presentation updates over the desktop event boundary', async () => {
    const active = createSession();
    flowChatStore.setState(() => ({
      sessions: new Map([[active.sessionId, active]]),
      activeSessionId: active.sessionId,
    }));

    await emitCompactChatPresentation();

    expect(tauriEvent.emit).toHaveBeenCalledWith('compact-chat://presentation-updated', {
      status: 'ready',
      activeSession: {
        sessionId: active.sessionId,
        title: active.title,
        status: active.status,
        dialogTurns: active.dialogTurns,
      },
      sequence: expect.any(Number),
      emittedAt: expect.any(Number),
    });
    expect(tauriEvent.emitTo).not.toHaveBeenCalled();
  });

  it('allows the compact window to request the latest presentation after it mounts', async () => {
    await requestCompactChatPresentation();

    expect(tauriEvent.emit).toHaveBeenCalledWith('compact-chat://request-presentation', {});
    expect(tauriEvent.emitTo).not.toHaveBeenCalled();
  });

  it('sends messages by asking the main window to use the active session path', async () => {
    await sendCompactChatMessage('hello', 'session-1');

    expect(tauriEvent.emit).toHaveBeenCalledWith('compact-chat://send-message', {
      message: 'hello',
      sessionId: 'session-1',
    });
    expect(tauriEvent.emitTo).not.toHaveBeenCalled();
  });

  it('sends cancel requests over the same desktop event boundary', async () => {
    await requestCompactChatCancelTask(' session-1 ');

    expect(tauriEvent.emit).toHaveBeenCalledWith('compact-chat://cancel-task', {
      sessionId: 'session-1',
    });
    expect(tauriEvent.emitTo).not.toHaveBeenCalled();
  });

  it('listens for presentation requests at the main window boundary', async () => {
    const unlisten = vi.fn();
    tauriEvent.listen.mockImplementation((_eventName: string, handler: () => void) => {
      handler();
      return Promise.resolve(unlisten);
    });
    const handler = vi.fn();

    const remove = await listenCompactChatPresentationRequests(handler);

    expect(tauriEvent.listen).toHaveBeenCalledWith('compact-chat://request-presentation', expect.any(Function));
    expect(handler).toHaveBeenCalledTimes(1);
    remove();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('listens for cancel requests at the main window boundary', async () => {
    const unlisten = vi.fn();
    tauriEvent.listen.mockImplementation((_eventName: string, handler: (event: { payload: { sessionId: string } }) => void) => {
      handler({ payload: { sessionId: ' session-1 ' } });
      return Promise.resolve(unlisten);
    });
    const handler = vi.fn();

    const remove = await listenCompactChatCancelTaskRequests(handler);

    expect(tauriEvent.listen).toHaveBeenCalledWith('compact-chat://cancel-task', expect.any(Function));
    expect(handler).toHaveBeenCalledWith({ sessionId: 'session-1' });
    remove();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('subscribes to each presentation source and cleans them up together', () => {
    const legacyUnsubscribe = vi.fn();
    const modernUnsubscribe = vi.fn();
    const legacySubscribe = vi.fn(() => legacyUnsubscribe);
    const modernSubscribe = vi.fn(() => modernUnsubscribe);
    const handler = vi.fn();

    const unsubscribe = subscribeCompactChatPresentationSources(handler, [
      legacySubscribe,
      modernSubscribe,
    ]);

    expect(legacySubscribe).toHaveBeenCalledWith(handler);
    expect(modernSubscribe).toHaveBeenCalledWith(handler);

    unsubscribe();

    expect(legacyUnsubscribe).toHaveBeenCalledTimes(1);
    expect(modernUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
