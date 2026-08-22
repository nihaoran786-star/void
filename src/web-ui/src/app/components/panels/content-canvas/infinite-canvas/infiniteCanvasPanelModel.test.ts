import { describe, expect, it } from 'vitest';

import type { InfiniteCanvasDocument } from '@/shared/services/infinite-canvas';
import {
  addImageNodeContent,
  addTextNodeContent,
  connectNodesContent,
  createInfiniteCanvasId,
  INFINITE_CANVAS_IMAGE_NODE_TYPE,
  INFINITE_CANVAS_TEXT_NODE_TYPE,
  moveNodeContent,
  removeEdgesContent,
  removeNodesContent,
  setNodeStylePresetContent,
  setNodeTextContent,
  setViewportContent,
  toFlowEdgeViews,
  toFlowNodeViews,
} from './infiniteCanvasPanelModel';

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

describe('infiniteCanvasPanelModel', () => {
  it('creates distinct opaque ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createInfiniteCanvasId('node')));
    expect(ids.size).toBe(50);
  });

  it('projects text and image nodes and preserves but does not project group nodes', () => {
    const document = makeDocument({
      nodes: [
        { nodeId: 'n-text', kind: 'text', position: { x: 1, y: 2 }, text: 'hello' },
        {
          nodeId: 'n-image',
          kind: 'image',
          position: { x: 3, y: 4 },
          mediaRef: { workspacePath: 'C:/ws', relativePath: 'media/input/a.png' },
          stylePresetId: 'cinematic:noir',
        },
        { nodeId: 'n-group', kind: 'group', position: { x: 5, y: 6 } },
      ],
    });

    const views = toFlowNodeViews(document.nodes);
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({
      id: 'n-text',
      type: INFINITE_CANVAS_TEXT_NODE_TYPE,
      data: { text: 'hello' },
    });
    expect(views[1]).toMatchObject({
      id: 'n-image',
      type: INFINITE_CANVAS_IMAGE_NODE_TYPE,
      data: {
        mediaRef: { workspacePath: 'C:/ws', relativePath: 'media/input/a.png' },
        stylePresetId: 'cinematic:noir',
      },
    });

    // Group nodes stay in the document content untouched by other mutations.
    const moved = moveNodeContent(document, 'n-text', { x: 9, y: 9 });
    expect(moved.nodes.find(node => node.nodeId === 'n-group')).toBeDefined();
  });

  it('projects edges into flow edge views', () => {
    const document = makeDocument({
      edges: [{ edgeId: 'e-1', sourceNodeId: 'a', targetNodeId: 'b' }],
    });
    expect(toFlowEdgeViews(document.edges)).toEqual([
      { id: 'e-1', source: 'a', target: 'b' },
    ]);
  });

  it('adds text and image nodes without mutating the source document', () => {
    const document = makeDocument();

    const withText = addTextNodeContent(document, 'n-1', { x: 10, y: 20 });
    expect(withText.nodes).toEqual([
      { nodeId: 'n-1', kind: 'text', position: { x: 10, y: 20 }, text: '' },
    ]);

    const withImage = addImageNodeContent(document, 'n-2', { x: 1, y: 1 }, {
      workspacePath: 'C:/ws',
      relativePath: 'media/input/b.png',
    });
    expect(withImage.nodes).toEqual([
      {
        nodeId: 'n-2',
        kind: 'image',
        position: { x: 1, y: 1 },
        mediaRef: { workspacePath: 'C:/ws', relativePath: 'media/input/b.png' },
      },
    ]);
    expect(document.nodes).toHaveLength(0);
  });

  it('updates text only on the addressed text node', () => {
    const document = makeDocument({
      nodes: [
        { nodeId: 'n-1', kind: 'text', position: { x: 0, y: 0 }, text: 'old' },
        {
          nodeId: 'n-2',
          kind: 'image',
          position: { x: 0, y: 0 },
          mediaRef: { workspacePath: 'C:/ws', relativePath: 'a.png' },
        },
      ],
    });

    const next = setNodeTextContent(document, 'n-1', 'new');
    expect(next.nodes[0]).toMatchObject({ text: 'new' });

    const unchanged = setNodeTextContent(document, 'n-2', 'new');
    expect(unchanged.nodes[1]).not.toHaveProperty('text');
  });

  it('sets and clears the style preset on image nodes only', () => {
    const document = makeDocument({
      nodes: [
        {
          nodeId: 'n-image',
          kind: 'image',
          position: { x: 0, y: 0 },
          mediaRef: { workspacePath: 'C:/ws', relativePath: 'a.png' },
        },
        { nodeId: 'n-text', kind: 'text', position: { x: 0, y: 0 }, text: '' },
      ],
    });

    const withStyle = setNodeStylePresetContent(document, 'n-image', 'mg-motion:pop');
    expect(withStyle.nodes[0]).toMatchObject({ stylePresetId: 'mg-motion:pop' });

    const cleared = setNodeStylePresetContent(
      { ...document, nodes: withStyle.nodes },
      'n-image',
      undefined,
    );
    expect(cleared.nodes[0]).not.toHaveProperty('stylePresetId');

    const textUntouched = setNodeStylePresetContent(document, 'n-text', 'mg-motion:pop');
    expect(textUntouched.nodes[1]).not.toHaveProperty('stylePresetId');
  });

  it('removes nodes together with their attached edges', () => {
    const document = makeDocument({
      nodes: [
        { nodeId: 'a', kind: 'text', position: { x: 0, y: 0 }, text: '' },
        { nodeId: 'b', kind: 'text', position: { x: 0, y: 0 }, text: '' },
        { nodeId: 'c', kind: 'text', position: { x: 0, y: 0 }, text: '' },
      ],
      edges: [
        { edgeId: 'e-ab', sourceNodeId: 'a', targetNodeId: 'b' },
        { edgeId: 'e-bc', sourceNodeId: 'b', targetNodeId: 'c' },
      ],
    });

    const next = removeNodesContent(document, ['a']);
    expect(next.nodes.map(node => node.nodeId)).toEqual(['b', 'c']);
    expect(next.edges.map(edge => edge.edgeId)).toEqual(['e-bc']);
  });

  it('removes edges by id', () => {
    const document = makeDocument({
      edges: [
        { edgeId: 'e-1', sourceNodeId: 'a', targetNodeId: 'b' },
        { edgeId: 'e-2', sourceNodeId: 'b', targetNodeId: 'c' },
      ],
    });
    expect(removeEdgesContent(document, ['e-1']).edges.map(edge => edge.edgeId))
      .toEqual(['e-2']);
  });

  it('connects known nodes once and rejects self or dangling connections', () => {
    const document = makeDocument({
      nodes: [
        { nodeId: 'a', kind: 'text', position: { x: 0, y: 0 }, text: '' },
        { nodeId: 'b', kind: 'text', position: { x: 0, y: 0 }, text: '' },
      ],
    });

    const connected = connectNodesContent(document, 'e-1', 'a', 'b');
    expect(connected.edges).toEqual([
      { edgeId: 'e-1', sourceNodeId: 'a', targetNodeId: 'b' },
    ]);

    const withEdge = { ...document, edges: connected.edges };
    expect(connectNodesContent(withEdge, 'e-2', 'a', 'b').edges).toHaveLength(1);
    expect(connectNodesContent(document, 'e-3', 'a', 'a').edges).toHaveLength(0);
    expect(connectNodesContent(document, 'e-4', 'a', 'missing').edges).toHaveLength(0);
  });

  it('replaces the viewport', () => {
    const next = setViewportContent(makeDocument(), { x: 5, y: -3, zoom: 2 });
    expect(next.viewport).toEqual({ x: 5, y: -3, zoom: 2 });
  });
});
