/**
 * Infinite Canvas panel (M3): the reactflow projection of the per-workspace
 * canvas document.
 *
 * The document truth lives in the infinite-canvas Domain Module; this panel
 * loads it once, mirrors it into reactflow view state, and routes every edit
 * back through DocumentService commands (coalesced CAS writes). The component
 * never persists anything itself.
 *
 * K2 (W6) closes the creation loop: all three entry points — blank-card
 * text-to-image, regenerate, and the five image tools — register a pending
 * generation first, then dispatch one task message through the session
 * gateway; the media bridge lands results back while the panel is mounted.
 */
import React from 'react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Clapperboard, ImagePlus, Redo2, Sparkles, Type, Undo2 } from 'lucide-react';

import { useI18n } from '@/infrastructure/i18n';
import type {
  ImageToolErrorKind,
  ImageToolId,
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentError,
  InfiniteCanvasDocumentService,
  InfiniteCanvasMediaBridgeEventBus,
  InfiniteCanvasMutator,
  SessionImageGenerationInvocation,
} from '@/shared/services/infinite-canvas';
import type {
  InfiniteCanvasGenerationParams,
  InfiniteCanvasMediaJobReader,
} from '@/shared/services/infinite-canvas';
import type { InfiniteCanvasGenerationTask } from './infiniteCanvasPanelModel';
import {
  summarizeInfiniteCanvasGenerationParams,
  connectInfiniteCanvasMediaBridgeToEventBus,
  connectInfiniteCanvasOpsBridgeToEventBus,
  createInfiniteCanvasMediaBridge,
  createInfiniteCanvasOpsBridge,
  defaultInfiniteCanvasDocumentId,
  reconcileInfiniteCanvasAgentOps,
  reconcilePendingInfiniteCanvasGenerations,
  referenceImageLabel,
} from '@/shared/services/infinite-canvas';
import type { StylePresetCatalog } from '@/shared/services/style-preset';
import { stylePresetCatalog } from '@/shared/services/style-preset';
import type { WorkspaceMediaLibraryService } from '@/shared/services/workspace-media/WorkspaceMediaTypes';
import { workspaceMediaLibraryService } from '@/shared/services/workspace-media/WorkspaceMediaLibrary';
import {
  getInfiniteCanvasDocumentService,
  getInfiniteCanvasMediaJobReader,
  getInfiniteCanvasMediaRevealer,
  getInfiniteCanvasMediaSaver,
  type InfiniteCanvasMediaRevealer,
  type InfiniteCanvasMediaSaver,
} from './infiniteCanvasDocumentGateway';
import {
  createInfiniteCanvasGenerationRuntime,
  type InfiniteCanvasGenerationRuntime,
} from './infiniteCanvasGenerationRuntime';
import {
  addImageNodeContent,
  addTextNodeContent,
  beginDerivedOperationContent,
  classifyDeletionTargets,
  collectGenerationTasks,
  connectNodesContent,
  createInfiniteCanvasId,
  failOperationContent,
  INFINITE_CANVAS_IMAGE_NODE_TYPE,
  INFINITE_CANVAS_TEXT_NODE_TYPE,
  INFINITE_CANVAS_VIDEO_NODE_TYPE,
  moveNodesContent,
  removeEdgesContent,
  type InfiniteCanvasDeletionSummary,
  type InfiniteCanvasNodeMove,
  removeFailedOperationContent,
  removeNodesContent,
  retryOperationContent,
  setNodeStylePresetContent,
  setNodeTextContent,
  setViewportContent,
  settleResurrectedPendingContent,
  stopWaitingContent,
  toFlowEdgeViews,
  toFlowNodeViews,
} from './infiniteCanvasPanelModel';
import {
  addBlankGenerationCardContent,
  addBlankVideoCardContent,
  beginSelfGenerationContent,
  collectReferenceNodes,
  setNodeGenerationParamsContent,
  setNodePromptContent,
} from './infiniteCanvasGenerationModel';
import { InfiniteCanvasParamsPopover } from './InfiniteCanvasParamsPopover';
import {
  InfiniteCanvasImageNode,
  InfiniteCanvasTextNode,
  InfiniteCanvasVideoNode,
  type InfiniteCanvasImagePreviewResolver,
  type InfiniteCanvasMediaRef,
} from './InfiniteCanvasNodes';
import {
  applyHistoryEntryContent,
  captureUserEdit,
  emptyInfiniteCanvasHistory,
  historyShortcutFor,
  isEditableTarget,
  pushHistoryEntry,
  type InfiniteCanvasHistoryDirection,
  type InfiniteCanvasHistoryEntry,
  type InfiniteCanvasHistoryState,
} from './infiniteCanvasHistory';
import { computeInfiniteCanvasHelperLines } from './infiniteCanvasHelperLines';
// The overlay lives in its own file whose name differs from the pure module
// by more than case: a case-only pair breaks resolution on Windows.
import { InfiniteCanvasHelperLines } from './InfiniteCanvasHelperLinesOverlay';
import {
  infiniteCanvasMediaFilePath,
  resolveInfiniteCanvasMediaPreviewUrl,
} from './infiniteCanvasPreviewResolver';
import {
  InfiniteCanvasMediaViewer,
  type InfiniteCanvasViewerItem,
} from './InfiniteCanvasMediaViewer';
import {
  clipboardSnapshotOrigin,
  copySelectionSnapshot,
  INFINITE_CANVAS_PASTE_OFFSET,
  pasteSnapshotContent,
  type InfiniteCanvasClipboardSnapshot,
} from './infiniteCanvasClipboard';
import { InfiniteCanvasConfirmDialog } from './InfiniteCanvasConfirmDialog';
import {
  InfiniteCanvasContextMenu,
  type InfiniteCanvasContextMenuAction,
  type InfiniteCanvasContextMenuState,
} from './InfiniteCanvasContextMenu';
import {
  InfiniteCanvasSelectionToolbar,
  type InfiniteCanvasSelectionAction,
} from './InfiniteCanvasSelectionToolbar';
import { InfiniteCanvasTaskQueuePanel } from './InfiniteCanvasTaskQueuePanel';
import { InfiniteCanvasImagePicker } from './InfiniteCanvasImagePicker';
import { InfiniteCanvasStylePicker } from './InfiniteCanvasStylePicker';
import { InfiniteCanvasToolInstructionDialog } from './InfiniteCanvasToolInstructionDialog';
import './InfiniteCanvasPanel.scss';

// The node renderers take their narrowed data props; reactflow's NodeTypes is
// keyed on the erased NodeProps shape, so the registration map is cast once.
const NODE_TYPES = {
  [INFINITE_CANVAS_TEXT_NODE_TYPE]: InfiniteCanvasTextNode,
  [INFINITE_CANVAS_IMAGE_NODE_TYPE]: InfiniteCanvasImageNode,
  [INFINITE_CANVAS_VIDEO_NODE_TYPE]: InfiniteCanvasVideoNode,
} as unknown as NodeTypes;

// Default preview lane: convertFileSrc over the joined absolute path — the
// same proven conversion the Workspace Media thumbnails and the canvas image
// picker use, so generated results display through one verified code path.
const defaultPreviewResolver: InfiniteCanvasImagePreviewResolver =
  resolveInfiniteCanvasMediaPreviewUrl;

/** P4 W6: any of the three adds to the selection (Windows and mac idioms). */
const MULTI_SELECTION_KEYS = ['Meta', 'Control', 'Shift'];

type PanelState =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'failed'; error: InfiniteCanvasDocumentError };

interface GenerationNotice {
  /** i18n key under the components namespace. */
  messageKey: string;
  errorKind?: ImageToolErrorKind;
}

interface ToolDialogRequest {
  nodeId: string;
  toolId: ImageToolId;
}

interface NodeActions {
  commitText: (nodeId: string, text: string) => void;
  commitPrompt: (nodeId: string, prompt: string) => void;
  generate: (nodeId: string) => void;
  openTool: (nodeId: string, toolId: ImageToolId) => void;
  retry: (nodeId: string) => void;
  removeFailed: (nodeId: string) => void;
  /** P3: derives a blank video card wired from an image card (image-to-video). */
  deriveVideoCard: (nodeId: string) => void;
  /** P4 W1: opens the full-screen viewer on this card's media. */
  openViewer: (nodeId: string) => void;
  /** P4 W3: opens the generation parameter popover for this card. */
  openParams: (nodeId: string) => void;
}

