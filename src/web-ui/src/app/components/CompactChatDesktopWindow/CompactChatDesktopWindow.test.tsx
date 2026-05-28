// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { CompactChatDesktopWindow } from './CompactChatDesktopWindow';
import type { CompactChatPresentation } from '@/flow_chat/services/CompactChatPresentationBridge';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const bridgeMock = vi.hoisted(() => ({
  listenCompactChatPresentation: vi.fn(),
  requestCompactChatCancelTask: vi.fn(),
  requestCompactChatPresentation: vi.fn(),
  sendCompactChatMessage: vi.fn(),
}));

const windowServiceMock = vi.hoisted(() => ({
  closeCompactChatFloatingWindow: vi.fn(),
  resizeCompactChatFloatingWindow: vi.fn(),
  startCompactChatFloatingWindowDrag: vi.fn(),
}));

vi.mock('@/component-library', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement> & { inputSize?: string; variant?: string }) => {
    const { inputSize: _inputSize, variant: _variant, ...rest } = props;
    return <input {...rest} />;
  },
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/flow_chat/services/CompactChatPresentationBridge', () => bridgeMock);
vi.mock('@/infrastructure/config/services/CompactChatWindowService', () => windowServiceMock);
vi.mock('@/flow_chat/components/FlowTextBlock', () => ({
  FlowTextBlock: ({ textItem }: { textItem: { content: string } }) => (
    <div data-testid="compact-flow-text">{textItem.content}</div>
  ),
}));
vi.mock('@/flow_chat/components/FlowToolCard', () => ({
  FlowToolCard: ({ toolItem, sessionId }: { toolItem: { status?: string; toolName: string }; sessionId?: string }) => (
    <div data-session-id={sessionId} data-testid="compact-flow-tool-card">
      {toolItem.toolName}:{toolItem.status}
    </div>
  ),
}));
vi.mock('@/flow_chat/tool-cards/ModelThinkingDisplay', () => ({
  ModelThinkingDisplay: ({ thinkingItem }: { thinkingItem: { content: string } }) => (
    <div data-testid="compact-flow-thinking">{thinkingItem.content}</div>
  ),
}));
vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => undefined,
  },
  useTranslation: () => ({ t: (key: string) => key }),
}));

function createReadyPresentation(
  overrides: Partial<Extract<CompactChatPresentation, { status: 'ready' }>['activeSession']> = {},
): CompactChatPresentation {
  return {
    status: 'ready',
    activeSession: {
      sessionId: 'session-1',
      title: 'Active chat',
      dialogTurns: [{
        id: 'turn-1',
        sessionId: 'session-1',
        userMessage: {
          id: 'user-1',
          type: 'user',
          content: 'Current session question',
          timestamp: 1,
        },
        modelRounds: [{
          id: 'round-1',
          turnId: 'turn-1',
          index: 0,
          items: [{
            id: 'text-1',
            type: 'text',
            content: 'Current session answer',
            timestamp: 2,
            status: 'completed',
          }],
          isStreaming: false,
          isComplete: true,
          status: 'completed',
          timestamp: 2,
        }],
        timestamp: 1,
        status: 'completed',
      }],
      status: 'idle',
      config: { agentType: 'agentic' },
      createdAt: 1,
      lastActiveAt: 1,
      error: null,
      historyState: 'new',
      mode: 'agentic',
      sessionKind: 'normal',
      ...overrides,
    },
  } as CompactChatPresentation;
}

