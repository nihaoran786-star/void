/**
 * The reactflow projection of a canvas document.
 *
 * One document in, `{ nodes, edges }` out — plus the H3 reuse cache, threaded
 * through as a value so the projection itself keeps no state. The panel used
 * to carry all of this inline, where the eight action callbacks woven into
 * each card's `data` made it the hardest passage in the file to read.
 *
 * Nothing here dispatches, mutates or commits: every callback the projection
 * writes into a card reaches back through a ref the panel owns.
 */
import type { Edge, Node } from '@xyflow/react';

import type {
  ImageToolId,
  InfiniteCanvasDocument,
} from '@/shared/services/infinite-canvas';
import {
  referenceImageLabel,
  summarizeInfiniteCanvasGenerationParams,
} from '@/shared/services/infinite-canvas';
import type { StylePresetCatalog } from '@/shared/services/style-preset';

import { collectReferenceNodes } from './infiniteCanvasGenerationModel';
import type { InfiniteCanvasImagePreviewResolver } from './InfiniteCanvasNodes';
import type { InfiniteCanvasOverflowAction } from './InfiniteCanvasOverflowMenu';
import {
  INFINITE_CANVAS_IMAGE_NODE_TYPE,
  INFINITE_CANVAS_TEXT_NODE_TYPE,
  INFINITE_CANVAS_VIDEO_NODE_TYPE,
  toFlowEdgeViews,
  toFlowNodeViews,
  type InfiniteCanvasFlowNodeView,
} from './infiniteCanvasPanelModel';

/** §3: one custom edge — a hairline bezier with the midpoint insert handle. */
export const INFINITE_CANVAS_EDGE_TYPE = 'infinite-canvas-edge';

/** Shared empty list so a card with no references keeps one stable identity. */
const EMPTY_REFERENCE_LABELS: readonly string[] = [];

export interface InfiniteCanvasNodeActions {
  commitText: (nodeId: string, text: string) => void;
  commitPrompt: (nodeId: string, prompt: string) => void;
  generate: (nodeId: string) => void;
  openTool: (nodeId: string, toolId: ImageToolId) => void;
  /** P5 W2: opens the crop editor on a card that carries a picture. */
  cropImage: (nodeId: string) => void;
  /** P5 W7: reverse-prompts the card's picture into its own prompt box. */
  reversePrompt: (nodeId: string, anchor?: HTMLElement) => void;
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
  /** §7.6: picks which of the card's pictures the card face shows. */
  selectVariant: (nodeId: string, index: number) => void;
}

/**
 * §4's two output-group entries. They live in their own ref because the
 * handlers behind them (the save port, the context menu placement) are
 * declared far below the main node-action effect; a second ref keeps both
 * effects honest instead of forcing one giant declaration order.
 */
export interface InfiniteCanvasCardToolbarActions {
  saveMediaAs: (nodeId: string) => void;
  overflow: (nodeId: string, action: InfiniteCanvasOverflowAction) => void;
  /** K3 §5.2: send this card's picture home to the asset it belongs to. */
  sendToShortDrama: (nodeId: string) => void;
}

export interface InfiniteCanvasEdgeActions {
  disconnect: (edgeId: string) => void;
}

/** A `{ current }` box, so the panel can pass its own refs straight through. */
interface ActionRef<T> {
  readonly current: T;
}

/**
 * H3: what the last projection produced for one card, so the next one can
 * hand back the same `data` object when nothing about the card changed.
 */
export interface InfiniteCanvasProjectionCacheEntry {
  /** Structural fingerprint of everything `data` is built from. */
  key: string;
  data: Record<string, unknown>;
}

/**
 * The cache as a whole. `owner` is the set of inputs the cached objects closed
 * over: a cached `data` holds the callbacks and the style catalog of the
 * projection that built it, so the whole cache is void the moment any of them
 * changes.
 */
export interface InfiniteCanvasProjectionCache {
  owner: readonly unknown[];
  entries: Map<string, InfiniteCanvasProjectionCacheEntry>;
}

export function emptyInfiniteCanvasProjectionCache(): InfiniteCanvasProjectionCache {
  return { owner: [], entries: new Map() };
}

/**
 * Why a fingerprint and not object identity: a commit that lands after the
 * coalescing window has already flushed re-reads and re-parses the file, so
 * every document node is a new object even when not one byte changed. The
 * projected view data is small, plain and built in a fixed field order, so
 * serializing it is a sound "is this the same card" test — and it is nothing
 * next to the cost this avoids, which is re-reading and re-decoding the
 * card's picture from disk.
 */
const PROJECTION_KEY_SEPARATOR = String.fromCharCode(31);

function projectionKeyFor(
  view: InfiniteCanvasFlowNodeView,
  labels: readonly string[],
): string {
  return [view.type, JSON.stringify(view.data), ...labels]
    .join(PROJECTION_KEY_SEPARATOR);
}

