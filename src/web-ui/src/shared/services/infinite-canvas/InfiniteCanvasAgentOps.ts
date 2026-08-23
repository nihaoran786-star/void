/**
 * Agent canvas-ops application model (P3 W2, PRD §3.6 / plan §2.2).
 *
 * Pure functions that apply one CanvasOp batch — journaled by the Rust
 * `CanvasOp` tool into `.void/infinite-canvas/<documentId>.ops.json` and
 * echoed in its receipt — to the canvas document content. This is the
 * front-end SECOND gate: every operation is re-validated against the live
 * document (update whitelist, delete protection, self-on-media rejection,
 * group-kind rejection, mediaRef immutability), because the Rust snapshot
 * checks are best-effort and the receipt could be replayed or tampered with.
 *
 * Idempotency contract (plan §2.2-1):
 * - a batch with `seq <= agentOps.appliedSeq` is a whole-batch no-op (stale);
 * - within a fresh batch each op is individually idempotent (add existing =
 *   no-op, delete missing = no-op, connect duplicate = no-op, …);
 * - an op that fails validation is SKIPPED with a typed reason instead of
 *   rejecting the batch: the backend already rejected invalid batches
 *   atomically, so a front-side failure means replay/tamper/staleness — and
 *   per-op skipping keeps those harmless while the watermark still advances,
 *   so a poisoned op can never wedge the journal.
 *
 * The watermark (`agentOps.appliedSeq`) is advanced in the SAME returned
 * content as the node/edge changes; the document service persists both in one
 * mutation, so content and watermark can never diverge.
 */
import type {
  CanvasImageOperationKind,
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentContent,
  InfiniteCanvasEdge,
  InfiniteCanvasGenerationMediaKind,
  InfiniteCanvasNode,
} from './InfiniteCanvasTypes';
import {
  beginDerivedOperationContent,
  beginSelfGenerationContent,
  generationCardKind,
} from './InfiniteCanvasGenerationContent';

// —— Typed batch model ———————————————————————————————————————————————————————

/** add_node kinds the agent may create; 'group' has no renderer (PRD §3.6.4). */
export type CanvasAgentAddNodeKind = 'text' | 'image' | 'video';

/** `update_node.set` whitelist — mirror of the Rust UPDATE_SET_WHITELIST. */
export interface CanvasAgentUpdateSet {
  prompt?: string;
  text?: string;
  stylePresetId?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export type CanvasAgentOp =
  | {
    op: 'add_node';
    nodeId: string;
    kind: string;
    position: { x: number; y: number };
    size?: { width: number; height: number };
    text?: string;
    prompt?: string;
    stylePresetId?: string;
  }
  | { op: 'update_node'; nodeId: string; set: CanvasAgentUpdateSet }
  | { op: 'connect'; edgeId: string; sourceNodeId: string; targetNodeId: string }
  | { op: 'disconnect'; edgeId: string }
  | { op: 'delete_node'; nodeId: string }
  | {
    op: 'begin_generation';
    mode: 'self' | 'derived';
    operationId: string;
    toolId: CanvasImageOperationKind;
    mediaKind: InfiniteCanvasGenerationMediaKind;
    /** Self mode: the target blank card. Derived mode: the placeholder card. */
    nodeId: string;
    /** Derived mode only: the derivation source. */
    sourceNodeId?: string;
    /** Derived mode only: the source→placeholder edge id. */
    edgeId?: string;
    prompt?: string;
    stylePresetId?: string;
  }
  /** Entry that failed the typed parse; applied as a recorded skip, never a throw. */
  | { op: 'malformed'; detail: string };

export interface CanvasAgentOpsBatch {
  seq: number;
  batchId: string;
  ops: CanvasAgentOp[];
}

// —— Typed parse (tolerant per op, strict on batch identity) ————————————————

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parsePoint(value: unknown): { x: number; y: number } | undefined {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    return undefined;
  }
  return { x: value.x, y: value.y };
}

function parseSize(value: unknown): { width: number; height: number } | undefined {
  if (!isRecord(value) || !isFiniteNumber(value.width) || !isFiniteNumber(value.height)) {
    return undefined;
  }
  return { width: value.width, height: value.height };
}

const OPERATION_KINDS: readonly CanvasImageOperationKind[] = [
  'upscale', 'expand', 'inpaint', 'erase', 'matting', 'generate',
];

function parseToolId(value: unknown): CanvasImageOperationKind | undefined {
  return (OPERATION_KINDS as readonly unknown[]).includes(value)
    ? value as CanvasImageOperationKind
    : undefined;
}

