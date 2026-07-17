import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  __test_only__,
  emitAgentToolRunEventForObservers,
  emitSubagentSessionLinkedEventForObservers,
  formatDialogErrorForNotification,
  handleDialogTurnComplete,
  handleSessionStateChanged,
  insertSteeringItemIfAbsent,
  isAppWindowFocused,
  shouldProcessEvent,
} from './EventHandlerModule';
import { globalEventBus } from '@/infrastructure/event-bus';
import { stateMachineManager } from '../../state-machine';
import { SessionExecutionEvent, SessionExecutionState } from '../../state-machine/types';
import { FlowChatStore } from '../../store/FlowChatStore';
import type { DialogTurn, FlowUserSteeringItem, ModelRound, Session } from '../../types/flow-chat';
import type { FlowChatContext } from './types';

vi.mock('@/infrastructure/i18n/core/I18nService', () => ({
  i18nService: {
    t: (key: string) => ({
      'errors:ai.unknown.title': 'AI request failed',
      'errors:ai.unknown.message': 'The model stopped before returning a usable response. Try again or switch models.',
      'errors:ai.invalidRequest.title': 'Model request invalid',
      'errors:ai.invalidRequest.message': 'The provider rejected the request format, parameters, model name, or payload size. Adjust the request or choose another model.',
      'errors:ai.actions.copyDiagnostics': 'Copy diagnostics',
    }[key] ?? key),
  },
}));

