import { describe, expect, it } from 'vitest';

import type { InfiniteCanvasDocument } from '@/shared/services/infinite-canvas';
import {
  addImageNodeContent,
  addTextNodeContent,
  attachBatchToOperationContent,
  beginDerivedOperationContent,
  connectNodesContent,
  createInfiniteCanvasId,
  failOperationContent,
  INFINITE_CANVAS_IMAGE_NODE_TYPE,
  INFINITE_CANVAS_TEXT_NODE_TYPE,
  moveNodeContent,
  removeEdgesContent,
  removeFailedOperationContent,
  removeNodesContent,
  resolveOperationContent,
  retryOperationContent,
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

  describe('K2 derived-operation helpers', () => {
    const SOURCE_MEDIA_REF = { workspacePath: 'C:/ws', relativePath: 'media/input/src.png' };
    const OUTPUT_MEDIA_REF = {
      workspacePath: 'C:/ws',
      relativePath: 'media/generated/batch-1/image-001.png',
    };

    function makeSourceDocument(): InfiniteCanvasDocument {
      return makeDocument({
        nodes: [{
          nodeId: 'src',
          kind: 'image',
          position: { x: 100, y: 50 },
          size: { width: 320, height: 180 },
          mediaRef: { ...SOURCE_MEDIA_REF },
          stylePresetId: 'cinematic:noir',
          prompt: 'original prompt',
        }],
      });
    }

    it('creates a pending derived placeholder with its edge beside the source', () => {
      const document = makeSourceDocument();

      const next = beginDerivedOperationContent(
        document, 'src', 'expand', 'op-1', 'derived-1', 'edge-1',
      );

      expect(next.nodes).toHaveLength(2);
      expect(next.nodes[1]).toEqual({
        nodeId: 'derived-1',
        kind: 'image',
        position: { x: 100 + 320 + 360, y: 50 },
        derivedFrom: { sourceNodeId: 'src', toolId: 'expand', operationId: 'op-1' },
        generation: {
          operationId: 'op-1',
          toolId: 'expand',
          resultMode: 'derived',
          status: 'pending',
        },
      });
      expect(next.edges).toEqual([
        { edgeId: 'edge-1', sourceNodeId: 'src', targetNodeId: 'derived-1', role: 'derived' },
      ]);
    });

    it('is idempotent: re-registering the same operationId adds no second node', () => {
      const document = makeSourceDocument();
      const first = beginDerivedOperationContent(
        document, 'src', 'expand', 'op-1', 'derived-1', 'edge-1',
      );
      const withFirst = { ...document, nodes: first.nodes, edges: first.edges };

      const second = beginDerivedOperationContent(
        withFirst, 'src', 'expand', 'op-1', 'derived-other', 'edge-other',
      );

      expect(second.nodes).toEqual(first.nodes);
      expect(second.edges).toEqual(first.edges);
    });

    it('ignores begin for an unknown source node', () => {
      const document = makeSourceDocument();
      const next = beginDerivedOperationContent(
        document, 'missing', 'erase', 'op-x', 'derived-x', 'edge-x',
      );
      expect(next.nodes).toEqual(document.nodes);
      expect(next.edges).toEqual(document.edges);
    });

    it('resolves the pending node by operationId and clears its generation', () => {
      const document = makeSourceDocument();
      const begun = beginDerivedOperationContent(
        document, 'src', 'matting', 'op-1', 'derived-1', 'edge-1',
      );
      const withPlaceholder = { ...document, nodes: begun.nodes, edges: begun.edges };

      const resolved = resolveOperationContent(withPlaceholder, 'op-1', OUTPUT_MEDIA_REF);

      expect(resolved.nodes[1]).toEqual({
        nodeId: 'derived-1',
        kind: 'image',
        position: resolved.nodes[1].position,
        derivedFrom: { sourceNodeId: 'src', toolId: 'matting', operationId: 'op-1' },
        mediaRef: OUTPUT_MEDIA_REF,
      });
      expect(resolved.nodes[1]).not.toHaveProperty('generation');

      // Resolving again is a no-op: the node keeps its first mediaRef.
      const again = resolveOperationContent(
        { ...withPlaceholder, nodes: resolved.nodes },
        'op-1',
        { workspacePath: 'C:/ws', relativePath: 'media/generated/other/late.png' },
      );
      expect(again.nodes).toEqual(resolved.nodes);

      // Unknown operationId leaves the document untouched.
      const unknown = resolveOperationContent(withPlaceholder, 'op-nope', OUTPUT_MEDIA_REF);
      expect(unknown.nodes).toEqual(withPlaceholder.nodes);
    });

    it('never rewrites the mediaRef of a node that already has one', () => {
      const document = makeSourceDocument();
      // A hostile/corrupt state: the source node itself carries the operationId.
      const hostile = {
        ...document,
        nodes: [{
          ...document.nodes[0],
          generation: {
            operationId: 'op-1',
            toolId: 'generate' as const,
            resultMode: 'self' as const,
            status: 'pending' as const,
          },
        }],
      };

      const resolved = resolveOperationContent(hostile, 'op-1', OUTPUT_MEDIA_REF);

      expect(resolved.nodes[0].mediaRef).toEqual(SOURCE_MEDIA_REF);
    });

    it('keeps every field of mediaRef-bearing nodes unchanged across all helpers', () => {
      const document = makeSourceDocument();
      const sourceBefore = JSON.parse(JSON.stringify(document.nodes[0]));

      const outcomes = [
        beginDerivedOperationContent(document, 'src', 'upscale', 'op-1', 'derived-1', 'edge-1'),
        resolveOperationContent(document, 'op-1', OUTPUT_MEDIA_REF),
        failOperationContent(document, 'op-1', 'backend'),
        attachBatchToOperationContent(document, 'op-1', 'batch-9'),
        removeFailedOperationContent(document, 'op-1'),
      ];

      for (const outcome of outcomes) {
        const source = outcome.nodes.find(node => node.nodeId === 'src');
        expect(source).toEqual(sourceBefore);
      }
    });

    it('marks a pending operation as failed with a typed error kind', () => {
      const document = makeSourceDocument();
      const begun = beginDerivedOperationContent(
        document, 'src', 'inpaint', 'op-1', 'derived-1', 'edge-1',
      );
      const withPlaceholder = { ...document, nodes: begun.nodes, edges: begun.edges };

      const failed = failOperationContent(withPlaceholder, 'op-1', 'auth');

      expect(failed.nodes[1].generation).toEqual({
        operationId: 'op-1',
        toolId: 'inpaint',
        resultMode: 'derived',
        status: 'failed',
        errorKind: 'auth',
      });
    });

    it('attaches the batch id to the pending operation', () => {
      const document = makeSourceDocument();
      const begun = beginDerivedOperationContent(
        document, 'src', 'erase', 'op-1', 'derived-1', 'edge-1',
      );
      const withPlaceholder = { ...document, nodes: begun.nodes, edges: begun.edges };

      const attached = attachBatchToOperationContent(withPlaceholder, 'op-1', 'batch-42');

      expect(attached.nodes[1].generation).toMatchObject({
        operationId: 'op-1',
        status: 'pending',
        batchId: 'batch-42',
      });
    });

    it('re-arms a failed operation for retry under a fresh operationId', () => {
      const document = makeSourceDocument();
      const begun = beginDerivedOperationContent(
        document, 'src', 'inpaint', 'op-1', 'derived-1', 'edge-1',
      );
      const withPlaceholder = { ...document, nodes: begun.nodes, edges: begun.edges };
      const failed = failOperationContent(withPlaceholder, 'op-1', 'backend');
      const withFailed = { ...withPlaceholder, nodes: failed.nodes };

      const retried = retryOperationContent(withFailed, 'op-1', 'op-2');

      expect(retried.nodes[1].generation).toEqual({
        operationId: 'op-2',
        toolId: 'inpaint',
        resultMode: 'derived',
        status: 'pending',
      });
      // Identity, derivation, and edges are untouched by the retry.
      expect(retried.nodes[1].nodeId).toBe('derived-1');
      expect(retried.nodes[1].derivedFrom).toEqual({
        sourceNodeId: 'src', toolId: 'inpaint', operationId: 'op-1',
      });
      expect(retried.edges).toEqual(withFailed.edges);
    });

    it('refuses to re-arm operations that are pending or already carry an image', () => {
      const document = makeSourceDocument();
      const begun = beginDerivedOperationContent(
        document, 'src', 'inpaint', 'op-1', 'derived-1', 'edge-1',
      );
      const withPlaceholder = { ...document, nodes: begun.nodes, edges: begun.edges };

      // Still pending: nothing changes.
      expect(retryOperationContent(withPlaceholder, 'op-1', 'op-2').nodes)
        .toEqual(withPlaceholder.nodes);

      // Illegal-by-construction failed node that has an image: never re-armed.
      const failed = failOperationContent(withPlaceholder, 'op-1', 'backend');
      const withImage = {
        ...withPlaceholder,
        nodes: failed.nodes.map(node => (
          node.nodeId === 'derived-1' ? { ...node, mediaRef: { ...OUTPUT_MEDIA_REF } } : node
        )),
      };
      expect(retryOperationContent(withImage, 'op-1', 'op-2').nodes)
        .toEqual(withImage.nodes);
    });

    it('removes only failed, image-less placeholders together with their edges', () => {
      const document = makeSourceDocument();
      const begun = beginDerivedOperationContent(
        document, 'src', 'upscale', 'op-1', 'derived-1', 'edge-1',
      );
      const withPlaceholder = { ...document, nodes: begun.nodes, edges: begun.edges };

      // Still pending: refuses to remove.
      const whilePending = removeFailedOperationContent(withPlaceholder, 'op-1');
      expect(whilePending.nodes).toHaveLength(2);

      const failed = failOperationContent(withPlaceholder, 'op-1', 'timeout');
      const withFailed = { ...withPlaceholder, nodes: failed.nodes };

      const removed = removeFailedOperationContent(withFailed, 'op-1');
      expect(removed.nodes.map(node => node.nodeId)).toEqual(['src']);
      expect(removed.edges).toEqual([]);
    });

    it('projects prompt, derivedFrom, and generation into flow node views', () => {
      const document = makeSourceDocument();
      const begun = beginDerivedOperationContent(
        document, 'src', 'expand', 'op-1', 'derived-1', 'edge-1',
      );

      const views = toFlowNodeViews(begun.nodes);

      expect(views[0].data).toMatchObject({ prompt: 'original prompt' });
      expect(views[1].data).toMatchObject({
        derivedFrom: { sourceNodeId: 'src', toolId: 'expand', operationId: 'op-1' },
        generation: { operationId: 'op-1', status: 'pending', resultMode: 'derived' },
      });
    });
  });
});
