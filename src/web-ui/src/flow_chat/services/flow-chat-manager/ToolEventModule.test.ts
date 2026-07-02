import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlowChatStore } from '../../store/FlowChatStore';
import type { DialogTurn, FlowToolItem, ModelRound, Session } from '../../types/flow-chat';
import {
  resetWorkspaceMediaRefreshState,
  useWorkspaceMediaRefreshStore,
  WORKSPACE_MEDIA_REFRESH_EVENT,
} from '@/shared/services/workspace-media/WorkspaceMediaEvents';
import { processToolEvent, processToolParamsPartialInternal } from './ToolEventModule';

function resetStore(): void {
  FlowChatStore.getInstance().setState(() => ({
    sessions: new Map(),
    activeSessionId: null,
  }));
}

function createSessionWithTool(tool: FlowToolItem): Session {
  const round: ModelRound = {
    id: 'round-1',
    index: 0,
    items: [tool],
    isStreaming: true,
    isComplete: false,
    status: 'streaming',
    startTime: 1000,
  };
  const turn: DialogTurn = {
    id: 'turn-1',
    sessionId: 'session-1',
    userMessage: {
      id: 'user-1',
      content: 'Inspect this file',
      timestamp: 900,
    },
    modelRounds: [round],
    status: 'processing',
    startTime: 900,
  };

  return {
    sessionId: 'session-1',
    title: 'Session 1',
    dialogTurns: [turn],
    status: 'active',
    config: { agentType: 'agentic' },
    createdAt: 800,
    lastActiveAt: 1000,
    error: null,
    sessionKind: 'normal',
  };
}

function makeToolContext(overrides: Record<string, unknown> = {}): any {
  return {
    flowChatStore: FlowChatStore.getInstance(),
    eventBatcher: {
      getBufferSize: () => 0,
      flushNow: () => {},
    },
    saveDebouncers: new Map(),
    lastSaveHashes: new Map(),
    lastSaveTimestamps: new Map(),
    turnSavePending: new Set(),
    turnSaveInFlight: new Map(),
    currentWorkspacePath: null,
    ...overrides,
  };
}

function makeAskUserQuestionTool(
  id: string,
  status: FlowToolItem['status'],
  error?: string,
): FlowToolItem {
  return {
    id,
    type: 'tool',
    toolName: 'AskUserQuestion',
    timestamp: 1000,
    status,
    toolCall: {
      id,
      input: {},
    },
    toolResult: error
      ? {
          result: null,
          success: false,
          error,
        }
      : undefined,
  };
}

function installWindowEventTarget(): () => void {
  const previousWindow = (globalThis as any).window;
  const previousCustomEvent = (globalThis as any).CustomEvent;
  const target = new EventTarget();

  class TestCustomEvent<T = unknown> extends Event {
    detail: T;

    constructor(type: string, init?: CustomEventInit<T>) {
      super(type);
      this.detail = init?.detail as T;
    }
  }

  Object.defineProperty(globalThis, 'CustomEvent', {
    configurable: true,
    value: TestCustomEvent,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    },
  });

  return () => {
    if (previousCustomEvent === undefined) {
      delete (globalThis as any).CustomEvent;
    } else {
      Object.defineProperty(globalThis, 'CustomEvent', {
        configurable: true,
        value: previousCustomEvent,
      });
    }
    if (previousWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow,
      });
    }
  };
}

describe('processToolParamsPartialInternal', () => {
  afterEach(() => {
    resetStore();
  });

  it('drops malformed non-string params fragments without replacing existing preview state', () => {
    const existingParams = { file_path: 'src/main.rs' };
    const tool: FlowToolItem = {
      id: 'tool-1',
      type: 'tool',
      toolName: 'Read',
      timestamp: 1001,
      status: 'streaming',
      toolCall: {
        id: 'tool-1',
        input: existingParams,
      },
      isParamsStreaming: true,
      partialParams: existingParams,
      _paramsBuffer: '{"file_path":"src/main.rs"}',
    };

    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([['session-1', createSessionWithTool(tool)]]),
      activeSessionId: 'session-1',
    }));

    expect(() => {
      processToolParamsPartialInternal('session-1', 'turn-1', {
        event_type: 'ParamsPartial',
        tool_id: 'tool-1',
        tool_name: 'Read',
        params: { file_path: 'src/lib.rs' } as any,
      });
    }).not.toThrow();

    const updatedTool = FlowChatStore.getInstance()
      .findToolItem('session-1', 'turn-1', 'tool-1') as FlowToolItem;

    expect(updatedTool._paramsBuffer).toBe('{"file_path":"src/main.rs"}');
    expect(updatedTool.partialParams).toEqual(existingParams);
    expect(updatedTool.toolCall.input).toEqual(existingParams);
  });
});

