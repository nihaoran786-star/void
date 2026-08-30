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
import { readShortDramaProjectForCanvas } from '@/shared/services/canvas-short-drama/shortDramaCanvasProjectReader';
import {
  sendCanvasPictureBackToShortDrama,
  type ShortDramaCanvasWriteBackRequest,
  type ShortDramaCanvasWriteBackResult,
} from '@/shared/services/canvas-short-drama/shortDramaCanvasWriteBack';
import type { ShortDramaProject } from '@/shared/services/short-drama/ShortDramaTypes';
import type {
  ImageToolId,
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentService,
  InfiniteCanvasDomainRef,
  InfiniteCanvasMediaBridgeEventBus,
} from '@/shared/services/infinite-canvas';
import type {
  InfiniteCanvasGenerationParams,
  InfiniteCanvasMediaJobReader,
} from '@/shared/services/infinite-canvas';
import type { InfiniteCanvasGenerationTask } from './infiniteCanvasPanelModel';
import {
  summarizeInfiniteCanvasGenerationParams,
  defaultInfiniteCanvasModelId,
  defaultInfiniteCanvasDocumentId,
  IMAGE_TOOL_DEFINITIONS,
  isMaskImageTool,
} from '@/shared/services/infinite-canvas';
import type { StylePresetCatalog } from '@/shared/services/style-preset';
import { stylePresetCatalog } from '@/shared/services/style-preset';
import type { WorkspaceMediaLibraryService } from '@/shared/services/workspace-media/WorkspaceMediaTypes';
import { workspaceMediaLibraryService } from '@/shared/services/workspace-media/WorkspaceMediaLibrary';
import {
  getInfiniteCanvasAssetWriter,
  getInfiniteCanvasDocumentService,
  getInfiniteCanvasImageAnalyzer,
  getInfiniteCanvasMediaRevealer,
  getInfiniteCanvasMediaSaver,
  getInfiniteCanvasScratchPruner,
  type InfiniteCanvasAssetWriter,
  type InfiniteCanvasImageAnalysisResult,
  type InfiniteCanvasImageAnalyzer,
  type InfiniteCanvasMediaRevealer,
  type InfiniteCanvasMediaSaver,
  type InfiniteCanvasScratchPruner,
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
  INFINITE_CANVAS_IMAGE_NODE_TYPE,
  INFINITE_CANVAS_TEXT_NODE_TYPE,
  INFINITE_CANVAS_VIDEO_NODE_TYPE,
  moveNodesContent,
  removeEdgesContent,
  type InfiniteCanvasDeletionSummary,
  type InfiniteCanvasNodeMove,
  removeFailedOperationContent,
  removeNodesContent,
  setNodeActiveVariantContent,
  setNodeStylePresetContent,
  setNodeTextContent,
  setViewportContent,
  stopWaitingContent,
} from './infiniteCanvasPanelModel';
import {
  addBlankGenerationCardContent,
  addBlankVideoCardContent,
  setNodeGenerationParamsContent,
  setNodePromptContent,
} from './infiniteCanvasGenerationModel';
import { InfiniteCanvasDomainOriginProvider } from './infiniteCanvasDomainOrigins';
import { InfiniteCanvasEdge } from './InfiniteCanvasEdge';
import {
  InfiniteCanvasGenerator,
  type InfiniteCanvasGeneratorReference,
  type InfiniteCanvasGeneratorTarget,
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
  historyShortcutFor,
  isEditableTarget,
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
import {
  InfiniteCanvasDeleteConfirmDialog,
  InfiniteCanvasRetryCancelledDialog,
} from './InfiniteCanvasConfirmDialog';
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
import { InfiniteCanvasFrameEditor } from './InfiniteCanvasFrameEditor';
import { InfiniteCanvasPopover } from './InfiniteCanvasPopover';
import { INFINITE_CANVAS_POPOVER_WIDTH } from './infiniteCanvasPopoverPlacement';
import {
  InfiniteCanvasOverflowMenu,
  type InfiniteCanvasOverflowAction,
} from './InfiniteCanvasOverflowMenu';
import { InfiniteCanvasMaskEditor } from './InfiniteCanvasMaskEditor';
import {
  emptyInfiniteCanvasProjectionCache,
  INFINITE_CANVAS_EDGE_TYPE,
  projectInfiniteCanvasView,
  referenceLabelsByNode,
  type InfiniteCanvasCardToolbarActions,
  type InfiniteCanvasNodeActions,
} from './infiniteCanvasViewProjection';
import { useCanvasEditorLanes } from './useCanvasEditorLanes';
import {
  useCanvasGenerationDispatch,
  type CanvasGenerationNotice,
} from './useCanvasGenerationDispatch';
import { useCanvasPopovers } from './useCanvasPopovers';
import { useCanvasShortDramaBridge } from './useCanvasShortDramaBridge';
import { useInfiniteCanvasDocument } from './useInfiniteCanvasDocument';
import './InfiniteCanvasPanel.scss';

// The node renderers take their narrowed data props; reactflow's NodeTypes is
// keyed on the erased NodeProps shape, so the registration map is cast once.
const NODE_TYPES = {
  [INFINITE_CANVAS_TEXT_NODE_TYPE]: InfiniteCanvasTextNode,
  [INFINITE_CANVAS_IMAGE_NODE_TYPE]: InfiniteCanvasImageNode,
  [INFINITE_CANVAS_VIDEO_NODE_TYPE]: InfiniteCanvasVideoNode,
} as unknown as NodeTypes;

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

/**
 * A five-tool action that has been picked but not yet sent (§7.4.3).
 *
 * There is no dialog behind this any more. Pressing "smart upscale" writes the
 * tool's instruction template into the CARD'S OWN input box — the one shared
 * input the whole board has — and remembers, here, that the next press of that
 * box's round send button is that tool rather than an ordinary generation. The
 * user edits the sentence in place and sends it from where they were already
 * looking; there is no second window and no second confirm button.
 */
interface ToolIntent {
  nodeId: string;
  toolId: ImageToolId;
  /** The template as prefilled, so the box knows which 【】 are the tool's. */
  template: string;
}

/**
 * P5 W7: a reverse-prompt result waiting on the owner's call, because the
 * card's prompt box already had something in it.
 */
interface ReversePromptChoice {
  nodeId: string;
  anchor: HTMLElement | null;
  prompt: string;
}

/**
 * Owner approval 2026-08-27: reverse-prompt spends money, so it asks first.
 *
 * A compact anchored confirmation, not a modal slab — the same popover surface
 * §7.1 gives every other canvas choice. Nothing is called until it is
 * confirmed; dismissing it (press outside, Escape, "not now") calls nothing.
 */
interface ReversePromptSpendRequest {
  nodeId: string;
  anchor: HTMLElement | null;
}

/**
 * Resolves an optional injected port, falling back to the production factory.
 *
 * `factory` must be a THUNK that also performs the module access, not the
 * imported function itself: several existing panel tests mock the whole
 * gateway module with only the exports they needed at the time, and Vitest
 * throws on merely *reading* a missing export from such a mock. Reading it
 * inside the guard keeps a newly added port from turning older tests into
 * crashes — a port that cannot be resolved simply does not exist, and its
 * feature reports a typed failure instead.
 */
/**
 * §6's card projection, as a plain function so both places that mount the
 * generator read the SAME numbers: the board (for the selected card) and the
 * mask editor (for the card it is open on).
 *
 * Nothing here dispatches or mutates — it is the projection the cards already
 * read, rearranged for display.
 */
function projectGeneratorTarget(
  node: { id: string; type?: string; data: Record<string, unknown> } | undefined,
): InfiniteCanvasGeneratorTarget | undefined {
  if (!node
    || (node.type !== INFINITE_CANVAS_IMAGE_NODE_TYPE
      && node.type !== INFINITE_CANVAS_VIDEO_NODE_TYPE)) {
    return undefined;
  }
  const params = node.data.generationParams as InfiniteCanvasGenerationParams | undefined;
  const generation = node.data.generation as { status?: string } | undefined;
  const isVideo = node.type === INFINITE_CANVAS_VIDEO_NODE_TYPE;
  return {
    nodeId: node.id,
    mediaKind: isVideo ? 'video' : 'image',
    prompt: (node.data.prompt as string | undefined) ?? '',
    // §7.3-A: the bar already shows the model on its own control, so the
    // summary pill next to it carries only the remaining settings.
    paramsSummary: summarizeInfiniteCanvasGenerationParams(
      params ? { ...params, model: undefined } : undefined,
      isVideo ? 'video' : 'image',
    ) || undefined,
    modelLabel: params?.model || defaultInfiniteCanvasModelId(isVideo ? 'video' : 'image'),
    count: params?.n,
    stylePresetId: node.data.stylePresetId as string | undefined,
    stylePresetName: node.data.stylePresetName as string | undefined,
    styleThumbnailRef: node.data.styleThumbnailRef as string | undefined,
    pending: generation?.status === 'pending',
  };
}

function resolvePort<T>(injected: T | undefined, factory: () => T): T | undefined {
  if (injected) return injected;
  try {
    return factory();
  } catch {
    return undefined;
  }
}

export interface InfiniteCanvasPanelProps {
  workspaceId: string;
  workspacePath: string;
  isActive: boolean;
  /** Session that opened the canvas surface; preferred dispatch target. */
  sourceSessionId?: string;
  /**
   * K3 §5.1.5: "open the board and bring this short-drama asset with you".
   * The surface re-validates it before handing it over, and the panel imports
   * a given `requestId` at most once (§5.1.6).
   */
  pendingDomainImport?: {
    domainRef: InfiniteCanvasDomainRef;
    requestId: string;
  };
  /**
   * K3: the board's read-only window onto the short-drama project. Used to ask
   * an asset for its current picture on import, and for the handle its badge
   * shows. Injected in tests so no manifest file is ever touched.
   */
  readShortDramaProject?: (
    workspacePath: string | undefined,
  ) => Promise<ShortDramaProject | undefined>;
  /**
   * K3 §5.2: the return leg. Injected in tests so no manifest is ever written;
   * production uses the typed write-back service, which owns the three gates.
   */
  sendPictureBackToShortDrama?: (
    request: ShortDramaCanvasWriteBackRequest,
  ) => Promise<ShortDramaCanvasWriteBackResult>;
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
  /**
   * P5 W1 image-byte sink (crop output and red-mark composites). Production
   * binds the R1 `write_canvas_image_bytes` command through the gateway; tests
   * inject a stub so no Tauri command is reached.
   */
  writeCanvasImage?: InfiniteCanvasAssetWriter;
  /** P5 W1 scratch cleanup, fired once on mount and deliberately silent. */
  pruneCanvasScratch?: InfiniteCanvasScratchPruner;
  /**
   * P5 W7 reverse-prompt port. Production binds the R2
   * `analyze_infinite_canvas_image` command; tests inject a stub. Never the
   * session AI — see the port's own note.
   */
  analyzeCanvasImage?: InfiniteCanvasImageAnalyzer;
}

export const InfiniteCanvasPanel: React.FC<InfiniteCanvasPanelProps> = ({
  workspaceId,
  workspacePath,
  sourceSessionId,
  pendingDomainImport,
  readShortDramaProject = readShortDramaProjectForCanvas,
  sendPictureBackToShortDrama = sendCanvasPictureBackToShortDrama,
  service: injectedService,
  resolvePreviewUrl = defaultPreviewResolver,
  mediaLibrary = workspaceMediaLibraryService,
  catalog = stylePresetCatalog,
  generationRuntime: injectedRuntime,
  mediaEventBus,
  mediaJobReader,
  saveMediaAs,
  revealMediaIn,
  writeCanvasImage,
  pruneCanvasScratch,
  analyzeCanvasImage,
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
  const [notice, setNotice] = React.useState<CanvasGenerationNotice | null>(null);
  const [toolIntent, setToolIntent] = React.useState<ToolIntent | null>(null);
  /**
   * Read by the board's keyboard listener. While an editor is open, Ctrl+Z
   * belongs to that editor's own stroke stack and must not reach the document
   * history — the two stacks are completely isolated (plan §9). Written just
   * below, where the three editors are declared.
   */
  const editorOpenRef = React.useRef(false);
  /**
   * P5 W7: the card whose reverse-prompt call is in flight, and the pending
   * "replace or append" choice when the prompt box was not empty.
   *
   * The ref is the actual guard against a double call — state lands a render
   * too late to stop the second click.
   */
  const [reversePromptPendingNodeId, setReversePromptPendingNodeId] =
    React.useState<string | null>(null);
  const reversePromptNodeIdRef = React.useRef<string | null>(null);
  const [reversePromptChoice, setReversePromptChoice] =
    React.useState<ReversePromptChoice | null>(null);
  /** The card waiting on the owner's "yes, spend it" before any call is made. */
  const [reversePromptSpend, setReversePromptSpend] =
    React.useState<ReversePromptSpendRequest | null>(null);
  /**
   * P5 review C7: the generator's prompt box only commits on blur, so
   * `node.prompt` is stale for as long as the box has focus. Anything that has
   * to know "is there text in the box right now" — the reverse-prompt lane
   * being the one that could destroy it — reads this instead. A ref, not
   * state: it must never re-render the panel on a keystroke.
   */
  const generatorDraftRef = React.useRef<{ nodeId: string; value: string } | null>(null);
  /** P4 W1: the card whose media the full-screen viewer is showing. */
  const [viewerNodeId, setViewerNodeId] = React.useState<string | null>(null);
  /**
   * P4 W3 and §7.3-A: the parameter sheet and the model list. Two surfaces,
   * one implementation, mutually exclusive by construction — opening one
   * closes the other, so they never stack on top of each other.
   *
   * Owner feedback 2026-08-26: each one is anchored to the control that opened
   * it, and holds that control rather than a frozen rectangle, so the surface
   * re-measures instead of drifting when the trigger moves.
   */
  const popovers = useCanvasPopovers(flowNodes);
  // The two entry points are stable for the life of the panel, so the
  // effects that dispatch through them keep the dependency lists they had.
  const { open: openPopover, closeAll: closeAllPopovers } = popovers;
  const [stylePickerAnchor, setStylePickerAnchor] = React.useState<HTMLElement | null>(null);
  const [imagePickerAnchor, setImagePickerAnchor] = React.useState<HTMLElement | null>(null);
  /**
   * P4 W6: the current multi-selection, mirrored out of reactflow. Kept as a
   * ref as well so the keyboard listener never has to be re-registered (and
   * never reads a stale closure) while the user is selecting.
   */
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<string[]>([]);
  const selectedNodeIdsRef = React.useRef<string[]>([]);
  selectedNodeIdsRef.current = selectedNodeIds;
  /**
   * A5 / C1: owned cards whose LAST dispatch did not carry short-drama
   * coordinates, so whatever it produces will stay on the board until the user
   * presses "send back" themselves.
   *
   * This is the durable half of one shared idea — "this one does not file
   * itself" — whose other half is derived live from the card's batch size (see
   * {@link infiniteCanvasWillAutoFile}). Both drive the same badge weakening
   * and the same sentence, because to the user they are the same fact.
   *
   * Deliberately panel state, not document state: it describes the last press,
   * not the picture, and a fact about a press has no business surviving a
   * restart or travelling to another machine.
   */
  const manualReturnNodeIdsRef = React.useRef(new Set<string>());
  /**
   * Selected connections. Edges are not mirrored into React state the way
   * nodes are — nothing renders off them but the Delete key — so a ref is the
   * whole story and no extra re-render is provoked by clicking a wire.
   */
  const selectedEdgeIdsRef = React.useRef<string[]>([]);
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
  const nodeActionsRef = React.useRef<InfiniteCanvasNodeActions>({
    commitText: () => undefined,
    commitPrompt: () => undefined,
    generate: () => undefined,
    openTool: () => undefined,
    cropImage: () => undefined,
    reversePrompt: () => undefined,
    retry: () => undefined,
    removeFailed: () => undefined,
    deriveVideoCard: () => undefined,
    openViewer: () => undefined,
    openParams: () => undefined,
    openModel: () => undefined,
    spawnNext: () => undefined,
    insertOnEdge: () => undefined,
    selectVariant: () => undefined,
  });

  /**
   * The same seam for the edge handles. Kept apart from `nodeActionsRef` so
   * the edge projection does not have to re-run when a node action changes.
   */
  const edgeActionsRef = React.useRef<{ disconnect: (edgeId: string) => void }>({
    disconnect: () => undefined,
  });

  const cardToolbarActionsRef = React.useRef<InfiniteCanvasCardToolbarActions>({
    saveMediaAs: () => undefined,
    overflow: () => undefined,
    sendToShortDrama: () => undefined,
  });

  /**
   * §4's overflow drawer. The panel owns it, not the card: the surface is
   * placed in panel coordinates and a card lives inside reactflow's
   * transformed pane, where those numbers would come out wrong.
   */
  const [overflow, setOverflow] = React.useState<
    { nodeId: string; anchor: HTMLElement | null } | null
  >(null);

  /**
   * The trigger, kept where the action dispatcher can reach it: reverse-prompt
   * anchors its own follow-up popover to whatever opened it, and by the time
   * that runs the drawer has closed.
   */
  const overflowAnchorRef = React.useRef<HTMLElement | null>(null);

  const openOverflow = React.useCallback((nodeId: string, anchor: HTMLElement) => {
    overflowAnchorRef.current = anchor;
    // Pressing the same card's "more" again closes it, the way every other
    // canvas popover trigger behaves.
    setOverflow(current => (current?.nodeId === nodeId ? null : { nodeId, anchor }));
  }, []);

  const openStylePicker = React.useCallback((nodeId: string, anchor?: HTMLElement) => {
    setStylePickerAnchor(anchor ?? null);
    setStylePickerNodeId(current => (current === nodeId ? null : nodeId));
  }, []);

  /**
   * H3: the previous projection's per-card `data`, keyed by node id, so an
   * unchanged card is handed back the very same object instead of being made
   * to re-decode its picture from disk. Owned here, threaded through the
   * projection as a value.
   */
  const projectionCache = React.useRef(emptyInfiniteCanvasProjectionCache());

  const projectDocument = React.useCallback((document: InfiniteCanvasDocument) => {
    documentRef.current = document;
    setTasks(collectGenerationTasks(document));
    const projection = projectInfiniteCanvasView(document, {
      catalog,
      resolvePreviewUrl,
      referenceLabels: referenceLabelsByNode(document),
      selectedIds: new Set(selectedNodeIdsRef.current),
      manualReturnNodeIds: manualReturnNodeIdsRef.current,
      openOverflow,
      openStylePicker,
      nodeActionsRef,
      edgeActionsRef,
      cardToolbarActionsRef,
      cache: projectionCache.current,
    });
    projectionCache.current = projection.cache;
    setFlowNodes(projection.nodes);
    setFlowEdges(projection.edges);
  }, [catalog, openOverflow, openStylePicker, resolvePreviewUrl]);

  /**
   * A freshly opened board starts where it was left: the stored pan and zoom
   * become the board's, and the mirror the anchored generator reads is seeded
   * with them so the first frame is not drawn at the origin.
   */
  const onDocumentLoaded = React.useCallback((document: InfiniteCanvasDocument) => {
    setInitialViewport(document.viewport);
    viewportRef.current = document.viewport;
    setViewportTransform(document.viewport);
  }, []);

  /**
   * The board's one connection to its document: opening it, writing to it,
   * and stepping back through what was written. H1, H2 and C2 all live in
   * there — see `useInfiniteCanvasDocument`.
   */
  const documentLane = useInfiniteCanvasDocument({
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
  });
  const { commit, history, resetHistory, runHistory, state } = documentLane;

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

  /**
   * Everything that spends money leaves the board here: the shared gate, the
   * one submission call, the blank-card send, and the retry.
   */
  const dispatch = useCanvasGenerationDispatch({
    workspacePath,
    runtime,
    documentRef,
    commit,
    setNotice,
    setFlowNodes,
    manualReturnNodeIdsRef,
    readShortDramaProject,
    createOperationId: () => createInfiniteCanvasId('op'),
  });
  const {
    cancelRetryRespend,
    findImageNode,
    findMediaNode,
    generateForNode,
    prepareDispatch,
    retryGeneration,
    submitOperation,
  } = dispatch;

  /**
   * Send a five-tool action from the shared input (§7.4.3).
   *
   * Everything downstream of here is exactly what the deleted dialog did: the
   * derive-a-new-card mutation, the same gateway call, the same edit target.
   * Only where the sentence was typed has changed.
   */
  const confirmToolInstruction = React.useCallback(async (
    request: ToolIntent,
    instruction: string,
  ) => {
    setToolIntent(null);
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
  }, [commit, findImageNode, prepareDispatch, submitOperation]);

  // —— P5 / P6: the three board-filling editors ——————————————————————————————

  const assetWriter = React.useMemo(
    () => resolvePort(writeCanvasImage, () => getInfiniteCanvasAssetWriter()),
    [writeCanvasImage],
  );

  /**
   * Red-mark composites are intermediates, not the owner's work: they age out
   * of the scratch directory instead of being reference-counted (a failed
   * generation may be retried against the same marks). Fired once per mount,
   * never awaited, never surfaced — a failed sweep is not the user's problem.
   */
  React.useEffect(() => {
    const pruner = resolvePort(pruneCanvasScratch, () => getInfiniteCanvasScratchPruner());
    if (!pruner) return;
    void Promise.resolve(pruner({ workspacePath })).catch(() => undefined);
  }, [pruneCanvasScratch, workspacePath]);

  /**
   * Crop, red marks and outpainting: three editors, one chain shape — write
   * the picture to disk first, touch the document only once the bytes have
   * landed, and never let a failed write reach a paid submission.
   */
  const editors = useCanvasEditorLanes({
    workspacePath,
    assetWriter,
    commit,
    submitOperation,
    prepareDispatch,
    findImageNode,
    createOperationId: () => createInfiniteCanvasId('op'),
    setNotice,
    t,
  });
  editorOpenRef.current = editors.anyOpen;
  // Stable for the life of the panel, so the effects that reach for them
  // keep the dependency lists they had.
  const { close: closeMaskEditor, open: openMaskEditor } = editors.mask;
  const { close: closeCropEditor, open: openCropEditor } = editors.crop;
  const { close: closeExpandEditor, open: openExpandEditor } = editors.expand;
  const maskRequest = editors.mask.request;
  const cropRequest = editors.crop.request;
  const expandRequest = editors.expand.request;

  // —— P5 W7: reverse-prompt ————————————————————————————————————————————————

  const imageAnalyzer = React.useMemo(
    () => resolvePort(analyzeCanvasImage, () => getInfiniteCanvasImageAnalyzer()),
    [analyzeCanvasImage],
  );

  /**
   * Look at the picture, write the prompt into the card's own input.
   *
   * Three rules, each of them a written assertion in the tests:
   *
   * - It NEVER dispatches a generation. The owner reads what came back, edits
   *   it, and presses send themselves. A button that quietly starts spending
   *   money is not a button anyone can trust.
   * - It never silently overwrites. An empty prompt box is filled straight
   *   away; a box with something in it gets a compact "replace or append"
   *   choice anchored to the button.
   * - Every failure is a named state on screen. In particular, "no vision
   *   model configured" reads as exactly that and points at settings, rather
   *   than as a spinner that stops.
   */
  /** The card's prompt as the USER sees it: live draft first, document second. */
  const liveNodePrompt = React.useCallback((nodeId: string): string => {
    const draft = generatorDraftRef.current;
    if (draft && draft.nodeId === nodeId) return draft.value;
    return findImageNode(nodeId)?.node.prompt ?? '';
  }, [findImageNode]);

  const runReversePrompt = React.useCallback(async (nodeId: string, anchor?: HTMLElement) => {
    if (reversePromptNodeIdRef.current) return;
    const found = findImageNode(nodeId);
    const mediaRef = found?.node.mediaRef;
    if (!mediaRef) return;
    if (!imageAnalyzer) {
      setNotice({
        messageKey: 'infiniteCanvas.reversePrompt.failed.backend',
        errorKind: 'unavailable',
      });
      return;
    }
    setReversePromptChoice(null);
    reversePromptNodeIdRef.current = nodeId;
    setReversePromptPendingNodeId(nodeId);
    // P5 review C8: the drawer this was started from closes on the click, so
    // the busy state it used to carry was invisible for the whole 10-30 s of a
    // paid vision call. The panel-level notice outlives the drawer.
    setNotice({ messageKey: 'infiniteCanvas.reversePrompt.pending', busy: true });
    let result: InfiniteCanvasImageAnalysisResult;
    try {
      result = await imageAnalyzer({
        workspacePath: mediaRef.workspacePath,
        relativePath: mediaRef.relativePath.replace(/\\/g, '/'),
        detail: 'detailed',
      });
    } finally {
      reversePromptNodeIdRef.current = null;
      setReversePromptPendingNodeId(null);
      // Only the busy notice this call put up; an unrelated one stays.
      setNotice(current => (current?.busy ? null : current));
    }

    const prompt = result.status === 'completed' ? (result.prompt ?? '').trim() : '';
    if (result.status !== 'completed' || !prompt) {
      // An empty prompt on a "completed" call is a useless answer, so it is
      // reported as an unusable image rather than as a success with nothing.
      const status = result.status === 'completed' ? 'invalid_image' : result.status;
      setNotice({
        messageKey: `infiniteCanvas.reversePrompt.failed.${status}`,
        errorKind: status === 'backend' ? 'backend' : 'invalid-input',
      });
      return;
    }

    // Re-read: the analysis is a network round trip, and the owner may have
    // typed into the box while it was in flight — WITHOUT clicking away, which
    // is the case `node.prompt` alone cannot see (review C7). The live draft
    // wins whenever the generator is attached to this card; a non-empty draft
    // counts as "already has content" and goes to the replace/append choice.
    const current = liveNodePrompt(nodeId).trim();
    if (!current) {
      generatorDraftRef.current = { nodeId, value: prompt };
      await commit(document => setNodePromptContent(document, nodeId, prompt), { history: true });
      return;
    }
    setReversePromptChoice({ nodeId, anchor: anchor ?? null, prompt });
  }, [commit, findImageNode, imageAnalyzer, liveNodePrompt]);

  /** "Yes, spend it": the one place the billed vision call is started from. */
  const confirmReversePromptSpend = React.useCallback(() => {
    const request = reversePromptSpend;
    setReversePromptSpend(null);
    if (!request) return;
    void runReversePrompt(request.nodeId, request.anchor ?? undefined);
  }, [reversePromptSpend, runReversePrompt]);

  const applyReversePrompt = React.useCallback(async (mode: 'replace' | 'append') => {
    const choice = reversePromptChoice;
    setReversePromptChoice(null);
    if (!choice) return;
    // The same live read: "add underneath" must append under what is actually
    // in the box, not under the last thing that happened to be committed.
    const existing = liveNodePrompt(choice.nodeId).trim();
    const next = mode === 'replace' || !existing
      ? choice.prompt
      : `${existing}\n\n${choice.prompt}`;
    generatorDraftRef.current = { nodeId: choice.nodeId, value: next };
    await commit(
      document => setNodePromptContent(document, choice.nodeId, next),
      { history: true },
    );
  }, [commit, liveNodePrompt, reversePromptChoice]);

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
      // §7.6: switching the current picture is the one card-level change a
      // landed result allows, so it goes on the undo stack like any edit.
      selectVariant: (nodeId, index) => {
        void commit(
          document => setNodeActiveVariantContent(document, nodeId, index),
          { history: true },
        );
      },
      openTool: (nodeId, toolId) => {
        const found = findImageNode(nodeId);
        if (!found?.node.mediaRef) return;
        // P5 W4: inpaint and erase are now "circle it on the picture" rather
        // than "describe where in words". Their sentence is prefilled into the
        // SAME shared input, mounted at the bottom of the editor (§7.4.3).
        if (isMaskImageTool(toolId)) {
          setToolIntent(null);
          openMaskEditor({ nodeId, toolId, mediaRef: found.node.mediaRef });
          return;
        }
        // P6: outpainting is a frame you drag, not a direction you describe.
        // The "more" drawer entry is unchanged; what it opens is.
        if (toolId === 'expand') {
          setToolIntent(null);
          openExpandEditor({ nodeId, mediaRef: found.node.mediaRef });
          return;
        }
        // §7.4.3: the remaining tools write their instruction into the card's
        // own input box, placeholders and all, and wait there. Nothing is
        // dispatched by the press — the round send button is still the only
        // control on this board that spends money.
        //
        // Adversarial review C3: and nothing is SAVED by the press either. The
        // template is a draft the box shows while the intent lives; the card's
        // own prompt is untouched, so Escape (or picking another card) brings
        // it back and a later plain send can never spend money on the template.
        const template = IMAGE_TOOL_DEFINITIONS
          .find(entry => entry.toolId === toolId)?.instructionTemplate ?? '';
        setToolIntent({ nodeId, toolId, template });
        // Same live-draft bookkeeping the reverse-prompt lane does, so a slow
        // arrival cannot land on top of what the box is showing.
        generatorDraftRef.current = { nodeId, value: template };
        // The box only exists under the SELECTED card, so writing into it
        // means selecting that card — otherwise the press would look like it
        // did nothing at all.
        selectedNodeIdsRef.current = [nodeId];
        setViewportTransform(viewportRef.current);
        setSelectedNodeIds([nodeId]);
        setFlowNodes(nodes => nodes.map(node => (
          node.selected === (node.id === nodeId)
            ? node
            : { ...node, selected: node.id === nodeId }
        )));
      },
      reversePrompt: (nodeId, anchor) => {
        // Owner approval 2026-08-27: the vision call is billed, so the press
        // only opens the confirmation. `runReversePrompt` is reached from the
        // confirm button and nowhere else.
        setReversePromptChoice(null);
        setReversePromptSpend({ nodeId, anchor: anchor ?? null });
      },
      cropImage: nodeId => {
        const found = findImageNode(nodeId);
        if (!found?.node.mediaRef) return;
        setToolIntent(null);
        openCropEditor({ nodeId, mediaRef: found.node.mediaRef });
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
        openPopover('params', nodeId, anchor);
      },
      openModel: (nodeId, anchor) => {
        if (!findMediaNode(nodeId)) return;
        openPopover('model', nodeId, anchor);
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
  }, [
    commit,
    findImageNode,
    findMediaNode,
    generateForNode,
    openCropEditor,
    openExpandEditor,
    openMaskEditor,
    openPopover,
    retryGeneration,
  ]);

  /**
   * P4 review C5 (plan §265): every piece of panel memory is scoped to ONE
   * document. Switching workspaces used to keep the undo stack and the
   * clipboard, so a Ctrl+Z in workspace B could re-insert a card deleted in
   * workspace A — mediaRef and all, pointing at A's files. Anything that
   * remembers nodes by id is therefore dropped the moment the document
   * changes; the document itself is reloaded by the effect below.
   */
  React.useEffect(() => {
    resetHistory();
    clipboardRef.current = null;
    setClipboard(null);
    pasteRunRef.current = 0;
    selectedNodeIdsRef.current = [];
    setSelectedNodeIds([]);
    setContextMenu(null);
    setDeleteRequest(null);
    setViewerNodeId(null);
    closeAllPopovers();
    setStylePickerNodeId(null);
    setNotice(null);
    setToolIntent(null);
    closeMaskEditor();
    closeCropEditor();
    // Outpainting is the third editor and was simply missed here: an open
    // frame editor survived the switch still pointing at the OLD document's
    // picture, so the board came back under a full-screen editor for a card
    // that is not on it. (Confirming it early-returns because the node cannot
    // be found, so nothing was ever paid for — but the surface was wrong.)
    closeExpandEditor();
    // The "charge me again?" question belongs to one card in one document too.
    cancelRetryRespend();
    // A5 / C1: "this card will not file itself" is remembered by node id, and
    // node ids are only unique within a document. Carried across, it weakened
    // the badge of whatever card in the NEW document happened to share an id.
    manualReturnNodeIdsRef.current.clear();
    // P5 review C9: the three surfaces P5 added are node-scoped too. An
    // overflow drawer or a "replace or append" choice left standing across a
    // document switch points at a node id that no longer exists here, and a
    // stale pending id would keep the reverse-prompt entry disabled forever.
    setOverflow(null);
    overflowAnchorRef.current = null;
    setReversePromptChoice(null);
    setReversePromptSpend(null);
    setReversePromptPendingNodeId(null);
    reversePromptNodeIdRef.current = null;
  }, [
    cancelRetryRespend,
    closeAllPopovers,
    closeCropEditor,
    closeExpandEditor,
    closeMaskEditor,
    documentId,
    resetHistory,
    workspaceId,
  ]);

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
      // P5: while a mask or crop editor is open the board's own shortcuts are
      // suspended wholesale. Ctrl+Z there means "undo my last stroke" (the
      // editor owns an isolated stack), and Delete must not remove cards the
      // user cannot even see. Escape stays with the dismiss contract.
      if (editorOpenRef.current) return;
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

  /**
   * "Here it is": the card becomes the selection, so the board's one input
   * surface follows it. Stable, so the effects that reach for it keep the
   * dependency lists they had.
   */
  const revealNode = React.useCallback((nodeId: string) => {
    selectedNodeIdsRef.current = [nodeId];
    setSelectedNodeIds([nodeId]);
  }, []);

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

  // —— K3: the short-drama lane, both directions ——————————————————————————

  /**
   * Landing a card, the badge that says where it came from, and the press that
   * sends it home. One lane, one file — see `useCanvasShortDramaBridge`.
   */
  const shortDrama = useCanvasShortDramaBridge({
    workspacePath,
    flowNodes,
    documentRef,
    commit,
    setFlowNodes,
    revealNode,
    nextSpawnPosition,
    createNodeId: () => createInfiniteCanvasId('node'),
    pendingDomainImport,
    readShortDramaProject,
    sendPictureBackToShortDrama,
    t,
  });
  const { domainOrigins, sendNodeToShortDrama } = shortDrama;

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

  const onChangeGenerationParams = React.useCallback((params: InfiniteCanvasGenerationParams) => {
    const nodeId = popovers.params.nodeId;
    if (!nodeId) return;
    void commit(document => setNodeGenerationParamsContent(document, nodeId, params), { history: true });
  }, [commit, popovers.params.nodeId]);

  const onChangeGenerationModel = React.useCallback((params: InfiniteCanvasGenerationParams) => {
    const nodeId = popovers.model.nodeId;
    if (!nodeId) return;
    void commit(document => setNodeGenerationParamsContent(document, nodeId, params), { history: true });
  }, [commit, popovers.model.nodeId]);

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

  // §4: the card pill's output group and its overflow drawer. Every branch
  // reuses the port the right-click menu or the shortcut already calls — no
  // second save lane, no second delete, no second reveal.
  React.useEffect(() => {
    cardToolbarActionsRef.current = {
      saveMediaAs: nodeId => {
        const item = viewerItems.find(entry => entry.nodeId === nodeId);
        if (item) onSaveMediaAs(item);
      },
      sendToShortDrama: sendNodeToShortDrama,
      overflow: (nodeId, action) => {
        switch (action) {
          case 'expand':
            nodeActionsRef.current.openTool(nodeId, 'expand');
            return;
          case 'reverse-prompt':
            // Anchored to the "more" button, which is still on screen: the
            // drawer that carried the entry has just closed.
            nodeActionsRef.current.reversePrompt(nodeId, overflowAnchorRef.current ?? undefined);
            return;
          case 'derive-video':
            nodeActionsRef.current.deriveVideoCard(nodeId);
            return;
          case 'reveal':
            onRevealMedia(nodeId);
            return;
          case 'copy':
            copyNodes([nodeId]);
            return;
          case 'duplicate':
            duplicateNodes([nodeId]);
            return;
          case 'delete':
            requestDeleteNodes([nodeId]);
        }
      },
    };
  }, [
    copyNodes,
    duplicateNodes,
    onRevealMedia,
    onSaveMediaAs,
    requestDeleteNodes,
    sendNodeToShortDrama,
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
    return projectGeneratorTarget(flowNodes.find(entry => entry.id === selectedNodeIds[0]));
  }, [flowNodes, selectedNodeIds]);

  /**
   * P5 second pass (owner: "所有的都是共用输入框的"): the mask editor mounts the
   * SAME generator, so it needs the same projection — of the card the editor
   * is open on, taken from the request rather than from the selection.
   */
  const maskGeneratorProps = React.useMemo(() => {
    if (!maskRequest) return undefined;
    const target = projectGeneratorTarget(
      flowNodes.find(entry => entry.id === maskRequest.nodeId),
    );
    return target ? { target } : undefined;
  }, [flowNodes, maskRequest]);

  /** The same projection for the outpainting editor's card. */
  const expandGeneratorProps = React.useMemo(() => {
    if (!expandRequest) return undefined;
    const target = projectGeneratorTarget(
      flowNodes.find(entry => entry.id === expandRequest.nodeId),
    );
    return target ? { target } : undefined;
  }, [expandRequest, flowNodes]);

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
    // §7.4.3: the same round button, two destinations. If this card is
    // carrying a five-tool instruction the user just finished editing, the
    // press is that tool — derive a new card off this picture — and otherwise
    // it is the ordinary generation it has always been.
    //
    // C3: the tool branch runs BEFORE the prompt is persisted, because a tool
    // instruction belongs to the card it derives, not to the card it was typed
    // on. `confirmToolInstruction` already writes it onto the new card.
    if (toolIntent && toolIntent.nodeId === target.nodeId) {
      await confirmToolInstruction(toolIntent, prompt.trim());
      return;
    }
    if (prompt !== target.prompt) {
      await commit(document => setNodePromptContent(document, target.nodeId, prompt), {
        history: true,
      });
    }
    await generateForNode(target.nodeId);
  }, [commit, confirmToolInstruction, generateForNode, generatorTarget, toolIntent]);

  /**
   * A prefilled tool instruction belongs to the card it was written into. Look
   * away — select another card, or nothing — and the intent goes with the box
   * it was living in, so the next card's send button cannot inherit it.
   */
  React.useEffect(() => {
    if (!toolIntent) return;
    if (selectedNodeIds.length === 1 && selectedNodeIds[0] === toolIntent.nodeId) return;
    setToolIntent(null);
  }, [selectedNodeIds, toolIntent]);

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
        {/*
          * H2: the only exit used to be closing the tab. Opening the board is
          * a read that usually succeeds on the second try, so offer the second
          * try here instead of asking the user to throw the panel away.
          */}
        <button
          type="button"
          className="infinite-canvas-panel__error-retry"
          onClick={documentLane.retryLoad}
        >
          {t('infiniteCanvas.loadRetry')}
        </button>
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
          // A busy notice is a status, not an alert: it must not interrupt a
          // screen reader mid-sentence the way a failure legitimately does.
          role={notice.busy ? 'status' : 'alert'}
          data-error-kind={notice.errorKind}
          data-notice-busy={notice.busy ? 'true' : undefined}
          aria-busy={notice.busy || undefined}
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
      {popovers.params.target ? (
        <InfiniteCanvasParamsPopover
          mediaKind={popovers.params.target.mediaKind}
          params={popovers.params.target.params}
          anchor={popovers.params.anchor}
          onChange={onChangeGenerationParams}
          onClose={popovers.params.close}
        />
      ) : null}
      {popovers.model.target ? (
        <InfiniteCanvasModelPopover
          mediaKind={popovers.model.target.mediaKind}
          params={popovers.model.target.params}
          anchor={popovers.model.anchor}
          onChange={onChangeGenerationModel}
          onClose={popovers.model.close}
        />
      ) : null}
      {deleteRequest ? (
        <InfiniteCanvasDeleteConfirmDialog
          summary={deleteRequest}
          onConfirm={confirmDeleteRequest}
          onCancel={() => setDeleteRequest(null)}
        />
      ) : null}
      {dispatch.retryConfirmNodeId ? (
        <InfiniteCanvasRetryCancelledDialog
          nodeId={dispatch.retryConfirmNodeId}
          onConfirm={dispatch.confirmRetryRespend}
          onCancel={dispatch.cancelRetryRespend}
        />
      ) : null}
      <div
        className="infinite-canvas-panel__flow"
        aria-label={t('infiniteCanvas.title')}
        ref={flowRef}
      >
        {/*
          K3: the badge handles reach the cards through a context rather than
          the node data, so a lookup settling re-renders the badges and nothing
          else — the projection, and every card's media, stay put.
        */}
        <InfiniteCanvasDomainOriginProvider origins={domainOrigins}>
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
        </InfiniteCanvasDomainOriginProvider>
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
        {/*
          While a board-filling editor is open the SAME generator is mounted
          inside it (owner, 2026-08-27), so the card-anchored one steps aside:
          two prompt boxes for one card is exactly the confusion the shared
          input was meant to remove.
        */}
        {generatorTarget && generatorPlacement && !maskRequest
          && !cropRequest && !expandRequest ? (
          <InfiniteCanvasGenerator
            target={generatorTarget}
            placement={generatorPlacement}
            // §7.4.3: present only while this card is carrying a prefilled
            // tool instruction; it is what lets the box say "there is still a
            // 【】 to fill in" on its own grey line instead of in a dialog.
            instructionTemplate={toolIntent?.nodeId === generatorTarget.nodeId
              ? toolIntent.template
              : undefined}
            references={generatorReferences}
            resolvePreviewUrl={resolvePreviewUrl}
            onSubmit={prompt => {
              void onGeneratorSubmit(prompt);
            }}
            onCommitPrompt={prompt => {
              generatorDraftRef.current = { nodeId: generatorTarget.nodeId, value: prompt };
              // C3: while a tool instruction is prefilled the box is showing a
              // draft that belongs to the tool, not to this card. Blurring it
              // must not save it over the card's own prompt.
              if (toolIntent?.nodeId === generatorTarget.nodeId) return;
              void commit(
                document => setNodePromptContent(document, generatorTarget.nodeId, prompt),
                { history: true },
              );
            }}
            // Review C7: the panel keeps the box's live text so a slow
            // reverse-prompt cannot land on top of it.
            onDraftChange={prompt => {
              generatorDraftRef.current = { nodeId: generatorTarget.nodeId, value: prompt };
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
      {/*
        P5: the two editing states. Children of the panel root, not of
        document.body — a body portal would leave the --canvas-* variable
        scope and the panel-level test selectors behind (P4 §2.1).
      */}
      {maskRequest && maskGeneratorProps ? (
        <InfiniteCanvasMaskEditor
          toolId={maskRequest.toolId}
          mediaRef={maskRequest.mediaRef}
          resolvePreviewUrl={resolvePreviewUrl}
          // §6's input box, mounted in the editor rather than reinvented there.
          generator={{
            target: maskGeneratorProps.target,
            onOpenParams: anchor =>
              nodeActionsRef.current.openParams(maskRequest.nodeId, anchor),
            onOpenModel: anchor =>
              nodeActionsRef.current.openModel(maskRequest.nodeId, anchor),
          }}
          onConfirm={payload => {
            void editors.mask.confirm(payload.base64Png, payload.instruction);
          }}
          onClose={editors.mask.close}
        />
      ) : null}
      {/*
        §4: the "more (…)" drawer. Same compact anchored surface and same
        dismissal contract as every other canvas popover; it just happens to
        hold menu items.
      */}
      {overflow ? (() => {
        const found = findMediaNode(overflow.nodeId);
        const hasMedia = Boolean(found?.node.mediaRef);
        const isImage = found?.node.kind === 'image';
        return (
          <InfiniteCanvasOverflowMenu
            anchor={overflow.anchor}
            available={{
              expand: isImage && hasMedia,
              reversePrompt: isImage && hasMedia,
              deriveVideo: isImage && hasMedia,
              reveal: hasMedia,
            }}
            reversePromptPending={reversePromptPendingNodeId === overflow.nodeId}
            onDismiss={() => setOverflow(null)}
            onAction={(action: InfiniteCanvasOverflowAction) => {
              setOverflow(null);
              cardToolbarActionsRef.current.overflow(overflow.nodeId, action);
            }}
          />
        );
      })() : null}
      {/*
        P5 W7: the prompt box was not empty, so the reversed prompt waits for
        one word from the owner. Anchored to the button that produced it and
        dismissed like every other canvas surface (outside press / Escape),
        which is also how "neither, forget it" is expressed — there is no
        cancel button, per the visual language.
      */}
      {/*
        Owner approval 2026-08-27: reverse-prompt is billed, so the press opens
        this compact confirmation instead of calling anything. §7.1's anchored
        surface, two words of copy, one confirm and one way out — dismissing it
        by any route (outside press, Escape, "not now") calls nothing at all.
      */}
      {reversePromptSpend ? (
        <InfiniteCanvasPopover
          kind="reverse-prompt-spend"
          className="infinite-canvas-picker--reverse-prompt"
          anchor={reversePromptSpend.anchor}
          width={INFINITE_CANVAS_POPOVER_WIDTH.reversePrompt}
          label={t('infiniteCanvas.reversePrompt.spend.title')}
          onDismiss={() => setReversePromptSpend(null)}
        >
          <p className="infinite-canvas-picker__state">
            {t('infiniteCanvas.reversePrompt.spend.body')}
          </p>
          <div className="infinite-canvas-reverse-prompt__actions">
            <button
              type="button"
              className="infinite-canvas-picker__pill"
              data-canvas-reverse-prompt-action="spend-cancel"
              onClick={() => setReversePromptSpend(null)}
            >
              {t('infiniteCanvas.reversePrompt.spend.cancel')}
            </button>
            <button
              type="button"
              className="infinite-canvas-picker__pill"
              data-canvas-reverse-prompt-action="spend-confirm"
              data-canvas-reverse-prompt-node={reversePromptSpend.nodeId}
              onClick={confirmReversePromptSpend}
            >
              {t('infiniteCanvas.reversePrompt.spend.confirm')}
            </button>
          </div>
        </InfiniteCanvasPopover>
      ) : null}
      {reversePromptChoice ? (
        <InfiniteCanvasPopover
          kind="reverse-prompt"
          className="infinite-canvas-picker--reverse-prompt"
          anchor={reversePromptChoice.anchor}
          width={INFINITE_CANVAS_POPOVER_WIDTH.reversePrompt}
          label={t('infiniteCanvas.reversePrompt.choiceTitle')}
          onDismiss={() => setReversePromptChoice(null)}
        >
          <p className="infinite-canvas-picker__state">
            {t('infiniteCanvas.reversePrompt.choiceHint')}
          </p>
          <p
            className="infinite-canvas-reverse-prompt__preview"
            data-canvas-reverse-prompt="preview"
          >
            {reversePromptChoice.prompt}
          </p>
          <div className="infinite-canvas-reverse-prompt__actions">
            <button
              type="button"
              className="infinite-canvas-picker__pill"
              data-canvas-reverse-prompt-action="replace"
              onClick={() => { void applyReversePrompt('replace'); }}
            >
              {t('infiniteCanvas.reversePrompt.replace')}
            </button>
            <button
              type="button"
              className="infinite-canvas-picker__pill"
              data-canvas-reverse-prompt-action="append"
              onClick={() => { void applyReversePrompt('append'); }}
            >
              {t('infiniteCanvas.reversePrompt.append')}
            </button>
          </div>
        </InfiniteCanvasPopover>
      ) : null}
      {/*
        P6 / §7.4.4: the third editing state. Same three-part stack as the
        other two — pill, media, shared generator — and the generator keeps its
        writing area: the frame says how much room to add, the sentence
        underneath says what should go in it, and it is optional.
      */}
      {expandRequest && expandGeneratorProps ? (
        <InfiniteCanvasFrameEditor
          direction="outward"
          mediaRef={expandRequest.mediaRef}
          resolvePreviewUrl={resolvePreviewUrl}
          generator={{
            target: expandGeneratorProps.target,
            onOpenParams: anchor =>
              nodeActionsRef.current.openParams(expandRequest.nodeId, anchor),
            onOpenModel: anchor =>
              nodeActionsRef.current.openModel(expandRequest.nodeId, anchor),
          }}
          onConfirm={payload => {
            void editors.expand.confirm(
              payload.base64Png,
              payload.insets,
              payload.prompt,
            );
          }}
          onClose={editors.expand.close}
        />
      ) : null}
      {cropRequest ? (
        <InfiniteCanvasFrameEditor
          direction="inward"
          mediaRef={cropRequest.mediaRef}
          resolvePreviewUrl={resolvePreviewUrl}
          onConfirm={payload => {
            void editors.crop.confirm(payload.base64Png);
          }}
          onClose={editors.crop.close}
        />
      ) : null}
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