function malformed(detail: string): CanvasAgentOp {
  return { op: 'malformed', detail };
}

/**
 * Whitelist-filtered update set: fields outside the whitelist — in particular
 * `mediaRef`, `derivedFrom`, `generation` and `domainRef` — are silently
 * dropped here and can therefore never reach the document (second gate for
 * the mediaRef-immutability invariant).
 */
function parseUpdateSet(value: unknown): CanvasAgentUpdateSet {
  const set: CanvasAgentUpdateSet = {};
  if (!isRecord(value)) return set;
  if (typeof value.prompt === 'string') set.prompt = value.prompt;
  if (typeof value.text === 'string') set.text = value.text;
  const stylePresetId = nonEmptyString(value.stylePresetId);
  if (stylePresetId) set.stylePresetId = stylePresetId;
  const position = parsePoint(value.position);
  if (position) set.position = position;
  const size = parseSize(value.size);
  if (size) set.size = size;
  return set;
}

function parseOp(value: unknown): CanvasAgentOp {
  if (!isRecord(value)) return malformed('op entry is not an object');
  const op = nonEmptyString(value.op);
  if (!op) return malformed('op entry is missing "op"');

  switch (op) {
    case 'add_node': {
      const nodeId = nonEmptyString(value.nodeId);
      const kind = nonEmptyString(value.kind);
      const position = parsePoint(value.position);
      if (!nodeId || !kind || !position) {
        return malformed('add_node requires nodeId, kind and a finite position');
      }
      const size = parseSize(value.size);
      const text = typeof value.text === 'string' ? value.text : undefined;
      const prompt = typeof value.prompt === 'string' ? value.prompt : undefined;
      const stylePresetId = nonEmptyString(value.stylePresetId);
      return {
        op: 'add_node',
        nodeId,
        kind,
        position,
        ...(size ? { size } : {}),
        ...(text !== undefined ? { text } : {}),
        ...(prompt !== undefined ? { prompt } : {}),
        ...(stylePresetId ? { stylePresetId } : {}),
      };
    }
    case 'update_node': {
      const nodeId = nonEmptyString(value.nodeId);
      if (!nodeId) return malformed('update_node requires nodeId');
      return { op: 'update_node', nodeId, set: parseUpdateSet(value.set) };
    }
    case 'connect': {
      const edgeId = nonEmptyString(value.edgeId);
      const sourceNodeId = nonEmptyString(value.sourceNodeId);
      const targetNodeId = nonEmptyString(value.targetNodeId);
      if (!edgeId || !sourceNodeId || !targetNodeId) {
        return malformed('connect requires edgeId, sourceNodeId and targetNodeId');
      }
      return { op: 'connect', edgeId, sourceNodeId, targetNodeId };
    }
    case 'disconnect': {
      const edgeId = nonEmptyString(value.edgeId);
      if (!edgeId) return malformed('disconnect requires edgeId');
      return { op: 'disconnect', edgeId };
    }
    case 'delete_node': {
      const nodeId = nonEmptyString(value.nodeId);
      if (!nodeId) return malformed('delete_node requires nodeId');
      return { op: 'delete_node', nodeId };
    }
    case 'begin_generation': {
      const mode = value.mode;
      if (mode !== 'self' && mode !== 'derived') {
        return malformed('begin_generation mode must be "self" or "derived"');
      }
      const operationId = nonEmptyString(value.operationId);
      const toolId = parseToolId(value.toolId);
      const nodeId = nonEmptyString(value.nodeId);
      if (!operationId || !toolId || !nodeId) {
        return malformed('begin_generation requires operationId, toolId and nodeId');
      }
      const rawMediaKind = value.mediaKind ?? 'image';
      if (rawMediaKind !== 'image' && rawMediaKind !== 'video') {
        return malformed('begin_generation mediaKind must be "image" or "video"');
      }
      if (rawMediaKind === 'video' && toolId !== 'generate') {
        return malformed('begin_generation mediaKind "video" requires toolId "generate"');
      }
      const prompt = typeof value.prompt === 'string' ? value.prompt : undefined;
      const stylePresetId = nonEmptyString(value.stylePresetId);
      if (mode === 'derived') {
        const sourceNodeId = nonEmptyString(value.sourceNodeId);
        const edgeId = nonEmptyString(value.edgeId);
        if (!sourceNodeId || !edgeId) {
          return malformed('derived begin_generation requires sourceNodeId and edgeId');
        }
        return {
          op: 'begin_generation',
          mode,
          operationId,
          toolId,
          mediaKind: rawMediaKind,
          nodeId,
          sourceNodeId,
          edgeId,
          ...(prompt !== undefined ? { prompt } : {}),
          ...(stylePresetId ? { stylePresetId } : {}),
        };
      }
      return {
        op: 'begin_generation',
        mode,
        operationId,
        toolId,
        mediaKind: rawMediaKind,
        nodeId,
        ...(prompt !== undefined ? { prompt } : {}),
        ...(stylePresetId ? { stylePresetId } : {}),
      };
    }
    default:
      return malformed(`unknown op "${op}"`);
  }
}

