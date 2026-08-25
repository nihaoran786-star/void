/**
 * Generation-registration content helpers (K2 W2/W3 semantics, sunk from the
 * app-layer panel models to shared in P3 W2 so the agent ops applier can reuse
 * them — the app layer keeps re-exports, callers are unchanged).
 *
 * Pure document-content functions with two ruling invariants:
 *
 * - `resultMode: 'self'` is only ever legal on a card that has no mediaRef yet
 *   (first shot into a blank card); cards that already carry media must derive
 *   a NEW placeholder card instead (never-overwrite, PRD §3.1/§3.5).
 * - Both helpers are idempotent on `operationId`: re-registering the same
 *   operation returns the content unchanged.
 *
 * P3 additions are strictly optional: `mediaKind: 'video'` targets/creates
 * video cards and stamps `generation.mediaKind`; the defaults reproduce the
 * K2 image behavior byte-for-byte.
 */
import type {
  CanvasImageOperationKind,
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentContent,
  InfiniteCanvasEdge,
  InfiniteCanvasGenerationMediaKind,
  InfiniteCanvasNode,
} from './InfiniteCanvasTypes';

/** Horizontal offset used to place a derived placeholder beside its source. */
const DERIVED_NODE_OFFSET_X = 360;

function content(document: Readonly<InfiniteCanvasDocument>): InfiniteCanvasDocumentContent {
  return {
    nodes: document.nodes,
    edges: document.edges,
    viewport: document.viewport,
  };
}

export interface InfiniteCanvasBeginGenerationOptions {
  /** 'video' targets/creates video cards; default 'image' (K2 behavior). */
  mediaKind?: InfiniteCanvasGenerationMediaKind;
  /** Prompt written onto the target/placeholder card when provided. */
  prompt?: string;
  /** Style preset recorded on the target/placeholder card when provided. */
  stylePresetId?: string;
}

/** The card kind a generation of the given media kind lands into. */
export function generationCardKind(
  mediaKind: InfiniteCanvasGenerationMediaKind,
): 'image' | 'video' {
  return mediaKind === 'video' ? 'video' : 'image';
}

function generationRecord(
  operationId: string,
  toolId: CanvasImageOperationKind,
  resultMode: 'self' | 'derived',
  mediaKind: InfiniteCanvasGenerationMediaKind,
): NonNullable<InfiniteCanvasNode['generation']> {
  return {
    operationId,
    toolId,
    resultMode,
    status: 'pending',
    // Image stays the implicit default so K2 documents round-trip unchanged.
    ...(mediaKind === 'video' ? { mediaKind: 'video' as const } : {}),
  };
}

/**
 * Registers a self-mode generation on a blank card: the result will land in
 * the card itself. Rejected (content returned unchanged) when the card is
 * missing, of the wrong kind for the media kind, or **already has a
 * mediaRef** — self mode is strictly for the first shot into an empty card.
 *
 * Re-registering with a new operationId replaces a previous pending/failed
 * generation (that is the retry path); re-registering the same operationId
 * is a no-op.
 */
export function beginSelfGenerationContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  operationId: string,
  options: InfiniteCanvasBeginGenerationOptions & {
    /** Operation kind; defaults to 'generate' (the K2 blank-card first shot). */
    toolId?: CanvasImageOperationKind;
  } = {},
): InfiniteCanvasDocumentContent {
  const mediaKind = options.mediaKind ?? 'image';
  const toolId = options.toolId ?? 'generate';
  const target = document.nodes.find(node => node.nodeId === nodeId);
  if (!target
    || target.kind !== generationCardKind(mediaKind)
    || target.mediaRef !== undefined) {
    return content(document);
  }
  if (target.generation?.operationId === operationId) return content(document);
  return {
    ...content(document),
    nodes: document.nodes.map(node => (
      node.nodeId === nodeId
        ? {
          ...node,
          ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
          ...(options.stylePresetId !== undefined
            ? { stylePresetId: options.stylePresetId }
            : {}),
          generation: generationRecord(operationId, toolId, 'self', mediaKind),
        }
        : node
    )),
  };
}

/**
 * Registers a derived operation: creates the pending placeholder card and the
 * source→derived edge. Re-invoking with an operationId that is already
 * registered returns the content unchanged (idempotent dispatch), as does a
 * missing source or an already-taken placeholder nodeId. The source node —
 * and in particular its mediaRef — is never touched.
 */
