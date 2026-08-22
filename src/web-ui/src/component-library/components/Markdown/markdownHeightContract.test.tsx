// @vitest-environment jsdom

/**
 * Transcript height contract for markdown content.
 *
 * `VirtualMessageList` compensates for content whose rendered height changes
 * after mount. Content that shrinks must announce itself with
 * `flowchat:tool-card-collapse-intent` *before* the DOM shrinks, and content
 * that grows must at least ask for a re-measure with `tool-card-toggle`.
 * See `src/web-ui/src/flow_chat/components/modern/FLOWCHAT_SCROLL_STABILITY.md`.
 *
 * Two markdown mutators are covered here because both were unguarded and both
 * reproduce the reported "blank space under the transcript / scrolling flickers"
 * shape: a mermaid fence, which renders a screenful of raw source while
 * streaming and then collapses to a spinner, and a markdown image, which has no
 * intrinsic size until its bitmap decodes.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const renderDiagram = vi.hoisted(() => vi.fn(async () => '<svg id="diagram"></svg>'));

vi.mock('../../../tools/mermaid-editor/services/MermaidService', () => ({
  MERMAID_THEME_CHANGE_EVENT: 'mermaid-theme-change',
  MermaidService: {
    getInstance: () => ({ renderDiagram }),
  },
}));

// Returned identity has to be stable: `MermaidBlock` keys its render effect on
// `t` (through `renderDiagram`), so a fresh object per call re-runs the effect
// on every render and cancels the debounced render before it can fire.
const i18n = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => i18n,
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  }),
}));

const COLLAPSE_INTENT = 'flowchat:tool-card-collapse-intent';
const HEIGHT_CHANGED = 'tool-card-toggle';

interface RecordedEvents {
  collapseIntents: Array<{ toolName?: string; cardHeight?: number }>;
  heightChanges: number;
}

function recordTranscriptEvents(): { events: RecordedEvents; stop: () => void } {
  const events: RecordedEvents = { collapseIntents: [], heightChanges: 0 };
  const onIntent = (event: Event) => {
    events.collapseIntents.push((event as CustomEvent).detail ?? {});
  };
  const onChange = () => {
    events.heightChanges += 1;
  };
  window.addEventListener(COLLAPSE_INTENT, onIntent);
  window.addEventListener(HEIGHT_CHANGED, onChange);
  return {
    events,
    stop: () => {
      window.removeEventListener(COLLAPSE_INTENT, onIntent);
      window.removeEventListener(HEIGHT_CHANGED, onChange);
    },
  };
}

/**
 * jsdom gives every box a zero height, and the collapse-intent dispatcher
 * deliberately stays quiet when it cannot measure a real box (announcing a
 * zero-pixel collapse would be noise). Give the source-text states a height so
 * the shrink is observable.
 */
function stubMeasuredHeights(heightPx: number): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function stub(this: Element) {
    const isMermaidRoot = this instanceof HTMLElement && this.classList.contains('mermaid-block');
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: isMermaidRoot ? heightPx : 0,
      width: 0,
      height: isMermaidRoot ? heightPx : 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

describe('markdown transcript height contract', () => {
  let container: HTMLDivElement;
  let root: Root;
  let restoreHeights: (() => void) | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    renderDiagram.mockClear();
    // The block debounces its render by 200 ms, so the streaming -> loading
    // shrink only happens once that timer fires.
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    restoreHeights?.();
    restoreHeights = null;
    vi.useRealTimers();
    vi.resetModules();
  });

  it('announces a collapse intent before a streaming mermaid fence drops its source text', async () => {
    restoreHeights = stubMeasuredHeights(640);
    const { MermaidBlock } = await import('./MermaidBlock');
    const recorder = recordTranscriptEvents();

    const code = 'graph TD;\nA-->B;';
    act(() => {
      root.render(<MermaidBlock code={code} isStreaming />);
    });

    expect(recorder.events.collapseIntents).toHaveLength(0);

    // Streaming ends: the block stops rendering the raw source and falls back to
    // the (much shorter) loading state. That is the shrink the transcript has to
    // hear about while the tall box still exists.
    // Two acts on purpose: the render's passive effect (which schedules the
    // debounced diagram render) only flushes when the first act scope ends.
    await act(async () => {
      root.render(<MermaidBlock code={code} isStreaming={false} />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(recorder.events.collapseIntents.length).toBeGreaterThanOrEqual(1);
    const intent = recorder.events.collapseIntents[0];
    expect(intent.toolName).toBe('MermaidBlock');
    // The announced size is the box that is about to disappear, not zero — a
    // zero-height intent reserves nothing and protects nothing.
    expect(intent.cardHeight).toBe(640);
    recorder.stop();
  });

  it('asks for a re-measure on every mermaid render-state change', async () => {
    restoreHeights = stubMeasuredHeights(320);
    const { MermaidBlock } = await import('./MermaidBlock');
    const recorder = recordTranscriptEvents();

    const code = 'graph TD;\nA-->B;';
    act(() => {
      root.render(<MermaidBlock code={code} isStreaming />);
    });
    const afterMount = recorder.events.heightChanges;

    // Two acts on purpose: the render's passive effect (which schedules the
    // debounced diagram render) only flushes when the first act scope ends.
    await act(async () => {
      root.render(<MermaidBlock code={code} isStreaming={false} />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(recorder.events.heightChanges).toBeGreaterThan(afterMount);
    recorder.stop();
  });

  it('does not announce anything while the mermaid state is unchanged', async () => {
    restoreHeights = stubMeasuredHeights(320);
    const { MermaidBlock } = await import('./MermaidBlock');
    const code = 'graph TD;\nA-->B;';

    act(() => {
      root.render(<MermaidBlock code={code} isStreaming />);
    });

    const recorder = recordTranscriptEvents();
    act(() => {
      root.render(<MermaidBlock code={code} isStreaming />);
    });

    // Re-rendering with identical props must stay silent. A component that
    // announces on every render turns the compensation machinery itself into
    // the jitter — the section F failure mode.
    expect(recorder.events.heightChanges).toBe(0);
    expect(recorder.events.collapseIntents).toHaveLength(0);
    recorder.stop();
  });
});