/**
 * Parses one journal/receipt batch. Batch identity (positive integer `seq`,
 * non-empty `batchId`, `ops` array) is strict — without it the idempotency
 * watermark is meaningless; individual ops are parsed tolerantly into
 * `malformed` markers that the applier records as typed skips.
 */
export function parseCanvasAgentOpsBatch(value: unknown): CanvasAgentOpsBatch | undefined {
  if (!isRecord(value)) return undefined;
  const seq = value.seq;
  if (!isFiniteNumber(seq) || !Number.isInteger(seq) || seq <= 0) return undefined;
  const batchId = nonEmptyString(value.batchId);
  if (!batchId) return undefined;
  if (!Array.isArray(value.ops)) return undefined;
  return { seq, batchId, ops: value.ops.map(parseOp) };
}

// —— Application ————————————————————————————————————————————————————————————

export type CanvasAgentOpSkipReason =
  | 'malformed_op'
  /** add_node with a kind outside text/image/video (group has no renderer). */
  | 'kind_not_allowed'
  /** Idempotent no-op: the node/edge/operation already exists. */
  | 'already_exists'
  /** Idempotent no-op: the delete/disconnect target is already gone. */
  | 'already_removed'
  | 'node_not_found'
  | 'self_edge'
  | 'empty_update'
  /** Delete protection: cards that carry media are user-deletable only. */
  | 'delete_protected'
  /** Self mode on a card that already has media (never-overwrite). */
  | 'self_target_has_media'
  /** Self mode where the card kind does not match the generation media kind. */
  | 'target_kind_mismatch';

export interface CanvasAgentOpOutcome {
  index: number;
  op: string;
  status: 'applied' | 'skipped';
  reason?: CanvasAgentOpSkipReason;
  detail?: string;
  nodeId?: string;
  edgeId?: string;
  operationId?: string;
}

/** Content returned by the applier: document content plus the new watermark. */
export type InfiniteCanvasAgentOpsContent =
  InfiniteCanvasDocumentContent & { agentOps: { appliedSeq: number } };

export type ApplyCanvasAgentOpsBatchResult =
  /** Fresh batch: apply this content (nodes/edges/viewport + watermark). */
  | {
    status: 'applied';
    appliedSeq: number;
    content: InfiniteCanvasAgentOpsContent;
    outcomes: CanvasAgentOpOutcome[];
  }
  /** `seq <= appliedSeq`: replayed/duplicated batch, whole-batch no-op. */
  | { status: 'stale'; appliedSeq: number };

interface OpApplication {
  nodes: InfiniteCanvasNode[];
  edges: InfiniteCanvasEdge[];
  outcome: Omit<CanvasAgentOpOutcome, 'index' | 'op'>;
}

function skipped(
  nodes: InfiniteCanvasNode[],
  edges: InfiniteCanvasEdge[],
  reason: CanvasAgentOpSkipReason,
  extra: Partial<CanvasAgentOpOutcome> = {},
): OpApplication {
  return { nodes, edges, outcome: { status: 'skipped', reason, ...extra } };
}

function applied(
  nodes: InfiniteCanvasNode[],
  edges: InfiniteCanvasEdge[],
  extra: Partial<CanvasAgentOpOutcome> = {},
): OpApplication {
  return { nodes, edges, outcome: { status: 'applied', ...extra } };
}

function isAddNodeKind(kind: string): kind is CanvasAgentAddNodeKind {
  return kind === 'text' || kind === 'image' || kind === 'video';
}

