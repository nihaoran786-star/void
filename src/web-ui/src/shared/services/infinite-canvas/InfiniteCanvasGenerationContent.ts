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
import {
  appendInfiniteCanvasVariants,
  infiniteCanvasNodeVariants,
  infiniteCanvasOperationAccumulates,
} from './InfiniteCanvasMediaVariants';

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
 * §7.6: registers a REGENERATE on a card that already carries pictures.
 *
 * Before §7.6 this shot grew a sibling card; the owner asked for the results
 * to pile up on the card they were fired from instead. The registration is
 * therefore self mode on the card itself, which is exactly the shape
 * `infiniteCanvasGenerationAppendsToCard` lets past the never-overwrite guard
 * in both landing lanes. `toolId` is always `'generate'` — the five tools and
 * crop keep deriving their own card, and this helper refuses anything else.
 *
 * Idempotent on `operationId`, like every other registration here; a card that
 * is missing, of the wrong kind, or already busy with another shot is left
 * untouched.
 */
export function beginAccumulatingGenerationContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  operationId: string,
  options: InfiniteCanvasBeginGenerationOptions = {},
): InfiniteCanvasDocumentContent {
  const mediaKind = options.mediaKind ?? 'image';
  const target = document.nodes.find(node => node.nodeId === nodeId);
  if (!target || target.kind !== generationCardKind(mediaKind)) return content(document);
  if (target.generation?.operationId === operationId) return content(document);
  if (target.generation?.status === 'pending') return content(document);
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
          generation: generationRecord(operationId, 'generate', 'self', mediaKind),
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

/**
 * P5 W2 (PRD §3.8): finishes a LOCAL derivation in the same mutation that
 * registered it.
 *
 * Cropping produces its file on disk with no media task behind it — no batch,
 * no polling, no `InfiniteCanvasMediaBridge`. It is therefore the single
 * operation whose derived card gets its `mediaRef` written by the front end,
 * and that write has to happen inside the very same
 * `mutateDefaultDocument` call as `beginDerivedOperationContent`, or a
 * forever-pending crop card becomes observable.
 *
 * The never-overwrite invariant is enforced here too: a node that already
 * carries media is left untouched, and so is a node that does not exist. On
 * success the `generation` record is removed, exactly as a landed media result
 * removes it.
 */
export function applyLocalDerivedMedia(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  mediaRef: { workspacePath: string; relativePath: string },
): InfiniteCanvasDocumentContent {
  const target = document.nodes.find(node => node.nodeId === nodeId);
  if (!target || target.mediaRef !== undefined) return content(document);
  if (!mediaRef.relativePath.trim()) return content(document);
  return {
    ...content(document),
    nodes: document.nodes.map(node => {
      if (node.nodeId !== nodeId) return node;
      const { generation: _settled, ...keep } = node;
      return {
        ...keep,
        mediaRef: {
          workspacePath: mediaRef.workspacePath,
          relativePath: mediaRef.relativePath,
        },
      };
    }),
  };
}

// —— P4 W4: batch (n > 1) landing ————————————————————————————————————————
//
// One submitted operation can come back with several produced media items
// (`outputMediaItems`, R2). Both the live media bridge and the residual
// pending reconciliation call this one function, so "landed while open" and
// "reconciled after reopening" can never disagree.
//
// §7.6 (owner 2026-08-28) split this into two landing rules:
//
// - `toolId: 'generate'` — the whole batch ACCUMULATES on the card it was
//   fired from, becoming that card's picture list. No sibling cards at all.
// - the five tools and crop — unchanged P4 behavior: item 1 fills the derived
//   placeholder, items 2..N each grow their own deterministic sibling card,
//   because turning a picture into a different picture is lineage the owner
//   must be able to see.

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
  return document.nodes.find(node => infiniteCanvasNodeVariants(node).some(variant => (
    // §7.6: the earlier landing may have gone into the card's picture LIST,
    // so the lookup has to scan every picture, not just the current one.
    variant.workspacePath === workspacePath && paths.has(variant.relativePath)
  )));
}

/** The operation kind a card's landing rule is decided by (§7.6). */
function anchorToolId(anchor: InfiniteCanvasNode): CanvasImageOperationKind {
  return anchor.generation?.toolId ?? anchor.derivedFrom?.toolId ?? 'generate';
}

/**
 * §7.6's landing: the whole batch piles up on the anchor card.
 *
 * Every item becomes one more picture on the card, in `itemIndex` order, and
 * the first genuinely new one becomes what the card face shows. Pictures the
 * card already carries are skipped, which is the entire idempotency story for
 * this lane — a replayed event and a reconciliation pass over an already
 * landed batch both add nothing. A still-registered anchor always has its
 * generation cleared, even when every item was a duplicate, or the card would
 * spin forever.
 */
function accumulateBatchOntoAnchor(
  document: Readonly<InfiniteCanvasDocument>,
  anchor: InfiniteCanvasNode,
  items: readonly InfiniteCanvasBatchOutputItem[],
  workspacePath: string,
  registered: boolean,
): InfiniteCanvasDocumentContent {
  const appended = appendInfiniteCanvasVariants(
    anchor,
    items.map(item => ({ workspacePath, relativePath: item.relativePath })),
  );
  if (appended === anchor && !registered) return content(document);
  const { generation: _cleared, ...settled } = appended;
  return {
    ...content(document),
    nodes: document.nodes.map(node => (node.nodeId === anchor.nodeId ? settled : node)),
  };
}

/**
 * Lands a whole batch of produced media onto the document.
 *
 * Rules (plan §2.3, PRD §3.4 as revised by §3.10):
 * - The anchor is still the node registered under `operationId`; nothing else
 *   is ever written.
 * - §7.6: for a plain generation the whole batch is appended to the anchor's
 *   picture list and no sibling card is grown. Everything below describes the
 *   five tools and crop, whose derivation behavior P4 defined and §7.6 keeps.
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
  if (registered) {
    // §7.6: a plain generation piles its whole batch onto the card it was
    // fired from. This branch sits BEFORE the never-overwrite guard on
    // purpose — appending is not overwriting, and the guard below is what
    // still protects every other operation kind.
    if (infiniteCanvasOperationAccumulates(anchorToolId(registered))) {
      return accumulateBatchOntoAnchor(document, registered, ordered, workspacePath, true);
    }
    // A still-registered anchor that already carries media is the
    // never-overwrite case: zero writes, exactly as before P4 review.
    if (registered.mediaRef !== undefined) return content(document);
  }
  // P2: with the registration already cleared the batch may still be landing
  // its later items; recover the anchor and fill only the missing siblings.
  const anchor = registered ?? recoverBatchAnchor(document, operationId, workspacePath, ordered);
  if (!anchor) return content(document);
  if (!registered && infiniteCanvasOperationAccumulates(anchorToolId(anchor))) {
    return accumulateBatchOntoAnchor(document, anchor, ordered, workspacePath, false);
  }

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
    document.nodes.flatMap(node => infiniteCanvasNodeVariants(node)
      .filter(variant => variant.workspacePath === workspacePath)
      .map(variant => variant.relativePath)),
  );
  const toolId = anchorToolId(anchor);
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
