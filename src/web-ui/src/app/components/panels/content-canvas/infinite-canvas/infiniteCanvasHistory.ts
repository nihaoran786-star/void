/**
 * Undo / redo for the Infinite Canvas panel (P4 W5, plan §2.4).
 *
 * Pure logic only — no React, no reactflow, no Tauri. Three decisions from the
 * plan are encoded here and nowhere else:
 *
 * 1. **Scope.** History covers the user's own editing: adding and deleting
 *    cards, dragging, connecting, writing text / prompts / style presets /
 *    generation parameters, pasting. It deliberately does NOT cover produced
 *    media landing, agent `CanvasOp` batches, generation dispatch and retry,
 *    or viewport changes. Enforcement is at the call site: only a commit that
 *    asks to be recorded ever reaches {@link captureUserEdit}.
 *
 * 2. **Reverse patches, never whole-document snapshots.** A snapshot rollback
 *    would also wipe an image that landed, or a card the agent placed, in the
 *    meantime. Instead each entry keeps the before/after state of exactly the
 *    nodes and edges it touched, and applying it rewrites only those.
 *
 * 3. **Precondition on every application.** Before an entry is applied, the
 *    affected nodes and edges must still look exactly the way the entry left
 *    them. If a result landed on one of them, or the agent moved it, or it is
 *    gone, the entry is stale: it — and every older entry, which would now be
 *    rebasing on a lie — is dropped and the panel says so.
 *
 * The stack lives in panel memory and dies with the panel: nothing here is
 * persisted, so the document schema is untouched and there is no history to
 * reconcile against the agent ops watermark.
 */
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentContent,
  InfiniteCanvasEdge,
  InfiniteCanvasNode,
} from '@/shared/services/infinite-canvas';

/** Depth cap; the oldest entry falls off the bottom (plan §2.4). */
export const INFINITE_CANVAS_HISTORY_LIMIT = 50;

/**
 * State of the touched entities at one point in time. A missing key means the
 * entity did not exist then — that is how "add" and "delete" are expressed
 * without a separate entry kind.
 */
export interface InfiniteCanvasHistorySnapshot {
  nodes: Record<string, InfiniteCanvasNode>;
  edges: Record<string, InfiniteCanvasEdge>;
}

export interface InfiniteCanvasHistoryEntry {
  /** Ids of every node the edit created, changed or removed. */
  nodeIds: string[];
  /** Ids of every edge the edit created, changed or removed. */
  edgeIds: string[];
  before: InfiniteCanvasHistorySnapshot;
  after: InfiniteCanvasHistorySnapshot;
}

export interface InfiniteCanvasHistoryState {
  undo: InfiniteCanvasHistoryEntry[];
  redo: InfiniteCanvasHistoryEntry[];
}

export function emptyInfiniteCanvasHistory(): InfiniteCanvasHistoryState {
  return { undo: [], redo: [] };
}

// —— Structural comparison ————————————————————————————————————————————————

/**
 * Deep equality over plain JSON values. Key order is irrelevant: the content
 * helpers rebuild nodes with object spreads, so the same logical card can come
 * back with its keys in a different order.
 */
function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((item, index) => deepEqual(item, right[index]));
  }
  const leftKeys = Object.keys(left as Record<string, unknown>);
  const rightKeys = Object.keys(right as Record<string, unknown>);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(key => (
    Object.prototype.hasOwnProperty.call(right, key)
    && deepEqual(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
    )
  ));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// —— Capture ——————————————————————————————————————————————————————————————

function nodesById(
  nodes: readonly InfiniteCanvasNode[],
): Map<string, InfiniteCanvasNode> {
  return new Map(nodes.map(node => [node.nodeId, node]));
}

function edgesById(
  edges: readonly InfiniteCanvasEdge[],
): Map<string, InfiniteCanvasEdge> {
  return new Map(edges.map(edge => [edge.edgeId, edge]));
}

