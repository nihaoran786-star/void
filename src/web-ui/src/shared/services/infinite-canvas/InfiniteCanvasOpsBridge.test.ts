import { describe, expect, it } from 'vitest';

import {
  connectInfiniteCanvasOpsBridgeToEventBus,
  createInfiniteCanvasOpsBridge,
  type InfiniteCanvasOpsBridge,
  type InfiniteCanvasOpsBridgeResult,
} from './InfiniteCanvasOpsBridge';
import {
  InfiniteCanvasDocumentService,
  defaultInfiniteCanvasDocumentId,
  infiniteCanvasDocumentFilePath,
} from './InfiniteCanvasDocumentService';
import {
  infiniteCanvasOpsJournalFilePath,
  reconcileInfiniteCanvasAgentOps,
} from './InfiniteCanvasOpsReconciliation';
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
const MEDIA_REF = { workspacePath: 'C:/ws', relativePath: 'media/generated/b0/src.png' };

function seedNodes(): InfiniteCanvasNode[] {
  return [
    { nodeId: 'card-blank', kind: 'image', position: { x: 0, y: 0 }, prompt: '' },
    { nodeId: 'card-media', kind: 'image', position: { x: 200, y: 0 }, mediaRef: { ...MEDIA_REF } },
  ];
}

interface Harness {
  bridge: InfiniteCanvasOpsBridge;
  results: InfiniteCanvasOpsBridgeResult[];
  readDocument: () => Promise<InfiniteCanvasDocument>;
}

function createHarness(appliedSeq?: number): Harness {
  const store = createInMemoryInfiniteCanvasPersistence();
  const document: InfiniteCanvasDocument = {
    documentId: DOCUMENT_ID,
    schemaVersion: '1',
    workspaceId: WORKSPACE.workspaceId,
    revision: 1,
    nodes: seedNodes(),
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
  const results: InfiniteCanvasOpsBridgeResult[] = [];
  const bridge = createInfiniteCanvasOpsBridge({
    workspace: WORKSPACE,
    documentId: DOCUMENT_ID,
    documentService: service,
    onResult: result => results.push(result),
  });
  return {
    bridge,
    results,
    async readDocument() {
      const result = await service.mutateDefaultDocument(WORKSPACE, content => content);
      if (result.status !== 'applied') throw new Error('failed to read document');
      return result.document;
    },
  };
}

/**
 * A real-shaped AgentToolRunObserverEvent as emitted by
 * EventHandlerModule.emitAgentToolRunEventForObservers for a Completed
 * FlowToolEvent: `result` carries the CanvasOp receipt data verbatim.
 */
function completedEvent(receipt: Record<string, unknown>): Record<string, unknown> {
  return {
    sessionId: 'session-1',
    turnId: 'turn-1',
    roundId: 'round-1',
    eventType: 'Completed',
    toolId: 'tool-call-1',
    toolName: 'CanvasOp',
    params: { workspaceId: WORKSPACE.workspaceId, documentId: DOCUMENT_ID },
    result: receipt,
  };
}

function acceptedReceipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'accepted',
    source: 'infinite_canvas',
    workspaceId: WORKSPACE.workspaceId,
    documentId: DOCUMENT_ID,
    seq: 1,
    batchId: 'batch-1',
    opCount: 1,
    ops: [
      { op: 'add_node', nodeId: 'node-agent-1', kind: 'text', position: { x: 10, y: 20 } },
    ],
    createdNodeIds: ['node-agent-1'],
    createdEdgeIds: [],
    generations: [],
    note: 'Operations accepted and journaled.',
    ...overrides,
  };
}

