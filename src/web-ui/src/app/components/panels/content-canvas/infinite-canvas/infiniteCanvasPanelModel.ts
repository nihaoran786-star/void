/**
 * Pure projection and mutation helpers for the Infinite Canvas panel (M3).
 *
 * The panel is only a projection of the InfiniteCanvasDocument owned by the
 * infinite-canvas Domain Module: every helper here either maps the document
 * into reactflow view models or produces the next document content for a
 * DocumentService mutation. No reactflow, React, or Tauri imports.
 */
import type {
  ImageToolErrorKind,
  InfiniteCanvasDocument,
  InfiniteCanvasEdge,
  InfiniteCanvasGenerationParams,
  InfiniteCanvasNode,
  InfiniteCanvasViewport,
} from '@/shared/services/infinite-canvas';
import {
  infiniteCanvasActiveVariantIndex,
  infiniteCanvasGenerationAppendsToCard,
  infiniteCanvasNodeVariants,
  setInfiniteCanvasActiveVariant,
} from '@/shared/services/infinite-canvas';

export const INFINITE_CANVAS_TEXT_NODE_TYPE = 'infinite-canvas-text';
export const INFINITE_CANVAS_IMAGE_NODE_TYPE = 'infinite-canvas-image';
export const INFINITE_CANVAS_VIDEO_NODE_TYPE = 'infinite-canvas-video';

export interface InfiniteCanvasFlowNodeView {
  id: string;
  type:
    | typeof INFINITE_CANVAS_TEXT_NODE_TYPE
    | typeof INFINITE_CANVAS_IMAGE_NODE_TYPE
    | typeof INFINITE_CANVAS_VIDEO_NODE_TYPE;
  position: { x: number; y: number };
  data: {
    text?: string;
    mediaRef?: { workspacePath: string; relativePath: string };
    /** §7.6: every picture the card carries; length 1 on a plain card. */
    mediaVariants?: readonly { workspacePath: string; relativePath: string }[];
    /** §7.6: which of them the card face shows. */
    activeVariantIndex?: number;
    stylePresetId?: string;
    prompt?: string;
    generationParams?: InfiniteCanvasGenerationParams;
    derivedFrom?: NonNullable<InfiniteCanvasNode['derivedFrom']>;
    generation?: NonNullable<InfiniteCanvasNode['generation']>;
  };
}

export interface InfiniteCanvasFlowEdgeView {
  id: string;
  source: string;
  target: string;
}

// P3 W2: the content type and the derived-operation helper were sunk to the
// shared infinite-canvas module (the agent ops applier reuses them); these
// re-exports keep every existing panel-side import working unchanged.
export type { InfiniteCanvasDocumentContent } from '@/shared/services/infinite-canvas';
export { beginDerivedOperationContent } from '@/shared/services/infinite-canvas';
// P5 W2: the local-derivation finisher (crop) sits beside it for the same
// reason — it is a document-content rule, not a panel rule.
export { applyLocalDerivedMedia } from '@/shared/services/infinite-canvas';
// P4 W4: the batch (n > 1) landing rules live in shared for the same reason —
// the media bridge and the pending reconciliation both apply them, and a
// second copy in the app layer would be a second set of card ids.
export {
  infiniteCanvasBatchEdgeId,
  infiniteCanvasBatchNodeId,
  resolveOperationBatchContent,
} from '@/shared/services/infinite-canvas';
export type { InfiniteCanvasBatchOutputItem } from '@/shared/services/infinite-canvas';

import type { InfiniteCanvasDocumentContent } from '@/shared/services/infinite-canvas';

let idCounter = 0;

