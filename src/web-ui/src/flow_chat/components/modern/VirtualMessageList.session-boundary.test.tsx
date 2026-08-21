// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualMessageList } from './VirtualMessageList';
import type { Session } from '../../types/flow-chat';
import type { VirtualItem } from '../../store/modernFlowChatStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const stateMocks = vi.hoisted(() => ({
  activeSession: null as Session | null,
  virtualItems: [] as VirtualItem[],
  visibleTurnInfo: null as unknown,
  setVisibleTurnInfo: vi.fn(),
}));

let animationFrameCallbacks: FrameRequestCallback[] = [];

vi.mock('react-virtuoso', () => ({
  Virtuoso: React.forwardRef((props: any, ref) => {
    const scrollerRef = React.useRef<HTMLDivElement | null>(null);
    React.useImperativeHandle(ref, () => ({
      scrollTo: vi.fn(),
      scrollToIndex: vi.fn(),
    }));

    React.useLayoutEffect(() => {
      if (!scrollerRef.current) {
        return;
      }
      props.scrollerRef?.(scrollerRef.current);
      return () => {
        props.scrollerRef?.(null);
      };
    }, [props]);

    React.useEffect(() => {
      if (props.data?.[0]?.turnId === 'turn-a') {
        props.atBottomStateChange?.(false);
      }
    }, [props]);

    return (
      <div ref={scrollerRef} data-testid="virtuoso" data-session-id={stateMocks.activeSession?.sessionId ?? ''}>
        {props.data?.map((item: VirtualItem, index: number) => {
          const itemKey = props.computeItemKey?.(index, item) ?? item.turnId;
          return (
            <div key={itemKey} data-item-key={itemKey}>
              {props.itemContent?.(index, item)}
            </div>
          );
        })}
        {props.components?.Footer ? <props.components.Footer context={props.context} /> : null}
      </div>
    );
  }),
}));

vi.mock('../../store/modernFlowChatStore', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const useModernFlowChatStore = (selector: (state: any) => unknown) => selector({
    visibleTurnInfo: stateMocks.visibleTurnInfo,
  });
  useModernFlowChatStore.getState = () => ({
    visibleTurnInfo: stateMocks.visibleTurnInfo,
    setVisibleTurnInfo: stateMocks.setVisibleTurnInfo,
  });

  return {
    ...actual,
    useActiveSession: () => stateMocks.activeSession,
    useVirtualItems: () => stateMocks.virtualItems,
    useModernFlowChatStore,
  };
});

vi.mock('./useFlowChatPresentationStore', () => ({
  usePresentationActiveSession: () => stateMocks.activeSession,
  usePresentationVirtualItems: () => stateMocks.virtualItems,
  usePresentationVisibleTurnInfo: () => stateMocks.visibleTurnInfo,
}));

vi.mock('./useFlowChatPresentationSessionState', () => ({
  useFlowChatPresentationSessionState: () => ({
    isProcessing: false,
    processingPhase: null,
  }),
}));

vi.mock('./useFlowChatPresentationChatInputState', () => ({
  useFlowChatPresentationChatInputState: () => ({
    isActive: false,
    isExpanded: false,
    inputHeight: 0,
  }),
}));

vi.mock('./VirtualItemRenderer', () => ({
  VirtualItemRenderer: ({ item, index }: { item: VirtualItem; index: number }) => (
    <div className="virtual-item-wrapper" data-turn-id={item.turnId} data-virtual-index={index} data-item-type={item.type}>
      {item.turnId}
    </div>
  ),
}));

vi.mock('../ScrollToLatestBar', () => ({
  ScrollToLatestBar: ({ visible }: { visible: boolean }) => (
    <div data-testid="scroll-to-latest" data-visible={visible ? 'true' : 'false'} />
  ),
}));

vi.mock('../ScrollToTurnHeaderButton', () => ({
  ScrollToTurnHeaderButton: () => null,
}));

vi.mock('../../hooks/useScrollToTurnHeader', () => ({
  useScrollToTurnHeader: () => ({
    shouldShowButton: false,
    handleClick: vi.fn(),
  }),
}));

vi.mock('../../hooks/useVisibleTaskInfo', () => ({
  useVisibleTaskInfo: () => ({
    visibleTaskInfo: null,
    scrollToTask: vi.fn(),
  }),
}));

vi.mock('../StickyTaskIndicator', () => ({
  StickyTaskIndicator: () => null,
}));

vi.mock('./ProcessingIndicator', () => ({
  ProcessingIndicator: () => null,
  ProcessingIndicatorSpacer: () => null,
}));

vi.mock('./processingIndicatorVisibility', () => ({
  shouldReserveProcessingIndicatorSpace: () => false,
  shouldShowProcessingIndicator: () => false,
  readProcessingIndicatorMessageKey: () => null,
}));

vi.mock('./ScrollAnchor', () => ({
  ScrollAnchor: () => null,
}));