vi.mock('../../../shared/notification-system/services/NotificationService', () => ({
  notificationService: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

describe('isAppWindowFocused', () => {
  it('returns true when no document is available', () => {
    expect(isAppWindowFocused()).toBe(true);
  });
});

describe('emitSubagentSessionLinkedEventForObservers', () => {
  afterEach(() => {
    globalEventBus.removeAllListeners('agent:subagent-session-linked');
  });

  it('emits normalized subagent linked payload for feature-specific observers', () => {
    const observed: unknown[] = [];
    globalEventBus.on('agent:subagent-session-linked', event => {
      observed.push(event);
    });

    const emitted = emitSubagentSessionLinkedEventForObservers({
      sessionId: 'child-session-1',
      parentSessionId: 'parent-session-1',
      parentDialogTurnId: 'turn-1',
      parentToolCallId: 'tool-1',
      agentType: 'video',
      workspacePath: 'C:/work',
    } as any);

    expect(emitted).toBe(true);
    expect(observed).toEqual([{
      childSessionId: 'child-session-1',
      parentSessionId: 'parent-session-1',
      parentDialogTurnId: 'turn-1',
      parentToolCallId: 'tool-1',
      agentType: 'video',
      workspacePath: 'C:/work',
    }]);
  });
});

describe('subagent session identity reconciliation', () => {
  beforeEach(() => {
    resetFlowChatStore();
  });

  afterEach(() => {
    resetFlowChatStore();
  });

  it('prefers the explicit linked-event type over the parent Task input', () => {
    putParentTaskSessionInStore('AssetAI');

    __test_only__.ensureSubagentSession(
      createFlowChatContext(),
      { sessionId: 'parent-session', dialogTurnId: 'parent-turn', toolCallId: 'parent-task' },
      'child-session',
      undefined,
      'VideoAI',
    );

    expect(getSession('child-session')).toMatchObject({
      sessionKind: 'subagent',
      subagentType: 'VideoAI',
      mode: 'VideoAI',
      config: expect.objectContaining({ agentType: 'VideoAI' }),
    });
  });

  it('uses the parent Task input when the linked event omits its type', () => {
    putParentTaskSessionInStore('AssetAI');

    __test_only__.ensureSubagentSession(
      createFlowChatContext(),
      { sessionId: 'parent-session', dialogTurnId: 'parent-turn', toolCallId: 'parent-task' },
      'child-session',
    );

    expect(getSession('child-session')).toMatchObject({
      subagentType: 'AssetAI',
      mode: 'AssetAI',
      config: expect.objectContaining({ agentType: 'AssetAI' }),
    });
  });

  it('backfills an existing agentic child when a later event confirms AssetAI', () => {
    putParentTaskSessionInStore();
    const store = FlowChatStore.getInstance();
    store.addExternalSession('child-session', 'Child', 'agentic');

    __test_only__.ensureSubagentSession(
      createFlowChatContext(),
      { sessionId: 'parent-session', dialogTurnId: 'parent-turn', toolCallId: 'parent-task' },
      'child-session',
      undefined,
      'AssetAI',
    );

    expect(getSession('child-session')).toMatchObject({
      sessionKind: 'subagent',
      parentSessionId: 'parent-session',
      parentToolCallId: 'parent-task',
      subagentType: 'AssetAI',
      mode: 'AssetAI',
      config: expect.objectContaining({ agentType: 'AssetAI' }),
    });
  });

  it('keeps the parent mode fallback when no type is available', () => {
    putParentTaskSessionInStore(undefined, 'Plan');

    __test_only__.ensureSubagentSession(
      createFlowChatContext(),
      { sessionId: 'parent-session', dialogTurnId: 'parent-turn', toolCallId: 'parent-task' },
      'child-session',
    );

    expect(getSession('child-session')).toMatchObject({
      sessionKind: 'subagent',
      parentSessionId: 'parent-session',
      subagentType: undefined,
      mode: 'Plan',
      config: expect.objectContaining({ agentType: 'Plan' }),
    });
  });

  it('falls back to agentic when neither a type nor parent session is available', () => {
    __test_only__.ensureSubagentSession(
      createFlowChatContext(),
      { sessionId: 'missing-parent', dialogTurnId: 'missing-turn', toolCallId: 'missing-task' },
      'child-session',
    );

    expect(getSession('child-session')).toMatchObject({
      sessionKind: 'subagent',
      parentSessionId: 'missing-parent',
      subagentType: undefined,
      mode: 'agentic',
      config: expect.objectContaining({ agentType: 'agentic' }),
    });
  });
});

describe('emitAgentToolRunEventForObservers', () => {
  afterEach(() => {
    globalEventBus.removeAllListeners('agent:tool-run-event');
  });

  it('emits normalized tool lifecycle payload for feature-specific observers', () => {
    const observed: unknown[] = [];
    globalEventBus.on('agent:tool-run-event', event => {
      observed.push(event);
    });

    const emitted = emitAgentToolRunEventForObservers({
      sessionId: 'session-1',
      turnId: 'turn-1',
      roundId: 'round-1',
      toolEvent: {
        event_type: 'Completed',
        tool_id: 'tool-video-episode-01',
        tool_name: 'Task',
        result: {
          shortDrama: {
            artifactId: 'episode-01-video-01',
            outputMediaItemId: 'media-video-01',
          },
        },
        duration_ms: 100,
      },
    });

    expect(emitted).toBe(true);
    expect(observed).toEqual([{
      sessionId: 'session-1',
      turnId: 'turn-1',
      roundId: 'round-1',
      eventType: 'Completed',
      toolId: 'tool-video-episode-01',
      toolName: 'Task',
      params: undefined,
      result: {
        shortDrama: {
          artifactId: 'episode-01-video-01',
          outputMediaItemId: 'media-video-01',
        },
      },
      error: undefined,
      reason: undefined,
    }]);
  });
});

describe('resolveDialogTurnDisplayContent', () => {
  it('prefers original user input for ordinary turns', () => {
    expect(
      __test_only__.resolveDialogTurnDisplayContent(
        '<user_query>\nwrapped runtime content\n</user_query>',
        'Original human message',
        { kind: 'user_dialog' },
      ),
    ).toBe('Original human message');
  });

  it('still prefers original user input when metadata is background_subagent_result', () => {
    expect(
      __test_only__.resolveDialogTurnDisplayContent(
        'Delivered result text',
        'Display content chosen by backend',
        { kind: 'background_subagent_result' },
      ),
    ).toBe('Display content chosen by backend');
  });
});

describe('shouldProcessEvent', () => {
  const mockSessionId = 'test-session';
  const mockTurnId = 'test-turn';

  beforeEach(() => {
    vi.restoreAllMocks();
    resetFlowChatStore();
  });

  afterEach(() => {
    resetFlowChatStore();
    stateMachineManager.clear();
  });

  it('returns false for data event when no state machine exists', () => {
    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'data', 'TextChunk'),
    ).toBe(false);
  });

  it('returns true for state_sync event even when no state machine exists', () => {
    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'state_sync', 'SessionStateChanged'),
    ).toBe(true);
  });

  it('returns true for control event when state is IDLE', () => {
    vi.spyOn(stateMachineManager, 'get').mockReturnValue({
      getCurrentState: () => SessionExecutionState.IDLE,
      getContext: () => ({ currentDialogTurnId: mockTurnId }),
    } as any);

    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'control', 'DialogTurnStarted'),
    ).toBe(true);
  });

  it('returns false for control event when state is PROCESSING', () => {
    vi.spyOn(stateMachineManager, 'get').mockReturnValue({
      getCurrentState: () => SessionExecutionState.PROCESSING,
      getContext: () => ({ currentDialogTurnId: mockTurnId }),
    } as any);

    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'control', 'DialogTurnStarted'),
    ).toBe(false);
  });

  it('returns false for data event when state is not streaming', () => {
    vi.spyOn(stateMachineManager, 'get').mockReturnValue({
      getCurrentState: () => SessionExecutionState.IDLE,
      getContext: () => ({ currentDialogTurnId: mockTurnId }),
    } as any);

    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'data', 'TextChunk'),
    ).toBe(false);
  });

  it('recovers active latest-turn data when the state machine was reset to idle', () => {
    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([[
        mockSessionId,
        {
          sessionId: mockSessionId,
          title: 'Test Session',
          dialogTurns: [{
            id: mockTurnId,
            sessionId: mockSessionId,
            userMessage: {
              id: 'user-1',
              content: 'Continue review',
              timestamp: 1000,
            },
            modelRounds: [],
            status: 'processing',
            startTime: 1000,
          }],
          status: 'idle',
          config: { agentType: 'agentic' },
          createdAt: 1000,
          lastActiveAt: 1000,
          error: null,
          sessionKind: 'normal',
        } as Session,
      ]]),
      activeSessionId: mockSessionId,
    }));
    stateMachineManager.getOrCreate(mockSessionId);

    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'data', 'ToolEvent'),
    ).toBe(true);
    expect(stateMachineManager.getCurrentState(mockSessionId)).toBe(SessionExecutionState.PROCESSING);
    expect(stateMachineManager.get(mockSessionId)?.getContext().currentDialogTurnId).toBe(mockTurnId);
  });

  it('does not recover idle data for an old non-latest turn', () => {
    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([[
        mockSessionId,
        {
          sessionId: mockSessionId,
          title: 'Test Session',
          dialogTurns: [
            {
              id: mockTurnId,
              sessionId: mockSessionId,
              userMessage: {
                id: 'user-1',
                content: 'Old turn',
                timestamp: 1000,
              },
              modelRounds: [],
              status: 'processing',
              startTime: 1000,
            },
            {
              id: 'newer-turn',
              sessionId: mockSessionId,
              userMessage: {
                id: 'user-2',
                content: 'New turn',
                timestamp: 2000,
              },
              modelRounds: [],
              status: 'processing',
              startTime: 2000,
            },
          ],
          status: 'idle',
          config: { agentType: 'agentic' },
          createdAt: 1000,
          lastActiveAt: 2000,
          error: null,
          sessionKind: 'normal',
        } as Session,
      ]]),
      activeSessionId: mockSessionId,
    }));
    stateMachineManager.getOrCreate(mockSessionId);

    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'data', 'ToolEvent'),
    ).toBe(false);
    expect(stateMachineManager.getCurrentState(mockSessionId)).toBe(SessionExecutionState.IDLE);
  });

  it('does not recover idle data for a cancelled latest turn', () => {
    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([[
        mockSessionId,
        {
          sessionId: mockSessionId,
          title: 'Test Session',
          dialogTurns: [{
            id: mockTurnId,
            sessionId: mockSessionId,
            userMessage: {
              id: 'user-1',
              content: 'Cancelled review',
              timestamp: 1000,
            },
            modelRounds: [],
            status: 'cancelled',
            startTime: 1000,
          }],
          status: 'idle',
          config: { agentType: 'agentic' },
          createdAt: 1000,
          lastActiveAt: 1000,
          error: null,
          sessionKind: 'normal',
        } as Session,
      ]]),
      activeSessionId: mockSessionId,
    }));
    stateMachineManager.getOrCreate(mockSessionId);

    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'data', 'ToolEvent'),
    ).toBe(false);
    expect(stateMachineManager.getCurrentState(mockSessionId)).toBe(SessionExecutionState.IDLE);
  });

  it('allows a late media terminal event to update a completed polling tool item', () => {
    const mediaTool: FlowToolItem = {
      id: 'media-tool-1',
      type: 'tool',
      toolName: 'GenerateImage',
      timestamp: 1100,
      status: 'completed',
      toolCall: {
        id: 'media-tool-1',
        input: { prompt: 'test image' },
      },
      toolResult: {
        success: true,
        result: {
          kind: 'image',
          status: 'polling',
          task_ids: ['task_1'],
        },
      },
    };

    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([[
        mockSessionId,
        {
          sessionId: mockSessionId,
          title: 'Test Session',
          dialogTurns: [{
            id: mockTurnId,
            sessionId: mockSessionId,
            userMessage: {
              id: 'user-1',
              content: 'Generate image',
              timestamp: 1000,
            },
            modelRounds: [{
              id: 'round-1',
              index: 0,
              items: [mediaTool],
              isStreaming: false,
              isComplete: true,
              status: 'completed',
              startTime: 1000,
              endTime: 1200,
            }],
            status: 'completed',
            startTime: 1000,
            endTime: 1200,
          }],
          status: 'idle',
          config: { agentType: 'media' },
          createdAt: 1000,
          lastActiveAt: 1200,
          error: null,
          sessionKind: 'normal',
        } as Session,
      ]]),
      activeSessionId: mockSessionId,
    }));

    expect(__test_only__.shouldAllowLateMediaToolEvent(mockSessionId, mockTurnId, {
      event_type: 'Completed',
      tool_id: 'media-tool-1',
      tool_name: 'GenerateImage',
      result: { status: 'completed' },
      duration_ms: 0,
    })).toBe(true);
    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'data', 'ToolEvent', {
        allowIdleCompletedTurn: true,
      }),
    ).toBe(true);

    stateMachineManager.getOrCreate(mockSessionId);
    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'data', 'ToolEvent', {
        allowIdleCompletedTurn: true,
      }),
    ).toBe(true);
    expect(stateMachineManager.getCurrentState(mockSessionId)).toBe(SessionExecutionState.IDLE);
  });

  it('does not allow a late media terminal event for a non-polling completed tool item', () => {
    const mediaTool: FlowToolItem = {
      id: 'media-tool-1',
      type: 'tool',
      toolName: 'GenerateImage',
      timestamp: 1100,
      status: 'completed',
      toolCall: {
        id: 'media-tool-1',
        input: { prompt: 'test image' },
      },
      toolResult: {
        success: true,
        result: {
          kind: 'image',
          status: 'completed',
        },
      },
    };

    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([[
        mockSessionId,
        {
          sessionId: mockSessionId,
          title: 'Test Session',
          dialogTurns: [{
            id: mockTurnId,
            sessionId: mockSessionId,
            userMessage: {
              id: 'user-1',
              content: 'Generate image',
              timestamp: 1000,
            },
            modelRounds: [{
              id: 'round-1',
              index: 0,
              items: [mediaTool],
              isStreaming: false,
              isComplete: true,
              status: 'completed',
              startTime: 1000,
              endTime: 1200,
            }],
            status: 'completed',
            startTime: 1000,
            endTime: 1200,
          }],
          status: 'idle',
          config: { agentType: 'media' },
          createdAt: 1000,
          lastActiveAt: 1200,
          error: null,
          sessionKind: 'normal',
        } as Session,
      ]]),
      activeSessionId: mockSessionId,
    }));

    expect(__test_only__.shouldAllowLateMediaToolEvent(mockSessionId, mockTurnId, {
      event_type: 'Completed',
      tool_id: 'media-tool-1',
      tool_name: 'GenerateImage',
      result: { status: 'completed' },
      duration_ms: 0,
    })).toBe(false);
  });

  it('returns false for data event when turn ID mismatches', () => {
    vi.spyOn(stateMachineManager, 'get').mockReturnValue({
      getCurrentState: () => SessionExecutionState.PROCESSING,
      getContext: () => ({ currentDialogTurnId: 'different-turn' }),
    } as any);

    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'data', 'TextChunk'),
    ).toBe(false);
  });

  it('returns true for data event when all conditions match', () => {
    vi.spyOn(stateMachineManager, 'get').mockReturnValue({
      getCurrentState: () => SessionExecutionState.PROCESSING,
      getContext: () => ({ currentDialogTurnId: mockTurnId }),
    } as any);

    expect(
      shouldProcessEvent(mockSessionId, mockTurnId, 'data', 'TextChunk'),
    ).toBe(true);
  });
});

