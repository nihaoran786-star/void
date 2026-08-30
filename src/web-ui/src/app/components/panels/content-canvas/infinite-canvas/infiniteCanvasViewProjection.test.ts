import { describe, expect, it, vi } from 'vitest';

import type { InfiniteCanvasDocument } from '@/shared/services/infinite-canvas';
import type { StylePresetCatalog } from '@/shared/services/style-preset';

import {
  emptyInfiniteCanvasProjectionCache,
  INFINITE_CANVAS_EDGE_TYPE,
  projectInfiniteCanvasView,
  referenceLabelsByNode,
  type InfiniteCanvasCardToolbarActions,
  type InfiniteCanvasEdgeActions,
  type InfiniteCanvasNodeActions,
  type InfiniteCanvasProjectionDeps,
} from './infiniteCanvasViewProjection';

function makeDocument(
  overrides: Partial<InfiniteCanvasDocument> = {},
): InfiniteCanvasDocument {
  return {
    documentId: 'doc-1',
    schemaVersion: '1',
    workspaceId: 'workspace-1',
    revision: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

const catalog = {
  getById: () => undefined,
} as unknown as StylePresetCatalog;

function makeDeps(
  overrides: Partial<InfiniteCanvasProjectionDeps> = {},
): InfiniteCanvasProjectionDeps {
  return {
    catalog,
    resolvePreviewUrl: async () => undefined,
    referenceLabels: new Map(),
    selectedIds: new Set(),
    manualReturnNodeIds: new Set(),
    openOverflow: () => undefined,
    openStylePicker: () => undefined,
    nodeActionsRef: { current: {} as InfiniteCanvasNodeActions },
    edgeActionsRef: { current: {} as InfiniteCanvasEdgeActions },
    cardToolbarActionsRef: { current: {} as InfiniteCanvasCardToolbarActions },
    cache: emptyInfiniteCanvasProjectionCache(),
    ...overrides,
  };
}

const imageDocument = makeDocument({
  nodes: [
    { nodeId: 'n-text', kind: 'text', position: { x: 1, y: 2 }, text: 'hello' },
    {
      nodeId: 'n-image',
      kind: 'image',
      position: { x: 3, y: 4 },
      mediaRef: { workspaceId: 'workspace-1', relativePath: 'a.png' },
    },
  ],
  edges: [{ edgeId: 'e-1', sourceNodeId: 'n-text', targetNodeId: 'n-image' }],
});

describe('projectInfiniteCanvasView', () => {
  it('projects each card and stamps the custom edge type', () => {
    const projection = projectInfiniteCanvasView(imageDocument, makeDeps());

    expect(projection.nodes.map(node => node.id)).toEqual(['n-text', 'n-image']);
    expect(projection.edges).toHaveLength(1);
    expect(projection.edges[0].type).toBe(INFINITE_CANVAS_EDGE_TYPE);
  });

  it('carries panel selection across, because the document does not hold it', () => {
    const projection = projectInfiniteCanvasView(
      imageDocument,
      makeDeps({ selectedIds: new Set(['n-image']) }),
    );

    expect(projection.nodes.find(node => node.id === 'n-image')?.selected).toBe(true);
    expect(projection.nodes.find(node => node.id === 'n-text')?.selected).toBe(false);
  });

  /**
   * H3's sentinel at the unit level: the panel test proves the preview
   * resolver is not called again, this proves the reason it is not.
   */
  it('hands an unchanged card back the very same data object', () => {
    const deps = makeDeps();
    const first = projectInfiniteCanvasView(imageDocument, deps);
    // A commit that lands after the coalescing window re-reads and re-parses
    // the file, so every document node is a fresh object even when nothing
    // about it changed. Structurally equal, referentially new.
    const reparsed = JSON.parse(JSON.stringify(imageDocument)) as InfiniteCanvasDocument;
    const second = projectInfiniteCanvasView(reparsed, { ...deps, cache: first.cache });

    expect(second.nodes[1].data).toBe(first.nodes[1].data);
  });

  it('rebuilds the data of a card whose content moved', () => {
    const deps = makeDeps();
    const first = projectInfiniteCanvasView(imageDocument, deps);
    const edited = makeDocument({
      ...imageDocument,
      nodes: imageDocument.nodes.map(node => (
        node.nodeId === 'n-image' ? { ...node, prompt: 'a cat' } : node
      )),
    });
    const second = projectInfiniteCanvasView(edited, { ...deps, cache: first.cache });

    expect(second.nodes[1].data).not.toBe(first.nodes[1].data);
    expect(second.nodes[1].data.prompt).toBe('a cat');
  });

  it('voids the whole cache when an input the cached callbacks closed over changes', () => {
    const deps = makeDeps();
    const first = projectInfiniteCanvasView(imageDocument, deps);
    const second = projectInfiniteCanvasView(imageDocument, {
      ...deps,
      cache: first.cache,
      resolvePreviewUrl: async () => undefined,
    });

    expect(second.nodes[1].data).not.toBe(first.nodes[1].data);
  });

  it('routes a card callback through the ref the panel owns, live', () => {
    const generate = vi.fn();
    const nodeActionsRef = { current: { generate } as unknown as InfiniteCanvasNodeActions };
    const projection = projectInfiniteCanvasView(imageDocument, makeDeps({ nodeActionsRef }));

    (projection.nodes[1].data.onGenerate as (nodeId: string) => void)('n-image');

    expect(generate).toHaveBeenCalledWith('n-image');
  });
});

describe('referenceLabelsByNode', () => {
  it('labels a card incoming picture references, and leaves the rest alone', () => {
    const labels = referenceLabelsByNode(makeDocument({
      nodes: [
        {
          nodeId: 'n-source',
          kind: 'image',
          position: { x: 0, y: 0 },
          mediaRef: { workspaceId: 'workspace-1', relativePath: 'a.png' },
        },
        { nodeId: 'n-target', kind: 'image', position: { x: 9, y: 9 } },
      ],
      edges: [{ edgeId: 'e-1', sourceNodeId: 'n-source', targetNodeId: 'n-target' }],
    }));

    expect(labels.get('n-target')).toHaveLength(1);
    expect(labels.get('n-source')).toBeUndefined();
  });
});
