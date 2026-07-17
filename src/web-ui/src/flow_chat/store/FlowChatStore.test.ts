import { afterEach, describe, expect, it, vi } from 'vitest';
import { flowChatStore } from './FlowChatStore';
import type { FlowChatState, Session } from '../types/flow-chat';

const apiMocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  listSessionsPage: vi.fn(),
  loadSessionTurns: vi.fn(),
  saveSessionTurn: vi.fn(),
  restoreSession: vi.fn(),
  restoreSessionView: vi.fn(),
  restoreSessionWithTurns: vi.fn(),
}));

const configManagerMock = vi.hoisted(() => ({
  getConfig: vi.fn(async (path: string) => {
    if (path === 'ai.models') return [];
    if (path === 'ai.default_models') return {};
    return undefined;
  }),
}));

const stateMachineManagerMock = vi.hoisted(() => ({
  getOrCreate: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/infrastructure/api', () => ({
  sessionAPI: {
    listSessions: apiMocks.listSessions,
    listSessionsPage: apiMocks.listSessionsPage,
    loadSessionTurns: apiMocks.loadSessionTurns,
    saveSessionTurn: apiMocks.saveSessionTurn,
  },
  agentAPI: {
    restoreSession: apiMocks.restoreSession,
    get restoreSessionView() {
      return apiMocks.restoreSessionView;
    },
    restoreSessionWithTurns: apiMocks.restoreSessionWithTurns,
  },
}));

vi.mock('@/infrastructure/config/services/ConfigManager', () => ({
  configManager: configManagerMock,
}));

vi.mock('../state-machine', () => ({
  stateMachineManager: stateMachineManagerMock,
}));

const resetStore = () => {
  const metadataListRequests = (flowChatStore as any).metadataListRequests as
    | Map<string, { cleanupTimer?: ReturnType<typeof setTimeout> }>
    | undefined;
  metadataListRequests?.forEach(request => {
    if (request.cleanupTimer) {
      clearTimeout(request.cleanupTimer);
    }
  });
  metadataListRequests?.clear();
  const metadataPageRequests = (flowChatStore as any).metadataPageRequests as
    | Map<string, { cleanupTimer?: ReturnType<typeof setTimeout> }>
    | undefined;
  metadataPageRequests?.forEach(request => {
    if (request.cleanupTimer) {
      clearTimeout(request.cleanupTimer);
    }
  });
  metadataPageRequests?.clear();
  ((flowChatStore as any).deferredFullHistoryHydrationRequests as Map<string, Promise<void>> | undefined)?.clear();
  ((flowChatStore as any).unsupportedRestoreCommands as Set<string> | undefined)?.clear();
  flowChatStore.setState((): FlowChatState => ({
    sessions: new Map(),
    activeSessionId: null,
  }));
  flowChatStore.registerPersistUnreadCompletionCallback(() => {});
};

