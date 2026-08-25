/**
 * P4 W4: the pure batch-landing rules shared by the live media bridge and the
 * residual pending reconciliation — deterministic ids, item 1 into the anchor
 * card, items 2..N into derived cards, never-overwrite, replay idempotency.
 */
import { describe, expect, it } from 'vitest';

import {
  infiniteCanvasBatchEdgeId,
  infiniteCanvasBatchNodeId,
  resolveOperationBatchContent,
} from './InfiniteCanvasGenerationContent';
import type { InfiniteCanvasDocument, InfiniteCanvasNode } from './InfiniteCanvasTypes';

const WORKSPACE_PATH = 'C:/ws';

function documentWith(nodes: InfiniteCanvasNode[]): InfiniteCanvasDocument {
  return {
    documentId: 'doc-1',
    schemaVersion: '1',
    workspaceId: 'workspace-1',
    revision: 1,
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
  };
}

function anchorCard(overrides: Partial<InfiniteCanvasNode> = {}): InfiniteCanvasNode {
  return {
    nodeId: 'card-anchor',
    kind: 'image',
    position: { x: 100, y: 40 },
    size: { width: 240, height: 240 },
    prompt: 'a cat',
    generationParams: { model: 'gemini-3-pro-image-preview', n: 3 },
    generation: {
      operationId: 'op-1',
      toolId: 'generate',
      resultMode: 'self',
      status: 'pending',
    },
    ...overrides,
  };
}

function items(count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    itemIndex: index + 1,
    relativePath: `media/generated/batch-1/image-00${index + 1}.png`,
  }));
}

