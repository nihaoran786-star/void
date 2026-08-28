/**
 * P5 W1: the image-rasterisation base of the mask brush and the crop editor.
 *
 * Pure functions plus the two path builders the R1 desktop command's allowlist
 * accepts. Nothing here reaches for Tauri, React or the document: the editors
 * hand a bitmap in and take a bare base64 PNG out, and the panel writes it
 * through the injected asset-writer port.
 *
 * Two rules are load-bearing and must not be relaxed:
 *
 * - **Decoding always goes through `createImageBitmap`, never
 *   `drawImage(<img>)`.** Our sources are data URLs produced by
 *   `resolveInfiniteCanvasMediaPreviewUrl` (`forceDataUrl: true`), which are
 *   same-origin and would not taint a canvas — but the reference
 *   implementation recorded "The operation is insecure" twice when an
 *   `asset://`-backed `<img>` reached `toDataURL`, and leaving the `<img>` path
 *   open here is exactly how someone reintroduces `convertFileSrc` later.
 * - **The mark layer is measured in the image's NATURAL pixels.** The editor
 *   scales pointer coordinates into that space, so the composite that reaches
 *   the model is the full-resolution picture with the marks burnt in, never a
 *   screen-sized downscale.
 *
 * The red of the marks is a FUNCTIONAL constant, not a theme colour: it is
 * what lets a general image model locate the region. It never enters the
 * `--canvas-*` token set and never changes with the light/dark theme.
 */

import type { CanvasExpandInsets } from '@/shared/services/infinite-canvas';

/** Mark fill — semi-transparent so the content underneath stays legible. */
export const CANVAS_MARK_FILL = 'rgba(255, 46, 46, 0.55)';
/** Mark outline, used for the rectangle tool. */
export const CANVAS_MARK_STROKE = 'rgba(255, 46, 46, 0.95)';
/**
 * Eraser stroke colour — FULLY OPAQUE, and that is the whole point.
 *
 * P5 review C4: the eraser draws with `destination-out`, where the *source
 * alpha* decides how much of the destination is removed. Painting it with the
 * translucent `CANVAS_MARK_FILL` removed only 55% of the mark per pass, so a
 * "cleared" area kept a pink ghost that the composite then burnt into the
 * picture — directly contradicting the directive's "only the area covered by
 * the red marking". Alpha 1 removes the mark completely in one pass. The RGB
 * channels are ignored by `destination-out`; black is simply the honest
 * "no colour is being contributed" value.
 */
export const CANVAS_MARK_ERASE = 'rgba(0, 0, 0, 1)';
/** Rectangle outline width, in natural pixels. */
export const CANVAS_MARK_STROKE_WIDTH = 4;

/** Brush diameter bounds and default, in natural pixels. */
export const CANVAS_BRUSH_MIN = 8;
export const CANVAS_BRUSH_MAX = 120;
export const CANVAS_BRUSH_DEFAULT = 36;

/**
 * Depth of the editor's OWN undo stack. Deliberately small: each entry is a
 * full `ImageData` of the mark layer, and this stack is completely isolated
 * from the canvas document history (`infiniteCanvasHistory.ts`).
 */
export const CANVAS_MARK_UNDO_LIMIT = 30;

/**
 * How much memory the editor's undo stack is allowed to hold, in bytes.
 *
 * P5 review P10: at 30 entries a 4096×4096 mark layer would keep ~2 GB of
 * `ImageData` alive — enough to take the webview down on the exact pictures
 * this feature is most useful on. The depth is therefore a budget, not a
 * constant: big pictures simply get a shorter history.
 */
export const CANVAS_MARK_UNDO_BUDGET_BYTES = 192 * 1024 * 1024;

/**
 * Undo depth for a mark layer of the given natural size: `CANVAS_MARK_UNDO_LIMIT`
 * for ordinary pictures, shrinking as one snapshot (`width × height × 4` bytes
 * of RGBA) grows, and **0** for a picture so large that the budget cannot pay
 * for even a single snapshot.
 *
 * Adversarial review C6: there used to be a hard floor of four entries that
 * won over the budget (`Math.max(4, affordable)`), which made the "budget" a
 * suggestion. An 8192² mark layer costs 268 MB a snapshot, so the floor alone
 * reserved 1.07 GB — 5.6× what this file says it will spend, on exactly the
 * pictures where the webview has least room to spare. The budget is now
 * absolute: it is the only thing that decides the depth.
 *
 * Zero means "undo is off for this picture", and the editor says so rather
 * than showing a button that cannot work: a silently dead control is the one
 * outcome worse than an honest absence.
 */
