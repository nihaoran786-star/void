/**
 * Residual-pending reconciliation for the Infinite Canvas (K2 W7, PRD §6-R1).
 *
 * The media bridge only listens while the panel is mounted, so a generation
 * that completes while the canvas is closed leaves its node stuck in
 * `generation.status === 'pending'`. After a document load, this module
 * reconciles every such node against the persisted media batch manifest
 * (`.void/media-jobs/<batchId>.json`, written by the Rust media pipeline):
 *
 * - batch completed with a saved asset  → resolve (fill mediaRef, clear generation)
 * - batch failed / terminal without asset → failed (`backend`)
 * - manifest missing, still polling, corrupted, or no batchId at all
 *   → failed (`timeout`), which the panel offers for retry — never an
 *   endless spinner.
 *
 * Writes go through `InfiniteCanvasDocumentService.mutateDefaultDocument`
 * like every other canvas mutation; the manifest is read through the same
 * persistence-port shape the document service uses. The never-overwrite
 * invariant holds: a node that already carries a mediaRef is never touched.
 */
import type { ImageToolErrorKind } from './ImageToolTypes';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasNode,
  InfiniteCanvasWorkspaceRef,
} from './InfiniteCanvasTypes';
import type { InfiniteCanvasDocumentService } from './InfiniteCanvasDocumentService';

/** Read side of the persistence port; `null` when the file does not exist. */
export interface InfiniteCanvasMediaJobReader {
  readTextFile(path: string): Promise<string | null>;
}

export function mediaJobBatchFilePath(workspacePath: string, batchId: string): string {
  const normalized = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '');
  return `${normalized}/.void/media-jobs/${batchId}.json`;
}

export interface InfiniteCanvasPendingReconciliationOutcome {
  operationId: string;
  nodeId: string;
  action: 'resolved' | 'failed';
  errorKind?: ImageToolErrorKind;
}

export interface InfiniteCanvasPendingReconciliationResult {
  outcomes: InfiniteCanvasPendingReconciliationOutcome[];
  /** The reconciled document, when at least one node changed. */
  document?: InfiniteCanvasDocument;
}

export interface InfiniteCanvasPendingReconciliationOptions {
  workspace: InfiniteCanvasWorkspaceRef;
  document: Readonly<InfiniteCanvasDocument>;
  reader: InfiniteCanvasMediaJobReader;
  documentService: Pick<InfiniteCanvasDocumentService, 'mutateDefaultDocument'>;
}

type ReconciliationIntent =
  | { intent: 'resolve'; relativePath: string }
  | { intent: 'fail'; errorKind: ImageToolErrorKind };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Mirrors the Rust `generated_media_relative_path`: the landing path is the
 * `media/generated/…` suffix of the saved asset's local path.
 */
function generatedMediaRelativePath(localPath: string): string | undefined {
  const normalized = localPath.replace(/\\/g, '/');
  const marker = '/media/generated/';
  const index = normalized.indexOf(marker);
  if (index >= 0) return normalized.slice(index + 1);
  if (normalized.startsWith('media/generated/')) return normalized;
  return undefined;
}

/** First saved local path in the batch manifest (assets first, then items). */
function firstSavedLocalPath(batch: Record<string, unknown>): string | undefined {
  for (const key of ['assets', 'items'] as const) {
    const entries = batch[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      const localPath = entry.local_path;
      if (typeof localPath === 'string' && localPath.trim().length > 0) {
        return localPath;
      }
    }
  }
  return undefined;
}

/** A batch id is used as a file name component; anything unusual times out. */
function isSafeBatchId(batchId: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(batchId);
}

/** Media kind the manifest declares (top level first, then `batch.kind`). */
function manifestMediaKind(parsed: Record<string, unknown>): 'image' | 'video' | undefined {
  const candidates = [
    parsed.kind,
    isRecord(parsed.batch) ? parsed.batch.kind : undefined,
  ];
  for (const candidate of candidates) {
    if (candidate === 'image' || candidate === 'video') return candidate;
  }
  return undefined;
}

