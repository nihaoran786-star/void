// @vitest-environment jsdom

/**
 * Height-mutator coverage for the transcript.
 *
 * Section G of `FLOWCHAT_SCROLL_STABILITY.md`. Two recent defects shared one
 * shape: content whose rendered height changes after mount fought the
 * virtualizer's reservation machinery and left blank space or scroll jitter.
 * The fix in every case is that the mutator announces itself. These tests pin
 * (1) that the list honours an announcement from a source that is not a tool
 * card, so widening the contract to markdown content actually reaches it, and
 * (2) the scroll-UX invariants around the "jump to latest" affordance, which
 * used to blink whenever a reservation grew or drained.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../types/flow-chat';
import type { VirtualItem } from '../../store/modernFlowChatStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * jsdom has no ResizeObserver, and the list installs one to drive
 * `measureHeightChange`. Keep the callbacks so a test can fire a real
 * measurement pass rather than only asserting on static source.
 */
const resizeObserverCallbacks: ResizeObserverCallback[] = [];
globalThis.ResizeObserver = class {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallbacks.push(callback);
  }
  observe() { /* driven manually */ }
  unobserve() { /* driven manually */ }
  disconnect() { /* driven manually */ }
} as unknown as typeof globalThis.ResizeObserver;

function fireResizeObservers(): void {
  for (const callback of resizeObserverCallbacks) {
    callback([], {} as ResizeObserver);
  }
}

