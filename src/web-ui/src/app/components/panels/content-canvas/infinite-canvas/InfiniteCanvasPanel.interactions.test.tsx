/**
 * M4 interaction closure: image picking from the Workspace Media library,
 * style preset selection, the five placeholder image tools, and per-workspace
 * document isolation.
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

    await clickButton(button => button.textContent === 'infiniteCanvas.toolbar.addImage');

    // Only image items from the read-only library scan are offered.
    const items = Array.from(container.querySelectorAll('.infinite-canvas-picker__item'));
    expect(items.map(item => item.textContent)).toEqual(['hero.png']);

    await clickButton(button => button.textContent === 'hero.png');

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
      button.textContent === 'infiniteCanvas.imageNode.styleButton'
    ));
    expect(container.querySelector('.infinite-canvas-picker--style')).not.toBeNull();

    await clickButton(button => button.textContent?.startsWith('Sunset') ?? false);

    expect(container.querySelector('.infinite-canvas-picker--style')).toBeNull();
    const styleButton = container.querySelector('.infinite-canvas-node__style-button');
    expect(styleButton?.textContent).toBe('Sunset');
    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0]).toMatchObject({
      stylePresetId: 'cinematic:sunset',
    });
  });

  it('filters style presets by family through the catalog', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();
    await clickButton(button => (
      button.textContent === 'infiniteCanvas.imageNode.styleButton'
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
    expect(styleButton?.textContent).toBe('Noir');

    await clickButton(button => button.textContent === 'Noir');
    await clickButton(button => button.textContent === 'infiniteCanvas.stylePicker.clear');

    await service.flushPendingWrites();
    expect(readDocument(memory).nodes[0]).not.toHaveProperty('stylePresetId');
  });

  it('renders the five contract tools and shows the typed phase-2 unavailable state', async () => {
    seedDocument(memory, { nodes: [IMAGE_NODE] });
    await renderPanel();

    const toolIds = Array.from(container.querySelectorAll('.infinite-canvas-node__tool'))
      .map(button => button.getAttribute('data-tool-id'));
    expect(toolIds).toEqual(['upscale', 'expand', 'inpaint', 'erase', 'matting']);

    await clickButton(button => button.getAttribute('data-tool-id') === 'expand');

    const notice = container.querySelector('.infinite-canvas-panel__tool-notice');
    expect(notice).not.toBeNull();
    expect(notice!.getAttribute('data-error-kind')).toBe('unavailable');
    expect(notice!.getAttribute('data-tool-id')).toBe('expand');

    // The placeholder derives nothing, overwrites nothing, and calls no network.
    await service.flushPendingWrites();
    const persisted = readDocument(memory);
    expect(persisted.nodes).toHaveLength(1);
    expect(persisted.nodes[0]).toMatchObject({ mediaRef: IMAGE_NODE.mediaRef });
    expect(fetchSpy).not.toHaveBeenCalled();

    await clickButton(button => button.textContent === 'infiniteCanvas.tools.dismiss');
    expect(container.querySelector('.infinite-canvas-panel__tool-notice')).toBeNull();
  });

  it('keeps documents isolated per workspace', async () => {
    await renderPanel();
    await clickButton(button => button.textContent === 'infiniteCanvas.toolbar.addText');
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
