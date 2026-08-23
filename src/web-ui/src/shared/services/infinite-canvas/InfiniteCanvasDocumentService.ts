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
import { INFINITE_CANVAS_SCHEMA_VERSION } from './InfiniteCanvasTypes';
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

const CANVAS_IMAGE_OPERATION_KINDS: readonly CanvasImageOperationKind[] = [
  'upscale', 'expand', 'inpaint', 'erase', 'matting', 'generate',
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
  if (isNonEmptyString(value.stylePresetId)) node.stylePresetId = value.stylePresetId;
  if (typeof value.prompt === 'string') node.prompt = value.prompt;
  const derivedFrom = parseDerivedFrom(value.derivedFrom);
  if (derivedFrom) node.derivedFrom = derivedFrom;
  const generation = parseGeneration(value.generation);
  if (generation) node.generation = generation;
  // domainRef is a K3 reserved field: it is intentionally not read back in
  // phase 1, so no restore path can smuggle domain references in early.
  return node;
}

function parseEdge(value: unknown): InfiniteCanvasEdge | undefined {
  if (!isRecord(value)) return undefined;
  if (!isNonEmptyString(value.edgeId)
    || !isNonEmptyString(value.sourceNodeId)
    || !isNonEmptyString(value.targetNodeId)) {
    return undefined;
  }
  return {
    edgeId: value.edgeId,
    sourceNodeId: value.sourceNodeId,
    targetNodeId: value.targetNodeId,
  };
}

function parseViewport(value: unknown): InfiniteCanvasViewport | undefined {
  if (!isRecord(value)) return undefined;
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.zoom)) {
    return undefined;
  }
  return { x: value.x, y: value.y, zoom: value.zoom };
}

export type InfiniteCanvasParseResult =
  | { status: 'ok'; document: InfiniteCanvasDocument }
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
  const nodes: InfiniteCanvasNode[] = [];
  for (const rawNode of parsed.nodes) {
    const node = parseNode(rawNode);
    if (!node) {
      return {
        status: 'error',
        error: { kind: 'invalid-document', reason: 'Document contains an invalid node.' },
      };
    }
    nodes.push(node);
  }
  const edges: InfiniteCanvasEdge[] = [];
  for (const rawEdge of parsed.edges) {
    const edge = parseEdge(rawEdge);
    if (!edge) {
      return {
        status: 'error',
        error: { kind: 'invalid-document', reason: 'Document contains an invalid edge.' },
      };
    }
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
  return { status: 'ok', document };
}

interface PendingWrite {
  workspace: InfiniteCanvasWorkspaceRef;
  document: InfiniteCanvasDocument;
  /** Revision persisted at the time this coalescing window opened. */
  baseRevision: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

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

  public constructor(
    private readonly port: InfiniteCanvasPersistencePort,
    options: InfiniteCanvasDocumentServiceOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 800;
    this.now = options.now ?? (() => new Date());
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

    const parsed = parseInfiniteCanvasDocument(raw);
    if (parsed.status === 'error') {
      return { status: 'failed', error: parsed.error };
    }
    return { status: 'loaded', document: parsed.document };
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
      // One coalesced flush produces one revision bump; keep the in-memory
      // revision at the base until the CAS write assigns the next one.
      revision: pending.baseRevision,
      updatedAt: this.now().toISOString(),
    };

    if (pending.timer !== undefined) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      void this.flushPath(filePath);
    }, this.debounceMs);

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
  }

  private async flushPath(
    filePath: string,
  ): Promise<InfiniteCanvasSaveResult | undefined> {
    const pending = this.pendingByPath.get(filePath);
    if (!pending) return undefined;
    if (pending.timer !== undefined) clearTimeout(pending.timer);
    this.pendingByPath.delete(filePath);

    return this.writeWithCas(
      pending.workspace,
      pending.document,
      pending.baseRevision,
    );
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
