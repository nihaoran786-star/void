// @vitest-environment jsdom

/**
 * Flow Chat streaming render profile (measurement harness).
 *
 * Replays the deterministic streaming fixture through the real presentation
 * store, the real ModernFlowChatContainer, the real VirtualItemRenderer tree
 * and the real markdown renderer, and records:
 *
 * - React commits per streamed flush (root Profiler),
 * - how many already-completed items re-render per flush (per-item Profiler),
 * - how many full markdown re-parses happen per flush,
 * - whether Virtuoso's Header/Footer components keep their identity.
 *
 * Counts are exact and transfer directly to the browser. Durations are jsdom
 * JS-side cost only; they are not browser paint numbers.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStreamingReplay } from './streamingReplayFixture';
import type { VirtualItem } from '../store/modernFlowChatStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() { /* measurement harness stub */ }
    unobserve() { /* measurement harness stub */ }
    disconnect() { /* measurement harness stub */ }
  } as unknown as typeof globalThis.ResizeObserver;
}

const counters = vi.hoisted(() => ({
  markdownRenders: 0,
  footerIdentityChanges: 0,
  headerIdentityChanges: 0,
  itemContentIdentityChanges: 0,
  lastFooter: null as unknown,
  lastHeader: null as unknown,
  lastItemContent: null as unknown,
  itemRenders: new Map<string, number>(),
  itemDurationMs: new Map<string, number>(),
  rootCommits: 0,
  rootDurationMs: 0,
}));

/**
 * Replace only the markdown renderer with a counter. Every render counted here
 * is one full remark/rehype re-parse in production; the cost of a single parse
 * is measured separately by `markdownReparseCost.test.tsx`.
 */
vi.mock('@/component-library', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    MarkdownRenderer: () => {
      counters.markdownRenders += 1;
      return null;
    },
  };
});

vi.mock('react-virtuoso', async () => {
  const ReactModule = await import('react');
  return {
    Virtuoso: ReactModule.forwardRef((props: any, ref: React.Ref<unknown>) => {
      const scrollerRef = ReactModule.useRef<HTMLDivElement | null>(null);
      ReactModule.useImperativeHandle(ref, () => ({
        scrollTo: vi.fn(),
        scrollToIndex: vi.fn(),
        scrollIntoView: vi.fn(),
      }));

      if (counters.lastFooter !== null && counters.lastFooter !== props.components?.Footer) {
        counters.footerIdentityChanges += 1;
      }
      if (counters.lastHeader !== null && counters.lastHeader !== props.components?.Header) {
        counters.headerIdentityChanges += 1;
      }
      if (counters.lastItemContent !== null && counters.lastItemContent !== props.itemContent) {
        counters.itemContentIdentityChanges += 1;
      }
      counters.lastFooter = props.components?.Footer ?? null;
      counters.lastHeader = props.components?.Header ?? null;
      counters.lastItemContent = props.itemContent ?? null;

      ReactModule.useLayoutEffect(() => {
        props.scrollerRef?.(scrollerRef.current);
        return () => props.scrollerRef?.(null);
      });

      const Footer = props.components?.Footer;
      const Header = props.components?.Header;

      return ReactModule.createElement(
        'div',
        { ref: scrollerRef, 'data-virtuoso-scroller': 'true' },
        Header ? ReactModule.createElement(Header, { context: props.context }) : null,
        (props.data ?? []).map((item: VirtualItem, index: number) => {
          const key = props.computeItemKey?.(index, item) ?? `item-${index}`;
          return ReactModule.createElement(
            React.Profiler,
            {
              key,
              id: String(key),
              onRender: (
                id: string,
                _phase: string,
                actualDuration: number,
              ) => {
                counters.itemRenders.set(id, (counters.itemRenders.get(id) ?? 0) + 1);
                counters.itemDurationMs.set(
                  id,
                  (counters.itemDurationMs.get(id) ?? 0) + actualDuration,
                );
              },
            },
            props.itemContent?.(index, item),
          );
        }),
        Footer ? ReactModule.createElement(Footer, { context: props.context }) : null,
      );
    }),
  };
});

// Monaco is a copied build asset (no package entry) and is irrelevant here.
vi.mock('@/shared/helpers/MonacoHelper', () => ({
  MonacoHelper: {
    getEditorFromElement: async () => null,
    getEditorContext: async () => null,
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, options?: { returnObjects?: boolean }) =>
      options?.returnObjects ? [] : key,
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
      switchChatSession: vi.fn(),
    }),
  },
}));

vi.mock('@/app/stores/sessionModeStore', () => {
  const state = { mode: 'code', draftStatus: 'idle', setMode: vi.fn() };
  const useSessionModeStore = (selector?: (value: typeof state) => unknown) =>
    (selector ? selector(state) : state);
  useSessionModeStore.getState = () => state;
  return { useSessionModeStore };
});

// The welcome panel only renders before the fixture session is applied.
vi.mock('../components/WelcomePanel', () => ({
  WelcomePanel: () => null,
}));

vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useWorkspaceContext: () => ({ workspacePath: 'D:/workspace/void' }),
}));

vi.mock('../components/modern/useFlowChatSync', () => ({
  useFlowChatSync: () => undefined,
}));

interface FlushSample {
  flush: number;
  commits: number;
  markdownRenders: number;
  itemRendersTotal: number;
  changedVirtualItems: number;
  durationMs: number;
}

describe('Flow Chat streaming render profile', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    counters.markdownRenders = 0;
    counters.footerIdentityChanges = 0;
    counters.headerIdentityChanges = 0;
    counters.itemContentIdentityChanges = 0;
    counters.lastFooter = null;
    counters.lastHeader = null;
    counters.lastItemContent = null;
    counters.itemRenders.clear();
    counters.itemDurationMs.clear();
    counters.rootCommits = 0;
    counters.rootDurationMs = 0;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.resetModules();
  });

  it('records the streaming hot-path profile', async () => {
    const { ModernFlowChatContainer } = await import('../components/modern/ModernFlowChatContainer');
    const { useModernFlowChatStore } = await import('../store/modernFlowChatStore');

    const replay = buildStreamingReplay({ historyTurns: 8, flushCount: 20 });

    act(() => {
      root.render(
        <React.Profiler
          id="root"
          onRender={(_id, _phase, actualDuration) => {
            counters.rootCommits += 1;
            counters.rootDurationMs += actualDuration;
          }}
        >
          <ModernFlowChatContainer isPresentationActive />
        </React.Profiler>,
      );
    });

    act(() => {
      useModernFlowChatStore.getState().setActiveSession(replay.initialSession);
    });


    const mountedItems = counters.itemRenders.size;
    const markdownAfterMount = counters.markdownRenders;

    const samples: FlushSample[] = [];
    let previousVirtualItems = useModernFlowChatStore.getState().virtualItems;

    for (const [index, snapshot] of replay.snapshots.entries()) {
      const commitsBefore = counters.rootCommits;
      const markdownBefore = counters.markdownRenders;
      const itemRendersBefore = [...counters.itemRenders.values()].reduce((a, b) => a + b, 0);
      const durationBefore = counters.rootDurationMs;

      act(() => {
        useModernFlowChatStore.getState().setActiveSession(snapshot);
      });

      const nextVirtualItems = useModernFlowChatStore.getState().virtualItems;
      const changedVirtualItems = nextVirtualItems.reduce(
        (count, item, itemIndex) => (previousVirtualItems[itemIndex] === item ? count : count + 1),
        0,
      );
      previousVirtualItems = nextVirtualItems;

      samples.push({
        flush: index + 1,
        commits: counters.rootCommits - commitsBefore,
        markdownRenders: counters.markdownRenders - markdownBefore,
        itemRendersTotal:
          [...counters.itemRenders.values()].reduce((a, b) => a + b, 0) - itemRendersBefore,
        changedVirtualItems,
        durationMs: counters.rootDurationMs - durationBefore,
      });
    }

    const steady = samples.slice(5);
    const average = (pick: (sample: FlushSample) => number) =>
      steady.reduce((total, sample) => total + pick(sample), 0) / steady.length;

    const report = {
      mountedVirtualItems: mountedItems,
      totalVirtualItems: useModernFlowChatStore.getState().virtualItems.length,
      markdownParsesOnMount: markdownAfterMount,
      flushes: samples.length,
      perFlushAverages: {
        commits: Number(average(s => s.commits).toFixed(2)),
        markdownReparses: Number(average(s => s.markdownRenders).toFixed(2)),
        itemRenders: Number(average(s => s.itemRendersTotal).toFixed(2)),
        changedVirtualItemObjects: Number(average(s => s.changedVirtualItems).toFixed(2)),
        jsDurationMs: Number(average(s => s.durationMs).toFixed(2)),
      },
      virtuosoIdentityChurn: {
        itemContentIdentityChanges: counters.itemContentIdentityChanges,
        headerIdentityChanges: counters.headerIdentityChanges,
        footerIdentityChanges: counters.footerIdentityChanges,
      },
      perItemRenders: [...counters.itemRenders.entries()]
        .map(([key, renders]) => ({
          key,
          renders,
          totalMs: Number((counters.itemDurationMs.get(key) ?? 0).toFixed(2)),
        }))
        .sort((a, b) => b.renders - a.renders),
    };

    const fs = await import('node:fs');
    const path = await import('node:path');
    const outputDir = path.resolve(process.cwd(), '../../.codex-artifacts/flow-chat-perf');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, 'streaming-profile.json'),
      JSON.stringify({ report, samples }, null, 2),
      'utf8',
    );

    expect(report.flushes).toBe(20);
    // Only the message that is actually streaming may re-parse its markdown.
    // Re-parsing settled answers is what made streaming drop frames.
    expect(report.perFlushAverages.markdownReparses).toBeLessThanOrEqual(1);
  }, 180_000);
});
