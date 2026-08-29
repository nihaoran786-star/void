/**
 * Infinite Canvas Domain Module (M1): owns the canvas document truth.
 *
 * Load / save / mutate over the persistence port only — no Tauri, React, or
 * Zustand imports. Saves are revision compare-and-swap writes; mutations are
 * coalesced (debounced) into a single atomic write per idle window, borrowing
 * the kunpeng coalesced-idle idea while keeping the file as the only truth.
 */
import type {
  CanvasImageOperationKind,
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentError,
  InfiniteCanvasDomainRef,
  InfiniteCanvasEdge,
  InfiniteCanvasLoadResult,
  InfiniteCanvasMutateResult,
  InfiniteCanvasMutator,
  InfiniteCanvasNode,
  InfiniteCanvasSaveResult,
  InfiniteCanvasViewport,
  InfiniteCanvasWorkspaceRef,
} from './InfiniteCanvasTypes';
import type { ImageToolErrorKind } from './ImageToolTypes';
import {
  INFINITE_CANVAS_DOMAIN_KINDS,
  INFINITE_CANVAS_DOMAIN_MODULE_IDS,
  INFINITE_CANVAS_DOMAIN_ROLES,
  INFINITE_CANVAS_CONSUMED_IMPORT_LIMIT,
  INFINITE_CANVAS_SCHEMA_VERSION,
} from './InfiniteCanvasTypes';
import type { InfiniteCanvasPersistencePort } from './InfiniteCanvasPersistencePort';

