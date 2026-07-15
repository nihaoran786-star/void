// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolCardProps } from '../types/flow-chat';
import { FlowChatPresentationActivityProvider } from '../components/modern/FlowChatPresentationActivity';
import { MCPToolDisplay } from './MCPToolDisplay';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const apiMock = vi.hoisted(() => ({
  fetchResource: vi.fn(),
  getToolUiUri: vi.fn(async () => null),
  sendMessage: vi.fn(async () => ({ jsonrpc: '2.0', id: 1, result: {} })),
}));

const eventBusMock = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const on = vi.fn((eventName: string, listener: (payload: unknown) => void) => {
    const eventListeners = listeners.get(eventName) ?? new Set();
    eventListeners.add(listener);
    listeners.set(eventName, eventListeners);
    return () => {
      eventListeners.delete(listener);
    };
  });
  const off = vi.fn((eventName: string, listener: (payload: unknown) => void) => {
    listeners.get(eventName)?.delete(listener);
  });
  const emit = vi.fn((eventName: string, payload: unknown) => {
    listeners.get(eventName)?.forEach((listener) => listener(payload));
  });

  return {
    bus: { on, off, emit },
    reset: () => {
      listeners.clear();
      on.mockClear();
      off.mockClear();
      emit.mockClear();
    },
    listenerCount: (eventName: string) => listeners.get(eventName)?.size ?? 0,
  };
});

const heightContractMock = vi.hoisted(() => ({
  applyExpandedState: vi.fn((
    _current: boolean,
    next: boolean,
    setExpanded: React.Dispatch<React.SetStateAction<boolean>>,
  ) => setExpanded(next)),
}));

vi.mock('@/infrastructure/api/service-api/MCPAPI', () => ({
  MCP_APPS_PROTOCOL_VERSION: 'test-version',
  MCPAPI: {
    fetchMCPAppResource: apiMock.fetchResource,
    getMCPToolUiUri: apiMock.getToolUiUri,
    sendMCPAppMessage: apiMock.sendMessage,
  },
}));

vi.mock('@/infrastructure/event-bus', () => ({
  globalEventBus: eventBusMock.bus,
}));

vi.mock('@/infrastructure/api/service-api/SystemAPI', () => ({
  systemAPI: { openExternal: vi.fn(async () => undefined) },
}));

vi.mock('@/infrastructure/mcp/toolName', () => ({
  isMcpToolName: () => true,
}));

vi.mock('@/infrastructure/mcp/toolInfoCache', () => ({
  getCachedToolInfo: vi.fn(async () => ({
    dynamic_info: { mcp: { serverId: 'server-1', toolName: 'tool-1' } },
  })),
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../component-library', () => ({
  CubeLoading: () => <span data-testid="loading" />,
  IconButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

vi.mock('./BaseToolCard', () => ({
  BaseToolCard: ({ header, expandedContent }: {
    header?: React.ReactNode;
    expandedContent?: React.ReactNode;
  }) => <div>{header}{expandedContent}</div>,
  ToolCardHeader: () => null,
}));

vi.mock('./useToolCardHeightContract', () => ({
  useToolCardHeightContract: () => ({
    cardRootRef: { current: null },
    applyExpandedState: heightContractMock.applyExpandedState,
  }),
}));

vi.mock('./AcpPermissionActions.utils', () => ({
  hasAcpPermissionOptions: () => false,
}));

vi.mock('./AcpPermissionActions', () => ({
  AcpPermissionActions: () => null,
}));

let resourceSequence = 0;

function createProps(resourceUri: string, suffix = '1'): ToolCardProps {
  return {
    toolItem: {
      id: `tool-item-${suffix}`,
      toolName: 'mcp__server__tool',
      status: 'completed',
      toolCall: { id: `tool-call-${suffix}`, input: { city: 'Shanghai' } },
      toolResult: {
        success: true,
        result: JSON.stringify({
          content: [{ type: 'resource', resource: { uri: resourceUri } }],
        }),
      },
    },
    config: { toolName: 'mcp__server__tool' },
  } as unknown as ToolCardProps;
}

function Harness({ isActive, props }: { isActive: boolean; props: ToolCardProps }) {
  return (
    <FlowChatPresentationActivityProvider isActive={isActive}>
      <MCPToolDisplay {...props} />
    </FlowChatPresentationActivityProvider>
  );
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function dispatchIframeMessage(iframe: HTMLIFrameElement, data: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      data,
    }));
  });
}

