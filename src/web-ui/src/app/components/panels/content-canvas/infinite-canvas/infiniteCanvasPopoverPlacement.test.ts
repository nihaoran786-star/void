/**
 * Placement closure for the owner's "the popover gets hidden / it goes off the
 * bottom" report (visual language §7.3-B).
 *
 * Three cases, all with hand-written rectangles rather than a real layout:
 * a trigger against the panel's RIGHT edge, one against its LEFT edge, and one
 * with no room ABOVE it. In every case the surface has to stay inside the
 * panel's box — that is the whole bug.
 */
import { describe, expect, it } from 'vitest';

import {
  infiniteCanvasPopoverMaxHeight,
  placeInfiniteCanvasPopover,
  resolveInfiniteCanvasPopoverBounds,
  INFINITE_CANVAS_POPOVER_MAX_HEIGHT,
  type InfiniteCanvasPopoverRect,
} from './infiniteCanvasPopoverPlacement';

function rect(left: number, top: number, width: number, height: number): InfiniteCanvasPopoverRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/** The panel: 900 wide, starting 300px in from the window's left edge. */
const PANEL = rect(300, 60, 900, 700);
const WIDTH = 300;
const HEIGHT = 240;

describe('placeInfiniteCanvasPopover', () => {
  it('opens above the trigger with the left edges aligned', () => {
    const placement = placeInfiniteCanvasPopover({
      anchor: rect(500, 600, 120, 24),
      bounds: PANEL,
      width: WIDTH,
      height: HEIGHT,
    });

    expect(placement.side).toBe('above');
    expect(placement.left).toBe(500);
    expect(placement.clamped).toBe(false);
    // 8px of air between the surface and the control.
    expect(placement.top).toBe(600 - 8 - HEIGHT);
  });

  it('tucks inward instead of overflowing the panel right edge', () => {
    // The owner's screenshot: a trigger near the right edge produced a surface
    // that ran past the panel and was clipped.
    const anchor = rect(1120, 600, 60, 24);
    const placement = placeInfiniteCanvasPopover({
      anchor,
      bounds: PANEL,
      width: WIDTH,
      height: HEIGHT,
    });

    expect(placement.clamped).toBe(true);
    expect(placement.left + WIDTH).toBeLessThanOrEqual(PANEL.right);
    expect(placement.left).toBe(PANEL.right - 8 - WIDTH);
    // Still fully inside on the left too.
    expect(placement.left).toBeGreaterThanOrEqual(PANEL.left);
  });

  it('tucks inward instead of overflowing the panel left edge', () => {
    const placement = placeInfiniteCanvasPopover({
      anchor: rect(302, 600, 60, 24),
      bounds: PANEL,
      width: WIDTH,
      height: HEIGHT,
    });

    expect(placement.clamped).toBe(true);
    expect(placement.left).toBe(PANEL.left + 8);
    expect(placement.left + WIDTH).toBeLessThanOrEqual(PANEL.right);
  });

  it('flips below when the space above is too small, and stays inside', () => {
    // A trigger high in the panel: 240px of surface will not fit above it.
    const placement = placeInfiniteCanvasPopover({
      anchor: rect(500, 100, 120, 24),
      bounds: PANEL,
      width: WIDTH,
      height: HEIGHT,
    });

    expect(placement.side).toBe('below');
    expect(placement.top).toBe(124 + 8);
    expect(placement.top + HEIGHT).toBeLessThanOrEqual(PANEL.bottom);
    expect(placement.top).toBeGreaterThanOrEqual(PANEL.top);
  });

  it('never pushes the surface past the panel bottom when it flips', () => {
    // A short panel where neither side has real room: the surface starts at the
    // top margin and scrolls, rather than hanging off the bottom.
    const shortPanel = rect(0, 0, 600, 300);
    const placement = placeInfiniteCanvasPopover({
      anchor: rect(20, 20, 80, 24),
      bounds: shortPanel,
      width: WIDTH,
      height: 280,
    });

    expect(placement.top).toBeGreaterThanOrEqual(shortPanel.top);
    // Pulled up until the surface's foot sits on the inner bottom margin.
    expect(placement.top).toBe(12);
    expect(placement.top + 280).toBeLessThanOrEqual(shortPanel.bottom);
  });

  it('keeps a surface wider than the panel pinned to the inner left edge', () => {
    const placement = placeInfiniteCanvasPopover({
      anchor: rect(10, 200, 40, 24),
      bounds: rect(0, 0, 200, 400),
      width: WIDTH,
      height: 100,
    });

    expect(placement.left).toBe(8);
  });
});

describe('resolveInfiniteCanvasPopoverBounds', () => {
  const viewport = { width: 1280, height: 800 };

  it('uses the panel box, clipped to the viewport', () => {
    const panel = {
      getBoundingClientRect: () => rect(300, 60, 1200, 900) as unknown as DOMRect,
    } as Element;

    expect(resolveInfiniteCanvasPopoverBounds(panel, viewport)).toEqual({
      left: 300,
      top: 60,
      right: 1280,
      bottom: 800,
      width: 980,
      height: 740,
    });
  });

  it('falls back to the viewport when the panel reports no box (jsdom)', () => {
    const panel = {
      getBoundingClientRect: () => rect(0, 0, 0, 0) as unknown as DOMRect,
    } as Element;

    expect(resolveInfiniteCanvasPopoverBounds(panel, viewport).width).toBe(1280);
    expect(resolveInfiniteCanvasPopoverBounds(null, viewport).height).toBe(800);
  });
});

describe('infiniteCanvasPopoverMaxHeight', () => {
  it('caps at the §7.3-B ceiling in a tall panel', () => {
    expect(infiniteCanvasPopoverMaxHeight(rect(0, 0, 900, 900)))
      .toBe(INFINITE_CANVAS_POPOVER_MAX_HEIGHT);
  });

  it('shrinks to the panel in a short one', () => {
    expect(infiniteCanvasPopoverMaxHeight(rect(0, 0, 900, 240))).toBe(224);
  });
});
