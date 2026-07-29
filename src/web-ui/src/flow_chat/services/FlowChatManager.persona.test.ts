import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '../types/flow-chat';

const mocks = vi.hoisted(() => {
  const sessions = new Map<string, Session>();
  const updateParentSessionCustomization = vi.fn((
    sessionId: string,
    next: Pick<
      Session,
      'mode' | 'scenario' | 'executionPolicy' | 'activePersonaBinding'
    >,
  ) => {
    const session = sessions.get(sessionId);
    if (!session || session.sessionKind !== 'normal') {
      return false;
    }
    sessions.set(sessionId, {
      ...session,
      ...next,
    });
    return true;
  });
  return {
    sessions,
    updateParentSessionCustomization,
    persistSessionMetadata: vi.fn(),
  };
});

vi.mock('../store/FlowChatStore', () => ({
  FlowChatStore: {
    getInstance: () => ({
      getState: () => ({ sessions: mocks.sessions }),
      updateParentSessionCustomization: mocks.updateParentSessionCustomization,
    }),
  },
}));

vi.mock('../../shared/services/agent-service', () => ({
  AgentService: {
    getInstance: () => ({}),
  },
}));

vi.mock('./ProcessingStatusManager', () => ({
  processingStatusManager: {},
}));

vi.mock('./EventBatcher', () => ({
  EventBatcher: class {
    constructor(_options: unknown) {}
  },
}));

