/**
 * Infinite Canvas panel (M3): the reactflow projection of the per-workspace
 * canvas document.
 *
 * The document truth lives in the infinite-canvas Domain Module; this panel
 * loads it once, mirrors it into reactflow view state, and routes every edit
 * back through DocumentService commands (coalesced CAS writes). The component
 * never persists anything itself.
 */
import React from 'react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
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

import { useI18n } from '@/infrastructure/i18n';
import type {
  InfiniteCanvasDocument,
  InfiniteCanvasDocumentError,
  InfiniteCanvasDocumentService,
  InfiniteCanvasMutator,
} from '@/shared/services/infinite-canvas';
import { resolveWorkspaceMediaPreviewUrl } from '@/shared/services/workspace-media/WorkspaceMediaPreviewResolver';
import { joinWorkspaceMediaPath } from '@/shared/services/workspace-media/WorkspaceMediaPaths';
import { getInfiniteCanvasDocumentService } from './infiniteCanvasDocumentGateway';
import {
  addTextNodeContent,
  connectNodesContent,
  createInfiniteCanvasId,
  INFINITE_CANVAS_IMAGE_NODE_TYPE,
  INFINITE_CANVAS_TEXT_NODE_TYPE,
  moveNodeContent,
  removeEdgesContent,
  removeNodesContent,
  setNodeTextContent,
  setViewportContent,
  toFlowEdgeViews,
  toFlowNodeViews,
} from './infiniteCanvasPanelModel';
import {
  InfiniteCanvasImageNode,
  InfiniteCanvasTextNode,
  type InfiniteCanvasImagePreviewResolver,
} from './InfiniteCanvasNodes';
import './InfiniteCanvasPanel.scss';

// The node renderers take their narrowed data props; reactflow's NodeTypes is
// keyed on the erased NodeProps shape, so the registration map is cast once.
const NODE_TYPES = {
  [INFINITE_CANVAS_TEXT_NODE_TYPE]: InfiniteCanvasTextNode,
  [INFINITE_CANVAS_IMAGE_NODE_TYPE]: InfiniteCanvasImageNode,
} as unknown as NodeTypes;

function extensionOf(relativePath: string): string | undefined {
  const fileName = relativePath.split(/[\\/]/).pop() || relativePath;
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : undefined;
}

const defaultPreviewResolver: InfiniteCanvasImagePreviewResolver = mediaRef => (
  resolveWorkspaceMediaPreviewUrl({
    filePath: joinWorkspaceMediaPath(mediaRef.workspacePath, mediaRef.relativePath),
    extension: extensionOf(mediaRef.relativePath),
    kind: 'image',
  })
);

type PanelState =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'failed'; error: InfiniteCanvasDocumentError };

export interface InfiniteCanvasPanelProps {
  workspaceId: string;
  workspacePath: string;
  isActive: boolean;
  /** Injection seams for tests; production uses the shared singletons. */
  service?: InfiniteCanvasDocumentService;
  resolvePreviewUrl?: InfiniteCanvasImagePreviewResolver;
}

export const InfiniteCanvasPanel: React.FC<InfiniteCanvasPanelProps> = ({
  workspaceId,
  workspacePath,
  service: injectedService,
  resolvePreviewUrl = defaultPreviewResolver,
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

  const [state, setState] = React.useState<PanelState>({ phase: 'loading' });
  const documentRef = React.useRef<InfiniteCanvasDocument | undefined>(undefined);
  const [flowNodes, setFlowNodes] = React.useState<Node[]>([]);
  const [flowEdges, setFlowEdges] = React.useState<Edge[]>([]);
  const [initialViewport, setInitialViewport] = React.useState<Viewport>({
    x: 0,
    y: 0,
    zoom: 1,
  });

  const commitText = React.useRef<(nodeId: string, text: string) => void>(() => undefined);

  const projectDocument = React.useCallback((document: InfiniteCanvasDocument) => {
    documentRef.current = document;
    setFlowNodes(toFlowNodeViews(document.nodes).map(view => ({
      id: view.id,
      type: view.type,
      position: view.position,
      data: view.type === INFINITE_CANVAS_TEXT_NODE_TYPE
        ? {
            text: view.data.text ?? '',
            onCommitText: (nodeId: string, text: string) => commitText.current(nodeId, text),
          }
        : {
            mediaRef: view.data.mediaRef!,
            stylePresetId: view.data.stylePresetId,
            resolvePreviewUrl,
          },
    })));
    setFlowEdges(toFlowEdgeViews(document.edges));
  }, [resolvePreviewUrl]);

  const commit = React.useCallback(async (mutator: InfiniteCanvasMutator) => {
    const result = await service.mutateDefaultDocument(workspaceRef, mutator);
    if (result.status === 'applied') {
      projectDocument(result.document);
    } else {
      setState({ phase: 'failed', error: result.error });
    }
  }, [projectDocument, service, workspaceRef]);

  React.useEffect(() => {
    commitText.current = (nodeId, text) => {
      void commit(document => setNodeTextContent(document, nodeId, text));
    };
  }, [commit]);

  React.useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    void service.loadDefaultDocument(workspaceRef).then(result => {
      if (cancelled) return;
      if (result.status === 'failed') {
        setState({ phase: 'failed', error: result.error });
        return;
      }
      projectDocument(result.document);
      setInitialViewport(result.document.viewport);
      setState({ phase: 'ready' });
    });
    return () => {
      cancelled = true;
    };
  }, [projectDocument, service, workspaceRef]);

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
          {t('infiniteCanvas.toolbar.addText')}
        </button>
      </div>
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
        </ReactFlow>
      </div>
    </div>
  );
};

InfiniteCanvasPanel.displayName = 'InfiniteCanvasPanel';

export default InfiniteCanvasPanel;