describe('formatDialogErrorForNotification', () => {
  it('shows friendly copy while preserving raw error details for diagnostics', () => {
    const rawError = 'Provider error: code=invalid_request_error, request_id=req-1, message=bad payload';
    const formatted = formatDialogErrorForNotification(rawError, {
      category: 'invalid_request',
      provider: 'openai',
      providerCode: 'invalid_request_error',
      requestId: 'req-1',
      rawMessage: rawError,
    });

    expect(formatted.type).toBe('error');
    expect(formatted.title).toBe('Model request invalid');
    expect(formatted.message).not.toContain('Provider error');
    expect(formatted.rawError).toBe(rawError);
    expect(formatted.metadata?.aiError?.rawError).toBe(rawError);
    expect(formatted.metadata?.aiError?.diagnostics).toContain('code=invalid_request_error');
    expect(formatted.actions?.map((action) => action.label)).toContain('Copy diagnostics');
  });
});

function resetFlowChatStore(): void {
  FlowChatStore.getInstance().setState(() => ({
    sessions: new Map(),
    activeSessionId: null,
  }));
}

function getSession(sessionId: string): Session | undefined {
  return FlowChatStore.getInstance().getState().sessions.get(sessionId);
}

function putParentTaskSessionInStore(
  taskSubagentType?: string,
  mode = 'agentic',
): void {
  const taskInput = taskSubagentType ? { subagent_type: taskSubagentType } : {};
  const parent = {
    sessionId: 'parent-session',
    title: 'Parent',
    dialogTurns: [{
      id: 'parent-turn',
      sessionId: 'parent-session',
      userMessage: { id: 'parent-user', content: 'Create child', timestamp: 1 },
      modelRounds: [makeRound('parent-round', [{
        id: 'parent-task',
        type: 'tool',
        toolName: 'Task',
        timestamp: 2,
        status: 'running',
        toolCall: { id: 'parent-task', input: taskInput },
      } as any])],
      status: 'processing',
      startTime: 1,
    }],
    status: 'idle',
    config: { agentType: mode },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    mode,
    workspacePath: 'D:/workspace/void',
    sessionKind: 'normal',
  } as Session;

  FlowChatStore.getInstance().setState(() => ({
    sessions: new Map([[parent.sessionId, parent]]),
    activeSessionId: parent.sessionId,
  }));
}