/** Ordered reference badge labels per target card (§3.2 edge-order discipline). */
function referenceLabelsByNode(
  document: Readonly<InfiniteCanvasDocument>,
): Map<string, string[]> {
  const labels = new Map<string, string[]>();
  for (const node of document.nodes) {
    if (node.kind !== 'image' && node.kind !== 'video') continue;
    const collected = collectReferenceNodes(document, node.nodeId);
    if (collected.status !== 'ok' || collected.references.length === 0) continue;
    labels.set(
      node.nodeId,
      collected.references.map(reference => referenceImageLabel(reference.order)),
    );
  }
  return labels;
}

export interface InfiniteCanvasPanelProps {
  workspaceId: string;
  workspacePath: string;
  isActive: boolean;
  /** Session that opened the canvas surface; preferred dispatch target. */
  sourceSessionId?: string;
  /** Injection seams for tests; production uses the shared singletons. */
  service?: InfiniteCanvasDocumentService;
  resolvePreviewUrl?: InfiniteCanvasImagePreviewResolver;
  mediaLibrary?: WorkspaceMediaLibraryService;
  catalog?: StylePresetCatalog;
  generationRuntime?: InfiniteCanvasGenerationRuntime;
  mediaEventBus?: InfiniteCanvasMediaBridgeEventBus;
  mediaJobReader?: InfiniteCanvasMediaJobReader;
  /**
   * P4 W1 "save a copy" port. Production binds the existing file-panel
   * download lane in `infiniteCanvasDocumentGateway`; tests inject a stub so
   * the panel never reaches for a Tauri plugin.
   */
  saveMediaAs?: InfiniteCanvasMediaSaver;
  /**
   * P4 W7 "show in folder" port. Production binds the workspace
   * `reveal_in_explorer` lane; tests inject a stub.
   */
  revealMediaIn?: InfiniteCanvasMediaRevealer;
}