const REMOTE_UNAVAILABLE_REASON =
  'Infinite Canvas remote workspace I/O routing is not available.';

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function stableHash36(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/** One default document per workspace in phase 1; opaque but stable. */
export function defaultInfiniteCanvasDocumentId(workspaceId: string): string {
  return `default-${stableHash36(workspaceId)}`;
}

export function infiniteCanvasDirectoryPath(workspacePath: string): string {
  return `${normalizeSlashes(workspacePath)}/.void/infinite-canvas`;
}

export function infiniteCanvasDocumentFilePath(
  workspacePath: string,
  documentId: string,
): string {
  return `${infiniteCanvasDirectoryPath(workspacePath)}/${documentId}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// 'crop' (P5, PRD §3.8) is persisted on a derived card's `derivedFrom.toolId`,
// so the parser has to accept it or a cropped card would fail to load.
const CANVAS_IMAGE_OPERATION_KINDS: readonly CanvasImageOperationKind[] = [
  'upscale', 'expand', 'inpaint', 'erase', 'matting', 'generate', 'crop',
];

const IMAGE_TOOL_ERROR_KINDS: readonly ImageToolErrorKind[] = [
  'unavailable', 'auth', 'rate-limit', 'timeout', 'invalid-input', 'backend', 'cancelled',
];

function isCanvasImageOperationKind(value: unknown): value is CanvasImageOperationKind {
  return (CANVAS_IMAGE_OPERATION_KINDS as readonly unknown[]).includes(value);
}

function isImageToolErrorKind(value: unknown): value is ImageToolErrorKind {
  return (IMAGE_TOOL_ERROR_KINDS as readonly unknown[]).includes(value);
}

/**
 * K2 additive field: a broken value is treated as "field absent", never as an
 * invalid document, so pre-K2 readers and writers stay compatible.
 */
function parseDerivedFrom(value: unknown): InfiniteCanvasNode['derivedFrom'] {
  if (!isRecord(value)) return undefined;
  if (!isNonEmptyString(value.sourceNodeId)
    || !isCanvasImageOperationKind(value.toolId)
    || !isNonEmptyString(value.operationId)) {
    return undefined;
  }
  return {
    sourceNodeId: value.sourceNodeId,
    toolId: value.toolId,
    operationId: value.operationId,
  };
}

/** K2 additive field; same tolerance rule as {@link parseDerivedFrom}. */
function parseGeneration(value: unknown): InfiniteCanvasNode['generation'] {
  if (!isRecord(value)) return undefined;
  if (!isNonEmptyString(value.operationId)
    || !isCanvasImageOperationKind(value.toolId)
    || (value.resultMode !== 'self' && value.resultMode !== 'derived')
    || (value.status !== 'pending' && value.status !== 'failed')) {
    return undefined;
  }
  const generation: NonNullable<InfiniteCanvasNode['generation']> = {
    operationId: value.operationId,
    toolId: value.toolId,
    resultMode: value.resultMode,
    status: value.status,
  };
  if (isNonEmptyString(value.batchId)) generation.batchId = value.batchId;
  if (isImageToolErrorKind(value.errorKind)) generation.errorKind = value.errorKind;
  // P3 additive: a broken mediaKind is dropped as absent (defaults to image).
  if (value.mediaKind === 'image' || value.mediaKind === 'video') {
    generation.mediaKind = value.mediaKind;
  }
  return generation;
}

/**
 * P4 additive field; same tolerance rule as {@link parseDerivedFrom}: a
 * corrupted `generationParams` (string, array, illegal `n`, …) is dropped
 * field by field and never invalidates the node or the document. The bounds
 * here are only the contract-level ones (`n` 1..4 and `duration` 1..15 are
 * the backend schema caps); the per-model allowed values live in
 * `infiniteCanvasGenerationCapabilities.ts` and are enforced at dispatch.
 */
function parseGenerationParams(value: unknown): InfiniteCanvasNode['generationParams'] {
  if (!isRecord(value)) return undefined;
  const params: NonNullable<InfiniteCanvasNode['generationParams']> = {};
  if (isNonEmptyString(value.model)) params.model = value.model;
  if (isNonEmptyString(value.size)) params.size = value.size;
  if (isNonEmptyString(value.resolution)) params.resolution = value.resolution;
  if (isNonEmptyString(value.aspectRatio)) params.aspectRatio = value.aspectRatio;
  if (isFiniteNumber(value.n) && Number.isInteger(value.n) && value.n >= 1 && value.n <= 4) {
    params.n = value.n;
  }
  if (isFiniteNumber(value.duration)
    && Number.isInteger(value.duration)
    && value.duration >= 1
    && value.duration <= 15) {
    params.duration = value.duration;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * K3 §5.1.4: read the domain reference back.
 *
 * Before K3 this field was written by nobody and read by nobody, which made
 * "store it" and "lose it" the same thing. Now it round-trips — under the same
 * tolerance rule as every other additive field: a malformed reference (not an
 * object, a missing or blank field, a module outside the whitelist) is dropped
 * as ABSENT and the rest of the node parses normally. One bad label must never
 * cost the user the whole board.
 *
 * The parser deliberately does not ask whether the referenced asset still
 * exists. That is a runtime question, and answering it here would make the
 * canvas document depend on the short-drama domain. A reference whose asset is
 * gone stays in the document and degrades in the UI instead (§5.1.4).
 */
function parseDomainRef(value: unknown): InfiniteCanvasDomainRef | undefined {
  if (!isRecord(value)) return undefined;
  const { moduleId, kind, id, role } = value;
  if (!isNonEmptyString(moduleId)
    || !isNonEmptyString(kind)
    || !isNonEmptyString(id)
    || !isNonEmptyString(role)) {
    return undefined;
  }
  if (!(INFINITE_CANVAS_DOMAIN_MODULE_IDS as readonly string[]).includes(moduleId)) {
    return undefined;
  }
  if (!(INFINITE_CANVAS_DOMAIN_KINDS as readonly string[]).includes(kind)) {
    return undefined;
  }
  if (!(INFINITE_CANVAS_DOMAIN_ROLES as readonly string[]).includes(role)) {
    return undefined;
  }
  return { moduleId, kind, id, role };
}

/**
 * P3 additive document field; a broken value is treated as "field absent",
 * never as an invalid document.
 */
function parseAgentOps(value: unknown): InfiniteCanvasDocument['agentOps'] {
  if (!isRecord(value)) return undefined;
  const appliedSeq = value.appliedSeq;
  if (!isFiniteNumber(appliedSeq) || !Number.isInteger(appliedSeq) || appliedSeq < 0) {
    return undefined;
  }
  return { appliedSeq };
}

/**
 * K3 E4 additive document field; same tolerance rule as
 * {@link parseAgentOps} and {@link parseMediaVariants} — unusable entries are
 * skipped, everything readable survives, and an empty result reads as absent.
 *
 * A dropped id is not data loss, it is one extra chance for a stale payload to
 * replay; a dropped list would be. So this never rejects the document.
 */
function parseConsumedImportRequestIds(
  value: unknown,
): InfiniteCanvasDocument['consumedImportRequestIds'] {
  if (!Array.isArray(value)) return undefined;
  const ids: string[] = [];
  for (const entry of value) {
    if (!isNonEmptyString(entry) || ids.includes(entry)) continue;
    ids.push(entry);
  }
  if (ids.length === 0) return undefined;
  return ids.slice(-INFINITE_CANVAS_CONSUMED_IMPORT_LIMIT);
}

/**
 * §7.6 additive field; same tolerance rule as {@link parseDerivedFrom}.
 *
 * Adversarial review P3: this used to drop the WHOLE list on a single unusable
 * entry, and the next save then wrote the shortened node back — one malformed
 * record and every other picture on that card was deleted from the document
 * for good. Parsing is not the place to lose the user's work: unusable entries
 * (and exact duplicates, which the append-only list must not contain) are
 * skipped, everything readable survives, and a list that turns out to be empty
 * simply reads as absent.
 */
function parseMediaVariants(value: unknown): NonNullable<InfiniteCanvasNode['mediaVariants']> {
  if (!Array.isArray(value)) return [];
  const variants: NonNullable<InfiniteCanvasNode['mediaVariants']> = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)
      || !isNonEmptyString(entry.workspacePath)
      || !isNonEmptyString(entry.relativePath)) {
      continue;
    }
    const key = `${entry.workspacePath}\u0000${entry.relativePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push({ workspacePath: entry.workspacePath, relativePath: entry.relativePath });
  }
  return variants;
}

function parseNode(value: unknown): InfiniteCanvasNode | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value.kind;
  // 'video' is a P3 addition; pre-P3 parsers rejected the whole document on
  // an unknown kind, which is why this parser slice lands before any writer.
  if (kind !== 'text' && kind !== 'image' && kind !== 'group' && kind !== 'video') {
    return undefined;
  }
  if (!isNonEmptyString(value.nodeId)) return undefined;
  const position = value.position;
  if (!isRecord(position) || !isFiniteNumber(position.x) || !isFiniteNumber(position.y)) {
    return undefined;
  }
  const node: InfiniteCanvasNode = {
    nodeId: value.nodeId,
    kind,
    position: { x: position.x, y: position.y },
  };
  if (isRecord(value.size)
    && isFiniteNumber(value.size.width)
    && isFiniteNumber(value.size.height)) {
    node.size = { width: value.size.width, height: value.size.height };
  }
  if (typeof value.text === 'string') node.text = value.text;
  if (isRecord(value.mediaRef)
    && isNonEmptyString(value.mediaRef.workspacePath)
    && isNonEmptyString(value.mediaRef.relativePath)) {
    node.mediaRef = {
      workspacePath: value.mediaRef.workspacePath,
      relativePath: value.mediaRef.relativePath,
    };
  }
  // §7.6: the gallery is only meaningful next to a current picture, and the
  // two must agree. P3: "repair to the largest self-consistent list", never
  // "throw the list away" — the next save is what makes a parse-time decision
  // permanent, so every readable picture has to come out the other side.
  const mediaVariants = parseMediaVariants(value.mediaVariants);
  if (mediaVariants.length > 0) {
    const sameAs = (
      left: { workspacePath: string; relativePath: string },
      right: { workspacePath: string; relativePath: string },
    ): boolean => (
      left.workspacePath === right.workspacePath && left.relativePath === right.relativePath
    );
    // No current picture recorded: the list decides which one the card shows,
    // through the recorded index when it is usable and the first entry
    // otherwise. Rebuilding a lost `mediaRef` from the list keeps the card's
    // own pictures; leaving it absent used to delete all of them.
    const recorded = isFiniteNumber(value.activeVariantIndex)
      && Number.isInteger(value.activeVariantIndex)
      && value.activeVariantIndex >= 0
      && value.activeVariantIndex < mediaVariants.length
      ? value.activeVariantIndex
      : -1;
    if (!node.mediaRef) node.mediaRef = { ...mediaVariants[recorded >= 0 ? recorded : 0] };
    const current = node.mediaRef;
    // The current picture is always IN the list — an entry the list lost (or
    // never had) is merged back in rather than the list being dropped. The
    // append-only rule is untouched: nothing is removed or rewritten.
    let variants = mediaVariants;
    let resolved = variants.findIndex(variant => sameAs(variant, current));
    if (resolved < 0) {
      variants = [...mediaVariants, { ...current }];
      resolved = variants.length - 1;
    }
    if (variants.length > 1) {
      node.mediaVariants = variants;
      node.activeVariantIndex = resolved;
    }
  }
  if (isNonEmptyString(value.stylePresetId)) node.stylePresetId = value.stylePresetId;
  if (typeof value.prompt === 'string') node.prompt = value.prompt;
  const generationParams = parseGenerationParams(value.generationParams);
  if (generationParams) node.generationParams = generationParams;
  const derivedFrom = parseDerivedFrom(value.derivedFrom);
  if (derivedFrom) node.derivedFrom = derivedFrom;
  const generation = parseGeneration(value.generation);
  if (generation) node.generation = generation;
  // K3 §5.1.4: the domain reference round-trips now. Structurally unusable or
  // outside the module whitelist reads as absent; nothing here can invalidate
  // the document.
  const domainRef = parseDomainRef(value.domainRef);
  if (domainRef) node.domainRef = domainRef;
  return node;
}

