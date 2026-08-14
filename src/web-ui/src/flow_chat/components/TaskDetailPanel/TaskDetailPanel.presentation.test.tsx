// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskDetailData } from './TaskDetailPanel';
import { TaskDetailPanel } from './TaskDetailPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const cancelSessionMock = vi.hoisted(() => vi.fn(async () => undefined));

const storeMock = vi.hoisted(() => {
  type StoreState = {
    sessions: Map<string, any>;
    projection: {
      session: { sessionId: string };
      turn: { id: string };
      round: { id: string };
      items: any[];
      isRunning: boolean;
    };
  };

  const listeners = new Set<(state: StoreState) => void>();
  let state: StoreState;

  const makeState = (projectionItemId: string, goalModeActive = false): StoreState => {
    const toolItem = {
      id: 'task-tool-1',
      type: 'tool',
      status: 'running',
      startTime: 1_000,
      toolCall: {
        id: 'task-call-1',
        input: { timeout_seconds: 60 },
      },
    };

    return {
      sessions: new Map([
        ['parent-session', {
          sessionId: 'parent-session',
          goalModeActive,
          dialogTurns: [{
            id: 'turn-1',
            modelRounds: [{ id: 'round-1', items: [toolItem] }],
          }],
        }],
      ]),
      projection: {
        session: { sessionId: 'subagent-session' },
        turn: { id: 'subagent-turn' },
        round: { id: 'subagent-round' },
        items: [{
          id: projectionItemId,
          type: 'text',
          content: projectionItemId,
          status: 'streaming',
          isStreaming: true,
        }],
        isRunning: true,
      },
    };
  };

  const store = {
    getState: vi.fn(() => state),
    subscribe: vi.fn((listener: (nextState: StoreState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };

  return {
    store,
    reset: (goalModeActive = false) => {
      state = makeState('projection-1', goalModeActive);
      listeners.clear();
      store.getState.mockClear();
      store.subscribe.mockClear();
    },
    setProjectionItem: (projectionItemId: string) => {
      const goalModeActive = state.sessions.get('parent-session')?.goalModeActive ?? false;
      state = makeState(projectionItemId, goalModeActive);
      listeners.forEach(listener => listener(state));
    },
    listenerCount: () => listeners.size,
  };
});

vi.mock('../../store/FlowChatStore', () => ({
  FlowChatStore: {
    getInstance: () => storeMock.store,
  },
  flowChatStore: storeMock.store,
}));

vi.mock('../../utils/subagentProjection', () => ({
  getSubagentProjectionState: (state: { projection: unknown }) => state.projection,
}));

vi.mock('../subagent/SubagentProjectionView', async () => {
  const { useFlowChatPresentationActive } = await import('../modern/FlowChatPresentationActivity');

  return {
    SubagentProjectionView: ({ items }: { items: Array<{ id: string }> }) => {
      const isActive = useFlowChatPresentationActive();
      return (
        <output
          data-testid="projection"
          data-presentation-active={String(isActive)}
        >
          {items.map(item => item.id).join(',')}
        </output>
      );
    },
  };
});

vi.mock('../../tool-cards/ToolTimeoutIndicator', () => ({
  ToolTimeoutIndicator: ({
    defaultTimeoutDisabled,
  }: {
    defaultTimeoutDisabled?: boolean;
  }) => (
    <output data-testid="timeout-default">
      {String(Boolean(defaultTimeoutDisabled))}
    </output>
  ),
}));

vi.mock('@/component-library', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button className="mock-stop-button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/component-library/components/BeautifulUI', () => ({
  BeautifulUIStage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/component-library/preview/beautiful-ui-original/components/loading-state', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
  PixelGrid: () => <span data-testid="beautiful-pixel-grid" />,
}));

vi.mock('@/infrastructure/api/service-api/AgentAPI', () => ({
  agentAPI: {
    cancelSession: cancelSessionMock,
  },
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const taskDetailData = {
  toolItem: {
    id: 'task-tool-1',
    type: 'tool',
    status: 'running',
    startTime: 1_000,
    toolCall: {
      id: 'task-call-1',
      input: { timeout_seconds: 60 },
    },
  },
  taskInput: {
    description: 'Review task',
    prompt: 'Review the change',
    agentType: 'reviewer',
  },
  sessionId: 'parent-session',
} as TaskDetailData;

describe('TaskDetailPanel presentation lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;
  let frameCallbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;

  const renderAtActivity = (isActive: boolean) => {
    act(() => {
      root.render(<TaskDetailPanel data={taskDetailData} isActive={isActive} />);
    });
  };

  const flushAnimationFrames = () => {
    act(() => {
      while (frameCallbacks.size > 0) {
        const callbacks = Array.from(frameCallbacks.values());
        frameCallbacks.clear();
        callbacks.forEach(callback => callback(0));
      }
    });
  };

  beforeEach(() => {
    storeMock.reset();
    cancelSessionMock.mockClear();
    frameCallbacks = new Map();
    nextFrameId = 1;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(frameId, callback);
      return frameId;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
      frameCallbacks.delete(frameId);
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('releases hidden work, preserves its snapshot, and rehydrates the latest store state', () => {
    const addEventListener = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const removeEventListener = vi.spyOn(HTMLElement.prototype, 'removeEventListener');

    renderAtActivity(false);
    expect(storeMock.listenerCount()).toBe(0);
    // Goal mode performs one cheap session lookup to initialize timeout UI,
    // while the expensive task projection remains deferred until activation.
    expect(storeMock.store.getState).toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(addEventListener.mock.calls.some(([type]) => type === 'wheel')).toBe(false);

    renderAtActivity(true);
    expect(storeMock.listenerCount()).toBe(1);
    expect(container.querySelector('[data-testid="projection"]')).toBeNull();
    expect(frameCallbacks.size).toBeGreaterThan(0);
    flushAnimationFrames();
    expect(storeMock.listenerCount()).toBe(2);
    expect(container.querySelector('[data-testid="projection"]')?.textContent).toBe('projection-1');
    expect(container.querySelector('[data-testid="projection"]')?.getAttribute('data-presentation-active')).toBe('true');
    expect(addEventListener.mock.calls.some(([type]) => type === 'wheel')).toBe(true);

    act(() => storeMock.setProjectionItem('projection-2'));
    expect(frameCallbacks.size).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="projection"]')?.textContent).toBe('projection-1');

    renderAtActivity(false);
    expect(storeMock.listenerCount()).toBe(0);
    expect(frameCallbacks.size).toBe(0);
    expect(container.querySelector('[data-testid="projection"]')?.textContent).toBe('projection-1');
    expect(container.querySelector('[data-testid="projection"]')?.getAttribute('data-presentation-active')).toBe('false');
    expect(removeEventListener.mock.calls.some(([type]) => type === 'wheel')).toBe(true);

    storeMock.store.getState.mockClear();
    act(() => storeMock.setProjectionItem('projection-3'));
    expect(frameCallbacks.size).toBe(0);
    expect(storeMock.store.getState).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="projection"]')?.textContent).toBe('projection-1');

    renderAtActivity(true);
    expect(storeMock.listenerCount()).toBe(1);
    expect(container.querySelector('[data-testid="projection"]')?.textContent).toBe('projection-1');
    flushAnimationFrames();
    expect(storeMock.listenerCount()).toBe(2);
    expect(container.querySelector('[data-testid="projection"]')?.textContent).toBe('projection-3');
    expect(container.querySelector('[data-testid="projection"]')?.getAttribute('data-presentation-active')).toBe('true');

    renderAtActivity(false);
    expect(storeMock.listenerCount()).toBe(0);
    expect(frameCallbacks.size).toBe(0);
    expect(cancelSessionMock).not.toHaveBeenCalled();

    act(() => root.unmount());
    expect(cancelSessionMock).not.toHaveBeenCalled();
    root = createRoot(container);

    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });

  it('initializes the hidden timeout default from an existing goal-mode session', () => {
    storeMock.reset(true);

    renderAtActivity(false);

    expect(storeMock.listenerCount()).toBe(0);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="timeout-default"]')?.textContent).toBe('true');
  });

  it('calls cancelSession only after the explicit stop button is clicked', async () => {
    renderAtActivity(true);
    flushAnimationFrames();

    const stopButton = container.querySelector<HTMLButtonElement>('.mock-stop-button');
    expect(stopButton).toBeTruthy();
    expect(cancelSessionMock).not.toHaveBeenCalled();

    await act(async () => {
      stopButton!.click();
      await Promise.resolve();
    });

    expect(cancelSessionMock).toHaveBeenCalledTimes(1);
    expect(cancelSessionMock).toHaveBeenCalledWith('subagent-session');
  });
});
