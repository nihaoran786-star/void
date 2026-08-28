/**
 * P4 W7 pure logic: the copy / paste field white list and the edge rule.
 *
 * The load-bearing assertion in this file is the reference semantics: a copied
 * card's `mediaRef` is field-for-field the original's, so both cards point at
 * the same file and no media is duplicated.
 */
import { describe, expect, it } from 'vitest';

import type { InfiniteCanvasDocument, InfiniteCanvasNode } from '@/shared/services/infinite-canvas';
import {
  clipboardSnapshotOrigin,
  copySelectionSnapshot,
  pasteSnapshotContent,
} from './infiniteCanvasClipboard';

function makeDocument(
  nodes: InfiniteCanvasNode[],
  edges: InfiniteCanvasDocument['edges'] = [],
): InfiniteCanvasDocument {
  return {
    documentId: 'doc-1',
    schemaVersion: '1',
    workspaceId: 'workspace-1',
    revision: 1,
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
  };
}

const MEDIA_REF = { workspacePath: 'C:/ws', relativePath: 'media/output/fox.png' };

const RICH_CARD: InfiniteCanvasNode = {
  nodeId: 'rich',
  kind: 'image',
  position: { x: 100, y: 200 },
  size: { width: 320, height: 240 },
  prompt: 'a fox',
  stylePresetId: 'cinematic-01',
  generationParams: { model: 'gemini', size: '16:9', n: 2 },
  mediaRef: MEDIA_REF,
  derivedFrom: { sourceNodeId: 'parent', toolId: 'generate', operationId: 'op-old' },
  // K3 §5.1.3: writable now, and still deliberately not copied — one asset
  // gets one official refinement slot on the board.
  domainRef: {
    moduleId: 'short-drama',
    kind: 'character',
    id: 'artifact-1',
    role: 'refine',
  },
  generation: {
    operationId: 'op-live',
    toolId: 'generate',
    resultMode: 'self',
    status: 'pending',
  },
};

function idFactory(): (prefix: string) => string {
  let counter = 0;
  return prefix => {
    counter += 1;
    return `${prefix}-new-${counter}`;
  };
}

describe('copySelectionSnapshot', () => {
  it('copies the media REFERENCE, field for field, and never a file', () => {
    const snapshot = copySelectionSnapshot(makeDocument([RICH_CARD]), ['rich'])!;

    expect(snapshot.nodes[0].mediaRef).toEqual(MEDIA_REF);
    expect(snapshot.nodes[0].mediaRef).not.toBe(MEDIA_REF);
  });

  it('carries the white-listed fields and drops lineage and in-flight state', () => {
    const snapshot = copySelectionSnapshot(makeDocument([RICH_CARD]), ['rich'])!;
    const copied = snapshot.nodes[0] as Record<string, unknown>;

    expect(copied).toMatchObject({
      kind: 'image',
      position: { x: 100, y: 200 },
      size: { width: 320, height: 240 },
      prompt: 'a fox',
      stylePresetId: 'cinematic-01',
      generationParams: { model: 'gemini', size: '16:9', n: 2 },
    });
    expect(copied.generation).toBeUndefined();
    expect(copied.derivedFrom).toBeUndefined();
    // The source card DOES belong to a short-drama asset; the copy does not.
    expect(copied.domainRef).toBeUndefined();
  });

  it('copies an edge only when both ends are inside the selection', () => {
    const document = makeDocument(
      [
        { nodeId: 'a', kind: 'image', position: { x: 0, y: 0 } },
        { nodeId: 'b', kind: 'image', position: { x: 0, y: 100 } },
        { nodeId: 'outside', kind: 'image', position: { x: 0, y: 200 } },
      ],
      [
        { edgeId: 'edge-ab', sourceNodeId: 'a', targetNodeId: 'b' },
        { edgeId: 'edge-out', sourceNodeId: 'outside', targetNodeId: 'b' },
        { edgeId: 'edge-derived', sourceNodeId: 'a', targetNodeId: 'b', role: 'derived' },
      ],
    );

    const snapshot = copySelectionSnapshot(document, ['a', 'b'])!;

    expect(snapshot.edges).toHaveLength(2);
    expect(snapshot.edges.every(edge => edge.sourceKey && edge.targetKey)).toBe(true);
    // The derivation role rides along: a derivation edge is lineage, not a
    // reference, and losing the role would quietly make it one.
    expect(snapshot.edges.filter(edge => edge.role === 'derived')).toHaveLength(1);
  });

  it('skips group nodes and returns undefined when nothing is copyable', () => {
    const document = makeDocument([{ nodeId: 'g', kind: 'group', position: { x: 0, y: 0 } }]);

    expect(copySelectionSnapshot(document, ['g'])).toBeUndefined();
    expect(copySelectionSnapshot(document, [])).toBeUndefined();
  });
});

