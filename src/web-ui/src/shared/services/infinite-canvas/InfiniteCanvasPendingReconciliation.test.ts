/**
 * K2 W7: residual-pending reconciliation against the persisted media batch
 * manifests — completed batches resolve, failed batches fail, missing/polling
 * manifests (and corrupted ones) become retryable timeouts.
 */
import { describe, expect, it } from 'vitest';

import {
  mediaJobBatchFilePath,
  reconcilePendingInfiniteCanvasGenerations,
} from './InfiniteCanvasPendingReconciliation';
import {
  InfiniteCanvasDocumentService,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
} from './InfiniteCanvasDocumentService';
import { createInMemoryInfiniteCanvasPersistence } from './InfiniteCanvasPersistencePort';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasNode,
  InfiniteCanvasWorkspaceRef,
} from './InfiniteCanvasTypes';

const WORKSPACE: InfiniteCanvasWorkspaceRef = {
  workspaceId: 'workspace-1',
  workspacePath: 'C:/ws',
  backend: 'local',
};
const DOCUMENT_ID = defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId);

function pendingNode(
  nodeId: string,
  operationId: string,
  batchId?: string,
  overrides: Partial<InfiniteCanvasNode> = {},
): InfiniteCanvasNode {
  return {
    nodeId,
    kind: 'image',
    position: { x: 0, y: 0 },
    generation: {
      operationId,
      toolId: 'generate',
      resultMode: 'self',
      status: 'pending',
      ...(batchId ? { batchId } : {}),
    },
    ...overrides,
  };
}

function completedManifest(localPath: string): string {
  return JSON.stringify({
    status: 'completed',
    kind: 'image',
    batch: {
      batch_id: 'batch-1',
      status: 'completed',
      assets: [{ item_index: 1, kind: 'image', url: 'https://x/img', local_path: localPath }],
      items: [{ item_index: 1, kind: 'image', local_path: localPath }],
    },
  });
}

interface Harness {
  service: InfiniteCanvasDocumentService;
  files: Map<string, string>;
  reader: { readTextFile: (path: string) => Promise<string | null> };
  readDocument: () => InfiniteCanvasDocument;
}

function createHarness(nodes: InfiniteCanvasNode[]): { harness: Harness; document: InfiniteCanvasDocument } {
  const store = createInMemoryInfiniteCanvasPersistence();
  const document: InfiniteCanvasDocument = {
    documentId: DOCUMENT_ID,
    schemaVersion: '1',
    workspaceId: WORKSPACE.workspaceId,
    revision: 1,
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
  };
  store.files.set(
    infiniteCanvasDocumentFilePath(WORKSPACE.workspacePath, DOCUMENT_ID),
    JSON.stringify(document),
  );
  const service = new InfiniteCanvasDocumentService(store.port, { debounceMs: 1 });
  return {
    harness: {
      service,
      files: store.files,
      reader: store.port,
      readDocument: () => JSON.parse(
        store.files.get(infiniteCanvasDocumentFilePath(WORKSPACE.workspacePath, DOCUMENT_ID))!,
      ) as InfiniteCanvasDocument,
    },
    document,
  };
}

async function reconcile(harness: Harness, document: InfiniteCanvasDocument) {
  const result = await reconcilePendingInfiniteCanvasGenerations({
    workspace: WORKSPACE,
    document,
    reader: harness.reader,
    documentService: harness.service,
  });
  await harness.service.flushPendingWrites();
  return result;
}