function parseEdge(value: unknown): InfiniteCanvasEdge | undefined {
  if (!isRecord(value)) return undefined;
  if (!isNonEmptyString(value.edgeId)
    || !isNonEmptyString(value.sourceNodeId)
    || !isNonEmptyString(value.targetNodeId)) {
    return undefined;
  }
  const edge: InfiniteCanvasEdge = {
    edgeId: value.edgeId,
    sourceNodeId: value.sourceNodeId,
    targetNodeId: value.targetNodeId,
  };
  // Additive field: an unknown role value is dropped as "absent" (the edge
  // then counts as a reference, matching pre-role documents), never rejected.
  if (value.role === 'derived') edge.role = value.role;
  return edge;
}

function parseViewport(value: unknown): InfiniteCanvasViewport | undefined {
  if (!isRecord(value)) return undefined;
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.zoom)) {
    return undefined;
  }
  return { x: value.x, y: value.y, zoom: value.zoom };
}

export type InfiniteCanvasParseResult =
  | {
    status: 'ok';
    document: InfiniteCanvasDocument;
    /**
     * H2: unreadable nodes and edges are SKIPPED and counted, not fatal.
     *
     * One malformed node used to reject the whole file, and because
     * `writeWithCas` re-parses before every save the rejection was sticky:
     * from then on no edit could ever be written and nothing said why. A
     * board with one broken card is still the user's board; the count is
     * what lets the panel admit that something was left behind.
     */
    skippedNodes: number;
    skippedEdges: number;
  }
  | { status: 'error'; error: InfiniteCanvasDocumentError };