function makeRound(id: string, items: ModelRound['items'] = []): ModelRound {
  return {
    id,
    index: 0,
    items,
    isStreaming: true,
    isComplete: false,
    status: 'streaming',
    startTime: 1000,
  };
}

function createSessionWithTurn(turn: DialogTurn): void {
  const store = FlowChatStore.getInstance();
  store.createSession('session-1', {});
  store.addDialogTurn('session-1', turn);
}

function createFinishingTurn(): DialogTurn {
  return {
    id: 'turn-1',
    sessionId: 'session-1',
    userMessage: {
      id: 'user-1',
      content: 'Initial request',
      timestamp: 900,
    },
    modelRounds: [{
      ...makeRound('round-1'),
      items: [],
    }],
    status: 'finishing',
    startTime: 900,
  };
}

function createFinishingSession(): Session {
  return {
    sessionId: 'session-1',
    title: 'Session 1',
    dialogTurns: [createFinishingTurn()],
    status: 'idle',
    config: { agentType: 'agentic' },
    createdAt: 800,
    lastActiveAt: 1000,
    error: null,
    isTransient: true,
  };
}

function createFlowChatContext(): FlowChatContext {
  return {
    flowChatStore: FlowChatStore.getInstance(),
    processingManager: {
      clearSessionStatus: vi.fn(),
    } as any,
    eventBatcher: {
      getBufferSize: vi.fn(() => 0),
      flushNow: vi.fn(),
      clear: vi.fn(),
    } as any,
    pendingTurnCompletions: new Map(),
    pendingHistoryLoads: new Map(),
    contentBuffers: new Map(),
    activeTextItems: new Map(),
    saveDebouncers: new Map(),
    lastSaveTimestamps: new Map(),
    lastSaveHashes: new Map(),
    turnSaveInFlight: new Map(),
    turnSavePending: new Set(),
    runtimeStatusTimers: new Map(),
    userCancelledSessionIds: new Set(),
    handledTerminalTurnEvents: new Set(),
    currentWorkspacePath: null,
  };
}

