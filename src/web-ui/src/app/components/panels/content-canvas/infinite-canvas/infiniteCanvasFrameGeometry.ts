/**
 * One box editor, two directions (visual language §7.4.1).
 *
 * Owner, 2026-08-28: expanding and cropping are technically the same thing, the
 * frame just goes outside the picture instead of inside it. You drag a box
 * around a picture; the only
 * question is whether the box lives INSIDE the picture (keep what is in it) or
 * OUTSIDE it (fill what is not). Two components had grown for that one gesture,
 * with two sets of handles, two drag pipelines and two readouts. This module is
 * the single geometry they now share.
 *
 * The trick that makes one pipeline possible is the state shape. Both
 * directions are held as FOUR EDGE OFFSETS, one per side, measured from the
 * picture's own edge and **positive outwards**:
 *
 * - outward (expand): every offset is `>= 0` and is exactly the inset the
 *   outpainting lane already speaks (`CanvasExpandInsets`).
 * - inward (crop): every offset is `<= 0`, and the crop rectangle is read back
 *   out of them losslessly.
 *
 * In that shape the drag maths is literally the same expression for both — the
 * west grip always reads `left - dx`, the east grip always reads `right + dx` —
 * so `dragCanvasFrameEdges` has no direction parameter at all. Only the CLAMP
 * differs, because the two directions guard different things: crop may not
 * leave the picture and may not go below a usable size, expand must always
 * still CONTAIN the picture and may not exceed the composite's write ceiling.
 *
 * Nothing here rasterises, submits or touches a document: the two lanes keep
 * their own submit paths (`media/input/canvas-crops/` for crop, scratch plus
 * the generation gateway for expand). Only geometry and interaction are shared.
 */
import type { CanvasExpandInsets } from '@/shared/services/infinite-canvas';
import {
  CANVAS_CROP_MIN_SIZE,
  CANVAS_EXPAND_NO_INSETS,
  clampCropRect,
  clampExpandInsets,
  expandedCanvasSize,
  formatCanvasAspectRatio,
  isCanvasExpanded,
  isCropRectUsable,
  type CanvasRect,
  type CanvasSize,
} from './infiniteCanvasImageRaster';

/** Which side of the picture the box is drawn on. */
export type CanvasFrameDirection = 'inward' | 'outward';

/**
 * The eight grips, in render order: four corners, four edge midpoints.
 *
 * Both directions get all eight. The crop editor used to offer corners only,
 * which meant "make this a touch shorter" required moving two axes at once.
 */
export const CANVAS_FRAME_HANDLES = [
  'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w',
] as const;

export type CanvasFrameHandle = typeof CANVAS_FRAME_HANDLES[number];

/** A grip, or the box's own body (dragging it pans the box — inward only). */
export type CanvasFrameGrip = CanvasFrameHandle | 'move';

/**
 * Distance of each frame edge from the picture's matching edge, in natural
 * pixels, positive OUTWARDS. Same shape as `CanvasExpandInsets` on purpose:
 * the outward direction hands this straight to the outpainting lane.
 */
export type CanvasFrameEdges = CanvasExpandInsets;

/** Nudge per arrow press, and per arrow press with Shift held. */
export const CANVAS_FRAME_KEY_STEP = 1;
export const CANVAS_FRAME_KEY_STEP_COARSE = 10;

/** The frame the inward direction opens with: centred, 80% of each axis. */
const INITIAL_CROP_SCALE = 0.8;

/** Edge offsets → the crop rectangle they describe, in natural pixels. */
export function canvasFrameToRect(
  edges: CanvasFrameEdges,
  natural: CanvasSize,
): CanvasRect {
  return {
    x: -edges.left,
    y: -edges.top,
    width: natural.width + edges.left + edges.right,
    height: natural.height + edges.top + edges.bottom,
  };
}

/** The inverse of {@link canvasFrameToRect}; exact for integer rectangles. */
export function canvasFrameFromRect(
  rect: CanvasRect,
  natural: CanvasSize,
): CanvasFrameEdges {
  return {
    left: -rect.x,
    top: -rect.y,
    right: rect.x + rect.width - natural.width,
    bottom: rect.y + rect.height - natural.height,
  };
}

/**
 * Where the box starts.
 *
 * Outward opens flush with the picture — nothing has been asked for yet, and
 * an expansion the user did not request is an expansion they would pay for.
 * Inward opens at 80%, centred, because a crop frame that starts flush gives
 * the user nothing to grab.
 */