/**
 * Validates raw persisted content. Corrupted JSON and unknown schema versions
 * come back as typed errors — never thrown, never migrated by guesswork.
 */
export function parseInfiniteCanvasDocument(raw: string): InfiniteCanvasParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return {
      status: 'error',
      error: {
        kind: 'corrupted',
        reason: cause instanceof Error ? cause.message : 'Document JSON is corrupted.',
      },
    };
  }
  if (!isRecord(parsed)) {
    return {
      status: 'error',
      error: { kind: 'invalid-document', reason: 'Document root must be an object.' },
    };
  }
  if (parsed.schemaVersion !== INFINITE_CANVAS_SCHEMA_VERSION) {
    return {
      status: 'error',
      error: {
        kind: 'incompatible',
        reason: `Unknown infinite canvas schemaVersion: ${String(parsed.schemaVersion)}`,
      },
    };
  }
  if (!isNonEmptyString(parsed.documentId) || !isNonEmptyString(parsed.workspaceId)) {
    return {
      status: 'error',
      error: { kind: 'invalid-document', reason: 'Document identity fields are invalid.' },
    };
  }
  if (!isFiniteNumber(parsed.revision)
    || !Number.isInteger(parsed.revision)
    || parsed.revision < 0) {
    return {
      status: 'error',
      error: { kind: 'invalid-document', reason: 'Document revision is invalid.' },
    };
  }
  const viewport = parseViewport(parsed.viewport);
  if (!viewport) {
    return {
      status: 'error',
      error: { kind: 'invalid-document', reason: 'Document viewport is invalid.' },
    };
  }
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    return {
      status: 'error',
      error: { kind: 'invalid-document', reason: 'Document nodes/edges must be arrays.' },
    };
  }
  // H2: same rule the additive fields already follow, applied one level up.
  // An unreadable node is dropped and counted; the rest of the board loads.
  const nodes: InfiniteCanvasNode[] = [];
  let skippedNodes = 0;
  for (const rawNode of parsed.nodes) {
    const node = parseNode(rawNode);
    if (!node) {
      skippedNodes += 1;
      continue;
    }
    nodes.push(node);
  }
  const edges: InfiniteCanvasEdge[] = [];
  let skippedEdges = 0;
  for (const rawEdge of parsed.edges) {
    const edge = parseEdge(rawEdge);
    if (!edge) {
      skippedEdges += 1;
      continue;
    }
    // A wire whose card did not survive is deliberately KEPT: reactflow
    // simply does not draw it, and dropping it here would turn one broken
    // card into a permanent loss of the connections around it.
    edges.push(edge);
  }
  const document: InfiniteCanvasDocument = {
    documentId: parsed.documentId,
    schemaVersion: INFINITE_CANVAS_SCHEMA_VERSION,
    workspaceId: parsed.workspaceId,
    revision: parsed.revision,
    nodes,
    edges,
    viewport,
    updatedAt: isNonEmptyString(parsed.updatedAt)
      ? parsed.updatedAt
      : new Date(0).toISOString(),
  };
  const agentOps = parseAgentOps(parsed.agentOps);
  if (agentOps) document.agentOps = agentOps;
  const consumedImportRequestIds = parseConsumedImportRequestIds(
    parsed.consumedImportRequestIds,
  );
  if (consumedImportRequestIds) {
    document.consumedImportRequestIds = consumedImportRequestIds;
  }
  return { status: 'ok', document, skippedNodes, skippedEdges };
}

