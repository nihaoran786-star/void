/**
 * Where an anchored canvas popover sits (visual language §7.3-B).
 *
 * The owner's complaint that started this module: "our parameter popover gets
 * hidden, the position is wrong and it goes off the bottom". The old maths
 * centred the surface on its anchor and clamped it to the VIEWPORT, so a
 * trigger near the panel's right edge produced a surface that overflowed the
 * panel and was clipped by it.
 *
 * The rule §7.3-B asks for, and the only rule this module implements:
 *
 * - default: directly ABOVE the trigger, LEFT EDGES ALIGNED;
 * - flip below only when there is not enough room above;
 * - clamp horizontally inside the PANEL's visible box, tucking inward when the
 *   trigger sits near either edge — never overflowing it.
 *
 * Pure geometry: no DOM, no React, so the three cases the owner hit (against
 * the right edge, against the left edge, no room above) are unit-testable with
 * plain numbers.
 */

/** The subset of `DOMRect` this module reads. */
export interface InfiniteCanvasPopoverRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface InfiniteCanvasPopoverPlacementRequest {
  /** Viewport box of the control that opened the popover. */
  anchor: InfiniteCanvasPopoverRect;
  /** Viewport box the popover may not leave — the panel's visible area. */
  bounds: InfiniteCanvasPopoverRect;
  width: number;
  height: number;
  /** Space between the trigger and the surface. */
  gap?: number;
  /** Keep-out margin from the bounds edges. */
  margin?: number;
}

export interface InfiniteCanvasPopoverPlacement {
  left: number;
  top: number;
  /** Which way it ended up opening; surfaced for tests and styling hooks. */
  side: 'above' | 'below';
  /** True when the horizontal clamp had to pull the surface off its anchor. */
  clamped: boolean;
}

/** Gap between the anchor and the popover, in CSS pixels. */
const INFINITE_CANVAS_POPOVER_GAP = 8;
/** Keep-out margin from the bounds edges. */
export const INFINITE_CANVAS_POPOVER_MARGIN = 8;
/** §7.3-B: the surface stops growing here and scrolls inside itself. */
export const INFINITE_CANVAS_POPOVER_MAX_HEIGHT = 420;

/**
 * Every canvas popover's width, in one table (§7.1's 260–320px band).
 *
 * These used to be six separate constants next to six components, which is how
 * the band drifted: nobody could see the set at once. Same numbers, one place.
 * `overflow` is the exception the band allows — a short action menu, not a
 * picker.
 */
export const INFINITE_CANVAS_POPOVER_WIDTH = {
  /** Library picker: a grid of thumbnails needs the wide end. */
  library: 320,
  /** Style picker: same grid, same width. */
  style: 320,
  /** Model picker. */
  model: 300,
  /** Generation parameters. */
  params: 300,
  /** Reverse-prompt choice: the narrow end of the band. */
  reversePrompt: 280,
  /** Card overflow menu: a list of short labels, narrower than the band. */
  overflow: 220,
} as const;

/** Clamps `value` into [min, max], with `min` winning an inverted range. */
export function clampToRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Places a popover of `width` × `height` against its anchor, inside `bounds`.
 *
 * When the bounds are narrower or shorter than the surface the surface wins the
 * position (pinned to the top-left inside the margin) rather than being pushed
 * to a negative coordinate: a cramped panel should still show the popover from
 * its start, and the surface scrolls from there.
 */
export function placeInfiniteCanvasPopover(
  request: InfiniteCanvasPopoverPlacementRequest,
): InfiniteCanvasPopoverPlacement {
  const gap = request.gap ?? INFINITE_CANVAS_POPOVER_GAP;
  const margin = request.margin ?? INFINITE_CANVAS_POPOVER_MARGIN;
  const { anchor, bounds, width, height } = request;

  const minLeft = bounds.left + margin;
  const maxLeft = bounds.right - margin - width;
  const left = clampToRange(anchor.left, minLeft, maxLeft);

  const minTop = bounds.top + margin;
  const maxTop = bounds.bottom - margin - height;
  const above = anchor.top - gap - height;
  const side: 'above' | 'below' = above >= minTop ? 'above' : 'below';
  const top = side === 'above' ? above : clampToRange(anchor.bottom + gap, minTop, maxTop);

  return { left, top, side, clamped: left !== anchor.left };
}

/**
 * The box a popover must stay inside: the panel's visible area, itself clipped
 * to the viewport. Falls back to the viewport when the panel reports a zero box
 * — which is every layout under jsdom, where the popover must still land
 * somewhere sensible.
 */
export function resolveInfiniteCanvasPopoverBounds(
  panel: Element | null | undefined,
  viewport: { width: number; height: number },
): InfiniteCanvasPopoverRect {
  const viewportRect: InfiniteCanvasPopoverRect = {
    left: 0,
    top: 0,
    right: viewport.width,
    bottom: viewport.height,
    width: viewport.width,
    height: viewport.height,
  };
  if (!panel) return viewportRect;
  const rect = panel.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return viewportRect;
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const right = Math.min(rect.right, viewport.width);
  const bottom = Math.min(rect.bottom, viewport.height);
  if (right <= left || bottom <= top) return viewportRect;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** How tall the surface may grow inside `bounds` before it starts scrolling. */
export function infiniteCanvasPopoverMaxHeight(
  bounds: InfiniteCanvasPopoverRect,
  margin: number = INFINITE_CANVAS_POPOVER_MARGIN,
): number {
  const room = bounds.height - margin * 2;
  if (room <= 0) return INFINITE_CANVAS_POPOVER_MAX_HEIGHT;
  return Math.min(INFINITE_CANVAS_POPOVER_MAX_HEIGHT, room);
}
