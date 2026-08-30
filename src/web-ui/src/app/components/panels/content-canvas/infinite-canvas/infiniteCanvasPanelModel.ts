/**
 * The reactflow projection of a canvas document, and the door to its commands.
 *
 * What is left here is genuinely about reactflow: the three node type names
 * and the two functions that turn document nodes and edges into the view
 * models the board renders. Nothing here mutates anything.
 *
 * The document commands this file used to carry moved to the domain they
 * belong to — `shared/services/infinite-canvas/document/` for a card's
 * structure, `.../generation/` for a card waiting on a picture — because the
 * agent-ops applier and the short-drama lane issue the very same edits from
 * outside the panel. They are re-exported below under exactly the names they
 * had, so every existing import through this file keeps working.
 */
import type {
  InfiniteCanvasDomainRef,
  InfiniteCanvasEdge,
  InfiniteCanvasGenerationParams,
  InfiniteCanvasNode,
} from '@/shared/services/infinite-canvas';
import {
  infiniteCanvasActiveVariantIndex,
  infiniteCanvasNodeVariants,
} from '@/shared/services/infinite-canvas';

export type {
  InfiniteCanvasDeletionSummary,
  InfiniteCanvasGenerationTask,
} from './infiniteCanvasPanelViewTypes';

// The document's own commands. Moved, not rewritten — see the module comment.
export {
  addDomainImportNodeContent,
  addImageNodeContent,
  addTextNodeContent,
  classifyDeletionTargets,
  connectNodesContent,
  consumeImportRequestContent,
  createInfiniteCanvasId,
  findDomainImportNodeId,
  INFINITE_CANVAS_AUTO_FILE_BATCH_LIMIT,
  infiniteCanvasWillAutoFile,
  isImportRequestConsumed,
  moveNodeContent,
  moveNodesContent,
  removeEdgesContent,
  removeNodesContent,
  setNodeActiveVariantContent,
  setNodeStylePresetContent,
  setNodeTextContent,
  setViewportContent,
} from '@/shared/services/infinite-canvas';
export type { InfiniteCanvasNodeMove } from '@/shared/services/infinite-canvas';

// The life of a card waiting for a picture. Moved, not rewritten.
export {
  collectGenerationTasks,
  failOperationContent,
  removeFailedOperationContent,
  resolveOperationContent,
  retryOperationContent,
  settleResurrectedPendingContent,
  stopWaitingContent,
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
    /** K3: which short-drama asset this card belongs to, if any. Read-only. */
    domainRef?: InfiniteCanvasDomainRef;
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
        // H3: passed by REFERENCE, not copied. Document nodes are immutable —
        // every mutation builds new ones — so a copy buys no safety, and it
        // cost the board dearly: `NodeMedia`'s effect keys on this object, so
        // a fresh identity on every projection blanked the preview and made
        // each card re-read, re-base64 and re-decode its file. A commit fires
        // on pan/zoom end, on drag, and once per media event.
        ...(node.mediaRef === undefined ? {} : { mediaRef: node.mediaRef }),
        // §7.6: the gallery reads one list whatever the document shape is —
        // a pre-§7.6 card simply projects a list of one.
        ...(node.mediaRef === undefined
          ? {}
          : {
            mediaVariants: infiniteCanvasNodeVariants(node),
            activeVariantIndex: infiniteCanvasActiveVariantIndex(node),
          }),
        ...(node.stylePresetId === undefined ? {} : { stylePresetId: node.stylePresetId }),
        ...(node.prompt === undefined ? {} : { prompt: node.prompt }),
        ...(node.generationParams === undefined
          ? {}
          : { generationParams: { ...node.generationParams } }),
        ...(node.derivedFrom === undefined ? {} : { derivedFrom: { ...node.derivedFrom } }),
        ...(node.generation === undefined ? {} : { generation: { ...node.generation } }),
        ...(node.domainRef === undefined ? {} : { domainRef: { ...node.domainRef } }),
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