function classifyManifest(
  raw: string | null,
  expectedMediaKind: 'image' | 'video',
): ReconciliationIntent {
  if (raw === null) {
    // The manifest never made it to disk: the job outcome is unknowable.
    return { intent: 'fail', errorKind: 'timeout' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupted manifest: tolerated as an unknown outcome, retryable.
    return { intent: 'fail', errorKind: 'timeout' };
  }
  if (!isRecord(parsed)) return { intent: 'fail', errorKind: 'timeout' };

  const status = typeof parsed.status === 'string' ? parsed.status : undefined;
  if (status === 'polling') {
    // Persisted before polling finished and never updated (e.g. app quit).
    return { intent: 'fail', errorKind: 'timeout' };
  }
  if (status === 'completed' || status === 'partial') {
    // C3: the W7 pass must honor the same media-kind gate as the live bridge
    // (P3 §3.5) — a manifest whose kind contradicts the registered
    // generation can never land its asset here; settle as a typed retryable
    // failure instead of resolving the wrong media into the card.
    const manifestKind = manifestMediaKind(parsed);
    if (manifestKind !== undefined && manifestKind !== expectedMediaKind) {
      return { intent: 'fail', errorKind: 'invalid-input' };
    }
    const batch = isRecord(parsed.batch) ? parsed.batch : undefined;
    const localPath = batch ? firstSavedLocalPath(batch) : undefined;
    const relativePath = localPath ? generatedMediaRelativePath(localPath) : undefined;
    if (relativePath) return { intent: 'resolve', relativePath };
    // Terminal batch without a saved asset can never land an image.
    return { intent: 'fail', errorKind: 'backend' };
  }
  if (status === 'timeout') return { intent: 'fail', errorKind: 'timeout' };
  if (status === 'failed') return { intent: 'fail', errorKind: 'backend' };
  return { intent: 'fail', errorKind: 'timeout' };
}

function applyIntent(
  node: InfiniteCanvasNode,
  intent: ReconciliationIntent,
  workspacePath: string,
): InfiniteCanvasNode {
  if (intent.intent === 'resolve') {
    if (node.mediaRef !== undefined) return node;
    const { generation: _cleared, ...rest } = node;
    return {
      ...rest,
      mediaRef: { workspacePath, relativePath: intent.relativePath },
    };
  }
  if (!node.generation) return node;
  return {
    ...node,
    generation: {
      ...node.generation,
      status: 'failed',
      errorKind: intent.errorKind,
    },
  };
}

/**
 * Reconciles every residual pending generation of an already-loaded document.
 * Returns the applied document when anything changed; a document with no
 * pending nodes is a cheap no-op that performs no reads and no writes.
 */
export async function reconcilePendingInfiniteCanvasGenerations(
  options: InfiniteCanvasPendingReconciliationOptions,
): Promise<InfiniteCanvasPendingReconciliationResult> {
  const { workspace, document, reader, documentService } = options;

  const pendingNodes = document.nodes.filter(
    node => node.generation?.status === 'pending',
  );
  if (pendingNodes.length === 0) return { outcomes: [] };

  const intentsByOperationId = new Map<string, ReconciliationIntent>();
  const outcomes: InfiniteCanvasPendingReconciliationOutcome[] = [];

  for (const node of pendingNodes) {
    const generation = node.generation!;
    const batchId = generation.batchId;
    let intent: ReconciliationIntent;
    if (!batchId || !isSafeBatchId(batchId)) {
      // The message went out but no media job was ever registered.
      intent = { intent: 'fail', errorKind: 'timeout' };
    } else {
      let raw: string | null;
      try {
        raw = await reader.readTextFile(
          mediaJobBatchFilePath(workspace.workspacePath, batchId),
        );
      } catch {
        raw = null;
      }
      intent = classifyManifest(
        raw,
        generation.mediaKind === 'video' ? 'video' : 'image',
      );
    }
    intentsByOperationId.set(generation.operationId, intent);
    outcomes.push({
      operationId: generation.operationId,
      nodeId: node.nodeId,
      action: intent.intent === 'resolve' ? 'resolved' : 'failed',
      ...(intent.intent === 'fail' ? { errorKind: intent.errorKind } : {}),
    });
  }

  const mutated = await documentService.mutateDefaultDocument(workspace, current => ({
    nodes: current.nodes.map(node => {
      const operationId = node.generation?.operationId;
      if (!operationId || node.generation?.status !== 'pending') return node;
      const intent = intentsByOperationId.get(operationId);
      return intent ? applyIntent(node, intent, workspace.workspacePath) : node;
    }),
    edges: current.edges,
    viewport: current.viewport,
  }));

  if (mutated.status !== 'applied') return { outcomes };
  return { outcomes, document: mutated.document };
}