export const InfiniteCanvasPanel: React.FC<InfiniteCanvasPanelProps> = ({
  workspaceId,
  workspacePath,
  sourceSessionId,
  service: injectedService,
  resolvePreviewUrl = defaultPreviewResolver,
  mediaLibrary = workspaceMediaLibraryService,
  catalog = stylePresetCatalog,
  generationRuntime: injectedRuntime,
  mediaEventBus,
  mediaJobReader,
  saveMediaAs,
  revealMediaIn,
}) => {
  const { t } = useI18n('components');
  const service = React.useMemo(
    () => injectedService ?? getInfiniteCanvasDocumentService(),
    [injectedService],
  );
  const workspaceRef = React.useMemo(
    () => ({ workspaceId, workspacePath, backend: 'local' as const }),
    [workspaceId, workspacePath],
  );
  const documentId = React.useMemo(
    () => defaultInfiniteCanvasDocumentId(workspaceId),
    [workspaceId],
  );
  const runtime = React.useMemo(
    () => injectedRuntime ?? createInfiniteCanvasGenerationRuntime({
      workspaceId,
      workspacePath,
      documentId,
      sourceSessionId,
      catalog,
    }),
    [catalog, documentId, injectedRuntime, sourceSessionId, workspaceId, workspacePath],
  );

  const [state, setState] = React.useState<PanelState>({ phase: 'loading' });
  const documentRef = React.useRef<InfiniteCanvasDocument | undefined>(undefined);
  const [flowNodes, setFlowNodes] = React.useState<Node[]>([]);
  const [flowEdges, setFlowEdges] = React.useState<Edge[]>([]);
  // P4 W9: the projected nodes as the drag handler sees them, so the snap
  // maths never re-creates the handler (and never restarts a drag).
  const flowNodesRef = React.useRef<Node[]>([]);
  flowNodesRef.current = flowNodes;
  const [helperLines, setHelperLines] = React.useState<{
    vertical?: number;
    horizontal?: number;
  }>({});
  // Last known pan/zoom, kept in a ref so panning never re-renders the panel.
  // The guides only ever draw while a node is dragging, and the viewport does
  // not move during a node drag, so this is exact when it is read.
  const viewportRef = React.useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [initialViewport, setInitialViewport] = React.useState<Viewport>({
    x: 0,
    y: 0,
    zoom: 1,
  });

  const [imagePickerOpen, setImagePickerOpen] = React.useState(false);
  const [stylePickerNodeId, setStylePickerNodeId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<GenerationNotice | null>(null);
  const [toolDialog, setToolDialog] = React.useState<ToolDialogRequest | null>(null);
  /** P4 W1: the card whose media the full-screen viewer is showing. */
  const [viewerNodeId, setViewerNodeId] = React.useState<string | null>(null);
  /** P4 W3: the card whose generation parameters are being edited. */
  const [paramsNodeId, setParamsNodeId] = React.useState<string | null>(null);
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
  /**
   * P4 W6: the current multi-selection, mirrored out of reactflow. Kept as a
   * ref as well so the keyboard listener never has to be re-registered (and
   * never reads a stale closure) while the user is selecting.
   */
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<string[]>([]);
  const selectedNodeIdsRef = React.useRef<string[]>([]);
  selectedNodeIdsRef.current = selectedNodeIds;
  /**
   * P4 review C3: the card whose retry is waiting for the "yes, charge me
   * again" confirmation. Only ever set for a card the user stopped waiting on.
   */
  const [retryConfirmNodeId, setRetryConfirmNodeId] = React.useState<string | null>(null);
  /** P4 W6: the pending deletion awaiting the one confirmation, if any. */
  const [deleteRequest, setDeleteRequest] =
    React.useState<InfiniteCanvasDeletionSummary | null>(null);
  /**
   * P4 W7: the app-private clipboard. Panel memory only — it is deliberately
   * not the system clipboard, and it dies with the panel.
   */
  const [clipboard, setClipboard] = React.useState<InfiniteCanvasClipboardSnapshot | null>(null);
  const clipboardRef = React.useRef<InfiniteCanvasClipboardSnapshot | null>(null);
  clipboardRef.current = clipboard;
  /** Cascades repeated pastes of the same clipboard instead of stacking them. */
  const pasteRunRef = React.useRef(0);
  /** P4 W7: the open right-click menu, if any. */
  const [contextMenu, setContextMenu] =
    React.useState<InfiniteCanvasContextMenuState | null>(null);
  /** Panel root, so the shortcut listener can tell whether focus is ours. */
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  /** The flow viewport wrapper; the menu and the selection bar are placed in it. */
  const flowRef = React.useRef<HTMLDivElement | null>(null);
  /**
   * P4 W8: the task queue, recomputed from the document on every projection.
   * No separate store and no separate subscription — see
   * `collectGenerationTasks`.
   */
  const [tasks, setTasks] = React.useState<InfiniteCanvasGenerationTask[]>([]);
  /**
   * The reactflow instance, captured on init. This is how "take me to this
   * card" pans the canvas without wrapping the panel in a ReactFlowProvider
   * and restructuring the overlays around hooks.
   */
  const flowInstanceRef = React.useRef<{
    setCenter?: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void;
  } | null>(null);

  // Node callbacks flow through this ref so projectDocument stays stable while
  // the handlers depend on it (same seam the M3 commitText path used).
  const nodeActionsRef = React.useRef<NodeActions>({
    commitText: () => undefined,
    commitPrompt: () => undefined,
    generate: () => undefined,
    openTool: () => undefined,
    retry: () => undefined,
    removeFailed: () => undefined,
    deriveVideoCard: () => undefined,
    openViewer: () => undefined,
    openParams: () => undefined,
  });

  const openStylePicker = React.useCallback((nodeId: string) => {
    setStylePickerNodeId(nodeId);
  }, []);

  const projectDocument = React.useCallback((document: InfiniteCanvasDocument) => {
    documentRef.current = document;
    setTasks(collectGenerationTasks(document));
    const referenceLabels = referenceLabelsByNode(document);
    setFlowNodes(toFlowNodeViews(document.nodes).map(view => ({
      id: view.id,
      type: view.type,
      position: view.position,
      data: view.type === INFINITE_CANVAS_TEXT_NODE_TYPE
        ? {
            text: view.data.text ?? '',
            onCommitText: (nodeId: string, text: string) => (
              nodeActionsRef.current.commitText(nodeId, text)
            ),
          }
        : {
            mediaRef: view.data.mediaRef,
            prompt: view.data.prompt,
            generation: view.data.generation,
            derivedFrom: view.data.derivedFrom,
            referenceLabels: referenceLabels.get(view.id) ?? [],
            resolvePreviewUrl,
            onCommitPrompt: (nodeId: string, prompt: string) => (
              nodeActionsRef.current.commitPrompt(nodeId, prompt)
            ),
            onGenerate: (nodeId: string) => nodeActionsRef.current.generate(nodeId),
            onRetryGeneration: (nodeId: string) => nodeActionsRef.current.retry(nodeId),
            onRemoveFailedGeneration: (nodeId: string) => (
              nodeActionsRef.current.removeFailed(nodeId)
            ),
            ...(view.data.mediaRef
              ? {
                  onOpenViewer: (nodeId: string) => (
                    nodeActionsRef.current.openViewer(nodeId)
                  ),
                }
              : {}),
            // P4 W3: every generation-capable card carries the parameter
            // entry; the pill shows the collapsed choice, if any.
            generationParams: view.data.generationParams,
            generationParamsSummary: summarizeInfiniteCanvasGenerationParams(
              view.data.generationParams,
              view.type === INFINITE_CANVAS_VIDEO_NODE_TYPE ? 'video' : 'image',
            ),
            onOpenParams: (nodeId: string) => nodeActionsRef.current.openParams(nodeId),
            // The image-only surface (style preset, five tools, derive-video)
            // stays off the P3-minimal video card.
            ...(view.type === INFINITE_CANVAS_IMAGE_NODE_TYPE
              ? {
                  stylePresetId: view.data.stylePresetId,
                  stylePresetName: view.data.stylePresetId
                    ? catalog.getById(view.data.stylePresetId)?.name
                    : undefined,
                  onOpenStylePicker: openStylePicker,
                  onRunImageTool: (nodeId: string, toolId: ImageToolId) => (
                    nodeActionsRef.current.openTool(nodeId, toolId)
                  ),
                  onDeriveVideoCard: (nodeId: string) => (
                    nodeActionsRef.current.deriveVideoCard(nodeId)
                  ),
                }
              : {}),
          },
    })));
    setFlowEdges(toFlowEdgeViews(document.edges));
  }, [catalog, openStylePicker, resolvePreviewUrl]);

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
    const result = await service.mutateDefaultDocument(workspaceRef, current => {
      const next = mutator(current);
      // Diffed inside the mutator, i.e. inside the document service's
      // per-path queue, so the entry describes the edit as it really landed.
      if (options.history) entry = captureUserEdit(current, next);
      return next;
    });
    if (result.status === 'applied') {
      if (entry) applyHistoryState(state => pushHistoryEntry(state, entry!));
      projectDocument(result.document);
    } else {
      setState({ phase: 'failed', error: result.error });
    }
  }, [applyHistoryState, projectDocument, service, workspaceRef]);

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
    const result = await service.mutateDefaultDocument(workspaceRef, current => {
      const applied = applyHistoryEntryContent(current, entry, direction);
      stale = applied.status === 'stale';
      if (applied.status !== 'applied') {
        return { nodes: current.nodes, edges: current.edges, viewport: current.viewport };
      }
      // P4 review P4: an undone deletion can bring a card back that was still
      // generating when it went. Its completion event was discarded long ago,
      // so it would spin forever; settle the resurrected ones instead.
      const before = new Set(current.nodes.map(node => node.nodeId));
      return settleResurrectedPendingContent(
        applied.content,
        applied.content.nodes
          .filter(node => !before.has(node.nodeId))
          .map(node => node.nodeId),
      );
    });
    if (result.status === 'failed') {
      giveBack();
      setState({ phase: 'failed', error: result.error });
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
  }, [applyHistoryState, projectDocument, service, workspaceRef]);

  /** Re-projects the shared in-memory truth after bridge-side mutations. */
  const refreshFromService = React.useCallback(async () => {
    const result = await service.loadDefaultDocument(workspaceRef);
    if (result.status !== 'failed') projectDocument(result.document);
  }, [projectDocument, service, workspaceRef]);

  // —— P4 W6: the single deletion gate ——————————————————————————————————————

  /**
   * Every user-facing deletion — the Delete key, the selection toolbar, the
   * context menu, and reactflow's own remove change — arrives here.
   *
   * Plain cards (blank, text, failed placeholders) go straight through: asking
   * about those would be noise. As soon as one card carries an image or is
   * mid-generation the whole batch waits for one confirmation that says what
   * is going and that the files stay in the media library.
   *
   * This gate is the USER's; the AI-side protection (P3: agent ops may not
   * delete a card that carries media) is a separate check in the ops bridge
   * and is unaffected by anything here.
   */
  const deleteNodesNow = React.useCallback((nodeIds: readonly string[]) => {
    if (nodeIds.length === 0) return;
    const ids = [...nodeIds];
    // One mutation for the whole batch — `removeNodesContent` cascades the
    // edges — so a multi-card delete is also a single undo entry.
    void commit(document => removeNodesContent(document, ids), { history: true });
  }, [commit]);

  const requestDeleteNodes = React.useCallback((nodeIds: readonly string[]) => {
    const document = documentRef.current;
    if (!document) return;
    const summary = classifyDeletionTargets(document, nodeIds);
    if (summary.nodeIds.length === 0) return;
    if (!summary.requiresConfirmation) {
      deleteNodesNow(summary.nodeIds);
      return;
    }
    setDeleteRequest(summary);
  }, [deleteNodesNow]);

  const confirmDeleteRequest = React.useCallback(() => {
    const request = deleteRequest;
    setDeleteRequest(null);
    if (request) deleteNodesNow(request.nodeIds);
  }, [deleteNodesNow, deleteRequest]);

  // —— P4 W7: copy / paste / duplicate ——————————————————————————————————————

  /**
   * Copying a card with a picture copies the REFERENCE, not the file: the copy
   * points at the same file in the media library. See `infiniteCanvasClipboard`
   * for why (and for the field white list).
   */
  const copyNodes = React.useCallback((nodeIds: readonly string[]) => {
    const document = documentRef.current;
    if (!document) return false;
    const snapshot = copySelectionSnapshot(document, nodeIds);
    if (!snapshot) return false;
    setClipboard(snapshot);
    pasteRunRef.current = 0;
    return true;
  }, []);

  const pasteSnapshot = React.useCallback((
    snapshot: InfiniteCanvasClipboardSnapshot,
    offset: { x: number; y: number },
  ) => {
    void commit(
      document => pasteSnapshotContent(document, snapshot, {
        offset,
        createId: createInfiniteCanvasId,
      }).content,
      { history: true },
    );
  }, [commit]);

  /**
   * Ctrl+V, or "paste" from the empty-canvas menu. Without a target position
   * repeated pastes cascade instead of stacking on one spot.
   */
  const pasteClipboard = React.useCallback((at?: { x: number; y: number }) => {
    const snapshot = clipboardRef.current;
    if (!snapshot || snapshot.nodes.length === 0) return;
    if (at) {
      const origin = clipboardSnapshotOrigin(snapshot);
      pasteSnapshot(snapshot, { x: at.x - origin.x, y: at.y - origin.y });
      return;
    }
    pasteRunRef.current += 1;
    const step = INFINITE_CANVAS_PASTE_OFFSET * pasteRunRef.current;
    pasteSnapshot(snapshot, { x: step, y: step });
  }, [pasteSnapshot]);

  /** Duplicate = copy + paste in one move, and it never touches the clipboard. */
  const duplicateNodes = React.useCallback((nodeIds: readonly string[]) => {
    const document = documentRef.current;
    if (!document) return;
    const snapshot = copySelectionSnapshot(document, nodeIds);
    if (!snapshot) return;
    pasteSnapshot(snapshot, {
      x: INFINITE_CANVAS_PASTE_OFFSET,
      y: INFINITE_CANVAS_PASTE_OFFSET,
    });
  }, [pasteSnapshot]);

  // —— Generation dispatch (three entries, one lane) ————————————————————————

  /** Generation-capable cards: image (K2) and video (P3) share one lane. */
  const findMediaNode = React.useCallback((nodeId: string) => {
    const document = documentRef.current;
    const node = document?.nodes.find(candidate => candidate.nodeId === nodeId);
    if (!document || !node || (node.kind !== 'image' && node.kind !== 'video')) {
      return undefined;
    }
    return { document, node };
  }, []);

  const findImageNode = React.useCallback((nodeId: string) => {
    const found = findMediaNode(nodeId);
    return found?.node.kind === 'image' ? found : undefined;
  }, [findMediaNode]);

  /**
   * Sends one already-registered pending operation through the gateway and
   * rolls the pending state back to a typed failure when dispatch fails.
   */
  const submitOperation = React.useCallback(async (
    invocation: SessionImageGenerationInvocation,
  ) => {
    // Catch-all included: an unexpected throw out of the gateway must also
    // roll the already-registered pending card back to a retryable typed
    // failure — a pending card with no in-flight task would spin forever.
    let errorKind: ImageToolErrorKind | undefined;
    try {
      const result = await runtime.gateway.invoke(invocation);
      if (result.status === 'failed') {
        errorKind = result.error?.kind ?? 'backend';
      }
    } catch {
      errorKind = 'backend';
    }
    if (errorKind !== undefined) {
      const failedKind = errorKind;
      await commit(document => failOperationContent(
        document,
        invocation.operationId,
        failedKind,
      ));
      setNotice({
        messageKey: `infiniteCanvas.generation.errorKind.${failedKind}`,
        errorKind: failedKind,
      });
    }
  }, [commit, runtime]);

  /** Shared pre-dispatch gate: prompt, ordered references, target session. */
  const prepareDispatch = React.useCallback((
    document: Readonly<InfiniteCanvasDocument>,
    referenceTargetNodeId: string,
    prompt: string,
  ) => {
    if (!prompt.trim()) {
      setNotice({ messageKey: 'infiniteCanvas.generation.promptRequired' });
      return undefined;
    }
    const collected = collectReferenceNodes(document, referenceTargetNodeId);
    if (collected.status === 'error') {
      setNotice({
        messageKey: collected.error.kind === 'reference-not-image'
          ? 'infiniteCanvas.video.referenceNotSupported'
          : 'infiniteCanvas.generation.referenceNotReady',
      });
      return undefined;
    }
    if (!runtime.hasTargetSession()) {
      setNotice({ messageKey: 'infiniteCanvas.generation.noSession' });
      return undefined;
    }
    setNotice(null);
    return collected.references;
  }, [runtime]);

  const generateForNode = React.useCallback(async (nodeId: string) => {
    const found = findMediaNode(nodeId);
    if (!found) return;
    const { document, node } = found;
    if (node.generation?.status === 'pending') return;
    // P3: a video card dispatches through the same lane, marked 'video' —
    // the message routes to GenerateVideo, the binding carries mediaKind.
    const mediaKind = node.kind === 'video' ? 'video' as const : 'image' as const;
    const prompt = (node.prompt ?? '').trim();
    const references = prepareDispatch(document, nodeId, prompt);
    if (!references) return;

    // P4 W3: the card's own parameters ride along; the gateway clamps them
    // once more against the model's allow list before the request goes out.
    const generationParams = node.generationParams;

    const operationId = createInfiniteCanvasId('op');
    if (node.mediaRef === undefined) {
      // Blank card first shot: the result lands in the card itself.
      await commit(current => beginSelfGenerationContent(current, nodeId, operationId, {
        mediaKind,
      }));
      await submitOperation({
        operationId,
        kind: 'generate',
        mediaKind,
        resultMode: 'self',
        nodeId,
        prompt,
        stylePresetId: node.stylePresetId,
        references,
        ...(generationParams ? { generationParams } : {}),
      });
      return;
    }

    // Regenerate on a card that already has media: derive a new card; the
    // source card and its mediaRef are never touched.
    const derivedNodeId = createInfiniteCanvasId('node');
    const edgeId = createInfiniteCanvasId('edge');
    await commit(current => {
      const begun = beginDerivedOperationContent(
        current,
        nodeId,
        'generate',
        operationId,
        derivedNodeId,
        edgeId,
        { mediaKind },
      );
      const withPrompt = setNodePromptContent(
        { ...current, ...begun },
        derivedNodeId,
        prompt,
      );
      // The placeholder inherits the source card's parameters, so a retry or
      // a further regenerate from it keeps the same settings.
      return setNodeGenerationParamsContent(
        { ...current, ...withPrompt },
        derivedNodeId,
        generationParams,
      );
    });
    await submitOperation({
      operationId,
      kind: 'generate',
      mediaKind,
      resultMode: 'derived',
      nodeId: derivedNodeId,
      sourceNodeId: nodeId,
      prompt,
      stylePresetId: node.stylePresetId,
      references,
      ...(generationParams ? { generationParams } : {}),
    });
  }, [commit, findMediaNode, prepareDispatch, submitOperation]);

  const confirmToolInstruction = React.useCallback(async (instruction: string) => {
    const request = toolDialog;
    setToolDialog(null);
    if (!request) return;
    const found = findImageNode(request.nodeId);
    if (!found) return;
    const { document, node } = found;
    if (!node.mediaRef) return;
    const references = prepareDispatch(document, request.nodeId, instruction);
    if (!references) return;

    const operationId = createInfiniteCanvasId('op');
    const derivedNodeId = createInfiniteCanvasId('node');
    const edgeId = createInfiniteCanvasId('edge');
    await commit(current => {
      const begun = beginDerivedOperationContent(
        current,
        request.nodeId,
        request.toolId,
        operationId,
        derivedNodeId,
        edgeId,
      );
      return setNodePromptContent({ ...current, ...begun }, derivedNodeId, instruction);
    });
    await submitOperation({
      operationId,
      kind: request.toolId,
      resultMode: 'derived',
      nodeId: derivedNodeId,
      sourceNodeId: request.nodeId,
      prompt: instruction,
      stylePresetId: node.stylePresetId,
      references,
      editTargetMediaRef: node.mediaRef,
    });
  }, [commit, findImageNode, prepareDispatch, submitOperation, toolDialog]);

  const retryGeneration = React.useCallback(async (
    nodeId: string,
    options: { confirmedRespend?: boolean } = {},
  ) => {
    const found = findMediaNode(nodeId);
    if (!found) return;
    const { document, node } = found;
    const generation = node.generation;
    if (!generation || generation.status !== 'failed') return;

    // P4 review C3: "stop waiting" is not a cancel — the original job is very
    // likely still running and still billed, and the retry takes a NEW
    // operationId, which un-anchors that first result: the user would pay
    // twice and keep one picture. Nobody may walk into that by accident, so
    // this one retry asks first (and "retry every failed one" skips these
    // rows entirely).
    if (generation.errorKind === 'cancelled' && !options.confirmedRespend) {
      setRetryConfirmNodeId(nodeId);
      return;
    }

    const isDerived = generation.resultMode === 'derived';
    const sourceNodeId = node.derivedFrom?.sourceNodeId;
    const source = sourceNodeId
      ? document.nodes.find(candidate => candidate.nodeId === sourceNodeId)
      : undefined;
    if (isDerived && (!sourceNodeId || !source)) {
      setNotice({ messageKey: 'infiniteCanvas.generation.errorKind.invalid-input' });
      return;
    }
    if (isDerived && generation.toolId !== 'generate' && !source?.mediaRef) {
      setNotice({ messageKey: 'infiniteCanvas.generation.errorKind.invalid-input' });
      return;
    }

    const prompt = (node.prompt ?? '').trim();
    const referenceTargetNodeId = isDerived ? sourceNodeId! : nodeId;
    const references = prepareDispatch(document, referenceTargetNodeId, prompt);
    if (!references) return;

    const nextOperationId = createInfiniteCanvasId('op');
    await commit(current => retryOperationContent(
      current,
      generation.operationId,
      nextOperationId,
    ));
    await submitOperation({
      operationId: nextOperationId,
      kind: generation.toolId,
      // P3: the retry keeps the registered media kind — a failed video
      // generation re-arms as a video task, never as an image one.
      ...(generation.mediaKind ? { mediaKind: generation.mediaKind } : {}),
      resultMode: generation.resultMode,
      nodeId,
      ...(isDerived ? { sourceNodeId } : {}),
      prompt,
      stylePresetId: isDerived ? source?.stylePresetId : node.stylePresetId,
      references,
      // A retry re-sends the card's own parameters; a card that never had
      // any (e.g. a five-tool placeholder) still sends none.
      ...(node.generationParams ? { generationParams: node.generationParams } : {}),
      ...(isDerived && generation.toolId !== 'generate' && source?.mediaRef
        ? { editTargetMediaRef: source.mediaRef }
        : {}),
    });
  }, [commit, findMediaNode, prepareDispatch, submitOperation]);

  React.useEffect(() => {
    nodeActionsRef.current = {
      commitText: (nodeId, text) => {
        void commit(document => setNodeTextContent(document, nodeId, text), { history: true });
      },
      commitPrompt: (nodeId, prompt) => {
        void commit(document => setNodePromptContent(document, nodeId, prompt), { history: true });
      },
      generate: nodeId => {
        void generateForNode(nodeId);
      },
      openTool: (nodeId, toolId) => {
        const found = findImageNode(nodeId);
        if (!found?.node.mediaRef) return;
        setToolDialog({ nodeId, toolId });
      },
      retry: nodeId => {
        void retryGeneration(nodeId);
      },
      removeFailed: nodeId => {
        const found = findMediaNode(nodeId);
        const operationId = found?.node.generation?.operationId;
        if (!operationId) return;
        void commit(document => removeFailedOperationContent(document, operationId));
      },
      deriveVideoCard: nodeId => {
        // Image-to-video entry: wire a blank video card to the image card;
        // the user writes the camera-move prompt on the video card and
        // generates from there (the edge makes the image its reference).
        const found = findImageNode(nodeId);
        if (!found?.node.mediaRef) return;
        const source = found.node;
        const videoNodeId = createInfiniteCanvasId('node');
        const edgeId = createInfiniteCanvasId('edge');
        void commit(document => {
          const withCard = addBlankVideoCardContent(document, videoNodeId, {
            x: source.position.x + (source.size?.width ?? 0) + 360,
            y: source.position.y + 80,
          });
          return connectNodesContent(
            { ...document, ...withCard },
            edgeId,
            nodeId,
            videoNodeId,
          );
        }, { history: true });
      },
      openViewer: nodeId => {
        const found = findMediaNode(nodeId);
        if (!found?.node.mediaRef) return;
        setViewerNodeId(nodeId);
      },
      openParams: nodeId => {
        if (!findMediaNode(nodeId)) return;
        setParamsNodeId(current => (current === nodeId ? null : nodeId));
      },
    };
  }, [commit, findImageNode, findMediaNode, generateForNode, retryGeneration]);

  /**
   * P4 review C5 (plan §265): every piece of panel memory is scoped to ONE
   * document. Switching workspaces used to keep the undo stack and the
   * clipboard, so a Ctrl+Z in workspace B could re-insert a card deleted in
   * workspace A — mediaRef and all, pointing at A's files. Anything that
   * remembers nodes by id is therefore dropped the moment the document
   * changes; the document itself is reloaded by the effect below.
   */
  React.useEffect(() => {
    historyRef.current = emptyInfiniteCanvasHistory();
    setHistory(historyRef.current);
    clipboardRef.current = null;
    setClipboard(null);
    pasteRunRef.current = 0;
    selectedNodeIdsRef.current = [];
    setSelectedNodeIds([]);
    setContextMenu(null);
    setDeleteRequest(null);
    setViewerNodeId(null);
    setParamsNodeId(null);
    setStylePickerNodeId(null);
    setNotice(null);
    setToolDialog(null);
  }, [documentId, workspaceId]);

  React.useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    void service.loadDefaultDocument(workspaceRef).then(async result => {
      if (cancelled) return;
      if (result.status === 'failed') {
        setState({ phase: 'failed', error: result.error });
        return;
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
      setInitialViewport(document.viewport);
      viewportRef.current = document.viewport;
      setState({ phase: 'ready' });
    });
    return () => {
      cancelled = true;
    };
  }, [mediaJobReader, projectDocument, service, workspaceRef]);

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
        });
      },
    });
    return connectInfiniteCanvasOpsBridgeToEventBus(bridge, mediaEventBus);
  }, [
    documentId,
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

  // P4 W5: Ctrl/Cmd+Z and Ctrl+Shift+Z / Ctrl+Y. The listener sits on the
  // window (reactflow's pane is not always the focused element) but only acts
  // when focus is inside this panel or nowhere in particular, so a canvas in a
  // background tab never steals another surface's undo. Typing inside a
  // prompt box keeps the browser's own text undo.
  React.useEffect(() => {
    if (state.phase !== 'ready') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const root = panelRef.current;
      const active = window.document.activeElement;
      const ours = Boolean(root) && (
        active === null
        || active === window.document.body
        || Boolean(root?.contains(active))
      );
      if (!ours) return;
      const action = historyShortcutFor(event);
      if (action) {
        event.preventDefault();
        void runHistory(action);
        return;
      }
      // P4 W6: reactflow's own delete handling is switched off
      // (`deleteKeyCode={null}`) so the key lands here and goes through the
      // one gate that can insert a confirmation.
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const selected = selectedNodeIdsRef.current;
        if (selected.length === 0) return;
        event.preventDefault();
        requestDeleteNodes(selected);
        return;
      }
      // P4 W7: copy / paste / duplicate. Same handlers the menu and the
      // selection toolbar call, so there is only one implementation each.
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      const selected = selectedNodeIdsRef.current;
      if (key === 'c') {
        if (selected.length === 0) return;
        event.preventDefault();
        copyNodes(selected);
        return;
      }
      if (key === 'd') {
        if (selected.length === 0) return;
        event.preventDefault();
        duplicateNodes(selected);
        return;
      }
      if (key === 'v') {
        if (!clipboardRef.current) return;
        event.preventDefault();
        pasteClipboard();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    copyNodes,
    duplicateNodes,
    pasteClipboard,
    requestDeleteNodes,
    runHistory,
    state.phase,
  ]);

  /** P4 W6: reactflow's selection, mirrored into panel state. */
  const onSelectionChange = React.useCallback((selection: { nodes?: { id: string }[] }) => {
    const ids = (selection.nodes ?? []).map(node => node.id);
    setSelectedNodeIds(current => (
      current.length === ids.length && current.every((id, index) => id === ids[index])
        ? current
        : ids
    ));
  }, []);

  const onNodesChange = React.useCallback((rawChanges: NodeChange[]) => {
    // P4 W9: a single in-flight drag gets nudged onto its neighbours before
    // reactflow applies it. Multi-node drags (changes.length > 1) are left
    // alone on purpose — "which node aligns" has no honest answer there.
    let changes = rawChanges;
    let lines: { vertical?: number; horizontal?: number } = {};
    const drag = rawChanges.length === 1 && rawChanges[0].type === 'position'
      ? rawChanges[0]
      : undefined;
    if (drag && drag.dragging === true && drag.position) {
      const nodes = flowNodesRef.current;
      const dragged = nodes.find(node => node.id === drag.id);
      const measured = dragged?.measured;
      const snapped = computeInfiniteCanvasHelperLines(
        {
          id: drag.id,
          position: drag.position,
          width: measured?.width,
          height: measured?.height,
        },
        nodes.map(node => ({
          id: node.id,
          position: node.position,
          width: node.measured?.width,
          height: node.measured?.height,
        })),
      );
      // Convert to panel pixels here so the overlay stays a dumb renderer
      // and the panel needs no ReactFlowProvider.
      const { x: panX, y: panY, zoom } = viewportRef.current;
      lines = {
        ...(snapped.verticalLine === undefined
          ? {}
          : { vertical: snapped.verticalLine * zoom + panX }),
        ...(snapped.horizontalLine === undefined
          ? {}
          : { horizontal: snapped.horizontalLine * zoom + panY }),
      };
      changes = [{ ...drag, position: snapped.position }];
    }
    setHelperLines(current => (
      current.vertical === lines.vertical && current.horizontal === lines.horizontal
        ? current
        : lines
    ));

    const removedIds = changes
      .filter(change => change.type === 'remove')
      .map(change => change.id);
    // P4 W6: a removal is not applied to the view here — it goes through the
    // deletion gate, and a cancelled confirmation must leave the card exactly
    // where it was. The commit's re-projection is what makes cards disappear.
    setFlowNodes(nodes => applyNodeChanges(
      removedIds.length > 0 ? changes.filter(change => change.type !== 'remove') : changes,
      nodes,
    ));
    if (removedIds.length > 0) requestDeleteNodes(removedIds);

    // P4 W6: one drag of a multi-selection arrives as several position changes
    // in the same frame; they land in ONE mutation (and one undo entry).
    const moves: InfiniteCanvasNodeMove[] = [];
    for (const change of changes) {
      if (change.type === 'position' && change.dragging === false && change.position) {
        moves.push({ nodeId: change.id, position: change.position });
      }
    }
    if (moves.length > 0) {
      void commit(document => moveNodesContent(document, moves), { history: true });
    }
  }, [commit, requestDeleteNodes]);

  const onEdgesChange = React.useCallback((changes: EdgeChange[]) => {
    setFlowEdges(edges => applyEdgeChanges(changes, edges));
    const removedIds = changes
      .filter(change => change.type === 'remove')
      .map(change => change.id);
    if (removedIds.length > 0) {
      void commit(document => removeEdgesContent(document, removedIds), { history: true });
    }
  }, [commit]);

  const onConnect = React.useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const { source, target } = connection;
    void commit(document => connectNodesContent(
      document,
      createInfiniteCanvasId('edge'),
      source,
      target,
    ), { history: true });
  }, [commit]);

  const onMove = React.useCallback((_event: unknown, viewport: Viewport) => {
    // Ref only: pan/zoom must not re-render the panel on every frame.
    viewportRef.current = viewport;
  }, []);

  const onMoveEnd = React.useCallback((_event: unknown, viewport: Viewport) => {
    viewportRef.current = viewport;
    void commit(document => setViewportContent(document, viewport));
  }, [commit]);

  const nextSpawnPosition = React.useCallback(() => {
    const document = documentRef.current;
    const viewport = document?.viewport ?? { x: 0, y: 0, zoom: 1 };
    const cascade = (document?.nodes.length ?? 0) % 8;
    return {
      x: (-viewport.x + 120) / viewport.zoom + cascade * 32,
      y: (-viewport.y + 120) / viewport.zoom + cascade * 32,
    };
  }, []);

  const onAddText = React.useCallback(() => {
    const position = nextSpawnPosition();
    void commit(document => addTextNodeContent(
      document,
      createInfiniteCanvasId('node'),
      position,
    ), { history: true });
  }, [commit, nextSpawnPosition]);

  const onAddGenerationCard = React.useCallback(() => {
    const position = nextSpawnPosition();
    void commit(document => addBlankGenerationCardContent(
      document,
      createInfiniteCanvasId('node'),
      position,
    ), { history: true });
  }, [commit, nextSpawnPosition]);

  const onAddVideoCard = React.useCallback(() => {
    const position = nextSpawnPosition();
    void commit(document => addBlankVideoCardContent(
      document,
      createInfiniteCanvasId('node'),
      position,
    ), { history: true });
  }, [commit, nextSpawnPosition]);

  const onPickImage = React.useCallback((mediaRef: InfiniteCanvasMediaRef) => {
    const position = nextSpawnPosition();
    setImagePickerOpen(false);
    void commit(document => addImageNodeContent(
      document,
      createInfiniteCanvasId('node'),
      position,
      mediaRef,
    ), { history: true });
  }, [commit, nextSpawnPosition]);

  const onPickStyle = React.useCallback((presetId: string | undefined) => {
    const nodeId = stylePickerNodeId;
    setStylePickerNodeId(null);
    if (!nodeId) return;
    void commit(document => setNodeStylePresetContent(document, nodeId, presetId), { history: true });
  }, [commit, stylePickerNodeId]);

  // —— P4 W1: full-screen viewer + save a copy ——————————————————————————————

  /** Every media-bearing card, in document order: the viewer's walk order. */
  const viewerItems = React.useMemo<InfiniteCanvasViewerItem[]>(() => flowNodes
    .filter(node => (
      node.type === INFINITE_CANVAS_IMAGE_NODE_TYPE
      || node.type === INFINITE_CANVAS_VIDEO_NODE_TYPE
    ) && Boolean(node.data?.mediaRef))
    .map(node => ({
      nodeId: node.id,
      mediaRef: node.data.mediaRef as InfiniteCanvasMediaRef,
      mediaKind: node.type === INFINITE_CANVAS_VIDEO_NODE_TYPE
        ? 'video' as const
        : 'image' as const,
    })), [flowNodes]);

  // A card can lose its media (deleted card) while the viewer is open; the
  // overlay closes itself rather than showing a stale frame.
  React.useEffect(() => {
    if (!viewerNodeId) return;
    if (!viewerItems.some(item => item.nodeId === viewerNodeId)) setViewerNodeId(null);
  }, [viewerItems, viewerNodeId]);

  const onSaveMediaAs = React.useCallback((item: InfiniteCanvasViewerItem) => {
    // The source is the absolute media path — never a data URL: the file
    // transfer lane copies bytes on the Rust side, so large videos are safe.
    const filePath = infiniteCanvasMediaFilePath(item.mediaRef);
    const port = saveMediaAs ?? getInfiniteCanvasMediaSaver();
    void Promise.resolve()
      .then(() => port(filePath))
      .catch(() => {
        setNotice({ messageKey: 'infiniteCanvas.viewer.saveFailed' });
      });
  }, [saveMediaAs]);

  // —— P4 W3: generation parameters ————————————————————————————————————————

  /**
   * The card the popover is editing, if it still exists and still qualifies.
   * Read off the projection (not documentRef) so the popover re-renders as
   * soon as a written parameter comes back through the document.
   */
  const paramsTarget = React.useMemo(() => {
    if (!paramsNodeId) return undefined;
    const node = flowNodes.find(entry => entry.id === paramsNodeId);
    if (!node
      || (node.type !== INFINITE_CANVAS_IMAGE_NODE_TYPE
        && node.type !== INFINITE_CANVAS_VIDEO_NODE_TYPE)) {
      return undefined;
    }
    return {
      mediaKind: node.type === INFINITE_CANVAS_VIDEO_NODE_TYPE ? 'video' as const : 'image' as const,
      params: node.data.generationParams as InfiniteCanvasGenerationParams | undefined,
    };
  }, [flowNodes, paramsNodeId]);

  React.useEffect(() => {
    if (paramsNodeId && !paramsTarget) setParamsNodeId(null);
  }, [paramsNodeId, paramsTarget]);

  const onChangeGenerationParams = React.useCallback((params: InfiniteCanvasGenerationParams) => {
    const nodeId = paramsNodeId;
    if (!nodeId) return;
    void commit(document => setNodeGenerationParamsContent(document, nodeId, params), { history: true });
  }, [commit, paramsNodeId]);

  // —— P4 W7: right-click menu and the selection toolbar ————————————————————

  const onRevealMedia = React.useCallback((nodeId: string) => {
    const found = findMediaNode(nodeId);
    if (!found?.node.mediaRef) return;
    const filePath = infiniteCanvasMediaFilePath(found.node.mediaRef);
    const port = revealMediaIn ?? getInfiniteCanvasMediaRevealer();
    void Promise.resolve()
      .then(() => port(filePath))
      .catch(() => {
        setNotice({ messageKey: 'infiniteCanvas.menu.revealFailed' });
      });
  }, [findMediaNode, revealMediaIn]);

  /** Screen pixels → canvas units, from the last known pan/zoom. */
  const toFlowPosition = React.useCallback((clientX: number, clientY: number) => {
    const rect = flowRef.current?.getBoundingClientRect();
    const { x, y, zoom } = viewportRef.current;
    return {
      x: (clientX - (rect?.left ?? 0) - x) / zoom,
      y: (clientY - (rect?.top ?? 0) - y) / zoom,
    };
  }, []);

  const openContextMenu = React.useCallback((
    event: { clientX: number; clientY: number; preventDefault: () => void },
    base: Omit<InfiniteCanvasContextMenuState, 'x' | 'y' | 'flowPosition'>,
  ) => {
    event.preventDefault();
    const rect = flowRef.current?.getBoundingClientRect();
    setContextMenu({
      ...base,
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
      flowPosition: toFlowPosition(event.clientX, event.clientY),
    });
  }, [toFlowPosition]);

  const onNodeContextMenu = React.useCallback((
    event: { clientX: number; clientY: number; preventDefault: () => void },
    node: { id: string },
  ) => {
    // Right-clicking inside a multi-selection acts on the whole selection —
    // otherwise the menu would silently narrow to one card.
    if (selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id)) {
      openContextMenu(event, { kind: 'selection', selectionCount: selectedNodeIds.length });
      return;
    }
    const found = findMediaNode(node.id);
    openContextMenu(event, {
      kind: 'node',
      nodeId: node.id,
      hasMedia: Boolean(found?.node.mediaRef),
      canGenerate: Boolean(found),
    });
  }, [findMediaNode, openContextMenu, selectedNodeIds]);

  const onSelectionContextMenu = React.useCallback((
    event: { clientX: number; clientY: number; preventDefault: () => void },
    nodes: { id: string }[],
  ) => {
    openContextMenu(event, { kind: 'selection', selectionCount: nodes.length });
  }, [openContextMenu]);

  const onPaneContextMenu = React.useCallback((
    event: { clientX: number; clientY: number; preventDefault: () => void },
  ) => {
    openContextMenu(event, { kind: 'pane' });
  }, [openContextMenu]);

  /**
   * One dispatcher for every menu item. Each branch calls exactly the handler
   * the equivalent shortcut or toolbar button calls.
   */
  const onContextMenuAction = React.useCallback((action: InfiniteCanvasContextMenuAction) => {
    const menu = contextMenu;
    setContextMenu(null);
    if (!menu) return;
    const targets = menu.kind === 'selection'
      ? selectedNodeIds
      : menu.nodeId
        ? [menu.nodeId]
        : [];
    switch (action) {
      case 'view':
        if (menu.nodeId) nodeActionsRef.current.openViewer(menu.nodeId);
        return;
      case 'save-as': {
        const item = viewerItems.find(entry => entry.nodeId === menu.nodeId);
        if (item) onSaveMediaAs(item);
        return;
      }
      case 'reveal':
        if (menu.nodeId) onRevealMedia(menu.nodeId);
        return;
      case 'params':
        if (menu.nodeId) nodeActionsRef.current.openParams(menu.nodeId);
        return;
      case 'copy':
        copyNodes(targets);
        return;
      case 'duplicate':
        duplicateNodes(targets);
        return;
      case 'delete':
        requestDeleteNodes(targets);
        return;
      case 'add-text':
        void commit(document => addTextNodeContent(
          document,
          createInfiniteCanvasId('node'),
          menu.flowPosition,
        ), { history: true });
        return;
      case 'add-image-card':
        void commit(document => addBlankGenerationCardContent(
          document,
          createInfiniteCanvasId('node'),
          menu.flowPosition,
        ), { history: true });
        return;
      case 'add-video-card':
        void commit(document => addBlankVideoCardContent(
          document,
          createInfiniteCanvasId('node'),
          menu.flowPosition,
        ), { history: true });
        return;
      case 'paste':
        pasteClipboard(menu.flowPosition);
    }
  }, [
    commit,
    contextMenu,
    copyNodes,
    duplicateNodes,
    onRevealMedia,
    onSaveMediaAs,
    pasteClipboard,
    requestDeleteNodes,
    selectedNodeIds,
    viewerItems,
  ]);

  const onSelectionToolbarAction = React.useCallback((
    action: InfiniteCanvasSelectionAction,
  ) => {
    if (action === 'copy') copyNodes(selectedNodeIds);
    else if (action === 'duplicate') duplicateNodes(selectedNodeIds);
    else requestDeleteNodes(selectedNodeIds);
  }, [copyNodes, duplicateNodes, requestDeleteNodes, selectedNodeIds]);

  // Any press outside the menu dismisses it, the way a native menu behaves.
  React.useEffect(() => {
    if (!contextMenu) return undefined;
    const onPointerDown = (event: Event) => {
      const target = event.target;
      if (target instanceof window.HTMLElement && target.closest('.infinite-canvas-menu')) return;
      setContextMenu(null);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('mousedown', onPointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('mousedown', onPointerDown, true);
    };
  }, [contextMenu]);

  // —— P4 W8: task queue actions ————————————————————————————————————————————

  /**
   * "Stop waiting" is not a cancel and must never be presented as one: the
   * backend has no cancellation entry point, the remote job carries on, and
   * the quota is spent. All this does is stop the card from spinning and make
   * it retryable. If the result arrives later it still lands in this card —
   * the anchor operationId is intact and the card still has no media — and
   * that is on purpose.
   */
  const onStopWaiting = React.useCallback((operationId: string) => {
    // Not a user edit: leaving it off the undo stack keeps undo from
    // "resurrecting" a wait for a task nobody is waiting on any more.
    void commit(document => stopWaitingContent(document, operationId));
  }, [commit]);

  const onRetryAllFailed = React.useCallback(async () => {
    const document = documentRef.current;
    if (!document) return;
    const failed = collectGenerationTasks(document).filter(task => (
      task.status === 'failed'
      // C3: a stopped-waiting row is excluded — its original job may still be
      // running and paid for, so re-spending on it is never a bulk decision.
      && task.errorKind !== 'cancelled'
    ));
    // Serial on purpose: a burst of retries would be a burst of spend.
    for (const task of failed) {
      await retryGeneration(task.nodeId);
    }
  }, [retryGeneration]);

  const confirmRetryRespend = React.useCallback(() => {
    const nodeId = retryConfirmNodeId;
    setRetryConfirmNodeId(null);
    if (nodeId) void retryGeneration(nodeId, { confirmedRespend: true });
  }, [retryConfirmNodeId, retryGeneration]);

  const onLocateNode = React.useCallback((nodeId: string) => {
    const node = flowNodesRef.current.find(candidate => candidate.id === nodeId);
    if (!node) return;
    const width = node.measured?.width ?? 0;
    const height = node.measured?.height ?? 0;
    flowInstanceRef.current?.setCenter?.(
      node.position.x + width / 2,
      node.position.y + height / 2,
      { zoom: viewportRef.current.zoom, duration: 200 },
    );
  }, []);

  const stylePickerCurrentPresetId = React.useMemo(() => {
    if (!stylePickerNodeId) return undefined;
    return documentRef.current?.nodes
      .find(node => node.nodeId === stylePickerNodeId)?.stylePresetId;
  }, [stylePickerNodeId]);

  if (state.phase === 'failed') {
    return (
      <div
        className="infinite-canvas-panel infinite-canvas-panel--error"
        data-canvas-surface-state="error"
        data-error-kind={state.error.kind}
        role="alert"
      >
        <h3>{t('infiniteCanvas.title')}</h3>
        <p>{t('infiniteCanvas.loadFailed')}</p>
      </div>
    );
  }

  if (state.phase === 'loading') {
    return (
      <div
        className="infinite-canvas-panel infinite-canvas-panel--loading"
        data-canvas-surface-state="loading"
        role="status"
      >
        <p>{t('infiniteCanvas.skeleton')}</p>
      </div>
    );
  }

  return (
    <div className="infinite-canvas-panel" data-canvas-surface-state="ready" ref={panelRef}>
      <div className="infinite-canvas-panel__toolbar" role="toolbar">
        <button
          type="button"
          className="infinite-canvas-panel__toolbar-button"
          onClick={onAddText}
        >
          <Type size={14} aria-hidden="true" />
          {t('infiniteCanvas.toolbar.addText')}
        </button>
        <button
          type="button"
          className="infinite-canvas-panel__toolbar-button"
          onClick={() => setImagePickerOpen(open => !open)}
        >
          <ImagePlus size={14} aria-hidden="true" />
          {t('infiniteCanvas.toolbar.addImage')}
        </button>
        <button
          type="button"
          className="infinite-canvas-panel__toolbar-button"
          onClick={onAddGenerationCard}
        >
          <Sparkles size={14} aria-hidden="true" />
          {t('infiniteCanvas.toolbar.addGenerationCard')}
        </button>
        <button
          type="button"
          className="infinite-canvas-panel__toolbar-button"
          data-toolbar-action="add-video-card"
          onClick={onAddVideoCard}
        >
          <Clapperboard size={14} aria-hidden="true" />
          {t('infiniteCanvas.toolbar.addVideoCard')}
        </button>
        <button
          type="button"
          className="infinite-canvas-panel__toolbar-button"
          data-toolbar-action="undo"
          disabled={history.undo.length === 0}
          title={t('infiniteCanvas.history.undoHint')}
          onClick={() => {
            void runHistory('undo');
          }}
        >
          <Undo2 size={14} aria-hidden="true" />
          {t('infiniteCanvas.history.undo')}
        </button>
        <button
          type="button"
          className="infinite-canvas-panel__toolbar-button"
          data-toolbar-action="redo"
          disabled={history.redo.length === 0}
          title={t('infiniteCanvas.history.redoHint')}
          onClick={() => {
            void runHistory('redo');
          }}
        >
          <Redo2 size={14} aria-hidden="true" />
          {t('infiniteCanvas.history.redo')}
        </button>
      </div>
      {notice ? (
        <div
          className="infinite-canvas-panel__tool-notice"
          role="alert"
          data-error-kind={notice.errorKind}
        >
          <strong>{t('infiniteCanvas.generation.noticeTitle')}</strong>
          <span>{t(notice.messageKey)}</span>
          <button
            type="button"
            className="infinite-canvas-panel__tool-notice-dismiss"
            onClick={() => setNotice(null)}
          >
            {t('infiniteCanvas.tools.dismiss')}
          </button>
        </div>
      ) : null}
      {imagePickerOpen ? (
        <InfiniteCanvasImagePicker
          workspacePath={workspacePath}
          mediaLibrary={mediaLibrary}
          onPick={onPickImage}
          onClose={() => setImagePickerOpen(false)}
        />
      ) : null}
      {stylePickerNodeId ? (
        <InfiniteCanvasStylePicker
          currentPresetId={stylePickerCurrentPresetId}
          catalog={catalog}
          onPick={onPickStyle}
          onClose={() => setStylePickerNodeId(null)}
        />
      ) : null}
      {paramsTarget ? (
        <InfiniteCanvasParamsPopover
          mediaKind={paramsTarget.mediaKind}
          params={paramsTarget.params}
          onChange={onChangeGenerationParams}
          onClose={() => setParamsNodeId(null)}
        />
      ) : null}
      {deleteRequest ? (
        <InfiniteCanvasConfirmDialog
          summary={deleteRequest}
          onConfirm={confirmDeleteRequest}
          onCancel={() => setDeleteRequest(null)}
        />
      ) : null}
      {retryConfirmNodeId ? (
        <div
          className="infinite-canvas-dialog infinite-canvas-dialog--confirm"
          role="dialog"
          aria-label={t('infiniteCanvas.tasks.retryCancelled.title')}
          data-canvas-confirm="retry-cancelled"
          data-canvas-confirm-node={retryConfirmNodeId}
        >
          <div className="infinite-canvas-dialog__header">
            <h4>{t('infiniteCanvas.tasks.retryCancelled.title')}</h4>
            <button
              type="button"
              className="infinite-canvas-dialog__close"
              data-canvas-confirm-action="cancel"
              onClick={() => setRetryConfirmNodeId(null)}
            >
              {t('infiniteCanvas.tasks.retryCancelled.cancel')}
            </button>
          </div>
          <p className="infinite-canvas-dialog__hint infinite-canvas-dialog__hint--strong">
            {t('infiniteCanvas.tasks.retryCancelled.body')}
          </p>
          <p className="infinite-canvas-dialog__hint">
            {t('infiniteCanvas.tasks.retryCancelled.detail')}
          </p>
          <div className="infinite-canvas-dialog__actions">
            <button
              type="button"
              className="infinite-canvas-dialog__confirm"
              data-canvas-confirm-action="confirm"
              onClick={confirmRetryRespend}
            >
              {t('infiniteCanvas.tasks.retryCancelled.confirm')}
            </button>
          </div>
        </div>
      ) : null}
      {toolDialog ? (
        <InfiniteCanvasToolInstructionDialog
          toolId={toolDialog.toolId}
          onConfirm={instruction => {
            void confirmToolInstruction(instruction);
          }}
          onClose={() => setToolDialog(null)}
        />
      ) : null}
      <div
        className="infinite-canvas-panel__flow"
        aria-label={t('infiniteCanvas.title')}
        ref={flowRef}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onMove={onMove}
          onMoveEnd={onMoveEnd}
          onSelectionChange={onSelectionChange}
          onNodeContextMenu={onNodeContextMenu}
          onSelectionContextMenu={onSelectionContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          // P4 W8: the instance is captured here rather than through a
          // ReactFlowProvider + hook, so "take me to this card" needs no
          // restructuring of the panel or its overlays.
          onInit={instance => {
            flowInstanceRef.current = instance;
          }}
          defaultViewport={initialViewport}
          minZoom={0.1}
          maxZoom={4}
          // P4 W6 selection model: left-drag keeps panning the canvas (the
          // existing feel), Shift+drag marquee-selects, Ctrl/Cmd/Shift+click
          // adds to the selection, and Delete is ours — reactflow must not
          // remove anything on its own or the confirmation could be skipped.
          selectionOnDrag={false}
          selectionKeyCode="Shift"
          multiSelectionKeyCode={MULTI_SELECTION_KEYS}
          deleteKeyCode={null}
          elevateNodesOnSelect
        >
          <Background />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
        <InfiniteCanvasHelperLines
          vertical={helperLines.vertical}
          horizontal={helperLines.horizontal}
        />
        {selectedNodeIds.length >= 2 ? (
          <InfiniteCanvasSelectionToolbar
            nodeIds={selectedNodeIds}
            containerRef={flowRef}
            onAction={onSelectionToolbarAction}
          />
        ) : null}
        <InfiniteCanvasTaskQueuePanel
          tasks={tasks}
          onRetry={nodeId => {
            void retryGeneration(nodeId);
          }}
          onRetryAllFailed={() => {
            void onRetryAllFailed();
          }}
          onStopWaiting={onStopWaiting}
          onLocate={onLocateNode}
        />
        {contextMenu ? (
          <InfiniteCanvasContextMenu
            state={contextMenu}
            canPaste={Boolean(clipboard && clipboard.nodes.length > 0)}
            onAction={onContextMenuAction}
            onClose={() => setContextMenu(null)}
          />
        ) : null}
        {flowNodes.length === 0 ? (
          <div className="infinite-canvas-panel__empty">
            <Sparkles size={20} aria-hidden="true" />
            <p>{t('infiniteCanvas.empty.hint')}</p>
            <button
              type="button"
              className="infinite-canvas-panel__empty-cta"
              onClick={onAddGenerationCard}
            >
              {t('infiniteCanvas.empty.createCard')}
            </button>
          </div>
        ) : null}
      </div>
      {viewerNodeId ? (
        <InfiniteCanvasMediaViewer
          items={viewerItems}
          activeNodeId={viewerNodeId}
          resolvePreviewUrl={resolvePreviewUrl}
          onNavigate={setViewerNodeId}
          onClose={() => setViewerNodeId(null)}
          onSaveAs={onSaveMediaAs}
        />
      ) : null}
    </div>
  );
};

InfiniteCanvasPanel.displayName = 'InfiniteCanvasPanel';

export default InfiniteCanvasPanel;
