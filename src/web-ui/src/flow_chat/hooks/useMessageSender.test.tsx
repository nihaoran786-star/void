// @vitest-environment jsdom

import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createChatSession: vi.fn(),
  sendMessage: vi.fn(),
  getConfig: vi.fn(),
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

import { useMessageSender } from './useMessageSender';

describe('useMessageSender deferred session creation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let sender: { sendMessage: (message: string) => Promise<void> } | null;

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
        onClearContexts: vi.fn(),
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
      undefined,
    );
  });
});
