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
import { Maximize, Minus, Plus } from 'lucide-react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

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
  defaultInfiniteCanvasModelId,
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
import { InfiniteCanvasEdge } from './InfiniteCanvasEdge';
import {
  InfiniteCanvasGenerator,
  type InfiniteCanvasGeneratorReference,
} from './InfiniteCanvasGenerator';
import { InfiniteCanvasModelPopover } from './InfiniteCanvasModelPopover';
import { InfiniteCanvasParamsPopover } from './InfiniteCanvasParamsPopover';
import { InfiniteCanvasRail } from './InfiniteCanvasRail';
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

/** §3: one custom edge — a hairline bezier with the midpoint insert handle. */
const INFINITE_CANVAS_EDGE_TYPE = 'infinite-canvas-edge';

const EDGE_TYPES = {
  [INFINITE_CANVAS_EDGE_TYPE]: InfiniteCanvasEdge,
} as unknown as EdgeTypes;

/** §1: the point grid — smaller and darker than reactflow's default. */
const CANVAS_DOT_GAP = 26;
const CANVAS_DOT_SIZE = 1;

// Default preview lane: convertFileSrc over the joined absolute path — the
// same proven conversion the Workspace Media thumbnails and the canvas image
// picker use, so generated results display through one verified code path.
const defaultPreviewResolver: InfiniteCanvasImagePreviewResolver =
  resolveInfiniteCanvasMediaPreviewUrl;

/** §6: the gap between a card's lower edge and its generator, in panel px. */
const GENERATOR_CARD_GAP = 12;
/**
 * §6, owner feedback 2026-08-26: the generator is NOT card-width and
 * left-aligned. It overhangs the card by this much on EACH side and is centred
 * on the card's midline, so it reads as a symmetric shelf under the picture.
 */
const GENERATOR_SIDE_OVERHANG = 20;
/** A very small card must not squeeze the prompt row into unusability. */
const GENERATOR_MIN_WIDTH = 320;
/** The stylesheet's card box, used until reactflow reports a measured one. */
const CARD_FALLBACK_WIDTH = 280;
const CARD_FALLBACK_HEIGHT = 200;

/** §8.1: reactflow's own attribution watermark is not part of this language. */
const FLOW_PRO_OPTIONS = { hideAttribution: true };

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
  openParams: (nodeId: string, anchor?: HTMLElement) => void;
  /** §7.3-A: opens the model list popover for this card. */
  openModel: (nodeId: string, anchor?: HTMLElement) => void;
  /** §3: the card's right-edge `+` — derive the next generation card. */
  spawnNext: (nodeId: string) => void;
  /** §3: the midpoint handle — insert a generation card on that connection. */
  insertOnEdge: (edgeId: string) => void;
}

/**
 * §4's two output-group entries. They live in their own ref because the
 * handlers behind them (the save port, the context menu placement) are
 * declared far below the main node-action effect; a second ref keeps both
 * effects honest instead of forcing one giant declaration order.
 */
interface CardToolbarActions {
  saveMediaAs: (nodeId: string) => void;
  openMore: (nodeId: string, at: { clientX: number; clientY: number }) => void;
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
  /**
   * §6: the card-anchored generator is placed in panel pixels, so it needs the
   * live transform in render — but pan and zoom must not re-render the panel
   * on every frame. This mirror is therefore only written while exactly one
   * card is selected, i.e. only while something is actually anchored.
   */
  const [viewportTransform, setViewportTransform] = React.useState<Viewport>({
    x: 0,
    y: 0,
    zoom: 1,
  });