describe('processToolEvent late Started event behavior', () => {
  afterEach(() => {
    resetStore();
  });

  it('attaches a late Started event back to its original round when roundId is provided', () => {
    const round1: ModelRound = {
      id: 'round-1',
      index: 0,
      items: [
        {
          id: 'text-1',
          type: 'text',
          content: 'First round response',
          timestamp: 1000,
          status: 'completed',
          isStreaming: false,
          isMarkdown: true,
        } as any,
        {
          id: 'steering-1',
          type: 'user-steering',
          timestamp: 1001,
          status: 'completed',
          content: 'background result',
          steeringId: 'steering-1',
          roundIndex: 0,
        } as any,
      ],
      isStreaming: false,
      isComplete: true,
      status: 'completed',
      startTime: 900,
      endTime: 1100,
    };

    const round2: ModelRound = {
      id: 'round-2',
      index: 1,
      items: [],
      isStreaming: true,
      isComplete: false,
      status: 'streaming',
      startTime: 1200,
    };

    const turn: DialogTurn = {
      id: 'turn-1',
      sessionId: 'session-1',
      userMessage: {
        id: 'user-1',
        content: 'Test steering timing',
        timestamp: 800,
      },
      modelRounds: [round1, round2],
      status: 'processing',
      startTime: 800,
    };

    const session: Session = {
      sessionId: 'session-1',
      title: 'Session 1',
      dialogTurns: [turn],
      status: 'active',
      config: { agentType: 'agentic' },
      createdAt: 700,
      lastActiveAt: 1200,
      error: null,
      sessionKind: 'normal',
    };

    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([['session-1', session]]),
      activeSessionId: 'session-1',
    }));

    processToolEvent(
      makeToolContext(),
      'session-1',
      'turn-1',
      'round-1',
      {
        event_type: 'Started',
        tool_id: 'tool-late-1',
        tool_name: 'Read',
        params: { file_path: 'src/main.rs' },
      },
    );

    const state = FlowChatStore.getInstance().getState();
    const updatedTurn = state.sessions.get('session-1')?.dialogTurns[0];
    const updatedRound1 = updatedTurn?.modelRounds[0];
    const updatedRound2 = updatedTurn?.modelRounds[1];

    expect(updatedRound1?.items.some(item => item.id === 'tool-late-1')).toBe(true);
    expect(updatedRound2?.items.some(item => item.id === 'tool-late-1')).toBe(false);
  });

  it('drops a Started event when the referenced round does not exist', () => {
    const turn: DialogTurn = {
      id: 'turn-1',
      sessionId: 'session-1',
      userMessage: {
        id: 'user-1',
        content: 'Test steering timing',
        timestamp: 800,
      },
      modelRounds: [{
        id: 'round-1',
        index: 0,
        items: [],
        isStreaming: true,
        isComplete: false,
        status: 'streaming',
        startTime: 900,
      }],
      status: 'processing',
      startTime: 800,
    };

    const session: Session = {
      sessionId: 'session-1',
      title: 'Session 1',
      dialogTurns: [turn],
      status: 'active',
      config: { agentType: 'agentic' },
      createdAt: 700,
      lastActiveAt: 1200,
      error: null,
      sessionKind: 'normal',
    };

    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([['session-1', session]]),
      activeSessionId: 'session-1',
    }));

    processToolEvent(
      makeToolContext(),
      'session-1',
      'turn-1',
      'round-missing',
      {
        event_type: 'Started',
        tool_id: 'tool-late-1',
        tool_name: 'Read',
        params: { file_path: 'src/main.rs' },
      },
    );

    const updatedTurn = FlowChatStore.getInstance().getState().sessions.get('session-1')?.dialogTurns[0];
    expect(updatedTurn?.modelRounds[0]?.items.some(item => item.id === 'tool-late-1')).toBe(false);
  });
});

