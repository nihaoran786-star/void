// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { ModernFlowChatContainer } from './ModernFlowChatContainer';
import type { DialogTurn, Session } from '../../types/flow-chat';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const stateMocks = vi.hoisted(() => ({
  activeSession: null as Session | null,
  virtualItems: [] as unknown[],
  visibleTurnInfo: null as unknown,
}));

const switchChatSessionMock = vi.hoisted(() => vi.fn());
const virtualListMock = vi.hoisted(() => ({
  pinTurnToTop: vi.fn(),
  scrollToTurn: vi.fn(),
  scrollToIndex: vi.fn(),
  scrollToPhysicalBottomAndClearPin: vi.fn(),
  scrollToLatestEndPosition: vi.fn(),
  latestProps: null as { onUserScrollIntent?: () => void } | null,
}));
const headerMock = vi.hoisted(() => ({
  latestProps: null as {
    currentTurn: number;
    totalTurns: number;
    turns: Array<{ turnId: string; turnIndex: number; title: string }>;
    onJumpToTurn?: (turnId: string) => void;
  } | null,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'historyState.loadingTitle': 'Loading saved session',
        'historyState.loadingDescription': 'Preparing the conversation history.',
        'historyState.failedTitle': 'Session history did not load',
        'historyState.failedDescription': 'Retry loading the saved conversation.',
        'historyState.retry': 'Retry',
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('@/infrastructure/hooks/useShortcut', () => ({
  useShortcut: vi.fn(),
}));

vi.mock('@/flow_chat/services/FlowChatManager', () => ({
  FlowChatManager: {
    getInstance: () => ({
      cancelCurrentTask: vi.fn(),
      createChatSession: vi.fn(),
      switchChatSession: switchChatSessionMock,
    }),
  },
}));

vi.mock('@/app/stores/sessionModeStore', () => ({
  useSessionModeStore: {
    getState: () => ({
      setMode: vi.fn(),
    }),
  },
}));

vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    workspacePath: 'D:/workspace/void',
  }),
}));

vi.mock('../../utils/acpSession', () => ({
  isAcpFlowSession: () => false,
}));

vi.mock('../../store/modernFlowChatStore', () => ({
  useVirtualItems: () => stateMocks.virtualItems,
  useActiveSession: () => stateMocks.activeSession,
  useVisibleTurnInfo: () => stateMocks.visibleTurnInfo,
}));

vi.mock('./VirtualMessageList', () => ({
  VirtualMessageList: React.forwardRef((props: { onUserScrollIntent?: () => void }, ref) => {
    virtualListMock.latestProps = props;
    React.useImperativeHandle(ref, () => ({
      pinTurnToTop: virtualListMock.pinTurnToTop,
      scrollToTurn: virtualListMock.scrollToTurn,
      scrollToIndex: virtualListMock.scrollToIndex,
      scrollToPhysicalBottomAndClearPin: virtualListMock.scrollToPhysicalBottomAndClearPin,
      scrollToLatestEndPosition: virtualListMock.scrollToLatestEndPosition,
    }));
    return <div data-testid="virtual-list" />;
  }),
}));

