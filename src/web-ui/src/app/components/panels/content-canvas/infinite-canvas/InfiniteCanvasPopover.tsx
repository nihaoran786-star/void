/**
 * The one compact floating surface every canvas picker sits in
 * (visual language §7, tightened after owner feedback 2026-08-26).
 *
 * Before this, the parameter popover, the style picker and the library picker
 * were each a near-full-screen slab pinned to the top of the panel. The owner
 * called them "too coarse, too big, ugly". They are now one small surface,
 * 260–320px wide, anchored to the control that opened them, scrolling inside
 * itself rather than growing.
 *
 * Two deliberate choices:
 * - `position: fixed` with viewport maths. The panel is not transformed, and
 *   fixing to the viewport keeps the popover clear of the reactflow pane's own
 *   transforms without the surface having to know where the panel starts.
 * - Placement is measured after the first paint and delegated wholesale to
 *   `placeInfiniteCanvasPopover` (§7.3-B): above the anchor with left edges
 *   aligned, flipping below only when there is no room, and clamped inside the
 *   PANEL's visible box rather than the viewport. Clamping to the viewport was
 *   the bug the owner reported — a trigger near the panel's right edge produced
 *   a surface the panel then clipped.
 *
 * Dismissal is not implemented here twice over: it is
 * `useInfiniteCanvasDismiss`, the same hook the full-screen viewer uses. There
 * is no close button — pressing outside or Escape is the way out.
 */
import React from 'react';

import {
  infiniteCanvasPopoverMaxHeight,
  placeInfiniteCanvasPopover,
  resolveInfiniteCanvasPopoverBounds,
  INFINITE_CANVAS_POPOVER_MARGIN,
} from './infiniteCanvasPopoverPlacement';
import { useInfiniteCanvasDismiss } from './useInfiniteCanvasDismiss';

/** Fallback viewport box under jsdom, where layout reports zeros. */
const FALLBACK_VIEWPORT = { width: 1024, height: 768 };
/** The popover clamps inside this element's box, not the viewport's. */
const PANEL_SELECTOR = '.infinite-canvas-panel';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface InfiniteCanvasPopoverProps {
  /** The control the popover belongs to; unanchored surfaces float centred. */
  anchor?: HTMLElement | null;
  /** Surface width in pixels — §7 wants these in the 260–320 band. */
  width: number;
  label: string;
  /** Extra class on the surface, e.g. `infinite-canvas-picker--params`. */
  className?: string;
  /** Value for `data-canvas-popover`, so behaviour tests can find it. */
  kind: string;
  onDismiss: () => void;
  children: React.ReactNode;
}

export const InfiniteCanvasPopover: React.FC<InfiniteCanvasPopoverProps> = ({
  anchor,
  width,
  label,
  className,
  kind,
  onDismiss,
  children,
}) => {
  const surfaceRef = useInfiniteCanvasDismiss<HTMLElement>({
    onDismiss,
    ignore: anchor ? [anchor] : undefined,
  });
  const [box, setBox] = React.useState<
    { left: number; top: number; maxHeight: number; side: 'above' | 'below' } | undefined
  >(undefined);

  React.useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const view = surface?.ownerDocument?.defaultView;
    if (!surface || !view) return;
    const viewport = {
      width: view.innerWidth || FALLBACK_VIEWPORT.width,
      height: view.innerHeight || FALLBACK_VIEWPORT.height,
    };
    // The panel the popover belongs to: reached through the anchor, because the
    // surface itself may be portalled or fixed outside the panel's flow.
    const panel = anchor?.closest(PANEL_SELECTOR)
      ?? surface.closest(PANEL_SELECTOR)
      ?? surface.ownerDocument?.querySelector(PANEL_SELECTOR);
    const bounds = resolveInfiniteCanvasPopoverBounds(panel, viewport);
    const maxHeight = infiniteCanvasPopoverMaxHeight(bounds);
    const height = Math.min(surface.getBoundingClientRect().height, maxHeight);
    // The placement maths works in viewport space, but the surface is laid out
    // against the panel: an ancestor of the canvas carries a transform, which
    // makes even `position: fixed` resolve against it rather than the viewport.
    // Applying viewport numbers directly shifted every popover right and up by
    // the panel's own origin — the owner saw them pinned off the right edge.
    const panelRect = panel?.getBoundingClientRect();
    const originLeft = panelRect?.left ?? 0;
    const originTop = panelRect?.top ?? 0;

    if (!anchor) {
      setBox({
        left: clamp(
          bounds.left + (bounds.width - width) / 2,
          bounds.left + INFINITE_CANVAS_POPOVER_MARGIN,
          bounds.right - INFINITE_CANVAS_POPOVER_MARGIN - width,
        ) - originLeft,
        top: clamp(
          bounds.top + INFINITE_CANVAS_POPOVER_MARGIN * 6,
          bounds.top + INFINITE_CANVAS_POPOVER_MARGIN,
          bounds.bottom - INFINITE_CANVAS_POPOVER_MARGIN - height,
        ) - originTop,
        maxHeight,
        side: 'below',
      });
      return;
    }

    const placement = placeInfiniteCanvasPopover({
      anchor: anchor.getBoundingClientRect(),
      bounds,
      width,
      height,
    });
    setBox({
      left: placement.left - originLeft,
      top: placement.top - originTop,
      maxHeight,
      side: placement.side,
    });
    // `surfaceRef` is a stable ref object; re-measuring is driven by the anchor.
  }, [anchor, surfaceRef, width, children]);

  return (
    <aside
      ref={surfaceRef as React.RefObject<HTMLElement>}
      className={`infinite-canvas-picker infinite-canvas-popover${className ? ` ${className}` : ''}`}
      data-canvas-popover={kind}
      data-canvas-popover-anchored={anchor ? 'true' : undefined}
      data-canvas-popover-placed={box ? 'true' : undefined}
      data-canvas-popover-side={box?.side}
      aria-label={label}
      style={{
        width: `${width}px`,
        ...(box
          ? {
              left: `${box.left}px`,
              top: `${box.top}px`,
              maxHeight: `${box.maxHeight}px`,
            }
          : {}),
      }}
    >
      {children}
    </aside>
  );
};

InfiniteCanvasPopover.displayName = 'InfiniteCanvasPopover';