/**
 * Diffs one user edit into a history entry, or returns `undefined` when the
 * edit changed no node and no edge (a rejected mutation, or a pure viewport
 * change — neither belongs on the stack).
 *
 * Diffing rather than asking each call site to declare what it touched keeps
 * the two from drifting apart: whatever the content helper actually changed is
 * what the entry restores.
 */
export function captureUserEdit(
  before: Readonly<InfiniteCanvasDocument>,
  after: Readonly<InfiniteCanvasDocumentContent>,
): InfiniteCanvasHistoryEntry | undefined {
  const beforeNodes = nodesById(before.nodes);
  const afterNodes = nodesById(after.nodes);
  const beforeEdges = edgesById(before.edges);
  const afterEdges = edgesById(after.edges);

  const entry: InfiniteCanvasHistoryEntry = {
    nodeIds: [],
    edgeIds: [],
    before: { nodes: {}, edges: {} },
    after: { nodes: {}, edges: {} },
  };

  for (const nodeId of new Set([...beforeNodes.keys(), ...afterNodes.keys()])) {
    const previous = beforeNodes.get(nodeId);
    const next = afterNodes.get(nodeId);
    if (deepEqual(previous, next)) continue;
    entry.nodeIds.push(nodeId);
    if (previous) entry.before.nodes[nodeId] = cloneJson(previous);
    if (next) entry.after.nodes[nodeId] = cloneJson(next);
  }
  for (const edgeId of new Set([...beforeEdges.keys(), ...afterEdges.keys()])) {
    const previous = beforeEdges.get(edgeId);
    const next = afterEdges.get(edgeId);
    if (deepEqual(previous, next)) continue;
    entry.edgeIds.push(edgeId);
    if (previous) entry.before.edges[edgeId] = cloneJson(previous);
    if (next) entry.after.edges[edgeId] = cloneJson(next);
  }

  if (entry.nodeIds.length === 0 && entry.edgeIds.length === 0) return undefined;
  return entry;
}

// —— Stack ————————————————————————————————————————————————————————————————

/**
 * Records one entry. Any new edit invalidates the redo branch — redoing onto a
 * changed document is exactly the rebasing-on-a-lie case the precondition
 * exists to prevent, so the branch is dropped rather than left to fail later.
 */
export function pushHistoryEntry(
  state: InfiniteCanvasHistoryState,
  entry: InfiniteCanvasHistoryEntry,
): InfiniteCanvasHistoryState {
  const undo = [...state.undo, entry];
  return {
    undo: undo.length > INFINITE_CANVAS_HISTORY_LIMIT
      ? undo.slice(undo.length - INFINITE_CANVAS_HISTORY_LIMIT)
      : undo,
    redo: [],
  };
}

// —— Application ——————————————————————————————————————————————————————————

export type InfiniteCanvasHistoryDirection = 'undo' | 'redo';

export type InfiniteCanvasHistoryApplication =
  | { status: 'applied'; content: InfiniteCanvasDocumentContent }
  /** The touched entities moved on; this entry can no longer be trusted. */
  | { status: 'stale' };

/**
 * Precondition: every node and edge the entry touched must still be exactly
 * as the entry left it. `expected[id] === undefined` means "must not exist".
 */
function matchesExpectedState(
  document: Readonly<InfiniteCanvasDocument>,
  entry: InfiniteCanvasHistoryEntry,
  expected: InfiniteCanvasHistorySnapshot,
): boolean {
  const currentNodes = nodesById(document.nodes);
  const currentEdges = edgesById(document.edges);
  return entry.nodeIds.every(
    nodeId => deepEqual(currentNodes.get(nodeId), expected.nodes[nodeId]),
  ) && entry.edgeIds.every(
    edgeId => deepEqual(currentEdges.get(edgeId), expected.edges[edgeId]),
  );
}

/**
 * Rewrites only the touched nodes and edges to their target state; everything
 * else in the document — cards the agent added, images that landed, the
 * viewport — is carried through untouched. Re-created entities are appended,
 * so an undone deletion comes back at the end of the list (order within the
 * arrays is not part of the node contract; edge order, which IS meaningful for
 * reference collection, is preserved for every edge the entry did not touch).
 */
