import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSendMessageToTransientBtwSession = vi.fn();
const mockStateMachineGetCurrentState = vi.fn();
const mockPendingQueueList = vi.fn();
const mockPendingQueueEnqueue = vi.fn();

vi.mock('@/infrastructure/api/service-api/AgentAPI', () => ({
  agentAPI: {
    startDialogTurn: vi.fn(),
    updateSessionModel: vi.fn(),
  },
}));

vi.mock('@/infrastructure/api/service-api/ACPClientAPI', () => ({
  ACPClientAPI: {
    startDialogTurn: vi.fn(),
  },
}));

vi.mock('@/infrastructure/config/services/ConfigManager', () => ({
  configManager: {
    getConfig: vi.fn(),
  },
}));

vi.mock('../../../shared/notification-system', () => ({
  notificationService: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('../../state-machine', () => ({
  stateMachineManager: {
    getCurrentState: (...args: any[]) => mockStateMachineGetCurrentState(...args),
    transition: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('@/infrastructure/event-bus', () => ({
  globalEventBus: {
    emit: vi.fn(),
  },
}));

vi.mock('./PendingQueueModule', () => ({
  pendingQueueManager: {
    list: (...args: any[]) => mockPendingQueueList(...args),
    enqueue: (...args: any[]) => mockPendingQueueEnqueue(...args),
  },
}));

vi.mock('../BtwThreadService', () => ({
  isTransientBtwSession: (session: any) =>
    session?.isTransient === true &&
    session?.sessionKind === 'btw' &&
    session?.agentBackedTransient !== true,
  sendMessageToTransientBtwSession: (...args: any[]) =>
    mockSendMessageToTransientBtwSession(...args),
}));

import { SessionExecutionState } from '../../state-machine/types';
import { sendMessage } from './MessageModule';

describe('MessageModule transient BTW image follow-up', () => {
  const sessions = new Map<string, any>();
  const context: any = {
    flowChatStore: {
      getState: () => ({ sessions }),
      updateSessionMode: vi.fn(),
      updateSessionLastSubmittedMode: vi.fn(),
      addDialogTurn: vi.fn(),
      deleteDialogTurn: vi.fn(),
    },
    pendingHistoryLoads: new Set<string>(),
    processingManager: {
      registerStatus: vi.fn(),
      clearSessionStatus: vi.fn(),
    },
    contentBuffers: new Map(),
    activeTextItems: new Map(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessions.clear();
    sessions.set('btw-child-1', {
      sessionId: 'btw-child-1',
      title: 'Side image question',
      mode: 'agentic',
      sessionKind: 'btw',
      parentSessionId: 'parent-1',
      isTransient: true,
      agentBackedTransient: false,
      config: {
        modelName: 'fast',
      },
    });
    mockStateMachineGetCurrentState.mockReturnValue(SessionExecutionState.IDLE);
    mockPendingQueueList.mockReturnValue([]);
    mockPendingQueueEnqueue.mockReturnValue({ id: 'pending-1' });
    mockSendMessageToTransientBtwSession.mockResolvedValue({ requestId: 'btw-req-1' });
  });

  it('forwards image contexts when sending a transient BTW child-session follow-up', async () => {
    await sendMessage(context, 'What is in this image?', 'btw-child-1', undefined, undefined, undefined, {
      imageContexts: [
        {
          id: 'img-1',
          data_url: 'data:image/png;base64,AAAA',
          mime_type: 'image/png',
          metadata: {
            name: 'frame.png',
          },
        },
      ],
      imageDisplayData: [
        {
          id: 'img-1',
          name: 'frame.png',
          dataUrl: 'data:image/png;base64,AAAA',
          mimeType: 'image/png',
        },
      ],
    });

    expect(mockSendMessageToTransientBtwSession).toHaveBeenCalledWith(
      expect.objectContaining({
        parentSessionId: 'parent-1',
        childSessionId: 'btw-child-1',
        question: 'What is in this image?',
        childSessionName: 'Side image question',
        modelId: 'fast',
        imagePayload: {
          imageContexts: [
            {
              id: 'img-1',
              data_url: 'data:image/png;base64,AAAA',
              mime_type: 'image/png',
              metadata: {
                name: 'frame.png',
              },
            },
          ],
          imageDisplayData: [
            {
              id: 'img-1',
              name: 'frame.png',
              dataUrl: 'data:image/png;base64,AAAA',
              mimeType: 'image/png',
            },
          ],
        },
      }),
    );
  });

  it('keeps transient BTW follow-up without images on the existing no-image path', async () => {
    await sendMessage(context, 'Plain follow-up', 'btw-child-1');

    expect(mockSendMessageToTransientBtwSession).toHaveBeenCalledWith(
      expect.objectContaining({
        parentSessionId: 'parent-1',
        childSessionId: 'btw-child-1',
        question: 'Plain follow-up',
        childSessionName: 'Side image question',
        modelId: 'fast',
        imagePayload: undefined,
      }),
    );
  });

  it('preserves the explicit BTW memory choice on follow-up turns', async () => {
    sessions.set('btw-child-1', {
      ...sessions.get('btw-child-1'),
      btwOrigin: {
        parentSessionId: 'parent-1',
        memoryEnabled: true,
      },
    });

    await sendMessage(context, 'Remember only after review', 'btw-child-1');

    expect(mockSendMessageToTransientBtwSession).toHaveBeenCalledWith(
      expect.objectContaining({
        childSessionId: 'btw-child-1',
        memoryEnabled: true,
      }),
    );
  });

  it('does not create or delete a normal dialog turn when transient BTW image send fails', async () => {
    const error = new Error('btw stream failed');
    mockSendMessageToTransientBtwSession.mockRejectedValueOnce(error);

    await expect(sendMessage(context, 'Retry image question', 'btw-child-1', undefined, undefined, undefined, {
      imageContexts: [
        {
          id: 'img-2',
          data_url: 'data:image/png;base64,BBBB',
          mime_type: 'image/png',
        },
      ],
      imageDisplayData: [
        {
          id: 'img-2',
          name: 'retry.png',
          dataUrl: 'data:image/png;base64,BBBB',
          mimeType: 'image/png',
        },
      ],
    })).rejects.toThrow('btw stream failed');

    expect(context.flowChatStore.addDialogTurn).not.toHaveBeenCalled();
    expect(context.flowChatStore.deleteDialogTurn).not.toHaveBeenCalled();
    expect(mockSendMessageToTransientBtwSession).toHaveBeenCalledWith(
      expect.objectContaining({
        imagePayload: expect.objectContaining({
          imageContexts: [
            expect.objectContaining({
              id: 'img-2',
              data_url: 'data:image/png;base64,BBBB',
            }),
          ],
          imageDisplayData: [
            expect.objectContaining({
              id: 'img-2',
              dataUrl: 'data:image/png;base64,BBBB',
            }),
          ],
        }),
      }),
    );
  });

  it('preserves user-message metadata while a busy session queues the message', async () => {
    sessions.set('busy-session', {
      sessionId: 'busy-session',
      title: 'Busy',
      mode: 'agentic',
      sessionKind: 'normal',
      config: { modelName: 'fast' },
    });
    mockStateMachineGetCurrentState.mockReturnValue(SessionExecutionState.PROCESSING);
    const userMessageMetadata = {
      composerPresentation: {
        version: 1,
        segments: [{ type: 'skill', name: 'audit' }],
      },
    };

    await sendMessage(
      context,
      'Please use the Skill tool with command "audit".',
      'busy-session',
      '[[void-skill:audit]]',
      'agentic',
      undefined,
      { userMessageMetadata },
    );

    expect(mockPendingQueueEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'busy-session',
      userMessageMetadata,
    }));
    expect(context.flowChatStore.addDialogTurn).not.toHaveBeenCalled();
  });
});