export function initialCanvasFrameEdges(
  direction: CanvasFrameDirection,
  natural: CanvasSize,
): CanvasFrameEdges {
  if (direction === 'outward') return CANVAS_EXPAND_NO_INSETS;
  const width = Math.max(1, Math.round(natural.width * INITIAL_CROP_SCALE));
  const height = Math.max(1, Math.round(natural.height * INITIAL_CROP_SCALE));
  const x = Math.round((natural.width - width) / 2);
  const y = Math.round((natural.height - height) / 2);
  return canvasFrameFromRect({ x, y, width, height }, natural);
}

/**
 * One grip, one delta, one expression — for both directions.
 *
 * A grip named with `w` moves the west edge, and moving that edge OUT is a
 * negative client delta, which is why west and north read the delta backwards.
 * Nothing is clamped here; `clampCanvasFrameEdges` is the only guard, so there
 * is exactly one place where "how far may this go" is decided.
 */
export function dragCanvasFrameEdges(
  start: CanvasFrameEdges,
  handle: CanvasFrameHandle,
  dx: number,
  dy: number,
): CanvasFrameEdges {
  const next = { ...start };
  if (handle.includes('w')) next.left = start.left - dx;
  if (handle.includes('e')) next.right = start.right + dx;
  if (handle.includes('n')) next.top = start.top - dy;
  if (handle.includes('s')) next.bottom = start.bottom + dy;
  return next;
}

/**
 * Pans the whole box without resizing it.
 *
 * Only the inward direction offers this: an outward frame that no longer
 * contains the picture is not an expansion of anything, and the clamp would
 * pull it straight back anyway.
 */
export function moveCanvasFrameEdges(
  start: CanvasFrameEdges,
  dx: number,
  dy: number,
): CanvasFrameEdges {
  return {
    left: start.left - dx,
    right: start.right + dx,
    top: start.top - dy,
    bottom: start.bottom + dy,
  };
}

/**
 * The one guard, and the only thing in this module that asks which direction
 * it is in.
 *
 * - **inward**: a grip dragged past the opposite edge mirrors the rectangle
 *   rather than collapsing it (what every crop tool does), then `clampCropRect`
 *   pulls it inside the picture and up to `CANVAS_CROP_MIN_SIZE`.
 * - **outward** (§7.4.4, owner 2026-08-28): every grip may be dragged EITHER
 *   way. The one rule is that the box must still contain the whole picture, so
 *   each side is clamped **independently** into `[0, cap]`: pulling a side back
 *   in walks that side's offset down to the picture's edge and stops there,
 *   rather than the drag being refused. Because the four sides are clamped
 *   separately, the box may sit off-centre on the picture — a lot added on the
 *   left and none on the right is a legal frame, and the picture itself never
 *   moves. The cap is `CANVAS_EXPAND_MAX_RATIO` per axis, because the composite
 *   has to pass a 32 MB write ceiling; past it the box is held, not rejected.
 */
export function clampCanvasFrameEdges(
  direction: CanvasFrameDirection,
  edges: CanvasFrameEdges,
  natural: CanvasSize,
): CanvasFrameEdges {
  if (direction === 'outward') return clampExpandInsets(edges, natural);
  const raw = canvasFrameToRect(edges, natural);
  const mirrored: CanvasRect = {
    x: raw.width < 0 ? raw.x + raw.width : raw.x,
    y: raw.height < 0 ? raw.y + raw.height : raw.y,
    width: Math.abs(raw.width),
    height: Math.abs(raw.height),
  };
  return canvasFrameFromRect(clampCropRect(mirrored, natural), natural);
}

/** The size of the picture this frame will produce. */
export function canvasFrameSize(
  direction: CanvasFrameDirection,
  edges: CanvasFrameEdges,
  natural: CanvasSize,
): CanvasSize {
  if (direction === 'outward') return expandedCanvasSize(natural, edges);
  const rect = canvasFrameToRect(edges, natural);
  return { width: rect.width, height: rect.height };
}

/**
 * Whether this frame may be confirmed.
 *
 * Inward asks "is the cut big enough to be a picture"; outward asks "has
 * anything been asked for at all", because sending a zero expansion would spend
 * money to receive the same image back.
 */
