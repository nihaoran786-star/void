import { describe, expect, it } from 'vitest';

import {
  infiniteCanvasOpsJournalFilePath,
  reconcileInfiniteCanvasAgentOps,
} from './InfiniteCanvasOpsReconciliation';
import {
  InfiniteCanvasDocumentService,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
} from './InfiniteCanvasDocumentService';
import { createInMemoryInfiniteCanvasPersistence } from './InfiniteCanvasPersistencePort';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasWorkspaceRef,
} from './InfiniteCanvasTypes';

const WORKSPACE: InfiniteCanvasWorkspaceRef = {
  workspaceId: 'workspace-1',
  workspacePath: 'C:/ws',
  backend: 'local',
};
const DOCUMENT_ID = defaultInfiniteCanvasDocumentId(WORKSPACE.workspaceId);
const MEDIA_REF = { workspacePath: 'C:/ws', relativePath: 'media/generated/b0/src.png' };

interface Harness {
  document: InfiniteCanvasDocument;
  service: InfiniteCanvasDocumentService;
  reader: { readTextFile: (path: string) => Promise<string | null> };
  setJournal: (content: string) => void;
  readDocument: () => Promise<InfiniteCanvasDocument>;
}

function createHarness(appliedSeq?: number): Harness {
  const store = createInMemoryInfiniteCanvasPersistence();
  const document: InfiniteCanvasDocument = {
    documentId: DOCUMENT_ID,
    schemaVersion: '1',
    workspaceId: WORKSPACE.workspaceId,
    revision: 1,
    nodes: [
      { nodeId: 'card-blank', kind: 'image', position: { x: 0, y: 0 }, prompt: '' },
      { nodeId: 'card-media', kind: 'image', position: { x: 200, y: 0 }, mediaRef: { ...MEDIA_REF } },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: new Date(0).toISOString(),
    ...(appliedSeq !== undefined ? { agentOps: { appliedSeq } } : {}),
  };
  store.files.set(
    infiniteCanvasDocumentFilePath(WORKSPACE.workspacePath, DOCUMENT_ID),
    JSON.stringify(document),
  );
  const service = new InfiniteCanvasDocumentService(store.port);
  return {
    document,
    service,
    reader: { readTextFile: path => store.port.readTextFile(path) },
    setJournal(content) {
      store.files.set(
        infiniteCanvasOpsJournalFilePath(WORKSPACE.workspacePath, DOCUMENT_ID),
        content,
      );
    },
    async readDocument() {
      const result = await service.mutateDefaultDocument(WORKSPACE, content => content);
      if (result.status !== 'applied') throw new Error('failed to read document');
      return result.document;
    },
  };
}

function journal(batches: unknown[], identity: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: '1',
    documentId: DOCUMENT_ID,
    workspaceId: WORKSPACE.workspaceId,
    batches,
    ...identity,
  });
}

