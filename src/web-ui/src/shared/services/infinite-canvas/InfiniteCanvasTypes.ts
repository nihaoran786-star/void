/**
 * Infinite Canvas document contract (K0-4 of the Infinite Canvas & Media Tools
 * specification, docs/features/infinite-canvas-and-media-tools-prd.md §5).
 *
 * The document persisted here is the single source of truth for the infinite
 * canvas. The Canvas tab is only a projection: tab snapshots may store the
 * `documentId` reference, never node data.
 */

export const INFINITE_CANVAS_SCHEMA_VERSION = '1';

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

export type InfiniteCanvasNodeKind = 'text' | 'image' | 'group';

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
}

export interface InfiniteCanvasEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
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

/** Content-level mutation; identity, revision, and timestamps stay service-owned. */
export type InfiniteCanvasMutator = (
  current: Readonly<InfiniteCanvasDocument>,
) => Pick<InfiniteCanvasDocument, 'nodes' | 'edges' | 'viewport'>;
