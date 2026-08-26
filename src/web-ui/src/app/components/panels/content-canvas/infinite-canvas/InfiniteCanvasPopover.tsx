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
 * - Placement is measured after the first paint. The popover prefers to sit
 *   above its anchor (the generator's bottom bar is near the foot of the
 *   panel) and flips below only when there is no room, then clamps into the
 *   viewport on both axes.
 *
 * Dismissal is not implemented here twice over: it is
 * `useInfiniteCanvasDismiss`, the same hook the full-screen viewer uses. There
 * is no close button — pressing outside or Escape is the way out.
 */
import React from 'react';

import { useInfiniteCanvasDismiss } from './useInfiniteCanvasDismiss';

/** Gap between the anchor and the popover, in CSS pixels. */
const ANCHOR_GAP = 8;
/** Keep-out margin from the viewport edges. */
const VIEWPORT_MARGIN = 8;
/** Fallback viewport box under jsdom, where layout reports zeros. */
const FALLBACK_VIEWPORT = { width: 1024, height: 768 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export interface InfiniteCanvasPopoverProps {
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
  const [box, setBox] = React.useState<{ left: number; top: number } | undefined>(undefined);

  React.useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const view = surface?.ownerDocument?.defaultView;
    if (!surface || !view) return;
    const viewportWidth = view.innerWidth || FALLBACK_VIEWPORT.width;
    const viewportHeight = view.innerHeight || FALLBACK_VIEWPORT.height;
    const height = surface.getBoundingClientRect().height;
    const maxLeft = viewportWidth - width - VIEWPORT_MARGIN;
    const maxTop = viewportHeight - height - VIEWPORT_MARGIN;

    if (!anchor) {
      setBox({
        left: clamp((viewportWidth - width) / 2, VIEWPORT_MARGIN, maxLeft),
        top: clamp(VIEWPORT_MARGIN * 6, VIEWPORT_MARGIN, maxTop),
      });
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const above = rect.top - ANCHOR_GAP - height;
    setBox({
      left: clamp(rect.left + rect.width / 2 - width / 2, VIEWPORT_MARGIN, maxLeft),
      top: above >= VIEWPORT_MARGIN
        ? above
        : clamp(rect.bottom + ANCHOR_GAP, VIEWPORT_MARGIN, maxTop),
    });
    // `surfaceRef` is a stable ref object; re-measuring is driven by the anchor.
  }, [anchor, surfaceRef, width]);

  return (
    <aside
      ref={surfaceRef as React.RefObject<HTMLElement>}
      className={`infinite-canvas-picker infinite-canvas-popover${className ? ` ${className}` : ''}`}
      data-canvas-popover={kind}
      data-canvas-popover-anchored={anchor ? 'true' : undefined}
      data-canvas-popover-placed={box ? 'true' : undefined}
      aria-label={label}
      style={{
        width: `${width}px`,
        ...(box ? { left: `${box.left}px`, top: `${box.top}px` } : {}),
      }}
    >
      {children}
    </aside>
  );
};

InfiniteCanvasPopover.displayName = 'InfiniteCanvasPopover';
