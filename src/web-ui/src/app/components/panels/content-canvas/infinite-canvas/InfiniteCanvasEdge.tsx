/**
 * Custom reactflow edge for the Infinite Canvas (visual language §3).
 *
 * A thin neutral bezier with one small circular handle at its midpoint. The
 * handle inserts a card on that connection; it is dim until the edge is
 * hovered or selected, so a resting canvas shows nothing but the hairline.
 *
 * Deliberately imports nothing from `@xyflow/react`: the curve and the
 * midpoint are plain maths and the handle is plain SVG, so the panel's node
 * tests (which mock the flow library) never have to grow new mock exports.
 */
import React from 'react';

import { useI18n } from '@/infrastructure/i18n';

export interface InfiniteCanvasEdgeData extends Record<string, unknown> {
  /** Inserts a new generation card in the middle of this connection. */
  onInsertCard?: (edgeId: string) => void;
  /**
   * Owner feedback 2026-08-26: connections must be breakable. The midpoint
   * grows a small `×` beside the insert handle (dim until the edge is hovered
   * or selected, like the handle itself). The panel routes it through the same
   * edge-removal mutation the Delete key uses, so it is undoable and neither
   * card's media is touched.
   */
  onDisconnect?: (edgeId: string) => void;
}

interface InfiniteCanvasEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  selected?: boolean;
  data?: InfiniteCanvasEdgeData;
}

/** Horizontal bezier control offset; the same feel as reactflow's default. */
function controlOffset(sourceX: number, targetX: number): number {
  return Math.max(Math.abs(targetX - sourceX) * 0.5, 40);
}

function infiniteCanvasEdgeGeometry(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): { path: string; midX: number; midY: number } {
  const offset = controlOffset(sourceX, targetX);
  const c1x = sourceX + offset;
  const c2x = targetX - offset;
  // Cubic bezier at t = 0.5 is (p0 + 3·c1 + 3·c2 + p3) / 8.
  return {
    path: `M ${sourceX},${sourceY} C ${c1x},${sourceY} ${c2x},${targetY} ${targetX},${targetY}`,
    midX: (sourceX + 3 * c1x + 3 * c2x + targetX) / 8,
    midY: (sourceY + 3 * sourceY + 3 * targetY + targetY) / 8,
  };
}

export const InfiniteCanvasEdge: React.FC<InfiniteCanvasEdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
  data,
}) => {
  const { t } = useI18n('components');
  const { path, midX, midY } = infiniteCanvasEdgeGeometry(
    sourceX,
    sourceY,
    targetX,
    targetY,
  );
  const onInsertCard = data?.onInsertCard;
  const onDisconnect = data?.onDisconnect;
  // The `×` sits beside the insert handle rather than on top of it, so the two
  // are never a coin toss under the pointer.
  const disconnectOffset = onInsertCard ? 20 : 0;

  return (
    <g className="infinite-canvas-edge" data-selected={selected ? 'true' : undefined}>
      <path className="react-flow__edge-path infinite-canvas-edge__path" d={path} />
      {/* Widened invisible hit area: an 1px hairline is not a pointer target. */}
      <path className="infinite-canvas-edge__hit" d={path} />
      {onInsertCard ? (
        <g
          className="infinite-canvas-edge__handle nodrag nopan"
          data-canvas-edge-action="insert-card"
          data-edge-id={id}
          role="button"
          tabIndex={0}
          aria-label={t('infiniteCanvas.handles.insertOnEdge')}
          transform={`translate(${midX} ${midY})`}
          onClick={event => {
            event.stopPropagation();
            onInsertCard(id);
          }}
          onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onInsertCard(id);
          }}
        >
          <circle className="infinite-canvas-edge__handle-disc" r={8} />
          <line x1={0} y1={-3.5} x2={0} y2={3.5} />
          <line x1={-3.5} y1={0} x2={3.5} y2={0} />
        </g>
      ) : null}
      {onDisconnect ? (
        <g
          className="infinite-canvas-edge__handle infinite-canvas-edge__handle--disconnect nodrag nopan"
          data-canvas-edge-action="disconnect"
          data-edge-id={id}
          role="button"
          tabIndex={0}
          aria-label={t('infiniteCanvas.handles.disconnect')}
          transform={`translate(${midX + disconnectOffset} ${midY})`}
          onClick={event => {
            event.stopPropagation();
            onDisconnect(id);
          }}
          onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onDisconnect(id);
          }}
        >
          <circle className="infinite-canvas-edge__handle-disc" r={8} />
          <line x1={-3} y1={-3} x2={3} y2={3} />
          <line x1={3} y1={-3} x2={-3} y2={3} />
        </g>
      ) : null}
    </g>
  );
};

InfiniteCanvasEdge.displayName = 'InfiniteCanvasEdge';