export function beginDerivedOperationContent(
  document: Readonly<InfiniteCanvasDocument>,
  sourceNodeId: string,
  toolId: CanvasImageOperationKind,
  operationId: string,
  derivedNodeId: string,
  edgeId: string,
  options: InfiniteCanvasBeginGenerationOptions = {},
): InfiniteCanvasDocumentContent {
  const mediaKind = options.mediaKind ?? 'image';
  if (document.nodes.some(node => node.generation?.operationId === operationId)) {
    return content(document);
  }
  const source = document.nodes.find(node => node.nodeId === sourceNodeId);
  if (!source) return content(document);
  if (document.nodes.some(node => node.nodeId === derivedNodeId)) return content(document);
  const placeholder: InfiniteCanvasNode = {
    nodeId: derivedNodeId,
    kind: generationCardKind(mediaKind),
    position: {
      x: source.position.x + (source.size?.width ?? 0) + DERIVED_NODE_OFFSET_X,
      y: source.position.y,
    },
    ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
    ...(options.stylePresetId !== undefined ? { stylePresetId: options.stylePresetId } : {}),
    derivedFrom: { sourceNodeId, toolId, operationId },
    generation: generationRecord(operationId, toolId, 'derived', mediaKind),
  };
  return {
    ...content(document),
    nodes: [...document.nodes, placeholder],
    edges: [
      ...document.edges,
      // Version-tree edge: marked 'derived' so reference collection skips it
      // (a pure regenerate must not inherit its source as a 垫图 reference).
      { edgeId, sourceNodeId, targetNodeId: derivedNodeId, role: 'derived' },
    ],
  };
}

// —— P4 W4: batch (n > 1) landing ————————————————————————————————————————
//
// One submitted operation can come back with several produced media items
// (`outputMediaItems`, R2). Item 1 lands in the anchor card exactly like a
// single result did before P4; items 2..N each grow their own derived card
// wired back to the anchor. Both the live media bridge and the residual
// pending reconciliation call this one function, so "landed while open" and
// "reconciled after reopening" can never disagree.

/** One produced media item of a batch, as carried by R2's `outputMediaItems`. */
export interface InfiniteCanvasBatchOutputItem {
  /** 1-based index within the batch; decides ordering and the derived node id. */
  itemIndex: number;
  /** Workspace-relative landing path; entries without one are never passed in. */
  relativePath: string;
}

/**
 * Deterministic id of the card that carries batch item `itemIndex`.
 *
 * Determinism is the whole idempotency story (plan §2.3-4): tool-run events
 * can be replayed and the pending reconciliation can run over an already
 * landed batch, so "the card for this item already exists" has to be a
 * decidable, id-based question rather than a guess.
 */
export function infiniteCanvasBatchNodeId(operationId: string, itemIndex: number): string {
  return `node-${operationId}-i${itemIndex}`;
}

/** Deterministic id of the anchor→item edge, for the same replay reason. */
export function infiniteCanvasBatchEdgeId(operationId: string, itemIndex: number): string {
  return `edge-${operationId}-i${itemIndex}`;
}

/** Shared prefix of every deterministic sibling id of one operation. */
function batchSiblingIdPrefix(operationId: string): string {
  return `node-${operationId}-i`;
}

/**
 * P4 review P2: finds the anchor of a batch whose registration is already gone.
 *
 * A partial batch can report twice: the first event carries item 1 only, a
 * later one carries items 1..N. The first landing clears `generation` from the
 * anchor, so looking the operation up by its registration finds nothing and
 * every later item used to be dropped — "partial now, completed later" was a
 * dead path. The anchor is still identifiable from what the first landing left
 * behind, in descending order of certainty:
 *
 * 1. a deterministic sibling card points back at it (`derivedFrom.sourceNodeId`);
 * 2. a derived-mode anchor still records the operation in its own `derivedFrom`;
 * 3. self mode leaves no lineage, but the card carrying one of this batch's
 *    own media paths can only be the anchor.
 *
 * Returns undefined when none of that holds — then nothing is written, exactly
 * as before.
 */
function recoverBatchAnchor(
  document: Readonly<InfiniteCanvasDocument>,
  operationId: string,
  workspacePath: string,
  items: readonly InfiniteCanvasBatchOutputItem[],
): InfiniteCanvasNode | undefined {
  const siblingPrefix = batchSiblingIdPrefix(operationId);
  const byId = new Map(document.nodes.map(node => [node.nodeId, node]));
  for (const node of document.nodes) {
    if (!node.nodeId.startsWith(siblingPrefix)) continue;
    const sourceNodeId = node.derivedFrom?.sourceNodeId;
    const anchor = sourceNodeId ? byId.get(sourceNodeId) : undefined;
    if (anchor) return anchor;
  }
  const derivedAnchor = document.nodes.find(node => (
    node.derivedFrom?.operationId === operationId
    && !node.nodeId.startsWith(siblingPrefix)
  ));
  if (derivedAnchor) return derivedAnchor;
  const paths = new Set(items.map(item => item.relativePath));
  return document.nodes.find(node => (
    node.mediaRef !== undefined
    && node.mediaRef.workspacePath === workspacePath
    && paths.has(node.mediaRef.relativePath)
  ));
}

