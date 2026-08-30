/**
 * The board's one connection to its document: opening it, writing to it, and
 * stepping back through what was written.
 *
 * Everything above this — cards, editors, the generation lane — reaches the
 * canvas document through `commit` and nothing else. That single funnel is what
 * makes the three hard-won behaviours below expressible at all:
 *
 *  - H1: a coalesced write that never reached the disk says so out loud. The
 *    service keeps the edits and retries; this turns that into a line.
 *  - H2: a failed EDIT is not a failed BOARD. A transient I/O hiccup used to
 *    swap the whole canvas for an error page, unmounting every card and taking
 *    unsaved work with it. Now the board stays and the failure is a notice —
 *    and a board that genuinely failed to OPEN offers a second try.
 *  - C2: undo claims its entry before awaiting anything, so a held Ctrl+Z walks
 *    the stack one step at a time instead of replaying the same step twice.
 *
 * The projection itself is not here: the panel hands in `projectDocument`, so
 * this file never has an opinion about how a card looks.
 */
import React from 'react';

import { createLogger } from '@/shared/utils/logger';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentError,
  InfiniteCanvasDocumentService,
  InfiniteCanvasMediaBridgeEventBus,
  InfiniteCanvasMediaJobReader,
  InfiniteCanvasMutateResult,
  InfiniteCanvasMutator,
  InfiniteCanvasWorkspaceRef,
} from '@/shared/services/infinite-canvas';
import {
  connectInfiniteCanvasMediaBridgeToEventBus,
  connectInfiniteCanvasOpsBridgeToEventBus,
  createInfiniteCanvasMediaBridge,
  createInfiniteCanvasOpsBridge,
  reconcileInfiniteCanvasAgentOps,
  reconcilePendingInfiniteCanvasGenerations,
} from '@/shared/services/infinite-canvas';

import { getInfiniteCanvasMediaJobReader } from './infiniteCanvasDocumentGateway';
import {
  applyHistoryEntryContent,
  captureUserEdit,
  emptyInfiniteCanvasHistory,
  pushHistoryEntry,
  type InfiniteCanvasHistoryDirection,
  type InfiniteCanvasHistoryEntry,
  type InfiniteCanvasHistoryState,
} from './infiniteCanvasHistory';
import { settleResurrectedPendingContent } from './infiniteCanvasPanelModel';
import type { CanvasGenerationNotice } from './useCanvasGenerationDispatch';

const log = createLogger('InfiniteCanvasPanel');

export type InfiniteCanvasPanelState =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'failed'; error: InfiniteCanvasDocumentError };

export interface InfiniteCanvasDocumentDeps {
  workspaceId: string;
  workspaceRef: InfiniteCanvasWorkspaceRef;
  documentId: string;
  service: InfiniteCanvasDocumentService;
  mediaEventBus?: InfiniteCanvasMediaBridgeEventBus;
  mediaJobReader?: InfiniteCanvasMediaJobReader;
  /** The document as last projected; the panel owns the box and fills it. */
  documentRef: { readonly current: InfiniteCanvasDocument | undefined };
  /** Mirrors a document into the board's view state. */
  projectDocument: (document: InfiniteCanvasDocument) => void;
  /** Runs once per successful open, with the document as it will be shown. */
  onDocumentLoaded: (document: InfiniteCanvasDocument) => void;
  setNotice: (notice: CanvasGenerationNotice | null) => void;
}

export interface InfiniteCanvasDocumentLane {
  state: InfiniteCanvasPanelState;
  /** H2: opening a board is a read that usually succeeds on the second try. */
  retryLoad: () => void;
  commit: (
    mutator: InfiniteCanvasMutator,
    options?: { history?: boolean },
  ) => Promise<InfiniteCanvasDocument | undefined>;
  runHistory: (direction: InfiniteCanvasHistoryDirection) => Promise<void>;
  history: InfiniteCanvasHistoryState;
  /** C5: the stack belongs to one document and dies with it. */
  resetHistory: () => void;
}