describe('MCPToolDisplay presentation lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBusMock.reset();
    apiMock.fetchResource.mockReset();
    apiMock.getToolUiUri.mockClear();
    apiMock.sendMessage.mockClear();
    heightContractMock.applyExpandedState.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('parses a string result stably and fetches its resource once across rerenders', async () => {
    const resourceUri = `ui://stable-${++resourceSequence}`;
    const props = createProps(resourceUri);
    apiMock.fetchResource.mockResolvedValue({
      contents: [{ uri: resourceUri, content: '<main>Stable app</main>' }],
    });

    act(() => root.render(<Harness isActive props={props} />));
    await flushAsyncWork();

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(apiMock.fetchResource).toHaveBeenCalledTimes(1);

    dispatchIframeMessage(iframe!, {
      jsonrpc: '2.0',
      method: 'ui/notifications/size-changed',
      params: { height: 320 },
    });
    act(() => root.render(<Harness isActive props={props} />));
    await flushAsyncWork();

    expect(container.querySelector('iframe')?.style.minHeight).toBe('320px');
    expect(apiMock.fetchResource).toHaveBeenCalledTimes(1);
  });

  it('refreshes a same-key resource for a newly mounted card after the shared cache expires', async () => {
    const resourceUri = `ui://cache-refresh-${++resourceSequence}`;
    const props = createProps(resourceUri);
    apiMock.fetchResource
      .mockResolvedValueOnce({
        contents: [{ uri: resourceUri, content: '<main>Initial app</main>' }],
      })
      .mockResolvedValueOnce({
        contents: [{ uri: resourceUri, content: '<main>Updated app</main>' }],
      });

    act(() => root.render(<Harness isActive props={props} />));
    await flushAsyncWork();
    expect(container.querySelector('iframe')?.srcdoc).toContain('Initial app');
    expect(apiMock.fetchResource).toHaveBeenCalledTimes(1);

    act(() => root.render(<></>));
    act(() => vi.advanceTimersByTime(5 * 60 * 1000 + 1));
    act(() => root.render(<Harness isActive props={props} />));
    await flushAsyncWork();

    expect(apiMock.fetchResource).toHaveBeenCalledTimes(2);
    expect(container.querySelector('iframe')?.srcdoc).toContain('Updated app');
  });

  it('coalesces concurrent mounts that request the same resource key', async () => {
    const resourceUri = `ui://inflight-${++resourceSequence}`;
    let resolveResource: ((value: {
      contents: Array<{ uri: string; content: string }>;
    }) => void) | null = null;
    apiMock.fetchResource.mockReturnValue(new Promise((resolve) => {
      resolveResource = resolve;
    }));

    act(() => root.render(
      <FlowChatPresentationActivityProvider isActive>
        <MCPToolDisplay {...createProps(resourceUri, 'first')} />
        <MCPToolDisplay {...createProps(resourceUri, 'second')} />
      </FlowChatPresentationActivityProvider>,
    ));
    await flushAsyncWork();
    expect(apiMock.fetchResource).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveResource?.({
        contents: [{ uri: resourceUri, content: '<main>Shared app</main>' }],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelectorAll('iframe')).toHaveLength(2);
    expect(apiMock.fetchResource).toHaveBeenCalledTimes(1);
  });

  it('unmounts the iframe and clears bridge timers/listeners, then resumes from cache', async () => {
    const resourceUri = `ui://lifecycle-${++resourceSequence}`;
    const props = createProps(resourceUri);
    apiMock.fetchResource.mockResolvedValue({
      contents: [{ uri: resourceUri, content: '<main>Lifecycle app</main>' }],
    });

    act(() => root.render(<Harness isActive props={props} />));
    await flushAsyncWork();

    const firstIframe = container.querySelector('iframe');
    expect(firstIframe).not.toBeNull();
    const firstMessageListener = addEventListenerSpy.mock.calls
      .filter(([eventName]) => eventName === 'message')
      .at(-1)?.[1];
    expect(firstMessageListener).toEqual(expect.any(Function));

    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const timerCountBeforeInitialize = vi.getTimerCount();
    dispatchIframeMessage(firstIframe!, {
      jsonrpc: '2.0',
      id: 1,
      method: 'ui/initialize',
    });
    expect(vi.getTimerCount()).toBeGreaterThan(timerCountBeforeInitialize);

    const clearCountBeforeHide = clearTimeoutSpy.mock.calls.length;
    act(() => root.render(<Harness isActive={false} props={props} />));
    expect(container.querySelector('iframe')).toBeNull();
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearCountBeforeHide);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('message', firstMessageListener);

    act(() => root.render(<Harness isActive props={props} />));
    await flushAsyncWork();
    const resumedIframe = container.querySelector('iframe');
    expect(resumedIframe).not.toBeNull();
    expect(resumedIframe).not.toBe(firstIframe);
    expect(apiMock.fetchResource).toHaveBeenCalledTimes(1);

    const resumedPostMessage = vi.spyOn(resumedIframe!.contentWindow!, 'postMessage');
    dispatchIframeMessage(resumedIframe!, {
      jsonrpc: '2.0',
      id: 11,
      method: 'ui/initialize',
    });
    act(() => vi.advanceTimersByTime(0));

    const resumedProtocolMessages = resumedPostMessage.mock.calls
      .map(([message]) => message as { id?: number; method?: string; result?: unknown });
    expect(resumedProtocolMessages).toContainEqual(expect.objectContaining({
      id: 11,
      result: expect.objectContaining({ protocolVersion: 'test-version' }),
    }));
    expect(resumedProtocolMessages).toContainEqual(expect.objectContaining({
      method: 'ui/notifications/tool-input',
    }));
    expect(resumedProtocolMessages).toContainEqual(expect.objectContaining({
      method: 'ui/notifications/tool-result',
    }));

    const timerCountBeforeUiMessage = vi.getTimerCount();
    dispatchIframeMessage(resumedIframe!, {
      jsonrpc: '2.0',
      id: 2,
      method: 'ui/message',
      params: { role: 'user', content: [{ type: 'text', text: 'Continue' }] },
    });
    expect(eventBusMock.listenerCount('mcp-app:message-response')).toBe(1);
    expect(vi.getTimerCount()).toBeGreaterThan(timerCountBeforeUiMessage);

    const messageRequest = eventBusMock.bus.emit.mock.calls
      .find(([eventName]) => eventName === 'mcp-app:message')?.[1] as { requestId?: string } | undefined;
    expect(messageRequest?.requestId).toEqual(expect.any(String));
    act(() => {
      eventBusMock.bus.emit('mcp-app:message-response', {
        requestId: messageRequest!.requestId,
        result: { content: [{ type: 'text', text: 'Accepted' }] },
      });
    });
    await flushAsyncWork();
    expect(eventBusMock.listenerCount('mcp-app:message-response')).toBe(0);
    expect(resumedPostMessage.mock.calls.map(([message]) => message)).toContainEqual(
      expect.objectContaining({
        id: 2,
        result: expect.objectContaining({
          content: [expect.objectContaining({ text: 'Accepted' })],
        }),
      }),
    );

    dispatchIframeMessage(resumedIframe!, {
      jsonrpc: '2.0',
      id: 3,
      method: 'ui/message',
      params: { role: 'user', content: [{ type: 'text', text: 'Pending' }] },
    });
    expect(eventBusMock.listenerCount('mcp-app:message-response')).toBe(1);

    const clearCountBeforeSecondHide = clearTimeoutSpy.mock.calls.length;
    act(() => root.render(<Harness isActive={false} props={props} />));
    expect(container.querySelector('iframe')).toBeNull();
    expect(eventBusMock.listenerCount('mcp-app:message-response')).toBe(0);
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearCountBeforeSecondHide);
  });
});
