/**
 * Infinite Canvas document contract (K0-4 of the Infinite Canvas & Media Tools
 * specification, docs/features/infinite-canvas-and-media-tools-prd.md §5).
 *
 * The document persisted here is the single source of truth for the infinite
 * canvas. The Canvas tab is only a projection: tab snapshots may store the
 * `documentId` reference, never node data.
 */

import type { ImageToolErrorKind, ImageToolId } from './ImageToolTypes';

export const INFINITE_CANVAS_SCHEMA_VERSION = '1';

/**
 * K2: the full set of canvas image operations = the five image tools plus
 * `'generate'` (text-to-image / regenerate), the sixth operation kind.
 */
export type CanvasImageOperationKind = ImageToolId | 'generate';

export interface InfiniteCanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

/** Reserved for K3 canvas-to-domain references; no phase-1 writer may set it. */
export interface InfiniteCanvasDomainRef {
  moduleId: string;
  kind: string;
  id: string;
  role: string;
}

/**
 * Node kinds. `'video'` is a P3 addition (schemaVersion stays '1'); known
 * trade-off recorded in the contract: pre-P3 parsers reject a document that
 * contains a video node as `invalid-document`, so the parser upgrade ships
 * before any video-node writer.
 */
export type InfiniteCanvasNodeKind = 'text' | 'image' | 'group' | 'video';

/** P3: which media kind a generation produces; absent means 'image'. */
export type InfiniteCanvasGenerationMediaKind = 'image' | 'video';

/**
 * P4 §2.2: the generation parameters a card remembers between shots.
 *
 * Every field is optional and an absent field means exactly what it meant
 * before P4: the parameter is not sent at all and the provider default
 * applies. The allowed values are per-model and their single source of truth
 * is `src/crates/assembly/core/src/agentic/media/capabilities.rs`; the
 * front-end mirror lives in `infiniteCanvasGenerationCapabilities.ts`.
 *
 * `size` is the image aspect ratio, `aspectRatio` the video one (the video
 * request field differs per model — see the capability table); `n` is the
 * image batch size (1..4, further capped by the model's own `nMax`).
 */
export interface InfiniteCanvasGenerationParams {
  model?: string;
  size?: string;
  resolution?: string;
  n?: number;
  duration?: number;
  aspectRatio?: string;
}

export interface InfiniteCanvasNode {
  nodeId: string;
  kind: InfiniteCanvasNodeKind;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  text?: string;
  /** Reference into Workspace Media; the media truth is never copied. */
  mediaRef?: { workspacePath: string; relativePath: string };
  /** Style preset ID only; resolution goes through the StylePresetCatalog. */
  stylePresetId?: string;
  domainRef?: InfiniteCanvasDomainRef;

  // —— K2 additive fields (schemaVersion stays '1'; the parser reads them
  //    tolerantly, so pre-K2 documents load unchanged). ——
  /** Generation prompt of an image card (blank-card first shot and regenerate share it). */
  prompt?: string;
  /** Version tree: which operation derived this node from which node. Immutable once written; never set in self mode. */
  derivedFrom?: {
    sourceNodeId: string;
    toolId: CanvasImageOperationKind;
    operationId: string;
  };
  /**
   * P4 additive: the generation parameters chosen on this card (model, aspect
   * ratio, resolution, batch size, video duration). Additive, schemaVersion
   * stays '1'; a corrupted value is parsed as "field absent", and the AI's
   * `update_node` white list deliberately does NOT include it (P3 §3.6.4
   * stays as it is — parameter changes widen the spend surface).
   */
  generationParams?: InfiniteCanvasGenerationParams;
  /** In-flight / failed generation state; the whole field is removed on success. */
  generation?: {
    operationId: string;
    toolId: CanvasImageOperationKind;
    resultMode: 'self' | 'derived';
    status: 'pending' | 'failed';
    batchId?: string;
    /** K0-2 seven-kind enum. */
    errorKind?: ImageToolErrorKind;
    /** P3 additive: media kind of this generation; absent defaults to 'image'. */
    mediaKind?: InfiniteCanvasGenerationMediaKind;
  };
}

