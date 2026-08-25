/**
 * P4 W1 behavior closure: the full-screen media viewer and "save a copy".
 *
 * Behavior only — no style or copy assertions. What is pinned here: the
 * viewer opens from a media card, closes on Esc and on the backdrop, walks
 * the other media cards with the arrow keys, opens a `<video>` (never
 * autoplaying) for a video card, hands the absolute media path to the
 * injected save port, survives a rejecting port, and offers no entry on a
 * blank card.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

const flow = vi.hoisted(() => ({
  props: null as any,
}));

vi.mock('@xyflow/react', async () => {
  const React = (await import('react')).default;
  return {
    ReactFlow: (props: any) => {
      flow.props = props;
      return React.createElement(
        'div',
        { 'data-testid': 'react-flow' },
        props.nodes.map((node: any) => {
          const NodeComponent = props.nodeTypes[node.type];
          return React.createElement(
            'div',
            { key: node.id, 'data-node-id': node.id },
            React.createElement(NodeComponent, {
              id: node.id,
              data: node.data,
              selected: false,
            }),
          );
        }),
        props.children,
      );
    },
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
    applyNodeChanges: (changes: any[], nodes: any[]) => nodes
      .filter(node => !changes.some(change => change.type === 'remove' && change.id === node.id)),
    applyEdgeChanges: (changes: any[], edges: any[]) => edges
      .filter(edge => !changes.some(change => change.type === 'remove' && change.id === edge.id)),
  };
});

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/shared/services/workspace-media/WorkspaceMediaPreviewResolver', () => ({
  resolveWorkspaceMediaPreviewUrl: vi.fn(async () => undefined),
}));

vi.mock('@/shared/services/workspace-media/WorkspaceMediaLibrary', () => ({
  workspaceMediaLibraryService: {
    checkAvailability: async () => ({ status: 'unknown' }),
    scanLibrary: async () => ({ status: 'empty', scannedAt: 0 }),
  },
}));

vi.mock('./infiniteCanvasDocumentGateway', () => ({
  getInfiniteCanvasDocumentService: () => {
    throw new Error('Tests must inject a document service.');
  },
  getInfiniteCanvasMediaJobReader: () => ({
    readTextFile: async () => null,
  }),
  getInfiniteCanvasMediaSaver: () => {
    throw new Error('Tests must inject a save port.');
  },
}));

vi.mock('./infiniteCanvasGenerationRuntime', () => ({
  createInfiniteCanvasGenerationRuntime: () => {
    throw new Error('Tests must inject a generation runtime.');
  },
}));

import { StylePresetCatalog } from '@/shared/services/style-preset';
import {
  createInMemoryInfiniteCanvasPersistence,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
  InfiniteCanvasDocumentService,
  type InfiniteCanvasDocument,
  type InfiniteCanvasNode,
  type InMemoryInfiniteCanvasPersistence,
} from '@/shared/services/infinite-canvas';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-viewer', workspacePath: 'C:/workspace-a' };
const TEST_CATALOG = new StylePresetCatalog([], []);

const IMAGE_NODE: InfiniteCanvasNode = {
  nodeId: 'n-image',
  kind: 'image',
  position: { x: 0, y: 0 },
  mediaRef: {
    workspacePath: WORKSPACE.workspacePath,
    relativePath: 'media/generated/b1/image-001.png',
  },
};

const VIDEO_NODE: InfiniteCanvasNode = {
  nodeId: 'n-video',
  kind: 'video',
  position: { x: 400, y: 0 },
  mediaRef: {
    workspacePath: WORKSPACE.workspacePath,
    relativePath: 'media/generated/b2/video-001.mp4',
  },
};

const BLANK_NODE: InfiniteCanvasNode = {
  nodeId: 'n-blank',
  kind: 'image',
  position: { x: 800, y: 0 },
  prompt: 'a quiet street',
};

describe('InfiniteCanvasPanel P4 W1 media viewer', () => {
  const stubRuntime = {
    gateway: { invoke: vi.fn(async () => ({ operationId: 'op', status: 'succeeded' as const })) },
    hasTargetSession: () => true,
  };

  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent);
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    memory = createInMemoryInfiniteCanvasPersistence();
    service = new InfiniteCanvasDocumentService(memory.port, { debounceMs: 1 });
    flow.props = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    service.dispose();
    vi.unstubAllGlobals();
  });

  function seed(nodes: readonly InfiniteCanvasNode[]): void {
    const document: InfiniteCanvasDocument = {
      documentId: defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
      schemaVersion: '1',
      workspaceId: WORKSPACE.workspaceId,
      revision: 1,
      nodes: [...nodes],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    };
    memory.files.set(
      infiniteCanvasDocumentFilePath(
        WORKSPACE.workspacePath,
        defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
      ),
      JSON.stringify(document),
    );
  }

  async function renderPanel(
    props: Partial<React.ComponentProps<typeof InfiniteCanvasPanel>> = {},
  ): Promise<void> {
    await act(async () => {
      root.render(
        <InfiniteCanvasPanel
          workspaceId={WORKSPACE.workspaceId}
          workspacePath={WORKSPACE.workspacePath}
          isActive
          service={service}
          resolvePreviewUrl={async mediaRef => `data:preview,${mediaRef.relativePath}`}
          catalog={TEST_CATALOG}
          generationRuntime={stubRuntime}
          {...props}
        />,
      );
    });
  }

  function viewer(): HTMLElement | null {
    return container.querySelector('[data-canvas-viewer="open"]');
  }

  function action(name: string): HTMLElement {
    const element = container.querySelector<HTMLElement>(`[data-viewer-action="${name}"]`);
    if (!element) throw new Error(`viewer action not found: ${name}`);
    return element;
  }

  async function openViewer(nodeId: string): Promise<void> {
    const card = container.querySelector(`[data-node-id="${nodeId}"]`);
    const trigger = card?.querySelector<HTMLButtonElement>(
      '[data-node-action="open-viewer-entry"]',
    );
    if (!trigger) throw new Error(`no viewer entry on ${nodeId}`);
    await act(async () => {
      Simulate.click(trigger);
    });
  }

  async function pressKey(key: string): Promise<void> {
    await act(async () => {
      dom.window.document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key, bubbles: true }),
      );
    });
  }

  it('opens the viewer from a media card and closes it with Escape', async () => {
    seed([IMAGE_NODE]);
    await renderPanel();
    expect(viewer()).toBeNull();

    await openViewer('n-image');
    expect(viewer()).not.toBeNull();
    expect(container.querySelector('[data-viewer-media="image"]')).not.toBeNull();

    await pressKey('Escape');
    expect(viewer()).toBeNull();
  });

  it('closes when the backdrop is clicked', async () => {
    seed([IMAGE_NODE]);
    await renderPanel();
    await openViewer('n-image');

    await act(async () => {
      Simulate.click(action('backdrop'));
    });
    expect(viewer()).toBeNull();
  });

  it('walks the other media cards with the arrow keys and wraps around', async () => {
    seed([IMAGE_NODE, VIDEO_NODE]);
    await renderPanel();
    await openViewer('n-image');
    expect(viewer()?.getAttribute('data-media-kind')).toBe('image');

    await pressKey('ArrowRight');
    expect(viewer()?.getAttribute('data-media-kind')).toBe('video');

    // Two items: one more step wraps back to the first card.
    await pressKey('ArrowRight');
    expect(viewer()?.getAttribute('data-media-kind')).toBe('image');

    await pressKey('ArrowLeft');
    expect(viewer()?.getAttribute('data-media-kind')).toBe('video');
  });

  it('renders a video element that never autoplays', async () => {
    seed([VIDEO_NODE]);
    await renderPanel();
    await openViewer('n-video');

    const video = container.querySelector('[data-viewer-media="video"]');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('autoplay')).toBeNull();
    expect(video?.getAttribute('preload')).toBe('metadata');
    // A single media card gives the viewer nothing to step to.
    expect(container.querySelector('[data-viewer-action="next"]')).toBeNull();
  });

  it('hands the joined absolute media path to the save port', async () => {
    const saveMediaAs = vi.fn(async () => undefined);
    seed([IMAGE_NODE]);
    await renderPanel({ saveMediaAs });
    await openViewer('n-image');

    await act(async () => {
      Simulate.click(action('save'));
    });

    expect(saveMediaAs).toHaveBeenCalledTimes(1);
    expect(saveMediaAs.mock.calls[0][0])
      .toBe('C:/workspace-a/media/generated/b1/image-001.png');
    // Saving must not disturb the document.
    expect(viewer()).not.toBeNull();
  });

  it('surfaces a typed notice when the save port rejects, keeping the panel up', async () => {
    const saveMediaAs = vi.fn(async () => {
      throw new Error('dialog exploded');
    });
    seed([IMAGE_NODE]);
    await renderPanel({ saveMediaAs });
    await openViewer('n-image');

    await act(async () => {
      Simulate.click(action('save'));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-canvas-surface-state="ready"]')).not.toBeNull();
    const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
    expect(notice?.textContent).toContain('infiniteCanvas.viewer.saveFailed');
  });

  // —— §5: the inline video transport ———————————————————————————————————————

  it('gives a video card its own transport bar instead of the browser chrome', async () => {
    seed([VIDEO_NODE]);
    await renderPanel();
    await act(async () => {
      await Promise.resolve();
    });

    const card = container.querySelector('[data-node-id="n-video"]');
    expect(card).not.toBeNull();
    const video = card!.querySelector('video');
    expect(video).not.toBeNull();
    // The native control chrome is gone; ours is there instead.
    expect(video!.hasAttribute('controls')).toBe(false);
    expect(card!.querySelector('[data-canvas-video="transport"]')).not.toBeNull();
    for (const action of ['play', 'seek', 'fullscreen', 'mute']) {
      expect(card!.querySelector(`[data-canvas-video-action="${action}"]`)).not.toBeNull();
    }
    expect(card!.querySelector('[data-canvas-video-time="elapsed"]')?.textContent).toBe('0:00');
  });

  it('toggles mute from the card without touching the document', async () => {
    seed([VIDEO_NODE]);
    await renderPanel();
    await act(async () => {
      await Promise.resolve();
    });

    const mute = container.querySelector<HTMLButtonElement>(
      '[data-canvas-video-action="mute"]',
    );
    if (!mute) throw new Error('no mute toggle');
    expect(mute.getAttribute('data-muted')).toBeNull();
    await act(async () => {
      Simulate.click(mute);
    });
    expect(
      container.querySelector('[data-canvas-video-action="mute"]')
        ?.getAttribute('data-muted'),
    ).toBe('true');
  });

  it('offers no viewer entry on a blank generation card', async () => {
    seed([BLANK_NODE]);
    await renderPanel();

    const card = container.querySelector('[data-node-id="n-blank"]');
    expect(card).not.toBeNull();
    expect(card?.querySelector('[data-node-action="open-viewer-entry"]')).toBeNull();
    expect(card?.querySelector('[data-node-action="open-viewer"]')).toBeNull();
  });
});