async function setFinishingMachine(): Promise<void> {
  await stateMachineManager.transition('session-1', SessionExecutionEvent.START, {
    taskId: 'session-1',
    dialogTurnId: 'turn-1',
  });
  await stateMachineManager.transition('session-1', SessionExecutionEvent.BACKEND_STREAM_COMPLETED);
}

function putFinishingSessionInStore(): void {
  FlowChatStore.getInstance().setState(() => ({
    sessions: new Map([['session-1', createFinishingSession()]]),
    activeSessionId: 'session-1',
  }));
}

describe('insertSteeringItemIfAbsent', () => {
  beforeEach(() => {
    resetFlowChatStore();
  });

  afterEach(() => {
    resetFlowChatStore();
  });

  it('inserts a visible steering item even before the first model round starts', () => {
    createSessionWithTurn({
      id: 'turn-1',
      sessionId: 'session-1',
      userMessage: {
        id: 'user-1',
        content: 'Initial request',
        timestamp: 900,
      },
      modelRounds: [],
      status: 'processing',
      startTime: 900,
    });

    const inserted = insertSteeringItemIfAbsent({
      sessionId: 'session-1',
      turnId: 'turn-1',
      steeringId: 'steer-1',
      content: 'Please adjust this now',
      status: 'pending',
    });

    const turn = FlowChatStore.getInstance()
      .getState()
      .sessions.get('session-1')
      ?.dialogTurns.find(item => item.id === 'turn-1');

    expect(inserted).toBe(true);
    expect(turn?.modelRounds).toHaveLength(1);
    expect(turn?.modelRounds[0]?.items[0]).toMatchObject({
      id: 'steering_steer-1',
      type: 'user-steering',
      content: 'Please adjust this now',
      status: 'pending',
    });
  });

  it('dedupes an existing steering item across all rounds when backend confirms it', () => {
    const pendingSteering: FlowUserSteeringItem = {
      id: 'steering_steer-1',
      type: 'user-steering',
      steeringId: 'steer-1',
      content: 'Original steering',
      roundIndex: 0,
      timestamp: 1001,
      status: 'pending',
    };
    createSessionWithTurn({
      id: 'turn-1',
      sessionId: 'session-1',
      userMessage: {
        id: 'user-1',
        content: 'Initial request',
        timestamp: 900,
      },
      modelRounds: [
        makeRound('round-1', [pendingSteering]),
        makeRound('round-2'),
      ],
      status: 'processing',
      startTime: 900,
    });

    const inserted = insertSteeringItemIfAbsent({
      sessionId: 'session-1',
      turnId: 'turn-1',
      steeringId: 'steer-1',
      content: 'Original steering',
      roundIndex: 1,
      status: 'completed',
    });

    const rounds = FlowChatStore.getInstance()
      .getState()
      .sessions.get('session-1')
      ?.dialogTurns.find(item => item.id === 'turn-1')
      ?.modelRounds ?? [];
    const steeringItems = rounds.flatMap(round =>
      round.items.filter(item => item.type === 'user-steering'),
    );

    expect(inserted).toBe(false);
    expect(steeringItems).toHaveLength(1);
    expect(steeringItems[0]).toMatchObject({
      id: 'steering_steer-1',
      status: 'completed',
      roundIndex: 1,
    });
  });
});

