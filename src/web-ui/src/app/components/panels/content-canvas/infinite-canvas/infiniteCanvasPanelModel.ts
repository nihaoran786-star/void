/**
 * Pure projection and mutation helpers for the Infinite Canvas panel (M3).
 *
 * The panel is only a projection of the InfiniteCanvasDocument owned by the
 * infinite-canvas Domain Module: every helper here either maps the document
 * into reactflow view models or produces the next document content for a
 * DocumentService mutation. No reactflow, React, or Tauri imports.
 */
import type {
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