export function canvasMarkUndoLimit(size: CanvasSize): number {
  const pixels = Math.max(1, Math.round(size.width)) * Math.max(1, Math.round(size.height));
  const perEntry = Math.max(1, pixels * 4);
  const affordable = Math.floor(CANVAS_MARK_UNDO_BUDGET_BYTES / perEntry);
  if (affordable < 1) return 0;
  return Math.min(CANVAS_MARK_UNDO_LIMIT, affordable);
}

/** Smallest crop the editor will accept, in natural pixels. */
export const CANVAS_CROP_MIN_SIZE = 30;

/**
 * Outpainting: how far past the original each side may be dragged, as a
 * multiple of that axis of the picture. `1` means "each side may add at most
 * one full width (or height)", i.e. at most 3× on each axis in total.
 *
 * A limit is not decoration. The composite is rasterised in the browser and
 * then base64-encoded through the 32 MB write ceiling; an unbounded frame turns
 * a two-second drag into a typed `invalid_input` the user cannot connect to
 * anything they did.
 */
export const CANVAS_EXPAND_MAX_RATIO = 1;

/** The scratch directory. Outside all four media-library scan roots. */
export const CANVAS_SCRATCH_PREFIX = '.void/infinite-canvas/scratch/';
/** The crop directory. Inside `media/input`, so the library finds crops. */
export const CANVAS_CROP_PREFIX = 'media/input/canvas-crops/';

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

/** Anything with intrinsic pixels a 2d context can draw: bitmap or canvas. */
export interface CanvasDrawableImage {
  readonly width: number;
  readonly height: number;
}

// —— Decoding ————————————————————————————————————————————————————————————————

/**
 * Splits a `data:` URL into its media type and raw bytes without going through
 * `fetch` (which no test environment here provides for data URLs).
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) {
    throw new Error('Not a data URL.');
  }
  const header = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const type = header.replace(/;base64$/, '') || 'image/png';
  if (!header.endsWith(';base64')) {
    return new Blob([decodeURIComponent(payload)], { type });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
}

/**
 * The ONE decode lane (see the file header). Rejects anything that is not a
 * data URL so a future `convertFileSrc` URL fails loudly here instead of
 * silently tainting a canvas at export time.
 */
export async function loadCanvasImageBitmap(dataUrl: string): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('createImageBitmap is unavailable in this environment.');
  }
  return createImageBitmap(dataUrlToBlob(dataUrl));
}

/**
 * Adversarial review C5: hands a decoded bitmap back to the browser.
 *
 * An `ImageBitmap` holds native memory the JavaScript garbage collector does
 * not account for, and the two board-filling editors never released theirs: a
 * 4096² picture cost ~64 MB per open, and closing the editor gave none of it
 * back. Every decode in the editors now has exactly one owner, and this is how
 * the owner lets go.
 *
 * Tolerant of an environment (or a test double) whose bitmaps have no `close`,
 * and of being called twice on the same bitmap.
 */
export function closeCanvasImageBitmap(bitmap: ImageBitmap | undefined | null): void {
  if (!bitmap) return;
  const close = (bitmap as Partial<ImageBitmap>).close;
  if (typeof close !== 'function') return;
  try {
    close.call(bitmap);
  } catch {
    // An already-closed bitmap is not an error worth surfacing.
  }
}

// —— Surfaces ————————————————————————————————————————————————————————————————

/** A blank canvas of the given natural size. */
export function createCanvasSurface(size: CanvasSize): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(size.width));
  canvas.height = Math.max(1, Math.round(size.height));
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2d canvas context is unavailable.');
  return context;
}

/**
 * Burns the mark layer into a copy of the source image (the "red-mark
 * composite" of PRD §3.7). Two `drawImage` calls at natural size — the source
 * itself is never modified, on disk or in memory.
 */
