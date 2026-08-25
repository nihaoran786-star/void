/**
 * Copy / paste / duplicate for the Infinite Canvas panel (P4 W7, plan §2.5).
 *
 * Pure logic only — no React, no reactflow, no Tauri.
 *
 * **Copying a card with a picture copies the REFERENCE, not the file.** The
 * `mediaRef` is carried across byte for byte, so the original and the copy
 * point at the same file in Workspace Media. Three reasons, all from the PRD:
 * the canvas may only reference media and never write the media domain;
 * copying files would silently double storage on every duplicate; and
 * "deleting a card never deletes the file" only stays true if a card was never
 * the owner of the file in the first place. Producing a second file is an
 * export, and that is not this.
 *
 * What deliberately does NOT travel with a copy:
 *
 * - `generation` — an operationId has exactly one landing site; a copy of an
 *   in-flight card would be a second one.
 * - `derivedFrom` — lineage belongs to the original. A pasted card is a new
 *   root, not a version of anything.
 * - `domainRef` — reserved for K3; no path in this phase may ever write it.
 *
 * Edges are copied only when BOTH ends are inside the selection. A half-copied
 * edge would quietly re-order some other card's reference list, and reference
 * order is contract (PRD §3.2).
 *
 * The clipboard is panel memory, private to the app. It is deliberately not
 * the system clipboard: pasting image bytes across applications is a different
 * capability and not part of this phase.
 */
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentContent,
  InfiniteCanvasEdge,
  InfiniteCanvasEdgeRole,
  InfiniteCanvasGenerationParams,
  InfiniteCanvasNode,
  InfiniteCanvasNodeKind,
} from '@/shared/services/infinite-canvas';

/** Offset a duplicate or a plain paste is nudged by, in canvas units. */
export const INFINITE_CANVAS_PASTE_OFFSET = 32;

/**
 * One copied card. `key` is a snapshot-local handle used to rewire the copied
 * edges at paste time; it is never a document id.
 */
export interface InfiniteCanvasClipboardNode {
  key: string;
  kind: Exclude<InfiniteCanvasNodeKind, 'group'>;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  text?: string;
  prompt?: string;
  stylePresetId?: string;
  generationParams?: InfiniteCanvasGenerationParams;
  mediaRef?: { workspacePath: string; relativePath: string };
}

export interface InfiniteCanvasClipboardEdge {
  sourceKey: string;
  targetKey: string;
  role?: InfiniteCanvasEdgeRole;
}

export interface InfiniteCanvasClipboardSnapshot {
  nodes: InfiniteCanvasClipboardNode[];
  edges: InfiniteCanvasClipboardEdge[];
}

/**
 * Snapshots the selection, or returns `undefined` when nothing copyable was
 * selected. Group nodes are skipped: they have no UI in this phase, so
 * copying one would produce a card the user cannot see or reach.
 */
export function copySelectionSnapshot(
  document: Readonly<InfiniteCanvasDocument>,
  nodeIds: readonly string[],
): InfiniteCanvasClipboardSnapshot | undefined {
  const requested = new Set(nodeIds);
  const sources = document.nodes.filter(
    node => requested.has(node.nodeId) && node.kind !== 'group',
  );
  if (sources.length === 0) return undefined;

  const keyByNodeId = new Map<string, string>();
  const nodes = sources.map((node, index) => {
    const key = `clip-${index}`;
    keyByNodeId.set(node.nodeId, key);
    const copied: InfiniteCanvasClipboardNode = {
      key,
      kind: node.kind as InfiniteCanvasClipboardNode['kind'],
      position: { ...node.position },
      ...(node.size === undefined ? {} : { size: { ...node.size } }),
      ...(node.text === undefined ? {} : { text: node.text }),
      ...(node.prompt === undefined ? {} : { prompt: node.prompt }),
      ...(node.stylePresetId === undefined ? {} : { stylePresetId: node.stylePresetId }),
      ...(node.generationParams === undefined
        ? {}
        : { generationParams: { ...node.generationParams } }),
      // Reference, not file: the same workspacePath + relativePath.
      ...(node.mediaRef === undefined ? {} : { mediaRef: { ...node.mediaRef } }),
    };
    return copied;
  });

  const edges: InfiniteCanvasClipboardEdge[] = [];
  for (const edge of document.edges) {
    const sourceKey = keyByNodeId.get(edge.sourceNodeId);
    const targetKey = keyByNodeId.get(edge.targetNodeId);
    // Both ends inside the selection, or the edge is not copied at all.
    if (!sourceKey || !targetKey) continue;
    edges.push({
      sourceKey,
      targetKey,
      ...(edge.role === undefined ? {} : { role: edge.role }),
    });
  }

  return { nodes, edges };
}