vi.mock('./useFlowChatFollowOutput', () => ({
  useFlowChatFollowOutput: () => ({
    isFollowingOutput: false,
    isReaderControlled: false,
    isReaderControlledNow: () => false,
    enterFollowOutput: vi.fn(),
    exitFollowOutput: vi.fn(),
    armFollowOutputForNewTurn: vi.fn(),
    activateArmedFollowOutput: vi.fn(() => false),
    cancelPendingAutoFollowArm: vi.fn(),
    scheduleFollowToLatest: vi.fn(),
    handleUserScrollIntent: vi.fn(),
    handleScroll: vi.fn(),
  }),
}));

const virtualMessageListSource = readFileSync(
  join(process.cwd(), 'src/flow_chat/components/modern/VirtualMessageList.tsx'),
  'utf8',
);

describe('VirtualMessageList session boundary source contract', () => {
  it('remounts the Virtuoso viewport when the active session changes', () => {
    expect(virtualMessageListSource).toContain('const virtualListSessionKey = activeSessionId ??');
    expect(virtualMessageListSource).toContain('key={virtualListSessionKey}');
  });

  it('resets viewport-local state at the active session boundary', () => {
    expect(virtualMessageListSource).toContain('resetViewportStateForSessionBoundary');
    expect(virtualMessageListSource).toContain('setIsAtBottom(true)');
    expect(virtualMessageListSource).toContain('setPendingTurnPin(null)');
    expect(virtualMessageListSource).toContain('createInitialBottomReservationState()');
    expect(virtualMessageListSource).toContain('previousMeasuredHeightRef.current = null');
    expect(virtualMessageListSource).toContain('previousScrollTopRef.current = 0');
    expect(virtualMessageListSource).toContain('hasPrimedMountedStreamingTurnFollowRef.current = false');
    expect(virtualMessageListSource).toContain('latestTurnAutoFollowStateRef.current = {');
    expect(virtualMessageListSource).toContain('React.useLayoutEffect(() =>');
  });

  it('routes every programmatic scroll through the reader-control gate', () => {
    // Section D of FLOWCHAT_SCROLL_STABILITY.md. Any new path that writes
    // scrollTop while the reader is scrolling brings back the teleport-and-
    // flicker, so the choke points are pinned here.
    expect(virtualMessageListSource).toContain('const canScrollProgrammatically = useCallback(');
    expect(virtualMessageListSource).toContain("if (!canScrollProgrammatically()) {");
    expect(virtualMessageListSource).toContain('if (isReaderControlledNowRef.current()) {');
    expect(virtualMessageListSource).toContain('restoreReaderAnchor();');
    expect(virtualMessageListSource).toContain('captureReaderAnchor();');
    expect(virtualMessageListSource).toContain('setReaderControlledGate(isReaderControlled)');

    // A stale anchor target must never be merged forward.
    expect(virtualMessageListSource).not.toContain('Math.max(anchorLockRef.current.targetScrollTop');
  });

  it('keeps the history window UI gate clear of high-risk migration surfaces', () => {
    expect(virtualMessageListSource).toContain('selectInitialHistoryRenderWindow');
    expect(virtualMessageListSource).toContain('virtual-message-list__static-scroller');
    expect(virtualMessageListSource).toContain('activeSessionHistoryProjectionHandoff');
    expect(virtualMessageListSource).toContain('selectSessionOpenHistoryProjectionHandoff');
    expect(virtualMessageListSource).toContain('data-history-projection-handoff-overlay="true"');
    expect(virtualMessageListSource).not.toContain('firstItemIndex=');
    expect(virtualMessageListSource).not.toContain('heightEstimates=');
  });
});

function createSession(sessionId: string, turnIds: string[] | string, options?: {
  historyState?: Session['historyState'];
  isHistorical?: boolean;
  isPartial?: boolean;
}): Session {
  const resolvedTurnIds = Array.isArray(turnIds) ? turnIds : [turnIds];

  return {
    sessionId,
    title: sessionId,
    dialogTurns: resolvedTurnIds.map((turnId, index) => ({
      id: turnId,
      sessionId,
      userMessage: { id: `user-${turnId}`, content: turnId, timestamp: index + 1 },
      modelRounds: [],
      status: 'completed',
      startTime: index + 1,
    })),
    status: 'idle',
    config: { agentType: 'agentic' },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    isHistorical: options?.isHistorical ?? false,
    isPartial: options?.isPartial,
    historyState: options?.historyState,
    todos: [],
    mode: 'agentic',
    sessionKind: 'normal',
  } as Session;
}

function createItem(turnId: string): VirtualItem {
  return {
    type: 'user-message',
    turnId,
    data: {
      id: `user-${turnId}`,
      content: turnId,
      timestamp: 1,
    },
  } as VirtualItem;
}

