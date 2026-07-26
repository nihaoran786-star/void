import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateSession = vi.fn();
const mockAskStream = vi.fn();
const mockListRelationships = vi.fn();
const mockAddExternalSession = vi.fn();
const mockUpdateSessionRelationship = vi.fn();
const mockUpdateSessionBtwOrigin = vi.fn();
const mockAddBtwThreadMarker = vi.fn();
const mockLoadSessionHistory = vi.fn();
const mockEnsureBackendSession = vi.fn();
const mockDiscardLocalSession = vi.fn();

const sessions = new Map<string, any>();
const readyRelationship = {
  schemaVersion: 1,
  parentSessionId: 'parent-1',
  childSessionId: 'btw-child-1',
  requestId: 'request-1',
  childSessionName: 'Side question',
  hydrationState: 'ready' as const,
  memoryEnabled: false,
};

vi.mock('@/infrastructure/api', () => ({
  agentAPI: {
    createSession: (...args: any[]) => mockCreateSession(...args),
  },
  btwAPI: {
    askStream: (...args: any[]) => mockAskStream(...args),
    listRelationships: (...args: any[]) => mockListRelationships(...args),
  },
}));

vi.mock('../store/FlowChatStore', () => ({
  flowChatStore: {
    getState: () => ({ sessions }),
    addExternalSession: (...args: any[]) => {
      const [
        sessionId,
        title,
        mode,
        workspacePath,
        metadata,
        remoteConnectionId,
        remoteSshHost,
      ] = args;
      sessions.set(sessionId, {
        sessionId,
        title,
        mode,
        workspacePath,
        remoteConnectionId,
        remoteSshHost,
        config: {
          modelName: 'fast',
        },
        ...metadata,
      });
      return mockAddExternalSession(...args);
    },
    updateSessionRelationship: (...args: any[]) => mockUpdateSessionRelationship(...args),
    updateSessionBtwOrigin: (...args: any[]) => mockUpdateSessionBtwOrigin(...args),
    addBtwThreadMarker: (...args: any[]) => mockAddBtwThreadMarker(...args),
    loadSessionHistory: (...args: any[]) => mockLoadSessionHistory(...args),
    updateSessionModelName: vi.fn(),
  },
}));

vi.mock('../state-machine', () => ({
  stateMachineManager: {
    get: () => ({
      getContext: () => ({
        currentDialogTurnId: 'turn-parent-1',
      }),
    }),
  },
}));

vi.mock('./FlowChatManager', () => ({
  flowChatManager: {
    discardLocalSession: (...args: any[]) => mockDiscardLocalSession(...args),
    ensureBackendSession: (...args: any[]) => mockEnsureBackendSession(...args),
  },
}));

vi.mock('@/shared/notification-system', () => ({
  notificationService: {
    warning: vi.fn(),
  },
}));

import {
  createBtwChildSession,
  sendMessageToTransientBtwSession,
  startBtwThread,
} from './BtwThreadService';
import { hydrateBtwRelationships } from './BtwRelationshipHydrationService';

