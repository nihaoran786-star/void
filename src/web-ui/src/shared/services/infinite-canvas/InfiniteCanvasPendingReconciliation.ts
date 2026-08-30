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
 * P4 review C4: cards the user "stopped waiting" on are scanned too. They are
 * `failed / cancelled` rather than pending, but the anchor is deliberately
 * intact and the job may still be running, so a completed batch must still
 * land in them after a reopen. They are only ever resolved, never re-failed.
 *
 * Writes go through `InfiniteCanvasDocumentService.mutateDefaultDocument`
 * like every other canvas mutation; the manifest is read through the same
 * persistence-port shape the document service uses. The never-overwrite
 * invariant holds: a node that already carries a mediaRef is never touched.
 */
import type { ImageToolErrorKind } from './ImageToolTypes';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentContent,
  InfiniteCanvasNode,
  InfiniteCanvasWorkspaceRef,
} from './InfiniteCanvasTypes';
import {
  normalizeCanvasWorkspacePath,
  type InfiniteCanvasDocumentService,
} from './InfiniteCanvasDocumentService';
import {
  resolveOperationBatchContent,
  type InfiniteCanvasBatchOutputItem,
} from './InfiniteCanvasGenerationContent';
import { infiniteCanvasGenerationAppendsToCard } from './InfiniteCanvasMediaVariants';

/** Read side of the persistence port; `null` when the file does not exist. */
export interface InfiniteCanvasMediaJobReader {
  readTextFile(path: string): Promise<string | null>;
}