/** Ordered reference badge labels per target card (§3.2 edge-order discipline). */
export function referenceLabelsByNode(
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

export interface InfiniteCanvasProjectionDeps {
  catalog: StylePresetCatalog;
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  referenceLabels: ReadonlyMap<string, string[]>;
  /** Selection is panel state, not document state; carry it across. */
  selectedIds: ReadonlySet<string>;
  /** C1: cards whose last dispatch could not resolve short-drama coordinates. */
  manualReturnNodeIds: ReadonlySet<string>;
  openOverflow: (nodeId: string, anchor: HTMLElement) => void;
  openStylePicker: (nodeId: string, anchor?: HTMLElement) => void;
  nodeActionsRef: ActionRef<InfiniteCanvasNodeActions>;
  edgeActionsRef: ActionRef<InfiniteCanvasEdgeActions>;
  cardToolbarActionsRef: ActionRef<InfiniteCanvasCardToolbarActions>;
  /** The previous projection's cache; the result carries the next one. */
  cache: InfiniteCanvasProjectionCache;
}

export interface InfiniteCanvasProjection {
  nodes: Node[];
  edges: Edge[];
  cache: InfiniteCanvasProjectionCache;
}

export function projectInfiniteCanvasView(
  document: Readonly<InfiniteCanvasDocument>,
  deps: InfiniteCanvasProjectionDeps,
): InfiniteCanvasProjection {
  const {
    catalog,
    resolvePreviewUrl,
    referenceLabels,
    selectedIds,
    manualReturnNodeIds,
    openOverflow,
    openStylePicker,
    nodeActionsRef,
    edgeActionsRef,
    cardToolbarActionsRef,
    cache,
  } = deps;
  const owner: readonly unknown[] = [
    catalog, openOverflow, openStylePicker, resolvePreviewUrl,
  ];
  const previousData = owner.length === cache.owner.length
    && owner.every((input, index) => input === cache.owner[index])
    ? cache.entries
    : new Map<string, InfiniteCanvasProjectionCacheEntry>();
  const nextData = new Map<string, InfiniteCanvasProjectionCacheEntry>();

  const nodes = toFlowNodeViews(document.nodes).map(view => {
    const labels = referenceLabels.get(view.id) ?? EMPTY_REFERENCE_LABELS;
    /**
     * H3: an unchanged card keeps the very same `data` object.
     *
     * This runs after EVERY commit — pan/zoom end, a card drag, a prompt
     * edit, and once per media event (a batch of four re-projects four
     * times). Handing every card a brand-new `data` on each of those made
     * each one re-run its media effect and re-decode its picture from disk.
     */
    const key = projectionKeyFor(view, labels);
    const cached = previousData.get(view.id);
    const data = cached && cached.key === key
      ? cached.data
      : buildFlowNodeData(view, labels);
    nextData.set(view.id, { key, data });
    return {
      id: view.id,
      type: view.type,
      position: view.position,
      // The projection is rebuilt on every commit, and reactflow's node list
      // is controlled by the panel — so a re-projection that dropped
      // `selected` would silently deselect the card mid-edit and take its
      // generator (§6) with it. Selection is panel state; carry it across.
      selected: selectedIds.has(view.id),
      data,
    };
  });

  const edges = toFlowEdgeViews(document.edges).map(view => ({
    ...view,
    type: INFINITE_CANVAS_EDGE_TYPE,
    data: {
      onInsertCard: (edgeId: string) => nodeActionsRef.current.insertOnEdge(edgeId),
      onDisconnect: (edgeId: string) => edgeActionsRef.current.disconnect(edgeId),
    },
  }));

  return { nodes, edges, cache: { owner, entries: nextData } };

  function buildFlowNodeData(
    view: InfiniteCanvasFlowNodeView,
    referenceLabelsForNode: readonly string[],
  ): Record<string, unknown> {
    return view.type === INFINITE_CANVAS_TEXT_NODE_TYPE
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
          referenceLabels: referenceLabelsForNode,
          // K3: which short-drama asset this card belongs to. Read-only from
          // here on — no card control can change or clear it.
          ...(view.data.domainRef === undefined
            ? {}
            : {
                domainRef: view.data.domainRef,
                // C1: the sticky half of "this one does not file itself" —
                // the last press on this card could not resolve the asset's
                // coordinates. The other half (a batch bigger than one) the
                // card derives from `generationParams` itself, live, so the
                // badge answers before the press as well as after it.
                ...(manualReturnNodeIds.has(view.id)
                  ? { domainManualReturn: true }
                  : {}),
              }),
          // K3 §5.2: the way home. Only a card that belongs to an asset AND
          // holds a picture has one to offer.
          ...(view.data.domainRef && view.data.mediaRef
            ? {
                onSendToShortDrama: (nodeId: string) => (
                  cardToolbarActionsRef.current.sendToShortDrama(nodeId)
                ),
              }
            : {}),
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
          // §7.6: the card's own pictures and the entry that switches
          // between them. Both are absent on a card that has none.
          ...(view.data.mediaVariants
            ? {
                mediaVariants: view.data.mediaVariants,
                activeVariantIndex: view.data.activeVariantIndex,
                onSelectVariant: (nodeId: string, index: number) => (
                  nodeActionsRef.current.selectVariant(nodeId, index)
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
          onOpenOverflow: openOverflow,
          // The image-only surface (style preset, five tools, derive-video)
          // stays off the P3-minimal video card.
          ...(view.type === INFINITE_CANVAS_IMAGE_NODE_TYPE
            ? {
                stylePresetId: view.data.stylePresetId,
                stylePresetName: view.data.stylePresetId
                  ? catalog.getById(view.data.stylePresetId)?.name
                  : undefined,
                // §7.5: the input box's style entry shows the chosen look,
                // not just its name.
                styleThumbnailRef: view.data.stylePresetId
                  ? catalog.getById(view.data.stylePresetId)?.thumbnailRef
                  : undefined,
                onOpenStylePicker: openStylePicker,
                onRunImageTool: (nodeId: string, toolId: ImageToolId) => (
                  nodeActionsRef.current.openTool(nodeId, toolId)
                ),
                // §4's first entry. Only on cards that carry a picture —
                // §7's rule is "hide what cannot act", not "grey it out".
                ...(view.data.mediaRef
                  ? {
                      onCropImage: (nodeId: string) => (
                        nodeActionsRef.current.cropImage(nodeId)
                      ),
                    }
                  : {}),
              }
            : {}),
        };
  }
}
