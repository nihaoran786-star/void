/**
 * P5 W2: the local-derivation rules (crop), PRD §3.8.
 *
 * Crop is the one operation with no media task behind it, and therefore the
 * one whose derived card gets its `mediaRef` written by the front end. The
 * guard rails that makes safe are what this file pins: the source card is
 * untouched, a card that already has media is never overwritten, and the
 * registration is settled in the same content pass so no forever-pending crop
 * card can exist.
 */
import { describe, expect, it } from 'vitest';

import {
  applyLocalDerivedMedia,
  beginDerivedOperationContent,
} from './InfiniteCanvasGenerationContent';
import type { InfiniteCanvasDocument, InfiniteCanvasNode } from './InfiniteCanvasTypes';

const WORKSPACE_PATH = 'C:/ws';
const CROP_PATH = 'media/input/canvas-crops/image-001-crop-7.png';

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

const SOURCE: InfiniteCanvasNode = {
  nodeId: 'card-source',
  kind: 'image',
  position: { x: 20, y: 30 },
  size: { width: 240, height: 240 },
  prompt: 'a cat',
  mediaRef: { workspacePath: WORKSPACE_PATH, relativePath: 'media/generated/b1/image-001.png' },
};

/** The exact pair of calls the panel makes inside one mutation. */
function cropOnce(document: InfiniteCanvasDocument, operationId = 'op-crop') {
  const derivedNodeId = `node-${operationId}`;
  const begun = beginDerivedOperationContent(
    document,
    SOURCE.nodeId,
    'crop',
    operationId,
    derivedNodeId,
    `edge-${operationId}`,
  );
  return {
    derivedNodeId,
    content: applyLocalDerivedMedia({ ...document, ...begun }, derivedNodeId, {
      workspacePath: WORKSPACE_PATH,
      relativePath: CROP_PATH,
    }),
  };
}

describe('applyLocalDerivedMedia (crop)', () => {
  it('grows a finished derived card and an edge in one pass', () => {
    const document = documentWith([SOURCE]);

    const { content, derivedNodeId } = cropOnce(document);

    const derived = content.nodes.find(node => node.nodeId === derivedNodeId);
    expect(derived).toMatchObject({
      kind: 'image',
      mediaRef: { workspacePath: WORKSPACE_PATH, relativePath: CROP_PATH },
      derivedFrom: { sourceNodeId: SOURCE.nodeId, toolId: 'crop', operationId: 'op-crop' },
    });
    // No media task exists, so there is nothing left to wait for: the card is
    // finished the moment it appears, never a pending placeholder.
    expect(derived).not.toHaveProperty('generation');
    expect(content.edges).toHaveLength(1);
    expect(content.edges[0]).toMatchObject({
      sourceNodeId: SOURCE.nodeId,
      targetNodeId: derivedNodeId,
      role: 'derived',
    });
  });

  it('leaves the source card byte for byte as it was', () => {
    const document = documentWith([SOURCE]);

    const { content } = cropOnce(document);

    const source = content.nodes.find(node => node.nodeId === SOURCE.nodeId);
    expect(source).toEqual(SOURCE);
    expect(source!.mediaRef).toEqual(SOURCE.mediaRef);
  });

  it('is a no-op on a replay of the same operation', () => {
    const document = documentWith([SOURCE]);
    const first = cropOnce(document);
    const afterFirst = documentWith(first.content.nodes as InfiniteCanvasNode[]);

    const second = cropOnce({ ...afterFirst, edges: first.content.edges });

    expect(second.content.nodes).toHaveLength(2);
    expect(second.content.edges).toHaveLength(1);
  });

  it('never overwrites a card that already carries media', () => {
    const occupied: InfiniteCanvasNode = {
      nodeId: 'card-occupied',
      kind: 'image',
      position: { x: 0, y: 0 },
      mediaRef: { workspacePath: WORKSPACE_PATH, relativePath: 'media/generated/b1/keep.png' },
    };
    const document = documentWith([SOURCE, occupied]);

    const content = applyLocalDerivedMedia(document, 'card-occupied', {
      workspacePath: WORKSPACE_PATH,
      relativePath: CROP_PATH,
    });

    expect(content.nodes.find(node => node.nodeId === 'card-occupied')).toEqual(occupied);
  });

  it('ignores a missing card and an empty path', () => {
    const document = documentWith([SOURCE]);

    expect(applyLocalDerivedMedia(document, 'nope', {
      workspacePath: WORKSPACE_PATH,
      relativePath: CROP_PATH,
    }).nodes).toEqual(document.nodes);
    expect(applyLocalDerivedMedia(document, SOURCE.nodeId, {
      workspacePath: WORKSPACE_PATH,
      relativePath: '  ',
    }).nodes).toEqual(document.nodes);
  });
});
