/**
 * Behavior closure for the 2026-08-26 owner feedback round.
 *
 * What is pinned here, one owner complaint at a time:
 * 1. The three overlays are compact anchored popovers with NO close button;
 *    a press outside closes them, Escape closes them, and a press inside does
 *    not.
 * 2. The library picker loads its tiles through the panel's forceDataUrl
 *    resolver (never the library's refused `thumbnailUrl`), and labels tiles
 *    so two batches of `image-001.png` are told apart.
 * 3. The generator is centred on its card and overhangs it on both sides.
 * 4. A reference thumbnail can be dropped, which cuts that edge from the
 *    document and leaves both cards and their media alone.
 * 5. Connections can be broken: Delete on a selected edge, and the `×` on the
 *    midpoint handle.
 *
 * Behavior only: no style assertions beyond the geometry the owner asked for
 * in words ("symmetric, a little longer"), which is behaviour of the layout.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';

const flow = vi.hoisted(() => ({ props: null as any }));

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
  getInfiniteCanvasMediaJobReader: () => ({ readTextFile: async () => null }),
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
  INFINITE_CANVAS_IMAGE_MODELS,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
  InfiniteCanvasDocumentService,
  type InfiniteCanvasDocument,
  type InfiniteCanvasNode,
  type InMemoryInfiniteCanvasPersistence,
} from '@/shared/services/infinite-canvas';
import type { WorkspaceMediaItem } from '@/shared/services/workspace-media/WorkspaceMediaTypes';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';
import { InfiniteCanvasEdge } from './InfiniteCanvasEdge';
import { workspaceMediaTileLabel } from './infiniteCanvasMediaLabels';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-popovers', workspacePath: 'C:/workspace-x' };
const DOCUMENT_ID = defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId);
const TEST_CATALOG = new StylePresetCatalog([], []);

const IMAGE_CARD: InfiniteCanvasNode = {
  nodeId: 'card-image',
  kind: 'image',
  position: { x: 100, y: 100 },
  mediaRef: {
    workspacePath: WORKSPACE.workspacePath,
    relativePath: 'media/generated/b1/image-001.png',
  },
};

const REFERENCE_CARD: InfiniteCanvasNode = {
  nodeId: 'card-reference',
  kind: 'image',
  position: { x: -300, y: 100 },
  mediaRef: {
    workspacePath: WORKSPACE.workspacePath,
    relativePath: 'media/generated/b2/image-001.png',
  },
};

/**
 * Two batches, each with a file called `image-001.png` — exactly the library
 * that produced the owner's screenshot of a grid reading the same name over
 * and over. `thumbnailUrl` carries the asset-protocol URL the real library
 * fills in, so a picker that still used it would show broken images here.
 */
const LIBRARY_ITEMS: WorkspaceMediaItem[] = [
  {
    id: 'a',
    kind: 'image',
    source: 'generated',
    generatedIdentity: { batchId: 'batch-alpha', itemIndex: 1 },
    filePath: 'C:/workspace-x/media/generated/batch-alpha/image-001.png',
    relativePath: 'media/generated/batch-alpha/image-001.png',
    fileName: 'image-001.png',
    extension: 'png',
    thumbnailUrl: 'http://asset.localhost/refused-by-the-webview.png',
  },
  {
    id: 'b',
    kind: 'image',
    source: 'generated',
    generatedIdentity: { batchId: 'batch-beta', itemIndex: 1 },
    filePath: 'C:/workspace-x/media/generated/batch-beta/image-001.png',
    relativePath: 'media/generated/batch-beta/image-001.png',
    fileName: 'image-001.png',
    extension: 'png',
    thumbnailUrl: 'http://asset.localhost/refused-by-the-webview.png',
  },
];

const READY_LIBRARY = {
  checkAvailability: async () => ({ status: 'available' as const, firstDetectedAt: 0 }),
  scanLibrary: async () => ({
    status: 'ready' as const,
    items: LIBRARY_ITEMS,
    scannedAt: 0,
  }),
} as never;