const createSession = (overrides: Partial<Session> = {}): Session => ({
  sessionId: 'session-1',
  title: 'Session 1',
  dialogTurns: [],
  status: 'idle',
  config: { agentType: 'agentic' },
  createdAt: 1,
  lastActiveAt: 1,
  error: null,
  isHistorical: false,
  todos: [],
  maxContextTokens: 128128,
  mode: 'agentic',
  workspacePath: 'D:/workspace/void',
  isTransient: false,
  ...overrides,
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('FlowChatStore metadata persistence callbacks', () => {
  afterEach(() => {
    resetStore();
  });

  it('persists unread completion clear only when the session state changes', () => {
    const persist = vi.fn();
    const session = createSession({ hasUnreadCompletion: 'completed' });

    flowChatStore.setState(() => ({
      sessions: new Map([[session.sessionId, session]]),
      activeSessionId: session.sessionId,
    }));
    flowChatStore.registerPersistUnreadCompletionCallback(persist);

    flowChatStore.clearSessionUnreadCompletion(session.sessionId);
    flowChatStore.clearSessionUnreadCompletion(session.sessionId);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(session.sessionId, undefined);
  });

  it('persists attention clear only when the session state changes', () => {
    const persist = vi.fn();
    const session = createSession({ needsUserAttention: 'ask_user' });

    flowChatStore.setState(() => ({
      sessions: new Map([[session.sessionId, session]]),
      activeSessionId: session.sessionId,
    }));
    flowChatStore.registerPersistUnreadCompletionCallback(persist);

    flowChatStore.clearSessionNeedsAttention(session.sessionId);
    flowChatStore.clearSessionNeedsAttention(session.sessionId);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(session.sessionId, undefined);
  });
});

describe('FlowChatStore local usage reports', () => {
  afterEach(() => {
    resetStore();
  });

  it('inserts a local usage report as user-visible content', () => {
    const session = createSession({ lastActiveAt: 1234 });
    flowChatStore.setState(() => ({
      sessions: new Map([[session.sessionId, session]]),
      activeSessionId: session.sessionId,
    }));

    const turn = flowChatStore.addLocalUsageReportTurn({
      sessionId: session.sessionId,
      markdown: '# Session Usage Report',
      reportId: 'usage-1',
      schemaVersion: 1,
      generatedAt: 10,
    });

    const stored = flowChatStore.getState().sessions.get(session.sessionId)?.dialogTurns[0];
    expect(turn).not.toBeNull();
    expect(stored?.kind).toBe('local_command');
    expect(stored?.userMessage.content).toBe('# Session Usage Report');
    expect(stored?.userMessage.metadata).toMatchObject({
      localCommandKind: 'usage_report',
      modelVisible: false,
    });
    expect(flowChatStore.getState().sessions.get(session.sessionId)?.lastActiveAt)
      .toBe(1234);
  });

  it('can update local usage reports without touching session activity', () => {
    const session = createSession({ lastActiveAt: 4321 });
    flowChatStore.setState(() => ({
      sessions: new Map([[session.sessionId, session]]),
      activeSessionId: session.sessionId,
    }));

    const turn = flowChatStore.addLocalUsageReportTurn({
      sessionId: session.sessionId,
      markdown: '# Loading',
      reportId: 'usage-1',
      schemaVersion: 1,
      generatedAt: 10,
      status: 'loading',
    });

    expect(turn).not.toBeNull();
    flowChatStore.updateDialogTurn(
      session.sessionId,
      turn!.id,
      current => ({
        ...current,
        status: 'completed',
        userMessage: {
          ...current.userMessage,
          content: '# Complete',
        },
      }),
      { touchActivity: false },
    );

    const stored = flowChatStore.getState().sessions.get(session.sessionId);
    expect(stored?.dialogTurns[0].userMessage.content).toBe('# Complete');
    expect(stored?.lastActiveAt).toBe(4321);
  });

  it('can append local goal pending turns', () => {
    const session = createSession();
    flowChatStore.setState(() => ({
      sessions: new Map([[session.sessionId, session]]),
      activeSessionId: session.sessionId,
    }));

    const turn = flowChatStore.addLocalGoalPendingTurn({
      sessionId: session.sessionId,
      message: 'Generating session goal...',
      pendingId: 'goal-1',
    });

    const stored = flowChatStore.getState().sessions.get(session.sessionId)?.dialogTurns[0];
    expect(turn).not.toBeNull();
    expect(stored?.kind).toBe('local_command');
    expect(stored?.status).toBe('processing');
    expect(stored?.userMessage.content).toBe('Generating session goal...');
    expect(stored?.userMessage.metadata).toMatchObject({
      localCommandKind: 'goal_pending',
      modelVisible: false,
      goalPendingId: 'goal-1',
    });
  });

  it('can delete local goal pending turns', () => {
    const session = createSession();
    flowChatStore.setState(() => ({
      sessions: new Map([[session.sessionId, session]]),
      activeSessionId: session.sessionId,
    }));

    const turn = flowChatStore.addLocalGoalPendingTurn({
      sessionId: session.sessionId,
      message: 'Generating session goal...',
      pendingId: 'goal-1',
    });

    expect(turn).not.toBeNull();
    flowChatStore.deleteDialogTurn(session.sessionId, turn!.id);

    const stored = flowChatStore.getState().sessions.get(session.sessionId);
    expect(stored?.dialogTurns).toHaveLength(0);
  });

  it('can append and remove local goal verifying turns', () => {
    const session = createSession();
    flowChatStore.setState(() => ({
      sessions: new Map([[session.sessionId, session]]),
      activeSessionId: session.sessionId,
    }));

    const turn = flowChatStore.addLocalGoalVerifyingTurn({
      sessionId: session.sessionId,
      message: 'Checking if the session goal is met...',
      verifyingId: 'verify-1',
    });

    const stored = flowChatStore.getState().sessions.get(session.sessionId)?.dialogTurns[0];
    expect(turn).not.toBeNull();
    expect(stored?.userMessage.metadata).toMatchObject({
      localCommandKind: 'goal_verifying',
      goalVerifyingId: 'verify-1',
    });

    flowChatStore.removeLocalGoalVerifyingTurn(session.sessionId);
    expect(flowChatStore.getState().sessions.get(session.sessionId)?.dialogTurns).toHaveLength(0);
  });

  it('appends repeated usage reports as separate snapshots', () => {
    const session = createSession();
    flowChatStore.setState(() => ({
      sessions: new Map([[session.sessionId, session]]),
      activeSessionId: session.sessionId,
    }));

    flowChatStore.addLocalUsageReportTurn({
      sessionId: session.sessionId,
      markdown: '# Usage 1',
      reportId: 'usage-1',
      schemaVersion: 1,
      generatedAt: 10,
    });
    flowChatStore.addLocalUsageReportTurn({
      sessionId: session.sessionId,
      markdown: '# Usage 2',
      reportId: 'usage-2',
      schemaVersion: 1,
      generatedAt: 20,
    });

    const turns = flowChatStore.getState().sessions.get(session.sessionId)?.dialogTurns || [];
    expect(turns).toHaveLength(2);
    expect(turns.map(turn => turn.id)).toEqual([
      'local-usage-usage-1',
      'local-usage-usage-2',
    ]);
  });
});

describe('FlowChatStore ACP context usage', () => {
  afterEach(() => {
    resetStore();
  });

  it('stores ACP context usage separately from token usage reports', () => {
    const session = createSession({
      config: { agentType: 'acp:codex' },
    });
    flowChatStore.setState(() => ({
      sessions: new Map([[session.sessionId, session]]),
      activeSessionId: session.sessionId,
    }));

    flowChatStore.updateAcpContextUsage(session.sessionId, {
      used: 42_000,
      size: 128_000,
      cost: { amount: 0.12, currency: 'USD' },
    });

    const stored = flowChatStore.getState().sessions.get(session.sessionId);
    expect(stored?.currentAcpContextUsage).toMatchObject({
      used: 42_000,
      size: 128_000,
      cost: { amount: 0.12, currency: 'USD' },
    });
    expect(stored?.currentTokenUsage).toBeUndefined();
  });
});

describe('FlowChatStore subagent identity', () => {
  afterEach(() => {
    resetStore();
  });

  it('keeps a new external VideoAI session mode and config in sync', () => {
    flowChatStore.addExternalSession(
      'video-session',
      'VideoAI',
      '  VideoAI  ',
      'D:/workspace/void',
      {
        parentSessionId: 'short-drama-parent',
        sessionKind: 'subagent',
        parentToolCallId: 'video-task',
        subagentType: 'VideoAI',
      },
    );

    expect(flowChatStore.getState().sessions.get('video-session')).toMatchObject({
      sessionKind: 'subagent',
      parentSessionId: 'short-drama-parent',
      parentToolCallId: 'video-task',
      subagentType: 'VideoAI',
      mode: 'VideoAI',
      config: expect.objectContaining({ agentType: 'VideoAI' }),
    });
  });

  it.each(['ScriptAI', 'AssetAI', 'SplitAI', 'VideoAI', 'EditorAI'])(
    'atomically backfills an existing agentic session as %s',
    subagentType => {
      const session = createSession({
        sessionId: `${subagentType}-session`,
        mode: 'agentic',
        config: { agentType: 'agentic', modelName: 'auto' },
        sessionKind: 'normal',
      });
      flowChatStore.setState(() => ({
        sessions: new Map([[session.sessionId, session]]),
        activeSessionId: null,
      }));

      flowChatStore.syncSubagentSessionIdentity(session.sessionId, {
        parentSessionId: 'short-drama-parent',
        parentToolCallId: `${subagentType}-task`,
        subagentType,
      });

      expect(flowChatStore.getState().sessions.get(session.sessionId)).toMatchObject({
        sessionKind: 'subagent',
        parentSessionId: 'short-drama-parent',
        parentToolCallId: `${subagentType}-task`,
        subagentType,
        mode: subagentType,
        config: expect.objectContaining({
          agentType: subagentType,
          modelName: 'auto',
        }),
      });
    },
  );
});

describe('FlowChatStore historical session hydration state', () => {
  afterEach(() => {
    resetStore();
    if (typeof apiMocks.restoreSessionView !== 'function') {
      (apiMocks as any).restoreSessionView = vi.fn();
    }
    vi.clearAllMocks();
  });

  it('loads persisted metadata as metadata-only historical sessions', async () => {
    apiMocks.listSessions.mockResolvedValueOnce([
      {
        sessionId: 'history-1',
        title: 'Saved session',
        agentType: 'agentic',
        modelName: 'auto',
        createdAt: 10,
        lastActiveAt: 20,
      },
    ]);

    await flowChatStore.initializeFromDisk('D:/workspace/void');

    const session = flowChatStore.getState().sessions.get('history-1');
    expect(session).toMatchObject({
      sessionId: 'history-1',
      isHistorical: true,
      historyState: 'metadata-only',
      dialogTurns: [],
    });
  });

  it('can add an external subagent session as metadata-only history for later hydration', () => {
    flowChatStore.addExternalSession(
      'script-subagent',
      'ScriptAI',
      'ScriptAI',
      'D:/workspace/void',
      {
        parentSessionId: 'media-parent',
        sessionKind: 'subagent',
        subagentType: 'ScriptAI',
        isHistorical: true,
        historyState: 'metadata-only',
        createdAt: 10,
        lastActiveAt: 20,
      },
    );

    const session = flowChatStore.getState().sessions.get('script-subagent');
    expect(session).toMatchObject({
      sessionId: 'script-subagent',
      parentSessionId: 'media-parent',
      sessionKind: 'subagent',
      subagentType: 'ScriptAI',
      workspacePath: 'D:/workspace/void',
      isHistorical: true,
      historyState: 'metadata-only',
      createdAt: 10,
      lastActiveAt: 20,
    });
  });

  it('preserves Media as a valid persisted agent type', async () => {
    apiMocks.listSessions.mockResolvedValueOnce([
      {
        sessionId: 'media-history-1',
        title: 'New Media Session 1',
        agentType: 'Media',
        modelName: 'auto',
        createdAt: 10,
        lastActiveAt: 20,
      },
    ]);

    await flowChatStore.initializeFromDisk('D:/workspace/Void');

    const session = flowChatStore.getState().sessions.get('media-history-1');
    expect(session).toMatchObject({
      sessionId: 'media-history-1',
      mode: 'Media',
      config: expect.objectContaining({ agentType: 'Media' }),
      historyState: 'metadata-only',
    });
  });

  it.each(['ScriptAI', 'AssetAI', 'SplitAI', 'VideoAI', 'EditorAI'])(
    'preserves trusted persisted %s subagent metadata on full-list hydration',
    async agentType => {
      apiMocks.listSessions.mockResolvedValueOnce([
        {
          sessionId: `${agentType}-history`,
          title: `${agentType} session`,
          agentType,
          modelName: 'auto',
          createdAt: 10,
          lastActiveAt: 20,
          relationship: {
            kind: 'subagent',
            parentSessionId: 'short-drama-parent',
            subagentType: agentType,
          },
        },
      ]);

      await flowChatStore.initializeFromDisk('D:/workspace/void');

      expect(flowChatStore.getState().sessions.get(`${agentType}-history`)).toMatchObject({
        sessionKind: 'subagent',
        parentSessionId: 'short-drama-parent',
        subagentType: agentType,
        mode: agentType,
        config: expect.objectContaining({ agentType }),
      });
    },
  );

  it('preserves a trusted persisted short-drama subagent type on paged hydration', async () => {
    apiMocks.listSessionsPage.mockResolvedValueOnce({
      sessions: [
        {
          sessionId: 'paged-asset-history',
          title: 'AssetAI session',
          agentType: 'AssetAI',
          modelName: 'auto',
          createdAt: 10,
          lastActiveAt: 20,
          relationship: {
            kind: 'subagent',
            parentSessionId: 'short-drama-parent',
            subagentType: 'AssetAI',
          },
        },
      ],
      totalTopLevelCount: 1,
      loadedTopLevelCount: 1,
      hasMore: false,
    });

    await flowChatStore.loadSessionMetadataPage('D:/workspace/void', 5);

    expect(flowChatStore.getState().sessions.get('paged-asset-history')).toMatchObject({
      sessionKind: 'subagent',
      subagentType: 'AssetAI',
      mode: 'AssetAI',
      config: expect.objectContaining({ agentType: 'AssetAI' }),
    });
  });

  it('still rejects an unknown persisted root agent type', async () => {
    apiMocks.listSessions.mockResolvedValueOnce([
      {
        sessionId: 'unknown-root-history',
        title: 'Unknown root',
        agentType: 'UnknownAI',
        modelName: 'auto',
        createdAt: 10,
        lastActiveAt: 20,
      },
    ]);

    await flowChatStore.initializeFromDisk('D:/workspace/void');

    expect(flowChatStore.getState().sessions.get('unknown-root-history')).toMatchObject({
      sessionKind: 'normal',
      mode: 'agentic',
      config: expect.objectContaining({ agentType: 'agentic' }),
    });
  });

  it('loads model config once while processing multiple persisted sessions', async () => {
    configManagerMock.getConfig.mockImplementation(async (path: string) => {
      if (path === 'ai.models') return [{ id: 'primary-model', context_window: 256000 }];
      if (path === 'ai.default_models') return { primary: 'primary-model' };
      return undefined;
    });
    apiMocks.listSessions.mockResolvedValueOnce([
      {
        sessionId: 'history-1',
        title: 'Saved session 1',
        agentType: 'agentic',
        createdAt: 10,
        lastActiveAt: 20,
      },
      {
        sessionId: 'history-2',
        title: 'Saved session 2',
        agentType: 'agentic',
        createdAt: 11,
        lastActiveAt: 21,
      },
    ]);

    await flowChatStore.initializeFromDisk('D:/workspace/void');

    const configPaths = configManagerMock.getConfig.mock.calls.map(([path]) => path);
    expect(configPaths.filter(path => path === 'ai.models')).toHaveLength(1);
    expect(configPaths.filter(path => path === 'ai.default_models')).toHaveLength(1);
    expect(flowChatStore.getState().sessions.get('history-1')?.maxContextTokens).toBe(256000);
    expect(flowChatStore.getState().sessions.get('history-2')?.maxContextTokens).toBe(256000);
  });

  it('skips one bad metadata entry without dropping the rest of the session list', async () => {
    apiMocks.listSessions.mockResolvedValueOnce([
      {
        sessionId: 'bad-1',
        title: 'Bad session',
        agentType: 'agentic',
        createdAt: 10,
        lastActiveAt: 20,
      },
      {
        sessionId: 'good-1',
        title: 'Good session',
        agentType: 'agentic',
        createdAt: 11,
        lastActiveAt: 21,
      },
    ]);
    stateMachineManagerMock.getOrCreate.mockImplementation((sessionId: string) => {
      if (sessionId === 'bad-1') {
        throw new Error('bad metadata');
      }
      return {};
    });

    await flowChatStore.initializeFromDisk('D:/workspace/void');

    expect(flowChatStore.getState().sessions.has('bad-1')).toBe(false);
    expect(flowChatStore.getState().sessions.get('good-1')).toMatchObject({
      sessionId: 'good-1',
      historyState: 'metadata-only',
    });
  });

  it('reuses an in-flight metadata list for the same workspace and remote identity', async () => {
    const sessions = createDeferred<any[]>();
    apiMocks.listSessions.mockReturnValueOnce(sessions.promise);

    const firstLoad = flowChatStore.initializeFromDisk(
      'D:/workspace/void',
      undefined,
      undefined,
      'first-source'
    );
    const secondLoad = flowChatStore.initializeFromDisk(
      'D:/workspace/void',
      undefined,
      undefined,
      'second-source'
    );

    await vi.waitFor(() => {
      expect(apiMocks.listSessions).toHaveBeenCalledTimes(1);
    });

    sessions.resolve([
      {
        sessionId: 'history-1',
        title: 'Saved session',
        agentType: 'agentic',
        createdAt: 10,
        lastActiveAt: 20,
      },
    ]);

    await Promise.all([firstLoad, secondLoad]);

    expect(apiMocks.listSessions).toHaveBeenCalledTimes(1);
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      sessionId: 'history-1',
      historyState: 'metadata-only',
    });
  });

  it('reuses a recently completed metadata list for the same workspace', async () => {
    apiMocks.listSessions.mockResolvedValueOnce([
      {
        sessionId: 'history-1',
        title: 'Saved session',
        agentType: 'agentic',
        createdAt: 10,
        lastActiveAt: 20,
      },
    ]);

    await flowChatStore.initializeFromDisk('D:/workspace/void', undefined, undefined, 'first-source');
    await flowChatStore.initializeFromDisk('D:/workspace/void', undefined, undefined, 'second-source');

    expect(apiMocks.listSessions).toHaveBeenCalledTimes(1);
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      sessionId: 'history-1',
      historyState: 'metadata-only',
    });
  });

  it('loads a paged metadata slice without requesting the full session list', async () => {
    apiMocks.listSessionsPage.mockResolvedValueOnce({
      sessions: [
        {
          sessionId: 'history-1',
          title: 'Saved session',
          agentType: 'agentic',
          modelName: 'auto',
          createdAt: 10,
          lastActiveAt: 20,
        },
      ],
      totalTopLevelCount: 12,
      loadedTopLevelCount: 5,
      nextCursor: '5',
      hasMore: true,
    });

    const page = await flowChatStore.loadSessionMetadataPage(
      'D:/workspace/void',
      5,
      undefined,
      undefined,
      undefined,
      'nav_initial'
    );

    expect(apiMocks.listSessions).not.toHaveBeenCalled();
    expect(apiMocks.listSessionsPage).toHaveBeenCalledWith({
      workspacePath: 'D:/workspace/void',
      limit: 5,
      cursor: undefined,
      remoteConnectionId: undefined,
      remoteSshHost: undefined,
    });
    expect(page).toMatchObject({
      totalTopLevelCount: 12,
      nextCursor: '5',
      hasMore: true,
    });
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      sessionId: 'history-1',
      historyState: 'metadata-only',
    });
  });

  it('marks historical sessions hydrating while turns are loading and ready after completion', async () => {
    const turns = createDeferred<any[]>();
    apiMocks.restoreSessionView.mockImplementationOnce(async () => ({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 0,
        createdAt: 1,
      },
      turns: await turns.promise,
      contextRestoreState: 'pending',
    }));
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    const load = flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void');
    await flushAsyncWork();

    expect(flowChatStore.getState().sessions.get('history-1')?.historyState).toBe('hydrating');

    turns.resolve([]);
    await load;

    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: false,
      historyState: 'ready',
      dialogTurns: [],
    });
  });

  it('marks historical sessions failed when hydrate fails', async () => {
    apiMocks.restoreSessionView.mockRejectedValueOnce(new Error('restore failed'));
    apiMocks.loadSessionTurns.mockRejectedValueOnce(new Error('turn load failed'));
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    await expect(
      flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void')
    ).rejects.toThrow('turn load failed');

    expect(apiMocks.restoreSessionWithTurns).not.toHaveBeenCalled();
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: true,
      historyState: 'failed',
    });
  });

  it('does not change the active session when an older hydrate completes', async () => {
    apiMocks.restoreSessionView.mockResolvedValueOnce({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 0,
        createdAt: 1,
      },
      turns: [],
      contextRestoreState: 'pending',
    });
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
        ['history-2', createSession({
          sessionId: 'history-2',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-2',
    }));

    await flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void');

    expect(flowChatStore.getState().activeSessionId).toBe('history-2');
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: false,
      historyState: 'ready',
    });
  });

  it('keeps partial view restore as a ready historical session with explicit counts', async () => {
    const fullRestore = createDeferred<any>();
    const restoredTurn = {
      turnId: 'turn-1',
      turnIndex: 0,
      sessionId: 'history-1',
      timestamp: 1,
      userMessage: { id: 'user-1', content: 'hello', timestamp: 1 },
      modelRounds: [],
      startTime: 1,
      status: 'completed',
    };
    apiMocks.restoreSessionView.mockResolvedValueOnce({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 50,
        createdAt: 1,
      },
      turns: [restoredTurn],
      contextRestoreState: 'pending',
      isPartial: true,
      loadedTurnCount: 1,
      totalTurnCount: 50,
    });
    apiMocks.restoreSessionWithTurns.mockReturnValueOnce(fullRestore.promise);
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    await flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void');

    const session = flowChatStore.getState().sessions.get('history-1');
    expect(session).toMatchObject({
      isHistorical: true,
      historyState: 'ready',
      contextRestoreState: 'pending',
      isPartial: true,
      loadedTurnCount: 1,
      totalTurnCount: 50,
    });
    expect(session.dialogTurns).toHaveLength(1);

    const deferredRequests = (flowChatStore as any).deferredFullHistoryHydrationRequests as Map<string, Promise<void>>;
    expect(deferredRequests).toHaveLength(1);
    fullRestore.resolve({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 50,
        createdAt: 1,
      },
      turns: [restoredTurn],
    });
    await Promise.all([...deferredRequests.values()]);
  });

  it('schedules and applies a full-history follow-up after a partial view restore', async () => {
    const partialTurn = {
      turnId: 'turn-1',
      turnIndex: 0,
      sessionId: 'history-1',
      timestamp: 1,
      userMessage: { id: 'user-1', content: 'partial', timestamp: 1 },
      modelRounds: [],
      startTime: 1,
      status: 'completed',
    };
    const fullTurn = {
      turnId: 'turn-2',
      turnIndex: 1,
      sessionId: 'history-1',
      timestamp: 2,
      userMessage: { id: 'user-2', content: 'full', timestamp: 2 },
      modelRounds: [],
      startTime: 2,
      status: 'completed',
    };
    apiMocks.restoreSessionView.mockResolvedValueOnce({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 50,
        createdAt: 1,
      },
      turns: [partialTurn],
      contextRestoreState: 'pending',
      isPartial: true,
      loadedTurnCount: 1,
      totalTurnCount: 50,
    });
    apiMocks.restoreSessionWithTurns.mockResolvedValueOnce({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 50,
        createdAt: 1,
      },
      turns: [fullTurn],
    });
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    await flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void');
    const deferredRequests = (flowChatStore as any).deferredFullHistoryHydrationRequests as Map<string, Promise<void>>;
    expect(deferredRequests).toHaveLength(1);
    await Promise.all([...deferredRequests.values()]);

    expect(apiMocks.restoreSessionWithTurns).toHaveBeenCalledTimes(1);
    const session = flowChatStore.getState().sessions.get('history-1');
    expect(session).toMatchObject({
      isHistorical: false,
      historyState: 'ready',
      isPartial: false,
      loadedTurnCount: undefined,
      totalTurnCount: undefined,
    });
    expect(session?.dialogTurns).toHaveLength(1);
    expect(session?.dialogTurns[0]?.id).toBe('turn-2');
  });

  it('keeps a partial session unchanged when deferred full-history completes after active session changes', async () => {
    const fullRestore = createDeferred<any>();
    const partialTurn = {
      turnId: 'turn-1',
      turnIndex: 0,
      sessionId: 'history-1',
      timestamp: 1,
      userMessage: { id: 'user-1', content: 'partial', timestamp: 1 },
      modelRounds: [],
      startTime: 1,
      status: 'completed',
    };
    const fullTurn = {
      turnId: 'turn-2',
      turnIndex: 1,
      sessionId: 'history-1',
      timestamp: 2,
      userMessage: { id: 'user-2', content: 'full', timestamp: 2 },
      modelRounds: [],
      startTime: 2,
      status: 'completed',
    };
    apiMocks.restoreSessionView.mockResolvedValueOnce({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 50,
        createdAt: 1,
      },
      turns: [partialTurn],
      contextRestoreState: 'pending',
      isPartial: true,
      loadedTurnCount: 1,
      totalTurnCount: 50,
    });
    apiMocks.restoreSessionWithTurns.mockReturnValueOnce(fullRestore.promise);
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
        ['history-2', createSession({
          sessionId: 'history-2',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    await flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void');
    const deferredRequests = (flowChatStore as any).deferredFullHistoryHydrationRequests as Map<string, Promise<void>>;
    expect(deferredRequests).toHaveLength(1);
    const [requestPromise] = [...deferredRequests.values()];

    flowChatStore.setState(prev => ({
      ...prev,
      activeSessionId: 'history-2',
    }));
    fullRestore.resolve({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 50,
        createdAt: 1,
      },
      turns: [fullTurn],
    });
    await requestPromise;

    expect(apiMocks.restoreSessionWithTurns).toHaveBeenCalledTimes(1);
    expect(flowChatStore.getState().activeSessionId).toBe('history-2');
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: false,
      historyState: 'ready',
      isPartial: false,
      loadedTurnCount: undefined,
      totalTurnCount: undefined,
    });
    expect(flowChatStore.getState().sessions.get('history-1')?.dialogTurns[0]?.id).toBe('turn-2');
    expect(flowChatStore.getState().sessions.get('history-2')).toMatchObject({
      historyState: 'metadata-only',
      dialogTurns: [],
    });
  });

  it('applies deferred full-history projection after the active session changes', () => {
    const partialTurn = {
      turnId: 'turn-1',
      sessionId: 'history-1',
      userMessage: { id: 'user-1', content: 'partial' },
      modelRounds: [],
      status: 'completed',
    };
    const fullTurn = {
      turnId: 'turn-2',
      turnIndex: 1,
      sessionId: 'history-1',
      timestamp: 2,
      userMessage: { id: 'user-2', content: 'full', timestamp: 2 },
      modelRounds: [],
      startTime: 2,
      status: 'completed',
    };
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', {
          ...createSession({
            sessionId: 'history-1',
            isHistorical: true,
            historyState: 'ready',
            dialogTurns: [partialTurn as any],
          }),
          isPartial: true,
          loadedTurnCount: 1,
          totalTurnCount: 2,
        } as Session],
        ['history-2', createSession({
          sessionId: 'history-2',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-2',
    }));

    const didApply = flowChatStore.applyDeferredSessionHistoryProjection(
      'history-1',
      { turns: [fullTurn] }
    );

    expect(didApply).toBe(true);
    expect(flowChatStore.getState().activeSessionId).toBe('history-2');
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: false,
      historyState: 'ready',
      isPartial: false,
      loadedTurnCount: undefined,
      totalTurnCount: undefined,
      dialogTurns: expect.arrayContaining([
        expect.objectContaining({ id: 'turn-2' }),
      ]),
    });
    expect(flowChatStore.getState().sessions.get('history-2')).toMatchObject({
      historyState: 'metadata-only',
      dialogTurns: [],
    });
  });

  it('does not restore ACP historical sessions through the normal backend path', async () => {
    apiMocks.loadSessionTurns.mockResolvedValueOnce([]);
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['acp-1', createSession({
          sessionId: 'acp-1',
          isHistorical: true,
          historyState: 'metadata-only',
          mode: 'acp:test',
          config: { agentType: 'acp:test' },
        })],
      ]),
      activeSessionId: 'acp-1',
    }));

    await flowChatStore.loadSessionHistory('acp-1', 'D:/workspace/void');

    expect(apiMocks.restoreSession).not.toHaveBeenCalled();
    expect(apiMocks.restoreSessionView).not.toHaveBeenCalled();
    expect(apiMocks.restoreSessionWithTurns).not.toHaveBeenCalled();
  });

  it('uses view-restored turns without reading the turn files a second time', async () => {
    const visibleOutput = 'complete visible output '.repeat(64);
    const restoredTurn = {
      turnId: 'turn-1',
      turnIndex: 0,
      sessionId: 'history-1',
      timestamp: 1,
      userMessage: { id: 'user-1', content: 'hello', timestamp: 1 },
      modelRounds: [
        {
          id: 'round-1',
          turnId: 'turn-1',
          roundIndex: 0,
          timestamp: 1,
          textItems: [],
          toolItems: [
            {
              id: 'tool-1',
              toolName: 'Bash',
              toolCall: { id: 'call-1', input: { command: 'printf output' } },
              toolResult: {
                result: {
                  stdout: visibleOutput,
                  nested: { stderr: 'also visible' },
                },
                success: true,
                durationMs: 1,
              },
              startTime: 1,
              endTime: 2,
              durationMs: 1,
              status: 'completed',
            },
          ],
          thinkingItems: [],
          startTime: 1,
          endTime: 2,
          durationMs: 1,
          status: 'completed',
        },
      ],
      startTime: 1,
      status: 'completed',
    };
    apiMocks.restoreSessionView.mockResolvedValueOnce({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 1,
        createdAt: 1,
      },
      turns: [restoredTurn],
      contextRestoreState: 'pending',
    });
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    await flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void');

    expect(apiMocks.restoreSessionView).toHaveBeenCalledTimes(1);
    expect(apiMocks.restoreSessionWithTurns).not.toHaveBeenCalled();
    expect(apiMocks.loadSessionTurns).not.toHaveBeenCalled();
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: false,
      historyState: 'ready',
    });
    const toolItem = flowChatStore
      .getState()
      .sessions.get('history-1')
      ?.dialogTurns[0]
      ?.modelRounds[0]
      ?.items.find(item => item.type === 'tool') as any;
    expect(toolItem?.toolResult?.result?.stdout).toBe(visibleOutput);
    expect(toolItem?.toolResult?.result?.nested?.stderr).toBe('also visible');
    expect(toolItem?.toolResult?.resultForAssistant).toBeUndefined();
  });

  it('falls back to restoreSessionWithTurns when view restore is unavailable', async () => {
    (apiMocks as any).restoreSessionView = undefined;
    const restoredTurn = {
      turnId: 'turn-1',
      turnIndex: 0,
      sessionId: 'history-1',
      timestamp: 1,
      userMessage: { id: 'user-1', content: 'hello', timestamp: 1 },
      modelRounds: [],
      startTime: 1,
      status: 'completed',
    };
    apiMocks.restoreSessionWithTurns.mockResolvedValueOnce({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 1,
        createdAt: 1,
      },
      turns: [restoredTurn],
    });
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    await flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void');

    expect(apiMocks.restoreSessionWithTurns).toHaveBeenCalledTimes(1);
    expect(apiMocks.loadSessionTurns).not.toHaveBeenCalled();
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: false,
      historyState: 'ready',
      contextRestoreState: 'ready',
    });
  });

  it('falls back to restoreSessionWithTurns when the view restore command is unavailable on the backend', async () => {
    const restoredTurn = {
      turnId: 'turn-1',
      turnIndex: 0,
      sessionId: 'history-1',
      timestamp: 1,
      userMessage: { id: 'user-1', content: 'hello', timestamp: 1 },
      modelRounds: [],
      startTime: 1,
      status: 'completed',
    };
    apiMocks.restoreSessionView.mockRejectedValueOnce(
      new Error('unknown command restore_session_view')
    );
    apiMocks.restoreSessionWithTurns.mockResolvedValueOnce({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 1,
        createdAt: 1,
      },
      turns: [restoredTurn],
    });
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    await flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void');

    expect(apiMocks.restoreSessionView).toHaveBeenCalledTimes(1);
    expect(apiMocks.restoreSessionWithTurns).toHaveBeenCalledTimes(1);
    expect(apiMocks.loadSessionTurns).not.toHaveBeenCalled();
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: false,
      historyState: 'ready',
      contextRestoreState: 'ready',
    });
  });

  it('applies deferred full-history hydration after the active session changes', () => {
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          workspacePath: 'D:/workspace/void',
          isHistorical: true,
          isPartial: true,
          historyState: 'metadata-only',
        })],
        ['history-2', createSession({
          sessionId: 'history-2',
          workspacePath: 'D:/workspace/void',
        })],
      ]),
      activeSessionId: 'history-2',
    }));

    const didApply = flowChatStore.applyDeferredSessionHistoryProjection('history-1', {
      workspacePath: 'D:/workspace/void',
      turns: [{
        turnId: 'turn-1',
        turnIndex: 0,
        sessionId: 'history-1',
        timestamp: 1,
        userMessage: { id: 'user-1', content: 'hello', timestamp: 1 },
        modelRounds: [],
        startTime: 1,
        status: 'completed',
      }],
    });

    expect(didApply).toBe(true);
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: false,
      isPartial: false,
      historyState: 'ready',
      dialogTurns: expect.arrayContaining([
        expect.objectContaining({ id: 'turn-1' }),
      ]),
    });
    expect(flowChatStore.getState().activeSessionId).toBe('history-2');
  });

  it('does not apply deferred full-history hydration across remote identities', () => {
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          workspacePath: '/remote/workspace',
          remoteConnectionId: 'remote-1',
          remoteSshHost: 'current.example',
          isHistorical: true,
          isPartial: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    const didApply = flowChatStore.applyDeferredSessionHistoryProjection('history-1', {
      workspacePath: '/remote/workspace',
      remoteConnectionId: 'remote-1',
      remoteSshHost: 'old.example',
      turns: [{
        turnId: 'turn-1',
        turnIndex: 0,
        sessionId: 'history-1',
        timestamp: 1,
        userMessage: { id: 'user-1', content: 'hello', timestamp: 1 },
        modelRounds: [],
        startTime: 1,
        status: 'completed',
      }],
    });

    expect(didApply).toBe(false);
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: true,
      isPartial: true,
      historyState: 'metadata-only',
      dialogTurns: [],
    });
  });

  it('does not retry an unsupported view restore command for later sessions in the same runtime', async () => {
    const restoredTurn = (sessionId: string) => ({
      turnId: `${sessionId}-turn-1`,
      turnIndex: 0,
      sessionId,
      timestamp: 1,
      userMessage: { id: `${sessionId}-user-1`, content: 'hello', timestamp: 1 },
      modelRounds: [],
      startTime: 1,
      status: 'completed',
    });
    apiMocks.restoreSessionView.mockRejectedValueOnce(
      new Error('unknown command restore_session_view')
    );
    apiMocks.restoreSessionWithTurns
      .mockResolvedValueOnce({
        session: {
          sessionId: 'history-1',
          sessionName: 'History 1',
          agentType: 'agentic',
          state: 'Idle',
          turnCount: 1,
          createdAt: 1,
        },
        turns: [restoredTurn('history-1')],
      })
      .mockResolvedValueOnce({
        session: {
          sessionId: 'history-2',
          sessionName: 'History 2',
          agentType: 'agentic',
          state: 'Idle',
          turnCount: 1,
          createdAt: 1,
        },
        turns: [restoredTurn('history-2')],
      });
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
        ['history-2', createSession({
          sessionId: 'history-2',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    await flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void');
    await flowChatStore.loadSessionHistory('history-2', 'D:/workspace/void');

    expect(apiMocks.restoreSessionView).toHaveBeenCalledTimes(1);
    expect(apiMocks.restoreSessionWithTurns).toHaveBeenCalledTimes(2);
    expect(apiMocks.loadSessionTurns).not.toHaveBeenCalled();
  });

  it('scopes unsupported restore command caching by remote identity', async () => {
    const restoredTurn = (sessionId: string) => ({
      turnId: `${sessionId}-turn-1`,
      turnIndex: 0,
      sessionId,
      timestamp: 1,
      userMessage: { id: `${sessionId}-user-1`, content: 'hello', timestamp: 1 },
      modelRounds: [],
      startTime: 1,
      status: 'completed',
    });
    apiMocks.restoreSessionView
      .mockRejectedValueOnce(new Error('unknown command restore_session_view'))
      .mockResolvedValueOnce({
        session: {
          sessionId: 'history-2',
          sessionName: 'History 2',
          agentType: 'agentic',
          state: 'Idle',
          turnCount: 1,
          createdAt: 1,
        },
        turns: [restoredTurn('history-2')],
        contextRestoreState: 'pending',
      });
    apiMocks.restoreSessionWithTurns.mockResolvedValueOnce({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 1,
        createdAt: 1,
      },
      turns: [restoredTurn('history-1')],
    });
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
        ['history-2', createSession({
          sessionId: 'history-2',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    await flowChatStore.loadSessionHistory(
      'history-1',
      '/remote/workspace',
      undefined,
      'remote-1',
      'old.example'
    );
    await flowChatStore.loadSessionHistory('history-2', 'D:/workspace/void');

    expect(apiMocks.restoreSessionView).toHaveBeenCalledTimes(2);
    expect(apiMocks.restoreSessionWithTurns).toHaveBeenCalledTimes(1);
    expect(apiMocks.loadSessionTurns).not.toHaveBeenCalled();
  });

  it('falls back to legacy restore and turn loading when restoreSessionWithTurns is unavailable on the backend', async () => {
    (apiMocks as any).restoreSessionView = undefined;
    const restoredTurn = {
      turnId: 'turn-1',
      turnIndex: 0,
      sessionId: 'history-1',
      timestamp: 1,
      userMessage: { id: 'user-1', content: 'hello', timestamp: 1 },
      modelRounds: [],
      startTime: 1,
      status: 'completed',
    };
    apiMocks.restoreSessionWithTurns.mockRejectedValueOnce(
      new Error('unknown command restore_session_with_turns')
    );
    apiMocks.restoreSession.mockResolvedValueOnce({
      sessionId: 'history-1',
      sessionName: 'History 1',
      agentType: 'agentic',
      state: 'Idle',
      turnCount: 1,
      createdAt: 1,
    });
    apiMocks.loadSessionTurns.mockResolvedValueOnce([restoredTurn]);
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    await flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void');

    expect(apiMocks.restoreSessionWithTurns).toHaveBeenCalledTimes(1);
    expect(apiMocks.restoreSession).toHaveBeenCalledTimes(1);
    expect(apiMocks.loadSessionTurns).toHaveBeenCalledTimes(1);
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: false,
      historyState: 'ready',
      contextRestoreState: 'ready',
      dialogTurns: expect.arrayContaining([
        expect.objectContaining({ id: 'turn-1' }),
      ]),
    });
  });

  it('uses view restore when available and marks backend context pending', async () => {
    const restoredTurn = {
      turnId: 'turn-1',
      turnIndex: 0,
      sessionId: 'history-1',
      timestamp: 1,
      userMessage: { id: 'user-1', content: 'hello', timestamp: 1 },
      modelRounds: [],
      startTime: 1,
      status: 'completed',
    };
    apiMocks.restoreSessionView.mockResolvedValueOnce({
      session: {
        sessionId: 'history-1',
        sessionName: 'History 1',
        agentType: 'agentic',
        state: 'Idle',
        turnCount: 1,
        createdAt: 1,
      },
      turns: [restoredTurn],
      contextRestoreState: 'pending',
    });
    flowChatStore.setState(() => ({
      sessions: new Map([
        ['history-1', createSession({
          sessionId: 'history-1',
          isHistorical: true,
          historyState: 'metadata-only',
        })],
      ]),
      activeSessionId: 'history-1',
    }));

    await flowChatStore.loadSessionHistory('history-1', 'D:/workspace/void');

    expect(apiMocks.restoreSessionView).toHaveBeenCalledTimes(1);
    expect(apiMocks.restoreSessionWithTurns).not.toHaveBeenCalled();
    expect(apiMocks.loadSessionTurns).not.toHaveBeenCalled();
    expect(flowChatStore.getState().sessions.get('history-1')).toMatchObject({
      isHistorical: false,
      historyState: 'ready',
      contextRestoreState: 'pending',
    });
  });
});