describe('pasteSnapshotContent', () => {
  it('creates brand-new cards at the offset without touching the originals', () => {
    const document = makeDocument([RICH_CARD]);
    const snapshot = copySelectionSnapshot(document, ['rich'])!;

    const result = pasteSnapshotContent(document, snapshot, {
      offset: { x: 32, y: 32 },
      createId: idFactory(),
    });

    expect(result.content.nodes).toHaveLength(2);
    expect(result.content.nodes[0]).toEqual(RICH_CARD);
    const pasted = result.content.nodes[1];
    expect(pasted.nodeId).toBe('node-new-1');
    expect(pasted.position).toEqual({ x: 132, y: 232 });
    expect(pasted.mediaRef).toEqual(MEDIA_REF);
    expect(pasted.generation).toBeUndefined();
    expect(pasted.derivedFrom).toBeUndefined();
    expect(result.nodeIds).toEqual(['node-new-1']);
  });

  it('rewires copied edges onto the new cards and gives them new ids', () => {
    const document = makeDocument(
      [
        { nodeId: 'a', kind: 'image', position: { x: 0, y: 0 } },
        { nodeId: 'b', kind: 'image', position: { x: 0, y: 100 } },
      ],
      [{ edgeId: 'edge-ab', sourceNodeId: 'a', targetNodeId: 'b' }],
    );
    const snapshot = copySelectionSnapshot(document, ['a', 'b'])!;

    const result = pasteSnapshotContent(document, snapshot, {
      offset: { x: 10, y: 10 },
      createId: idFactory(),
    });

    expect(result.content.edges).toHaveLength(2);
    const pastedEdge = result.content.edges[1];
    expect(pastedEdge.edgeId).not.toBe('edge-ab');
    expect(pastedEdge.sourceNodeId).toBe(result.nodeIds[0]);
    expect(pastedEdge.targetNodeId).toBe(result.nodeIds[1]);
  });

  it('never reuses an id that is already on the canvas', () => {
    const document = makeDocument([{ nodeId: 'node-new-1', kind: 'text', position: { x: 0, y: 0 } }]);
    const snapshot = copySelectionSnapshot(document, ['node-new-1'])!;

    const result = pasteSnapshotContent(document, snapshot, {
      offset: { x: 0, y: 0 },
      createId: idFactory(),
    });

    expect(result.content.nodes).toHaveLength(2);
    expect(result.nodeIds).toEqual(['node-new-2']);
    expect(result.content.nodes[0].nodeId).toBe('node-new-1');
  });
});

describe('clipboardSnapshotOrigin', () => {
  it('reports the top-left corner of the copied cards', () => {
    const document = makeDocument([
      { nodeId: 'a', kind: 'image', position: { x: 300, y: 40 } },
      { nodeId: 'b', kind: 'image', position: { x: 120, y: 500 } },
    ]);

    const snapshot = copySelectionSnapshot(document, ['a', 'b'])!;

    expect(clipboardSnapshotOrigin(snapshot)).toEqual({ x: 120, y: 40 });
  });
});