  const [imagePickerOpen, setImagePickerOpen] = React.useState(false);
  /** Whether the library picker was opened to place a card or add a reference. */
  const [imagePickerIntent, setImagePickerIntent] =
    React.useState<'card' | 'reference'>('card');
  const [stylePickerNodeId, setStylePickerNodeId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<GenerationNotice | null>(null);
  const [toolDialog, setToolDialog] = React.useState<ToolDialogRequest | null>(null);
  /** P4 W1: the card whose media the full-screen viewer is showing. */
  const [viewerNodeId, setViewerNodeId] = React.useState<string | null>(null);
  /** P4 W3: the card whose generation parameters are being edited. */
  const [paramsNodeId, setParamsNodeId] = React.useState<string | null>(null);
  /**
   * §7.3-A: the card whose MODEL LIST is open. Separate from `paramsNodeId`
   * and mutually exclusive with it — opening one closes the other, so the two
   * surfaces never stack on top of each other.
   */
  const [modelNodeId, setModelNodeId] = React.useState<string | null>(null);
  const [modelAnchor, setModelAnchor] = React.useState<HTMLElement | null>(null);
  /**
   * Owner feedback 2026-08-26: every popover is anchored to the control that
   * opened it. These hold that control, not a frozen rectangle, so the surface
   * re-measures instead of drifting when the trigger moves.
   */
  const [paramsAnchor, setParamsAnchor] = React.useState<HTMLElement | null>(null);
  const [stylePickerAnchor, setStylePickerAnchor] = React.useState<HTMLElement | null>(null);
  const [imagePickerAnchor, setImagePickerAnchor] = React.useState<HTMLElement | null>(null);
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
   * Selected connections. Edges are not mirrored into React state the way
   * nodes are — nothing renders off them but the Delete key — so a ref is the
   * whole story and no extra re-render is provoked by clicking a wire.
   */
  const selectedEdgeIdsRef = React.useRef<string[]>([]);
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
    zoomIn?: (options?: { duration?: number }) => void;
    zoomOut?: (options?: { duration?: number }) => void;
    fitView?: (options?: { duration?: number; padding?: number }) => void;
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
    openModel: () => undefined,
    spawnNext: () => undefined,
    insertOnEdge: () => undefined,
  });

  /**
   * The same seam for the edge handles. Kept apart from `nodeActionsRef` so
   * the edge projection does not have to re-run when a node action changes.
   */
  const edgeActionsRef = React.useRef<{ disconnect: (edgeId: string) => void }>({
    disconnect: () => undefined,
  });

  const cardToolbarActionsRef = React.useRef<CardToolbarActions>({
    saveMediaAs: () => undefined,
    openMore: () => undefined,
  });

  const openStylePicker = React.useCallback((nodeId: string, anchor?: HTMLElement) => {
    setStylePickerAnchor(anchor ?? null);
    setStylePickerNodeId(current => (current === nodeId ? null : nodeId));
  }, []);

  const projectDocument = React.useCallback((document: InfiniteCanvasDocument) => {
    documentRef.current = document;
    setTasks(collectGenerationTasks(document));
    const referenceLabels = referenceLabelsByNode(document);
    const selectedIds = new Set(selectedNodeIdsRef.current);
    setFlowNodes(toFlowNodeViews(document.nodes).map(view => ({
      id: view.id,
      type: view.type,
      position: view.position,
      // The projection is rebuilt on every commit, and reactflow's node list
      // is controlled here — so a re-projection that dropped `selected` would
      // silently deselect the card mid-edit and take its generator (§6) with
      // it. Selection is panel state; carry it across.
      selected: selectedIds.has(view.id),
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
            onOpenParams: (nodeId: string, anchor?: HTMLElement) =>
              nodeActionsRef.current.openParams(nodeId, anchor),
            onSpawnNext: (nodeId: string) => nodeActionsRef.current.spawnNext(nodeId),
            ...(view.data.mediaRef
              ? {
                  onSaveMediaAs: (nodeId: string) => (
                    cardToolbarActionsRef.current.saveMediaAs(nodeId)
                  ),
                }
              : {}),
            onOpenMore: (nodeId: string, at: { clientX: number; clientY: number }) => (
              cardToolbarActionsRef.current.openMore(nodeId, at)
            ),
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
    setFlowEdges(toFlowEdgeViews(document.edges).map(view => ({
      ...view,
      type: INFINITE_CANVAS_EDGE_TYPE,
      data: {
        onInsertCard: (edgeId: string) => nodeActionsRef.current.insertOnEdge(edgeId),
        onDisconnect: (edgeId: string) => edgeActionsRef.current.disconnect(edgeId),
      },
    })));
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
      openParams: (nodeId, anchor) => {
        if (!findMediaNode(nodeId)) return;
        setModelNodeId(null);
        setParamsAnchor(anchor ?? null);
        setParamsNodeId(current => (current === nodeId ? null : nodeId));
      },
      openModel: (nodeId, anchor) => {
        if (!findMediaNode(nodeId)) return;
        setParamsNodeId(null);
        setModelAnchor(anchor ?? null);
        setModelNodeId(current => (current === nodeId ? null : nodeId));
      },
      // §3: "keep going from this card". Nothing new on the command side —
      // the same blank-card + connect pair the image-to-video entry uses, so
      // it is one undo entry and one document mutation.
      spawnNext: nodeId => {
        const document = documentRef.current;
        const source = document?.nodes.find(candidate => candidate.nodeId === nodeId);
        if (!document || !source) return;
        const nextNodeId = createInfiniteCanvasId('node');
        const edgeId = createInfiniteCanvasId('edge');
        void commit(current => {
          const withCard = addBlankGenerationCardContent(current, nextNodeId, {
            x: source.position.x + (source.size?.width ?? 0) + 360,
            y: source.position.y,
          });
          return connectNodesContent(
            { ...current, ...withCard },
            edgeId,
            nodeId,
            nextNodeId,
          );
        }, { history: true });
      },
      // §3: the midpoint handle inserts a card INTO the connection: the old
      // edge goes, the new card sits between the two, and both halves are
      // re-connected. One mutation, so one undo entry.
      insertOnEdge: edgeId => {
        const document = documentRef.current;
        const edge = document?.edges.find(candidate => candidate.edgeId === edgeId);
        if (!document || !edge) return;
        const source = document.nodes.find(node => node.nodeId === edge.sourceNodeId);
        const target = document.nodes.find(node => node.nodeId === edge.targetNodeId);
        if (!source || !target) return;
        const insertedNodeId = createInfiniteCanvasId('node');
        const inEdgeId = createInfiniteCanvasId('edge');
        const outEdgeId = createInfiniteCanvasId('edge');
        void commit(current => {
          const withoutEdge = removeEdgesContent(current, [edgeId]);
          const withCard = addBlankGenerationCardContent(
            { ...current, ...withoutEdge },
            insertedNodeId,
            {
              x: (source.position.x + target.position.x) / 2,
              y: (source.position.y + target.position.y) / 2,
            },
          );
          const withIn = connectNodesContent(
            { ...current, ...withCard },
            inEdgeId,
            edge.sourceNodeId,
            insertedNodeId,
          );
          return connectNodesContent(
            { ...current, ...withIn },
            outEdgeId,
            insertedNodeId,
            edge.targetNodeId,
          );
        }, { history: true });
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
    setModelNodeId(null);
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
      setViewportTransform(document.viewport);
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

  /**
   * Owner feedback 2026-08-26: breaking a connection.
   *
   * One implementation behind three entry points — the `×` on the edge's
   * midpoint handle, the Delete/Backspace key on a selected edge, and the
   * `×` on a reference thumbnail in the generator. It is the same
   * `removeEdgesContent` mutation reactflow's own edge removal already used,
   * so it is one undo entry, and it deliberately does NOT go through the card
   * deletion gate: no card and no media file is affected by cutting a wire,
   * so there is nothing to confirm.
   */
  const disconnectEdges = React.useCallback((edgeIds: readonly string[]) => {
    if (edgeIds.length === 0) return;
    const removed = new Set(edgeIds);
    setFlowEdges(edges => edges.filter(edge => !removed.has(edge.id)));
    void commit(document => removeEdgesContent(document, [...edgeIds]), { history: true });
  }, [commit]);

  edgeActionsRef.current = {
    disconnect: (edgeId: string) => disconnectEdges([edgeId]),
  };

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
        const selectedEdges = selectedEdgeIdsRef.current;
        // A selected connection deletes straight away: no card and no file is
        // touched, so the confirmation gate the cards need does not apply.
        if (selected.length === 0 && selectedEdges.length > 0) {
          event.preventDefault();
          selectedEdgeIdsRef.current = [];
          disconnectEdges(selectedEdges);
          return;
        }
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
    disconnectEdges,
    duplicateNodes,
    pasteClipboard,
    requestDeleteNodes,
    runHistory,
    state.phase,
  ]);

  /** P4 W6: reactflow's selection, mirrored into panel state. */
  const onSelectionChange = React.useCallback((selection: {
    nodes?: { id: string }[];
    edges?: { id: string }[];
  }) => {
    const ids = (selection.nodes ?? []).map(node => node.id);
    selectedNodeIdsRef.current = ids;
    // Owner feedback 2026-08-26: a selected connection is a Delete target too.
    selectedEdgeIdsRef.current = (selection.edges ?? []).map(edge => edge.id);
    // The transform mirror is only maintained while something is anchored, so
    // it can be stale from a pan made with nothing selected. Re-sync here, or
    // the generator would appear at the card's old screen position.
    if (ids.length === 1) setViewportTransform(viewportRef.current);
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

  /**
   * §6: the card the user started dragging a connection FROM, while that drag
   * is in flight. Only a drag off a source handle (the card's right edge, the
   * `+`) can end in a new card.
   */
  const connectSourceRef = React.useRef<string | null>(null);

  const onConnectStart = React.useCallback((
    _event: unknown,
    params: { nodeId?: string | null; handleType?: string | null },
  ) => {
    connectSourceRef.current = params.handleType === 'target'
      ? null
      : params.nodeId ?? null;
  }, []);

  /**
   * §6: dragging off a card's right edge onto empty board creates a blank card
   * there, wires the dragged-from card to it as a reference, and selects it —
   * so its (empty) generator floats under it, ready for a prompt.
   *
   * The new card's kind mirrors the card it came from: an image card continues
   * the image lane, a video card the video lane. That is the one choice this
   * build can make without inventing a handle-side menu, and it is reversible
   * — the card is blank, so deleting it costs nothing. Nothing new on the
   * command side: the same blank-card + connect pair `spawnNext` uses, in one
   * mutation and therefore one undo entry.
   */
  const onConnectEnd = React.useCallback((event: MouseEvent | TouchEvent) => {
    const sourceNodeId = connectSourceRef.current;
    connectSourceRef.current = null;
    if (!sourceNodeId) return;
    // Landing on another card / handle is an ordinary connection: reactflow
    // has already reported it through `onConnect`.
    const target = event.target as Element | null;
    const droppedOnEmptyBoard = Boolean(
      target
      && typeof target.classList?.contains === 'function'
      && target.classList.contains('react-flow__pane'),
    );
    if (!droppedOnEmptyBoard) return;
    const document = documentRef.current;
    const source = document?.nodes.find(node => node.nodeId === sourceNodeId);
    if (!document || !source) return;
    const point = 'changedTouches' in event && event.changedTouches?.length
      ? { clientX: event.changedTouches[0].clientX, clientY: event.changedTouches[0].clientY }
      : { clientX: (event as MouseEvent).clientX, clientY: (event as MouseEvent).clientY };
    const host = flowRef.current?.getBoundingClientRect?.();
    const { x: panX, y: panY, zoom } = viewportRef.current;
    const position = {
      x: (point.clientX - (host?.left ?? 0) - panX) / zoom,
      y: (point.clientY - (host?.top ?? 0) - panY) / zoom,
    };
    const nextNodeId = createInfiniteCanvasId('node');
    const edgeId = createInfiniteCanvasId('edge');
    const addBlankCard = source.kind === 'video'
      ? addBlankVideoCardContent
      : addBlankGenerationCardContent;
    void commit(current => {
      const withCard = addBlankCard(current, nextNodeId, position);
      return connectNodesContent(
        { ...current, ...withCard },
        edgeId,
        sourceNodeId,
        nextNodeId,
      );
    }, { history: true }).then(() => {
      // The new card is what the user is about to write a prompt into, so it
      // takes the selection — and with it the generator.
      selectedNodeIdsRef.current = [nextNodeId];
      setViewportTransform(viewportRef.current);
      setSelectedNodeIds([nextNodeId]);
      setFlowNodes(nodes => nodes.map(node => (
        node.selected === (node.id === nextNodeId)
          ? node
          : { ...node, selected: node.id === nextNodeId }
      )));
    });
  }, [commit]);

  /** Keeps the anchored generator on its card while the board is panned. */
  const trackViewport = React.useCallback((viewport: Viewport) => {
    viewportRef.current = viewport;
    if (selectedNodeIdsRef.current.length !== 1) return;
    setViewportTransform(current => (
      current.x === viewport.x && current.y === viewport.y && current.zoom === viewport.zoom
        ? current
        : viewport
    ));
  }, []);

  const onMove = React.useCallback((_event: unknown, viewport: Viewport) => {
    // Ref first: with nothing anchored, pan/zoom must not re-render the panel
    // on every frame.
    trackViewport(viewport);
  }, [trackViewport]);

  const onMoveEnd = React.useCallback((_event: unknown, viewport: Viewport) => {
    trackViewport(viewport);
    void commit(document => setViewportContent(document, viewport));
  }, [commit, trackViewport]);

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

  /**
   * §6: the card the bottom generator is acting on — exactly one selected
   * generation-capable card, or nothing (then the generator creates a card).
   * Read off refs so callbacks never go stale mid-selection.
   */
  const singleSelectedMediaNodeId = React.useCallback(() => {
    const selected = selectedNodeIdsRef.current;
    if (selected.length !== 1) return undefined;
    return findMediaNode(selected[0]) ? selected[0] : undefined;
  }, [findMediaNode]);

  const onPickImage = React.useCallback((mediaRef: InfiniteCanvasMediaRef) => {
    const position = nextSpawnPosition();
    const asReference = imagePickerIntent === 'reference';
    setImagePickerOpen(false);
    const nodeId = createInfiniteCanvasId('node');
    // Always the same command: a picked library image becomes an image card.
    // "Add a reference" only differs in what happens to that card next.
    const targetNodeId = asReference ? singleSelectedMediaNodeId() : undefined;
    const edgeId = createInfiniteCanvasId('edge');
    void commit(document => {
      const withCard = addImageNodeContent(document, nodeId, position, mediaRef);
      if (!targetNodeId) return withCard;
      return connectNodesContent(
        { ...document, ...withCard },
        edgeId,
        nodeId,
        targetNodeId,
      );
    }, { history: true });
  }, [commit, imagePickerIntent, nextSpawnPosition, singleSelectedMediaNodeId]);

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

  /** §7.3-A: the same projection for the model list, on its own card. */
  const modelTarget = React.useMemo(() => {
    if (!modelNodeId) return undefined;
    const node = flowNodes.find(entry => entry.id === modelNodeId);
    if (!node
      || (node.type !== INFINITE_CANVAS_IMAGE_NODE_TYPE
        && node.type !== INFINITE_CANVAS_VIDEO_NODE_TYPE)) {
      return undefined;
    }
    return {
      mediaKind: node.type === INFINITE_CANVAS_VIDEO_NODE_TYPE ? 'video' as const : 'image' as const,
      params: node.data.generationParams as InfiniteCanvasGenerationParams | undefined,
    };
  }, [flowNodes, modelNodeId]);

  React.useEffect(() => {
    if (modelNodeId && !modelTarget) setModelNodeId(null);
  }, [modelNodeId, modelTarget]);

  const onChangeGenerationParams = React.useCallback((params: InfiniteCanvasGenerationParams) => {
    const nodeId = paramsNodeId;
    if (!nodeId) return;
    void commit(document => setNodeGenerationParamsContent(document, nodeId, params), { history: true });
  }, [commit, paramsNodeId]);

  const onChangeGenerationModel = React.useCallback((params: InfiniteCanvasGenerationParams) => {
    const nodeId = modelNodeId;
    if (!nodeId) return;
    void commit(document => setNodeGenerationParamsContent(document, nodeId, params), { history: true });
  }, [commit, modelNodeId]);

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

  // §4: the card pill's output group. Both reuse the ports the right-click
  // menu already calls — no second save lane, no second menu.
  React.useEffect(() => {
    cardToolbarActionsRef.current = {
      saveMediaAs: nodeId => {
        const item = viewerItems.find(entry => entry.nodeId === nodeId);
        if (item) onSaveMediaAs(item);
      },
      openMore: (nodeId, at) => {
        const found = findMediaNode(nodeId);
        openContextMenu({ ...at, preventDefault: () => undefined }, {
          kind: 'node',
          nodeId,
          hasMedia: Boolean(found?.node.mediaRef),
          canGenerate: Boolean(found),
        });
      },
    };
  }, [findMediaNode, onSaveMediaAs, openContextMenu, viewerItems]);

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

  // —— §6: the generator that floats under the selected card ————————————————

  /**
   * The card the generator is attached to, projected for display. Exactly one
   * selected generation-capable card gets a generator; anything else (nothing
   * selected, a text card, a multi-selection) gets none at all — with no
   * selection the board carries no input surface. Nothing here dispatches: it
   * is the same projection the cards read.
   */
  const generatorTarget = React.useMemo(() => {
    if (selectedNodeIds.length !== 1) return undefined;
    const node = flowNodes.find(entry => entry.id === selectedNodeIds[0]);
    if (!node
      || (node.type !== INFINITE_CANVAS_IMAGE_NODE_TYPE
        && node.type !== INFINITE_CANVAS_VIDEO_NODE_TYPE)) {
      return undefined;
    }
    const params = node.data.generationParams as InfiniteCanvasGenerationParams | undefined;
    const generation = node.data.generation as { status?: string } | undefined;
    return {
      nodeId: node.id,
      mediaKind: node.type === INFINITE_CANVAS_VIDEO_NODE_TYPE
        ? 'video' as const
        : 'image' as const,
      prompt: (node.data.prompt as string | undefined) ?? '',
      // §7.3-A: the bar already shows the model on its own control, so the
      // summary pill next to it carries only the remaining settings.
      paramsSummary: summarizeInfiniteCanvasGenerationParams(
        params ? { ...params, model: undefined } : undefined,
        node.type === INFINITE_CANVAS_VIDEO_NODE_TYPE ? 'video' : 'image',
      ) || undefined,
      modelLabel: params?.model
        || defaultInfiniteCanvasModelId(
          node.type === INFINITE_CANVAS_VIDEO_NODE_TYPE ? 'video' : 'image',
        ),
      count: params?.n,
      stylePresetName: node.data.stylePresetName as string | undefined,
      pending: generation?.status === 'pending',
    };
  }, [flowNodes, selectedNodeIds]);

  /**
   * §6: where the generator sits — directly under its card, as wide as the
   * card, in panel pixels. Falls back to `undefined` (the stylesheet's own
   * placement) when the card has not been measured yet, so the input is never
   * missing while reactflow is still measuring.
   */
  const generatorPlacement = React.useMemo(() => {
    if (!generatorTarget) return undefined;
    const node = flowNodes.find(entry => entry.id === generatorTarget.nodeId);
    if (!node) return undefined;
    // Before reactflow has measured the card (first frame, and always under
    // jsdom) fall back to the stylesheet's card box rather than to a
    // board-anchored panel: the generator must always read as the card's own
    // input, never as a global composer.
    const measured = Boolean(node.measured?.width && node.measured?.height);
    const width = node.measured?.width || CARD_FALLBACK_WIDTH;
    const height = node.measured?.height || CARD_FALLBACK_HEIGHT;
    const { x, y, zoom } = viewportTransform;
    // Owner feedback 2026-08-26: symmetric about the card and a little wider
    // on both sides. Centring on the card's midline keeps that true even when
    // the minimum width takes over on a small or zoomed-out card.
    const cardLeft = node.position.x * zoom + x;
    const cardWidth = width * zoom;
    const generatorWidth = Math.max(
      cardWidth + GENERATOR_SIDE_OVERHANG * 2,
      GENERATOR_MIN_WIDTH,
    );
    return {
      left: cardLeft + cardWidth / 2 - generatorWidth / 2,
      top: (node.position.y + height) * zoom + y + GENERATOR_CARD_GAP,
      width: generatorWidth,
      measured,
    };
  }, [flowNodes, generatorTarget, viewportTransform]);

  /**
   * The thumbnail queue: the target card's incoming reference cards, in edge
   * order. Tolerant on purpose — a reference whose media has not landed yet
   * shows as an empty square rather than blanking the queue.
   */
  const generatorReferences = React.useMemo<InfiniteCanvasGeneratorReference[]>(() => {
    const nodeById = new Map(flowNodes.map(node => [node.id, node]));
    const sourceIds = generatorTarget
      ? flowEdges
        .filter(edge => edge.target === generatorTarget.nodeId)
        .map(edge => edge.source)
      : [];
    const seen = new Set<string>();
    const references: InfiniteCanvasGeneratorReference[] = [];
    for (const sourceId of sourceIds) {
      if (seen.has(sourceId)) continue;
      const node = nodeById.get(sourceId);
      if (!node || node.type === INFINITE_CANVAS_TEXT_NODE_TYPE) continue;
      seen.add(sourceId);
      references.push({
        nodeId: sourceId,
        order: references.length + 1,
        mediaRef: node.data.mediaRef as InfiniteCanvasMediaRef | undefined,
      });
    }
    return references;
  }, [flowEdges, flowNodes, generatorTarget]);

  /**
   * The one send path: the edited prompt is written to the attached card and
   * the existing dispatch runs on it — self for a blank card, derived for one
   * that already holds media. Same `commit`, same `generateForNode`: no second
   * generation lane and no change to the gateway contract.
   */
  const onGeneratorSubmit = React.useCallback(async (prompt: string) => {
    const target = generatorTarget;
    if (!target) return;
    if (prompt !== target.prompt) {
      await commit(document => setNodePromptContent(document, target.nodeId, prompt), {
        history: true,
      });
    }
    await generateForNode(target.nodeId);
  }, [commit, generateForNode, generatorTarget]);

  const onGeneratorAddReference = React.useCallback((anchor?: HTMLElement) => {
    setImagePickerAnchor(anchor ?? null);
    setImagePickerIntent('reference');
    setImagePickerOpen(true);
  }, []);

  /**
   * Owner feedback 2026-08-26: the `×` on a reference thumbnail.
   *
   * It breaks the connection from that reference card into the selected card —
   * every edge between the two, so a duplicated wire cannot survive the click.
   * The reference card itself and both cards' media stay exactly as they were;
   * only the wire goes, through the same undoable mutation.
   */
  const onGeneratorRemoveReference = React.useCallback((sourceNodeId: string) => {
    const targetNodeId = generatorTarget?.nodeId;
    if (!targetNodeId) return;
    const edgeIds = flowEdges
      .filter(edge => edge.source === sourceNodeId && edge.target === targetNodeId)
      .map(edge => edge.id);
    disconnectEdges(edgeIds);
  }, [disconnectEdges, flowEdges, generatorTarget]);

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
          // The bug the owner hit: the picker used the library's
          // convertFileSrc thumbnails, which this app's webview refuses. It
          // now shares the cards' forceDataUrl resolver.
          resolvePreviewUrl={resolvePreviewUrl}
          anchor={imagePickerAnchor}
          onPick={onPickImage}
          onClose={() => setImagePickerOpen(false)}
        />
      ) : null}
      {stylePickerNodeId ? (
        <InfiniteCanvasStylePicker
          currentPresetId={stylePickerCurrentPresetId}
          catalog={catalog}
          anchor={stylePickerAnchor}
          onPick={onPickStyle}
          onClose={() => setStylePickerNodeId(null)}
        />
      ) : null}
      {paramsTarget ? (
        <InfiniteCanvasParamsPopover
          mediaKind={paramsTarget.mediaKind}
          params={paramsTarget.params}
          anchor={paramsAnchor}
          onChange={onChangeGenerationParams}
          onClose={() => setParamsNodeId(null)}
        />
      ) : null}
      {modelTarget ? (
        <InfiniteCanvasModelPopover
          mediaKind={modelTarget.mediaKind}
          params={modelTarget.params}
          anchor={modelAnchor}
          onChange={onChangeGenerationModel}
          onClose={() => setModelNodeId(null)}
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
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          proOptions={FLOW_PRO_OPTIONS}
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
          <Background gap={CANVAS_DOT_GAP} size={CANVAS_DOT_SIZE} />
        </ReactFlow>
        {/*
          §8.1: reactflow's stacked `+ − ⛶` control block is replaced by three
          hairline icon buttons in the corner — no background until hovered,
          same weight as the left rail. They drive the same instance methods
          the default control block called.
        */}
        <div
          className="infinite-canvas-zoom"
          role="group"
          data-canvas-zoom="root"
          aria-label={t('infiniteCanvas.zoom.label')}
        >
          <button
            type="button"
            className="infinite-canvas-zoom__button"
            data-canvas-zoom-action="in"
            aria-label={t('infiniteCanvas.zoom.in')}
            title={t('infiniteCanvas.zoom.in')}
            onClick={() => flowInstanceRef.current?.zoomIn?.({ duration: 160 })}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="infinite-canvas-zoom__button"
            data-canvas-zoom-action="out"
            aria-label={t('infiniteCanvas.zoom.out')}
            title={t('infiniteCanvas.zoom.out')}
            onClick={() => flowInstanceRef.current?.zoomOut?.({ duration: 160 })}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="infinite-canvas-zoom__button"
            data-canvas-zoom-action="fit"
            aria-label={t('infiniteCanvas.zoom.fit')}
            title={t('infiniteCanvas.zoom.fit')}
            onClick={() => flowInstanceRef.current?.fitView?.({ duration: 160, padding: 0.2 })}
          >
            <Maximize size={14} aria-hidden="true" />
          </button>
        </div>
        <InfiniteCanvasHelperLines
          vertical={helperLines.vertical}
          horizontal={helperLines.horizontal}
        />
        {/* §8: the floating left rail replaces the old top toolbar row. */}
        <InfiniteCanvasRail
          onAddText={onAddText}
          onAddImage={anchor => {
            setImagePickerAnchor(anchor ?? null);
            setImagePickerIntent('card');
            setImagePickerOpen(open => !open);
          }}
          onAddGenerationCard={onAddGenerationCard}
          onAddVideoCard={onAddVideoCard}
          onOpenLibrary={anchor => {
            setImagePickerAnchor(anchor ?? null);
            setImagePickerIntent('card');
            setImagePickerOpen(open => !open);
          }}
          onUndo={() => {
            void runHistory('undo');
          }}
          onRedo={() => {
            void runHistory('redo');
          }}
          canUndo={history.undo.length > 0}
          canRedo={history.redo.length > 0}
          undoHint={t('infiniteCanvas.history.undoHint')}
          redoHint={t('infiniteCanvas.history.redoHint')}
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
        {/*
          §6: the generator belongs to the selected card and floats under it.
          No selection, no input surface anywhere on the board.
        */}
        {generatorTarget && generatorPlacement ? (
          <InfiniteCanvasGenerator
            target={generatorTarget}
            placement={generatorPlacement}
            references={generatorReferences}
            resolvePreviewUrl={resolvePreviewUrl}
            onSubmit={prompt => {
              void onGeneratorSubmit(prompt);
            }}
            onCommitPrompt={prompt => {
              void commit(
                document => setNodePromptContent(document, generatorTarget.nodeId, prompt),
                { history: true },
              );
            }}
            onAddReference={onGeneratorAddReference}
            onRemoveReference={onGeneratorRemoveReference}
            onOpenParams={anchor =>
              nodeActionsRef.current.openParams(generatorTarget.nodeId, anchor)}
            onOpenModel={anchor =>
              nodeActionsRef.current.openModel(generatorTarget.nodeId, anchor)}
            onOpenStyle={generatorTarget.mediaKind === 'image'
              ? anchor => openStylePicker(generatorTarget.nodeId, anchor)
              : undefined}
          />
        ) : null}
        {contextMenu ? (
          <InfiniteCanvasContextMenu
            state={contextMenu}
            canPaste={Boolean(clipboard && clipboard.nodes.length > 0)}
            onAction={onContextMenuAction}
            onClose={() => setContextMenu(null)}
          />
        ) : null}
        {flowNodes.length === 0 ? (
          // §9: an empty board is the board — dark surface, the left rail, and
          // one short grey line. No illustration, no paragraph, and (§6) no
          // input box: a generator needs a card to belong to.
          <p className="infinite-canvas-panel__empty">{t('infiniteCanvas.empty.hint')}</p>
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