interface PendingWrite {
  workspace: InfiniteCanvasWorkspaceRef;
  document: InfiniteCanvasDocument;
  /** Revision persisted at the time this coalescing window opened. */
  baseRevision: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Consecutive failed flushes for this pending entry; drives the backoff. */
  retries: number;
}

/**
 * A coalesced write that did not reach the disk.
 *
 * H1: the pending document is deliberately still held in memory when this is
 * reported — `retrying` says whether the service will try again on its own.
 * The panel turns this into a visible line; it must never be swallowed.
 */
export interface InfiniteCanvasPersistenceFailure {
  filePath: string;
  workspaceId: string;
  /** Whether a backoff retry is already scheduled for the same pending write. */
  retrying: boolean;
  outcome:
    | { status: 'conflict'; expectedRevision: number; actualRevision: number }
    | { status: 'failed'; error: InfiniteCanvasDocumentError };
}

export type InfiniteCanvasPersistenceFailureListener = (
  failure: InfiniteCanvasPersistenceFailure,
) => void;

/** Backoff schedule for a pending write that failed; the last entry repeats. */
const FLUSH_RETRY_DELAYS_MS: readonly number[] = [400, 1_200, 3_000, 8_000];
const MAX_FLUSH_RETRIES = 6;

export interface InfiniteCanvasDocumentServiceOptions {
  /** Idle window for coalesced writes; mutations within it share one write. */
  debounceMs?: number;
  now?: () => Date;
}

export class InfiniteCanvasDocumentService {
  private readonly debounceMs: number;
  private readonly now: () => Date;
  private readonly pendingByPath = new Map<string, PendingWrite>();
  /**
   * Per-path mutation queue: concurrent `mutateDefaultDocument` calls for the
   * same file run strictly one after another. Without this, two callers that
   * both miss `pendingByPath` each await a load and then overwrite each
   * other's pending entry — a classic lost update.
   */
  private readonly mutationQueueByPath = new Map<string, Promise<unknown>>();
  /**
   * H1: the write currently on the wire for a path. A flush that finds one
   * waits for it instead of starting a second CAS write against the same
   * base revision, and a mutation that arrives mid-flight awaits it before
   * deciding whether it has to read the file — without this, the in-flight
   * IPC window was a hole where mutations fell back to the stale file on disk.
   */
  private readonly inFlightByPath = new Map<string, Promise<unknown>>();
  private readonly failureListeners = new Set<InfiniteCanvasPersistenceFailureListener>();