vi.mock('../state-machine', () => ({
  stateMachineManager: {},
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('./BtwRelationshipHydrationService', () => ({
  hydrateBtwRelationships: vi.fn(),
}));

vi.mock('./SubagentTaskProjectionService', () => ({
  hydrateSubagentTaskProjections: vi.fn(),
}));

vi.mock('./flow-chat-manager', () => ({
  saveAllInProgressTurns: vi.fn(),
  immediateSaveDialogTurn: vi.fn(),
  createChatSession: vi.fn(),
  switchChatSession: vi.fn(),
  deleteChatSession: vi.fn(),
  renameChatSessionTitle: vi.fn(),
  forkChatSession: vi.fn(),
  ensureBackendSession: vi.fn(),
  cleanupSaveState: vi.fn(),
  cleanupSessionBuffers: vi.fn(),
  sendMessage: vi.fn(),
  cancelCurrentTask: vi.fn(),
  installPendingQueueDrainListener: vi.fn(),
  drainPendingQueue: vi.fn(),
  initializeEventListeners: vi.fn(),
  processBatchedEvents: vi.fn(),
  addDialogTurn: vi.fn(),
  addImageAnalysisPhase: vi.fn(),
  updateImageAnalysisResults: vi.fn(),
  updateImageAnalysisItem: vi.fn(),
  updateSessionMetadata: vi.fn(),
  persistSessionMetadata: mocks.persistSessionMetadata,
}));

import { FlowChatManager } from './FlowChatManager';

function createParentSession(): Session {
  return {
    sessionId: 'parent-session',
    title: 'Parent',
    dialogTurns: [],
    status: 'idle',
    config: { agentType: 'agentic' },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    sessionKind: 'normal',
    mode: 'agentic',
    scenario: 'code',
    executionPolicy: 'agentic',
    activePersonaBinding: {
      kind: 'team_lead',
      personaId: 'project::void::review-lead',
      personaRevision: { status: 'known', value: 'review-lead-v1' },
      teamDefinitionId: 'review-team-definition',
      teamInstanceId: 'review-team-instance',
    },
  };
}

describe('FlowChatManager parent customization transactions', () => {
  beforeEach(() => {
    mocks.sessions.clear();
    mocks.sessions.set('parent-session', createParentSession());
    mocks.updateParentSessionCustomization.mockClear();
    mocks.persistSessionMetadata.mockReset();
  });

  it('code→media 持久化失败时从乐观状态完整恢复场景、策略、binding 与 revision', async () => {
    let rejectPersistence: ((reason?: unknown) => void) | undefined;
    mocks.persistSessionMetadata.mockImplementationOnce(() => new Promise<void>(
      (_, reject) => {
        rejectPersistence = reject;
      },
    ));
    const manager = FlowChatManager.getInstance();

    const update = manager.updateChatSessionPersona('parent-session', {
      scenario: 'media',
      executionPolicy: 'creative',
      activePersonaBinding: {
        kind: 'agent',
        personaId: 'user::void::storyboard-director',
        personaRevision: { status: 'known', value: 'storyboard-v2' },
      },
    });

    expect(mocks.sessions.get('parent-session')).toMatchObject({
      scenario: 'media',
      executionPolicy: 'creative',
      activePersonaBinding: {
        kind: 'agent',
        personaId: 'user::void::storyboard-director',
        personaRevision: { status: 'known', value: 'storyboard-v2' },
      },
    });

    rejectPersistence?.(new Error('disk unavailable'));
    await expect(update).rejects.toThrow('disk unavailable');

    expect(mocks.updateParentSessionCustomization).toHaveBeenCalledTimes(2);
    expect(mocks.sessions.get('parent-session')).toMatchObject({
      mode: 'agentic',
      scenario: 'code',
      executionPolicy: 'agentic',
      activePersonaBinding: {
        kind: 'team_lead',
        personaId: 'project::void::review-lead',
        personaRevision: { status: 'known', value: 'review-lead-v1' },
        teamDefinitionId: 'review-team-definition',
        teamInstanceId: 'review-team-instance',
      },
    });
  });

  it('模式更新同步 mode 与 executionPolicy，失败时完整恢复原投影', async () => {
    mocks.persistSessionMetadata.mockRejectedValueOnce(new Error('write failed'));
    const manager = FlowChatManager.getInstance();

    await expect(
      manager.updateChatSessionMode('parent-session', 'Plan'),
    ).rejects.toThrow('write failed');

    expect(mocks.updateParentSessionCustomization).toHaveBeenNthCalledWith(
      1,
      'parent-session',
      expect.objectContaining({
        mode: 'Plan',
        scenario: 'code',
        executionPolicy: 'Plan',
      }),
    );
    expect(mocks.sessions.get('parent-session')).toMatchObject({
      mode: 'agentic',
      scenario: 'code',
      executionPolicy: 'agentic',
      activePersonaBinding: {
        personaId: 'project::void::review-lead',
      },
    });
  });

  it('同一会话的模式与人格事务严格串行，后一个基于前一个提交后的状态', async () => {
    let resolveFirst: (() => void) | undefined;
    mocks.persistSessionMetadata
      .mockImplementationOnce(() => new Promise<void>(resolve => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce(undefined);
    const manager = FlowChatManager.getInstance();

    const modeUpdate = manager.updateChatSessionMode('parent-session', 'Plan');
    const personaUpdate = manager.updateChatSessionPersona('parent-session', {
      scenario: 'code',
      executionPolicy: 'Plan',
      activePersonaBinding: {
        kind: 'agent',
        personaId: 'user::void::writer',
        personaRevision: { status: 'known', value: 'writer-v1' },
      },
    });

    expect(mocks.persistSessionMetadata).toHaveBeenCalledTimes(1);
    expect(mocks.updateParentSessionCustomization).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await modeUpdate;
    await personaUpdate;

    expect(mocks.persistSessionMetadata).toHaveBeenCalledTimes(2);
    expect(mocks.updateParentSessionCustomization).toHaveBeenCalledTimes(2);
    expect(mocks.sessions.get('parent-session')).toMatchObject({
      mode: 'Plan',
      scenario: 'code',
      executionPolicy: 'Plan',
      activePersonaBinding: {
        personaId: 'user::void::writer',
      },
    });
  });

  it('前一个事务失败回滚后才执行后一个事务，不会用旧状态覆盖新提交', async () => {
    let rejectFirst: ((reason?: unknown) => void) | undefined;
    mocks.persistSessionMetadata
      .mockImplementationOnce(() => new Promise<void>((_, reject) => {
        rejectFirst = reject;
      }))
      .mockResolvedValueOnce(undefined);
    const manager = FlowChatManager.getInstance();

    const failedMode = manager.updateChatSessionMode('parent-session', 'Plan');
    const succeedingMode = manager.updateChatSessionMode('parent-session', 'debug');
    rejectFirst?.(new Error('first failed'));

    await expect(failedMode).rejects.toThrow('first failed');
    await succeedingMode;

    expect(mocks.sessions.get('parent-session')).toMatchObject({
      mode: 'debug',
      scenario: 'code',
      executionPolicy: 'debug',
    });
    expect(mocks.persistSessionMetadata).toHaveBeenCalledTimes(2);
  });
});