const stateMocks = vi.hoisted(() => ({
  activeSession: null as Session | null,
  virtualItems: [] as VirtualItem[],
  visibleTurnInfo: null as unknown,
  setVisibleTurnInfo: vi.fn(),
  isFollowingOutput: false,
  isReaderControlled: false,
  atBottom: true,
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: React.forwardRef((props: any, ref) => {
    const scrollerRef = React.useRef<HTMLDivElement | null>(null);
    React.useImperativeHandle(ref, () => ({
      scrollTo: vi.fn(),
      scrollToIndex: vi.fn(),
    }));

    React.useLayoutEffect(() => {
      if (!scrollerRef.current) return;
      props.scrollerRef?.(scrollerRef.current);
      return () => props.scrollerRef?.(null);
    }, [props]);

    React.useEffect(() => {
      props.atBottomStateChange?.(stateMocks.atBottom);
    }, [props]);

    return (
      <div ref={scrollerRef} data-testid="virtuoso" data-virtuoso-scroller="true">
        {props.data?.map((item: VirtualItem, index: number) => (
          <div key={props.computeItemKey?.(index, item) ?? item.turnId}>
            {props.itemContent?.(index, item)}
          </div>
        ))}
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
  useFlowChatPresentationSessionState: () => ({ isProcessing: false, processingPhase: null }),
}));

vi.mock('./useFlowChatPresentationChatInputState', () => ({
  useFlowChatPresentationChatInputState: () => ({ isActive: false, isExpanded: false, inputHeight: 0 }),
}));

vi.mock('./VirtualItemRenderer', () => ({
  VirtualItemRenderer: ({ item, index }: { item: VirtualItem; index: number }) => (
    <div
      className="virtual-item-wrapper"
      data-turn-id={item.turnId}
      data-virtual-index={index}
      data-item-type={item.type}
    >
      {item.turnId}
    </div>
  ),
}));

vi.mock('../ScrollToLatestBar', () => ({
  ScrollToLatestBar: ({ visible }: { visible: boolean }) => (
    <div data-testid="scroll-to-latest" data-visible={visible ? 'true' : 'false'} />
  ),
}));

vi.mock('../ScrollToTurnHeaderButton', () => ({ ScrollToTurnHeaderButton: () => null }));
vi.mock('../StickyTaskIndicator', () => ({ StickyTaskIndicator: () => null }));
vi.mock('./ProcessingIndicator', () => ({
  ProcessingIndicator: () => null,
  ProcessingIndicatorSpacer: () => null,
}));
vi.mock('./ScrollAnchor', () => ({ ScrollAnchor: () => null }));

vi.mock('./useFlowChatFollowOutput', () => ({
  useFlowChatFollowOutput: () => ({
    isFollowingOutput: stateMocks.isFollowingOutput,
    isReaderControlled: stateMocks.isReaderControlled,
    isReaderControlledNow: () => stateMocks.isReaderControlled,
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

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

function createSession(sessionId: string, turnIds: string[]): Session {
  return {
    sessionId,
    title: sessionId,
    dialogTurns: turnIds.map((turnId, index) => ({
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
    isHistorical: false,
    todos: [],
    mode: 'agentic',
    sessionKind: 'normal',
  } as Session;
}

function createItem(turnId: string): VirtualItem {
  return {
    type: 'user-message',
    turnId,
    data: { id: `user-${turnId}`, content: turnId, timestamp: 1 },
  } as VirtualItem;
}

describe('VirtualMessageList height-mutator handling', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    resizeObserverCallbacks.length = 0;
    stateMocks.activeSession = createSession('session-1', ['turn-a', 'turn-b']);
    stateMocks.virtualItems = [createItem('turn-a'), createItem('turn-b')];
    stateMocks.isFollowingOutput = false;
    stateMocks.isReaderControlled = false;
    stateMocks.atBottom = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.resetModules();
  });

  async function renderList() {
    const { VirtualMessageList } = await import('./VirtualMessageList');
    const { FlowChatPresentationActivityProvider } = await import('./FlowChatPresentationActivity');
    await act(async () => {
      root.render(
        <FlowChatPresentationActivityProvider isActive>
          <VirtualMessageList />
        </FlowChatPresentationActivityProvider>,
      );
    });
  }

  function readFooterHeightPx(): number {
    const footer = container.querySelector<HTMLDivElement>('.message-list-footer');
    return footer ? Number.parseFloat(footer.style.height) : Number.NaN;
  }

  it('reserves tail space for a collapse intent announced by a non-tool-card mutator', async () => {
    await renderList();

    const before = readFooterHeightPx();
    expect(Number.isNaN(before)).toBe(false);

    // Exactly what MermaidBlock / a markdown image guard emits: no toolId, a
    // measured card height, an automatic reason. The list must not care where
    // the announcement came from.
    await act(async () => {
      window.dispatchEvent(new CustomEvent('flowchat:tool-card-collapse-intent', {
        detail: { toolId: null, toolName: 'MermaidBlock', cardHeight: 480, reason: 'auto' },
      }));
    });

    expect(readFooterHeightPx()).toBeGreaterThan(before);

    // A ResizeObserver pass must not throw away the reservation before the
    // shrink it is protecting has actually landed.
    await act(async () => {
      fireResizeObservers();
      await Promise.resolve();
    });
    expect(readFooterHeightPx()).toBeGreaterThan(before);
  });

  it('ignores an announcement with no measurable height', async () => {
    await renderList();
    const before = readFooterHeightPx();

    // A zero-height intent protects nothing and reserving for it is pure blank
    // space — the section E failure mode.
    await act(async () => {
      window.dispatchEvent(new CustomEvent('flowchat:tool-card-collapse-intent', {
        detail: { toolId: null, toolName: 'MermaidBlock', cardHeight: 0, reason: 'auto' },
      }));
    });

    expect(readFooterHeightPx()).toBe(before);
  });

  it('does not offer "jump to latest" while follow-output owns the tail', async () => {
    // The reservation footer makes Virtuoso report "not at bottom" even though
    // the viewport is sitting at the effective bottom. Before the fix that made
    // the bar appear mid-stream and blink with every reservation change.
    stateMocks.atBottom = false;
    stateMocks.isFollowingOutput = true;
    await renderList();

    expect(
      container.querySelector('[data-testid="scroll-to-latest"]')?.getAttribute('data-visible'),
    ).toBe('false');
  });

  it('offers "jump to latest" once the reader is away from the tail', async () => {
    stateMocks.atBottom = false;
    stateMocks.isFollowingOutput = false;
    await renderList();

    expect(
      container.querySelector('[data-testid="scroll-to-latest"]')?.getAttribute('data-visible'),
    ).toBe('true');
  });

  it('keeps "jump to latest" hidden at the bottom', async () => {
    stateMocks.atBottom = true;
    stateMocks.isFollowingOutput = false;
    await renderList();

    expect(
      container.querySelector('[data-testid="scroll-to-latest"]')?.getAttribute('data-visible'),
    ).toBe('false');
  });
});

describe('height-mutator source contract', () => {
  it('never calls Element.scrollTo without a fallback', () => {
    // jsdom has no `Element.prototype.scrollTo`, which is what made the
    // streaming perf profile throw on mount. All four call sites go through one
    // guarded helper now.
    expect(virtualMessageListSource).toContain('function scrollScrollerTo(');
    expect(virtualMessageListSource).toContain("if (typeof scroller.scrollTo === 'function')");
    // Exactly one raw call survives — the one inside the guarded helper.
    expect(virtualMessageListSource.match(/scroller\.scrollTo\(/g)).toHaveLength(1);
  });

  it('gates the jump-to-latest affordance on follow-output, not raw at-bottom', () => {
    expect(virtualMessageListSource).toContain('visible={!isAtBottom && !isFollowingOutput && virtualItems.length > 0}');
  });

  it.each([
    ['src/flow_chat/tool-cards/MediaGenerationToolCard.tsx', 'media grid'],
    ['src/flow_chat/tool-cards/ReviewSessionSummaryCard.tsx', 'review body'],
    ['src/flow_chat/tool-cards/GenerativeWidgetToolCard.tsx', 'widget failure panel'],
  ])('routes the %s collapse through the height contract', (relativePath) => {
    const source = readSource(relativePath);
    expect(source).toContain('useToolCardHeightContract');
    expect(source).toContain('applyExpandedState(');
    // A raw `setState(!value)` toggle is the shape that skips the contract.
    expect(source).not.toMatch(/onClick=\{\(\) => set(Is)?Expanded\(/);
  });

  it('announces the self-sizing widget iframe height changes', () => {
    const source = readSource('src/flow_chat/tool-cards/GenerativeWidgetToolCard.tsx');
    expect(source).toContain('onHeightChange={handleWidgetHeightChange}');
    expect(source).toContain('dispatchCollapseIntent(');
  });

  it('announces the image preview swap in the image tool card', () => {
    const source = readSource('src/flow_chat/tool-cards/ViewImageToolCard.tsx');
    expect(source).toContain('notifyToolCardHeightChanged');
  });

  it('announces markdown mutators without importing flow_chat into the component library', () => {
    const mermaid = readSource('src/component-library/components/Markdown/MermaidBlock.tsx');
    expect(mermaid).toContain("const FLOWCHAT_COLLAPSE_INTENT_EVENT = 'flowchat:tool-card-collapse-intent'");
    expect(mermaid).toContain('SOURCE_TEXT_STATES');
    expect(mermaid).not.toContain("from '@/flow_chat");

    const markdown = readSource('src/component-library/components/Markdown/Markdown.tsx');
    expect(markdown).toContain('notifyMarkdownHeightChanged');
    expect(markdown).not.toContain("from '@/flow_chat");
  });
});
