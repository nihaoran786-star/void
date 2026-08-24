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
import { Clapperboard, ImagePlus, Sparkles, Type } from 'lucide-react';

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
import type { InfiniteCanvasMediaJobReader } from '@/shared/services/infinite-canvas';
import {
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
} from './infiniteCanvasDocumentGateway';
import {
  createInfiniteCanvasGenerationRuntime,
  type InfiniteCanvasGenerationRuntime,
} from './infiniteCanvasGenerationRuntime';
import {
  addImageNodeContent,
  addTextNodeContent,
  beginDerivedOperationContent,
  connectNodesContent,
  createInfiniteCanvasId,
  failOperationContent,
  INFINITE_CANVAS_IMAGE_NODE_TYPE,
  INFINITE_CANVAS_TEXT_NODE_TYPE,
  INFINITE_CANVAS_VIDEO_NODE_TYPE,
  moveNodeContent,
  removeEdgesContent,
  removeFailedOperationContent,
  removeNodesContent,
  retryOperationContent,
  setNodeStylePresetContent,
  setNodeTextContent,
  setViewportContent,
  toFlowEdgeViews,
  toFlowNodeViews,
} from './infiniteCanvasPanelModel';
import {
  addBlankGenerationCardContent,
  addBlankVideoCardContent,
  beginSelfGenerationContent,
  collectReferenceNodes,
  setNodePromptContent,
} from './infiniteCanvasGenerationModel';
import {
  InfiniteCanvasImageNode,
  InfiniteCanvasTextNode,
  InfiniteCanvasVideoNode,
  type InfiniteCanvasImagePreviewResolver,
  type InfiniteCanvasMediaRef,
} from './InfiniteCanvasNodes';
import { resolveInfiniteCanvasMediaPreviewUrl } from './infiniteCanvasPreviewResolver';
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
  const [initialViewport, setInitialViewport] = React.useState<Viewport>({
    x: 0,
    y: 0,
    zoom: 1,
  });

  const [imagePickerOpen, setImagePickerOpen] = React.useState(false);
  const [stylePickerNodeId, setStylePickerNodeId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<GenerationNotice | null>(null);
  const [toolDialog, setToolDialog] = React.useState<ToolDialogRequest | null>(null);

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
  });

  const openStylePicker = React.useCallback((nodeId: string) => {
    setStylePickerNodeId(nodeId);
  }, []);

  const projectDocument = React.useCallback((document: InfiniteCanvasDocument) => {
    documentRef.current = document;
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

  const commit = React.useCallback(async (mutator: InfiniteCanvasMutator) => {
    const result = await service.mutateDefaultDocument(workspaceRef, mutator);
    if (result.status === 'applied') {
      projectDocument(result.document);
    } else {
      setState({ phase: 'failed', error: result.error });
    }
  }, [projectDocument, service, workspaceRef]);

  /** Re-projects the shared in-memory truth after bridge-side mutations. */
  const refreshFromService = React.useCallback(async () => {
    const result = await service.loadDefaultDocument(workspaceRef);
    if (result.status !== 'failed') projectDocument(result.document);
  }, [projectDocument, service, workspaceRef]);

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
      return setNodePromptContent({ ...current, ...begun }, derivedNodeId, prompt);
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

  const retryGeneration = React.useCallback(async (nodeId: string) => {
    const found = findMediaNode(nodeId);
    if (!found) return;
    const { document, node } = found;
    const generation = node.generation;
    if (!generation || generation.status !== 'failed') return;

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
      ...(isDerived && generation.toolId !== 'generate' && source?.mediaRef
        ? { editTargetMediaRef: source.mediaRef }
        : {}),
    });
  }, [commit, findMediaNode, prepareDispatch, submitOperation]);

  React.useEffect(() => {
    nodeActionsRef.current = {
      commitText: (nodeId, text) => {
        void commit(document => setNodeTextContent(document, nodeId, text));
      },
      commitPrompt: (nodeId, prompt) => {
        void commit(document => setNodePromptContent(document, nodeId, prompt));
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
        });
      },
    };
  }, [commit, findImageNode, findMediaNode, generateForNode, retryGeneration]);

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

  const onNodesChange = React.useCallback((changes: NodeChange[]) => {
    setFlowNodes(nodes => applyNodeChanges(changes, nodes));
    const removedIds = changes
      .filter(change => change.type === 'remove')
      .map(change => change.id);
    if (removedIds.length > 0) {
      void commit(document => removeNodesContent(document, removedIds));
    }
    for (const change of changes) {
      if (change.type === 'position' && change.dragging === false && change.position) {
        const { id } = change;
        const position = change.position;
        void commit(document => moveNodeContent(document, id, position));
      }
    }
  }, [commit]);

  const onEdgesChange = React.useCallback((changes: EdgeChange[]) => {
    setFlowEdges(edges => applyEdgeChanges(changes, edges));
    const removedIds = changes
      .filter(change => change.type === 'remove')
      .map(change => change.id);
    if (removedIds.length > 0) {
      void commit(document => removeEdgesContent(document, removedIds));
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
    ));
  }, [commit]);

  const onMoveEnd = React.useCallback((_event: unknown, viewport: Viewport) => {
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
    ));
  }, [commit, nextSpawnPosition]);

  const onAddGenerationCard = React.useCallback(() => {
    const position = nextSpawnPosition();
    void commit(document => addBlankGenerationCardContent(
      document,
      createInfiniteCanvasId('node'),
      position,
    ));
  }, [commit, nextSpawnPosition]);

  const onAddVideoCard = React.useCallback(() => {
    const position = nextSpawnPosition();
    void commit(document => addBlankVideoCardContent(
      document,
      createInfiniteCanvasId('node'),
      position,
    ));
  }, [commit, nextSpawnPosition]);

  const onPickImage = React.useCallback((mediaRef: InfiniteCanvasMediaRef) => {
    const position = nextSpawnPosition();
    setImagePickerOpen(false);
    void commit(document => addImageNodeContent(
      document,
      createInfiniteCanvasId('node'),
      position,
      mediaRef,
    ));
  }, [commit, nextSpawnPosition]);

  const onPickStyle = React.useCallback((presetId: string | undefined) => {
    const nodeId = stylePickerNodeId;
    setStylePickerNodeId(null);
    if (!nodeId) return;
    void commit(document => setNodeStylePresetContent(document, nodeId, presetId));
  }, [commit, stylePickerNodeId]);

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
    <div className="infinite-canvas-panel" data-canvas-surface-state="ready">
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
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onMoveEnd={onMoveEnd}
          defaultViewport={initialViewport}
          minZoom={0.1}
          maxZoom={4}
        >
          <Background />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
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
    </div>
  );
};

InfiniteCanvasPanel.displayName = 'InfiniteCanvasPanel';

export default InfiniteCanvasPanel;