describe('InfiniteCanvas 2026-08-26 owner feedback', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let resolved: string[];

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    memory = createInMemoryInfiniteCanvasPersistence();
    service = new InfiniteCanvasDocumentService(memory.port, { debounceMs: 1 });
    resolved = [];
    flow.props = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    service.dispose();
    vi.unstubAllGlobals();
  });

  function documentPath(): string {
    return infiniteCanvasDocumentFilePath(WORKSPACE.workspacePath, DOCUMENT_ID);
  }

  function seed(
    nodes: readonly InfiniteCanvasNode[],
    edges: InfiniteCanvasDocument['edges'] = [],
  ): void {
    const document: InfiniteCanvasDocument = {
      documentId: DOCUMENT_ID,
      schemaVersion: '1',
      workspaceId: WORKSPACE.workspaceId,
      revision: 1,
      nodes: [...nodes],
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
    };
    memory.files.set(documentPath(), JSON.stringify(document));
  }

  async function renderPanel(): Promise<void> {
    await act(async () => {
      root.render(
        <InfiniteCanvasPanel
          workspaceId={WORKSPACE.workspaceId}
          workspacePath={WORKSPACE.workspacePath}
          isActive
          service={service}
          mediaLibrary={READY_LIBRARY}
          catalog={TEST_CATALOG}
          resolvePreviewUrl={async mediaRef => {
            resolved.push(mediaRef.relativePath);
            return `data:preview,${mediaRef.relativePath}`;
          }}
          generationRuntime={{
            gateway: { invoke: async () => ({ operationId: 'x', status: 'succeeded' as const }) },
            hasTargetSession: () => true,
          } as never}
        />,
      );
    });
  }

  function persisted(): InfiniteCanvasDocument {
    return JSON.parse(memory.files.get(documentPath())!) as InfiniteCanvasDocument;
  }

  async function settle(): Promise<void> {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  async function select(nodeIds: readonly string[]): Promise<void> {
    await act(async () => {
      flow.props.onSelectionChange({ nodes: nodeIds.map(id => ({ id })), edges: [] });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  async function selectEdges(edgeIds: readonly string[]): Promise<void> {
    await act(async () => {
      flow.props.onSelectionChange({ nodes: [], edges: edgeIds.map(id => ({ id })) });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  async function click(element: Element): Promise<void> {
    await act(async () => {
      Simulate.click(element as Element as HTMLElement);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  /** A real press, which is what the shared dismiss contract listens for. */
  async function pressOn(element: Element): Promise<void> {
    await act(async () => {
      element.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  async function pressKey(key: string): Promise<void> {
    await act(async () => {
      dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  function popover(kind: string): HTMLElement | null {
    return container.querySelector<HTMLElement>(`[data-canvas-popover="${kind}"]`);
  }

  function generatorAction(name: string): HTMLElement {
    const element = container.querySelector<HTMLElement>(
      `[data-canvas-generator-action="${name}"]`,
    );
    if (!element) throw new Error(`no generator action: ${name}`);
    return element;
  }

  // —— 1. compact anchored popovers, closed by pressing out or Escape ————————

  it('opens the parameter popover anchored to the generator bar, with no close button', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();
    await select([IMAGE_CARD.nodeId]);

    await click(generatorAction('params'));

    const surface = popover('params');
    expect(surface).not.toBeNull();
    // Anchored to the control that opened it, not parked across the panel.
    expect(surface?.getAttribute('data-canvas-popover-anchored')).toBe('true');
    // The owner asked for the close buttons to go, everywhere.
    expect(surface?.querySelector('.infinite-canvas-picker__close')).toBeNull();
    // §7 wants 260–320px; anything wider is the slab the owner rejected.
    const width = Number.parseInt(surface!.style.width, 10);
    expect(width).toBeGreaterThanOrEqual(260);
    expect(width).toBeLessThanOrEqual(320);
  });

  it('closes the parameter popover on a press outside and on Escape', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();
    await select([IMAGE_CARD.nodeId]);

    await click(generatorAction('params'));
    expect(popover('params')).not.toBeNull();

    // A press on the surface itself is not a way out.
    await pressOn(popover('params')!);
    expect(popover('params')).not.toBeNull();

    await pressOn(dom.window.document.body);
    expect(popover('params')).toBeNull();

    await click(generatorAction('params'));
    expect(popover('params')).not.toBeNull();
    await pressKey('Escape');
    expect(popover('params')).toBeNull();
  });

  it('gives the style picker the same dismissal contract', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();
    await select([IMAGE_CARD.nodeId]);

    await click(generatorAction('style'));
    const surface = popover('style');
    expect(surface).not.toBeNull();
    expect(surface?.querySelector('.infinite-canvas-picker__close')).toBeNull();

    await pressOn(dom.window.document.body);
    expect(popover('style')).toBeNull();
  });

  it('gives the library picker the same dismissal contract', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();

    const library = container.querySelector('[data-canvas-rail-action="library"]');
    await click(library!);
    await settle();

    const surface = popover('library');
    expect(surface).not.toBeNull();
    expect(surface?.querySelector('.infinite-canvas-picker__close')).toBeNull();

    await pressKey('Escape');
    expect(popover('library')).toBeNull();
  });

  // —— 1b. §7.3-A: two popovers, never one crowded panel ————————————————————

  it('opens the model list from the model name and the parameters from the pill', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();
    await select([IMAGE_CARD.nodeId]);

    await click(generatorAction('model'));
    expect(popover('model')).not.toBeNull();
    // Mutually exclusive: the parameters are not stacked underneath it.
    expect(popover('params')).toBeNull();

    await click(generatorAction('params'));
    expect(popover('params')).not.toBeNull();
    expect(popover('model')).toBeNull();

    // And back again, without either surface piling up.
    await click(generatorAction('model'));
    expect(popover('model')).not.toBeNull();
    expect(popover('params')).toBeNull();
    // §7.3-E: no title bar, no close button.
    expect(popover('model')?.querySelector('.infinite-canvas-picker__close')).toBeNull();
    await pressKey('Escape');
    expect(popover('model')).toBeNull();
  });

  /**
   * §6.3: the bar's three readouts became pressable pills. The count pill is
   * the one that had no coverage, and "a pill that does nothing" is exactly the
   * failure the restyle could have introduced.
   */
  it('opens the parameters from the count pill too', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();
    await select([IMAGE_CARD.nodeId]);

    await click(generatorAction('count'));
    expect(popover('params')).not.toBeNull();
    expect(popover('model')).toBeNull();
  });

  it('lists every model with the capability chips the table knows', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();
    await select([IMAGE_CARD.nodeId]);
    await click(generatorAction('model'));

    const rows = Array.from(
      popover('model')!.querySelectorAll<HTMLElement>('[data-params-option]'),
    );
    expect(rows.length).toBe(INFINITE_CANVAS_IMAGE_MODELS.length);
    // The default model is the one highlighted on a card that never chose one.
    expect(rows[0].getAttribute('data-params-option')).toBe('gpt-image-2');
    expect(rows[0].getAttribute('data-selected')).toBe('true');
    // Chips come from the capability table: gpt-image-2 tops out at 4k.
    expect(rows[0].querySelector('[data-model-chip="resolution"]')?.textContent).toBe('4K');
    // No model in the table records audio, so no speaker is drawn.
    expect(popover('model')!.querySelector('[data-model-chip="audio"]')).toBeNull();
  });

  // —— 2. the broken-thumbnail bug ————————————————————————————————————————

  it('loads library tiles through the forceDataUrl resolver, not the asset URL', async () => {
    seed([]);
    await renderPanel();

    await click(container.querySelector('[data-canvas-rail-action="library"]')!);
    await settle();

    const images = Array.from(
      container.querySelectorAll<HTMLImageElement>('.infinite-canvas-picker__thumbnail'),
    );
    expect(images).toHaveLength(2);
    for (const image of images) {
      // The bug: `http://asset.localhost/...` from convertFileSrc, which this
      // app's webview refuses because assetProtocol is off.
      expect(image.getAttribute('src')).not.toContain('asset.localhost');
      expect(image.getAttribute('src')).toContain('data:preview,');
    }
    expect(resolved).toContain('media/generated/batch-alpha/image-001.png');
    expect(resolved).toContain('media/generated/batch-beta/image-001.png');
  });

  it('labels same-named files by batch so the grid is not one name repeated', async () => {
    expect(workspaceMediaTileLabel(LIBRARY_ITEMS[0]))
      .toBe('batch-alpha / image-001.png');
    expect(workspaceMediaTileLabel(LIBRARY_ITEMS[1]))
      .toBe('batch-beta / image-001.png');
    // Ungenerated media has no batch; the containing folder still separates it.
    expect(workspaceMediaTileLabel({
      ...LIBRARY_ITEMS[0],
      generatedIdentity: undefined,
      relativePath: 'media/input/hero.png',
      fileName: 'hero.png',
    })).toBe('input / hero.png');
  });

  // —— 3. the generator is symmetric about its card ————————————————————————

  it('centres the generator on the card and overhangs it on both sides', async () => {
    seed([IMAGE_CARD]);
    await renderPanel();
    await select([IMAGE_CARD.nodeId]);

    const generator = container.querySelector<HTMLElement>('[data-canvas-generator="root"]');
    expect(generator).not.toBeNull();
    const left = Number.parseFloat(generator!.style.left);
    const width = Number.parseFloat(generator!.style.width);

    // The card box the panel falls back to under jsdom, at zoom 1 and the
    // seeded position: x = 100, width = 280.
    const cardLeft = 100;
    const cardWidth = 280;
    // Longer than the card, and by the same amount on each side.
    expect(width).toBeGreaterThan(cardWidth);
    expect(left).toBeLessThan(cardLeft);
    expect(left + width / 2).toBeCloseTo(cardLeft + cardWidth / 2, 5);
  });

  // —— 4. dropping a reference from the generator ——————————————————————————

  it('drops a reference from its thumbnail, cutting only that edge', async () => {
    seed([REFERENCE_CARD, IMAGE_CARD], [
      { edgeId: 'edge-1', sourceNodeId: REFERENCE_CARD.nodeId, targetNodeId: IMAGE_CARD.nodeId },
    ]);
    await renderPanel();
    await select([IMAGE_CARD.nodeId]);

    const remove = container.querySelector(
      `[data-canvas-generator-action="remove-reference"][data-reference-node="${REFERENCE_CARD.nodeId}"]`,
    );
    expect(remove).not.toBeNull();

    await click(remove!);
    await service.flushPendingWrites();

    const document = persisted();
    expect(document.edges).toHaveLength(0);
    // Both cards, and both cards' media, are untouched.
    expect(document.nodes.map(node => node.nodeId).sort())
      .toEqual([IMAGE_CARD.nodeId, REFERENCE_CARD.nodeId].sort());
    expect(document.nodes.find(node => node.nodeId === REFERENCE_CARD.nodeId)?.mediaRef)
      .toEqual(REFERENCE_CARD.mediaRef);
  });

  // —— 5. breaking connections ————————————————————————————————————————————

  it('deletes a selected connection without the card deletion dialog', async () => {
    seed([REFERENCE_CARD, IMAGE_CARD], [
      { edgeId: 'edge-1', sourceNodeId: REFERENCE_CARD.nodeId, targetNodeId: IMAGE_CARD.nodeId },
    ]);
    await renderPanel();

    await selectEdges(['edge-1']);
    await pressKey('Delete');
    await service.flushPendingWrites();

    // No confirmation: a wire holds no media, so there is nothing to warn about.
    expect(container.querySelector('[data-canvas-confirm="delete"]')).toBeNull();
    const document = persisted();
    expect(document.edges).toHaveLength(0);
    expect(document.nodes).toHaveLength(2);
  });

  it('undoes a broken connection', async () => {
    seed([REFERENCE_CARD, IMAGE_CARD], [
      { edgeId: 'edge-1', sourceNodeId: REFERENCE_CARD.nodeId, targetNodeId: IMAGE_CARD.nodeId },
    ]);
    await renderPanel();

    await selectEdges(['edge-1']);
    await pressKey('Delete');
    await settle();
    expect(flow.props.edges).toHaveLength(0);

    await act(async () => {
      dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await service.flushPendingWrites();

    expect(persisted().edges.map(edge => edge.edgeId)).toEqual(['edge-1']);
  });

  it('offers a break handle on the connection itself', async () => {
    const onDisconnect = vi.fn();
    const edgeRoot = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(edgeRoot);
    const edgeMount = createRoot(edgeRoot);

    await act(async () => {
      edgeMount.render(
        <svg>
          <InfiniteCanvasEdge
            id="edge-1"
            sourceX={0}
            sourceY={0}
            targetX={200}
            targetY={0}
            data={{ onDisconnect }}
          />
        </svg>,
      );
    });

    const handle = edgeRoot.querySelector('[data-canvas-edge-action="disconnect"]');
    expect(handle).not.toBeNull();
    expect(handle?.getAttribute('data-edge-id')).toBe('edge-1');

    await act(async () => {
      Simulate.click(handle as unknown as Element as HTMLElement);
    });
    expect(onDisconnect).toHaveBeenCalledWith('edge-1');

    await act(async () => edgeMount.unmount());
  });
});