function rewrite(
  document: Readonly<InfiniteCanvasDocument>,
  entry: InfiniteCanvasHistoryEntry,
  target: InfiniteCanvasHistorySnapshot,
): InfiniteCanvasDocumentContent {
  const touchedNodeIds = new Set(entry.nodeIds);
  const touchedEdgeIds = new Set(entry.edgeIds);

  const nodes: InfiniteCanvasNode[] = [];
  const placedNodeIds = new Set<string>();
  for (const node of document.nodes) {
    if (!touchedNodeIds.has(node.nodeId)) {
      nodes.push(node);
      continue;
    }
    const wanted = target.nodes[node.nodeId];
    if (!wanted) continue;
    nodes.push(cloneJson(wanted));
    placedNodeIds.add(node.nodeId);
  }
  for (const nodeId of entry.nodeIds) {
    const wanted = target.nodes[nodeId];
    if (!wanted || placedNodeIds.has(nodeId)) continue;
    nodes.push(cloneJson(wanted));
  }

  const edges: InfiniteCanvasEdge[] = [];
  const placedEdgeIds = new Set<string>();
  for (const edge of document.edges) {
    if (!touchedEdgeIds.has(edge.edgeId)) {
      edges.push(edge);
      continue;
    }
    const wanted = target.edges[edge.edgeId];
    if (!wanted) continue;
    edges.push(cloneJson(wanted));
    placedEdgeIds.add(edge.edgeId);
  }
  for (const edgeId of entry.edgeIds) {
    const wanted = target.edges[edgeId];
    if (!wanted || placedEdgeIds.has(edgeId)) continue;
    edges.push(cloneJson(wanted));
  }

  // A restored edge whose endpoints are no longer both present would be a
  // dangling reference; drop it rather than resurrect a broken graph.
  const presentNodeIds = new Set(nodes.map(node => node.nodeId));
  return {
    nodes,
    edges: edges.filter(edge => (
      presentNodeIds.has(edge.sourceNodeId) && presentNodeIds.has(edge.targetNodeId)
    )),
    viewport: document.viewport,
  };
}

/**
 * Applies one history entry in the requested direction, as an ordinary
 * document mutation. Running it inside `mutateDefaultDocument` is what makes
 * it safe next to the media bridge and the ops bridge: the document service
 * serialises mutations per path, so this re-checks its precondition against
 * the very latest document and no extra lock is needed.
 */
export function applyHistoryEntryContent(
  document: Readonly<InfiniteCanvasDocument>,
  entry: InfiniteCanvasHistoryEntry,
  direction: InfiniteCanvasHistoryDirection,
): InfiniteCanvasHistoryApplication {
  const expected = direction === 'undo' ? entry.after : entry.before;
  const target = direction === 'undo' ? entry.before : entry.after;
  if (!matchesExpectedState(document, entry, expected)) return { status: 'stale' };
  return { status: 'applied', content: rewrite(document, entry, target) };
}

// —— Keyboard guard ————————————————————————————————————————————————————————

/**
 * True for targets that own their native undo stack (prompt boxes, the text
 * card editor, any contenteditable). Ctrl+Z inside one of them must stay the
 * browser's text undo — hijacking it would make prompt editing feel broken.
 */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    closest?: (selector: string) => unknown;
  };
  if (element.isContentEditable === true) return true;
  const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  return typeof element.closest === 'function'
    ? Boolean(element.closest('[contenteditable="true"]'))
    : false;
}

export type InfiniteCanvasHistoryShortcut = 'undo' | 'redo' | undefined;

/**
 * Maps a keyboard event onto a history action. Ctrl/Cmd+Z undoes,
 * Ctrl/Cmd+Shift+Z and Ctrl+Y redo (the Windows and mac idioms both work).
 */
export function historyShortcutFor(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
}): InfiniteCanvasHistoryShortcut {
  if (event.altKey) return undefined;
  if (!event.ctrlKey && !event.metaKey) return undefined;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return undefined;
}