function applyOp(
  document: Readonly<InfiniteCanvasDocument>,
  op: CanvasAgentOp,
): OpApplication {
  const nodes = document.nodes as InfiniteCanvasNode[];
  const edges = document.edges as InfiniteCanvasEdge[];

  switch (op.op) {
    case 'malformed':
      return skipped(nodes, edges, 'malformed_op', { detail: op.detail });

    case 'add_node': {
      if (!isAddNodeKind(op.kind)) {
        // Group (and any future unknown kind) must never be agent-created:
        // the canvas cannot render it (PRD §3.6.4).
        return skipped(nodes, edges, 'kind_not_allowed', {
          nodeId: op.nodeId,
          detail: `kind "${op.kind}" is not agent-creatable`,
        });
      }
      if (nodes.some(node => node.nodeId === op.nodeId)) {
        return skipped(nodes, edges, 'already_exists', { nodeId: op.nodeId });
      }
      const node: InfiniteCanvasNode = {
        nodeId: op.nodeId,
        kind: op.kind,
        position: { ...op.position },
        ...(op.size ? { size: { ...op.size } } : {}),
        ...(op.text !== undefined ? { text: op.text } : {}),
        ...(op.prompt !== undefined ? { prompt: op.prompt } : {}),
        ...(op.stylePresetId !== undefined ? { stylePresetId: op.stylePresetId } : {}),
      };
      return applied(nodes.concat(node), edges, { nodeId: op.nodeId });
    }

    case 'update_node': {
      const target = nodes.find(node => node.nodeId === op.nodeId);
      if (!target) return skipped(nodes, edges, 'node_not_found', { nodeId: op.nodeId });
      const set = op.set;
      if (Object.keys(set).length === 0) {
        return skipped(nodes, edges, 'empty_update', { nodeId: op.nodeId });
      }
      // Only whitelisted fields exist in `set` (parse gate); mediaRef,
      // derivedFrom, generation and domainRef are untouchable by design.
      return applied(
        nodes.map(node => (
          node.nodeId === op.nodeId
            ? {
              ...node,
              ...(set.prompt !== undefined ? { prompt: set.prompt } : {}),
              ...(set.text !== undefined ? { text: set.text } : {}),
              ...(set.stylePresetId !== undefined
                ? { stylePresetId: set.stylePresetId }
                : {}),
              ...(set.position ? { position: { ...set.position } } : {}),
              ...(set.size ? { size: { ...set.size } } : {}),
            }
            : node
        )),
        edges,
        { nodeId: op.nodeId },
      );
    }

    case 'connect': {
      if (op.sourceNodeId === op.targetNodeId) {
        return skipped(nodes, edges, 'self_edge', { edgeId: op.edgeId });
      }
      if (edges.some(edge => edge.edgeId === op.edgeId
        || (edge.sourceNodeId === op.sourceNodeId && edge.targetNodeId === op.targetNodeId))) {
        return skipped(nodes, edges, 'already_exists', { edgeId: op.edgeId });
      }
      const nodeIds = new Set(nodes.map(node => node.nodeId));
      if (!nodeIds.has(op.sourceNodeId) || !nodeIds.has(op.targetNodeId)) {
        return skipped(nodes, edges, 'node_not_found', { edgeId: op.edgeId });
      }
      return applied(
        nodes,
        edges.concat({
          edgeId: op.edgeId,
          sourceNodeId: op.sourceNodeId,
          targetNodeId: op.targetNodeId,
        }),
        { edgeId: op.edgeId },
      );
    }

    case 'disconnect': {
      if (!edges.some(edge => edge.edgeId === op.edgeId)) {
        return skipped(nodes, edges, 'already_removed', { edgeId: op.edgeId });
      }
      return applied(
        nodes,
        edges.filter(edge => edge.edgeId !== op.edgeId),
        { edgeId: op.edgeId },
      );
    }

    case 'delete_node': {
      const target = nodes.find(node => node.nodeId === op.nodeId);
      if (!target) return skipped(nodes, edges, 'already_removed', { nodeId: op.nodeId });
      if (target.mediaRef !== undefined) {
        // Front-end double gate (plan §2.4): even a tampered receipt cannot
        // delete a card that carries media — only the user can, in the UI.
        return skipped(nodes, edges, 'delete_protected', { nodeId: op.nodeId });
      }
      return applied(
        nodes.filter(node => node.nodeId !== op.nodeId),
        edges.filter(edge => (
          edge.sourceNodeId !== op.nodeId && edge.targetNodeId !== op.nodeId
        )),
        { nodeId: op.nodeId },
      );
    }

    case 'begin_generation': {
      const detail = { nodeId: op.nodeId, operationId: op.operationId };
      if (nodes.some(node => node.generation?.operationId === op.operationId)) {
        return skipped(nodes, edges, 'already_exists', detail);
      }
      if (op.mode === 'self') {
        const target = nodes.find(node => node.nodeId === op.nodeId);
        if (!target) return skipped(nodes, edges, 'node_not_found', detail);
        if (target.mediaRef !== undefined) {
          // Never-overwrite: self mode is only for the first shot into a
          // blank card, no matter what the receipt claims.
          return skipped(nodes, edges, 'self_target_has_media', detail);
        }
        if (target.kind !== generationCardKind(op.mediaKind)) {
          return skipped(nodes, edges, 'target_kind_mismatch', detail);
        }
        const begun = beginSelfGenerationContent(document, op.nodeId, op.operationId, {
          toolId: op.toolId,
          mediaKind: op.mediaKind,
          ...(op.prompt !== undefined ? { prompt: op.prompt } : {}),
          ...(op.stylePresetId !== undefined ? { stylePresetId: op.stylePresetId } : {}),
        });
        return applied(begun.nodes, begun.edges, detail);
      }
      // Derived mode: parse guarantees sourceNodeId and edgeId are present.
      const source = nodes.find(node => node.nodeId === op.sourceNodeId);
      if (!source) {
        return skipped(nodes, edges, 'node_not_found', {
          ...detail,
          nodeId: op.sourceNodeId,
        });
      }
      if (nodes.some(node => node.nodeId === op.nodeId)) {
        return skipped(nodes, edges, 'already_exists', detail);
      }
      const begun = beginDerivedOperationContent(
        document,
        op.sourceNodeId!,
        op.toolId,
        op.operationId,
        op.nodeId,
        op.edgeId!,
        {
          mediaKind: op.mediaKind,
          ...(op.prompt !== undefined ? { prompt: op.prompt } : {}),
          ...(op.stylePresetId !== undefined ? { stylePresetId: op.stylePresetId } : {}),
        },
      );
      return applied(begun.nodes, begun.edges, { ...detail, edgeId: op.edgeId });
    }

    default:
      return skipped(nodes, edges, 'malformed_op', { detail: 'unreachable op' });
  }
}

