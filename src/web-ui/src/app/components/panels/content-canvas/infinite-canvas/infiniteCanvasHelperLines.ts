/**
 * Alignment helper lines and snapping for the Infinite Canvas panel (P4 W9).
 *
 * Pure geometry: given the node being dragged and every other projected node,
 * it reports the nudged position plus the guide lines to draw. No React, no
 * reactflow, no persistence — the panel applies the corrected position to the
 * in-flight drag change and still writes to disk only once, when the drag
 * ends (`dragging === false`), so this slice adds zero write traffic.
 *
 * Design borrowed (idea only, code written fresh for Void) from kunpeng's
 * helper-lines utility: compare the dragged box's left/center/right against
 * the same three verticals of every other box, and likewise
 * top/center/bottom, then keep the single best match per axis.
 */

/** Snap distance in canvas units — deliberately small so it never fights. */
export const INFINITE_CANVAS_SNAP_THRESHOLD = 5;

/** Fallback box used when reactflow has not measured a node yet. */
export const INFINITE_CANVAS_DEFAULT_NODE_SIZE = { width: 240, height: 160 };

export interface HelperLineBox {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  /** Group nodes have no phase-1 renderer and never participate. */
  kind?: string;
}

export interface HelperLineResult {
  /** The dragged node's position after snapping (unchanged when no match). */
  position: { x: number; y: number };
  /** Canvas x of the vertical guide, when one axis matched. */
  verticalLine?: number;
  /** Canvas y of the horizontal guide, when one axis matched. */
  horizontalLine?: number;
}

function sizeOf(box: HelperLineBox): { width: number; height: number } {
  const width = typeof box.width === 'number' && box.width > 0
    ? box.width
    : INFINITE_CANVAS_DEFAULT_NODE_SIZE.width;
  const height = typeof box.height === 'number' && box.height > 0
    ? box.height
    : INFINITE_CANVAS_DEFAULT_NODE_SIZE.height;
  return { width, height };
}

interface AxisMatch {
  /** How far the dragged node has to move to land on the guide. */
  distance: number;
  /** The dragged node's new left/top after snapping. */
  origin: number;
  /** Where the guide is drawn, in canvas units. */
  line: number;
}

/**
 * Best match on one axis: three candidate anchors on the dragged box
 * (start / center / end) against the same three on every other box.
 */
function bestAxisMatch(
  draggedStart: number,
  draggedSize: number,
  others: readonly { start: number; size: number }[],
  threshold: number,
): AxisMatch | undefined {
  const draggedAnchors = [
    { offset: 0, value: draggedStart },
    { offset: draggedSize / 2, value: draggedStart + draggedSize / 2 },
    { offset: draggedSize, value: draggedStart + draggedSize },
  ];
  let best: AxisMatch | undefined;
  for (const other of others) {
    const otherAnchors = [
      other.start,
      other.start + other.size / 2,
      other.start + other.size,
    ];
    for (const anchor of draggedAnchors) {
      for (const target of otherAnchors) {
        const distance = Math.abs(anchor.value - target);
        if (distance > threshold) continue;
        if (best && best.distance <= distance) continue;
        best = { distance, origin: target - anchor.offset, line: target };
      }
    }
  }
  return best;
}

/**
 * Computes the snapped position and guide lines for one dragged node.
 *
 * `others` may safely include the dragged node itself; it is filtered by id.
 */
export function computeInfiniteCanvasHelperLines(
  dragged: HelperLineBox,
  others: readonly HelperLineBox[],
  threshold: number = INFINITE_CANVAS_SNAP_THRESHOLD,
): HelperLineResult {
  const { width, height } = sizeOf(dragged);
  const candidates = others.filter(box => box.id !== dragged.id && box.kind !== 'group');
  if (candidates.length === 0) return { position: { ...dragged.position } };

  const vertical = bestAxisMatch(
    dragged.position.x,
    width,
    candidates.map(box => ({ start: box.position.x, size: sizeOf(box).width })),
    threshold,
  );
  const horizontal = bestAxisMatch(
    dragged.position.y,
    height,
    candidates.map(box => ({ start: box.position.y, size: sizeOf(box).height })),
    threshold,
  );

  return {
    position: {
      x: vertical ? vertical.origin : dragged.position.x,
      y: horizontal ? horizontal.origin : dragged.position.y,
    },
    ...(vertical ? { verticalLine: vertical.line } : {}),
    ...(horizontal ? { horizontalLine: horizontal.line } : {}),
  };
}