describe('BtwThreadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessions.clear();
    sessions.set('parent-1', {
      sessionId: 'parent-1',
      mode: 'agentic',
      workspacePath: '/workspace',
      remoteConnectionId: 'remote-1',
      remoteSshHost: 'host-1',
      config: {
        modelName: 'primary',
      },
      dialogTurns: [
        {
          id: 'turn-parent-1',
        },
      ],
    });
    mockCreateSession.mockResolvedValue({
      sessionId: 'child-1',
    });
    mockEnsureBackendSession.mockResolvedValue(undefined);
    mockAskStream.mockResolvedValue({
      ok: true,
      relationship: readyRelationship,
    });
    mockListRelationships.mockResolvedValue([]);
    mockLoadSessionHistory.mockResolvedValue(undefined);
  });

  it('passes structured relationship metadata to backend-created review sessions', async () => {
    const deepReviewRunManifest = {
      reviewers: [],
    };

    await createBtwChildSession({
      parentSessionId: 'parent-1',
      workspacePath: '/workspace',
      childSessionName: 'Deep review',
      sessionKind: 'deep_review',
      agentType: 'DeepReview',
      deepReviewRunManifest,
    });

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionName: 'Deep review',
        agentType: 'DeepReview',
        workspacePath: '/workspace',
        remoteConnectionId: 'remote-1',
        remoteSshHost: 'host-1',
        relationship: {
          kind: 'deep_review',
          parentSessionId: 'parent-1',
          parentRequestId: expect.any(String),
          parentDialogTurnId: 'turn-parent-1',
          parentTurnIndex: 1,
        },
        deepReviewRunManifest,
      }),
    );
  });

  it('records the active request id before starting a transient BTW follow-up', async () => {
    sessions.set('btw-child-1', {
      sessionId: 'btw-child-1',
      title: 'Side question',
      sessionKind: 'btw',
      parentSessionId: 'parent-1',
      isTransient: true,
      agentBackedTransient: false,
      config: {
        modelName: 'fast',
      },
    });
    const { requestId, relationship } = await sendMessageToTransientBtwSession({
      parentSessionId: 'parent-1',
      childSessionId: 'btw-child-1',
      question: 'Follow up?',
    });

    expect(mockUpdateSessionBtwOrigin).toHaveBeenCalledWith(
      'btw-child-1',
      {
        requestId,
        parentSessionId: 'parent-1',
      },
      'btw',
    );
    expect(mockAskStream).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        sessionId: 'parent-1',
        childSessionId: 'btw-child-1',
        question: 'Follow up?',
        memoryEnabled: undefined,
      }),
    );
    expect(relationship).toEqual(readyRelationship);
  });

  it('passes image contexts to transient BTW follow-up streams', async () => {
    sessions.set('btw-child-1', {
      sessionId: 'btw-child-1',
      title: 'Side question',
      sessionKind: 'btw',
      parentSessionId: 'parent-1',
      isTransient: true,
      agentBackedTransient: false,
      config: {
        modelName: 'fast',
      },
    });
    await sendMessageToTransientBtwSession({
      parentSessionId: 'parent-1',
      childSessionId: 'btw-child-1',
      question: 'What is in this image?',
      imagePayload: {
        imageContexts: [
          {
            id: 'img-1',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,AAAA',
          },
        ],
      },
    });

    expect(mockAskStream).toHaveBeenCalledWith(
      expect.objectContaining({
        imageContexts: [
          {
            id: 'img-1',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,AAAA',
          },
        ],
      }),
    );
  });

  it('keeps optional BTW memory disabled unless explicitly enabled', async () => {
    sessions.set('btw-child-1', {
      sessionId: 'btw-child-1',
      title: 'Side question',
      sessionKind: 'btw',
      parentSessionId: 'parent-1',
      isTransient: true,
      agentBackedTransient: false,
      config: { modelName: 'fast' },
    });

    await sendMessageToTransientBtwSession({
      parentSessionId: 'parent-1',
      childSessionId: 'btw-child-1',
      question: 'Remember this only for the side thread?',
      memoryEnabled: true,
    });

    expect(mockAskStream).toHaveBeenCalledWith(
      expect.objectContaining({ memoryEnabled: true }),
    );
  });

  it('hydrates a typed persisted BTW relationship and resumes it through the next turn', async () => {
    const staleRelationship = {
      ...readyRelationship,
      hydrationState: 'runtime_unavailable' as const,
      hydrationDetail: 'persisted BTW relationship restored; start a new turn to resume',
    };
    mockListRelationships.mockResolvedValue([staleRelationship]);

    await expect(hydrateBtwRelationships({
      parentSessionId: 'parent-1',
      workspacePath: '/workspace',
    })).resolves.toEqual([staleRelationship]);
    expect(mockListRelationships).toHaveBeenCalledWith({
      parentSessionId: 'parent-1',
      workspacePath: '/workspace',
    });
    expect(mockAddExternalSession).toHaveBeenCalledWith(
      'btw-child-1',
      'Side question',
      'agentic',
      '/workspace',
      expect.objectContaining({
        parentSessionId: 'parent-1',
        sessionKind: 'btw',
        isTransient: true,
      }),
    );
    expect(mockAddBtwThreadMarker).toHaveBeenCalledWith(
      'parent-1',
      expect.objectContaining({
        childSessionId: 'btw-child-1',
        status: 'done',
        error: undefined,
      }),
    );
    expect(mockLoadSessionHistory).toHaveBeenCalledWith(
      'btw-child-1',
      '/workspace',
      undefined,
      undefined,
      undefined,
      { includeInternal: true },
    );

    await sendMessageToTransientBtwSession({
      parentSessionId: 'parent-1',
      childSessionId: 'btw-child-1',
      question: 'Resume with a new runtime turn',
    });
    expect(mockAskStream).toHaveBeenCalledWith(
      expect.objectContaining({
        childSessionId: 'btw-child-1',
        workspacePath: '/workspace',
        memoryEnabled: undefined,
      }),
    );
  });

  it('prepares the parent backend session before starting a transient BTW stream', async () => {
    mockAskStream.mockImplementation(() => {
      expect(mockEnsureBackendSession).toHaveBeenCalledWith('parent-1');
      return Promise.resolve({ ok: true, relationship: readyRelationship });
    });

    await startBtwThread({
      parentSessionId: 'parent-1',
      workspacePath: '',
      question: 'Why did this fail?',
      modelId: 'fast',
    });

    expect(mockEnsureBackendSession).toHaveBeenCalledTimes(1);
    expect(mockAskStream).toHaveBeenCalledTimes(1);
    expect(mockAddExternalSession).toHaveBeenCalledWith(
      expect.any(String),
      'Why did this fail?',
      'agentic',
      '/workspace',
      expect.objectContaining({
        parentSessionId: 'parent-1',
        sessionKind: 'btw',
      }),
      'remote-1',
      'host-1',
    );
  });
});
