/**
 * Infinite Canvas media result bridge (K2 W5, PRD §3.4).
 *
 * Listens to the same 'agent:tool-run-event' stream the short-drama runtime
 * bridge uses and lands `infinite_canvas`-bound media results back into the
 * canvas document. Structure mirrors ShortDramaRuntimeBridge.
 *
 * Rules enforced here:
 * - `operationId` is the ONLY landing anchor: the target is the node whose
 *   `generation.operationId` matches; self and derived share one code path.
 * - `resultMode` in the binding is a cross-check only: a mismatch with the
 *   registered node (e.g. resultMode='self' but the node already has a
 *   mediaRef) is a typed ignored event — the never-overwrite invariant holds
 *   even against a tampered binding.
 * - All writes go through `InfiniteCanvasDocumentService.mutateDefaultDocument`
 *   (CAS + coalesced writes); the bridge never touches the persistence port.
 * - Cross-workspace / cross-document bindings are rejected, duplicated events
 *   are idempotent no-ops, and events without a binding are ignored with a
 *   typed `missing_metadata` reason.
 */
import { globalEventBus } from '@/infrastructure/event-bus';

import type { ImageToolErrorKind } from './ImageToolTypes';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentError,
  InfiniteCanvasNode,
  InfiniteCanvasWorkspaceRef,
} from './InfiniteCanvasTypes';
import type { InfiniteCanvasDocumentService } from './InfiniteCanvasDocumentService';
import type { InfiniteCanvasMediaRef } from './InfiniteCanvasAgentTaskTypes';

export type InfiniteCanvasMediaBridgeIgnoredReason =
  | 'missing_event_fields'
  | 'missing_metadata'
  | 'workspace_mismatch'
  | 'document_mismatch'
  | 'operation_not_found'
  | 'result_mode_mismatch'
  | 'already_terminal'
  | 'unsupported_event_type'
  | 'unsupported_result';

export interface InfiniteCanvasMediaBridgeIgnoredEvent {
  status: 'ignored';
  source: 'infinite-canvas-media-bridge';
  reason: InfiniteCanvasMediaBridgeIgnoredReason;
  workspaceId: string;
  documentId: string;
  eventType?: string;
  operationId?: string;
  eventWorkspaceId?: string;
  eventDocumentId?: string;
}

export type InfiniteCanvasMediaBridgeAction =
  | 'pending'
  | 'batch-attached'
  | 'resolved'
  | 'failed';

export type InfiniteCanvasMediaBridgeResult =
  | {
    status: 'applied';
    action: InfiniteCanvasMediaBridgeAction;
    operationId: string;
    errorKind?: ImageToolErrorKind;
  }
  | InfiniteCanvasMediaBridgeIgnoredEvent
  | { status: 'error'; error: InfiniteCanvasDocumentError };

export interface InfiniteCanvasMediaBridgeOptions {
  workspace: InfiniteCanvasWorkspaceRef;
  documentId: string;
  documentService: Pick<InfiniteCanvasDocumentService, 'mutateDefaultDocument'>;
  onResult?: (result: InfiniteCanvasMediaBridgeResult) => void;
}

export interface InfiniteCanvasMediaBridge {
  handleToolRunEvent(event: unknown): Promise<InfiniteCanvasMediaBridgeResult>;
}

// —— Binding extraction ——————————————————————————————————————————————————