describe('resolveOperationBatchContent', () => {
  it('lands a single item exactly like the pre-P4 single resolve did', () => {
    const document = documentWith([anchorCard()]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(1));

    expect(content.nodes).toHaveLength(1);
    expect(content.edges).toEqual([]);
    const [card] = content.nodes;
    expect(card.mediaRef).toEqual({
      workspacePath: WORKSPACE_PATH,
      relativePath: 'media/generated/batch-1/image-001.png',
    });
    expect(card.generation).toBeUndefined();
    // Everything else about the card survives untouched.
    expect(card.prompt).toBe('a cat');
    expect(card.position).toEqual({ x: 100, y: 40 });
    expect(card.derivedFrom).toBeUndefined();
  });

  it('fans three items into the anchor plus two derived cards and two derived edges', () => {
    const document = documentWith([anchorCard()]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(3));

    expect(content.nodes).toHaveLength(3);
    expect(content.nodes[0].mediaRef?.relativePath)
      .toBe('media/generated/batch-1/image-001.png');
    const derived = content.nodes.slice(1);
    expect(derived.map(node => node.nodeId)).toEqual([
      infiniteCanvasBatchNodeId('op-1', 2),
      infiniteCanvasBatchNodeId('op-1', 3),
    ]);
    expect(derived.map(node => node.mediaRef?.relativePath)).toEqual([
      'media/generated/batch-1/image-002.png',
      'media/generated/batch-1/image-003.png',
    ]);
    for (const node of derived) {
      expect(node.kind).toBe('image');
      expect(node.derivedFrom).toEqual({
        sourceNodeId: 'card-anchor',
        toolId: 'generate',
        operationId: 'op-1',
      });
      expect(node.generation).toBeUndefined();
      expect(node.prompt).toBe('a cat');
      expect(node.generationParams).toEqual({ model: 'gemini-3-pro-image-preview', n: 3 });
    }
    // Placed to the right of the anchor, in order, never on top of each other.
    expect(derived[0].position).toEqual({ x: 100 + 240 + 360, y: 40 });
    expect(derived[1].position).toEqual({ x: 100 + 240 + 720, y: 40 });
    expect(new Set(derived.map(node => node.position.x)).size).toBe(2);

    expect(content.edges).toEqual([
      {
        edgeId: infiniteCanvasBatchEdgeId('op-1', 2),
        sourceNodeId: 'card-anchor',
        targetNodeId: infiniteCanvasBatchNodeId('op-1', 2),
        role: 'derived',
      },
      {
        edgeId: infiniteCanvasBatchEdgeId('op-1', 3),
        sourceNodeId: 'card-anchor',
        targetNodeId: infiniteCanvasBatchNodeId('op-1', 3),
        role: 'derived',
      },
    ]);
  });

  it('derives video siblings from a video anchor', () => {
    const document = documentWith([anchorCard({ kind: 'video' })]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(2));

    expect(content.nodes.map(node => node.kind)).toEqual(['video', 'video']);
  });

  it('is idempotent: applying the same batch twice adds nothing', () => {
    const document = documentWith([anchorCard()]);

    const once = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(3));
    const twice = resolveOperationBatchContent(
      { ...document, ...once },
      'op-1',
      WORKSPACE_PATH,
      items(3),
    );

    // The anchor lost its generation on the first pass, so the operation is no
    // longer registered — the second pass finds no anchor and writes nothing.
    expect(twice.nodes).toBe(once.nodes);
    expect(twice.edges).toBe(once.edges);
  });

  it('never grows a duplicate card when the deterministic id already exists', () => {
    const document = documentWith([
      anchorCard(),
      {
        nodeId: infiniteCanvasBatchNodeId('op-1', 2),
        kind: 'image',
        position: { x: 0, y: 900 },
        mediaRef: { workspacePath: WORKSPACE_PATH, relativePath: 'media/generated/old.png' },
      },
    ]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(3));

    expect(content.nodes.filter(
      node => node.nodeId === infiniteCanvasBatchNodeId('op-1', 2),
    )).toHaveLength(1);
    // The pre-existing card keeps its own media; only item 3 is added.
    expect(content.nodes.find(
      node => node.nodeId === infiniteCanvasBatchNodeId('op-1', 2),
    )?.mediaRef?.relativePath).toBe('media/generated/old.png');
    expect(content.nodes).toHaveLength(3);
    expect(content.edges.map(edge => edge.edgeId))
      .toEqual([infiniteCanvasBatchEdgeId('op-1', 3)]);
  });

  it('lands the first surviving item in the anchor when a partial batch lost item 1', () => {
    const document = documentWith([anchorCard()]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, [
      { itemIndex: 3, relativePath: 'media/generated/batch-1/image-003.png' },
      { itemIndex: 2, relativePath: 'media/generated/batch-1/image-002.png' },
    ]);

    expect(content.nodes[0].mediaRef?.relativePath)
      .toBe('media/generated/batch-1/image-002.png');
    expect(content.nodes).toHaveLength(2);
    expect(content.nodes[1].nodeId).toBe(infiniteCanvasBatchNodeId('op-1', 3));
  });

  it('writes nothing when the anchor already carries a mediaRef (never-overwrite)', () => {
    const document = documentWith([
      anchorCard({
        mediaRef: { workspacePath: WORKSPACE_PATH, relativePath: 'media/generated/keep.png' },
      }),
    ]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(3));

    expect(content.nodes).toBe(document.nodes);
    expect(content.edges).toBe(document.edges);
  });

  // P4 review C6: siblings carry the style preset too. Without it, the pill on
  // a sibling card claimed a style the card no longer had, and regenerating
  // from it silently produced a differently styled image.
  it('carries the style preset onto every sibling card', () => {
    const document = documentWith([anchorCard({ stylePresetId: 'preset-noir' })]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(3));

    expect(content.nodes.map(node => node.stylePresetId))
      .toEqual(['preset-noir', 'preset-noir', 'preset-noir']);
  });

  // P4 review P2: "partial now, the rest later" used to be a dead path — the
  // first landing cleared the registration and every later item was dropped.
  describe('a batch that reports in two events', () => {
    it('grows the missing siblings after the anchor already landed item 1', () => {
      const first = resolveOperationBatchContent(
        documentWith([anchorCard()]),
        'op-1',
        WORKSPACE_PATH,
        items(1),
      );
      const landed = { ...documentWith([]), ...first };

      const second = resolveOperationBatchContent(landed, 'op-1', WORKSPACE_PATH, items(3));

      expect(second.nodes.map(node => node.nodeId)).toEqual([
        'card-anchor',
        infiniteCanvasBatchNodeId('op-1', 2),
        infiniteCanvasBatchNodeId('op-1', 3),
      ]);
      // The already-landed item is never duplicated into a sibling card.
      expect(second.nodes.map(node => node.mediaRef?.relativePath)).toEqual([
        'media/generated/batch-1/image-001.png',
        'media/generated/batch-1/image-002.png',
        'media/generated/batch-1/image-003.png',
      ]);
      expect(second.edges.map(edge => edge.edgeId)).toEqual([
        infiniteCanvasBatchEdgeId('op-1', 2),
        infiniteCanvasBatchEdgeId('op-1', 3),
      ]);
      // The anchor is never rewritten: no generation comes back, no media moves.
      expect(second.nodes[0].generation).toBeUndefined();
    });

    it('stays idempotent: replaying the second event adds nothing at all', () => {
      const first = resolveOperationBatchContent(
        documentWith([anchorCard()]),
        'op-1',
        WORKSPACE_PATH,
        items(1),
      );
      const second = resolveOperationBatchContent(
        { ...documentWith([]), ...first },
        'op-1',
        WORKSPACE_PATH,
        items(3),
      );
      const landed = { ...documentWith([]), ...second };

      const third = resolveOperationBatchContent(landed, 'op-1', WORKSPACE_PATH, items(3));

      expect(third.nodes).toBe(landed.nodes);
      expect(third.edges).toBe(landed.edges);
    });

    it('leaves an unrelated document alone when no anchor can be recovered', () => {
      const document = documentWith([
        {
          nodeId: 'card-other',
          kind: 'image',
          position: { x: 0, y: 0 },
          mediaRef: { workspacePath: WORKSPACE_PATH, relativePath: 'media/generated/other.png' },
        },
      ]);

      const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(3));

      expect(content.nodes).toBe(document.nodes);
      expect(content.edges).toBe(document.edges);
    });
  });

  it('writes nothing for an unknown operation or an empty item list', () => {
    const document = documentWith([anchorCard()]);

    expect(resolveOperationBatchContent(document, 'op-other', WORKSPACE_PATH, items(3)).nodes)
      .toBe(document.nodes);
    expect(resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, []).nodes)
      .toBe(document.nodes);
    expect(resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, [
      { itemIndex: 1, relativePath: '   ' },
    ]).nodes).toBe(document.nodes);
  });
});
