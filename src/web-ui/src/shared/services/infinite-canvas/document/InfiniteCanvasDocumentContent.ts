/**
 * The commands that edit a canvas document's structure.
 *
 * Cards and connections: adding them, moving them, wiring them, removing them,
 * and the handful of card-level facts the owner can change directly (its text,
 * its style, which of its pictures the face shows). Every function takes the
 * document and returns the next content slice — nothing here mutates, commits,
 * writes to disk, or knows that reactflow exists.
 *
 * These lived in the panel's own model file for four phases, which made them
 * look like a panel concern. They are not: the agent-ops applier and the
 * short-drama lane produce the same edits from outside the panel entirely, and
 * a second copy of "what removing a card does to its connections" is exactly
 * the kind of drift this module exists to prevent. The panel's projection
 * (`toFlowNodeViews` and friends) stayed behind, because that genuinely is
 * about reactflow.
 *
 * The generation lifecycle — a card waiting for a picture, and what happens
 * when one arrives — is its neighbour in `../generation/`.
 */
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentContent,
  InfiniteCanvasDomainRef,
  InfiniteCanvasGenerationParams,
  InfiniteCanvasNode,
  InfiniteCanvasViewport,
} from './InfiniteCanvasTypes';
import { infiniteCanvasDomainRefKey } from './InfiniteCanvasTypes';
import { setInfiniteCanvasActiveVariant } from '../media/InfiniteCanvasMediaVariants';

/**
 * P4 W6: what a delete request is actually about to remove.
 *
 * The counts drive the one confirmation the user sees. Two rules from plan
 * §2.5 are encoded in `classifyDeletionTargets` and nowhere else:
 *
 * - Cards that carry a `mediaRef`, or that are mid-generation, make the whole
 *   request confirmable — one dialog for the batch, never one per card.
 * - Group nodes are not deletable through the panel in P4 (they have no UI at
 *   all), so they are dropped from the request rather than silently removed.
 *
 * Deleting a card never touches the referenced file: the media truth lives in
 * Workspace Media and the canvas only ever held a reference to it.
 */
export interface InfiniteCanvasDeletionSummary {
  /** The ids that will actually be removed (existing, non-group). */
  nodeIds: string[];
  /** Of those, how many carry a mediaRef. */
  mediaCount: number;
  /** Of those, how many have a generation still running. */
  pendingCount: number;
  /** Of those, how many are neither — blank, text, or a failed placeholder. */
  plainCount: number;
  /** True when at least one card has media or is mid-generation. */
  requiresConfirmation: boolean;
}

let idCounter = 0;