describe('reconcileInfiniteCanvasAgentOps', () => {
  it('applies journaled batches above the watermark in seq order', async () => {
    const harness = createHarness(1);
    harness.setJournal(journal([
      // Already applied: must be skipped.
      { seq: 1, batchId: 'b-1', ops: [{ op: 'delete_node', nodeId: 'card-blank' }] },
      // Out of file order on purpose: seq order rules.
      {
        seq: 3, batchId: 'b-3',
        ops: [{ op: 'connect', edgeId: 'e-1', sourceNodeId: 'card-media', targetNodeId: 'n-2' }],
      },
      {
        seq: 2, batchId: 'b-2',
        ops: [{ op: 'add_node', nodeId: 'n-2', kind: 'video', position: { x: 500, y: 0 } }],
      },
    ]));

    const result = await reconcileInfiniteCanvasAgentOps({
      workspace: WORKSPACE,
      document: harness.document,
      reader: harness.reader,
      documentService: harness.service,
    });

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.appliedBatches.map(batch => batch.seq)).toEqual([2, 3]);
    const document = await harness.readDocument();
    // Batch 1 was already applied: card-blank survives.
    expect(document.nodes.some(node => node.nodeId === 'card-blank')).toBe(true);
    expect(document.nodes.find(node => node.nodeId === 'n-2')?.kind).toBe('video');
    expect(document.edges).toContainEqual({
      edgeId: 'e-1', sourceNodeId: 'card-media', targetNodeId: 'n-2',
    });
    expect(document.agentOps).toEqual({ appliedSeq: 3 });
  });

  it('is a typed no-op when every batch is already applied', async () => {
    const harness = createHarness(2);
    harness.setJournal(journal([
      { seq: 1, batchId: 'b-1', ops: [{ op: 'delete_node', nodeId: 'card-blank' }] },
      { seq: 2, batchId: 'b-2', ops: [{ op: 'delete_node', nodeId: 'card-blank' }] },
    ]));

    const result = await reconcileInfiniteCanvasAgentOps({
      workspace: WORKSPACE,
      document: harness.document,
      reader: harness.reader,
      documentService: harness.service,
    });

    expect(result).toEqual({ status: 'no-op', reason: 'no_new_batches' });
    const document = await harness.readDocument();
    expect(document.nodes.some(node => node.nodeId === 'card-blank')).toBe(true);
    expect(document.agentOps).toEqual({ appliedSeq: 2 });
  });

  it('is a typed no-op when the journal file is missing', async () => {
    const harness = createHarness();

    const result = await reconcileInfiniteCanvasAgentOps({
      workspace: WORKSPACE,
      document: harness.document,
      reader: harness.reader,
      documentService: harness.service,
    });

    expect(result).toEqual({ status: 'no-op', reason: 'journal_missing' });
  });

  it('tolerates corrupted and invalid journals as typed no-ops', async () => {
    const harness = createHarness();

    harness.setJournal('{ not json');
    const corrupted = await reconcileInfiniteCanvasAgentOps({
      workspace: WORKSPACE,
      document: harness.document,
      reader: harness.reader,
      documentService: harness.service,
    });
    expect(corrupted).toEqual({ status: 'no-op', reason: 'journal_corrupted' });

    harness.setJournal(JSON.stringify({ schemaVersion: '1' }));
    const invalid = await reconcileInfiniteCanvasAgentOps({
      workspace: WORKSPACE,
      document: harness.document,
      reader: harness.reader,
      documentService: harness.service,
    });
    expect(invalid).toEqual({ status: 'no-op', reason: 'journal_invalid' });

    const document = await harness.readDocument();
    expect(document.agentOps).toBeUndefined();
  });

  it('tolerates a throwing reader as a missing journal', async () => {
    const harness = createHarness();

    const result = await reconcileInfiniteCanvasAgentOps({
      workspace: WORKSPACE,
      document: harness.document,
      reader: { readTextFile: () => Promise.reject(new Error('io')) },
      documentService: harness.service,
    });

    expect(result).toEqual({ status: 'no-op', reason: 'journal_missing' });
  });

  it('never applies a journal written for another workspace or document', async () => {
    const harness = createHarness();
    const batches = [
      { seq: 1, batchId: 'b-1', ops: [{ op: 'delete_node', nodeId: 'card-blank' }] },
    ];

    harness.setJournal(journal(batches, { workspaceId: 'workspace-other' }));
    const wrongWorkspace = await reconcileInfiniteCanvasAgentOps({
      workspace: WORKSPACE,
      document: harness.document,
      reader: harness.reader,
      documentService: harness.service,
    });
    expect(wrongWorkspace).toEqual({ status: 'no-op', reason: 'workspace_mismatch' });

    harness.setJournal(journal(batches, { documentId: 'doc-other' }));
    const wrongDocument = await reconcileInfiniteCanvasAgentOps({
      workspace: WORKSPACE,
      document: harness.document,
      reader: harness.reader,
      documentService: harness.service,
    });
    expect(wrongDocument).toEqual({ status: 'no-op', reason: 'document_mismatch' });

    const document = await harness.readDocument();
    expect(document.nodes.some(node => node.nodeId === 'card-blank')).toBe(true);
  });

  it('drops unparseable batch entries without losing the rest', async () => {
    const harness = createHarness();
    harness.setJournal(journal([
      'garbage-entry',
      { seq: 'NaN', batchId: 'b-bad', ops: [] },
      {
        seq: 1, batchId: 'b-good',
        ops: [{ op: 'add_node', nodeId: 'n-ok', kind: 'text', position: { x: 0, y: 0 } }],
      },
    ]));

    const result = await reconcileInfiniteCanvasAgentOps({
      workspace: WORKSPACE,
      document: harness.document,
      reader: harness.reader,
      documentService: harness.service,
    });

    expect(result.status).toBe('applied');
    const document = await harness.readDocument();
    expect(document.nodes.some(node => node.nodeId === 'n-ok')).toBe(true);
    expect(document.agentOps).toEqual({ appliedSeq: 1 });
  });

  it('keeps existing mediaRefs untouched across reconciliation', async () => {
    const harness = createHarness();
    harness.setJournal(journal([
      {
        seq: 1, batchId: 'b-1',
        ops: [
          { op: 'delete_node', nodeId: 'card-media' },
          { op: 'update_node', nodeId: 'card-media', set: { mediaRef: { workspacePath: 'X', relativePath: 'y' } } },
        ],
      },
    ]));

    const result = await reconcileInfiniteCanvasAgentOps({
      workspace: WORKSPACE,
      document: harness.document,
      reader: harness.reader,
      documentService: harness.service,
    });

    expect(result.status).toBe('applied');
    const document = await harness.readDocument();
    expect(document.nodes.find(node => node.nodeId === 'card-media')?.mediaRef)
      .toEqual(MEDIA_REF);
    expect(document.agentOps).toEqual({ appliedSeq: 1 });
  });
});
