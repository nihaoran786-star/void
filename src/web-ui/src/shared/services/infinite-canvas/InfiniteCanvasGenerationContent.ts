/**
 * Generation-registration content helpers (K2 W2/W3 semantics, sunk from the
 * app-layer panel models to shared in P3 W2 so the agent ops applier can reuse
 * them — the app layer keeps re-exports, callers are unchanged).
 *
 * Pure document-content functions with two ruling invariants:
 *
 * - `resultMode: 'self'` is only ever legal on a card that has no mediaRef yet
 *   (first shot into a blank card); cards that already carry media must derive
 *   a NEW placeholder card instead (never-overwrite, PRD §3.1/§3.5).
 * - Both helpers are idempotent on `operationId`: re-registering the same
 *   operation returns the content unchanged.
 *
 * P3 additions are strictly optional: `mediaKind: 'video'` targets/creates
 * video cards and stamps `generation.mediaKind`; the defaults reproduce the
 * K2 image behavior byte-for-byte.
 */
import type {
  CanvasImageOperationKind,
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentContent,
  InfiniteCanvasGenerationMediaKind,
  InfiniteCanvasNode,
} from './InfiniteCanvasTypes';

/** Horizontal offset used to place a derived placeholder beside its source. */
const DERIVED_NODE_OFFSET_X = 360;

function content(document: Readonly<InfiniteCanvasDocument>): InfiniteCanvasDocumentContent {
  return {
    nodes: document.nodes,
    edges: document.edges,
    viewport: document.viewport,
  };
}

export interface InfiniteCanvasBeginGenerationOptions {
  /** 'video' targets/creates video cards; default 'image' (K2 behavior). */
  mediaKind?: InfiniteCanvasGenerationMediaKind;
  /** Prompt written onto the target/placeholder card when provided. */
  prompt?: string;
  /** Style preset recorded on the target/placeholder card when provided. */
  stylePresetId?: string;
}

/** The card kind a generation of the given media kind lands into. */
export function generationCardKind(
  mediaKind: InfiniteCanvasGenerationMediaKind,
): 'image' | 'video' {
  return mediaKind === 'video' ? 'video' : 'image';
}

function generationRecord(
  operationId: string,
  toolId: CanvasImageOperationKind,
  resultMode: 'self' | 'derived',
  mediaKind: InfiniteCanvasGenerationMediaKind,
): NonNullable<InfiniteCanvasNode['generation']> {
  return {
    operationId,
    toolId,
    resultMode,
    status: 'pending',
    // Image stays the implicit default so K2 documents round-trip unchanged.
    ...(mediaKind === 'video' ? { mediaKind: 'video' as const } : {}),
  };
}

/**
 * Registers a self-mode generation on a blank card: the result will land in
 * the card itself. Rejected (content returned unchanged) when the card is
 * missing, of the wrong kind for the media kind, or **already has a
 * mediaRef** — self mode is strictly for the first shot into an empty card.
 *
 * Re-registering with a new operationId replaces a previous pending/failed
 * generation (that is the retry path); re-registering the same operationId
 * is a no-op.
 */
export function beginSelfGenerationContent(
  document: Readonly<InfiniteCanvasDocument>,
  nodeId: string,
  operationId: string,
  options: InfiniteCanvasBeginGenerationOptions & {
    /** Operation kind; defaults to 'generate' (the K2 blank-card first shot). */
    toolId?: CanvasImageOperationKind;
  } = {},
): InfiniteCanvasDocumentContent {
  const mediaKind = options.mediaKind ?? 'image';
  const toolId = options.toolId ?? 'generate';
  const target = document.nodes.find(node => node.nodeId === nodeId);
  if (!target
    || target.kind !== generationCardKind(mediaKind)
    || target.mediaRef !== undefined) {
    return content(document);
  }
  if (target.generation?.operationId === operationId) return content(document);
  return {
    ...content(document),
    nodes: document.nodes.map(node => (
      node.nodeId === nodeId
        ? {
          ...node,
          ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
          ...(options.stylePresetId !== undefined
            ? { stylePresetId: options.stylePresetId }
            : {}),
          generation: generationRecord(operationId, toolId, 'self', mediaKind),
        }
        : node
    )),
  };
}

/**
 * Registers a derived operation: creates the pending placeholder card and the
 * source→derived edge. Re-invoking with an operationId that is already
 * registered returns the content unchanged (idempotent dispatch), as does a
 * missing source or an already-taken placeholder nodeId. The source node —
 * and in particular its mediaRef — is never touched.
 */
export function beginDerivedOperationContent(
  document: Readonly<InfiniteCanvasDocument>,
  sourceNodeId: string,
  toolId: CanvasImageOperationKind,
  operationId: string,
  derivedNodeId: string,
  edgeId: string,
  options: InfiniteCanvasBeginGenerationOptions = {},
): InfiniteCanvasDocumentContent {
  const mediaKind = options.mediaKind ?? 'image';
  if (document.nodes.some(node => node.generation?.operationId === operationId)) {
    return content(document);
  }
  const source = document.nodes.find(node => node.nodeId === sourceNodeId);
  if (!source) return content(document);
  if (document.nodes.some(node => node.nodeId === derivedNodeId)) return content(document);
  const placeholder: InfiniteCanvasNode = {
    nodeId: derivedNodeId,
    kind: generationCardKind(mediaKind),
    position: {
      x: source.position.x + (source.size?.width ?? 0) + DERIVED_NODE_OFFSET_X,
      y: source.position.y,
    },
    ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
    ...(options.stylePresetId !== undefined ? { stylePresetId: options.stylePresetId } : {}),
    derivedFrom: { sourceNodeId, toolId, operationId },
    generation: generationRecord(operationId, toolId, 'derived', mediaKind),
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
