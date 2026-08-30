/**
 * The life of a card that is waiting for a picture.
 *
 * One card, one `operationId`, four possible next moments: the picture
 * arrives, the request fails, the owner asks to try again, or the owner stops
 * waiting. Plus the two sweepers — the queue projection the task panel reads,
 * and the settling of a card that came back from the dead on an undo.
 *
 * Two invariants hold across every function here, and they are the reason
 * this is one module rather than seven call sites: each is idempotent on its
 * `operationId`, and none of them may ever replace a picture a card already
 * has (PRD §3.4/§3.5, never-overwrite).
 *
 * Sits beside `InfiniteCanvasGenerationContent`, which is the same subject
 * from the other end: that module STARTS operations and lands whole batches
 * of results. In particular `resolveOperationContent` here and
 * `resolveOperationBatchContent` there are the one-picture and many-picture
 * answers to the same question, kept apart on purpose — the batch case grows
 * new cards and new wires, which the single case must never do. They are
 * neighbours now so the next reader can see that rather than guess it.
 */
import type { ImageToolErrorKind } from '../document/ImageToolTypes';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentContent,
  InfiniteCanvasNode,
} from '../document/InfiniteCanvasTypes';
import { removeNodesContent } from '../document/InfiniteCanvasDocumentContent';
import { infiniteCanvasGenerationAppendsToCard } from '../media/InfiniteCanvasMediaVariants';

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

function content(document: Readonly<InfiniteCanvasDocument>): InfiniteCanvasDocumentContent {
  return {
    nodes: document.nodes,
    edges: document.edges,
    viewport: document.viewport,
  };
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
