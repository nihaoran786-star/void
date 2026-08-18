// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualMessageList, type VirtualMessageListRef } from './VirtualMessageList';
import type { Session } from '../../types/flow-chat';
import type { VirtualItem } from '../../store/modernFlowChatStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const stateMocks = vi.hoisted(() => ({
  activeSession: null as Session | null,
  virtualItems: [] as VirtualItem[],
  visibleTurnInfo: null as unknown,
  setVisibleTurnInfo: vi.fn(),
  chatInput: {
    isActive: false,
    isExpanded: false,
    inputHeight: 0,
  },
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: React.forwardRef((props: any, ref) => {
    const scrollerRef = React.useRef<HTMLDivElement | null>(null);
    React.useImperativeHandle(ref, () => ({
      scrollTo: vi.fn(),
      scrollToIndex: vi.fn(),
    }));

    React.useLayoutEffect(() => {
      props.scrollerRef?.(scrollerRef.current);
      return () => props.scrollerRef?.(null);
    }, [props]);

    return (
      <div ref={scrollerRef} data-testid="virtuoso" data-virtuoso-scroller="true">
        {props.data?.map((item: VirtualItem, index: number) => (
          <div key={props.computeItemKey?.(index, item) ?? item.turnId} className="virtual-item-wrapper" data-turn-id={item.turnId} data-item-type={item.type}>
            {item.turnId}
          </div>
        ))}
        {props.components?.Footer ? <props.components.Footer /> : null}
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
  useFlowChatPresentationChatInputState: () => stateMocks.chatInput,
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

function createSession(sessionId: string, turnIds: string[]): Session {
  return {
    sessionId,
    title: sessionId,
    dialogTurns: turnIds.map((turnId, index) => ({
      id: turnId,
      sessionId,
      userMessage: { id: `user-${turnId}`, content: turnId, timestamp: index },
      modelRounds: [],
      status: 'completed',
      startTime: index,
    })),
    status: 'idle',
    config: { agentType: 'agentic' },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    isHistorical: true,
    todos: [],
    mode: 'agentic',
    sessionKind: 'normal',
  } as Session;
}

function createUserItem(turnIndex: number): VirtualItem {
  const turnId = `turn-${turnIndex}`;
  return {
    type: 'user-message',
    turnId,
    data: {
      id: `user-${turnId}`,
      content: `prompt ${turnIndex}`,
      timestamp: turnIndex,
    },
  } as VirtualItem;
}

function createModelRound(turnIndex: number): VirtualItem {
  const turnId = `turn-${turnIndex}`;
  return {
    type: 'model-round',
    turnId,
    isLastRound: true,
    isTurnComplete: true,
    data: {
      id: `round-${turnId}`,
      index: 0,
      status: 'completed',
      isStreaming: false,
      isComplete: true,
      startTime: turnIndex,
      items: [{
        id: `text-${turnId}`,
        type: 'text',
        content: 'x'.repeat(2000),
        status: 'completed',
        timestamp: turnIndex,
      }],
    },
  } as VirtualItem;
}

function createLongHistoricalItems(): VirtualItem[] {
  return Array.from({ length: 8 }, (_, index) => [
    createUserItem(index),
    createModelRound(index),
  ]).flat();
}

describe('VirtualMessageList initial history render window', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    stateMocks.visibleTurnInfo = null;
    stateMocks.setVisibleTurnInfo.mockReset();
    stateMocks.chatInput = {
      isActive: false,
      isExpanded: false,
      inputHeight: 0,
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('initially renders a bounded latest historical window with an omitted-height spacer', () => {
    const items = createLongHistoricalItems();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList />);
    });

    const staticScroller = container.querySelector('[data-initial-history-render-windowed="true"]');
    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));

    expect(staticScroller).not.toBeNull();
    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).not.toBeNull();
    expect(renderedItems.length).toBeLessThan(items.length);
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-6');
    expect(renderedItems.at(-1)?.getAttribute('data-turn-id')).toBe('turn-7');
    expect(container.querySelector('[data-testid="virtuoso"]')).toBeNull();
  });

  it('starts the bounded historical window at the latest rendered content', () => {
    const items = createLongHistoricalItems();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this instanceof HTMLElement && this.dataset.initialHistoryRenderWindowed === 'true'
          ? 1000
          : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this instanceof HTMLElement && this.dataset.initialHistoryRenderWindowed === 'true'
          ? 250
          : 0;
      },
    });

    try {
      act(() => {
        root.render(<VirtualMessageList />);
      });

      const staticScroller = container.querySelector<HTMLElement>('[data-initial-history-render-windowed="true"]');
      expect(staticScroller?.scrollTop).toBe(750);
    } finally {
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
    }
  });

  it('does not force static history back to bottom after the user leaves the bottom', () => {
    const items = createLongHistoricalItems();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 9 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this instanceof HTMLElement && this.dataset.initialHistoryRenderWindowed === 'true'
          ? stateMocks.virtualItems.length * 100
          : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this instanceof HTMLElement && this.dataset.initialHistoryRenderWindowed === 'true'
          ? 250
          : 0;
      },
    });

    try {
      act(() => {
        root.render(<VirtualMessageList />);
      });

      const staticScroller = container.querySelector<HTMLElement>('[data-initial-history-render-windowed="true"]');
      expect(staticScroller?.scrollTop).toBe(items.length * 100 - 250);

      act(() => {
        if (staticScroller) {
          staticScroller.scrollTop = 320;
          staticScroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
      });

      stateMocks.virtualItems = [...items, createUserItem(8)];
      act(() => {
        root.render(<VirtualMessageList />);
      });

      expect(staticScroller?.scrollTop).toBe(320);
    } finally {
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
    }
  });

  it('does not force static history back to bottom after footer height changes while the user is away from bottom', () => {
    const items = createLongHistoricalItems();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this instanceof HTMLElement && this.dataset.initialHistoryRenderWindowed === 'true'
          ? 1200 + stateMocks.chatInput.inputHeight
          : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this instanceof HTMLElement && this.dataset.initialHistoryRenderWindowed === 'true'
          ? 250
          : 0;
      },
    });

    try {
      act(() => {
        root.render(<VirtualMessageList />);
      });

      const staticScroller = container.querySelector<HTMLElement>('[data-initial-history-render-windowed="true"]');
      expect(staticScroller?.scrollTop).toBe(950);

      act(() => {
        if (staticScroller) {
          staticScroller.scrollTop = 320;
          staticScroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
      });

      stateMocks.chatInput = {
        isActive: true,
        isExpanded: true,
        inputHeight: 180,
      };
      act(() => {
        root.render(<VirtualMessageList />);
      });

      expect(staticScroller?.scrollTop).toBe(320);
    } finally {
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      if (clientHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
      }
    }
  });

  it('still anchors an omitted turn pin after the user has left static history bottom', () => {
    const items = createLongHistoricalItems();
    const listRef = React.createRef<VirtualMessageListRef>();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList ref={listRef} />);
    });

    const staticScroller = container.querySelector<HTMLElement>('[data-initial-history-render-windowed="true"]');
    act(() => {
      if (staticScroller) {
        staticScroller.scrollTop = 320;
        staticScroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });

    act(() => {
      listRef.current?.pinTurnToTop('turn-0', { behavior: 'auto', pinMode: 'transient' });
    });

    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));
    expect(renderedItems.length).toBeLessThan(items.length);
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-0');
    expect(container.querySelector('[data-history-initial-render-tail-spacer="true"]')).not.toBeNull();
  });

  it('expands the initial history window when the user scrolls upward', () => {
    const items = createLongHistoricalItems();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList />);
    });

    const staticScroller = container.querySelector('[data-initial-history-render-windowed="true"]');
    expect(staticScroller).not.toBeNull();

    act(() => {
      staticScroller?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -120,
        bubbles: true,
      }));
    });

    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));
    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).toBeNull();
    expect(renderedItems).toHaveLength(items.length);
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-0');
    expect(renderedItems.at(-1)?.getAttribute('data-turn-id')).toBe('turn-7');
  });

  it('expands before scrollToTurn targets an omitted historical turn', () => {
    const items = createLongHistoricalItems();
    const listRef = React.createRef<VirtualMessageListRef>();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList ref={listRef} />);
    });

    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).not.toBeNull();

    act(() => {
      listRef.current?.scrollToTurn(1);
    });

    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));
    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).toBeNull();
    expect(renderedItems).toHaveLength(items.length);
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-0');
  });

  it('expands before scrollToIndex targets an omitted historical item', () => {
    const items = createLongHistoricalItems();
    const listRef = React.createRef<VirtualMessageListRef>();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList ref={listRef} />);
    });

    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).not.toBeNull();

    act(() => {
      listRef.current?.scrollToIndex(0);
    });

    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));
    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).toBeNull();
    expect(renderedItems).toHaveLength(items.length);
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-0');
  });

  it('accepts pinTurnToTop for an omitted historical turn by anchoring the target window', () => {
    const items = createLongHistoricalItems();
    const listRef = React.createRef<VirtualMessageListRef>();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList ref={listRef} />);
    });

    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).not.toBeNull();

    let didPin = false;
    act(() => {
      didPin = listRef.current?.pinTurnToTop('turn-0', { behavior: 'auto', pinMode: 'transient' }) ?? false;
    });

    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));
    expect(didPin).toBe(true);
    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).toBeNull();
    expect(renderedItems.length).toBeLessThan(items.length);
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-0');
    expect(container.querySelector('[data-history-initial-render-tail-spacer="true"]')).not.toBeNull();
  });

  it('keeps a tail spacer after pinning an omitted historical turn so latest remains reachable', () => {
    const items = createLongHistoricalItems();
    const listRef = React.createRef<VirtualMessageListRef>();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList ref={listRef} />);
    });

    let didPin = false;
    act(() => {
      didPin = listRef.current?.pinTurnToTop('turn-0', { behavior: 'auto', pinMode: 'transient' }) ?? false;
    });

    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));
    expect(didPin).toBe(true);
    expect(renderedItems.length).toBeLessThan(items.length);
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-0');
    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).toBeNull();
    expect(container.querySelector('[data-history-initial-render-tail-spacer="true"]')).not.toBeNull();
  });

  it('keeps the anchored target window for smooth omitted historical turn pins', () => {
    const items = createLongHistoricalItems();
    const listRef = React.createRef<VirtualMessageListRef>();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList ref={listRef} />);
    });

    act(() => {
      listRef.current?.pinTurnToTop('turn-0', { behavior: 'smooth', pinMode: 'transient' });
    });

    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));
    expect(renderedItems.length).toBeLessThan(items.length);
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-0');
    expect(container.querySelector('[data-history-initial-render-tail-spacer="true"]')).not.toBeNull();
  });

  it('pins an already rendered latest-window turn without creating an anchor tail spacer', () => {
    const items = createLongHistoricalItems();
    const listRef = React.createRef<VirtualMessageListRef>();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList ref={listRef} />);
    });

    let didPin = false;
    act(() => {
      didPin = listRef.current?.pinTurnToTop('turn-7', { behavior: 'auto', pinMode: 'sticky-latest' }) ?? false;
    });

    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));
    expect(didPin).toBe(true);
    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).not.toBeNull();
    expect(container.querySelector('[data-history-initial-render-tail-spacer="true"]')).toBeNull();
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-6');
    expect(renderedItems.at(-1)?.getAttribute('data-turn-id')).toBe('turn-7');
  });

  it('returns from an anchored historical turn window to the latest tail through the latest action', () => {
    const items = createLongHistoricalItems();
    const listRef = React.createRef<VirtualMessageListRef>();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList ref={listRef} />);
    });

    act(() => {
      listRef.current?.pinTurnToTop('turn-0', { behavior: 'auto', pinMode: 'transient' });
    });

    expect(container.querySelector('[data-history-initial-render-tail-spacer="true"]')).not.toBeNull();

    act(() => {
      listRef.current?.scrollToLatestEndPosition();
    });

    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));
    expect(container.querySelector('[data-history-initial-render-tail-spacer="true"]')).toBeNull();
    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).not.toBeNull();
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-6');
    expect(renderedItems.at(-1)?.getAttribute('data-turn-id')).toBe('turn-7');
  });

  it('expands all history when the user reveals upward from an anchored historical turn window', () => {
    const items = createLongHistoricalItems();
    const listRef = React.createRef<VirtualMessageListRef>();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 8 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList ref={listRef} />);
    });

    act(() => {
      listRef.current?.pinTurnToTop('turn-0', { behavior: 'auto', pinMode: 'transient' });
    });

    expect(container.querySelector('[data-history-initial-render-tail-spacer="true"]')).not.toBeNull();

    const staticScroller = container.querySelector('[data-initial-history-render-windowed="true"]');
    act(() => {
      staticScroller?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -120,
        bubbles: true,
      }));
    });

    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));
    expect(container.querySelector('[data-history-initial-render-tail-spacer="true"]')).toBeNull();
    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).toBeNull();
    expect(renderedItems).toHaveLength(items.length);
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-0');
    expect(renderedItems.at(-1)?.getAttribute('data-turn-id')).toBe('turn-7');
  });

  it('keeps navigation-expanded history expanded after an anchored pin and item count change', () => {
    const items = createLongHistoricalItems();
    const listRef = React.createRef<VirtualMessageListRef>();
    stateMocks.activeSession = createSession('history-session', Array.from({ length: 9 }, (_, index) => `turn-${index}`));
    stateMocks.virtualItems = items;

    act(() => {
      root.render(<VirtualMessageList ref={listRef} />);
    });

    act(() => {
      listRef.current?.pinTurnToTop('turn-0', { behavior: 'auto', pinMode: 'transient' });
    });

    expect(container.querySelector('[data-history-initial-render-tail-spacer="true"]')).not.toBeNull();

    act(() => {
      listRef.current?.scrollToTurn(1);
    });

    stateMocks.virtualItems = [...items, createUserItem(8)];
    act(() => {
      root.render(<VirtualMessageList ref={listRef} />);
    });

    const renderedItems = Array.from(container.querySelectorAll('.virtual-item-wrapper'));
    expect(container.querySelector('[data-history-initial-render-tail-spacer="true"]')).toBeNull();
    expect(container.querySelector('[data-history-initial-render-spacer="true"]')).toBeNull();
    expect(renderedItems).toHaveLength(stateMocks.virtualItems.length);
    expect(renderedItems[0]?.getAttribute('data-turn-id')).toBe('turn-0');
    expect(renderedItems.at(-1)?.getAttribute('data-turn-id')).toBe('turn-8');
  });
});
