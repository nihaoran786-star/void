import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import {
  WORKSPACE_MEDIA_READY_PREVIEW_LIMIT,
  useWorkspaceMediaPreviewQueue,
  type WorkspaceMediaPreviewCandidate,
} from './useWorkspaceMediaPreviewQueue';
import type {
  WorkspaceMediaImagePreviewResolver,
  WorkspaceMediaPreviewResolver,
} from '@/shared/services/workspace-media';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class TestIntersectionObserver implements IntersectionObserver {
  static instances: TestIntersectionObserver[] = [];

  readonly root = null;
  readonly rootMargin = '320px 0px';
  readonly thresholds = [0.01];
  private readonly targets = new Set<Element>();

  constructor(
    private readonly callback: IntersectionObserverCallback,
  ) {
    TestIntersectionObserver.instances.push(this);
  }

  disconnect(): void {
    this.targets.clear();
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  trigger(keys: string[], isIntersecting = true): void {
    const keySet = new Set(keys);
    const entries = Array.from(this.targets)
      .filter(target => keySet.has(
        (target as HTMLElement).dataset.workspaceMediaPreviewKey ?? '',
      ))
      .map(target => ({
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: target.getBoundingClientRect(),
        isIntersecting,
        rootBounds: null,
        target,
        time: 0,
      } satisfies IntersectionObserverEntry));
    this.callback(entries, this);
  }
}

interface PreviewQueueHarnessProps {
  candidates: WorkspaceMediaPreviewCandidate[];
  enabled?: boolean;
  imagePreviewResolver: WorkspaceMediaImagePreviewResolver;
  mediaPreviewResolver: WorkspaceMediaPreviewResolver;
  renderedKeys?: string[];
}

const PreviewQueueHarness: React.FC<PreviewQueueHarnessProps> = ({
  candidates,
  enabled = true,
  imagePreviewResolver,
  mediaPreviewResolver,
  renderedKeys,
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const states = useWorkspaceMediaPreviewQueue({
    candidates,
    containerRef,
    enabled,
    imagePreviewResolver,
    mediaPreviewResolver,
  });
  const renderedKeySet = new Set(
    renderedKeys ?? candidates.map(candidate => candidate.key),
  );

  return (
    <div ref={containerRef}>
      <output data-testid="preview-states">{JSON.stringify(states)}</output>
      {candidates
        .filter(candidate => renderedKeySet.has(candidate.key))
        .map(candidate => (
          <span
            key={candidate.key}
            data-workspace-media-preview-key={candidate.key}
          />
        ))}
    </div>
  );
};

const imageCandidate = (
  key: string,
  filePath = `C:/work/${key}.png`,
): WorkspaceMediaPreviewCandidate => ({
  key,
  filePath,
  extension: 'png',
  kind: 'image',
  modifiedAt: 100,
});

describe('useWorkspaceMediaPreviewQueue', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM(
      '<!doctype html><html><body><div id="root"></div></body></html>',
      { pretendToBeVisual: true },
    );
    TestIntersectionObserver.instances = [];
    Object.defineProperty(dom.window, 'IntersectionObserver', {
      configurable: true,
      value: TestIntersectionObserver,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('does not resolve offscreen candidates and starts only intersecting cards', async () => {
    const imagePreviewResolver = vi.fn(async () => 'data:image/png;base64,image');
    const mediaPreviewResolver = vi.fn(async () => 'data:video/mp4;base64,video');
    const candidates: WorkspaceMediaPreviewCandidate[] = [
      imageCandidate('image'),
      {
        key: 'video',
        filePath: 'C:/work/video.mp4',
        extension: 'mp4',
        kind: 'video',
        modifiedAt: 100,
      },
    ];

    await act(async () => {
      root.render(
        <PreviewQueueHarness
          candidates={candidates}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />,
      );
    });

    expect(imagePreviewResolver).not.toHaveBeenCalled();
    expect(mediaPreviewResolver).not.toHaveBeenCalled();

    await act(async () => {
      TestIntersectionObserver.instances.at(-1)?.trigger(['image']);
      await Promise.resolve();
    });

    expect(imagePreviewResolver).toHaveBeenCalledTimes(1);
    expect(mediaPreviewResolver).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="preview-states"]')?.textContent)
      .toContain('"image":{"status":"ready"');
  });

  it('keeps one global concurrency budget while the candidate scope changes', async () => {
    const pending = new Map<string, (value: string) => void>();
    let currentConcurrency = 0;
    let peakConcurrency = 0;
    const imagePreviewResolver = vi.fn(({ filePath }) => {
      currentConcurrency += 1;
      peakConcurrency = Math.max(peakConcurrency, currentConcurrency);
      return new Promise<string>(resolve => {
        pending.set(filePath, value => {
          currentConcurrency -= 1;
          resolve(value);
        });
      });
    });
    const mediaPreviewResolver = vi.fn(async () => undefined);
    const activeCandidates = [
      imageCandidate('active-1'),
      imageCandidate('active-2'),
    ];
    const deletedCandidates = [
      imageCandidate('deleted-1'),
      imageCandidate('deleted-2'),
    ];

    await act(async () => {
      root.render(
        <PreviewQueueHarness
          candidates={activeCandidates}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />,
      );
    });
    await act(async () => {
      TestIntersectionObserver.instances.at(-1)?.trigger([
        'active-1',
        'active-2',
      ]);
    });
    expect(imagePreviewResolver).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.render(
        <PreviewQueueHarness
          candidates={deletedCandidates}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />,
      );
    });
    await act(async () => {
      TestIntersectionObserver.instances.at(-1)?.trigger([
        'deleted-1',
        'deleted-2',
      ]);
    });

    expect(imagePreviewResolver).toHaveBeenCalledTimes(2);
    expect(peakConcurrency).toBe(2);

    await act(async () => {
      pending.get('C:/work/active-1.png')?.('data:image/png;base64,stale-1');
      pending.get('C:/work/active-2.png')?.('data:image/png;base64,stale-2');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(imagePreviewResolver).toHaveBeenCalledTimes(4);
    expect(peakConcurrency).toBe(2);
    expect(container.querySelector('[data-testid="preview-states"]')?.textContent)
      .not.toContain('active-');
  });

  it('keeps in-flight reads when the same candidate set is reordered', async () => {
    const pending = new Map<string, (value: string) => void>();
    const imagePreviewResolver = vi.fn(({ filePath }) => (
      new Promise<string>(resolve => pending.set(filePath, resolve))
    ));
    const mediaPreviewResolver = vi.fn(async () => undefined);
    const candidates = [
      imageCandidate('first'),
      imageCandidate('second'),
    ];

    await act(async () => {
      root.render(
        <PreviewQueueHarness
          candidates={candidates}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />,
      );
    });
    await act(async () => {
      TestIntersectionObserver.instances.at(-1)?.trigger(['first', 'second']);
    });
    expect(imagePreviewResolver).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.render(
        <PreviewQueueHarness
          candidates={[...candidates].reverse()}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />,
      );
      pending.get('C:/work/first.png')?.('data:image/png;base64,first');
      pending.get('C:/work/second.png')?.('data:image/png;base64,second');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(imagePreviewResolver).toHaveBeenCalledTimes(2);
    const states = container.querySelector(
      '[data-testid="preview-states"]',
    )?.textContent;
    expect(states).toContain('"first":{"status":"ready"');
    expect(states).toContain('"second":{"status":"ready"');
  });

  it('drops offscreen queued work before a resolver slot becomes available', async () => {
    const pendingResolvers: Array<(value: string) => void> = [];
    const imagePreviewResolver = vi.fn(() => new Promise<string>(resolve => {
      pendingResolvers.push(resolve);
    }));
    const mediaPreviewResolver = vi.fn(async () => undefined);
    const candidates = [
      imageCandidate('visible-1'),
      imageCandidate('visible-2'),
      imageCandidate('left-before-load'),
    ];

    await act(async () => {
      root.render(
        <PreviewQueueHarness
          candidates={candidates}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />,
      );
    });
    await act(async () => {
      TestIntersectionObserver.instances.at(-1)?.trigger(
        candidates.map(candidate => candidate.key),
      );
    });
    expect(imagePreviewResolver).toHaveBeenCalledTimes(2);

    await act(async () => {
      TestIntersectionObserver.instances.at(-1)?.trigger(
        ['left-before-load'],
        false,
      );
      pendingResolvers.forEach(resolve => resolve('data:image/png;base64,done'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(imagePreviewResolver).toHaveBeenCalledTimes(2);
  });

  it('observes cards mounted later by the virtualized media window', async () => {
    const imagePreviewResolver = vi.fn(async () => 'data:image/png;base64,image');
    const mediaPreviewResolver = vi.fn(async () => undefined);
    const candidates = [
      imageCandidate('first-window'),
      imageCandidate('second-window'),
    ];

    await act(async () => {
      root.render(
        <PreviewQueueHarness
          candidates={candidates}
          renderedKeys={['first-window']}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />,
      );
    });

    await act(async () => {
      root.render(
        <PreviewQueueHarness
          candidates={candidates}
          renderedKeys={['second-window']}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      TestIntersectionObserver.instances.at(-1)?.trigger([
        'first-window',
        'second-window',
      ]);
      await Promise.resolve();
    });

    expect(imagePreviewResolver).toHaveBeenCalledTimes(1);
    expect(imagePreviewResolver.mock.calls[0]?.[0].filePath)
      .toBe('C:/work/second-window.png');
  });

  it('uses a bounded first-screen fallback when IntersectionObserver is unavailable', async () => {
    Object.defineProperty(dom.window, 'IntersectionObserver', {
      configurable: true,
      value: undefined,
    });
    vi.stubGlobal('IntersectionObserver', undefined);
    const imagePreviewResolver = vi.fn(async ({ filePath }) => (
      `data:image/png;base64,${filePath}`
    ));
    const mediaPreviewResolver = vi.fn(async () => undefined);
    const candidates = Array.from(
      { length: 20 },
      (_, index) => imageCandidate(`image-${index + 1}`),
    );

    await act(async () => {
      root.render(
        <PreviewQueueHarness
          candidates={candidates}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />,
      );
    });

    expect(imagePreviewResolver).toHaveBeenCalledTimes(12);
    expect(imagePreviewResolver.mock.calls.some(call => (
      call[0].filePath.endsWith('image-13.png')
    ))).toBe(false);
  });

  it('updates the fallback queue when a virtualized window mounts new cards', async () => {
    Object.defineProperty(dom.window, 'IntersectionObserver', {
      configurable: true,
      value: undefined,
    });
    vi.stubGlobal('IntersectionObserver', undefined);
    const imagePreviewResolver = vi.fn(async ({ filePath }) => (
      `data:image/png;base64,${filePath}`
    ));
    const mediaPreviewResolver = vi.fn(async () => undefined);
    const candidates = Array.from(
      { length: 20 },
      (_, index) => imageCandidate(`image-${index + 1}`),
    );

    await act(async () => {
      root.render(
        <PreviewQueueHarness
          candidates={candidates}
          renderedKeys={candidates.slice(0, 12).map(candidate => candidate.key)}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />,
      );
    });
    expect(imagePreviewResolver).toHaveBeenCalledTimes(12);

    await act(async () => {
      root.render(
        <PreviewQueueHarness
          candidates={candidates}
          renderedKeys={candidates.slice(12).map(candidate => candidate.key)}
          imagePreviewResolver={imagePreviewResolver}
          mediaPreviewResolver={mediaPreviewResolver}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(imagePreviewResolver).toHaveBeenCalledTimes(20);
    expect(imagePreviewResolver.mock.calls.some(call => (
      call[0].filePath.endsWith('image-20.png')
    ))).toBe(true);
  });

  it('bounds retained ready data URLs after scrolling through many cards', async () => {
    const imagePreviewResolver = vi.fn(async ({ filePath }) => (
      `data:image/png;base64,${filePath}`
    ));
    const mediaPreviewResolver = vi.fn(async () => undefined);
    const candidates = Array.from(
      { length: 100 },
      (_, index) => imageCandidate(`image-${index + 1}`),
    );

    for (let start = 0; start < candidates.length; start += 10) {
      const visibleKeys = candidates
        .slice(start, start + 10)
        .map(candidate => candidate.key);
      await act(async () => {
        root.render(
          <PreviewQueueHarness
            candidates={candidates}
            renderedKeys={visibleKeys}
            imagePreviewResolver={imagePreviewResolver}
            mediaPreviewResolver={mediaPreviewResolver}
          />,
        );
        await Promise.resolve();
      });
      await act(async () => {
        TestIntersectionObserver.instances.at(-1)?.trigger(visibleKeys);
        for (let index = 0; index < 12; index += 1) {
          await Promise.resolve();
        }
      });
    }

    expect(imagePreviewResolver).toHaveBeenCalledTimes(100);
    const serializedStates = container.querySelector(
      '[data-testid="preview-states"]',
    )?.textContent ?? '{}';
    const states = JSON.parse(serializedStates) as Record<
      string,
      { status: string }
    >;
    expect(Object.values(states).filter(state => state.status === 'ready'))
      .toHaveLength(WORKSPACE_MEDIA_READY_PREVIEW_LIMIT);
    expect(serializedStates).not.toContain('image-1.png');
    expect(serializedStates).toContain('image-100.png');
  });
});