vi.mock('./FlowChatHeader', () => ({
  FlowChatHeader: (props: {
    currentTurn: number;
    totalTurns: number;
    turns: Array<{ turnId: string; turnIndex: number; title: string }>;
    onJumpToTurn?: (turnId: string) => void;
  }) => {
    headerMock.latestProps = props;
    return (
      <div data-testid="flowchat-header">
        <span data-testid="header-current-turn">{props.currentTurn}</span>
        {props.turns.map(turn => (
          <button
            key={turn.turnId}
            data-testid={`jump-${turn.turnId}`}
            type="button"
            onClick={() => props.onJumpToTurn?.(turn.turnId)}
          >
            {turn.title}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock('../WelcomePanel', () => ({
  WelcomePanel: () => <div data-testid="welcome-panel">Welcome panel</div>,
}));

vi.mock('./useExploreGroupState', () => ({
  useExploreGroupState: () => ({
    exploreGroupStates: {},
    onExploreGroupToggle: vi.fn(),
    onExpandGroup: vi.fn(),
    onExpandAllInTurn: vi.fn(),
    onCollapseGroup: vi.fn(),
  }),
}));

vi.mock('./useFlowChatFileActions', () => ({
  useFlowChatFileActions: () => ({
    handleFileViewRequest: vi.fn(),
  }),
}));

vi.mock('./useFlowChatNavigation', () => ({
  useFlowChatNavigation: vi.fn(),
}));

vi.mock('./useFlowChatCopyDialog', () => ({
  useFlowChatCopyDialog: vi.fn(),
}));

vi.mock('./useFlowChatSync', () => ({
  useFlowChatSync: vi.fn(),
}));

vi.mock('./useFlowChatToolActions', () => ({
  useFlowChatToolActions: () => ({
    handleToolConfirm: vi.fn(),
    handleToolReject: vi.fn(),
  }),
}));

vi.mock('./useFlowChatSearch', () => ({
  useFlowChatSearch: () => ({
    searchQuery: '',
    onSearchChange: vi.fn(),
    matches: [],
    matchIndices: [],
    currentMatchIndex: -1,
    currentMatchVirtualIndex: -1,
    goToNext: vi.fn(),
    goToPrev: vi.fn(),
    clearSearch: vi.fn(),
  }),
}));

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'session-1',
    title: 'Saved session',
    dialogTurns: [],
    status: 'idle',
    config: { agentType: 'agentic' },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    isHistorical: true,
    todos: [],
    mode: 'agentic',
    workspacePath: 'D:/workspace/void',
    sessionKind: 'normal',
    ...overrides,
  };
}

function createTurn(id: string, content: string): DialogTurn {
  return {
    id,
    userMessage: {
      id: `${id}-user`,
      content,
      timestamp: 1,
      metadata: {},
    },
    modelRounds: [],
    status: 'completed',
  };
}

function renderActiveFlowChat(root: Root) {
  act(() => {
    root.render(<ModernFlowChatContainer />);
  });
}

function flushOneAnimationFrame() {
  act(() => {
    vi.runOnlyPendingTimers();
  });
}

describe('ModernFlowChatContainer historical empty state', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(performance.now()), 0)
    ));
    vi.stubGlobal('cancelAnimationFrame', (frameId: number) => {
      window.clearTimeout(frameId);
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    stateMocks.virtualItems = [];
    stateMocks.visibleTurnInfo = null;
    switchChatSessionMock.mockReset();
    virtualListMock.pinTurnToTop.mockReset();
    virtualListMock.scrollToTurn.mockReset();
    virtualListMock.scrollToIndex.mockReset();
    virtualListMock.scrollToPhysicalBottomAndClearPin.mockReset();
    virtualListMock.scrollToLatestEndPosition.mockReset();
    virtualListMock.latestProps = null;
    headerMock.latestProps = null;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    stateMocks.activeSession = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows a history loading shell for metadata-only sessions instead of the new-session welcome', () => {
    stateMocks.activeSession = createSession({ historyState: 'metadata-only' } as Partial<Session>);

    act(() => {
      root.render(<ModernFlowChatContainer />);
    });

    expect(container.textContent).toContain('Loading saved session');
    expect(container.querySelector('[data-testid="welcome-panel"]')).toBeNull();
  });

  it('keeps the loading shell while historical sessions are hydrating', () => {
    stateMocks.activeSession = createSession({ historyState: 'hydrating' } as Partial<Session>);

    act(() => {
      root.render(<ModernFlowChatContainer />);
    });

    expect(container.textContent).toContain('Loading saved session');
    expect(container.querySelector('[data-testid="welcome-panel"]')).toBeNull();
  });

  it('keeps the new-session welcome for genuinely new empty sessions', () => {
    stateMocks.activeSession = createSession({
      isHistorical: false,
      historyState: 'new',
    } as Partial<Session>);

    act(() => {
      root.render(<ModernFlowChatContainer />);
    });

    expect(container.querySelector('[data-testid="welcome-panel"]')).not.toBeNull();
  });

  it('shows retry for failed history loads', () => {
    stateMocks.activeSession = createSession({ historyState: 'failed' } as Partial<Session>);

    act(() => {
      root.render(<ModernFlowChatContainer />);
    });

    const retryButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Retry'));
    expect(container.textContent).toContain('Session history did not load');
    expect(retryButton).toBeTruthy();

    act(() => {
      retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(switchChatSessionMock).toHaveBeenCalledWith('session-1');
  });

  it('uses session open intent diagnostics for unsupported history scope', () => {
    stateMocks.activeSession = createSession({
      isHistorical: true,
      historyState: 'metadata-only',
      workspacePath: '',
    } as Partial<Session>);

    act(() => {
      root.render(<ModernFlowChatContainer />);
    });

    expect(container.textContent).toContain('Session history did not load');
    expect(container.querySelector('[data-testid="welcome-panel"]')).toBeNull();
  });

  it('keeps the header current turn tied to the visible turn while a header jump is pending', () => {
    stateMocks.activeSession = createSession({
      dialogTurns: [
        createTurn('turn-1', 'Older request'),
        createTurn('turn-2', 'Middle request'),
        createTurn('turn-3', 'Latest request'),
      ],
    } as Partial<Session>);
    stateMocks.virtualItems = [{}];
    stateMocks.visibleTurnInfo = {
      turnId: 'turn-3',
      turnIndex: 3,
      totalTurns: 3,
      userMessage: 'Latest request',
    };
    virtualListMock.pinTurnToTop.mockReturnValue(true);

    renderActiveFlowChat(root);
    flushOneAnimationFrame();
    virtualListMock.pinTurnToTop.mockClear();

    expect(container.querySelector('[data-testid="header-current-turn"]')?.textContent).toBe('3');

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="jump-turn-1"]')?.click();
    });

    expect(virtualListMock.pinTurnToTop).toHaveBeenCalledWith('turn-1', {
      behavior: 'smooth',
      pinMode: 'transient',
    });
    expect(container.querySelector('[data-testid="header-current-turn"]')?.textContent).toBe('3');

    stateMocks.visibleTurnInfo = {
      turnId: 'turn-1',
      turnIndex: 1,
      totalTurns: 3,
      userMessage: 'Older request',
    };
    renderActiveFlowChat(root);

    expect(container.querySelector('[data-testid="header-current-turn"]')?.textContent).toBe('1');
  });

  it('retries an accepted header turn pin until the target turn becomes visible', () => {
    stateMocks.activeSession = createSession({
      dialogTurns: [
        createTurn('turn-1', 'Older request'),
        createTurn('turn-2', 'Middle request'),
        createTurn('turn-3', 'Latest request'),
      ],
    } as Partial<Session>);
    stateMocks.virtualItems = [{}];
    stateMocks.visibleTurnInfo = {
      turnId: 'turn-3',
      turnIndex: 3,
      totalTurns: 3,
      userMessage: 'Latest request',
    };
    virtualListMock.pinTurnToTop.mockReturnValue(true);

    renderActiveFlowChat(root);
    flushOneAnimationFrame();
    virtualListMock.pinTurnToTop.mockClear();

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="jump-turn-1"]')?.click();
    });

    expect(virtualListMock.pinTurnToTop).toHaveBeenCalledTimes(1);

    flushOneAnimationFrame();

    expect(virtualListMock.pinTurnToTop).toHaveBeenCalledTimes(2);
    expect(virtualListMock.pinTurnToTop).toHaveBeenLastCalledWith('turn-1', {
      behavior: 'auto',
      pinMode: 'transient',
    });

    stateMocks.visibleTurnInfo = {
      turnId: 'turn-1',
      turnIndex: 1,
      totalTurns: 3,
      userMessage: 'Older request',
    };
    renderActiveFlowChat(root);
    flushOneAnimationFrame();

    expect(virtualListMock.pinTurnToTop).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending header turn pin retry when the user scrolls the message list', () => {
    stateMocks.activeSession = createSession({
      dialogTurns: [
        createTurn('turn-1', 'Older request'),
        createTurn('turn-2', 'Middle request'),
        createTurn('turn-3', 'Latest request'),
      ],
    } as Partial<Session>);
    stateMocks.virtualItems = [{}];
    stateMocks.visibleTurnInfo = {
      turnId: 'turn-3',
      turnIndex: 3,
      totalTurns: 3,
      userMessage: 'Latest request',
    };
    virtualListMock.pinTurnToTop.mockReturnValue(true);

    renderActiveFlowChat(root);
    flushOneAnimationFrame();
    virtualListMock.pinTurnToTop.mockClear();

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="jump-turn-1"]')?.click();
    });

    expect(virtualListMock.pinTurnToTop).toHaveBeenCalledTimes(1);
    expect(virtualListMock.latestProps?.onUserScrollIntent).toEqual(expect.any(Function));

    act(() => {
      virtualListMock.latestProps?.onUserScrollIntent?.();
    });
    flushOneAnimationFrame();

    expect(virtualListMock.pinTurnToTop).toHaveBeenCalledTimes(1);
  });
});
