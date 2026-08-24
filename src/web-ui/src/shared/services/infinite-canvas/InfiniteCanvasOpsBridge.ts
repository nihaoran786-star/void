/**
 * Infinite Canvas agent ops bridge (P3 W3, PRD §3.6 / plan §2.1 path A).
 *
 * Listens to the same 'agent:tool-run-event' stream the media bridge uses and
 * lands accepted `CanvasOp` receipts into the canvas document by applying the
 * batch through the shared agent-ops pure functions. Structure mirrors
 * `InfiniteCanvasMediaBridge`.
 *
 * Rules enforced here:
 * - only Completed events with a `status === 'accepted'` CanvasOp receipt are
 *   considered; everything else is a typed ignored event. The tool name is a
 *   WEAK filter ('CanvasOp' or the 'CallDeferredTool' gateway): CanvasOp is a
 *   collapsed tool, so the production path invokes it through the deferred
 *   -tool gateway and the event carries toolName 'CallDeferredTool' — the
 *   receipt shape (source 'infinite_canvas' + accepted/seq/batchId/ops) is
 *   what authorizes a landing, never the name alone;
 * - cross-workspace / cross-document receipts are rejected before any write;
 * - duplicated events are idempotent: the batch `seq` is checked against the
 *   document's `agentOps.appliedSeq` watermark INSIDE the mutation, so a
 *   replay is a typed `already_applied` no-op;
 * - all writes go through `InfiniteCanvasDocumentService.mutateDefaultDocument`
 *   (CAS + coalesced writes); the bridge never touches the persistence port,
 *   and it NEVER writes the ops journal file (Rust is its only writer).
 */
import { globalEventBus } from '@/infrastructure/event-bus';

import type {
  InfiniteCanvasDocumentError,
  InfiniteCanvasWorkspaceRef,
} from './InfiniteCanvasTypes';
import type { InfiniteCanvasDocumentService } from './InfiniteCanvasDocumentService';
import {
  applyCanvasAgentOpsBatchesContent,
  parseCanvasAgentOpsBatch,
  type AppliedCanvasAgentOpsBatch,
  type CanvasAgentOpOutcome,
  type CanvasAgentOpsBatch,
} from './InfiniteCanvasAgentOps';

export type InfiniteCanvasOpsBridgeIgnoredReason =
  | 'missing_event_fields'
  /** The event belongs to a different tool; the bridge sees every tool run. */
  | 'not_canvas_op'
  | 'unsupported_event_type'
  /** Typed CanvasOp error receipts carry nothing to land. */
  | 'not_accepted'
  /** Receipt without a parseable `{seq, batchId, ops}` batch. */
  | 'missing_batch'
  | 'workspace_mismatch'
  | 'document_mismatch'
  /** Duplicate/replayed event: batch seq at or below the watermark. */
  | 'already_applied';

export interface InfiniteCanvasOpsBridgeIgnoredEvent {
  status: 'ignored';
  source: 'infinite-canvas-ops-bridge';
  reason: InfiniteCanvasOpsBridgeIgnoredReason;
  workspaceId: string;
  documentId: string;
  eventType?: string;
  seq?: number;
  batchId?: string;
  eventWorkspaceId?: string;
  eventDocumentId?: string;
}

export type InfiniteCanvasOpsBridgeResult =
  | {
    status: 'applied';
    seq: number;
    batchId: string;
    outcomes: CanvasAgentOpOutcome[];
  }
  | InfiniteCanvasOpsBridgeIgnoredEvent
  | { status: 'error'; error: InfiniteCanvasDocumentError };

export interface InfiniteCanvasOpsBridgeOptions {
  workspace: InfiniteCanvasWorkspaceRef;
  documentId: string;
  documentService: Pick<InfiniteCanvasDocumentService, 'mutateDefaultDocument'>;
  onResult?: (result: InfiniteCanvasOpsBridgeResult) => void;
  /**
   * P1: invoked when a batch failed to LAND at the document layer (the
   * receipt is journaled but the mutation errored). The host should schedule
   * one journal-driven reconciliation (`reconcileInfiniteCanvasAgentOps`) so
   * the missed batch is replayed even if no further event ever arrives.
   */
  scheduleReconciliation?: () => void;
}