describe('processToolEvent AskUserQuestion retry cleanup', () => {
  afterEach(() => {
    resetStore();
  });

  it('removes stale parse failure cards when a retry question is early detected', () => {
    const staleTool = makeAskUserQuestionTool(
      'ask-stale',
      'error',
      'Failed to parse input parameters: missing field `questions`',
    );
    const cancelledTool = makeAskUserQuestionTool(
      'ask-cancelled',
      'cancelled',
      'User cancelled operation',
    );
    const ordinaryFailedTool = makeAskUserQuestionTool(
      'ask-failed',
      'error',
      'User input channel closed',
    );

    const turn: DialogTurn = {
      id: 'turn-1',
      sessionId: 'session-1',
      userMessage: {
        id: 'user-1',
        content: 'Ask me if needed',
        timestamp: 800,
      },
      modelRounds: [
        {
          id: 'round-1',
          index: 0,
          items: [staleTool, cancelledTool, ordinaryFailedTool],
          isStreaming: false,
          isComplete: true,
          status: 'completed',
          startTime: 900,
        },
        {
          id: 'round-2',
          index: 1,
          items: [],
          isStreaming: true,
          isComplete: false,
          status: 'streaming',
          startTime: 1200,
        },
      ],
      status: 'processing',
      startTime: 800,
    };

    const session: Session = {
      sessionId: 'session-1',
      title: 'Session 1',
      dialogTurns: [turn],
      status: 'active',
      config: { agentType: 'agentic' },
      createdAt: 700,
      lastActiveAt: 1200,
      error: null,
      sessionKind: 'normal',
    };

    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([['session-1', session]]),
      activeSessionId: 'session-1',
    }));

    processToolEvent(
      makeToolContext(),
      'session-1',
      'turn-1',
      'round-2',
      {
        event_type: 'EarlyDetected',
        tool_id: 'ask-retry',
        tool_name: 'AskUserQuestion',
      },
    );

    const updatedTurn = FlowChatStore.getInstance().getState().sessions.get('session-1')?.dialogTurns[0];
    const allItemIds = updatedTurn?.modelRounds.flatMap(round => round.items.map(item => item.id)) || [];

    expect(allItemIds).not.toContain('ask-stale');
    expect(allItemIds).toContain('ask-cancelled');
    expect(allItemIds).toContain('ask-failed');
    expect(allItemIds).toContain('ask-retry');
  });
});