describe('CompactChatDesktopWindow', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    bridgeMock.listenCompactChatPresentation.mockImplementation((handler: (presentation: CompactChatPresentation) => void) => {
      handler(createReadyPresentation());
      return Promise.resolve(() => undefined);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    bridgeMock.listenCompactChatPresentation.mockReset();
    bridgeMock.requestCompactChatCancelTask.mockReset();
    bridgeMock.requestCompactChatPresentation.mockReset();
    bridgeMock.sendCompactChatMessage.mockReset();
    windowServiceMock.closeCompactChatFloatingWindow.mockReset();
    windowServiceMock.resizeCompactChatFloatingWindow.mockReset();
    windowServiceMock.startCompactChatFloatingWindowDrag.mockReset();
  });

  it('renders the active session presentation without mounting the full modern chat container', () => {
    act(() => {
      root.render(<CompactChatDesktopWindow />);
    });

    expect(container.textContent).toContain('Current session question');
    expect(container.textContent).toContain('Current session answer');
    expect(container.querySelector('[data-testid="modern-flow-chat"]')).toBeNull();
    expect(container.querySelector('[data-testid="app-layout"]')).toBeNull();
    expect(container.textContent).not.toContain('BrowserPanel');
  });

  it('renders assistant text, thinking, and tool items through shared flow components', () => {
    bridgeMock.listenCompactChatPresentation.mockImplementation((handler: (presentation: CompactChatPresentation) => void) => {
      handler(createReadyPresentation({
        dialogTurns: [{
          id: 'turn-with-items',
          sessionId: 'session-1',
          userMessage: {
            id: 'user-with-items',
            type: 'user',
            content: 'Run a command',
            timestamp: 1,
          },
          modelRounds: [{
            id: 'round-with-items',
            turnId: 'turn-with-items',
            index: 0,
            items: [
              {
                id: 'text-item',
                type: 'text',
                content: 'I will inspect the workspace.',
                isStreaming: false,
                status: 'completed',
                timestamp: 2,
              },
              {
                id: 'thinking-item',
                type: 'thinking',
                content: 'Need to check project scripts.',
                isStreaming: false,
                isCollapsed: false,
                status: 'completed',
                timestamp: 3,
              },
              {
                id: 'tool-item',
                type: 'tool',
                toolName: 'Shell',
                toolCall: {
                  id: 'tool-call-1',
                  input: { command: 'pnpm test' },
                },
                toolResult: {
                  result: 'ok',
                  success: true,
                },
                status: 'completed',
                timestamp: 4,
              },
            ],
            isStreaming: false,
            isComplete: true,
            status: 'completed',
            startTime: 2,
          }],
          startTime: 1,
          status: 'completed',
        }],
      }));
      return Promise.resolve(() => undefined);
    });

    act(() => {
      root.render(<CompactChatDesktopWindow />);
    });

    expect(container.querySelector('[data-testid="compact-flow-text"]')?.textContent).toContain('I will inspect the workspace.');
    expect(container.querySelector('[data-testid="compact-flow-thinking"]')?.textContent).toContain('Need to check project scripts.');
    expect(container.querySelector('[data-testid="compact-flow-tool-card"]')?.textContent).toContain('Shell:completed');
    expect(container.querySelector('[data-testid="compact-flow-tool-card"]')?.getAttribute('data-session-id')).toBe('session-1');
  });

  it('shows unavailable state when there is no active session presentation', () => {
    bridgeMock.listenCompactChatPresentation.mockImplementation((handler: (presentation: CompactChatPresentation) => void) => {
      handler({ status: 'unavailable', reason: 'no-active-session' });
      return Promise.resolve(() => undefined);
    });

    act(() => {
      root.render(<CompactChatDesktopWindow />);
    });

    expect(container.textContent).toContain('compactChat.unavailable.title');
    expect(container.textContent).not.toContain('Current session question');
  });

  it('ignores stale unavailable presentation events after a newer active session event', async () => {
    let presentationHandler: ((presentation: CompactChatPresentation) => void) | null = null;
    bridgeMock.listenCompactChatPresentation.mockImplementation((handler: (presentation: CompactChatPresentation) => void) => {
      presentationHandler = handler;
      return Promise.resolve(() => undefined);
    });

    await act(async () => {
      root.render(<CompactChatDesktopWindow />);
      await Promise.resolve();
    });

    expect(presentationHandler).toBeTypeOf('function');

    await act(async () => {
      presentationHandler({
        ...createReadyPresentation(),
        sequence: 2,
        emittedAt: 200,
      } as CompactChatPresentation);
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Current session question');

    await act(async () => {
      presentationHandler({
        status: 'unavailable',
        reason: 'no-active-session',
        sequence: 1,
        emittedAt: 100,
      } as CompactChatPresentation);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Current session question');
    expect(container.textContent).not.toContain('compactChat.unavailable.title');
  });

  it('starts native dragging from the drag bar press', () => {
    act(() => {
      root.render(<CompactChatDesktopWindow />);
    });

    const dragBar = container.querySelector('.void-compact-chat-window__drag-bar') as HTMLElement;
    expect(dragBar.hasAttribute('data-tauri-drag-region')).toBe(false);
    act(() => {
      dragBar.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 1,
        clientX: 10,
        clientY: 10,
      }));
    });

    expect(windowServiceMock.startCompactChatFloatingWindowDrag).toHaveBeenCalledTimes(1);
  });

  it('closes from the header button without starting window drag', () => {
    act(() => {
      root.render(<CompactChatDesktopWindow />);
    });

    const closeButton = container.querySelector('.void-compact-chat-window__icon-button') as HTMLElement;
    act(() => {
      closeButton.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 1,
        clientX: 10,
        clientY: 10,
      }));
      closeButton.click();
    });

    expect(windowServiceMock.startCompactChatFloatingWindowDrag).not.toHaveBeenCalled();
    expect(windowServiceMock.closeCompactChatFloatingWindow).toHaveBeenCalledTimes(1);
  });

  it('sends stop requests through the compact chat bridge instead of a local DOM event', () => {
    bridgeMock.listenCompactChatPresentation.mockImplementation((handler: (presentation: CompactChatPresentation) => void) => {
      handler(createReadyPresentation({
        dialogTurns: [{
          id: 'processing-turn',
          sessionId: 'session-1',
          userMessage: {
            id: 'processing-user',
            type: 'user',
            content: 'Keep working',
            timestamp: 1,
          },
          modelRounds: [],
          startTime: 1,
          status: 'processing',
        }],
      }));
      return Promise.resolve(() => undefined);
    });
    const localCancelListener = vi.fn();
    window.addEventListener('toolbar-cancel-task', localCancelListener);

    try {
      act(() => {
        root.render(<CompactChatDesktopWindow />);
      });

      const stopButton = container.querySelector('.void-compact-chat-window__send-button--stop') as HTMLButtonElement;
      act(() => {
        stopButton.click();
      });

      expect(bridgeMock.requestCompactChatCancelTask).toHaveBeenCalledWith('session-1');
      expect(localCancelListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('toolbar-cancel-task', localCancelListener);
    }
  });

  it('does not start dragging when pressing the close button', () => {
    act(() => {
      root.render(<CompactChatDesktopWindow />);
    });

    const closeButton = container.querySelector('.void-compact-chat-window__icon-button') as HTMLElement;
    act(() => {
      closeButton.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 1,
        clientX: 10,
        clientY: 10,
      }));
    });

    expect(windowServiceMock.startCompactChatFloatingWindowDrag).not.toHaveBeenCalled();
  });
});
