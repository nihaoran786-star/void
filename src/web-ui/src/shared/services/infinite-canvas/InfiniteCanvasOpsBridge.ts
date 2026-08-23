/**
 * Infinite Canvas agent ops bridge (P3 W3, PRD §3.6 / plan §2.1 path A).
 *
 * Listens to the same 'agent:tool-run-event' stream the media bridge uses and
 * lands accepted `CanvasOp` receipts into the canvas document by applying the
 * batch through the shared agent-ops pure functions. Structure mirrors
 * `InfiniteCanvasMediaBridge`.
 *
 * Rules enforced here:
 * - only `toolName === 'CanvasOp'` Completed events with a
 *   `status === 'accepted'` receipt are considered; everything else is a
 *   typed ignored event;
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
  applyCanvasAgentOpsBatchContent,
  parseCanvasAgentOpsBatch,
  type ApplyCanvasAgentOpsBatchResult,
  type CanvasAgentOpOutcome,
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
      if (payload.toolName !== 'CanvasOp') {
        return settle(ignored('not_canvas_op', { eventType }));
      }
      // CanvasOp receipts only exist on Completed events; Started carries no
      // result and Failed/Cancelled never journaled anything to land.
      if (eventType !== 'Completed') {
        return settle(ignored('unsupported_event_type', { eventType }));
      }
      const receipt = isRecord(payload.result) ? payload.result : undefined;
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
      let applied: ApplyCanvasAgentOpsBatchResult | undefined;
      const mutated = await documentService.mutateDefaultDocument(workspace, current => {
        applied = applyCanvasAgentOpsBatchContent(current, batch);
        if (applied.status !== 'applied') {
          return {
            nodes: current.nodes,
            edges: current.edges,
            viewport: current.viewport,
          };
        }
        return applied.content;
      });
      if (mutated.status === 'failed') {
        return settle({ status: 'error', error: mutated.error });
      }
      if (!applied) {
        return settle({
          status: 'error',
          error: { kind: 'io', reason: 'Canvas ops mutation did not run.' },
        });
      }
      if (applied.status !== 'applied') {
        return settle(ignored('already_applied', detail));
      }
      return settle({
        status: 'applied',
        seq: batch.seq,
        batchId: batch.batchId,
        outcomes: applied.outcomes,
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
