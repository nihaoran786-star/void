/**
 * Pure projection and mutation helpers for the Infinite Canvas panel (M3).
 *
 * The panel is only a projection of the InfiniteCanvasDocument owned by the
 * infinite-canvas Domain Module: every helper here either maps the document
 * into reactflow view models or produces the next document content for a
 * DocumentService mutation. No reactflow, React, or Tauri imports.
 */
import type {
  CanvasImageOperationKind,
  ImageToolErrorKind,
  InfiniteCanvasDocument,
  InfiniteCanvasEdge,
  InfiniteCanvasNode,
  InfiniteCanvasViewport,
} from '@/shared/services/infinite-canvas';

export const INFINITE_CANVAS_TEXT_NODE_TYPE = 'infinite-canvas-text';
export const INFINITE_CANVAS_IMAGE_NODE_TYPE = 'infinite-canvas-image';

export interface InfiniteCanvasFlowNodeView {
  id: string;
  type: typeof INFINITE_CANVAS_TEXT_NODE_TYPE | typeof INFINITE_CANVAS_IMAGE_NODE_TYPE;
  position: { x: number; y: number };
  data: {
    text?: string;
    mediaRef?: { workspacePath: string; relativePath: string };
    stylePresetId?: string;
    prompt?: string;
    derivedFrom?: NonNullable<InfiniteCanvasNode['derivedFrom']>;
    generation?: NonNullable<InfiniteCanvasNode['generation']>;
  };
}

export interface InfiniteCanvasFlowEdgeView {
  id: string;
  source: string;
  target: string;
}

export type InfiniteCanvasDocumentContent = Pick<
  InfiniteCanvasDocument,
  'nodes' | 'edges' | 'viewport'
>;

let idCounter = 0;

/** Collision-resistant opaque ID; no crypto dependency so jsdom stays happy. */
export function createInfiniteCanvasId(prefix: string): string {
  idCounter += 1;
  const entropy = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${entropy}`;
}

/**
 * Group nodes are part of the persisted contract but have no phase-1 UI;
 * they are preserved in the document and simply not projected.
 */
export function toFlowNodeViews(
  nodes: readonly InfiniteCanvasNode[],
): InfiniteCanvasFlowNodeView[] {
  const views: InfiniteCanvasFlowNodeView[] = [];
  for (const node of nodes) {
    if (node.kind !== 'text' && node.kind !== 'image') continue;
    views.push({
      id: node.nodeId,
      type: node.kind === 'text'
        ? INFINITE_CANVAS_TEXT_NODE_TYPE
        : INFINITE_CANVAS_IMAGE_NODE_TYPE,
      position: { ...node.position },
      data: {
        ...(node.text === undefined ? {} : { text: node.text }),
        ...(node.mediaRef === undefined ? {} : { mediaRef: { ...node.mediaRef } }),
        ...(node.stylePresetId === undefined ? {} : { stylePresetId: node.stylePresetId }),
        ...(node.prompt === undefined ? {} : { prompt: node.prompt }),
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
// invariant, PRD §3.4/§3.5).

/** Horizontal offset used to place a derived placeholder beside its source. */
const DERIVED_NODE_OFFSET_X = 360;

function findOperationNode(
  document: Readonly<InfiniteCanvasDocument>,
  operationId: string,
): InfiniteCanvasNode | undefined {
  return document.nodes.find(node => node.generation?.operationId === operationId);
}

/**
 * Registers a derived operation: creates the pending placeholder card and the
 * source→derived edge. Re-invoking with an operationId that is already
 * registered returns the content unchanged (idempotent dispatch).
 */
export function beginDerivedOperationContent(
  document: Readonly<InfiniteCanvasDocument>,
  sourceNodeId: string,
  toolId: CanvasImageOperationKind,
  operationId: string,
  derivedNodeId: string,
  edgeId: string,
): InfiniteCanvasDocumentContent {
  if (findOperationNode(document, operationId)) return content(document);
  const source = document.nodes.find(node => node.nodeId === sourceNodeId);
  if (!source) return content(document);
  if (document.nodes.some(node => node.nodeId === derivedNodeId)) return content(document);
  const placeholder: InfiniteCanvasNode = {
    nodeId: derivedNodeId,
    kind: 'image',
    position: {
      x: source.position.x + (source.size?.width ?? 0) + DERIVED_NODE_OFFSET_X,
      y: source.position.y,
    },
    derivedFrom: { sourceNodeId, toolId, operationId },
    generation: { operationId, toolId, resultMode: 'derived', status: 'pending' },
  };
  return {
    ...content(document),
    nodes: [...document.nodes, placeholder],
    edges: [
      ...document.edges,
      { edgeId, sourceNodeId, targetNodeId: derivedNodeId },
    ],
  };
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
      if (node.generation.status !== 'failed' || node.mediaRef !== undefined) return node;
      return {
        ...node,
        generation: {
          operationId: nextOperationId,
          toolId: node.generation.toolId,
          resultMode: node.generation.resultMode,
          status: 'pending' as const,
        },
      };
    }),
  };
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
