/**
 * Reference (垫图) collection for the Infinite Canvas generator (K2 W3).
 *
 * Reference order has exactly one authority: the creation order of the edges
 * pointing at the card, i.e. their order in `document.edges` (collectRefs
 * discipline, PRD §3.3). Pure — no reactflow, React, or Tauri imports.
 *
 * The four card-writing commands that used to sit here (blank image card,
 * blank video card, prompt, parameters) moved to the canvas domain, beside
 * every other command that edits a card. They are re-exported below, so the
 * generator's own imports are unchanged.
 */
import type { InfiniteCanvasDocument } from '@/shared/services/infinite-canvas';

export {
  addBlankGenerationCardContent,
  addBlankVideoCardContent,
  setNodeGenerationParamsContent,
  setNodePromptContent,
} from '@/shared/services/infinite-canvas';


// P3 W2: `beginSelfGenerationContent` was sunk to the shared infinite-canvas
// module (the agent ops applier reuses it); this re-export keeps every
// existing panel-side import working unchanged. Semantics are identical for
// the K2 image path: self mode stays strictly for the first shot into a
// blank card, and re-registering the same operationId stays a no-op.
export { beginSelfGenerationContent } from '@/shared/services/infinite-canvas';
// §7.6: its sibling for the second and every later shot at the SAME card —
// the registration a regenerate uses now that results accumulate instead of
// growing a new card.
export { beginAccumulatingGenerationContent } from '@/shared/services/infinite-canvas';

/** One collected reference card, in authoritative connection order (1-based). */
export interface InfiniteCanvasReferenceNode {
  order: number;
  nodeId: string;
  mediaRef: { workspacePath: string; relativePath: string };
}

export type CollectReferenceNodesResult =
  | { status: 'ok'; references: InfiniteCanvasReferenceNode[] }
  /** A connected reference card has no image yet (blank or still pending). */
  | { status: 'error'; error: { kind: 'reference-not-ready'; nodeId: string } }
  /** P3: only image cards may be references; video-as-reference is rejected. */
  | { status: 'error'; error: { kind: 'reference-not-image'; nodeId: string } };

/**
 * Collects the 垫图 references of a card following the collectRefs
 * discipline (PRD §3.3):
 *
 * - order = the order of the incoming edges in `document.edges` (creation
 *   order); no second ordering source;
 * - self-referencing edges are skipped, so cycles are harmless;
 * - edges marked `role: 'derived'` (version-tree lineage written by
 *   regenerate/tool derivations) are skipped — derivation is not reference.
 *   Pre-role documents carry unmarked derivation edges; those still count as
 *   references, the recorded compatibility trade-off (no silent migration);
 * - the card's own mediaRef never enters the list;
 * - a referenced card without a mediaRef yields a typed
 *   `reference-not-ready` error instead of a silently shorter list;
 * - P3: a video card as a reference is a typed `reference-not-image` error
 *   (blank or not) — the video-as-reference model semantics are undefined,
 *   so this phase rejects it outright. All other kinds keep their K2
 *   behavior: no mediaRef means `reference-not-ready`.
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
    if (edge.role === 'derived') continue;
    if (seenSourceIds.has(edge.sourceNodeId)) continue;
    const source = nodesById.get(edge.sourceNodeId);
    if (!source) continue;
    if (source.kind === 'video') {
      return {
        status: 'error',
        error: { kind: 'reference-not-image', nodeId: source.nodeId },
      };
    }
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