export interface InfiniteCanvasOpsBridge {
  handleToolRunEvent(event: unknown): Promise<InfiniteCanvasOpsBridgeResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function createInfiniteCanvasOpsBridge(
  options: InfiniteCanvasOpsBridgeOptions,
): InfiniteCanvasOpsBridge {
  const { workspace, documentId, documentService } = options;

  // P1: batches whose landing mutation failed. They ride along with the next
  // incoming batch (applied strictly seq-ascending in ONE mutation), so a
  // later batch can never push the watermark over a batch that never landed.
  const retryQueue = new Map<number, CanvasAgentOpsBatch>();

  function ignored(
    reason: InfiniteCanvasOpsBridgeIgnoredReason,
    detail: Partial<Pick<
      InfiniteCanvasOpsBridgeIgnoredEvent,
      'eventType' | 'seq' | 'batchId' | 'eventWorkspaceId' | 'eventDocumentId'
    >> = {},
  ): InfiniteCanvasOpsBridgeIgnoredEvent {
    return {
      status: 'ignored',
      source: 'infinite-canvas-ops-bridge',
      reason,
      workspaceId: workspace.workspaceId,
      documentId,
      ...detail,
    };
  }

  return {
    async handleToolRunEvent(event) {
      const settle = (result: InfiniteCanvasOpsBridgeResult) => {
        options.onResult?.(result);
        return result;
      };

      const payload = isRecord(event) ? event : undefined;
      if (!payload) return settle(ignored('missing_event_fields'));
      const eventType = typeof payload.eventType === 'string' ? payload.eventType : undefined;
      if (!eventType) return settle(ignored('missing_event_fields'));
      // C1: weak tool-name filter. CanvasOp is a collapsed tool, so the
      // production path calls it through the CallDeferredTool gateway and
      // the event's toolName is the GATEWAY's, not 'CanvasOp'. Any other
      // tool name can never carry a CanvasOp receipt.
      const toolName = payload.toolName;
      if (toolName !== 'CanvasOp' && toolName !== 'CallDeferredTool') {
        return settle(ignored('not_canvas_op', { eventType }));
      }
      // CanvasOp receipts only exist on Completed events; Started carries no
      // result and Failed/Cancelled never journaled anything to land.
      if (eventType !== 'Completed') {
        return settle(ignored('unsupported_event_type', { eventType }));
      }
      const receipt = isRecord(payload.result) ? payload.result : undefined;
      // Gateway events carry results of EVERY deferred tool; only a receipt
      // shaped like a canvas-tool result may proceed (source is stamped by
      // the Rust canvas tools on ok/accepted/error receipts alike).
      if (toolName === 'CallDeferredTool'
        && (!receipt || receipt.source !== 'infinite_canvas')) {
        return settle(ignored('not_canvas_op', { eventType }));
      }
      if (!receipt || receipt.status !== 'accepted') {
        return settle(ignored('not_accepted', { eventType }));
      }

      const detail = {
        eventType,
        ...(typeof receipt.seq === 'number' ? { seq: receipt.seq } : {}),
        ...(getString(receipt, 'batchId') ? { batchId: getString(receipt, 'batchId') } : {}),
      };
      const receiptWorkspaceId = getString(receipt, 'workspaceId');
      if (receiptWorkspaceId !== workspace.workspaceId) {
        return settle(ignored('workspace_mismatch', {
          ...detail,
          eventWorkspaceId: receiptWorkspaceId,
        }));
      }
      const receiptDocumentId = getString(receipt, 'documentId');
      if (receiptDocumentId !== documentId) {
        return settle(ignored('document_mismatch', {
          ...detail,
          eventDocumentId: receiptDocumentId,
        }));
      }

      const batch = parseCanvasAgentOpsBatch({
        seq: receipt.seq,
        batchId: receipt.batchId,
        ops: receipt.ops,
      });
      if (!batch) return settle(ignored('missing_batch', detail));

      // The staleness check runs inside the mutator so it always sees the
      // latest watermark, even when reconciliation raced this event.
      // P1: earlier batches that failed to land ride along, strictly
      // seq-ascending, in the same mutation — the incoming batch can only
      // advance the watermark past them by applying them first.
      const batchesToApply = [
        ...[...retryQueue.values()].filter(queued => queued.seq !== batch.seq),
        batch,
      ];
      let mutatorRan = false;
      let appliedBatches: AppliedCanvasAgentOpsBatch[] = [];
      const mutated = await documentService.mutateDefaultDocument(workspace, current => {
        mutatorRan = true;
        const result = applyCanvasAgentOpsBatchesContent(current, batchesToApply);
        appliedBatches = result.appliedBatches;
        if (result.appliedBatches.length === 0) {
          return {
            nodes: current.nodes,
            edges: current.edges,
            viewport: current.viewport,
          };
        }
        return result.content;
      });
      if (mutated.status === 'failed') {
        // P1: the receipt is journaled but landing failed — queue the batch
        // so the next event replays it, and ask the host for one
        // journal-driven reconciliation in case no further event arrives.
        // The watermark was NOT advanced, so nothing is swallowed.
        retryQueue.set(batch.seq, batch);
        options.scheduleReconciliation?.();
        return settle({ status: 'error', error: mutated.error });
      }
      if (!mutatorRan) {
        return settle({
          status: 'error',
          error: { kind: 'io', reason: 'Canvas ops mutation did not run.' },
        });
      }
      // Anything at or below the new watermark is settled (either applied
      // just now or landed elsewhere, e.g. by reconciliation) — drop it.
      const watermark = mutated.document.agentOps?.appliedSeq ?? 0;
      for (const seq of [...retryQueue.keys()]) {
        if (seq <= watermark) retryQueue.delete(seq);
      }
      const own = appliedBatches.find(entry => entry.seq === batch.seq);
      if (!own) {
        return settle(ignored('already_applied', detail));
      }
      return settle({
        status: 'applied',
        seq: batch.seq,
        batchId: batch.batchId,
        outcomes: own.outcomes,
      });
    },
  };
}

export interface InfiniteCanvasOpsBridgeEventBus {
  on(eventName: 'agent:tool-run-event', handler: (event: unknown) => void): () => void;
}

export function connectInfiniteCanvasOpsBridgeToEventBus(
  bridge: InfiniteCanvasOpsBridge,
  eventBus: InfiniteCanvasOpsBridgeEventBus = globalEventBus,
  options: { onIgnoredEvent?: (event: InfiniteCanvasOpsBridgeIgnoredEvent) => void } = {},
): () => void {
  return eventBus.on('agent:tool-run-event', event => {
    void bridge.handleToolRunEvent(event).then(result => {
      if (result.status === 'ignored') {
        options.onIgnoredEvent?.(result);
      }
    });
  });
}