/** Collision-resistant opaque ID; no crypto dependency so jsdom stays happy. */
export function createInfiniteCanvasId(prefix: string): string {
  idCounter += 1;
  const entropy = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${entropy}`;
}

function content(document: Readonly<InfiniteCanvasDocument>): InfiniteCanvasDocumentContent {
  return {
    nodes: document.nodes,
    edges: document.edges,
    viewport: document.viewport,
  };
}

export function addTextNodeContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  position: { x: number; y: number },
): InfiniteCanvasDocumentContent {
  const node: InfiniteCanvasNode = { nodeId, kind: 'text', position, text: '' };
  return { ...content(document), nodes: [...document.nodes, node] };
}

export function addImageNodeContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  position: { x: number; y: number },
  mediaRef: { workspacePath: string; relativePath: string },
): InfiniteCanvasDocumentContent {
  const node: InfiniteCanvasNode = { nodeId, kind: 'image', position, mediaRef };
  return { ...content(document), nodes: [...document.nodes, node] };
}

/**
 * K3 §5.1.6: land a short-drama asset on the board as an ordinary picture card
 * that happens to remember where it came from.
 *
 * Three deliberate absences. No `prompt`, no `derivedFrom`, no `generation`:
 * this card is a root, not a version of anything. And no file copy — the card
 * points at the very same file the short-drama asset points at, the same way a
 * pasted card shares a file rather than duplicating one. The board never
 * writes the media domain.
 *
 * Deduping is not this function's job — see {@link findDomainImportNodeId},
 * which the caller asks first. One asset has exactly one official refinement
 * slot on the board: two cards claiming the same asset would leave the user
 * with no way to tell which one is real, so a repeat send reveals the card
 * that already exists instead of growing another.
 */
export function addDomainImportNodeContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  position: { x: number; y: number },
  mediaRef: { workspacePath: string; relativePath: string },
  domainRef: InfiniteCanvasDomainRef,
): InfiniteCanvasDocumentContent {
  const node: InfiniteCanvasNode = { nodeId, kind: 'image', position, mediaRef, domainRef };
  return { ...content(document), nodes: [...document.nodes, node] };
}

/**
 * The card that already speaks for this asset, if the board has one. Used both
 * to keep a repeat send from creating a duplicate and to reveal the existing
 * card instead, which is what the user actually wanted.
 */
export function findDomainImportNodeId(
  document: Readonly<InfiniteCanvasDocument>,
  domainRef: InfiniteCanvasDomainRef,
): string | undefined {
  const key = infiniteCanvasDomainRefKey(domainRef);
  return document.nodes.find(node => (
    node.domainRef !== undefined && infiniteCanvasDomainRefKey(node.domainRef) === key
  ))?.nodeId;
}

/**
 * A5: the largest batch a generation on an OWNED card may ask for and still
 * file itself into the short-drama asset.
 *
 * The reason is on the other side of the wire. `attach_short_drama_media_result`
 * reads `assets[0]` / `items[0]` and nothing else, so a batch of four puts the
 * FIRST picture into review the instant it lands — while the board is still
 * laying out all four as candidates and the user has not chosen yet. The asset
 * ends up holding a picture nobody picked.
 *
 * Two ways out were on the table: force owned cards to n = 1, or keep the
 * batch and stop filing it. This is the second. Batch exploration is the point
 * of an owned card — trying four looks for CHAR-001 is exactly the work — and
 * taking it away to protect a backend limitation would cost the user more than
 * it saves them. What the batch loses is the automatic filing, and the board
 * already has an explicit, better way to do that: pick the good one, press
 * "send back to short drama". The card SAYS this before the press (the badge
 * weakens as soon as the count goes above one), so nobody pays for four
 * pictures expecting a filing they will not get.
 */
export const INFINITE_CANVAS_AUTO_FILE_BATCH_LIMIT = 1;

/**
 * A5: will a generation on this card file itself into its short-drama asset?
 *
 * `false` for a card that belongs to nothing (there is nowhere to file), and
 * `false` for an owned card asking for more than one picture. Pure, so the
 * card projection and the dispatch path answer the question the same way
 * rather than each carrying half of it.
 */
export function infiniteCanvasWillAutoFile(node: {
  domainRef?: InfiniteCanvasDomainRef;
  generationParams?: InfiniteCanvasGenerationParams;
}): boolean {
  if (!node.domainRef) return false;
  return (node.generationParams?.n ?? 1) <= INFINITE_CANVAS_AUTO_FILE_BATCH_LIMIT;
}

/**
 * K3 §5.1.6 (E4): has this board already acted on this import request?
 *
 * The panel asks this INSTEAD of relying on "is there already a card for this
 * asset?", because deleting that card is the documented way to undo an import
 * — and the surface keeps re-delivering the same persisted payload on every
 * remount. Without a durable record the deleted card grew straight back.
 */
export function isImportRequestConsumed(
  document: Readonly<InfiniteCanvasDocument>,
  requestId: string,
): boolean {
  return (document.consumedImportRequestIds ?? []).includes(requestId);
}

/**
 * K3 §5.1.6 (E4): record that this import request has been dealt with —
 * whether it landed a card, revealed the one that already existed, or was
 * refused because the asset is gone. All three are "handled"; replaying any of
 * them would be noise at best and a resurrected card at worst.
 *
 * Content is passed through untouched, so this composes with the mutation that
 * actually adds the card: one commit, one revision, no window in which the
 * card exists and the request is still open. The record itself sits outside
 * the content slice, so undo cannot roll it back.
 */
export function consumeImportRequestContent(
  document: Readonly<InfiniteCanvasDocument>,
  requestId: string,
  base?: InfiniteCanvasDocumentContent,
): InfiniteCanvasDocumentContent & { consumedImportRequestIds: string[] } {
  const previous = document.consumedImportRequestIds ?? [];
  return {
    ...(base ?? content(document)),
    consumedImportRequestIds: previous.includes(requestId)
      ? [...previous]
      : [...previous, requestId],
  };
}

export function setNodeTextContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  text: string,
): InfiniteCanvasDocumentContent {
  return {
    ...content(document),
    nodes: document.nodes.map(node => (
      node.nodeId === nodeId && node.kind === 'text' ? { ...node, text } : node
    )),
  };
}

export function setNodeStylePresetContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  stylePresetId: string | undefined,
): InfiniteCanvasDocumentContent {
  return {
    ...content(document),
    nodes: document.nodes.map(node => {
      if (node.nodeId !== nodeId || node.kind !== 'image') return node;
      if (stylePresetId === undefined) {
        const { stylePresetId: _removed, ...rest } = node;
        return rest;
      }
      return { ...node, stylePresetId };
    }),
  };
}

/**
 * §7.6: picks which of the card's pictures the card face shows.
 *
 * The list itself is never touched — this is the one thing about a landed
 * picture the user is allowed to change, which is exactly why it is safe to
 * put on the undo stack. An out-of-range index, or the one already current,
 * returns the document's own nodes so nothing is recorded.
 */
export function setNodeActiveVariantContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  index: number,
): InfiniteCanvasDocumentContent {
  const target = document.nodes.find(node => node.nodeId === nodeId);
  if (!target) return content(document);
  const next = setInfiniteCanvasActiveVariant(target, index);
  if (next === target) return content(document);
  return {
    ...content(document),
    nodes: document.nodes.map(node => (node.nodeId === nodeId ? next : node)),
  };
}

export function moveNodeContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  position: { x: number; y: number },
): InfiniteCanvasDocumentContent {
  return {
    ...content(document),
    nodes: document.nodes.map(node => (
      node.nodeId === nodeId ? { ...node, position } : node
    )),
  };
}

/** One entry of a batch drag; the panel collects these per drag-end frame. */
export interface InfiniteCanvasNodeMove {
  nodeId: string;
  position: { x: number; y: number };
}

/**
 * P4 W6: lands a whole multi-selection drag in ONE mutation.
 *
 * Before this, `onNodesChange` called `moveNodeContent` once per moved card, so
 * dragging ten selected cards queued ten serialised CAS writes (and ten undo
 * entries). Positions are copied, so the caller's reactflow objects never end
 * up aliased into the document.
 */
export function moveNodesContent(
  document: Readonly<InfiniteCanvasDocument>,
  moves: readonly InfiniteCanvasNodeMove[],
): InfiniteCanvasDocumentContent {
  if (moves.length === 0) return content(document);
  const positions = new Map(moves.map(move => [move.nodeId, move.position]));
  return {
    ...content(document),
    nodes: document.nodes.map(node => {
      const position = positions.get(node.nodeId);
      return position ? { ...node, position: { ...position } } : node;
    }),
  };
}

/**
 * P4 W6: what a delete request is actually about to remove.
 *
 * The counts drive the one confirmation the user sees. Two rules from plan
 * §2.5 are encoded here and nowhere else:
 *
 * - Cards that carry a `mediaRef`, or that are mid-generation, make the whole
 *   request confirmable — one dialog for the batch, never one per card.
 * - Group nodes are not deletable through the panel in P4 (they have no UI at
 *   all), so they are dropped from the request rather than silently removed.
 *
 * Deleting a card never touches the referenced file: the media truth lives in
 * Workspace Media and the canvas only ever held a reference to it.
 */
export function classifyDeletionTargets(
  document: Readonly<InfiniteCanvasDocument>,
  nodeIds: readonly string[],
): InfiniteCanvasDeletionSummary {
  const requested = new Set(nodeIds);
  const targets = document.nodes.filter(
    node => requested.has(node.nodeId) && node.kind !== 'group',
  );
  let mediaCount = 0;
  let pendingCount = 0;
  let plainCount = 0;
  for (const node of targets) {
    const hasMedia = node.mediaRef !== undefined;
    const isPending = node.generation?.status === 'pending';
    if (hasMedia) mediaCount += 1;
    if (isPending) pendingCount += 1;
    if (!hasMedia && !isPending) plainCount += 1;
  }
  return {
    nodeIds: targets.map(node => node.nodeId),
    mediaCount,
    pendingCount,
    plainCount,
    requiresConfirmation: mediaCount > 0 || pendingCount > 0,
  };
}

export function removeNodesContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeIds: readonly string[],
): InfiniteCanvasDocumentContent {
  const removed = new Set(nodeIds);
  return {
    ...content(document),
    nodes: document.nodes.filter(node => !removed.has(node.nodeId)),
    edges: document.edges.filter(edge => (
      !removed.has(edge.sourceNodeId) && !removed.has(edge.targetNodeId)
    )),
  };
}

export function removeEdgesContent(
  document: Readonly<InfiniteCanvasDocument>,
  edgeIds: readonly string[],
): InfiniteCanvasDocumentContent {
  const removed = new Set(edgeIds);
  return {
    ...content(document),
    edges: document.edges.filter(edge => !removed.has(edge.edgeId)),
  };
}

/** Duplicate connections between the same pair are collapsed, kunpeng-style. */
export function connectNodesContent(
  document: Readonly<InfiniteCanvasDocument>,
  edgeId: string,
  sourceNodeId: string,
  targetNodeId: string,
): InfiniteCanvasDocumentContent {
  if (sourceNodeId === targetNodeId) return content(document);
  const nodeIds = new Set(document.nodes.map(node => node.nodeId));
  if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) return content(document);
  const duplicate = document.edges.some(edge => (
    edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId
  ));
  if (duplicate) return content(document);
  return {
    ...content(document),
    edges: [
      ...document.edges,
      { edgeId, sourceNodeId, targetNodeId },
    ],
  };
}

export function setViewportContent(
  document: Readonly<InfiniteCanvasDocument>,
  viewport: InfiniteCanvasViewport,
): InfiniteCanvasDocumentContent {
  return { ...content(document), viewport };
}
