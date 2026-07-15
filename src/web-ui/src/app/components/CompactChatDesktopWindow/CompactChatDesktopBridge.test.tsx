// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompactChatDesktopBridge } from './CompactChatDesktopBridge';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const runtimeMock = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
}));

const managerMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  cancelCurrentTask: vi.fn(),
}));

const handlers = vi.hoisted(() => ({
  request: null as null | (() => void),
  suspension: null as null | (() => void),
  message: null as null | ((payload: { message: string; sessionId: string }) => Promise<void> | void),
  cancel: null as null | ((payload: { sessionId: string }) => Promise<void> | void),
  close: null as null | (() => void),
}));

const bridgeMock = vi.hoisted(() => ({
  listenCompactChatPresentationRequests: vi.fn(async handler => {
    handlers.request = handler;
    return vi.fn();
  }),
  listenCompactChatPresentationSuspensionRequests: vi.fn(async handler => {
    handlers.suspension = handler;
    return vi.fn();
  }),
  listenCompactChatMessageRequests: vi.fn(async handler => {
    handlers.message = handler;
    return vi.fn();
  }),
  listenCompactChatCancelTaskRequests: vi.fn(async handler => {
    handlers.cancel = handler;
    return vi.fn();
  }),
  listenCompactChatCloseRequests: vi.fn(async handler => {
    handlers.close = handler;
    return vi.fn();
  }),
}));

const publisherMock = vi.hoisted(() => ({
  activateCompactChatPresentationPublishing: vi.fn(),
  requestCompactChatPresentationUpdate: vi.fn(),
  suspendCompactChatPresentationPublishing: vi.fn(),
}));

const windowServiceMock = vi.hoisted(() => ({
  closeCompactChatFloatingWindow: vi.fn(),
}));

vi.mock('@/infrastructure/runtime', () => runtimeMock);
vi.mock('@/flow_chat/services/FlowChatManager', () => ({
  FlowChatManager: { getInstance: () => managerMock },
}));
vi.mock('@/flow_chat/services/CompactChatPresentationBridge', () => bridgeMock);
vi.mock('@/flow_chat/services/CompactChatPresentationPublisher', () => publisherMock);
vi.mock('@/infrastructure/config/services/CompactChatWindowService', () => windowServiceMock);

describe('CompactChatDesktopBridge', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<CompactChatDesktopBridge />);
      await Promise.resolve();
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.assign(handlers, {
      request: null,
      suspension: null,
      message: null,
      cancel: null,
      close: null,
    });
    vi.clearAllMocks();
  });

  it('does not activate until the floating window requests presentation', () => {
    expect(publisherMock.activateCompactChatPresentationPublishing).not.toHaveBeenCalled();

    act(() => handlers.request?.());

    expect(publisherMock.activateCompactChatPresentationPublishing).toHaveBeenCalledTimes(1);
  });

  it('suspends immediately on minimize or close activity', () => {
    const closeRequested = vi.fn();
    window.addEventListener('void:compact-chat-close-requested', closeRequested);

    act(() => handlers.suspension?.());
    act(() => handlers.close?.());

    expect(publisherMock.suspendCompactChatPresentationPublishing).toHaveBeenCalledTimes(2);
    expect(closeRequested).toHaveBeenCalledTimes(1);
    window.removeEventListener('void:compact-chat-close-requested', closeRequested);
  });

  it('preserves send and cancel business paths and only requests a presentation refresh', async () => {
    await act(async () => {
      await handlers.message?.({ message: 'hello', sessionId: 'session-1' });
      await handlers.cancel?.({ sessionId: 'session-1' });
    });

    expect(managerMock.sendMessage).toHaveBeenCalledWith('hello', 'session-1');
    expect(managerMock.cancelCurrentTask).toHaveBeenCalledTimes(1);
    expect(publisherMock.requestCompactChatPresentationUpdate).toHaveBeenCalledTimes(2);
  });
});