describe('VirtualMessageList session boundary behavior', () => {
  let container: HTMLDivElement;
  let root: Root;

    beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
    animationFrameCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    stateMocks.activeSession = null;
    stateMocks.virtualItems = [];
    stateMocks.visibleTurnInfo = null;
    stateMocks.setVisibleTurnInfo.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('scopes rendered item keys by active session and stable item identity', () => {
    stateMocks.activeSession = createSession('session-a', 'turn-a');
    stateMocks.virtualItems = [createItem('turn-a')];

    act(() => {
      root.render(<VirtualMessageList />);
    });

    const readItemKeys = () => Array.from(
      container.querySelectorAll('[data-testid="virtuoso"] [data-item-key]'),
    ).map(node => node.getAttribute('data-item-key'));

    expect(readItemKeys()).toEqual(['session-a:user-message:turn-a:user-turn-a']);

    stateMocks.activeSession = createSession('session-b', 'turn-a');
    stateMocks.virtualItems = [createItem('turn-a')];

    act(() => {
      root.render(<VirtualMessageList />);
    });

    // The same turn id under a different session must not reuse the key, so the
    // previous session's rendered item cannot survive the boundary.
    expect(readItemKeys()).toEqual(['session-b:user-message:turn-a:user-turn-a']);
  });

  it('keeps the same item key across streaming updates of the same session', () => {
    stateMocks.activeSession = createSession('session-a', 'turn-a');
    stateMocks.virtualItems = [createItem('turn-a')];

    act(() => {
      root.render(<VirtualMessageList />);
    });

    const firstNode = container.querySelector('[data-testid="virtuoso"] [data-item-key]');

    // A new session object with an equivalent turn is what every streamed flush
    // produces; the item must not remount.
    stateMocks.activeSession = createSession('session-a', 'turn-a');
    stateMocks.virtualItems = [createItem('turn-a')];

    act(() => {
      root.render(<VirtualMessageList />);
    });

    expect(container.querySelector('[data-testid="virtuoso"] [data-item-key]')).toBe(firstNode);
  });

  it('does not carry stale at-bottom UI state across active sessions', () => {
    stateMocks.activeSession = createSession('session-a', 'turn-a');
    stateMocks.virtualItems = [createItem('turn-a')];

    act(() => {
      root.render(<VirtualMessageList />);
    });

    expect(container.querySelector('[data-testid="scroll-to-latest"]')?.getAttribute('data-visible')).toBe('true');

    stateMocks.activeSession = createSession('session-b', 'turn-b');
    stateMocks.virtualItems = [createItem('turn-b')];

    act(() => {
      root.render(<VirtualMessageList />);
    });

    expect(container.querySelector('[data-testid="scroll-to-latest"]')?.getAttribute('data-visible')).toBe('false');
  });

  it('renders a session-scoped history projection handoff overlay after switching to a ready full session', () => {
    stateMocks.activeSession = createSession('session-a', 'turn-a', { historyState: 'ready' });
    stateMocks.virtualItems = [createItem('turn-a')];

    act(() => {
      root.render(<VirtualMessageList />);
    });

    stateMocks.activeSession = createSession(
      'session-b',
      Array.from({ length: 30 }, (_, index) => `turn-b-${index}`),
      { historyState: 'ready' },
    );
    stateMocks.virtualItems = Array.from({ length: 30 }, (_, index) => createItem(`turn-b-${index}`));

    act(() => {
      root.render(<VirtualMessageList />);
    });

    const overlay = container.querySelector('[data-history-projection-handoff-overlay="true"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('data-session-id')).toBe('session-b');
    expect(overlay?.querySelectorAll('.virtual-item-wrapper')).toHaveLength(24);
    expect(container.querySelector('[data-testid="virtuoso"]')?.querySelectorAll('.virtual-item-wrapper')).toHaveLength(30);
  });

  it('does not render the handoff overlay for partial history sessions', () => {
    stateMocks.activeSession = createSession('session-a', 'turn-a', { historyState: 'ready' });
    stateMocks.virtualItems = [createItem('turn-a')];

    act(() => {
      root.render(<VirtualMessageList />);
    });

    stateMocks.activeSession = createSession(
      'session-b',
      Array.from({ length: 30 }, (_, index) => `turn-b-${index}`),
      { historyState: 'ready', isPartial: true },
    );
    stateMocks.virtualItems = Array.from({ length: 30 }, (_, index) => createItem(`turn-b-${index}`));

    act(() => {
      root.render(<VirtualMessageList />);
    });

    expect(container.querySelector('[data-history-projection-handoff-overlay="true"]')).toBeNull();
  });

  it('releases the handoff overlay after the real target turn renders outside the overlay', () => {
    stateMocks.activeSession = createSession('session-a', 'turn-a', { historyState: 'ready' });
    stateMocks.virtualItems = [createItem('turn-a')];

    act(() => {
      root.render(<VirtualMessageList />);
    });

    stateMocks.activeSession = createSession(
      'session-b',
      Array.from({ length: 30 }, (_, index) => `turn-b-${index}`),
      { historyState: 'ready' },
    );
    stateMocks.virtualItems = Array.from({ length: 30 }, (_, index) => createItem(`turn-b-${index}`));

    act(() => {
      root.render(<VirtualMessageList />);
    });

    expect(container.querySelector('[data-history-projection-handoff-overlay="true"]')).not.toBeNull();

    act(() => {
      const callbacks = animationFrameCallbacks.splice(0);
      callbacks.forEach(callback => callback(performance.now()));
    });

    expect(container.querySelector('[data-history-projection-handoff-overlay="true"]')).toBeNull();
  });
});
