/**
 * Text-to-image base-card and reference (垫图) model helpers for the Infinite
 * Canvas panel (K2 W3).
 *
 * Pure document-content functions, sibling to infiniteCanvasPanelModel.ts:
 * no reactflow, React, or Tauri imports. Two invariants rule here:
 *
 * - `resultMode: 'self'` is only ever legal on a card that has no mediaRef
 *   yet (first shot into a blank card); cards that already carry an image
 *   must go through the derive helpers instead (never-overwrite, PRD §3.1).
 * - Reference order has exactly one authority: the creation order of the
 *   edges pointing at the card, i.e. their order in `document.edges`
 *   (collectRefs discipline, PRD §3.3).
 */
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasNode,
} from '@/shared/services/infinite-canvas';

import type { InfiniteCanvasDocumentContent } from './infiniteCanvasPanelModel';

function content(document: Readonly<InfiniteCanvasDocument>): InfiniteCanvasDocumentContent {
  return {
    nodes: document.nodes,
    edges: document.edges,
    viewport: document.viewport,
  };
}

/**
 * Adds a blank generation card: an image card with no mediaRef and an empty
 * prompt, waiting for the user's first text-to-image shot. Re-adding an
 * existing nodeId returns the content unchanged.
 */
export function addBlankGenerationCardContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  position: { x: number; y: number },
): InfiniteCanvasDocumentContent {
  if (document.nodes.some(node => node.nodeId === nodeId)) return content(document);
  const node: InfiniteCanvasNode = { nodeId, kind: 'image', position, prompt: '' };
  return { ...content(document), nodes: [...document.nodes, node] };
}

/** Writes the generation prompt of an image card (blank or regenerate alike). */
export function setNodePromptContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  prompt: string,
): InfiniteCanvasDocumentContent {
  return {
    ...content(document),
    nodes: document.nodes.map(node => (
      node.nodeId === nodeId && node.kind === 'image' ? { ...node, prompt } : node
    )),
  };
}

// P3 W2: `beginSelfGenerationContent` was sunk to the shared infinite-canvas
// module (the agent ops applier reuses it); this re-export keeps every
// existing panel-side import working unchanged. Semantics are identical for
// the K2 image path: self mode stays strictly for the first shot into a
// blank card, and re-registering the same operationId stays a no-op.
export { beginSelfGenerationContent } from '@/shared/services/infinite-canvas';

/** One collected reference card, in authoritative connection order (1-based). */
export interface InfiniteCanvasReferenceNode {
  order: number;
  nodeId: string;
  mediaRef: { workspacePath: string; relativePath: string };
}

export type CollectReferenceNodesResult =
  | { status: 'ok'; references: InfiniteCanvasReferenceNode[] }
  /** A connected reference card has no image yet (blank or still pending). */
  | { status: 'error'; error: { kind: 'reference-not-ready'; nodeId: string } };

/**
 * Collects the 垫图 references of a card following the collectRefs
 * discipline (PRD §3.3):
 *
 * - order = the order of the incoming edges in `document.edges` (creation
 *   order); no second ordering source;
 * - self-referencing edges are skipped, so cycles are harmless;
 * - the card's own mediaRef never enters the list;
 * - a referenced card without a mediaRef yields a typed
 *   `reference-not-ready` error instead of a silently shorter list.
 */
export function collectReferenceNodes(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
): CollectReferenceNodesResult {
  const nodesById = new Map(document.nodes.map(node => [node.nodeId, node]));
  const references: InfiniteCanvasReferenceNode[] = [];
  const seenSourceIds = new Set<string>();
  for (const edge of document.edges) {
    if (edge.targetNodeId !== nodeId) continue;
    if (edge.sourceNodeId === nodeId) continue;
    if (seenSourceIds.has(edge.sourceNodeId)) continue;
    const source = nodesById.get(edge.sourceNodeId);
    if (!source) continue;
    if (source.mediaRef === undefined) {
      return {
        status: 'error',
        error: { kind: 'reference-not-ready', nodeId: source.nodeId },
      };
    }
    seenSourceIds.add(source.nodeId);
    references.push({
      order: references.length + 1,
      nodeId: source.nodeId,
      mediaRef: { ...source.mediaRef },
    });
  }
  return { status: 'ok', references };
}