export function useInfiniteCanvasDocument(
  deps: InfiniteCanvasDocumentDeps,
): InfiniteCanvasDocumentLane {
  const {
    workspaceId,
    workspaceRef,
    documentId,
    service,
    mediaEventBus,
    mediaJobReader,
    documentRef,
    projectDocument,
    onDocumentLoaded,
    setNotice,
  } = deps;

  const [state, setState] = React.useState<InfiniteCanvasPanelState>({ phase: 'loading' });
  /**
   * H2: bumping this re-runs the load effect. A board that failed to open is
   * usually a transient disk or IPC hiccup, and "close the tab and try again"
   * was the only exit — from a page that had already thrown the panel away.
   */
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const retryLoad = React.useCallback(() => setLoadAttempt(attempt => attempt + 1), []);

  /**
   * P4 W5: undo / redo stack. In panel memory only — closing the canvas
   * clears it, and nothing about it reaches the document or the disk.
   */
  const [history, setHistory] = React.useState(emptyInfiniteCanvasHistory);
  /**
   * P4 review C2: the stack as the KEYBOARD sees it.
   *
   * Holding Ctrl+Z fires key repeats far faster than React re-renders, so two
   * handlers used to run inside the same render closure, read the same top
   * entry, and replay it twice — the second replay rebased on a document that
   * had already moved on, was judged stale, and threw the whole undo stack
   * away. The ref is written synchronously, and `runHistory` claims its entry
   * before awaiting anything, so a key-repeat burst walks the stack one step
   * at a time instead of hammering the same step.
   */
  const historyRef = React.useRef(history);
  const applyHistoryState = React.useCallback((
    reducer: (state: InfiniteCanvasHistoryState) => InfiniteCanvasHistoryState,
  ) => {
    historyRef.current = reducer(historyRef.current);
    setHistory(historyRef.current);
  }, []);
  const resetHistory = React.useCallback(() => {
    historyRef.current = emptyInfiniteCanvasHistory();
    setHistory(historyRef.current);
  }, []);

  /**
   * P4 W5: `history: true` marks a commit as the user's own edit, and only
   * those go on the undo stack. Everything on the generation lane (dispatch,
   * retry, produced media landing, agent ops) and the viewport deliberately
   * commits without the flag — see plan §2.4 for why each is not undoable.
   */
  const commit = React.useCallback(async (
    mutator: InfiniteCanvasMutator,
    options: { history?: boolean } = {},
  ) => {
    let entry: InfiniteCanvasHistoryEntry | undefined;
    let result: InfiniteCanvasMutateResult;
    try {
      result = await service.mutateDefaultDocument(workspaceRef, current => {
        const next = mutator(current);
        // Diffed inside the mutator, i.e. inside the document service's
        // per-path queue, so the entry describes the edit as it really landed.
        if (options.history) entry = captureUserEdit(current, next);
        return next;
      });
    } catch (cause) {
      // H2: ~30 call sites fire this as `void commit(...)`. A mutator that
      // throws used to become an unhandled rejection nobody saw; commit now
      // absorbs it into the same visible notice as any other edit failure.
      log.error('Canvas edit threw while being applied', cause);
      result = {
        status: 'failed',
        error: { kind: 'io', reason: 'The canvas edit could not be applied.', cause },
      };
    }
    if (result.status === 'applied') {
      if (entry) applyHistoryState(state => pushHistoryEntry(state, entry!));
      projectDocument(result.document);
      // Returned so a caller that has already written bytes to disk can check
      // that the card it expected actually exists (review P12). Every other
      // caller ignores it, exactly as before.
      return result.document;
    }
    // H2: a failed edit is NOT a failed panel. This used to swap the whole
    // board for a static error page, unmounting every rendered card and
    // taking any unsaved work with it — one transient I/O hiccup was enough.
    // The board stays; the failure becomes a line the user can dismiss.
    log.warn('Canvas edit was not applied', result.error);
    setNotice({
      messageKey: 'infiniteCanvas.commitFailed',
      errorKind: 'backend',
    });
    return undefined;
  }, [applyHistoryState, projectDocument, service, setNotice, workspaceRef]);

  /** Applies the newest undo (or redo) entry, or discards a stale branch. */
  const runHistory = React.useCallback(async (
    direction: InfiniteCanvasHistoryDirection,
  ) => {
    const stack = direction === 'undo'
      ? historyRef.current.undo
      : historyRef.current.redo;
    const entry = stack[stack.length - 1];
    if (!entry) return;
    // Claim the entry up front (C2): whatever happens next, the next keypress
    // must see the step below it, never this one again.
    applyHistoryState(state => (direction === 'undo'
      ? { undo: state.undo.slice(0, -1), redo: state.redo }
      : { undo: state.undo, redo: state.redo.slice(0, -1) }));
    const giveBack = () => applyHistoryState(state => (direction === 'undo'
      ? { undo: [...state.undo, entry], redo: state.redo }
      : { undo: state.undo, redo: [...state.redo, entry] }));
    let stale = false;
    let result: InfiniteCanvasMutateResult;
    try {
      result = await service.mutateDefaultDocument(workspaceRef, current => {
        const applied = applyHistoryEntryContent(current, entry, direction);
        stale = applied.status === 'stale';
        if (applied.status !== 'applied') {
          return { nodes: current.nodes, edges: current.edges, viewport: current.viewport };
        }
        // P4 review P4: an undone deletion can bring a card back that was
        // still generating when it went. Its completion event was discarded
        // long ago, so it would spin forever; settle the resurrected ones.
        const before = new Set(current.nodes.map(node => node.nodeId));
        return settleResurrectedPendingContent(
          applied.content,
          applied.content.nodes
            .filter(node => !before.has(node.nodeId))
            .map(node => node.nodeId),
        );
      });
    } catch (cause) {
      result = {
        status: 'failed',
        error: { kind: 'io', reason: 'The canvas history step could not be applied.', cause },
      };
    }
    if (result.status === 'failed') {
      giveBack();
      // H2: undo/redo is a runtime edit like any other — it gives the entry
      // back and says so, instead of tearing the board down.
      log.warn('Canvas undo/redo was not applied', result.error);
      setNotice({ messageKey: 'infiniteCanvas.commitFailed', errorKind: 'backend' });
      return;
    }
    if (stale) {
      // This entry rebases on a document that has moved on; every older entry
      // in the same branch would rebase on top of that, so the branch goes.
      applyHistoryState(state => (direction === 'undo'
        ? { undo: [], redo: state.redo }
        : { undo: state.undo, redo: [] }));
      setNotice({ messageKey: 'infiniteCanvas.history.staleDiscarded' });
      return;
    }
    applyHistoryState(state => (direction === 'undo'
      ? { undo: state.undo, redo: [...state.redo, entry] }
      : { undo: [...state.undo, entry], redo: state.redo }));
    projectDocument(result.document);
  }, [applyHistoryState, projectDocument, service, setNotice, workspaceRef]);

  /** Re-projects the shared in-memory truth after bridge-side mutations. */
  const refreshFromService = React.useCallback(async () => {
    // H2: every caller fires this as `void refreshFromService()`. A re-read
    // that throws is a stale projection, never an unhandled rejection.
    try {
      const result = await service.loadDefaultDocument(workspaceRef);
      if (result.status !== 'failed') projectDocument(result.document);
    } catch (cause) {
      log.warn('Canvas re-projection after a bridge mutation failed', cause);
    }
  }, [projectDocument, service, workspaceRef]);

  React.useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    void service.loadDefaultDocument(workspaceRef).then(async result => {
      if (cancelled) return;
      if (result.status === 'failed') {
        setState({ phase: 'failed', error: result.error });
        return;
      }
      // H2: the loader repairs rather than refuses now — a card it could not
      // read is skipped, and a file it could not read at all is moved aside
      // to a `.bak`. Neither may happen quietly.
      if (result.repair) {
        log.warn('Canvas document was repaired while loading', result.repair);
        setNotice({
          messageKey: result.repair.backupPath
            ? 'infiniteCanvas.recovered.fromBackup'
            : 'infiniteCanvas.recovered.skippedCards',
          errorKind: 'invalid-input',
        });
      }
      // P3: replay agent CanvasOp batches journaled while the panel was
      // closed (ops reconciliation runs BEFORE the W7 pending reconciliation,
      // plan §2.2 — a journaled begin_generation must land its pending node
      // first so the pending pass can settle it).
      let document = result.document;
      const opsReconciled = await reconcileInfiniteCanvasAgentOps({
        workspace: workspaceRef,
        document,
        reader: mediaJobReader ?? getInfiniteCanvasMediaJobReader(),
        documentService: service,
      });
      if (cancelled) return;
      if (opsReconciled.status === 'applied') document = opsReconciled.document;
      // W7: reconcile generations that stayed pending while the panel was
      // closed (the bridge only listens while mounted) so no card can spin
      // forever — completed batches resolve, everything unknowable becomes a
      // retryable timeout failure.
      const reconciled = await reconcilePendingInfiniteCanvasGenerations({
        workspace: workspaceRef,
        document,
        reader: mediaJobReader ?? getInfiniteCanvasMediaJobReader(),
        documentService: service,
      });
      if (cancelled) return;
      if (reconciled.document) document = reconciled.document;
      projectDocument(document);
      onDocumentLoaded(document);
      setState({ phase: 'ready' });
    }).catch((cause: unknown) => {
      // H2: neither reconcile pass had a `.catch`. A rejection left the panel
      // stuck on the loading skeleton forever, with no way out and no words.
      if (cancelled) return;
      log.error('Canvas document failed to load', cause);
      setState({
        phase: 'failed',
        error: { kind: 'io', reason: 'Failed to open the canvas document.', cause },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    loadAttempt,
    mediaJobReader,
    onDocumentLoaded,
    projectDocument,
    service,
    setNotice,
    workspaceRef,
  ]);

  // The media bridge listens only while the panel is mounted (same trade-off
  // as the short-drama runtime bridge); W7 reconciliation covers the gap.
  React.useEffect(() => {
    if (state.phase !== 'ready') return undefined;
    const bridge = createInfiniteCanvasMediaBridge({
      workspace: workspaceRef,
      documentId,
      documentService: service,
      onResult: result => {
        if (result.status === 'applied') void refreshFromService();
      },
    });
    return connectInfiniteCanvasMediaBridgeToEventBus(bridge, mediaEventBus);
  }, [documentId, mediaEventBus, refreshFromService, service, state.phase, workspaceRef]);

  // P3: the agent ops bridge lands accepted CanvasOp receipts while the panel
  // is mounted; the load-time ops reconciliation above covers the gap (same
  // mounted-only trade-off as the media bridge).
  React.useEffect(() => {
    if (state.phase !== 'ready') return undefined;
    const bridge = createInfiniteCanvasOpsBridge({
      workspace: workspaceRef,
      documentId,
      documentService: service,
      onResult: result => {
        if (result.status === 'applied') void refreshFromService();
      },
      // P1: a batch whose landing mutation failed is replayed from the ops
      // journal (Rust's file, the front end only reads it) so a later batch
      // can never swallow it by advancing the watermark past it.
      scheduleReconciliation: () => {
        const document = documentRef.current;
        if (!document) return;
        void reconcileInfiniteCanvasAgentOps({
          workspace: workspaceRef,
          document,
          reader: mediaJobReader ?? getInfiniteCanvasMediaJobReader(),
          documentService: service,
        }).then(result => {
          if (result.status === 'applied') void refreshFromService();
        }).catch((cause: unknown) => {
          log.warn('Canvas agent-ops replay failed', cause);
        });
      },
    });
    return connectInfiniteCanvasOpsBridgeToEventBus(bridge, mediaEventBus);
  }, [
    documentId,
    documentRef,
    mediaEventBus,
    mediaJobReader,
    refreshFromService,
    service,
    state.phase,
    workspaceRef,
  ]);

  // Collapsing or closing the tab keeps state: the coalesced write is forced
  // to disk and the next mount reloads the same document from the module.
  React.useEffect(() => () => {
    void service.flushPendingWrites();
  }, [service]);

  /**
   * H1: a coalesced write that did not reach the disk says so.
   *
   * The debounced flush has no caller, so before this every conflict and
   * every I/O failure died inside a `void` expression while the pending
   * document was already gone — the one silent data-loss path on the board.
   * The service now keeps the edits and retries; this turns the same event
   * into a line the owner can actually see.
   */
  React.useEffect(() => {
    // Tests may inject a hand-rolled stand-in for the service; a missing
    // subscription must degrade to "no notice", never to a crashed board.
    if (typeof service.onPersistenceFailure !== 'function') return undefined;
    return service.onPersistenceFailure(failure => {
      if (failure.workspaceId !== workspaceId) return;
      setNotice({
        messageKey: failure.outcome.status === 'conflict'
          ? 'infiniteCanvas.persistence.conflict'
          : failure.retrying
            ? 'infiniteCanvas.persistence.retrying'
            : 'infiniteCanvas.persistence.failed',
        errorKind: 'backend',
      });
    });
  }, [service, setNotice, workspaceId]);

  return { state, retryLoad, commit, runHistory, history, resetHistory };
}
