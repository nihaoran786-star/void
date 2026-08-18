// @vitest-environment jsdom

/**
 * Cost of one markdown re-parse (measurement harness).
 *
 * `flowChatStreamingProfile.test.tsx` counts how many times the markdown
 * renderer is re-rendered per streamed flush. This harness measures what one of
 * those renders costs, using the same fixture reply, so the two numbers can be
 * multiplied into a per-second budget.
 *
 * Durations are jsdom JS-side cost. They are not browser paint numbers, but the
 * remark/rehype pipeline is pure JS, so the relative ranking transfers.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLongMarkdownReply } from './streamingReplayFixture';

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

vi.mock('@/shared/helpers/MonacoHelper', () => ({
  MonacoHelper: {
    getEditorFromElement: async () => null,
    getEditorContext: async () => null,
  },
}));

vi.mock('@/infrastructure/theme/hooks/useTheme', () => ({
  useTheme: () => ({ isLight: true, theme: 'void-light' }),
}));

describe('markdown re-parse cost', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('measures one full parse of the fixture reply', async () => {
    const { Markdown } = await import('@/component-library/components/Markdown/Markdown');
    const content = buildLongMarkdownReply();

    // Warm the module and the prism/katex lazy paths.
    act(() => {
      root.render(<Markdown content={content} isStreaming={false} />);
    });

    const unchangedDurations: number[] = [];
    for (let pass = 0; pass < 12; pass += 1) {
      const started = performance.now();
      act(() => {
        // A new callback identity per render is exactly what FlowTextBlock
        // passes today, so React.memo cannot bail out.
        root.render(
          <Markdown
            content={content}
            isStreaming={false}
            onOpenVisualization={() => undefined}
          />,
        );
      });
      unchangedDurations.push(performance.now() - started);
    }

    const growingDurations: number[] = [];
    const flushes = 20;
    const chunk = Math.ceil(content.length / flushes);
    for (let flush = 1; flush <= flushes; flush += 1) {
      const partial = content.slice(0, Math.min(content.length, chunk * flush));
      const started = performance.now();
      act(() => {
        root.render(<Markdown content={partial} isStreaming onOpenVisualization={() => undefined} />);
      });
      growingDurations.push(performance.now() - started);
    }

    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };

    // A realistic long answer is several thousand characters, so measure how
    // the same wasted re-parse scales with reply length.
    const longContent = Array.from({ length: 5 }, () => content).join('\n\n');
    const longDurations: number[] = [];
    for (let pass = 0; pass < 6; pass += 1) {
      const started = performance.now();
      act(() => {
        root.render(
          <Markdown
            content={longContent}
            isStreaming={false}
            onOpenVisualization={() => undefined}
          />,
        );
      });
      longDurations.push(performance.now() - started);
    }

    const report = {
      contentChars: content.length,
      longContentChars: longContent.length,
      longUnchangedReparseMs: {
        median: Number([...longDurations].sort((a, b) => a - b)[3].toFixed(2)),
        max: Number(Math.max(...longDurations).toFixed(2)),
      },
      unchangedContentReparseMs: {
        median: Number(median(unchangedDurations).toFixed(2)),
        max: Number(Math.max(...unchangedDurations).toFixed(2)),
        samples: unchangedDurations.map(value => Number(value.toFixed(2))),
      },
      growingContentReparseMs: {
        median: Number(median(growingDurations).toFixed(2)),
        max: Number(Math.max(...growingDurations).toFixed(2)),
        lastFlush: Number(growingDurations[growingDurations.length - 1].toFixed(2)),
      },
    };

    const fs = await import('node:fs');
    const path = await import('node:path');
    const outputDir = path.resolve(process.cwd(), '../../.codex-artifacts/flow-chat-perf');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, 'markdown-reparse-cost.json'),
      JSON.stringify(report, null, 2),
      'utf8',
    );

    expect(report.contentChars).toBeGreaterThan(500);
  }, 180_000);
});
