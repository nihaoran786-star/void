/**
 * M4 interaction closure: image picking from the Workspace Media library,
 * style preset selection, the five placeholder image tools, and per-workspace
 * document isolation.
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';

import { clickCanvasCreateMenuItem } from './infiniteCanvasGeneratorDriver.testkit';
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
  // Default W7 manifest reader: nothing on disk unless a test injects one.
  getInfiniteCanvasMediaJobReader: () => ({
    readTextFile: async () => null,
  }),
}));

// The real runtime module pulls flow_chat singletons; tests always inject a
// fake runtime through the panel prop instead.
vi.mock('./infiniteCanvasGenerationRuntime', () => ({
  createInfiniteCanvasGenerationRuntime: () => {
    throw new Error('Tests must inject a generation runtime.');
  },
}));

import type { StylePreset } from '@/shared/services/style-preset';
import { StylePresetCatalog } from '@/shared/services/style-preset';
import type {
  WorkspaceMediaLibraryService,
} from '@/shared/services/workspace-media/WorkspaceMediaTypes';
import {
  createInMemoryInfiniteCanvasPersistence,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
  InfiniteCanvasDocumentService,
  type InfiniteCanvasDocument,
  type InMemoryInfiniteCanvasPersistence,
} from '@/shared/services/infinite-canvas';
import { InfiniteCanvasPanel } from './InfiniteCanvasPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WORKSPACE = { workspaceId: 'workspace-a', workspacePath: 'C:/workspace-a' };

function preset(overrides: Partial<StylePreset>): StylePreset {
  return {
    presetId: 'cinematic:noir',
    schemaVersion: '1',
    family: 'cinematic',
    name: 'Noir',
    category: 'classic',
    origin: { project: 'kunpeng', license: 'MIT', sourcePath: 'style-library/index.json' },
    ...overrides,
  };
}

const TEST_CATALOG = new StylePresetCatalog([
  preset({ presetId: 'cinematic:noir', name: 'Noir', category: 'classic' }),
  preset({ presetId: 'cinematic:sunset', name: 'Sunset', category: 'warm' }),
  preset({
    presetId: 'mg-motion:pop',
    family: 'mg-motion',
    name: 'Pop Motion',
    category: 'brand',
  }),
], []);

const READY_LIBRARY: WorkspaceMediaLibraryService = {
  checkAvailability: async () => ({ status: 'available', firstDetectedAt: 1 }),
  scanLibrary: async () => ({
    status: 'ready',
    scannedAt: 1,
    items: [
      {
        id: 'img-1',
        kind: 'image',
        source: 'input',
        filePath: 'C:/workspace-a/media/input/hero.png',
        relativePath: 'media/input/hero.png',
        fileName: 'hero.png',
        extension: 'png',
      },
      {
        id: 'vid-1',
        kind: 'video',
        source: 'input',
        filePath: 'C:/workspace-a/media/input/clip.mp4',
        relativePath: 'media/input/clip.mp4',
        fileName: 'clip.mp4',
        extension: 'mp4',
      },
    ],
  }),
};

function documentPath(workspacePath: string, workspaceId: string): string {
  return infiniteCanvasDocumentFilePath(
    workspacePath,
    defaultInfiniteCanvasDocumentId(workspaceId),
  );
}

function seedDocument(
  memory: InMemoryInfiniteCanvasPersistence,
  overrides: Partial<InfiniteCanvasDocument> = {},
): void {
  const document: InfiniteCanvasDocument = {
    documentId: defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId),
    schemaVersion: '1',
    workspaceId: WORKSPACE.workspaceId,
    revision: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
  memory.files.set(
    documentPath(WORKSPACE.workspacePath, WORKSPACE.workspaceId),
    JSON.stringify(document),
  );
}

function readDocument(
  memory: InMemoryInfiniteCanvasPersistence,
  workspacePath = WORKSPACE.workspacePath,
  workspaceId = WORKSPACE.workspaceId,
): InfiniteCanvasDocument {
  const raw = memory.files.get(documentPath(workspacePath, workspaceId));
  expect(raw).toBeDefined();
  return JSON.parse(raw!) as InfiniteCanvasDocument;
}

const IMAGE_NODE = {
  nodeId: 'n-image',
  kind: 'image' as const,
  position: { x: 0, y: 0 },
  mediaRef: { workspacePath: WORKSPACE.workspacePath, relativePath: 'media/input/hero.png' },
};

describe('InfiniteCanvasPanel M4 interactions', () => {
  const stubRuntime = {
    gateway: {
      invoke: vi.fn(async (invocation: { operationId: string }) => ({
        operationId: invocation.operationId,
        status: 'succeeded' as const,
      })),
    },
    hasTargetSession: () => true,
  };

  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;
  let memory: InMemoryInfiniteCanvasPersistence;
  let service: InfiniteCanvasDocumentService;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    memory = createInMemoryInfiniteCanvasPersistence();
    service = new InfiniteCanvasDocumentService(memory.port, { debounceMs: 1 });
    flow.props = null;
    stubRuntime.gateway.invoke.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    service.dispose();
    vi.unstubAllGlobals();
  });

  async function renderPanel(props: Partial<React.ComponentProps<typeof InfiniteCanvasPanel>> = {}) {
    await act(async () => {
      root.render(
        <InfiniteCanvasPanel
          workspaceId={WORKSPACE.workspaceId}
          workspacePath={WORKSPACE.workspacePath}
          isActive
          service={service}
          resolvePreviewUrl={async () => undefined}
          mediaLibrary={READY_LIBRARY}
          catalog={TEST_CATALOG}
          generationRuntime={stubRuntime}
          {...props}
        />,
      );
    });
  }

  function clickButton(matcher: (button: HTMLButtonElement) => boolean): Promise<void> {
    const button = Array.from(container.querySelectorAll('button')).find(matcher);
    expect(button).toBeDefined();
    return act(async () => {
      button!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
  }

  it('adds an image node as a mediaRef reference picked from the library', async () => {
    await renderPanel();

    await clickCanvasCreateMenuItem(container, 'infiniteCanvas.toolbar.addImage');

    // Only image items from the read-only library scan are offered, and each
    // one is labelled by batch/folder so a library full of `image-001.png`
    // does not read as one file repeated (owner bug report 2026-08-26).
    const items = Array.from(container.querySelectorAll('.infinite-canvas-picker__item'));
    expect(items.map(item => item.textContent)).toEqual(['input / hero.png']);

    await clickButton(button => button.textContent === 'input / hero.png');

    expect(container.querySelector('.infinite-canvas-picker')).toBeNull();
    expect(flow.props.nodes).toHaveLength(1);
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0]).toMatchObject({
      kind: 'image',
      mediaRef: {
        workspacePath: WORKSPACE.workspacePath,
        relativePath: 'media/input/hero.png',
      },
    });
  });

  it('applies a style preset to an image node and shows its name as the label', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();

    await clickButton(button => (
      button.className.includes('infinite-canvas-node__style-button')
    ));
    expect(container.querySelector('.infinite-canvas-picker--style')).not.toBeNull();

    // P5 W6: a tile is picked by its preset id, not by its text. The tile now
    // also carries a thumbnail or a two-character swatch label, so matching on
    // leading text no longer identifies it.
    await clickButton(button => (
      button.getAttribute('data-canvas-style-preset') === 'cinematic:sunset'
    ));

    expect(container.querySelector('.infinite-canvas-picker--style')).toBeNull();
    const styleButton = container.querySelector('.infinite-canvas-node__style-button');
    expect(styleButton?.getAttribute('aria-label')).toBe('Sunset');
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0]).toMatchObject({
      stylePresetId: 'cinematic:sunset',
    });
  });

  it('filters style presets by family through the catalog', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await clickButton(button => (
      button.className.includes('infinite-canvas-node__style-button')
    ));

    const familySelect = container.querySelectorAll('select')[0];
    await act(async () => {
      Simulate.change(familySelect, { target: { value: 'mg-motion' } } as never);
    });

    const names = Array.from(container.querySelectorAll('.infinite-canvas-picker__item-name'))
      .map(node => node.textContent);
    expect(names).toEqual(['Pop Motion']);
  });

  it('clears an applied style preset', async () => {
    seedDocument(memory, { nodes: [{ ...IMAGE_NODE, stylePresetId: 'cinematic:noir' }] });
    await renderPanel();

    const styleButton = container.querySelector('.infinite-canvas-node__style-button');
    expect(styleButton?.getAttribute('aria-label')).toBe('Noir');

    await clickButton(button => (
      button.className.includes('infinite-canvas-node__style-button')
    ));
    await clickButton(button => button.textContent === 'infiniteCanvas.stylePicker.clear');

    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0]).not.toHaveProperty('stylePresetId');
  });

  it('keeps four contract tools on the pill and outpainting in the drawer', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();

    // §4 caps the pill at about ten icons. Four of the five contract tools
    // stay resident; `expand` is the low-traffic one and moved behind "more".
    const toolIds = Array.from(container.querySelectorAll('.infinite-canvas-node__tool'))
      .map(button => button.getAttribute('data-tool-id'));
    expect(toolIds).toEqual(['upscale', 'inpaint', 'erase', 'matting']);
    expect(container.querySelector('[data-tool-id="expand"]')).toBeNull();

    await clickButton(button => button.getAttribute('data-node-action') === 'more');
    await clickButton(button => button.getAttribute('data-tool-id') === 'expand');

    // P6: the drawer entry stays, but it now opens the outpainting EDITOR
    // rather than dispatching a sentence about a direction. Nothing is
    // dispatched, derived or overwritten until the frame is confirmed.
    expect(container.querySelector('[data-canvas-editor="expand"]')).not.toBeNull();
    expect(container.querySelector('.infinite-canvas-dialog')).toBeNull();

    expect(stubRuntime.gateway.invoke).not.toHaveBeenCalled();
    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes).toHaveLength(1);
    expect(persisted.nodes[0]).toMatchObject({ mediaRef: IMAGE_NODE.mediaRef });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // —— §4: the card pill toolbar ————————————————————————————————————————————

  it('hides the tools a card cannot run instead of greying them out', async () => {
    // A blank generation card has nothing to upscale, save or view.
    seedDocument(memory, {
      nodes: [{ nodeId: 'n-blank', kind: 'image' as const, position: { x: 0, y: 0 } }],
    });
    await renderPanel();

    const card = container.querySelector('[data-node-id="n-blank"]');
    expect(card).not.toBeNull();
    expect(card!.querySelectorAll('.infinite-canvas-node__tool')).toHaveLength(0);
    expect(card!.querySelector('[data-node-action="save-as"]')).toBeNull();
    expect(card!.querySelector('[data-node-action="open-viewer-entry"]')).toBeNull();
    // The card-scoped entries that always apply are still there.
    expect(card!.querySelector('[data-node-action="open-params"]')).not.toBeNull();
    expect(card!.querySelector('[data-node-action="more"]')).not.toBeNull();
  });

  it('caps the pill at ten resident icons in three groups', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();

    const pill = container.querySelector('.infinite-canvas-node__toolbar')!;
    const icons = Array.from(pill.querySelectorAll('button'));
    // Ten residents plus the overflow entry itself, per visual language §4.
    expect(icons).toHaveLength(11);
    expect(icons.filter(button => button.getAttribute('data-node-action') === 'more'))
      .toHaveLength(1);
    // Edit / organise / output / overflow: four hairline-separated blocks.
    expect(pill.getAttribute('data-canvas-toolbar-groups')).toBe('4');
    // Every resident says what it is, for the tooltip and for assistive tech.
    for (const button of icons) {
      expect(button.getAttribute('aria-label')).toBeTruthy();
      expect(button.getAttribute('title')).toBeTruthy();
    }
  });

  it('opens and closes the "more" drawer, and its entries act', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();

    expect(container.querySelector('[data-canvas-popover="card-overflow"]')).toBeNull();
    await clickButton(button => button.getAttribute('data-node-action') === 'more');

    const drawer = container.querySelector('[data-canvas-popover="card-overflow"]');
    expect(drawer).not.toBeNull();
    const actions = Array.from(drawer!.querySelectorAll('button'))
      .map(button => button.getAttribute('data-canvas-overflow-action'));
    expect(actions).toEqual([
      'expand',
      'reverse-prompt',
      'derive-video',
      'reveal',
      'copy',
      'duplicate',
      'delete',
    ]);

    // Escape closes it, the way every canvas surface closes.
    await act(async () => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });
    expect(container.querySelector('[data-canvas-popover="card-overflow"]')).toBeNull();

    // An entry inside it really acts: image-to-video derives a video card.
    await clickButton(button => button.getAttribute('data-node-action') === 'more');
    await clickButton(
      button => button.getAttribute('data-canvas-overflow-action') === 'derive-video',
    );
    expect(container.querySelector('[data-canvas-popover="card-overflow"]')).toBeNull();
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes.some(node => node.kind === 'video')).toBe(true);
  });

  it('offers only what a blank card can run in the drawer', async () => {
    seedDocument(memory, {
      nodes: [{ nodeId: 'n-blank', kind: 'image' as const, position: { x: 0, y: 0 } }],
    });
    await renderPanel();

    await clickButton(button => button.getAttribute('data-node-action') === 'more');
    const drawer = container.querySelector('[data-canvas-popover="card-overflow"]')!;
    const actions = Array.from(drawer.querySelectorAll('button'))
      .map(button => button.getAttribute('data-canvas-overflow-action'));
    // Nothing to outpaint, reverse-prompt, animate or show in a folder.
    expect(actions).toEqual(['copy', 'duplicate', 'delete']);
  });

  /**
   * P5 review C9: every piece of panel memory is scoped to ONE document, and
   * the P5 surfaces were left out of the effect that enforces it. An overflow
   * drawer left standing across a workspace switch points at a node id that
   * does not exist in the new document.
   */
  it('drops the P5 overflow drawer when the document underneath changes', async () => {
    seedDocument(memory, {
      nodes: [{ nodeId: 'n-blank', kind: 'image' as const, position: { x: 0, y: 0 } }],
    });
    await renderPanel();
    await clickButton(button => button.getAttribute('data-node-action') === 'more');
    expect(container.querySelector('[data-canvas-popover="card-overflow"]')).not.toBeNull();

    // Same root, so the panel's document-change effect is what has to clean
    // up — not an unmount.
    await renderPanel({ workspaceId: 'workspace-b', workspacePath: 'C:/workspace-b' });

    expect(container.querySelector('[data-canvas-popover="card-overflow"]')).toBeNull();
  });

  it('keeps documents isolated per workspace', async () => {
    await renderPanel();
    await clickCanvasCreateMenuItem(container, 'infiniteCanvas.toolbar.addText');
    await service.flushPendingWrites();

    await act(async () => root.unmount());
    root = createRoot(container);
    flow.props = null;

    const workspaceB = { workspaceId: 'workspace-b', workspacePath: 'C:/workspace-b' };
    await renderPanel({
      workspaceId: workspaceB.workspaceId,
      workspacePath: workspaceB.workspacePath,
    });

    expect(flow.props.nodes).toEqual([]);
    expect(readDocument(memory).nodes).toHaveLength(1);
    expect(readDocument(memory, workspaceB.workspacePath, workspaceB.workspaceId).nodes)
      .toHaveLength(0);
  });
});