export function isCanvasFrameConfirmable(
  direction: CanvasFrameDirection,
  edges: CanvasFrameEdges,
  natural: CanvasSize,
): boolean {
  if (direction === 'outward') return isCanvasExpanded(edges);
  return isCropRectUsable(canvasFrameToRect(edges, natural), CANVAS_CROP_MIN_SIZE);
}

/**
 * What the pill reports.
 *
 * The two directions report different numbers because they answer different
 * questions — "how big is the cut" versus "what shape is the new canvas" — but
 * both are a read-out, never a control: neither surface offers a preset, and
 * §7 forbids a control that would do nothing.
 */
export function canvasFrameReadout(
  direction: CanvasFrameDirection,
  edges: CanvasFrameEdges,
  natural: CanvasSize,
): string {
  const size = canvasFrameSize(direction, edges, natural);
  if (direction === 'outward') return formatCanvasAspectRatio(size);
  return `${size.width} × ${size.height}`;
}

/**
 * Room kept around the picture on the OUTWARD stage, per axis, as a fraction of
 * that axis.
 *
 * §7.4.4: the outward box used to BE the stage, which meant its grips sat on
 * the very edge of the surface with nothing beyond them — there was visibly
 * nowhere to drag to, and the picture rescaled under the box on every move.
 * The stage now always keeps a margin of empty room around the picture, so the
 * box reads as what the owner asked for: a frame wrapped around a picture that
 * stays exactly where it is, with somewhere to be dragged in both directions.
 */
const OUTWARD_STAGE_HEADROOM = 0.25;

/**
 * Percentages of the STAGE for the frame box and for the picture inside it.
 *
 * Inward: the stage is the picture and the box is a rectangle inside it.
 * Outward: the stage is the picture plus a symmetric margin — big enough for
 * whatever has been dragged so far, never smaller than the headroom — with the
 * picture centred on it and the box drawn over it. Keeping that margin
 * symmetric is what pins the picture down: expanding to the left alone grows
 * the box leftwards while the picture stays put, which is exactly the owner's
 * reference shot.
 *
 * Neither direction reads a layout measurement: pan, zoom and window resizes
 * cannot desynchronise a percentage.
 */
export interface CanvasFrameLayout {
  /** The stage's own size in natural pixels; drives its `aspect-ratio`. */
  stage: CanvasSize;
  /** The picture's place on the stage, in stage percentages. */
  image: { left: number; top: number; width: number; height: number };
  /** The draggable box's place on the stage, in stage percentages. */
  frame: { left: number; top: number; width: number; height: number };
}

const FULL_STAGE = { left: 0, top: 0, width: 100, height: 100 };

export function canvasFrameLayout(
  direction: CanvasFrameDirection,
  edges: CanvasFrameEdges,
  natural: CanvasSize,
): CanvasFrameLayout {
  const percent = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0);
  if (direction === 'outward') {
    const marginX = Math.max(
      Math.round(Math.max(0, natural.width) * OUTWARD_STAGE_HEADROOM),
      edges.left,
      edges.right,
      1,
    );
    const marginY = Math.max(
      Math.round(Math.max(0, natural.height) * OUTWARD_STAGE_HEADROOM),
      edges.top,
      edges.bottom,
      1,
    );
    const stage = {
      width: Math.max(1, natural.width + marginX * 2),
      height: Math.max(1, natural.height + marginY * 2),
    };
    const box = expandedCanvasSize(natural, edges);
    return {
      stage,
      // Centred, and centred whatever the frame is doing: the picture does not
      // move while you drag the box around it.
      image: {
        left: percent(marginX, stage.width),
        top: percent(marginY, stage.height),
        width: percent(natural.width, stage.width),
        height: percent(natural.height, stage.height),
      },
      frame: {
        left: percent(marginX - edges.left, stage.width),
        top: percent(marginY - edges.top, stage.height),
        width: percent(box.width, stage.width),
        height: percent(box.height, stage.height),
      },
    };
  }
  const rect = canvasFrameToRect(edges, natural);
  return {
    stage: { width: Math.max(1, natural.width), height: Math.max(1, natural.height) },
    image: FULL_STAGE,
    frame: {
      left: percent(rect.x, natural.width),
      top: percent(rect.y, natural.height),
      width: percent(rect.width, natural.width),
      height: percent(rect.height, natural.height),
    },
  };
}