describe('handleSessionStateChanged', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetFlowChatStore();
    stateMachineManager.clear();
  });

  afterEach(() => {
    resetFlowChatStore();
    stateMachineManager.clear();
  });

  it('finalizes pending turn completion when backend reports idle during finishing', async () => {
    putFinishingSessionInStore();
    const context = createFlowChatContext();
    context.pendingTurnCompletions.set('session-1', {
      turnId: 'turn-1',
      lastActivityAt: Date.now(),
      timer: null,
    });
    await setFinishingMachine();

    handleSessionStateChanged(context, { sessionId: 'session-1', newState: 'Idle' });

    const turn = FlowChatStore.getInstance()
      .getState()
      .sessions.get('session-1')
      ?.dialogTurns[0];
    expect(turn?.status).toBe('completed');
    expect(context.pendingTurnCompletions.has('session-1')).toBe(false);
    expect(stateMachineManager.getCurrentState('session-1')).toBe(SessionExecutionState.IDLE);
  });

  it('finalizes a finishing turn even if the pending completion record was lost', async () => {
    putFinishingSessionInStore();
    const context = createFlowChatContext();
    await setFinishingMachine();

    handleSessionStateChanged(context, { sessionId: 'session-1', newState: 'Idle' });

    const turn = FlowChatStore.getInstance()
      .getState()
      .sessions.get('session-1')
      ?.dialogTurns[0];
    expect(turn?.status).toBe('completed');
    expect(stateMachineManager.getCurrentState('session-1')).toBe(SessionExecutionState.IDLE);
  });
});

describe('handleDialogTurnComplete', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetFlowChatStore();
    stateMachineManager.clear();
  });

  afterEach(() => {
    resetFlowChatStore();
    stateMachineManager.clear();
  });

  it('treats unsuccessful completed events as errors instead of normal completion', async () => {
    putFinishingSessionInStore();
    const context = createFlowChatContext();
    await setFinishingMachine();

    handleDialogTurnComplete(context, {
      sessionId: 'session-1',
      turnId: 'turn-1',
      success: false,
      finishReason: 'empty_round',
    }, vi.fn());

    const turn = FlowChatStore.getInstance()
      .getState()
      .sessions.get('session-1')
      ?.dialogTurns[0];

    expect(turn?.status).toBe('error');
    expect(turn?.error).toContain('empty response');
    expect(stateMachineManager.getCurrentState('session-1')).toBe(SessionExecutionState.IDLE);
  });
});
