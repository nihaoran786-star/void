/**
 * Agent ops-journal reconciliation for the Infinite Canvas (P3 W3, plan §2.2).
 *
 * The ops bridge only listens while the panel is mounted, so CanvasOp batches
 * accepted while the canvas was closed sit in the journal
 * (`.void/infinite-canvas/<documentId>.ops.json`, Rust's file — the front end
 * only ever READS it) with `seq > agentOps.appliedSeq`. After a document
 * load — and before the K2 W7 pending reconciliation — this module replays
 * those batches through the shared agent-ops pure functions, so an AI
 * instruction issued while the canvas was closed takes effect on next open.
 *
 * Fault tolerance: a missing, corrupted, or foreign journal is a typed no-op,
 * never a panel failure. Losing the journal loses nothing but "apply while
 * closed"; the AI or user simply re-issues the instruction.
 */
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentError,
  InfiniteCanvasWorkspaceRef,
} from '../document/InfiniteCanvasTypes';
import type { InfiniteCanvasDocumentService } from '../document/InfiniteCanvasDocumentService';
import type { InfiniteCanvasMediaJobReader } from '../media/InfiniteCanvasPendingReconciliation';
import { infiniteCanvasDirectoryPath } from '../document/InfiniteCanvasDocumentService';
import {
  applyCanvasAgentOpsBatchesContent,
  parseCanvasAgentOpsBatch,
  type AppliedCanvasAgentOpsBatch,
  type CanvasAgentOpsBatch,
} from './InfiniteCanvasAgentOps';

export function infiniteCanvasOpsJournalFilePath(
  workspacePath: string,
  documentId: string,
): string {
  return `${infiniteCanvasDirectoryPath(workspacePath)}/${documentId}.ops.json`;
}

export type InfiniteCanvasOpsReconciliationNoOpReason =
  /** No journal file exists yet: no agent ever issued a CanvasOp. */
  | 'journal_missing'
  /** The journal is not parseable JSON; treated as empty (plan §6-5). */
  | 'journal_corrupted'
  /** Parseable JSON that is not a journal (no batches array). */
  | 'journal_invalid'
  /** The journal names a different workspace; never applied (fail-closed). */
  | 'workspace_mismatch'
  /** The journal names a different document; never applied (fail-closed). */
  | 'document_mismatch'
  /** Every journaled batch is at or below the appliedSeq watermark. */
  | 'no_new_batches';

export type InfiniteCanvasOpsReconciliationResult =
  | {
    status: 'applied';
    appliedBatches: AppliedCanvasAgentOpsBatch[];
    document: InfiniteCanvasDocument;
  }
  | { status: 'no-op'; reason: InfiniteCanvasOpsReconciliationNoOpReason }
  | { status: 'error'; error: InfiniteCanvasDocumentError };

export interface InfiniteCanvasOpsReconciliationOptions {
  workspace: InfiniteCanvasWorkspaceRef;
  document: Readonly<InfiniteCanvasDocument>;
  /** Same read-only persistence-port shape the W7 reconciliation uses. */
  reader: InfiniteCanvasMediaJobReader;
  documentService: Pick<InfiniteCanvasDocumentService, 'mutateDefaultDocument'>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type JournalReadOutcome =
  | { status: 'ok'; batches: CanvasAgentOpsBatch[] }
  | { status: 'no-op'; reason: InfiniteCanvasOpsReconciliationNoOpReason };

function parseJournal(
  raw: string | null,
  workspaceId: string,
  documentId: string,
): JournalReadOutcome {
  if (raw === null) return { status: 'no-op', reason: 'journal_missing' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'no-op', reason: 'journal_corrupted' };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.batches)) {
    return { status: 'no-op', reason: 'journal_invalid' };
  }
  // Identity cross-check: a journal written for another workspace/document
  // must never be applied here, no matter how it ended up at this path.
  if (typeof parsed.workspaceId === 'string' && parsed.workspaceId !== workspaceId) {
    return { status: 'no-op', reason: 'workspace_mismatch' };
  }
  if (typeof parsed.documentId === 'string' && parsed.documentId !== documentId) {
    return { status: 'no-op', reason: 'document_mismatch' };
  }
  const batches: CanvasAgentOpsBatch[] = [];
  for (const entry of parsed.batches) {
    // A single unreadable batch entry is dropped, not the whole journal.
    const batch = parseCanvasAgentOpsBatch(entry);
    if (batch) batches.push(batch);
  }
  return { status: 'ok', batches };
}

/**
 * Replays journaled batches with `seq > agentOps.appliedSeq` onto the loaded
 * document, strictly seq-ascending, in ONE document mutation (content and
 * watermark land atomically). A document already at the journal head performs
 * no write at all.
 */
export async function reconcileInfiniteCanvasAgentOps(
  options: InfiniteCanvasOpsReconciliationOptions,
): Promise<InfiniteCanvasOpsReconciliationResult> {
  const { workspace, document, reader, documentService } = options;

  let raw: string | null;
  try {
    raw = await reader.readTextFile(
      infiniteCanvasOpsJournalFilePath(workspace.workspacePath, document.documentId),
    );
  } catch {
    raw = null;
  }
  const journal = parseJournal(raw, workspace.workspaceId, document.documentId);
  if (journal.status === 'no-op') return journal;

  const watermark = document.agentOps?.appliedSeq ?? 0;
  const pending = journal.batches.filter(batch => batch.seq > watermark);
  if (pending.length === 0) return { status: 'no-op', reason: 'no_new_batches' };

  let appliedBatches: AppliedCanvasAgentOpsBatch[] = [];
  const mutated = await documentService.mutateDefaultDocument(workspace, current => {
    // Re-applied against the LIVE document: batches the bridge landed between
    // load and this mutation are skipped by their seq inside the applier.
    const result = applyCanvasAgentOpsBatchesContent(current, pending);
    appliedBatches = result.appliedBatches;
    if (result.appliedBatches.length === 0) {
      return { nodes: current.nodes, edges: current.edges, viewport: current.viewport };
    }
    return result.content;
  });
  if (mutated.status === 'failed') {
    return { status: 'error', error: mutated.error };
  }
  if (appliedBatches.length === 0) {
    return { status: 'no-op', reason: 'no_new_batches' };
  }
  return { status: 'applied', appliedBatches, document: mutated.document };
}