/**
 * Applies one parsed batch to the document content. Stale batches
 * (`seq <= appliedSeq`) are whole-batch no-ops; fresh batches apply op by op
 * (later ops see the effects of earlier ones, so add→connect within a batch
 * works) and advance the watermark to the batch seq in the same content.
 */
export function applyCanvasAgentOpsBatchContent(
  document: Readonly<InfiniteCanvasDocument>,
  batch: CanvasAgentOpsBatch,
): ApplyCanvasAgentOpsBatchResult {
  const appliedSeq = document.agentOps?.appliedSeq ?? 0;
  if (batch.seq <= appliedSeq) return { status: 'stale', appliedSeq };

  let working: InfiniteCanvasDocument = { ...document };
  const outcomes: CanvasAgentOpOutcome[] = [];
  batch.ops.forEach((op, index) => {
    const result = applyOp(working, op);
    working = { ...working, nodes: result.nodes, edges: result.edges };
    outcomes.push({ index, op: op.op, ...result.outcome });
  });

  return {
    status: 'applied',
    appliedSeq: batch.seq,
    outcomes,
    content: {
      nodes: working.nodes,
      edges: working.edges,
      viewport: document.viewport,
      agentOps: { appliedSeq: batch.seq },
    },
  };
}

export interface AppliedCanvasAgentOpsBatch {
  seq: number;
  batchId: string;
  outcomes: CanvasAgentOpOutcome[];
}

export interface ApplyCanvasAgentOpsBatchesResult {
  /** Content to persist; equals the input content when nothing applied. */
  content: InfiniteCanvasAgentOpsContent;
  appliedBatches: AppliedCanvasAgentOpsBatch[];
}

/**
 * Applies many batches (journal reconciliation): strict ascending seq order,
 * batches at or below the watermark skipped. Used inside one document
 * mutation so watermark and content land atomically.
 */
export function applyCanvasAgentOpsBatchesContent(
  document: Readonly<InfiniteCanvasDocument>,
  batches: readonly CanvasAgentOpsBatch[],
): ApplyCanvasAgentOpsBatchesResult {
  const ordered = [...batches].sort((a, b) => a.seq - b.seq);
  let working: InfiniteCanvasDocument = { ...document };
  const appliedBatches: AppliedCanvasAgentOpsBatch[] = [];
  for (const batch of ordered) {
    const result = applyCanvasAgentOpsBatchContent(working, batch);
    if (result.status !== 'applied') continue;
    working = {
      ...working,
      nodes: result.content.nodes,
      edges: result.content.edges,
      agentOps: result.content.agentOps,
    };
    appliedBatches.push({ seq: batch.seq, batchId: batch.batchId, outcomes: result.outcomes });
  }
  return {
    content: {
      nodes: working.nodes,
      edges: working.edges,
      viewport: document.viewport,
      agentOps: { appliedSeq: working.agentOps?.appliedSeq ?? 0 },
    },
    appliedBatches,
  };
}
