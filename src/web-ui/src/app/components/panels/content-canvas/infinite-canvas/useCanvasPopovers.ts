/**
 * P4 W3 / §7.3-A: the two card-anchored generation popovers — the parameter
 * sheet and the model list.
 *
 * They were two word-for-word copies of the same twenty lines that differed
 * only in which piece of state they read. One parameterized surface now backs
 * both, and the panel keeps the single rule that separates them: opening one
 * closes the other, so the two never stack.
 */
import React from 'react';
import type { Node } from '@xyflow/react';

import type { InfiniteCanvasGenerationParams } from '@/shared/services/infinite-canvas';

import {
  INFINITE_CANVAS_IMAGE_NODE_TYPE,
  INFINITE_CANVAS_VIDEO_NODE_TYPE,
} from './infiniteCanvasPanelModel';

/** What a popover needs off the card it is editing. */
export interface CanvasPopoverTarget {
  mediaKind: 'image' | 'video';
  params: InfiniteCanvasGenerationParams | undefined;
}

export interface CanvasPopoverSurface {
  /** The card the popover is on, or `null` when it is closed. */
  nodeId: string | null;
  /** The control that opened it, so the surface re-measures instead of drifting. */
  anchor: HTMLElement | null;
  /** The card as the popover reads it, or `undefined` when it no longer qualifies. */
  target: CanvasPopoverTarget | undefined;
  close: () => void;
}

export interface CanvasPopovers {
  params: CanvasPopoverSurface;
  model: CanvasPopoverSurface;
  /** Opens one lane on a card, closing the other. Pressing the same card closes it. */
  open: (lane: 'params' | 'model', nodeId: string, anchor?: HTMLElement) => void;
  /** Board-level reset (workspace switch, reload). */
  closeAll: () => void;
}

interface PopoverSurfaceState extends CanvasPopoverSurface {
  setAnchor: (anchor: HTMLElement | null) => void;
  toggle: (nodeId: string) => void;
}

/**
 * The card the popover is editing, if it still exists and still qualifies.
 * Read off the projection (not documentRef) so the popover re-renders as
 * soon as a written parameter comes back through the document.
 */
function usePopoverSurface(flowNodes: Node[]): PopoverSurfaceState {
  const [nodeId, setNodeId] = React.useState<string | null>(null);
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);

  const target = React.useMemo(() => {
    if (!nodeId) return undefined;
    const node = flowNodes.find(entry => entry.id === nodeId);
    if (!node
      || (node.type !== INFINITE_CANVAS_IMAGE_NODE_TYPE
        && node.type !== INFINITE_CANVAS_VIDEO_NODE_TYPE)) {
      return undefined;
    }
    return {
      mediaKind: node.type === INFINITE_CANVAS_VIDEO_NODE_TYPE ? 'video' as const : 'image' as const,
      params: node.data.generationParams as InfiniteCanvasGenerationParams | undefined,
    };
  }, [flowNodes, nodeId]);

  React.useEffect(() => {
    if (nodeId && !target) setNodeId(null);
  }, [nodeId, target]);

  const close = React.useCallback(() => setNodeId(null), []);
  const toggle = React.useCallback((next: string) => {
    setNodeId(current => (current === next ? null : next));
  }, []);

  return { nodeId, anchor, target, close, setAnchor, toggle };
}

export function useCanvasPopovers(flowNodes: Node[]): CanvasPopovers {
  const params = usePopoverSurface(flowNodes);
  const model = usePopoverSurface(flowNodes);

  const { close: closeParams, setAnchor: setParamsAnchor, toggle: toggleParams } = params;
  const { close: closeModel, setAnchor: setModelAnchor, toggle: toggleModel } = model;

  const open = React.useCallback((
    lane: 'params' | 'model',
    nodeId: string,
    anchor?: HTMLElement,
  ) => {
    if (lane === 'params') {
      closeModel();
      setParamsAnchor(anchor ?? null);
      toggleParams(nodeId);
      return;
    }
    closeParams();
    setModelAnchor(anchor ?? null);
    toggleModel(nodeId);
  }, [closeModel, closeParams, setModelAnchor, setParamsAnchor, toggleModel, toggleParams]);

  const closeAll = React.useCallback(() => {
    closeParams();
    closeModel();
  }, [closeModel, closeParams]);

  return { params, model, open, closeAll };
}