describe('reconcilePendingInfiniteCanvasGenerations', () => {
  it('builds the batch manifest path under .void/media-jobs', () => {
    expect(mediaJobBatchFilePath('C:\\ws\\', 'batch-1'))
      .toBe('C:/ws/.void/media-jobs/batch-1.json');
  });

  it('is a no-op when the document has no pending generations', async () => {
    const { harness, document } = createHarness([
      { nodeId: 'plain', kind: 'image', position: { x: 0, y: 0 } },
    ]);

    const result = await reconcile(harness, document);

    expect(result.outcomes).toEqual([]);
    expect(result.document).toBeUndefined();
  });

  it('resolves a pending node whose batch completed with a saved asset', async () => {
    const { harness, document } = createHarness([
      pendingNode('card-1', 'op-1', 'batch-1'),
    ]);
    harness.files.set(
      mediaJobBatchFilePath(WORKSPACE.workspacePath, 'batch-1'),
      completedManifest('C:/ws/media/generated/batch-1/image-001.png'),
    );

    const result = await reconcile(harness, document);

    expect(result.outcomes).toEqual([
      { operationId: 'op-1', nodeId: 'card-1', action: 'resolved' },
    ]);
    const persisted = harness.readDocument().nodes[0];
    expect(persisted.mediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: 'media/generated/batch-1/image-001.png',
    });
    expect(persisted.generation).toBeUndefined();
  });

  it('fails a pending node whose batch terminally failed', async () => {
    const { harness, document } = createHarness([
      pendingNode('card-1', 'op-1', 'batch-1'),
    ]);
    harness.files.set(
      mediaJobBatchFilePath(WORKSPACE.workspacePath, 'batch-1'),
      JSON.stringify({ status: 'failed', batch: { batch_id: 'batch-1', status: 'failed' } }),
    );

    const result = await reconcile(harness, document);

    expect(result.outcomes).toEqual([
      { operationId: 'op-1', nodeId: 'card-1', action: 'failed', errorKind: 'backend' },
    ]);
    expect(harness.readDocument().nodes[0].generation).toMatchObject({
      status: 'failed',
      errorKind: 'backend',
    });
  });

  it('times out a missing manifest and a manifest still in polling state', async () => {
    const { harness, document } = createHarness([
      pendingNode('card-missing', 'op-missing', 'batch-gone'),
      pendingNode('card-polling', 'op-polling', 'batch-polling'),
    ]);
    harness.files.set(
      mediaJobBatchFilePath(WORKSPACE.workspacePath, 'batch-polling'),
      JSON.stringify({ status: 'polling', batch: { batch_id: 'batch-polling' } }),
    );

    const result = await reconcile(harness, document);

    expect(result.outcomes).toEqual([
      {
        operationId: 'op-missing',
        nodeId: 'card-missing',
        action: 'failed',
        errorKind: 'timeout',
      },
      {
        operationId: 'op-polling',
        nodeId: 'card-polling',
        action: 'failed',
        errorKind: 'timeout',
      },
    ]);
    for (const node of harness.readDocument().nodes) {
      expect(node.generation).toMatchObject({ status: 'failed', errorKind: 'timeout' });
    }
  });

  it('times out a pending node that never received a batch id', async () => {
    const { harness, document } = createHarness([
      pendingNode('card-1', 'op-1'),
    ]);

    const result = await reconcile(harness, document);

    expect(result.outcomes).toEqual([
      { operationId: 'op-1', nodeId: 'card-1', action: 'failed', errorKind: 'timeout' },
    ]);
    expect(harness.readDocument().nodes[0].generation).toMatchObject({
      status: 'failed',
      errorKind: 'timeout',
    });
  });

  it('tolerates a corrupted manifest as a retryable timeout', async () => {
    const { harness, document } = createHarness([
      pendingNode('card-1', 'op-1', 'batch-1'),
    ]);
    harness.files.set(
      mediaJobBatchFilePath(WORKSPACE.workspacePath, 'batch-1'),
      '{not json at all',
    );

    const result = await reconcile(harness, document);

    expect(result.outcomes).toEqual([
      { operationId: 'op-1', nodeId: 'card-1', action: 'failed', errorKind: 'timeout' },
    ]);
    expect(harness.readDocument().nodes[0].generation).toMatchObject({
      status: 'failed',
      errorKind: 'timeout',
    });
  });

  it('fails with backend when a completed batch has no extractable landing path', async () => {
    const { harness, document } = createHarness([
      pendingNode('card-1', 'op-1', 'batch-1'),
    ]);
    harness.files.set(
      mediaJobBatchFilePath(WORKSPACE.workspacePath, 'batch-1'),
      JSON.stringify({
        status: 'completed',
        batch: { batch_id: 'batch-1', status: 'completed', assets: [], items: [] },
      }),
    );

    const result = await reconcile(harness, document);

    expect(result.outcomes).toEqual([
      { operationId: 'op-1', nodeId: 'card-1', action: 'failed', errorKind: 'backend' },
    ]);
  });

  it('fails a pending node whose manifest kind contradicts the generation media kind (C3)', async () => {
    const { harness, document } = createHarness([
      // A video generation whose batch manifest claims an IMAGE batch: the
      // asset can never belong to this card — typed retryable failure, no
      // resolve, mirroring the live bridge's media-kind gate (P3 §3.5).
      pendingNode('card-video', 'op-video', 'batch-1', {
        kind: 'video',
        generation: {
          operationId: 'op-video',
          toolId: 'generate',
          resultMode: 'self',
          status: 'pending',
          mediaKind: 'video',
          batchId: 'batch-1',
        },
      }),
    ]);
    harness.files.set(
      mediaJobBatchFilePath(WORKSPACE.workspacePath, 'batch-1'),
      completedManifest('C:/ws/media/generated/batch-1/image-001.png'),
    );

    const result = await reconcile(harness, document);

    expect(result.outcomes).toEqual([
      {
        operationId: 'op-video',
        nodeId: 'card-video',
        action: 'failed',
        errorKind: 'invalid-input',
      },
    ]);
    const persisted = harness.readDocument().nodes[0];
    expect(persisted.mediaRef).toBeUndefined();
    expect(persisted.generation).toMatchObject({
      status: 'failed',
      errorKind: 'invalid-input',
    });
  });

  it('resolves a pending video node whose manifest kind matches (C3)', async () => {
    const { harness, document } = createHarness([
      pendingNode('card-video', 'op-video', 'batch-v1', {
        kind: 'video',
        generation: {
          operationId: 'op-video',
          toolId: 'generate',
          resultMode: 'self',
          status: 'pending',
          mediaKind: 'video',
          batchId: 'batch-v1',
        },
      }),
    ]);
    harness.files.set(
      mediaJobBatchFilePath(WORKSPACE.workspacePath, 'batch-v1'),
      JSON.stringify({
        status: 'completed',
        kind: 'video',
        batch: {
          batch_id: 'batch-v1',
          kind: 'video',
          status: 'completed',
          assets: [{
            item_index: 1,
            kind: 'video',
            local_path: 'C:/ws/media/generated/batch-v1/video-001.mp4',
          }],
        },
      }),
    );

    const result = await reconcile(harness, document);

    expect(result.outcomes).toEqual([
      { operationId: 'op-video', nodeId: 'card-video', action: 'resolved' },
    ]);
    expect(harness.readDocument().nodes[0].mediaRef).toEqual({
      workspacePath: WORKSPACE.workspacePath,
      relativePath: 'media/generated/batch-v1/video-001.mp4',
    });
  });

  it('an image generation against an image manifest keeps resolving (C3 guard is not overbroad)', async () => {
    const { harness, document } = createHarness([
      pendingNode('card-1', 'op-1', 'batch-1'),
    ]);
    harness.files.set(
      mediaJobBatchFilePath(WORKSPACE.workspacePath, 'batch-1'),
      completedManifest('C:/ws/media/generated/batch-1/image-001.png'),
    );

    const result = await reconcile(harness, document);

    expect(result.outcomes).toEqual([
      { operationId: 'op-1', nodeId: 'card-1', action: 'resolved' },
    ]);
  });

  it('never overwrites a node that already carries a mediaRef', async () => {
    const keptMediaRef = { workspacePath: 'C:/ws', relativePath: 'media/input/keep.png' };
    const { harness, document } = createHarness([
      // Illegal-by-construction: pending but already has an image.
      pendingNode('card-1', 'op-1', 'batch-1', { mediaRef: { ...keptMediaRef } }),
    ]);
    harness.files.set(
      mediaJobBatchFilePath(WORKSPACE.workspacePath, 'batch-1'),
      completedManifest('C:/ws/media/generated/batch-1/image-001.png'),
    );

    await reconcile(harness, document);

    expect(harness.readDocument().nodes[0].mediaRef).toEqual(keptMediaRef);
  });
});