describe('InfiniteCanvasOpsBridge', () => {
  it('applies an accepted CanvasOp receipt and advances the watermark', async () => {
    const harness = createHarness();

    const result = await harness.bridge.handleToolRunEvent(
      completedEvent(acceptedReceipt()),
    );

    expect(result).toMatchObject({ status: 'applied', seq: 1, batchId: 'batch-1' });
    const document = await harness.readDocument();
    expect(document.nodes.some(node => node.nodeId === 'node-agent-1')).toBe(true);
    expect(document.agentOps).toEqual({ appliedSeq: 1 });
  });

  it('is idempotent for duplicated events (same seq applied once)', async () => {
    const harness = createHarness();
    const event = completedEvent(acceptedReceipt());

    const first = await harness.bridge.handleToolRunEvent(event);
    const second = await harness.bridge.handleToolRunEvent(event);

    expect(first.status).toBe('applied');
    expect(second).toMatchObject({ status: 'ignored', reason: 'already_applied' });
    const document = await harness.readDocument();
    expect(document.nodes.filter(node => node.nodeId === 'node-agent-1')).toHaveLength(1);
    expect(document.agentOps).toEqual({ appliedSeq: 1 });
  });

  it('rejects cross-workspace and cross-document receipts without writing', async () => {
    const harness = createHarness();

    const wrongWorkspace = await harness.bridge.handleToolRunEvent(
      completedEvent(acceptedReceipt({ workspaceId: 'workspace-other' })),
    );
    const wrongDocument = await harness.bridge.handleToolRunEvent(
      completedEvent(acceptedReceipt({ documentId: 'doc-other' })),
    );

    expect(wrongWorkspace).toMatchObject({
      status: 'ignored',
      reason: 'workspace_mismatch',
      eventWorkspaceId: 'workspace-other',
    });
    expect(wrongDocument).toMatchObject({
      status: 'ignored',
      reason: 'document_mismatch',
      eventDocumentId: 'doc-other',
    });
    const document = await harness.readDocument();
    expect(document.nodes.some(node => node.nodeId === 'node-agent-1')).toBe(false);
    expect(document.agentOps).toBeUndefined();
  });

  it('applies a receipt delivered through the CallDeferredTool gateway (C1)', async () => {
    const harness = createHarness();

    // Production path: CanvasOp is a collapsed tool, so the model invokes it
    // through the deferred-tool gateway and the run event carries the
    // GATEWAY's tool name — the receipt shape is what must be recognized.
    const result = await harness.bridge.handleToolRunEvent({
      ...completedEvent(acceptedReceipt()),
      toolName: 'CallDeferredTool',
      params: { tool_name: 'CanvasOp' },
    });

    expect(result).toMatchObject({ status: 'applied', seq: 1, batchId: 'batch-1' });
    const document = await harness.readDocument();
    expect(document.nodes.some(node => node.nodeId === 'node-agent-1')).toBe(true);
    expect(document.agentOps).toEqual({ appliedSeq: 1 });
  });

  it('ignores gateway events whose result is not a canvas receipt (C1)', async () => {
    const harness = createHarness();

    // A media tool completing through the same gateway must never be
    // mistaken for a CanvasOp receipt (its result has no canvas source).
    const mediaThroughGateway = await harness.bridge.handleToolRunEvent({
      ...completedEvent({
        status: 'completed',
        source: 'apimart',
        kind: 'image',
        batch: { batch_id: 'batch-media-1' },
      }),
      toolName: 'CallDeferredTool',
    });
    // status 'accepted' faked on a foreign-source result is also rejected.
    const foreignAccepted = await harness.bridge.handleToolRunEvent({
      ...completedEvent(acceptedReceipt({ source: 'somewhere_else' })),
      toolName: 'CallDeferredTool',
    });

    expect(mediaThroughGateway).toMatchObject({ status: 'ignored', reason: 'not_canvas_op' });
    expect(foreignAccepted).toMatchObject({ status: 'ignored', reason: 'not_canvas_op' });
    const document = await harness.readDocument();
    expect(document.agentOps).toBeUndefined();
  });

  it('ignores other tools, non-Completed events, and error receipts', async () => {
    const harness = createHarness();

    const otherTool = await harness.bridge.handleToolRunEvent({
      ...completedEvent(acceptedReceipt()),
      toolName: 'GenerateImage',
    });
    const started = await harness.bridge.handleToolRunEvent({
      ...completedEvent(acceptedReceipt()),
      eventType: 'Started',
    });
    const errorReceipt = await harness.bridge.handleToolRunEvent(
      completedEvent({
        status: 'error',
        source: 'infinite_canvas',
        error: { code: 'invalid-input', message: 'nope' },
      }),
    );
    const malformedEvent = await harness.bridge.handleToolRunEvent('not-an-event');

    expect(otherTool).toMatchObject({ status: 'ignored', reason: 'not_canvas_op' });
    expect(started).toMatchObject({ status: 'ignored', reason: 'unsupported_event_type' });
    expect(errorReceipt).toMatchObject({ status: 'ignored', reason: 'not_accepted' });
    expect(malformedEvent).toMatchObject({ status: 'ignored', reason: 'missing_event_fields' });
    const document = await harness.readDocument();
    expect(document.agentOps).toBeUndefined();
  });

  it('ignores accepted receipts without a parseable batch', async () => {
    const harness = createHarness();

    const missingSeq = await harness.bridge.handleToolRunEvent(
      completedEvent(acceptedReceipt({ seq: 'not-a-number' })),
    );
    const missingOps = await harness.bridge.handleToolRunEvent(
      completedEvent(acceptedReceipt({ ops: undefined })),
    );

    expect(missingSeq).toMatchObject({ status: 'ignored', reason: 'missing_batch' });
    expect(missingOps).toMatchObject({ status: 'ignored', reason: 'missing_batch' });
  });

  it('re-validates delete protection against the live document (double gate)', async () => {
    const harness = createHarness();

    // A tampered receipt claiming a delete the backend would have rejected.
    const result = await harness.bridge.handleToolRunEvent(
      completedEvent(acceptedReceipt({
        ops: [{ op: 'delete_node', nodeId: 'card-media' }],
      })),
    );

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(result.outcomes[0]).toMatchObject({ status: 'skipped', reason: 'delete_protected' });
    const document = await harness.readDocument();
    expect(document.nodes.find(node => node.nodeId === 'card-media')?.mediaRef)
      .toEqual(MEDIA_REF);
    // The batch is still consumed so a replay cannot retry the delete.
    expect(document.agentOps).toEqual({ appliedSeq: 1 });
  });

  it('lands a begin_generation receipt as a pending placeholder card', async () => {
    const harness = createHarness();

    const result = await harness.bridge.handleToolRunEvent(
      completedEvent(acceptedReceipt({
        ops: [{
          op: 'begin_generation',
          mode: 'derived',
          operationId: 'op-video-1',
          toolId: 'generate',
          mediaKind: 'video',
          nodeId: 'node-placeholder-1',
          sourceNodeId: 'card-media',
          edgeId: 'edge-derived-1',
          prompt: 'make it move',
        }],
        createdNodeIds: ['node-placeholder-1'],
        createdEdgeIds: ['edge-derived-1'],
      })),
    );

    expect(result.status).toBe('applied');
    const document = await harness.readDocument();
    const placeholder = document.nodes.find(node => node.nodeId === 'node-placeholder-1');
    expect(placeholder?.kind).toBe('video');
    expect(placeholder?.generation).toMatchObject({
      operationId: 'op-video-1',
      resultMode: 'derived',
      status: 'pending',
      mediaKind: 'video',
    });
    expect(document.edges).toContainEqual({
      edgeId: 'edge-derived-1',
      sourceNodeId: 'card-media',
      targetNodeId: 'node-placeholder-1',
      role: 'derived',
    });
  });

  it('skips receipts at or below an existing watermark', async () => {
    const harness = createHarness(5);

    const result = await harness.bridge.handleToolRunEvent(
      completedEvent(acceptedReceipt({ seq: 5 })),
    );

    expect(result).toMatchObject({ status: 'ignored', reason: 'already_applied' });
    const document = await harness.readDocument();
    expect(document.nodes.some(node => node.nodeId === 'node-agent-1')).toBe(false);
    expect(document.agentOps).toEqual({ appliedSeq: 5 });
  });

  // —— P1: a landing failure must never let a later batch swallow a batch ——

  interface FlakyHarness {
    bridge: InfiniteCanvasOpsBridge;
    reconciliations: number;
    files: Map<string, string>;
    reader: { readTextFile: (path: string) => Promise<string | null> };
    /** The underlying (healthy) service, e.g. for the reconciliation path. */
    service: InfiniteCanvasDocumentService;
    readDocument: () => Promise<InfiniteCanvasDocument>;
  }

  /** Harness whose first `failures` document mutations fail at the IO layer. */
  function createFlakyHarness(failures: number): FlakyHarness {
    const store = createInMemoryInfiniteCanvasPersistence();
    const document: InfiniteCanvasDocument = {
      documentId: DOCUMENT_ID,
      schemaVersion: '1',
      workspaceId: WORKSPACE.workspaceId,
      revision: 1,
      nodes: seedNodes(),
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date(0).toISOString(),
      agentOps: { appliedSeq: 4 },
    };
    store.files.set(
      infiniteCanvasDocumentFilePath(WORKSPACE.workspacePath, DOCUMENT_ID),
      JSON.stringify(document),
    );
    const service = new InfiniteCanvasDocumentService(store.port);
    let remainingFailures = failures;
    const flakyService: Pick<InfiniteCanvasDocumentService, 'mutateDefaultDocument'> = {
      mutateDefaultDocument: (workspace, mutator) => {
        if (remainingFailures > 0) {
          remainingFailures -= 1;
          return Promise.resolve({
            status: 'failed' as const,
            error: { kind: 'io' as const, reason: 'disk full' },
          });
        }
        return service.mutateDefaultDocument(workspace, mutator);
      },
    };
    const harness: FlakyHarness = {
      bridge: undefined as unknown as InfiniteCanvasOpsBridge,
      reconciliations: 0,
      files: store.files,
      reader: store.port,
      service,
      async readDocument() {
        const result = await service.mutateDefaultDocument(WORKSPACE, content => content);
        if (result.status !== 'applied') throw new Error('failed to read document');
        return result.document;
      },
    };
    harness.bridge = createInfiniteCanvasOpsBridge({
      workspace: WORKSPACE,
      documentId: DOCUMENT_ID,
      documentService: flakyService,
      scheduleReconciliation: () => {
        harness.reconciliations += 1;
      },
    });
    return harness;
  }

  function batchReceipt(seq: number, nodeId: string): Record<string, unknown> {
    return acceptedReceipt({
      seq,
      batchId: `batch-${seq}`,
      ops: [{ op: 'add_node', nodeId, kind: 'text', position: { x: seq, y: 0 } }],
      createdNodeIds: [nodeId],
    });
  }

  it('replays a batch whose landing failed when the next batch arrives (P1)', async () => {
    const harness = createFlakyHarness(1);

    // Batch 5 fails at the document layer: typed error, reconciliation asked,
    // watermark untouched.
    const failed = await harness.bridge.handleToolRunEvent(
      completedEvent(batchReceipt(5, 'node-batch-5')),
    );
    expect(failed).toMatchObject({ status: 'error' });
    expect(harness.reconciliations).toBe(1);
    expect((await harness.readDocument()).agentOps).toEqual({ appliedSeq: 4 });

    // Batch 6 succeeds — and batch 5 rides along in the same mutation, so
    // the watermark never jumps over the missed batch.
    const next = await harness.bridge.handleToolRunEvent(
      completedEvent(batchReceipt(6, 'node-batch-6')),
    );
    expect(next).toMatchObject({ status: 'applied', seq: 6 });
    const document = await harness.readDocument();
    expect(document.nodes.some(node => node.nodeId === 'node-batch-5')).toBe(true);
    expect(document.nodes.some(node => node.nodeId === 'node-batch-6')).toBe(true);
    expect(document.agentOps).toEqual({ appliedSeq: 6 });
  });

  it('lands the failed batch through the scheduled journal reconciliation (P1)', async () => {
    const harness = createFlakyHarness(1);

    const failed = await harness.bridge.handleToolRunEvent(
      completedEvent(batchReceipt(5, 'node-batch-5')),
    );
    expect(failed).toMatchObject({ status: 'error' });
    expect(harness.reconciliations).toBe(1);

    // The host answers the scheduleReconciliation callback by replaying the
    // ops journal (Rust's file: it already contains the accepted batch 5).
    harness.files.set(
      infiniteCanvasOpsJournalFilePath(WORKSPACE.workspacePath, DOCUMENT_ID),
      JSON.stringify({
        schemaVersion: '1',
        workspaceId: WORKSPACE.workspaceId,
        documentId: DOCUMENT_ID,
        batches: [{
          seq: 5,
          batchId: 'batch-5',
          ops: [{ op: 'add_node', nodeId: 'node-batch-5', kind: 'text', position: { x: 5, y: 0 } }],
        }],
      }),
    );
    const reconciled = await reconcileInfiniteCanvasAgentOps({
      workspace: WORKSPACE,
      document: await harness.readDocument(),
      reader: harness.reader,
      documentService: harness.service,
    });
    expect(reconciled.status).toBe('applied');
    expect((await harness.readDocument()).agentOps).toEqual({ appliedSeq: 5 });

    const next = await harness.bridge.handleToolRunEvent(
      completedEvent(batchReceipt(6, 'node-batch-6')),
    );
    expect(next).toMatchObject({ status: 'applied', seq: 6 });
    const document = await harness.readDocument();
    expect(document.nodes.some(node => node.nodeId === 'node-batch-5')).toBe(true);
    expect(document.nodes.some(node => node.nodeId === 'node-batch-6')).toBe(true);
    expect(document.agentOps).toEqual({ appliedSeq: 6 });
  });

  it('connects to an event bus and reports results through onResult', async () => {
    const harness = createHarness();
    let handler: ((event: unknown) => void) | undefined;
    const disconnect = connectInfiniteCanvasOpsBridgeToEventBus(harness.bridge, {
      on(eventName, callback) {
        expect(eventName).toBe('agent:tool-run-event');
        handler = callback;
        return () => {
          handler = undefined;
        };
      },
    });

    handler?.(completedEvent(acceptedReceipt()));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(harness.results.some(result => result.status === 'applied')).toBe(true);
    disconnect();
    expect(handler).toBeUndefined();
  });
});