export function compositeMarkLayer(
  source: CanvasImageSource & CanvasDrawableImage,
  markLayer: CanvasImageSource & CanvasDrawableImage,
): HTMLCanvasElement {
  const output = createCanvasSurface({ width: source.width, height: source.height });
  const context = context2d(output);
  context.drawImage(source, 0, 0);
  context.drawImage(markLayer, 0, 0);
  return output;
}

/** Cuts `rect` (already in natural pixels) out of the source image. */
export function cropBitmap(
  source: CanvasImageSource & CanvasDrawableImage,
  rect: CanvasRect,
): HTMLCanvasElement {
  const clamped = clampCropRect(rect, { width: source.width, height: source.height });
  const output = createCanvasSurface(clamped);
  const context = context2d(output);
  context.drawImage(
    source,
    clamped.x,
    clamped.y,
    clamped.width,
    clamped.height,
    0,
    0,
    clamped.width,
    clamped.height,
  );
  return output;
}

/**
 * Places the source picture on a LARGER, otherwise transparent canvas — the
 * outpainting composite of the expand editor.
 *
 * Deliberately the same shape as `cropBitmap`: one `drawImage` at natural size
 * onto a surface this module created, source untouched. The margin is left at
 * the canvas's own initial value (fully transparent) rather than painted, so
 * the model receives "here is the picture, here is empty room around it" with
 * no invented grey or white to explain away.
 */
export function expandBitmap(
  source: CanvasImageSource & CanvasDrawableImage,
  insets: CanvasExpandInsets,
): HTMLCanvasElement {
  const natural = { width: source.width, height: source.height };
  const clamped = clampExpandInsets(insets, natural);
  const output = createCanvasSurface(expandedCanvasSize(natural, clamped));
  const context = context2d(output);
  context.drawImage(source, clamped.left, clamped.top);
  return output;
}

/**
 * The picture is larger than this browser can rasterise. Distinct from a write
 * failure: nothing reached the disk and nothing was charged, and the wording
 * the user sees has to say "too big", not "saving failed".
 */
export class CanvasTooLargeError extends Error {
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    super(`The canvas is too large to export (${width}×${height}).`);
    this.name = 'CanvasTooLargeError';
    this.width = width;
    this.height = height;
  }
}

/**
 * Exports a canvas as BARE base64 (no `data:image/png;base64,` prefix) —
 * exactly the shape `write_canvas_image_bytes` expects for `base64Png`.
 */
export function exportCanvasPngBase64(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL('image/png');
  const comma = dataUrl.indexOf(',');
  const payload = comma < 0 ? dataUrl : dataUrl.slice(comma + 1);
  // P5 review P11: a canvas past the browser's maximum surface area does not
  // throw — `toDataURL` quietly returns the empty `data:,`. Sending that on
  // would have written a zero-byte PNG and blamed the backend for it, so the
  // one place that can still tell what happened raises a named error instead.
  if (payload.length === 0) throw new CanvasTooLargeError(canvas.width, canvas.height);
  return payload;
}

// —— Geometry ————————————————————————————————————————————————————————————————

/**
 * Screen (client) point → natural image pixel.
 *
 * `displayed` is the on-screen box of the picture; `natural` its intrinsic
 * size. The ratio is taken per axis so a non-uniform box (which `object-fit:
 * contain` never produces, but a future layout might) still maps honestly.
 */
export function toNaturalPoint(
  point: { clientX: number; clientY: number },
  displayed: { left: number; top: number; width: number; height: number },
  natural: CanvasSize,
): { x: number; y: number } {
  const scaleX = displayed.width > 0 ? natural.width / displayed.width : 1;
  const scaleY = displayed.height > 0 ? natural.height / displayed.height : 1;
  return {
    x: (point.clientX - displayed.left) * scaleX,
    y: (point.clientY - displayed.top) * scaleY,
  };
}

/** Screen brush diameter → natural brush diameter, using the same ratio. */
export function toNaturalLength(
  length: number,
  displayedWidth: number,
  naturalWidth: number,
): number {
  if (displayedWidth <= 0) return length;
  return length * (naturalWidth / displayedWidth);
}

