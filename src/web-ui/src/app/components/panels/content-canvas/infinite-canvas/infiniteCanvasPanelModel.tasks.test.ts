/**
 * P4 W8 pure logic: the task-queue projection and "stop waiting".
 */
import { describe, expect, it } from 'vitest';

import type { InfiniteCanvasDocument, InfiniteCanvasNode } from '@/shared/services/infinite-canvas';
import {
  collectGenerationTasks,
  resolveOperationContent,
  stopWaitingContent,
} from './infiniteCanvasPanelModel';

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

const PENDING: InfiniteCanvasNode = {
  nodeId: 'pending',
  kind: 'image',
  position: { x: 0, y: 0 },
  prompt: 'a fox\nsecond line',
  generation: { operationId: 'op-1', toolId: 'generate', resultMode: 'self', status: 'pending' },
};
const FAILED_VIDEO: InfiniteCanvasNode = {
  nodeId: 'failed',
  kind: 'video',
  position: { x: 0, y: 0 },
  generation: {
    operationId: 'op-2',
    toolId: 'generate',
    resultMode: 'self',
    status: 'failed',
    errorKind: 'rate-limit',
    mediaKind: 'video',
  },
};
const SETTLED: InfiniteCanvasNode = {
  nodeId: 'settled',
  kind: 'image',
  position: { x: 0, y: 0 },
  mediaRef: { workspacePath: 'C:/ws', relativePath: 'media/output/a.png' },
};

describe('collectGenerationTasks', () => {
  it('is empty when no card carries a generation', () => {
    expect(collectGenerationTasks(makeDocument([SETTLED]))).toEqual([]);
  });

  it('projects every in-flight and failed card, first prompt line only', () => {
    const tasks = collectGenerationTasks(makeDocument([SETTLED, PENDING, FAILED_VIDEO]));

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({
      nodeId: 'pending',
      operationId: 'op-1',
      toolId: 'generate',
      status: 'pending',
      mediaKind: 'image',
      promptLine: 'a fox',
    });
    expect(tasks[1]).toMatchObject({
      nodeId: 'failed',
      status: 'failed',
      mediaKind: 'video',
      errorKind: 'rate-limit',
      promptLine: '',
    });
  });
});

describe('stopWaitingContent', () => {
  it('marks the pending card as a retryable cancelled failure', () => {
    const next = stopWaitingContent(makeDocument([PENDING]), 'op-1');

    expect(next.nodes[0].generation).toMatchObject({
      operationId: 'op-1',
      status: 'failed',
      errorKind: 'cancelled',
    });
    // The anchor is intact: the operation can still be recognised.
    expect(next.nodes[0].mediaRef).toBeUndefined();
  });

  it('leaves an already-failed card and an unknown operation alone', () => {
    const document = makeDocument([FAILED_VIDEO]);

    expect(stopWaitingContent(document, 'op-2').nodes[0]).toEqual(FAILED_VIDEO);
    expect(stopWaitingContent(document, 'op-nope').nodes[0]).toEqual(FAILED_VIDEO);
  });

  it('still lets a late result land in the card — the money was already spent', () => {
    const stopped = stopWaitingContent(makeDocument([PENDING]), 'op-1');
    const mediaRef = { workspacePath: 'C:/ws', relativePath: 'media/output/late.png' };

    const resolved = resolveOperationContent(
      { ...makeDocument(stopped.nodes) },
      'op-1',
      mediaRef,
    );

    expect(resolved.nodes[0].mediaRef).toEqual(mediaRef);
    expect(resolved.nodes[0].generation).toBeUndefined();
  });
});