describe('processToolEvent workspace media refresh events', () => {
  afterEach(() => {
    resetStore();
    resetWorkspaceMediaRefreshState();
  });

  it('records workspace media refresh state when image generation starts', () => {
    const tool: FlowToolItem = {
      id: 'media-tool-started',
      type: 'tool',
      toolName: 'GenerateImage',
      timestamp: 1000,
      status: 'preparing',
      toolCall: {
        id: 'media-tool-started',
        input: {},
      },
    };
    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([['session-1', createSessionWithTool(tool)]]),
      activeSessionId: 'session-1',
    }));

    processToolEvent(
      makeToolContext({ currentWorkspacePath: 'C:/work' }),
      'session-1',
      'turn-1',
      'round-1',
      {
        event_type: 'Started',
        tool_id: 'media-tool-started',
        tool_name: 'GenerateImage',
        params: {
          prompt: 'make a poster',
          size: '1024x1024',
          n: 2,
        },
      },
    );

    expect(useWorkspaceMediaRefreshStore.getState().lastSignal).toMatchObject({
      lifecycleStatus: 'started',
      workspacePath: 'C:/work',
      toolId: 'media-tool-started',
      toolName: 'GenerateImage',
      kind: 'image',
      prompt: 'make a poster',
    });
  });

  it('does not record workspace media refresh state when a non-media tool starts', () => {
    const tool: FlowToolItem = {
      id: 'read-tool-started',
      type: 'tool',
      toolName: 'Read',
      timestamp: 1000,
      status: 'preparing',
      toolCall: {
        id: 'read-tool-started',
        input: {},
      },
    };
    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([['session-1', createSessionWithTool(tool)]]),
      activeSessionId: 'session-1',
    }));

    processToolEvent(
      makeToolContext({ currentWorkspacePath: 'C:/work' }),
      'session-1',
      'turn-1',
      'round-1',
      {
        event_type: 'Started',
        tool_id: 'read-tool-started',
        tool_name: 'Read',
        params: { file_path: 'README.md' },
      },
    );

    expect(useWorkspaceMediaRefreshStore.getState().lastSignal).toBeUndefined();
  });

  it('dispatches a workspace media refresh when image generation enters polling', () => {
    const restoreWindow = installWindowEventTarget();
    const tool: FlowToolItem = {
      id: 'media-tool-1',
      type: 'tool',
      toolName: 'GenerateImage',
      timestamp: 1000,
      status: 'running',
      toolCall: {
        id: 'media-tool-1',
        input: { prompt: 'make a poster' },
      },
    };
    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([['session-1', createSessionWithTool(tool)]]),
      activeSessionId: 'session-1',
    }));
    const events: CustomEvent[] = [];
    const listener = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(WORKSPACE_MEDIA_REFRESH_EVENT, listener);

    try {
      processToolEvent(
        makeToolContext({ currentWorkspacePath: 'C:/work' }),
        'session-1',
        'turn-1',
        'round-1',
        {
          event_type: 'Completed',
          tool_id: 'media-tool-1',
          tool_name: 'GenerateImage',
          result: {
            status: 'polling',
            batch_id: 'batch-1',
            batch: {
              batch_id: 'batch-1',
              status: 'polling',
            },
          },
          duration_ms: 10,
        },
      );
    } finally {
      window.removeEventListener(WORKSPACE_MEDIA_REFRESH_EVENT, listener);
      restoreWindow();
    }

    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({
      toolName: 'GenerateImage',
      status: 'polling',
      batchId: 'batch-1',
      workspacePath: 'C:/work',
    });
    expect(useWorkspaceMediaRefreshStore.getState().lastSignal).toMatchObject({
      lifecycleStatus: 'polling',
      workspacePath: 'C:/work',
      toolId: 'media-tool-1',
      toolName: 'GenerateImage',
      batchId: 'batch-1',
    });
  });

  it('dispatches a workspace media refresh when image generation completes with assets', () => {
    const restoreWindow = installWindowEventTarget();
    const tool: FlowToolItem = {
      id: 'media-tool-2',
      type: 'tool',
      toolName: 'GenerateImage',
      timestamp: 1000,
      status: 'completed',
      toolCall: {
        id: 'media-tool-2',
        input: { prompt: 'make a poster' },
      },
      toolResult: {
        result: {
          status: 'polling',
          batch_id: 'batch-2',
        },
        success: true,
      },
    };
    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([['session-1', createSessionWithTool(tool)]]),
      activeSessionId: 'session-1',
    }));
    const events: CustomEvent[] = [];
    const listener = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(WORKSPACE_MEDIA_REFRESH_EVENT, listener);

    try {
      processToolEvent(
        makeToolContext(),
        'session-1',
        'turn-1',
        'round-1',
        {
          event_type: 'Completed',
          tool_id: 'media-tool-2',
          tool_name: 'GenerateImage',
          result: {
            status: 'completed',
            batch: {
              batch_id: 'batch-2',
              status: 'completed',
              assets: [{ url: 'https://cdn.example/generated.png' }],
            },
          },
          duration_ms: 10,
        },
      );
    } finally {
      window.removeEventListener(WORKSPACE_MEDIA_REFRESH_EVENT, listener);
      restoreWindow();
    }

    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({
      toolName: 'GenerateImage',
      status: 'completed',
      batchId: 'batch-2',
    });
  });

  it('does not dispatch a workspace media refresh for non-media tool completions', () => {
    const restoreWindow = installWindowEventTarget();
    const tool: FlowToolItem = {
      id: 'read-tool-1',
      type: 'tool',
      toolName: 'Read',
      timestamp: 1000,
      status: 'running',
      toolCall: {
        id: 'read-tool-1',
        input: { file_path: 'src/main.rs' },
      },
    };
    FlowChatStore.getInstance().setState(() => ({
      sessions: new Map([['session-1', createSessionWithTool(tool)]]),
      activeSessionId: 'session-1',
    }));
    const listener = vi.fn();
    window.addEventListener(WORKSPACE_MEDIA_REFRESH_EVENT, listener);

    try {
      processToolEvent(
        makeToolContext(),
        'session-1',
        'turn-1',
        'round-1',
        {
          event_type: 'Completed',
          tool_id: 'read-tool-1',
          tool_name: 'Read',
          result: { content: 'hello' },
          duration_ms: 10,
        },
      );
    } finally {
      window.removeEventListener(WORKSPACE_MEDIA_REFRESH_EVENT, listener);
      restoreWindow();
    }

    expect(listener).not.toHaveBeenCalled();
  });
});
