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

/** Mark fill — semi-transparent so the content underneath stays legible. */
export const CANVAS_MARK_FILL = 'rgba(255, 46, 46, 0.55)';
/** Mark outline, used for the rectangle tool. */
export const CANVAS_MARK_STROKE = 'rgba(255, 46, 46, 0.95)';
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

/** Smallest crop the editor will accept, in natural pixels. */
export const CANVAS_CROP_MIN_SIZE = 30;

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
 * Exports a canvas as BARE base64 (no `data:image/png;base64,` prefix) —
 * exactly the shape `write_canvas_image_bytes` expects for `base64Png`.
 */
export function exportCanvasPngBase64(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL('image/png');
  const comma = dataUrl.indexOf(',');
  return comma < 0 ? dataUrl : dataUrl.slice(comma + 1);
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

/** Whether a drawn selection is large enough to be confirmed. */
export function isCropRectUsable(
  rect: CanvasRect | undefined,
  minSize: number = CANVAS_CROP_MIN_SIZE,
): rect is CanvasRect {
  return Boolean(rect) && rect!.width >= minSize && rect!.height >= minSize;
}

// —— Destination paths ————————————————————————————————————————————————————————

/**
 * Scratch path of a red-mark composite. Keyed on the operation id, so
 * re-submitting the same operation overwrites one file instead of piling up
 * (the idempotency story of PRD §3.7).
 */
export function canvasScratchRelativePath(operationId: string): string {
  return `${CANVAS_SCRATCH_PREFIX}${sanitizeFileStem(operationId)}-mark.png`;
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