/**
 * Lands a whole batch of produced media onto the document.
 *
 * Rules (plan §2.3, PRD §3.4):
 * - The anchor is still the node registered under `operationId`; nothing else
 *   is ever written.
 * - A still-registered anchor that already carries a mediaRef is left
 *   completely alone — never-overwrite wins over any claim the result makes.
 *   Zero writes.
 * - P4 review P2: when the registration is already gone the batch is not
 *   discarded. The anchor is recovered from the lineage of the earlier landing
 *   (see `recoverBatchAnchor`) and only the items that have not landed yet grow
 *   their deterministic sibling cards, so "partial now, the rest later" works.
 * - Items are applied in ascending `itemIndex`. The FIRST supplied item lands
 *   in the anchor (so a partial batch whose item 1 failed still fills the card
 *   the user clicked); the rest become derived cards.
 * - Every derived card and edge uses a deterministic id, so re-applying the
 *   same batch is a no-op instead of a duplicate card.
 * - An empty item list returns the content unchanged; the caller settles the
 *   generation as a typed failure.
 *
 * With exactly one item this reproduces `resolveOperationContent` field for
 * field — the n = 1 regression guard the plan calls the most important one.
 */
export function resolveOperationBatchContent(
  document: Readonly<InfiniteCanvasDocument>,
  operationId: string,
  workspacePath: string,
  items: readonly InfiniteCanvasBatchOutputItem[],
): InfiniteCanvasDocumentContent {
  const ordered = [...items]
    .filter(item => typeof item.relativePath === 'string' && item.relativePath.trim().length > 0)
    .sort((left, right) => left.itemIndex - right.itemIndex);
  if (ordered.length === 0) return content(document);

  const registered = document.nodes.find(node => node.generation?.operationId === operationId);
  // A still-registered anchor that already carries media is the never-overwrite
  // case: zero writes, exactly as before P4 review.
  if (registered?.mediaRef !== undefined) return content(document);
  // P2: with the registration already cleared the batch may still be landing
  // its later items; recover the anchor and fill only the missing siblings.
  const anchor = registered ?? recoverBatchAnchor(document, operationId, workspacePath, ordered);
  if (!anchor) return content(document);

  const head = ordered[0];
  const landsHead = registered !== undefined;
  const nodes: InfiniteCanvasNode[] = landsHead
    ? document.nodes.map(node => {
      if (node.nodeId !== anchor.nodeId) return node;
      const { generation: _cleared, ...keep } = node;
      return { ...keep, mediaRef: { workspacePath, relativePath: head.relativePath } };
    })
    : [...document.nodes];

  const edges: InfiniteCanvasEdge[] = [...document.edges];
  let grew = false;
  const takenNodeIds = new Set(document.nodes.map(node => node.nodeId));
  const takenEdgeIds = new Set(document.edges.map(edge => edge.edgeId));
  const takenPaths = new Set(
    document.nodes
      .filter(node => node.mediaRef?.workspacePath === workspacePath)
      .map(node => node.mediaRef!.relativePath),
  );
  const toolId = anchor.generation?.toolId ?? anchor.derivedFrom?.toolId ?? 'generate';
  const anchorWidth = anchor.size?.width ?? 0;
  let ordinal = 0;
  for (const item of ordered) {
    // The head item went into the anchor above; with a recovered anchor every
    // item that already sits on a card of this document landed in an earlier
    // event of the same batch (typically that very head item).
    if (landsHead && item === head) continue;
    if (!landsHead && takenPaths.has(item.relativePath)) continue;
    ordinal += 1;
    const nodeId = infiniteCanvasBatchNodeId(operationId, item.itemIndex);
    if (takenNodeIds.has(nodeId)) continue;
    takenNodeIds.add(nodeId);
    grew = true;
    nodes.push({
      nodeId,
      kind: anchor.kind === 'video' ? 'video' : 'image',
      position: {
        x: anchor.position.x + anchorWidth + DERIVED_NODE_OFFSET_X * ordinal,
        y: anchor.position.y,
      },
      // Siblings of the same shot: the prompt and the parameters that produced
      // them travel along, so regenerating from any of them keeps the setting.
      ...(anchor.prompt !== undefined ? { prompt: anchor.prompt } : {}),
      // P4 review C6: the style preset is part of "the parameters that produced
      // them" — dropping it made a sibling regenerate without the style.
      ...(anchor.stylePresetId !== undefined
        ? { stylePresetId: anchor.stylePresetId }
        : {}),
      ...(anchor.generationParams !== undefined
        ? { generationParams: { ...anchor.generationParams } }
        : {}),
      mediaRef: { workspacePath, relativePath: item.relativePath },
      derivedFrom: { sourceNodeId: anchor.nodeId, toolId, operationId },
    });
    const edgeId = infiniteCanvasBatchEdgeId(operationId, item.itemIndex);
    if (takenEdgeIds.has(edgeId)) continue;
    takenEdgeIds.add(edgeId);
    // role 'derived': a batch sibling is lineage, never a base-image
    // reference, so reference collection skips this edge.
    edges.push({ edgeId, sourceNodeId: anchor.nodeId, targetNodeId: nodeId, role: 'derived' });
  }

  // A recovered anchor with nothing left to grow is a replay: return the very
  // same arrays so callers can keep treating identity as "nothing happened".
  if (!landsHead && !grew) return content(document);
  return { ...content(document), nodes, edges };
}
