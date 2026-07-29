// @vitest-environment jsdom

import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextItem } from '@/shared/types/context';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createChatSession: vi.fn(),
  sendMessage: vi.fn(),
  getConfig: vi.fn(),
  resolveSessionReferences: vi.fn(),
}));

vi.mock('../services/FlowChatManager', () => ({
  FlowChatManager: {
    getInstance: () => ({
      createChatSession: mocks.createChatSession,
      sendMessage: mocks.sendMessage,
    }),
  },
}));

vi.mock('@/infrastructure/config/services/ConfigManager', () => ({
  configManager: {
    getConfig: mocks.getConfig,
  },
}));

vi.mock('@/infrastructure/api', () => ({
  sessionAPI: {
    resolveSessionReferences: mocks.resolveSessionReferences,
  },
}));

import {
  useMessageSender,
  type MessageSendReceipt,
} from './useMessageSender';

const fileContext: ContextItem = {
  id: 'file-1',
  type: 'file',
  timestamp: 1,
  filePath: '/workspace/a.ts',
  fileName: 'a.ts',
};

const newerFileContext: ContextItem = {
  id: 'file-2',
  type: 'file',
  timestamp: 2,
  filePath: '/workspace/b.ts',
  fileName: 'b.ts',
};

describe('useMessageSender deferred session creation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let sender: {
    sendMessage: (message: string) => Promise<MessageSendReceipt | undefined>;
  } | null;

  beforeEach(() => {
    mocks.createChatSession.mockReset().mockResolvedValue('session-created');
    mocks.sendMessage.mockReset().mockResolvedValue(undefined);
    mocks.getConfig.mockReset().mockImplementation((key: string) => {
      if (key === 'ai.agent_models') return {};
      if (key === 'ai.models') return [];
      if (key === 'ai.default_models') return {};
      return undefined;
    });
    sender = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('creates exactly one workspace-scoped session on the first text send', async () => {
    const onSessionCreated = vi.fn();

    function Harness() {
      const value = useMessageSender({
        contexts: [],
        currentAgentType: 'Cowork',
        newSessionConfig: {
          workspaceId: 'workspace-2',
          workspacePath: 'D:/workspace-2',
        },
        onSessionCreated,
      });
      useEffect(() => {
        sender = value;
      }, [value]);
      return null;
    }

    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      await sender?.sendMessage('第一条消息');
    });

    expect(mocks.createChatSession).toHaveBeenCalledOnce();
    expect(mocks.createChatSession).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-2',
        workspacePath: 'D:/workspace-2',
      }),
      'Cowork',
    );
    expect(onSessionCreated).toHaveBeenCalledOnce();
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      '第一条消息',
      'session-created',
      '第一条消息',
      'Cowork',
      undefined,
      expect.objectContaining({
        userMessageMetadata: expect.objectContaining({
          composerPresentation: {
            version: 1,
            segments: [{ type: 'text', text: '第一条消息' }],
          },
          sessionReferences: [],
        }),
      }),
    );
  });

  it('returns and reports a receipt from the contexts captured when sending starts', async () => {
    let resolveSession: ((sessionId: string) => void) | undefined;
    mocks.createChatSession.mockImplementation(() => new Promise<string>((resolve) => {
      resolveSession = resolve;
    }));
    const contexts = [fileContext];
    const onSuccess = vi.fn();

    function Harness() {
      const value = useMessageSender({
        contexts,
        currentAgentType: 'Cowork',
        onSuccess,
      });
      useEffect(() => {
        sender = value;
      }, [value]);
      return null;
    }

    await act(async () => {
      root.render(<Harness />);
    });
    mocks.resolveSessionReferences.mockReset();

    let sendPromise: Promise<MessageSendReceipt | undefined> | undefined;
    await act(async () => {
      sendPromise = sender?.sendMessage('发送快照');
      await Promise.resolve();
    });
    contexts.push(newerFileContext);

    let receipt: MessageSendReceipt | undefined;
    await act(async () => {
      resolveSession?.('session-created');
      receipt = await sendPromise;
    });

    expect(receipt).toEqual({
      requestedSessionId: null,
      sentSessionId: 'session-created',
      submittedContextIds: ['file-1'],
    });
    expect(onSuccess).toHaveBeenCalledWith('发送快照', receipt);
    expect(mocks.sendMessage.mock.calls[0]?.[0]).not.toContain('b.ts');
  });

  it('captures one immutable persona snapshot in user message metadata', async () => {
    const personaSessionState = {
      sessionId: 'session-1',
      sessionKind: 'normal' as const,
      status: 'selected' as const,
      scenario: 'code' as const,
      executionPolicy: 'agentic',
      activePersonaBinding: {
        kind: 'agent' as const,
        personaId: 'project::void::reviewer',
        personaRevision: { status: 'known' as const, value: 'prompt-v1' },
      },
    };

    function Harness() {
      const value = useMessageSender({
        currentSessionId: 'session-1',
        contexts: [],
        personaSessionState,
      });
      useEffect(() => {
        sender = value;
      }, [value]);
      return null;
    }

    await act(async () => {
      root.render(<Harness />);
    });
    const send = sender?.sendMessage('review');
    personaSessionState.activePersonaBinding.personaRevision.value = 'prompt-v2';
    await act(async () => {
      await send;
    });

    expect(
      mocks.sendMessage.mock.calls[0]?.[5].userMessageMetadata.personaTurnSnapshot,
    ).toEqual({
      schemaVersion: 1,
      kind: 'agent',
      personaKey: 'project::void::reviewer',
      personaRevision: 'prompt-v1',
      scenario: 'code',
      executionPolicy: 'agentic',
      resolvedSkillRefs: [],
    });
  });

  it('does not report a receipt when sending fails', async () => {
    mocks.sendMessage.mockRejectedValueOnce(new Error('send failed'));
    const onSuccess = vi.fn();

    function Harness() {
      const value = useMessageSender({
        currentSessionId: 'session-1',
        contexts: [fileContext],
        currentAgentType: 'Cowork',
        onSuccess,
      });
      useEffect(() => {
        sender = value;
      }, [value]);
      return null;
    }

    await act(async () => {
      root.render(<Harness />);
    });

    await expect(act(async () => {
      await sender?.sendMessage('失败消息');
    })).rejects.toThrow('send failed');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('persists a payload-free image presentation and expands Skill references for the model', async () => {
    const image: ContextItem = {
      id: 'image-1',
      timestamp: 3,
      type: 'image',
      imagePath: 'D:/workspace/cat.png',
      imageName: 'cat.png',
      fileSize: 42,
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,large',
      thumbnailUrl: 'blob:large',
      source: 'file',
      isLocal: true,
    };

    function Harness() {
      const value = useMessageSender({
        currentSessionId: 'session-1',
        contexts: [image],
      });
      useEffect(() => {
        sender = value;
      }, [value]);
      return null;
    }

    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      await sender?.sendMessage('[[void-skill:audit]] inspect #img:cat.png');
    });

    const call = mocks.sendMessage.mock.calls[0];
    expect(call[0]).toContain('Please use the Skill tool with command "audit".');
    const presentation = call[5].userMessageMetadata.composerPresentation;
    expect(JSON.stringify(presentation)).not.toContain('base64');
    expect(JSON.stringify(presentation)).not.toContain('thumbnailUrl');
    expect(call[5].imageDisplayData[0].dataUrl).toContain('base64');
  });

  it('injects an explicitly referenced session through the scoped Module Interface', async () => {
    const sessionReference: ContextItem = {
      id: 'session-reference-1',
      type: 'session-reference',
      sessionId: 'research',
      sessionTitle: 'Research',
      workspaceId: 'workspace-1',
      workspacePath: 'D:/workspace/project',
      timestamp: 4,
    };
    mocks.resolveSessionReferences.mockResolvedValue([{
      source: {
        kind: 'session_reference',
        sessionId: 'research',
        sessionTitle: 'Research',
      },
      status: 'ready',
      transcript: '<referenced_session>bounded transcript</referenced_session>',
      messageCount: 2,
      estimatedTokens: 20,
    }]);

    function Harness() {
      const value = useMessageSender({
        currentSessionId: 'session-1',
        contexts: [sessionReference],
        sessionReferenceScope: {
          workspaceId: 'workspace-1',
          workspacePath: 'D:/workspace/project',
        },
      });
      useEffect(() => {
        sender = value;
      }, [value]);
      return null;
    }

    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      await sender?.sendMessage('Compare the findings.');
    });

    expect(mocks.resolveSessionReferences).toHaveBeenCalledWith(
      {
        currentSessionId: 'session-1',
        workspaceId: 'workspace-1',
        workspacePath: 'D:/workspace/project',
      },
      [sessionReference],
    );
    const call = mocks.sendMessage.mock.calls[0];
    expect(call[0]).toContain('bounded transcript');
    expect(call[5].userMessageMetadata.sessionReferenceResolutions).toEqual([{
      source: expect.objectContaining({ sessionId: 'research' }),
      status: 'ready',
      error: undefined,
    }]);
  });
});
