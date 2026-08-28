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
 *
 * P5 (PRD §3.8) adds `'crop'`, and it is unlike every other kind: it is a
 * LOCAL derivation. No media task is submitted, no quota is spent, no batch id
 * exists, and the media bridge never sees it — the front end writes the cut
 * PNG and the derived card's `mediaRef` in one mutation. It is therefore also
 * the one kind the AI-facing `CanvasOp` white list deliberately does NOT
 * accept (see `InfiniteCanvasAgentOps.ts`): the AI may not crop for the user.
 */
export type CanvasImageOperationKind = ImageToolId | 'generate' | 'crop';

export interface InfiniteCanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * K3 (contract §5.1.1): which domain object a card belongs to.
 *
 * Four fields, fixed forever — the display handle (`CHAR-001`) is deliberately
 * NOT one of them, because a handle can be renamed and this has to survive
 * that. No path and no media id either: this answers "which asset", never
 * "which picture"; the picture is `mediaRef`, and keeping the two apart is
 * what lets an asset change picture without breaking its reference.
 *
 * Only one writer exists: the short-drama handoff. The three AI gates
 * (`update_node` whitelist, Rust `canvas_tools`, clipboard) stay shut, so
 * once written this is effectively read-only and deleting the card is the only
 * way to undo it.
 */
export interface InfiniteCanvasDomainRef {
  moduleId: string;
  kind: string;
  id: string;
  role: string;
}

/**
 * K3 §5.1.2: the modules allowed to own a `domainRef`. A reference naming any
 * other module is dropped on read as "absent" — forward compatible, never a
 * corrupted document.
 */
export const INFINITE_CANVAS_DOMAIN_MODULE_IDS = ['short-drama'] as const;

/** K3 §5.1.1: the short-drama asset types that can be refined on the board. */
export const INFINITE_CANVAS_DOMAIN_KINDS = [
  'character',
  'location',
  'storyboard',
] as const;

/** K3 §5.1.1: the only role this phase defines. */
export const INFINITE_CANVAS_DOMAIN_ROLES = ['refine'] as const;

/**
 * K3 §5.1.6: the document-level identity of a domain reference. Two references
 * naming the same asset are the same "official refinement slot" whatever
 * request brought them in, which is what keeps a second send of the same asset
 * from growing a second card that would then fight the first one over which is
 * the real one.
 *
 * `role` is deliberately not part of the key: the same asset in two roles is
 * still the same asset. The separator is a NUL escape, not a literal NUL byte
 * — a raw one in the source turns the whole file binary to git.
 */
export function infiniteCanvasDomainRefKey(
  domainRef: InfiniteCanvasDomainRef,
): string {
  return [domainRef.moduleId, domainRef.kind, domainRef.id].join('\u0000');
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
  /**
   * Reference into Workspace Media; the media truth is never copied.
   *
   * §7.6: this is now the compatibility outlet for "the picture the card face
   * currently shows". When {@link InfiniteCanvasNode.mediaVariants} is present
   * it always equals `mediaVariants[activeVariantIndex]`; the two can never
   * disagree. A card with a single picture writes only this field, exactly as
   * every pre-§7.6 document does.
   */
  mediaRef?: { workspacePath: string; relativePath: string };
  /**
   * §7.6 additive (schemaVersion stays '1'): every picture this card carries,
   * oldest first. Absent means "the one in `mediaRef`", which is why old
   * documents load and round-trip unchanged.
   *
   * The list is APPEND-ONLY: no entry may ever be changed, replaced or
   * removed. The never-overwrite invariant did not go away with §7.6 — it
   * moved from the single `mediaRef` to every entry of this list. Helpers that
   * keep this true live in `InfiniteCanvasMediaVariants.ts`; no writer should
   * build these two fields by hand.
   */
  mediaVariants?: { workspacePath: string; relativePath: string }[];
  /**
   * §7.6 additive: which entry of `mediaVariants` the card face shows. Absent
   * (or out of range, which the parser repairs) means the first one. This is
   * the only card-level thing §7.6 lets the user change, and it is undoable.
   */
  activeVariantIndex?: number;
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
