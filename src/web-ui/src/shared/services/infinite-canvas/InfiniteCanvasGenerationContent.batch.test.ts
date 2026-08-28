/**
 * The pure batch-landing rules shared by the live media bridge and the
 * residual pending reconciliation.
 *
 * §7.6 (owner 2026-08-28) split them in two, and both halves are guarded here:
 *
 * - a plain generation ACCUMULATES its whole batch onto the card it was fired
 *   from — one card, an ordered picture list, no sibling cards;
 * - the five tools and crop keep P4's derivation — item 1 into the derived
 *   placeholder, items 2..N into deterministic sibling cards — because
 *   turning a picture into a different picture is lineage.
 *
 * Never-overwrite, replay idempotency and "partial now, the rest later" are
 * asserted on both halves.
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

/** A card waiting on a plain generation — §7.6's accumulating shape. */
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

/**
 * The derived placeholder one of the five tools created at dispatch — the
 * shape §7.6 deliberately leaves on P4's derivation rule.
 */
function toolPlaceholder(overrides: Partial<InfiniteCanvasNode> = {}): InfiniteCanvasNode {
  return {
    nodeId: 'card-anchor',
    kind: 'image',
    position: { x: 100, y: 40 },
    size: { width: 240, height: 240 },
    prompt: 'remove the sign',
    generationParams: { model: 'gemini-3-pro-image-preview', n: 3 },
    derivedFrom: { sourceNodeId: 'card-source', toolId: 'inpaint', operationId: 'op-1' },
    generation: {
      operationId: 'op-1',
      toolId: 'inpaint',
      resultMode: 'derived',
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

function ref(name: string) {
  return { workspacePath: WORKSPACE_PATH, relativePath: `media/generated/batch-1/${name}` };
}

describe('resolveOperationBatchContent — a generation accumulates (§7.6)', () => {
  it('lands a single item exactly like the pre-P4 single resolve did', () => {
    const document = documentWith([anchorCard()]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(1));

    expect(content.nodes).toHaveLength(1);
    expect(content.edges).toEqual([]);
    const [card] = content.nodes;
    expect(card.mediaRef).toEqual(ref('image-001.png'));
    // A one-picture card stays in the pre-§7.6 shape: no list, no index.
    expect(card.mediaVariants).toBeUndefined();
    expect(card.activeVariantIndex).toBeUndefined();
    expect(card.generation).toBeUndefined();
    expect(card.prompt).toBe('a cat');
    expect(card.position).toEqual({ x: 100, y: 40 });
    expect(card.derivedFrom).toBeUndefined();
  });

  it('piles all three items of one shot onto the same card, in order', () => {
    const document = documentWith([anchorCard()]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(3));

    expect(content.nodes).toHaveLength(1);
    expect(content.edges).toEqual([]);
    const [card] = content.nodes;
    expect(card.mediaVariants).toEqual([
      ref('image-001.png'),
      ref('image-002.png'),
      ref('image-003.png'),
    ]);
    expect(card.activeVariantIndex).toBe(0);
    expect(card.mediaRef).toEqual(ref('image-001.png'));
    expect(card.generation).toBeUndefined();
  });

  it('sorts by itemIndex regardless of the order they arrive in', () => {
    const document = documentWith([anchorCard()]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, [
      items(3)[2], items(3)[0], items(3)[1],
    ]);

    expect(content.nodes[0].mediaVariants).toEqual([
      ref('image-001.png'),
      ref('image-002.png'),
      ref('image-003.png'),
    ]);
  });

  it('appends to the pictures the card already carries instead of replacing them', () => {
    const document = documentWith([
      anchorCard({ mediaRef: ref('kept.png') }),
    ]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(2));

    const [card] = content.nodes;
    expect(card.mediaVariants).toEqual([
      ref('kept.png'),
      ref('image-001.png'),
      ref('image-002.png'),
    ]);
    // The freshly produced picture is what the card face shows.
    expect(card.activeVariantIndex).toBe(1);
    expect(card.mediaRef).toEqual(ref('image-001.png'));
  });

  it('accumulates on a video card too', () => {
    const document = documentWith([anchorCard({ kind: 'video' })]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(2));

    expect(content.nodes).toHaveLength(1);
    expect(content.nodes[0].kind).toBe('video');
    expect(content.nodes[0].mediaVariants).toHaveLength(2);
  });

  it('lands the surviving items of a partial batch that lost item 1', () => {
    const document = documentWith([anchorCard()]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, [
      { itemIndex: 3, relativePath: 'media/generated/batch-1/image-003.png' },
      { itemIndex: 2, relativePath: 'media/generated/batch-1/image-002.png' },
    ]);

    expect(content.nodes).toHaveLength(1);
    expect(content.nodes[0].mediaVariants)
      .toEqual([ref('image-002.png'), ref('image-003.png')]);
    expect(content.nodes[0].mediaRef).toEqual(ref('image-002.png'));
  });

  it('is idempotent: replaying the same batch appends nothing', () => {
    const document = documentWith([anchorCard()]);

    const once = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(3));
    const landed = { ...document, ...once };
    const twice = resolveOperationBatchContent(landed, 'op-1', WORKSPACE_PATH, items(3));

    expect(twice.nodes).toBe(landed.nodes);
    expect(twice.edges).toBe(landed.edges);
  });

  it('adds only the missing pictures when a batch reports in two events', () => {
    const first = resolveOperationBatchContent(
      documentWith([anchorCard()]),
      'op-1',
      WORKSPACE_PATH,
      items(1),
    );
    const landed = { ...documentWith([]), ...first };

    const second = resolveOperationBatchContent(landed, 'op-1', WORKSPACE_PATH, items(3));

    expect(second.nodes).toHaveLength(1);
    expect(second.nodes[0].mediaVariants).toEqual([
      ref('image-001.png'),
      ref('image-002.png'),
      ref('image-003.png'),
    ]);
    expect(second.nodes[0].generation).toBeUndefined();

    // …and replaying that second event still writes nothing.
    const settled = { ...documentWith([]), ...second };
    const third = resolveOperationBatchContent(settled, 'op-1', WORKSPACE_PATH, items(3));
    expect(third.nodes).toBe(settled.nodes);
  });

  it('clears the generation even when every item was already there', () => {
    const document = documentWith([
      anchorCard({
        mediaRef: ref('image-001.png'),
      }),
    ]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(1));

    expect(content.nodes[0].generation).toBeUndefined();
    expect(content.nodes[0].mediaVariants).toBeUndefined();
    expect(content.nodes[0].mediaRef).toEqual(ref('image-001.png'));
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

describe('resolveOperationBatchContent — the five tools still derive (§7.6)', () => {
  it('fans three items into the placeholder plus two derived cards and edges', () => {
    const document = documentWith([toolPlaceholder()]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(3));

    expect(content.nodes).toHaveLength(3);
    expect(content.nodes[0].mediaRef).toEqual(ref('image-001.png'));
    expect(content.nodes[0].mediaVariants).toBeUndefined();
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
        toolId: 'inpaint',
        operationId: 'op-1',
      });
      expect(node.generation).toBeUndefined();
      expect(node.prompt).toBe('remove the sign');
      expect(node.generationParams).toEqual({ model: 'gemini-3-pro-image-preview', n: 3 });
    }
    expect(derived[0].position).toEqual({ x: 100 + 240 + 360, y: 40 });
    expect(derived[1].position).toEqual({ x: 100 + 240 + 720, y: 40 });

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

  it('never grows a duplicate card when the deterministic id already exists', () => {
    const document = documentWith([
      toolPlaceholder(),
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
    expect(content.nodes.find(
      node => node.nodeId === infiniteCanvasBatchNodeId('op-1', 2),
    )?.mediaRef?.relativePath).toBe('media/generated/old.png');
    expect(content.nodes).toHaveLength(3);
    expect(content.edges.map(edge => edge.edgeId))
      .toEqual([infiniteCanvasBatchEdgeId('op-1', 3)]);
  });

  it('lands the first surviving item in the placeholder when item 1 is missing', () => {
    const document = documentWith([toolPlaceholder()]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, [
      { itemIndex: 3, relativePath: 'media/generated/batch-1/image-003.png' },
      { itemIndex: 2, relativePath: 'media/generated/batch-1/image-002.png' },
    ]);

    expect(content.nodes[0].mediaRef).toEqual(ref('image-002.png'));
    expect(content.nodes).toHaveLength(2);
    expect(content.nodes[1].nodeId).toBe(infiniteCanvasBatchNodeId('op-1', 3));
  });

  it('writes nothing when the placeholder already carries a mediaRef', () => {
    const document = documentWith([
      toolPlaceholder({
        mediaRef: { workspacePath: WORKSPACE_PATH, relativePath: 'media/generated/keep.png' },
      }),
    ]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(3));

    expect(content.nodes).toBe(document.nodes);
    expect(content.edges).toBe(document.edges);
  });

  it('carries the style preset onto every sibling card', () => {
    const document = documentWith([toolPlaceholder({ stylePresetId: 'preset-noir' })]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(3));

    expect(content.nodes.map(node => node.stylePresetId))
      .toEqual(['preset-noir', 'preset-noir', 'preset-noir']);
  });

  it('grows the missing siblings after the placeholder already landed item 1', () => {
    const first = resolveOperationBatchContent(
      documentWith([toolPlaceholder()]),
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
    expect(second.nodes[0].generation).toBeUndefined();

    const settled = { ...documentWith([]), ...second };
    const third = resolveOperationBatchContent(settled, 'op-1', WORKSPACE_PATH, items(3));
    expect(third.nodes).toBe(settled.nodes);
    expect(third.edges).toBe(settled.edges);
  });
});

describe('resolveOperationBatchContent — the lane never disagrees with itself', () => {
  /**
   * Adversarial review C1: the AI may register `{mode:'derived',
   * toolId:'generate'}`. That placeholder is a DERIVE-lane card — the lane
   * predicate both landing sites use says so — but the batch resolver used to
   * decide from `toolId` alone and swallowed all four pictures into the
   * placeholder, so the three sibling cards and their three edges never grew.
   */
  it('grows siblings for a derived-mode generate placeholder', () => {
    const document = documentWith([
      { nodeId: 'card-source', kind: 'image', position: { x: 0, y: 0 }, mediaRef: ref('src.png') },
      toolPlaceholder({
        derivedFrom: { sourceNodeId: 'card-source', toolId: 'generate', operationId: 'op-1' },
        generation: {
          operationId: 'op-1',
          toolId: 'generate',
          resultMode: 'derived',
          status: 'pending',
        },
      }),
    ]);

    const content = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(4));

    expect(content.nodes.map(node => node.nodeId)).toEqual([
      'card-source',
      'card-anchor',
      infiniteCanvasBatchNodeId('op-1', 2),
      infiniteCanvasBatchNodeId('op-1', 3),
      infiniteCanvasBatchNodeId('op-1', 4),
    ]);
    const placeholder = content.nodes[1];
    expect(placeholder.mediaRef).toEqual(ref('image-001.png'));
    // The whole batch must NOT have piled onto the placeholder.
    expect(placeholder.mediaVariants).toBeUndefined();
    expect(placeholder.generation).toBeUndefined();
    expect(content.edges.map(edge => edge.edgeId)).toEqual([
      infiniteCanvasBatchEdgeId('op-1', 2),
      infiniteCanvasBatchEdgeId('op-1', 3),
      infiniteCanvasBatchEdgeId('op-1', 4),
    ]);
  });

  /**
   * Adversarial review C2: a card born from CROP keeps `derivedFrom.toolId:
   * 'crop'` forever. Regenerating n=4 from it accumulates on the first event;
   * the second event of the same batch used to read that stale 'crop' and
   * switch to the sibling lane, scattering three of the four pictures.
   */
  it('keeps accumulating on the second event of a crop-born card', () => {
    const cropped = anchorCard({
      derivedFrom: { sourceNodeId: 'card-source', toolId: 'crop', operationId: 'op-crop' },
    });
    const document = documentWith([cropped]);

    const first = resolveOperationBatchContent(document, 'op-1', WORKSPACE_PATH, items(1));
    expect(first.nodes[0].mediaRef).toEqual(ref('image-001.png'));
    expect(first.nodes[0].generation).toBeUndefined();

    const landed = { ...document, ...first };
    const second = resolveOperationBatchContent(landed, 'op-1', WORKSPACE_PATH, items(4));

    expect(second.nodes).toHaveLength(1);
    expect(second.edges).toEqual([]);
    expect(second.nodes[0].mediaVariants).toEqual([
      ref('image-001.png'),
      ref('image-002.png'),
      ref('image-003.png'),
      ref('image-004.png'),
    ]);
    // Lineage of the card itself is untouched — only the lane guess changed.
    expect(second.nodes[0].derivedFrom).toEqual(cropped.derivedFrom);

    // Replaying the completed event writes nothing at all.
    const settled = { ...documentWith([]), ...second };
    const third = resolveOperationBatchContent(settled, 'op-1', WORKSPACE_PATH, items(4));
    expect(third.nodes).toBe(settled.nodes);
  });
});