/**
 * Edge roles. `'derived'` marks the version-tree edge a derived operation
 * creates (regenerate / the five tools); such edges are lineage, never 垫图
 * references (kunpeng referencePolicy: derivation is not reference).
 */
export type InfiniteCanvasEdgeRole = 'derived';

export interface InfiniteCanvasEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  /**
   * Additive field (schemaVersion stays '1'; unknown values are parsed
   * tolerantly as "absent"). Compatibility trade-off, recorded on purpose:
   * pre-role documents carry unmarked derivation edges, and those keep
   * counting as references — old canvases behave exactly as before; only
   * edges written after this field ships are exempted from reference
   * collection.
   */
  role?: InfiniteCanvasEdgeRole;
}

export interface InfiniteCanvasDocument {
  documentId: string;
  schemaVersion: typeof INFINITE_CANVAS_SCHEMA_VERSION;
  /** Same origin as CanvasWorkspaceFacts.workspaceId. */
  workspaceId: string;
  /** Monotonically increasing; saves are compare-and-swap on this value. */
  revision: number;
  nodes: InfiniteCanvasNode[];
  edges: InfiniteCanvasEdge[];
  viewport: InfiniteCanvasViewport;
  updatedAt: string;

  // —— P3 additive field (schemaVersion stays '1'; tolerant parsing keeps
  //    pre-P3 documents loading unchanged). ——
  /**
   * Agent ops-journal watermark: highest applied batch `seq` from
   * `.void/infinite-canvas/<documentId>.ops.json`. The journal's only writer
   * is the Rust CanvasOp tool; this document's only writer stays the front-end
   * document service.
   */
  agentOps?: { appliedSeq: number };
}

/** Workspace facts the document service needs; remote is always fail-closed. */
export interface InfiniteCanvasWorkspaceRef {
  workspaceId: string;
  workspacePath: string;
  backend: 'local' | 'remote';
}

export type InfiniteCanvasDocumentError =
  /** Persisted schemaVersion is not understood; never guessed or migrated. */
  | { kind: 'incompatible'; reason: string }
  /** The persisted file is not parseable JSON. */
  | { kind: 'corrupted'; reason: string }
  /** Parseable JSON that violates the document contract. */
  | { kind: 'invalid-document'; reason: string }
  /** Remote workspaces are fail-closed, same as Workspace Media / Agent Studio. */
  | { kind: 'unavailable'; reason: string }
  /** Persistence port I/O failure. */
  | { kind: 'io'; reason: string; cause?: unknown };

export type InfiniteCanvasLoadResult =
  | { status: 'loaded'; document: InfiniteCanvasDocument }
  /** No document existed yet; a default one was created and persisted. */
  | { status: 'created'; document: InfiniteCanvasDocument }
  | { status: 'failed'; error: InfiniteCanvasDocumentError };

export type InfiniteCanvasSaveResult =
  | { status: 'saved'; document: InfiniteCanvasDocument }
  /** CAS rejection: the caller's base revision is stale. Never overwrites. */
  | { status: 'conflict'; expectedRevision: number; actualRevision: number }
  | { status: 'failed'; error: InfiniteCanvasDocumentError };

export type InfiniteCanvasMutateResult =
  | { status: 'applied'; document: InfiniteCanvasDocument }
  | { status: 'failed'; error: InfiniteCanvasDocumentError };

/** The content slice a mutation may replace; everything else is service-owned. */
export type InfiniteCanvasDocumentContent = Pick<
  InfiniteCanvasDocument,
  'nodes' | 'edges' | 'viewport'
>;

/**
 * Content-level mutation; identity, revision, and timestamps stay service-owned.
 * P3: a mutator may additionally advance the `agentOps` watermark in the same
 * mutation that applies an agent ops batch (plan §2.2 — watermark and content
 * move together or not at all); omitting it keeps the current value.
 */
export type InfiniteCanvasMutator = (
  current: Readonly<InfiniteCanvasDocument>,
) => InfiniteCanvasDocumentContent & Partial<Pick<InfiniteCanvasDocument, 'agentOps'>>;