/** Collision-resistant opaque ID; no crypto dependency so jsdom stays happy. */
export function createInfiniteCanvasId(prefix: string): string {
  idCounter += 1;
  const entropy = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${entropy}`;
}

/**
 * Group nodes are part of the persisted contract but have no phase-1 UI;
 * they are preserved in the document and simply not projected. Video cards
 * project since P3.
 */
export function toFlowNodeViews(
  nodes: readonly InfiniteCanvasNode[],
): InfiniteCanvasFlowNodeView[] {
  const views: InfiniteCanvasFlowNodeView[] = [];
  for (const node of nodes) {
    if (node.kind !== 'text' && node.kind !== 'image' && node.kind !== 'video') continue;
    views.push({
      id: node.nodeId,
      type: node.kind === 'text'
        ? INFINITE_CANVAS_TEXT_NODE_TYPE
        : node.kind === 'video'
          ? INFINITE_CANVAS_VIDEO_NODE_TYPE
          : INFINITE_CANVAS_IMAGE_NODE_TYPE,
      position: { ...node.position },
      data: {
        ...(node.text === undefined ? {} : { text: node.text }),
        ...(node.mediaRef === undefined ? {} : { mediaRef: { ...node.mediaRef } }),
        // §7.6: the gallery reads one list whatever the document shape is —
        // a pre-§7.6 card simply projects a list of one.
        ...(node.mediaRef === undefined
          ? {}
          : {
            mediaVariants: infiniteCanvasNodeVariants(node).map(variant => ({ ...variant })),
            activeVariantIndex: infiniteCanvasActiveVariantIndex(node),
          }),
        ...(node.stylePresetId === undefined ? {} : { stylePresetId: node.stylePresetId }),
        ...(node.prompt === undefined ? {} : { prompt: node.prompt }),
        ...(node.generationParams === undefined
          ? {}
          : { generationParams: { ...node.generationParams } }),
        ...(node.derivedFrom === undefined ? {} : { derivedFrom: { ...node.derivedFrom } }),
        ...(node.generation === undefined ? {} : { generation: { ...node.generation } }),
      },
    });
  }
  return views;
}

export function toFlowEdgeViews(
  edges: readonly InfiniteCanvasEdge[],
): InfiniteCanvasFlowEdgeView[] {
  return edges.map(edge => ({
    id: edge.edgeId,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
  }));
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

// —— K2 derived-operation helpers ————————————————————————————————————————
//
// Every image operation on a card that already has a mediaRef derives a NEW
// placeholder node plus a source→derived edge; the source node is never
// touched. Helpers are idempotent on operationId, and none of them may ever
// change the mediaRef of a node that already has one (never-overwrite
// invariant, PRD §3.4/§3.5). `beginDerivedOperationContent` itself now lives
// in shared/services/infinite-canvas (re-exported above).

function findOperationNode(
  document: Readonly<InfiniteCanvasDocument>,
  operationId: string,
): InfiniteCanvasNode | undefined {
  return document.nodes.find(node => node.generation?.operationId === operationId);
}

/**
 * Fills the pending node registered under `operationId` with the produced
 * mediaRef and clears its generation state. Self and derived placements share
 * this single code path. Unknown operationIds and nodes that already carry a
 * mediaRef are left untouched (idempotent, never-overwrite).
 */
export function resolveOperationContent(
  document: Readonly<InfiniteCanvasDocument>,
  operationId: string,
  mediaRef: { workspacePath: string; relativePath: string },
): InfiniteCanvasDocumentContent {
  return {
    ...content(document),
    nodes: document.nodes.map(node => {
      if (node.generation?.operationId !== operationId) return node;
      if (node.mediaRef !== undefined) return node;
      const { generation: _cleared, ...rest } = node;
      return { ...rest, mediaRef: { ...mediaRef } };
    }),
  };
}

/** Marks the pending operation as failed with a typed K0-2 error kind. */
export function failOperationContent(
  document: Readonly<InfiniteCanvasDocument>,
  operationId: string,
  errorKind: ImageToolErrorKind,
): InfiniteCanvasDocumentContent {
  return {
    ...content(document),
    nodes: document.nodes.map(node => (
      node.generation?.operationId === operationId
        ? { ...node, generation: { ...node.generation, status: 'failed' as const, errorKind } }
        : node
    )),
  };
}

/** Records the media batch id on the pending operation (for reconciliation). */
export function attachBatchToOperationContent(
  document: Readonly<InfiniteCanvasDocument>,
  operationId: string,
  batchId: string,
): InfiniteCanvasDocumentContent {
  return {
    ...content(document),
    nodes: document.nodes.map(node => (
      node.generation?.operationId === operationId
        ? { ...node, generation: { ...node.generation, batchId } }
        : node
    )),
  };
}

/**
 * Re-arms a failed operation for retry: the node keeps its identity, prompt,
 * and derivation edge, but its generation is replaced with a fresh pending
 * state under the next operationId. Self and derived retries share this one
 * path. Nodes that are not in a failed state, or that already carry a
 * mediaRef, are left untouched.
 */
export function retryOperationContent(
  document: Readonly<InfiniteCanvasDocument>,
  previousOperationId: string,
  nextOperationId: string,
): InfiniteCanvasDocumentContent {
  return {
    ...content(document),
    nodes: document.nodes.map(node => {
      if (node.generation?.operationId !== previousOperationId) return node;
      if (node.generation.status !== 'failed') return node;
      // §7.6: a failed regenerate on a card that already holds pictures is
      // retryable — its result would be appended, so there is nothing for the
      // never-overwrite rule to guard here.
      if (node.mediaRef !== undefined
        && !infiniteCanvasGenerationAppendsToCard(node.generation)) {
        return node;
      }
      return {
        ...node,
        generation: {
          operationId: nextOperationId,
          toolId: node.generation.toolId,
          resultMode: node.generation.resultMode,
          status: 'pending' as const,
          // P3: a video retry must stay a video generation; the media-kind
          // marker survives the re-arm (absent keeps meaning 'image').
          ...(node.generation.mediaKind ? { mediaKind: node.generation.mediaKind } : {}),
        },
      };
    }),
  };
}

// —— P4 W8: the task queue is a projection, not a second store ——————————————

/** One row of the task queue: an in-flight or failed generation on this canvas. */
export interface InfiniteCanvasGenerationTask {
  nodeId: string;
  operationId: string;
  toolId: NonNullable<InfiniteCanvasNode['generation']>['toolId'];
  status: 'pending' | 'failed';
  mediaKind: 'image' | 'video';
  errorKind?: ImageToolErrorKind;
  /** First line of the card's prompt, for the row label. May be empty. */
  promptLine: string;
}

/**
 * Projects the queue straight out of the document.
 *
 * There is deliberately no task store and no extra subscription: the cards
 * already record "I am running" / "I failed", and the same predicate the
 * pending reconciliation uses (`node.generation` is present) is the queue.
 * Recomputing this after every projection is cheaper than keeping a second
 * copy of the truth in sync with the first.
 */
export function collectGenerationTasks(
  document: Readonly<InfiniteCanvasDocument>,
): InfiniteCanvasGenerationTask[] {
  const tasks: InfiniteCanvasGenerationTask[] = [];
  for (const node of document.nodes) {
    const generation = node.generation;
    if (!generation) continue;
    tasks.push({
      nodeId: node.nodeId,
      operationId: generation.operationId,
      toolId: generation.toolId,
      status: generation.status,
      mediaKind: generation.mediaKind ?? (node.kind === 'video' ? 'video' : 'image'),
      ...(generation.errorKind === undefined ? {} : { errorKind: generation.errorKind }),
      promptLine: (node.prompt ?? '').split('\n')[0].trim(),
    });
  }
  return tasks;
}

/**
 * "Stop waiting" — NOT a cancel.
 *
 * There is no cancellation entry point on the backend: a media job is a
 * detached polling task with no handle and no token, so nothing the front end
 * can do will stop it. This marks the card as a retryable failure so it stops
 * spinning, and that is the whole of it: the remote job keeps running and the
 * quota is still spent. The UI copy has to say exactly that.
 *
 * `errorKind: 'cancelled'` is one of the existing seven kinds, so no enum
 * grows here.
 *
 * The anchor is left intact on purpose. If the result does come back later,
 * the node still carries this operationId and still has no mediaRef, so the
 * picture lands in this card after all — the money was spent, throwing the
 * result away would be worse than keeping it.
 */
export function stopWaitingContent(
  document: Readonly<InfiniteCanvasDocument>,
  operationId: string,
): InfiniteCanvasDocumentContent {
  return {
    ...content(document),
    nodes: document.nodes.map(node => {
      if (node.generation?.operationId !== operationId) return node;
      if (node.generation.status !== 'pending') return node;
      return {
        ...node,
        generation: {
          ...node.generation,
          status: 'failed' as const,
          errorKind: 'cancelled' as const,
        },
      };
    }),
  };
}

/**
 * P4 review P4: settles generations that came back from the dead.
 *
 * Undoing "delete a card that was still generating" restores the card exactly
 * as it was — spinner included — but its completion event was discarded while
 * the card did not exist, and no second one is coming. Left alone the card
 * spins forever, which is precisely the failure mode W5 promised never to
 * ship.
 *
 * So a resurrected pending card is settled the same way the residual
 * reconciliation settles an unknowable outcome: a typed, retryable
 * `timeout` failure. The one exception is a card that still knows its media
 * job (`batchId`) — that one is genuinely reconcilable against the batch
 * manifest, so it is left pending for the reconciliation pass to resolve or
 * fail on real evidence.
 *
 * `restoredNodeIds` is the caller's list of nodes the history step added back;
 * nothing else is ever touched, so live generations keep running.
 */
export function settleResurrectedPendingContent(
  content: InfiniteCanvasDocumentContent,
  restoredNodeIds: readonly string[],
): InfiniteCanvasDocumentContent {
  if (restoredNodeIds.length === 0) return content;
  const restored = new Set(restoredNodeIds);
  let changed = false;
  const nodes = content.nodes.map(node => {
    if (!restored.has(node.nodeId)) return node;
    const generation = node.generation;
    if (!generation || generation.status !== 'pending') return node;
    if (generation.batchId) return node;
    if (node.mediaRef !== undefined) return node;
    changed = true;
    return {
      ...node,
      generation: {
        ...generation,
        status: 'failed' as const,
        errorKind: 'timeout' as const,
      },
    };
  });
  return changed ? { ...content, nodes } : content;
}

/**
 * Removes a failed operation placeholder — a plain node removal, restricted to
 * nodes whose generation actually failed and that never received a mediaRef.
 */
export function removeFailedOperationContent(
  document: Readonly<InfiniteCanvasDocument>,
  operationId: string,
): InfiniteCanvasDocumentContent {
  const node = findOperationNode(document, operationId);
  if (!node || node.generation?.status !== 'failed' || node.mediaRef !== undefined) {
    return content(document);
  }
  return removeNodesContent(document, [node.nodeId]);
}