interface ExtractedBinding {
  workspaceId: string;
  documentId: string;
  nodeId: string;
  resultMode: 'self' | 'derived';
  operationId: string;
  outputMediaRelativePath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/**
 * Completed events carry the enriched binding in `result.infiniteCanvas`;
 * Started (and error results produced before polling, which have no
 * attachment) fall back to the tool-call params.
 */
function extractRawBinding(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const result = payload.result;
  if (isRecord(result) && isRecord(result.infiniteCanvas)) return result.infiniteCanvas;
  const params = payload.params;
  if (isRecord(params)) {
    if (isRecord(params.infinite_canvas)) return params.infinite_canvas;
    if (isRecord(params.infiniteCanvas)) return params.infiniteCanvas;
  }
  return undefined;
}

function parseBinding(raw: Record<string, unknown>): ExtractedBinding | undefined {
  const workspaceId = getString(raw, 'workspaceId');
  const documentId = getString(raw, 'documentId');
  const nodeId = getString(raw, 'nodeId');
  const operationId = getString(raw, 'operationId');
  const resultMode = raw.resultMode;
  if (!workspaceId || !documentId || !nodeId || !operationId
    || (resultMode !== 'self' && resultMode !== 'derived')) {
    return undefined;
  }
  return {
    workspaceId,
    documentId,
    nodeId,
    resultMode,
    operationId,
    outputMediaRelativePath: getString(raw, 'outputMediaRelativePath'),
  };
}

// —— Result classification (K0-2 seven error kinds) ——————————————————————

/**
 * Maps `provider_not_configured` and the `classify_apimart_error` family
 * (including `safety_rejected`) onto the K0-2 error kind enum.
 */
export function classifyMediaErrorKind(error: unknown): ImageToolErrorKind {
  if (!isRecord(error)) return 'backend';
  const code = typeof error.code === 'string' ? error.code : undefined;
  if (code === 'provider_not_configured') return 'auth';
  if (code === 'safety_rejected') return 'invalid-input';
  const httpStatus = typeof error.http_status === 'number' ? error.http_status : undefined;
  if (httpStatus === 401 || httpStatus === 403) return 'auth';
  if (httpStatus === 429) return 'rate-limit';
  if (httpStatus === 408 || httpStatus === 504) return 'timeout';
  return 'backend';
}

type BridgeIntent =
  | { intent: 'pending' }
  | { intent: 'attach-batch'; batchId: string }
  | { intent: 'resolve'; mediaRef: InfiniteCanvasMediaRef }
  | { intent: 'fail'; errorKind: ImageToolErrorKind }
  | { intent: 'ignore'; reason: InfiniteCanvasMediaBridgeIgnoredReason };

function extractBatchId(result: Record<string, unknown>): string | undefined {
  const direct = getString(result, 'batch_id');
  if (direct) return direct;
  const batch = result.batch;
  return isRecord(batch) ? getString(batch, 'batch_id') : undefined;
}

function classifyCompletedResult(
  payload: Record<string, unknown>,
  binding: ExtractedBinding,
  workspacePath: string,
): BridgeIntent {
  // The enriched binding carries the landing path; its presence is the
  // single success criterion (§3.4).
  if (binding.outputMediaRelativePath) {
    return {
      intent: 'resolve',
      mediaRef: { workspacePath, relativePath: binding.outputMediaRelativePath },
    };
  }
  const result = payload.result;
  if (!isRecord(result)) return { intent: 'ignore', reason: 'unsupported_result' };
  const status = typeof result.status === 'string' ? result.status : undefined;
  if (status === 'polling') {
    const batchId = extractBatchId(result);
    return batchId ? { intent: 'attach-batch', batchId } : { intent: 'pending' };
  }
  if (status === 'error') {
    return { intent: 'fail', errorKind: classifyMediaErrorKind(result.error) };
  }
  if (status === 'timeout') return { intent: 'fail', errorKind: 'timeout' };
  if (status === 'failed' || status === 'partial' || status === 'completed'
    || status === 'submitted_but_task_id_missing') {
    // A terminal batch without an attached landing path never resolves.
    return { intent: 'fail', errorKind: 'backend' };
  }
  return { intent: 'ignore', reason: 'unsupported_result' };
}

function classifyEvent(
  eventType: string,
  payload: Record<string, unknown>,
  binding: ExtractedBinding,
  workspacePath: string,
): BridgeIntent {
  if (eventType === 'Started') return { intent: 'pending' };
  if (eventType === 'Completed') return classifyCompletedResult(payload, binding, workspacePath);
  if (eventType === 'Failed') return { intent: 'fail', errorKind: 'backend' };
  if (eventType === 'Cancelled') return { intent: 'fail', errorKind: 'cancelled' };
  return { intent: 'ignore', reason: 'unsupported_event_type' };
}

// —— Bridge ————————————————————————————————————————————————————————————————

interface MutationDecision {
  outcome:
    | { status: 'applied'; action: InfiniteCanvasMediaBridgeAction; errorKind?: ImageToolErrorKind }
    | { status: 'ignored'; reason: InfiniteCanvasMediaBridgeIgnoredReason };
  nodes: InfiniteCanvasNode[];
}

function findOperationNode(
  document: Readonly<InfiniteCanvasDocument>,
  operationId: string,
): InfiniteCanvasNode | undefined {
  return document.nodes.find(node => node.generation?.operationId === operationId);
}

/**
 * Applies one intent to the current document, deciding inside the mutator so
 * the cross-checks always run against the latest document state.
 */
function applyIntent(
  document: Readonly<InfiniteCanvasDocument>,
  binding: ExtractedBinding,
  intent: Exclude<BridgeIntent, { intent: 'ignore' }>,
): MutationDecision {
  const unchanged = document.nodes as InfiniteCanvasNode[];
  const node = findOperationNode(document, binding.operationId);
  const generation = node?.generation;
  if (!node || !generation) {
    // After a successful resolve the generation field is gone, so duplicated
    // completion events land here — an idempotent no-op.
    return { outcome: { status: 'ignored', reason: 'operation_not_found' }, nodes: unchanged };
  }

  // resultMode cross-check: the binding must agree with what the front end
  // registered at dispatch. A node that already carries an image is never
  // written again, no matter what the binding claims.
  if (binding.resultMode !== generation.resultMode || node.mediaRef !== undefined) {
    return { outcome: { status: 'ignored', reason: 'result_mode_mismatch' }, nodes: unchanged };
  }

  if (intent.intent === 'pending') {
    // Dispatch already registered the pending state; Started only confirms it.
    return { outcome: { status: 'applied', action: 'pending' }, nodes: unchanged };
  }

  if (intent.intent === 'attach-batch') {
    if (generation.batchId === intent.batchId) {
      return { outcome: { status: 'applied', action: 'batch-attached' }, nodes: unchanged };
    }
    return {
      outcome: { status: 'applied', action: 'batch-attached' },
      nodes: document.nodes.map(candidate => (
        candidate.nodeId === node.nodeId
          ? { ...candidate, generation: { ...generation, batchId: intent.batchId } }
          : candidate
      )),
    };
  }

  if (intent.intent === 'resolve') {
    return {
      outcome: { status: 'applied', action: 'resolved' },
      nodes: document.nodes.map(candidate => {
        if (candidate.nodeId !== node.nodeId) return candidate;
        const { generation: _cleared, ...rest } = candidate;
        return { ...rest, mediaRef: { ...intent.mediaRef } };
      }),
    };
  }

  // intent === 'fail'
  if (generation.status === 'failed' && generation.errorKind === intent.errorKind) {
    return { outcome: { status: 'ignored', reason: 'already_terminal' }, nodes: unchanged };
  }
  return {
    outcome: { status: 'applied', action: 'failed', errorKind: intent.errorKind },
    nodes: document.nodes.map(candidate => (
      candidate.nodeId === node.nodeId
        ? {
          ...candidate,
          generation: {
            ...generation,
            status: 'failed' as const,
            errorKind: intent.errorKind,
          },
        }
        : candidate
    )),
  };
}

export function createInfiniteCanvasMediaBridge(
  options: InfiniteCanvasMediaBridgeOptions,
): InfiniteCanvasMediaBridge {
  const { workspace, documentId, documentService } = options;

  function ignored(
    reason: InfiniteCanvasMediaBridgeIgnoredReason,
    detail: Partial<Pick<
      InfiniteCanvasMediaBridgeIgnoredEvent,
      'eventType' | 'operationId' | 'eventWorkspaceId' | 'eventDocumentId'
    >> = {},
  ): InfiniteCanvasMediaBridgeIgnoredEvent {
    return {
      status: 'ignored',
      source: 'infinite-canvas-media-bridge',
      reason,
      workspaceId: workspace.workspaceId,
      documentId,
      ...detail,
    };
  }

  return {
    async handleToolRunEvent(event) {
      const settle = (result: InfiniteCanvasMediaBridgeResult) => {
        options.onResult?.(result);
        return result;
      };

      const payload = isRecord(event) ? event : undefined;
      if (!payload) return settle(ignored('missing_event_fields'));
      const eventType = typeof payload.eventType === 'string' ? payload.eventType : undefined;
      if (!eventType) return settle(ignored('missing_event_fields'));

      const raw = extractRawBinding(payload);
      if (!raw) return settle(ignored('missing_metadata', { eventType }));
      const binding = parseBinding(raw);
      if (!binding) return settle(ignored('missing_metadata', { eventType }));

      const detail = { eventType, operationId: binding.operationId };
      if (binding.workspaceId !== workspace.workspaceId) {
        return settle(ignored('workspace_mismatch', {
          ...detail,
          eventWorkspaceId: binding.workspaceId,
        }));
      }
      if (binding.documentId !== documentId) {
        return settle(ignored('document_mismatch', {
          ...detail,
          eventDocumentId: binding.documentId,
        }));
      }

      const intent = classifyEvent(eventType, payload, binding, workspace.workspacePath);
      if (intent.intent === 'ignore') {
        return settle(ignored(intent.reason, detail));
      }

      let decision: MutationDecision | undefined;
      const mutated = await documentService.mutateDefaultDocument(workspace, current => {
        decision = applyIntent(current, binding, intent);
        return {
          nodes: decision.nodes,
          edges: current.edges,
          viewport: current.viewport,
        };
      });
      if (mutated.status === 'failed') {
        return settle({ status: 'error', error: mutated.error });
      }
      if (!decision) {
        return settle({
          status: 'error',
          error: { kind: 'io', reason: 'Canvas mutation did not run.' },
        });
      }
      if (decision.outcome.status === 'ignored') {
        return settle(ignored(decision.outcome.reason, detail));
      }
      return settle({
        status: 'applied',
        action: decision.outcome.action,
        operationId: binding.operationId,
        ...(decision.outcome.errorKind ? { errorKind: decision.outcome.errorKind } : {}),
      });
    },
  };
}

export interface InfiniteCanvasMediaBridgeEventBus {
  on(eventName: 'agent:tool-run-event', handler: (event: unknown) => void): () => void;
}

export function connectInfiniteCanvasMediaBridgeToEventBus(
  bridge: InfiniteCanvasMediaBridge,
  eventBus: InfiniteCanvasMediaBridgeEventBus = globalEventBus,
  options: { onIgnoredEvent?: (event: InfiniteCanvasMediaBridgeIgnoredEvent) => void } = {},
): () => void {
  return eventBus.on('agent:tool-run-event', event => {
    void bridge.handleToolRunEvent(event).then(result => {
      if (result.status === 'ignored') {
        options.onIgnoredEvent?.(result);
      }
    });
  });
}
