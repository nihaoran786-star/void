/**
 * P4 W6 pure logic: batch move and the deletion classifier.
 */
import { describe, expect, it } from 'vitest';

import type { InfiniteCanvasDocument, InfiniteCanvasNode } from '@/shared/services/infinite-canvas';
import { classifyDeletionTargets, moveNodesContent } from './infiniteCanvasPanelModel';

function makeDocument(nodes: InfiniteCanvasNode[]): InfiniteCanvasDocument {
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

const BLANK: InfiniteCanvasNode = { nodeId: 'blank', kind: 'image', position: { x: 0, y: 0 } };
const TEXT: InfiniteCanvasNode = { nodeId: 'text', kind: 'text', position: { x: 0, y: 0 }, text: 'hi' };
const WITH_MEDIA: InfiniteCanvasNode = {
  nodeId: 'with-media',
  kind: 'image',
  position: { x: 0, y: 0 },
  mediaRef: { workspacePath: 'C:/ws', relativePath: 'media/output/a.png' },
};
const PENDING: InfiniteCanvasNode = {
  nodeId: 'pending',
  kind: 'image',
  position: { x: 0, y: 0 },
  generation: { operationId: 'op-1', toolId: 'generate', resultMode: 'self', status: 'pending' },
};
const FAILED: InfiniteCanvasNode = {
  nodeId: 'failed',
  kind: 'image',
  position: { x: 0, y: 0 },
  generation: {
    operationId: 'op-2',
    toolId: 'generate',
    resultMode: 'self',
    status: 'failed',
    errorKind: 'timeout',
  },
};
const GROUP: InfiniteCanvasNode = { nodeId: 'group', kind: 'group', position: { x: 0, y: 0 } };

describe('moveNodesContent', () => {
  it('moves every listed card in one content result and leaves the rest alone', () => {
    const document = makeDocument([
      { ...BLANK, nodeId: 'a' },
      { ...BLANK, nodeId: 'b' },
      { ...BLANK, nodeId: 'c' },
    ]);

    const next = moveNodesContent(document, [
      { nodeId: 'a', position: { x: 10, y: 20 } },
      { nodeId: 'c', position: { x: 30, y: 40 } },
    ]);

    expect(next.nodes.map(node => node.position)).toEqual([
      { x: 10, y: 20 },
      { x: 0, y: 0 },
      { x: 30, y: 40 },
    ]);
  });

  it('copies the position so the caller cannot alias it into the document', () => {
    const document = makeDocument([{ ...BLANK, nodeId: 'a' }]);
    const position = { x: 5, y: 5 };

    const next = moveNodesContent(document, [{ nodeId: 'a', position }]);
    position.x = 999;

    expect(next.nodes[0].position).toEqual({ x: 5, y: 5 });
  });

  it('is a no-op for an empty batch and for unknown ids', () => {
    const document = makeDocument([{ ...BLANK, nodeId: 'a' }]);

    expect(moveNodesContent(document, []).nodes).toBe(document.nodes);
    expect(moveNodesContent(document, [{ nodeId: 'ghost', position: { x: 1, y: 1 } }]).nodes)
      .toEqual(document.nodes);
  });
});

describe('classifyDeletionTargets', () => {
  it('asks for no confirmation when every target is plain', () => {
    const document = makeDocument([BLANK, TEXT, FAILED]);

    const summary = classifyDeletionTargets(document, ['blank', 'text', 'failed']);

    expect(summary.requiresConfirmation).toBe(false);
    expect(summary.plainCount).toBe(3);
    expect(summary.mediaCount).toBe(0);
    expect(summary.pendingCount).toBe(0);
  });

  it('counts media and in-flight cards and asks for one confirmation', () => {
    const document = makeDocument([BLANK, TEXT, WITH_MEDIA, PENDING]);

    const summary = classifyDeletionTargets(document, [
      'blank', 'text', 'with-media', 'pending',
    ]);

    expect(summary.requiresConfirmation).toBe(true);
    expect(summary.nodeIds).toEqual(['blank', 'text', 'with-media', 'pending']);
    expect(summary.mediaCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
    expect(summary.plainCount).toBe(2);
  });

  it('drops group nodes and unknown ids from the request', () => {
    const document = makeDocument([BLANK, GROUP]);

    const summary = classifyDeletionTargets(document, ['blank', 'group', 'ghost']);

    expect(summary.nodeIds).toEqual(['blank']);
    expect(summary.requiresConfirmation).toBe(false);
  });

  it('counts a card that both holds media and is regenerating only once per axis', () => {
    const document = makeDocument([{ ...WITH_MEDIA, generation: PENDING.generation }]);

    const summary = classifyDeletionTargets(document, ['with-media']);

    expect(summary.mediaCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
    expect(summary.plainCount).toBe(0);
    expect(summary.nodeIds).toHaveLength(1);
  });
});