/** A rectangle from two corners, normalised so width/height are positive. */
export function rectFromCorners(
  from: { x: number; y: number },
  to: { x: number; y: number },
): CanvasRect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}

/**
 * Clamps a crop rectangle into the image and up to the minimum size.
 *
 * Order matters: the rectangle is first pulled inside the bounds, then grown
 * to the minimum, then pulled inside again — so a tiny selection in a corner
 * grows inwards rather than off the edge.
 */
export function clampCropRect(
  rect: CanvasRect,
  bounds: CanvasSize,
  minSize: number = CANVAS_CROP_MIN_SIZE,
): CanvasRect {
  const maxWidth = Math.max(1, Math.round(bounds.width));
  const maxHeight = Math.max(1, Math.round(bounds.height));
  const floor = Math.max(1, Math.min(minSize, maxWidth, maxHeight));

  let width = Math.round(Math.max(floor, Math.min(rect.width, maxWidth)));
  let height = Math.round(Math.max(floor, Math.min(rect.height, maxHeight)));
  width = Math.min(width, maxWidth);
  height = Math.min(height, maxHeight);

  const x = Math.round(Math.min(Math.max(rect.x, 0), maxWidth - width));
  const y = Math.round(Math.min(Math.max(rect.y, 0), maxHeight - height));
  return { x, y, width, height };
}

// —— Outpainting geometry ————————————————————————————————————————————————————

/** No expansion at all — what the expand editor opens with. */
export const CANVAS_EXPAND_NO_INSETS: CanvasExpandInsets = {
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
};

/**
 * How many pixels the outpainting composite may cover, whatever the ratio
 * allows.
 *
 * Adversarial review P5: `CANVAS_EXPAND_MAX_RATIO` is a per-axis multiple, so
 * on both axes at once it is a NINEFOLD area. A 4096² picture could be dragged
 * to 12288² — 151 million pixels — and the editor would allocate that canvas
 * before `exportCanvasPngBase64` told the user it was too big. A ratio cannot
 * express "how much memory this costs"; only an area budget can, so the two
 * caps are applied together and the tighter one wins.
 *
 * 64 Mpx is one 8192² picture: comfortably inside every browser's maximum
 * canvas area, and small enough that the base64 PNG has a chance of clearing
 * the 32 MB write ceiling.
 */
export const CANVAS_EXPAND_MAX_PIXELS = 64 * 1024 * 1024;

/**
 * The furthest each side may be dragged, in natural pixels.
 *
 * Two caps, tighter one wins: `ratio` per axis, and
 * `CANVAS_EXPAND_MAX_PIXELS` over the finished area. The area cap is turned
 * into a per-axis one by asking how far BOTH axes may grow together —
 * `(1 + 2r)² × w × h ≤ budget` — which is what makes the frame stop at a size
 * that can actually be rasterised instead of at a ratio that cannot.
 */
export function canvasExpandMaxInsets(
  natural: CanvasSize,
  ratio: number = CANVAS_EXPAND_MAX_RATIO,
  maxPixels: number = CANVAS_EXPAND_MAX_PIXELS,
): CanvasExpandInsets {
  const width = Math.max(0, natural.width);
  const height = Math.max(0, natural.height);
  const area = width * height;
  // Growth factor per axis: 1 + 2 × ratio, held down to what the area budget
  // can pay for. Never below 1 — a budget too small for the picture itself
  // simply means "no expansion at all", not a negative inset.
  const wanted = 1 + 2 * Math.max(0, ratio);
  const affordable = area > 0 ? Math.sqrt(Math.max(0, maxPixels) / area) : wanted;
  const growth = Math.max(1, Math.min(wanted, affordable));
  const horizontal = Math.max(0, Math.round(width * (growth - 1) / 2));
  const vertical = Math.max(0, Math.round(height * (growth - 1) / 2));
  return { left: horizontal, right: horizontal, top: vertical, bottom: vertical };
}

/**
 * The one rule of the outer frame: it may only grow OUTWARDS, and only so far.
 *
 * Negative insets are what "dragged inwards" would mean, and outpainting has no
 * such thing — the original picture must survive the operation untouched, so a
 * frame smaller than it is clamped away rather than reinterpreted as a crop.
 */