  public constructor(
    private readonly port: InfiniteCanvasPersistencePort,
    options: InfiniteCanvasDocumentServiceOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 800;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Subscribes to writes that did not land. Returns the unsubscribe function.
   *
   * H1: a coalesced flush has no caller to return a status to, so a conflict
   * or an I/O failure used to end its life inside a `void` expression. Every
   * such outcome now reaches whoever is listening.
   */
  public onPersistenceFailure(
    listener: InfiniteCanvasPersistenceFailureListener,
  ): () => void {
    this.failureListeners.add(listener);
    return () => {
      this.failureListeners.delete(listener);
    };
  }

  private emitPersistenceFailure(failure: InfiniteCanvasPersistenceFailure): void {
    for (const listener of [...this.failureListeners]) {
      try {
        listener(failure);
      } catch {
        // A listener that throws must not take the write lane down with it.
      }
    }
  }

  /** Loads the per-workspace default document, creating it on first use. */
  public async loadDefaultDocument(
    workspace: InfiniteCanvasWorkspaceRef,
  ): Promise<InfiniteCanvasLoadResult> {
    const rejection = this.rejectRemote(workspace);
    if (rejection) return { status: 'failed', error: rejection };

    const documentId = defaultInfiniteCanvasDocumentId(workspace.workspaceId);
    const filePath = infiniteCanvasDocumentFilePath(workspace.workspacePath, documentId);

    const pending = this.pendingByPath.get(filePath);
    if (pending) {
      return { status: 'loaded', document: pending.document };
    }

    let raw: string | null;
    try {
      raw = await this.port.readTextFile(filePath);
    } catch (cause) {
      return {
        status: 'failed',
        error: { kind: 'io', reason: 'Failed to read the canvas document.', cause },
      };
    }

    if (raw === null) {
      return this.createDefaultDocument(workspace, documentId, filePath);
    }

    const parsed = parseInfiniteCanvasDocument(raw);
    if (parsed.status === 'error') {
      // H2: an unreadable or incompatible file used to fail the load forever,
      // and `writeWithCas` re-read it before every save, so the board also
      // became permanently unwritable. Move it aside — nothing is deleted —
      // and open an empty board that can be edited and saved again. The
      // backup path travels back so the panel can say where the file went.
      if (parsed.error.kind === 'corrupted' || parsed.error.kind === 'invalid-document') {
        const backupPath = await this.moveAside(filePath, raw);
        const created = await this.createDefaultDocument(workspace, documentId, filePath);
        if (created.status === 'failed') return created;
        return {
          ...created,
          repair: {
            ...(backupPath ? { backupPath } : {}),
            backupReason: parsed.error.reason,
          },
        };
      }
      // `incompatible` is a future schema. Overwriting it would destroy work a
      // newer build can still read, so it stays a hard failure.
      return { status: 'failed', error: parsed.error };
    }
    const repair = parsed.skippedNodes > 0 || parsed.skippedEdges > 0
      ? { skippedNodes: parsed.skippedNodes, skippedEdges: parsed.skippedEdges }
      : undefined;
    return {
      status: 'loaded',
      document: parsed.document,
      ...(repair ? { repair } : {}),
    };
  }

  private async createDefaultDocument(
    workspace: InfiniteCanvasWorkspaceRef,
    documentId: string,
    filePath: string,
  ): Promise<InfiniteCanvasLoadResult> {
    const document: InfiniteCanvasDocument = {
      documentId,
      schemaVersion: INFINITE_CANVAS_SCHEMA_VERSION,
      workspaceId: workspace.workspaceId,
      revision: 1,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      updatedAt: this.now().toISOString(),
    };
    try {
      await this.port.ensureDirectory(infiniteCanvasDirectoryPath(workspace.workspacePath));
      await this.port.writeTextFileAtomic(filePath, serializeDocument(document));
    } catch (cause) {
      return {
        status: 'failed',
        error: { kind: 'io', reason: 'Failed to create the canvas document.', cause },
      };
    }
    return { status: 'created', document };
  }

  /**
   * Copies an unreadable file to a timestamped `.bak` next to it.
   *
   * A copy, not a rename: the port has no rename, and the caller overwrites
   * the original immediately afterwards. Best effort by design — failing to
   * take a backup must not also block the recovery.
   */
  private async moveAside(filePath: string, raw: string): Promise<string | undefined> {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.${stamp}.bak`;
    try {
      await this.port.writeTextFileAtomic(backupPath, raw);
      return backupPath;
    } catch {
      return undefined;
    }
  }

  /**
   * Compare-and-swap save. `document.revision` is the base revision the caller
   * loaded; a stale base is rejected as a typed conflict, never overwritten.
   */
  public async saveDocument(
    workspace: InfiniteCanvasWorkspaceRef,
    document: InfiniteCanvasDocument,
  ): Promise<InfiniteCanvasSaveResult> {
    const rejection = this.rejectRemote(workspace);
    if (rejection) return { status: 'failed', error: rejection };
    return this.writeWithCas(workspace, document, document.revision);
  }

  /**
   * Applies a content mutation to the in-memory truth and schedules one
   * coalesced CAS write for the idle window. The applied document is returned
   * immediately; the flush settles through {@link flushPendingWrites} or the
   * debounce timer.
   */
  public async mutateDefaultDocument(
    workspace: InfiniteCanvasWorkspaceRef,
    mutator: InfiniteCanvasMutator,
  ): Promise<InfiniteCanvasMutateResult> {
    const rejection = this.rejectRemote(workspace);
    if (rejection) return { status: 'failed', error: rejection };

    const documentId = defaultInfiniteCanvasDocumentId(workspace.workspaceId);
    const filePath = infiniteCanvasDocumentFilePath(workspace.workspacePath, documentId);

    const previous = this.mutationQueueByPath.get(filePath) ?? Promise.resolve();
    const run = previous.then(() => this.applyMutation(workspace, filePath, mutator));
    // The queue tail swallows failures so one failed mutation never wedges
    // the chain; each caller still observes its own result/rejection via run.
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.mutationQueueByPath.set(filePath, tail);
    void tail.then(() => {
      if (this.mutationQueueByPath.get(filePath) === tail) {
        this.mutationQueueByPath.delete(filePath);
      }
    });
    return run;
  }

  private async applyMutation(
    workspace: InfiniteCanvasWorkspaceRef,
    filePath: string,
    mutator: InfiniteCanvasMutator,
  ): Promise<InfiniteCanvasMutateResult> {
    // H1: a flush in progress still owns the truth for this path. Reading the
    // file underneath it would hand this mutation the pre-flush revision as
    // its base, and the two writes would then fight over the same slot — one
    // of them losing every edit it carried.
    const inFlight = this.inFlightByPath.get(filePath);
    if (inFlight) await inFlight;

    let pending = this.pendingByPath.get(filePath);
    if (!pending) {
      const loaded = await this.loadDefaultDocument(workspace);
      if (loaded.status === 'failed') {
        return { status: 'failed', error: loaded.error };
      }
      pending = {
        workspace,
        document: loaded.document,
        baseRevision: loaded.document.revision,
        timer: undefined,
        retries: 0,
      };
      this.pendingByPath.set(filePath, pending);
    }

    const mutated = mutator(pending.document);
    pending.document = {
      ...pending.document,
      nodes: mutated.nodes,
      edges: mutated.edges,
      viewport: mutated.viewport,
      // P3: the agent-ops watermark only moves when the mutator explicitly
      // returns it (applying a journal batch); plain mutations keep it as-is.
      ...(mutated.agentOps !== undefined ? { agentOps: mutated.agentOps } : {}),
      // K3 E4: same rule — the consumed-import record only moves when a
      // mutator explicitly returns it, and it is capped here so no caller has
      // to remember the bound.
      ...(mutated.consumedImportRequestIds !== undefined
        ? {
            consumedImportRequestIds: mutated.consumedImportRequestIds
              .slice(-INFINITE_CANVAS_CONSUMED_IMPORT_LIMIT),
          }
        : {}),
      // One coalesced flush produces one revision bump; keep the in-memory
      // revision at the base until the CAS write assigns the next one.
      revision: pending.baseRevision,
      updatedAt: this.now().toISOString(),
    };

    // Fresh work: the backoff earned by earlier failures starts over.
    pending.retries = 0;
    this.scheduleFlush(filePath, pending, this.debounceMs);

    return { status: 'applied', document: pending.document };
  }

  /** Forces all coalesced writes to disk now; resolves with their outcomes. */
  public async flushPendingWrites(): Promise<InfiniteCanvasSaveResult[]> {
    const paths = [...this.pendingByPath.keys()];
    const results: InfiniteCanvasSaveResult[] = [];
    for (const path of paths) {
      const result = await this.flushPath(path);
      if (result) results.push(result);
    }
    return results;
  }

  /** Cancels timers and drops pending state without writing. */
  public dispose(): void {
    for (const pending of this.pendingByPath.values()) {
      if (pending.timer !== undefined) clearTimeout(pending.timer);
    }
    this.pendingByPath.clear();
    this.mutationQueueByPath.clear();
    this.inFlightByPath.clear();
    this.failureListeners.clear();
  }

  /** Whether a coalesced write for this workspace is still waiting to land. */
  public hasPendingWrites(workspace?: InfiniteCanvasWorkspaceRef): boolean {
    if (!workspace) return this.pendingByPath.size > 0;
    const documentId = defaultInfiniteCanvasDocumentId(workspace.workspaceId);
    return this.pendingByPath.has(
      infiniteCanvasDocumentFilePath(workspace.workspacePath, documentId),
    );
  }

  private scheduleFlush(filePath: string, pending: PendingWrite, delayMs: number): void {
    if (pending.timer !== undefined) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      pending.timer = undefined;
      void this.flushPath(filePath);
    }, delayMs);
  }

  /**
   * H1: the pending entry survives the write.
   *
   * It used to be deleted BEFORE the CAS write was attempted, so a conflict or
   * an I/O failure threw away the only copy of the user's edits — silently,
   * because a debounced flush has nobody to report to. Now the entry is only
   * dropped once the bytes are on disk; anything else keeps it, schedules a
   * backoff retry, and tells the listeners.
   */
  private async flushPath(
    filePath: string,
  ): Promise<InfiniteCanvasSaveResult | undefined> {
    const inFlight = this.inFlightByPath.get(filePath);
    if (inFlight) await inFlight;

    const pending = this.pendingByPath.get(filePath);
    if (!pending) return undefined;
    if (pending.timer !== undefined) {
      clearTimeout(pending.timer);
      pending.timer = undefined;
    }

    const written = pending.document;
    const baseRevision = pending.baseRevision;
    const run = this.writeWithCas(pending.workspace, written, baseRevision);
    // Swallowed on the lock copy only; `run` still carries any rejection to
    // the caller below.
    this.inFlightByPath.set(filePath, run.then(() => undefined, () => undefined));

    let result: InfiniteCanvasSaveResult;
    try {
      result = await run;
    } catch (cause) {
      result = {
        status: 'failed',
        error: { kind: 'io', reason: 'Failed to write the canvas document.', cause },
      };
    } finally {
      this.inFlightByPath.delete(filePath);
    }

    const current = this.pendingByPath.get(filePath);
    if (result.status === 'saved') {
      if (current === pending) {
        if (current.document === written) {
          // Nothing arrived while the write was on the wire; the entry is done.
          if (current.timer !== undefined) clearTimeout(current.timer);
          this.pendingByPath.delete(filePath);
        } else {
          // Mutations landed on this entry mid-flight. They are already on top
          // of what was just written, so they only need the new base revision.
          current.baseRevision = result.document.revision;
          current.document = { ...current.document, revision: result.document.revision };
          current.retries = 0;
          if (current.timer === undefined) {
            this.scheduleFlush(filePath, current, this.debounceMs);
          }
        }
      }
      return result;
    }

    // Failure or conflict: the edits stay in memory and get another chance.
    const retrying = Boolean(current) && current!.retries < MAX_FLUSH_RETRIES;
    if (current && retrying) {
      current.retries += 1;
      const delay = FLUSH_RETRY_DELAYS_MS[
        Math.min(current.retries - 1, FLUSH_RETRY_DELAYS_MS.length - 1)
      ];
      this.scheduleFlush(filePath, current, delay);
    }
    this.emitPersistenceFailure({
      filePath,
      workspaceId: pending.workspace.workspaceId,
      retrying,
      outcome: result.status === 'conflict'
        ? {
          status: 'conflict',
          expectedRevision: result.expectedRevision,
          actualRevision: result.actualRevision,
        }
        : { status: 'failed', error: result.error },
    });
    return result;
  }

  private async writeWithCas(
    workspace: InfiniteCanvasWorkspaceRef,
    document: InfiniteCanvasDocument,
    baseRevision: number,
  ): Promise<InfiniteCanvasSaveResult> {
    const filePath = infiniteCanvasDocumentFilePath(
      workspace.workspacePath,
      document.documentId,
    );

    let raw: string | null;
    try {
      raw = await this.port.readTextFile(filePath);
    } catch (cause) {
      return {
        status: 'failed',
        error: { kind: 'io', reason: 'Failed to read the canvas document.', cause },
      };
    }

    let persistedRevision = 0;
    if (raw !== null) {
      const parsed = parseInfiniteCanvasDocument(raw);
      if (parsed.status === 'error') {
        // Never silently overwrite an unreadable or incompatible file.
        return { status: 'failed', error: parsed.error };
      }
      persistedRevision = parsed.document.revision;
    }

    if (persistedRevision !== baseRevision) {
      return {
        status: 'conflict',
        expectedRevision: baseRevision,
        actualRevision: persistedRevision,
      };
    }

    const next: InfiniteCanvasDocument = {
      ...document,
      revision: baseRevision + 1,
      updatedAt: this.now().toISOString(),
    };
    try {
      await this.port.ensureDirectory(infiniteCanvasDirectoryPath(workspace.workspacePath));
      await this.port.writeTextFileAtomic(filePath, serializeDocument(next));
    } catch (cause) {
      return {
        status: 'failed',
        error: { kind: 'io', reason: 'Failed to write the canvas document.', cause },
      };
    }
    return { status: 'saved', document: next };
  }

  private rejectRemote(
    workspace: InfiniteCanvasWorkspaceRef,
  ): InfiniteCanvasDocumentError | undefined {
    return workspace.backend === 'remote'
      ? { kind: 'unavailable', reason: REMOTE_UNAVAILABLE_REASON }
      : undefined;
  }
}

function serializeDocument(document: InfiniteCanvasDocument): string {
  return JSON.stringify(document, null, 2);
}