export function mediaJobBatchFilePath(workspacePath: string, batchId: string): string {
  return `${normalizeCanvasWorkspacePath(workspacePath)}/.void/media-jobs/${batchId}.json`;
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
  /**
   * P4 W4: the whole batch, ascending by item index. A single item behaves
   * exactly like the pre-P4 single-path resolve; several items land item 1 in
   * the pending card and grow a derived card per remaining item — the same
   * deterministic ids the live media bridge would have used, so a batch that
   * finished while the canvas was closed comes back complete, not truncated
   * to its first image.
   */
  | { intent: 'resolve'; items: InfiniteCanvasBatchOutputItem[] }
  | { intent: 'fail'; errorKind: ImageToolErrorKind };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A card that "stopped waiting" is NOT settled: `stopWaitingContent` only
 * flipped it to `failed / cancelled` so it would stop spinning, and left the
 * anchor intact precisely so a late result could still land in it (PRD §6-R1 —
 * the money is spent either way). While the panel stays open the live media
 * bridge honours that. Reopening the canvas used to break the promise, because
 * this pass only ever looked at `status === 'pending'`.
 *
 * So the scan covers both: a pending card, and a stopped-waiting card that
 * still has no media and still knows its media job.
 */
function isStoppedWaiting(node: InfiniteCanvasNode): boolean {
  const generation = node.generation;
  return Boolean(
    generation
    && generation.status === 'failed'
    && generation.errorKind === 'cancelled'
    && (node.mediaRef === undefined || infiniteCanvasGenerationAppendsToCard(generation))
    && generation.batchId,
  );
}

function isReconcilable(node: InfiniteCanvasNode): boolean {
  // §7.6: a card that already holds pictures is still reconcilable when the
  // shot it is waiting on is an accumulating regenerate — that result appends
  // to the card's list, so there is nothing for the never-overwrite rule to
  // protect, and skipping it would leave the card spinning after a reopen.
  if (node.mediaRef !== undefined && !infiniteCanvasGenerationAppendsToCard(node.generation)) {
    return false;
  }
  return node.generation?.status === 'pending' || isStoppedWaiting(node);
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

/**
 * Every saved result of the batch manifest, ascending by 1-based item index
 * (assets first, items as the fallback for indices without an asset entry).
 * Mirrors the Rust `collect_infinite_canvas_output_items`: entries without a
 * derivable workspace-relative path are dropped, and a path is kept only once.
 */
function savedBatchOutputItems(
  batch: Record<string, unknown>,
): InfiniteCanvasBatchOutputItem[] {
  const items: InfiniteCanvasBatchOutputItem[] = [];
  const seenPaths = new Set<string>();
  for (const key of ['assets', 'items'] as const) {
    const entries = batch[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      const localPath = entry.local_path;
      if (typeof localPath !== 'string' || localPath.trim().length === 0) continue;
      const relativePath = generatedMediaRelativePath(localPath);
      if (!relativePath || seenPaths.has(relativePath)) continue;
      seenPaths.add(relativePath);
      const rawIndex = entry.item_index;
      const itemIndex = typeof rawIndex === 'number' && Number.isInteger(rawIndex) && rawIndex >= 1
        ? rawIndex
        : 1;
      items.push({ itemIndex, relativePath });
    }
  }
  return items.sort((left, right) => left.itemIndex - right.itemIndex);
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
    const items = batch ? savedBatchOutputItems(batch) : [];
    if (items.length > 0) return { intent: 'resolve', items };
    // Terminal batch without a saved asset can never land an image.
    return { intent: 'fail', errorKind: 'backend' };
  }
  if (status === 'timeout') return { intent: 'fail', errorKind: 'timeout' };
  if (status === 'failed') return { intent: 'fail', errorKind: 'backend' };
  return { intent: 'fail', errorKind: 'timeout' };
}

/**
 * Applies one operation's intent to the running content. Re-verified against
 * the latest document inside the mutator (same discipline as the media
 * bridge's `applyIntent`): an operation that is no longer pending — because
 * the live bridge got there first, or the card was deleted — is skipped
 * entirely, so the two lanes can never double-apply a batch.
 */
function applyIntent(
  document: Readonly<InfiniteCanvasDocument>,
  operationId: string,
  intent: ReconciliationIntent,
  workspacePath: string,
): InfiniteCanvasDocumentContent {
  const unchanged: InfiniteCanvasDocumentContent = {
    nodes: document.nodes,
    edges: document.edges,
    viewport: document.viewport,
  };
  const node = document.nodes.find(
    candidate => candidate.generation?.operationId === operationId,
  );
  if (!node || !isReconcilable(node)) return unchanged;
  if (intent.intent === 'resolve') {
    // Never-overwrite lives inside the shared batch resolver.
    return resolveOperationBatchContent(document, operationId, workspacePath, intent.items);
  }
  const generation = node.generation;
  if (!generation) return unchanged;
  return {
    ...unchanged,
    nodes: document.nodes.map((candidate): InfiniteCanvasNode => (
      candidate.nodeId === node.nodeId
        ? { ...candidate, generation: { ...generation, status: 'failed', errorKind: intent.errorKind } }
        : candidate
    )),
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

  const pendingNodes = document.nodes.filter(isReconcilable);
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
    // A stopped-waiting card is already settled as far as the user is
    // concerned: only a real result may still change it. Re-stamping it as
    // `timeout` because the job is still polling would throw away the honest
    // "you stopped waiting, the job is still running" state.
    if (intent.intent === 'fail' && isStoppedWaiting(node)) continue;
    intentsByOperationId.set(generation.operationId, intent);
    outcomes.push({
      operationId: generation.operationId,
      nodeId: node.nodeId,
      action: intent.intent === 'resolve' ? 'resolved' : 'failed',
      ...(intent.intent === 'fail' ? { errorKind: intent.errorKind } : {}),
    });
  }

  // Every scanned card turned out to need nothing (only stopped-waiting cards
  // with an unresolved job): no mutation, so no revision bump and no write.
  if (intentsByOperationId.size === 0) return { outcomes };

  const mutated = await documentService.mutateDefaultDocument(workspace, current => {
    // Folded one operation at a time: a batch resolve grows nodes AND edges,
    // so a single `nodes.map` no longer covers it.
    let content: InfiniteCanvasDocumentContent = {
      nodes: current.nodes,
      edges: current.edges,
      viewport: current.viewport,
    };
    for (const [operationId, intent] of intentsByOperationId) {
      content = applyIntent(
        { ...current, ...content },
        operationId,
        intent,
        workspace.workspacePath,
      );
    }
    return content;
  });

  if (mutated.status !== 'applied') return { outcomes };
  return { outcomes, document: mutated.document };
}