export function clampExpandInsets(
  insets: CanvasExpandInsets,
  natural: CanvasSize,
  ratio: number = CANVAS_EXPAND_MAX_RATIO,
  maxPixels: number = CANVAS_EXPAND_MAX_PIXELS,
): CanvasExpandInsets {
  const max = canvasExpandMaxInsets(natural, ratio, maxPixels);
  const clamp = (value: number, limit: number) => (
    Math.round(Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), limit))
  );
  return {
    left: clamp(insets.left, max.left),
    top: clamp(insets.top, max.top),
    right: clamp(insets.right, max.right),
    bottom: clamp(insets.bottom, max.bottom),
  };
}

/** Size of the canvas the composite will be written at. */
export function expandedCanvasSize(
  natural: CanvasSize,
  insets: CanvasExpandInsets,
): CanvasSize {
  return {
    width: Math.max(1, Math.round(natural.width + insets.left + insets.right)),
    height: Math.max(1, Math.round(natural.height + insets.top + insets.bottom)),
  };
}

/** Whether the frame has been dragged out at all — the confirm gate. */
export function isCanvasExpanded(insets: CanvasExpandInsets): boolean {
  return insets.left > 0 || insets.top > 0 || insets.right > 0 || insets.bottom > 0;
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right > 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

/**
 * The frame's aspect ratio, as the pill shows it.
 *
 * There is no aspect-ratio PRESET on this surface — the ratio is whatever the
 * frame the user dragged happens to be — so the pill only reports it. A tidy
 * ratio reads as `3 : 2`; anything that does not reduce is reported as a
 * decimal rather than as an unreadable pair of four-digit numbers.
 */
export function formatCanvasAspectRatio(size: CanvasSize): string {
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  const divisor = greatestCommonDivisor(width, height);
  const reducedWidth = width / divisor;
  const reducedHeight = height / divisor;
  if (reducedWidth <= 50 && reducedHeight <= 50) {
    return `${reducedWidth} : ${reducedHeight}`;
  }
  return `${(width / height).toFixed(2)} : 1`;
}

/** Whether a drawn selection is large enough to be confirmed. */
export function isCropRectUsable(
  rect: CanvasRect | undefined,
  minSize: number = CANVAS_CROP_MIN_SIZE,
): rect is CanvasRect {
  return Boolean(rect) && rect!.width >= minSize && rect!.height >= minSize;
}

// —— Destination paths ————————————————————————————————————————————————————————

/** Which composite a scratch file holds. Only the file name differs. */
export type CanvasScratchKind = 'mark' | 'expand';

/**
 * Scratch path of a submitted composite — the red-mark one, or the
 * outpainting one. Keyed on the operation id, so re-submitting the same
 * operation overwrites one file instead of piling up (the idempotency story of
 * PRD §3.7), and named after the lane so a scratch sweep is readable.
 */
export function canvasScratchRelativePath(
  operationId: string,
  kind: CanvasScratchKind = 'mark',
): string {
  return `${CANVAS_SCRATCH_PREFIX}${sanitizeFileStem(operationId)}-${kind}.png`;
}

/**
 * Crop destination. The source file's stem travels along so the media library
 * entry is recognisable; the timestamp keeps repeated crops of one picture
 * apart (nothing is ever overwritten — PRD §3.8).
 */
export function canvasCropRelativePath(
  sourceRelativePath: string,
  timestamp: number,
): string {
  const fileName = sourceRelativePath.split(/[\\/]/).pop() ?? 'image';
  const stem = fileName.replace(/\.[^.]+$/, '') || 'image';
  return `${CANVAS_CROP_PREFIX}${sanitizeFileStem(stem)}-crop-${timestamp}.png`;
}

/**
 * Keeps a generated file stem inside the character set the R1 allowlist can
 * accept: no separators, no drive colons, no `..`.
 */
function sanitizeFileStem(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/\.+/g, '.');
  const trimmed = cleaned.replace(/^[.-]+/, '').replace(/[.-]+$/, '');
  return trimmed.length > 0 ? trimmed.slice(0, 64) : 'image';
}