/** Top-left corner of a snapshot; the anchor for "paste right here". */
export function clipboardSnapshotOrigin(
  snapshot: InfiniteCanvasClipboardSnapshot,
): { x: number; y: number } {
  const xs = snapshot.nodes.map(node => node.position.x);
  const ys = snapshot.nodes.map(node => node.position.y);
  return { x: Math.min(...xs), y: Math.min(...ys) };
}

export interface InfiniteCanvasPasteResult {
  content: InfiniteCanvasDocumentContent;
  /** The ids of the cards that were just created, in snapshot order. */
  nodeIds: string[];
}

/**
 * Pastes a snapshot into the document, offset by `offset`.
 *
 * Every pasted card and edge gets a brand-new id from `createId`, so a paste
 * can never overwrite or merge into an existing entity — including a paste of
 * a snapshot whose original cards are still on the canvas.
 */
export function pasteSnapshotContent(
  document: Readonly<InfiniteCanvasDocument>,
  snapshot: InfiniteCanvasClipboardSnapshot,
  options: {
    offset: { x: number; y: number };
    createId: (prefix: string) => string;
  },
): InfiniteCanvasPasteResult {
  const base: InfiniteCanvasDocumentContent = {
    nodes: document.nodes,
    edges: document.edges,
    viewport: document.viewport,
  };
  if (snapshot.nodes.length === 0) return { content: base, nodeIds: [] };

  const existingIds = new Set(document.nodes.map(node => node.nodeId));
  const nodeIdByKey = new Map<string, string>();
  const created: InfiniteCanvasNode[] = [];

  for (const copied of snapshot.nodes) {
    let nodeId = options.createId('node');
    // Defensive: an id factory that ever repeats itself must not be allowed
    // to replace a card that is already on the canvas.
    while (existingIds.has(nodeId)) nodeId = options.createId('node');
    existingIds.add(nodeId);
    nodeIdByKey.set(copied.key, nodeId);
    created.push({
      nodeId,
      kind: copied.kind,
      position: {
        x: copied.position.x + options.offset.x,
        y: copied.position.y + options.offset.y,
      },
      ...(copied.size === undefined ? {} : { size: { ...copied.size } }),
      ...(copied.text === undefined ? {} : { text: copied.text }),
      ...(copied.prompt === undefined ? {} : { prompt: copied.prompt }),
      ...(copied.stylePresetId === undefined ? {} : { stylePresetId: copied.stylePresetId }),
      ...(copied.generationParams === undefined
        ? {}
        : { generationParams: { ...copied.generationParams } }),
      ...(copied.mediaRef === undefined ? {} : { mediaRef: { ...copied.mediaRef } }),
    });
  }

  const existingEdgeIds = new Set(document.edges.map(edge => edge.edgeId));
  const createdEdges: InfiniteCanvasEdge[] = [];
  for (const copied of snapshot.edges) {
    const sourceNodeId = nodeIdByKey.get(copied.sourceKey);
    const targetNodeId = nodeIdByKey.get(copied.targetKey);
    if (!sourceNodeId || !targetNodeId) continue;
    let edgeId = options.createId('edge');
    while (existingEdgeIds.has(edgeId)) edgeId = options.createId('edge');
    existingEdgeIds.add(edgeId);
    createdEdges.push({
      edgeId,
      sourceNodeId,
      targetNodeId,
      ...(copied.role === undefined ? {} : { role: copied.role }),
    });
  }

  return {
    content: {
      ...base,
      nodes: [...document.nodes, ...created],
      edges: [...document.edges, ...createdEdges],
    },
    nodeIds: created.map(node => node.nodeId),
  };
}
