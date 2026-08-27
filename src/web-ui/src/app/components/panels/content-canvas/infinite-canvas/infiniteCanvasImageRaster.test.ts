/**
 * P5 W1: the rasterisation base.
 *
 * These are the numbers everything else in P5 rests on — the natural-pixel
 * conversion, the crop clamp, the bare-base64 export shape the R1 command
 * expects, and the two destination paths its allowlist accepts. Pixels are
 * never compared; the 2d context is a recording stub, so what is asserted is
 * geometry and call shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import {
  CANVAS_CROP_MIN_SIZE,
  CANVAS_CROP_PREFIX,
  CANVAS_EXPAND_MAX_RATIO,
  CANVAS_MARK_UNDO_BUDGET_BYTES,
  CANVAS_MARK_UNDO_LIMIT,
  CANVAS_MARK_UNDO_MIN,
  CANVAS_SCRATCH_PREFIX,
  canvasCropRelativePath,
  canvasMarkUndoLimit,
  CanvasTooLargeError,
  canvasScratchRelativePath,
  clampCropRect,
  compositeMarkLayer,
  createCanvasSurface,
  clampExpandInsets,
  cropBitmap,
  dataUrlToBlob,
  expandBitmap,
  expandedCanvasSize,
  formatCanvasAspectRatio,
  isCanvasExpanded,
  exportCanvasPngBase64,
  isCropRectUsable,
  rectFromCorners,
  toNaturalLength,
  toNaturalPoint,
} from './infiniteCanvasImageRaster';

interface DrawCall {
  args: unknown[];
}

function stubCanvas(dom: JSDOM): { draws: DrawCall[] } {
  const draws: DrawCall[] = [];
  const context = {
    drawImage: (...args: unknown[]) => draws.push({ args }),
    clearRect: () => undefined,
    save: () => undefined,
    restore: () => undefined,
  };
  dom.window.HTMLCanvasElement.prototype.getContext = (() => context) as never;
  dom.window.HTMLCanvasElement.prototype.toDataURL = (() => (
    'data:image/png;base64,QUJD'
  )) as never;
  return { draws };
}

describe('infiniteCanvasImageRaster', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Blob', dom.window.Blob);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('screen → natural conversion', () => {
    it('scales a pointer position by the displayed-to-natural ratio', () => {
      const point = toNaturalPoint(
        { clientX: 150, clientY: 100 },
        { left: 50, top: 20, width: 200, height: 100 },
        { width: 1000, height: 500 },
      );
      // (150-50)/200 = half the width; (100-20)/100 = 80% of the height.
      expect(point).toEqual({ x: 500, y: 400 });
    });

    it('falls back to a 1:1 mapping when the displayed box has no size', () => {
      const point = toNaturalPoint(
        { clientX: 12, clientY: 34 },
        { left: 0, top: 0, width: 0, height: 0 },
        { width: 800, height: 600 },
      );
      expect(point).toEqual({ x: 12, y: 34 });
    });

    it('scales the brush diameter by the same ratio', () => {
      expect(toNaturalLength(36, 400, 1600)).toBe(144);
      expect(toNaturalLength(36, 0, 1600)).toBe(36);
    });
  });

  describe('rectangles', () => {
    it('normalises a rectangle dragged up and to the left', () => {
      expect(rectFromCorners({ x: 90, y: 80 }, { x: 20, y: 10 })).toEqual({
        x: 20,
        y: 10,
        width: 70,
        height: 70,
      });
    });

    it('clamps a crop rectangle inside the picture', () => {
      const clamped = clampCropRect(
        { x: -40, y: -10, width: 500, height: 500 },
        { width: 200, height: 300 },
      );
      expect(clamped).toEqual({ x: 0, y: 0, width: 200, height: 300 });
    });

    it('grows a too-small rectangle to the minimum without leaving the picture', () => {
      const clamped = clampCropRect(
        { x: 198, y: 298, width: 2, height: 2 },
        { width: 200, height: 300 },
      );
      expect(clamped.width).toBe(CANVAS_CROP_MIN_SIZE);
      expect(clamped.height).toBe(CANVAS_CROP_MIN_SIZE);
      expect(clamped.x + clamped.width).toBeLessThanOrEqual(200);
      expect(clamped.y + clamped.height).toBeLessThanOrEqual(300);
    });

    it('never demands more than a tiny picture can give', () => {
      const clamped = clampCropRect({ x: 0, y: 0, width: 5, height: 5 }, {
        width: 10,
        height: 10,
      });
      expect(clamped).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    });

    it('refuses a selection below the minimum size', () => {
      expect(isCropRectUsable({ x: 0, y: 0, width: 10, height: 400 })).toBe(false);
      expect(isCropRectUsable({ x: 0, y: 0, width: 40, height: 400 })).toBe(true);
      expect(isCropRectUsable(undefined)).toBe(false);
    });
  });

  describe('surfaces', () => {
    it('composites the mark layer at the source image natural size', () => {
      const { draws } = stubCanvas(dom);
      const source = { width: 1024, height: 768 } as never;
      const marks = { width: 1024, height: 768 } as never;

      const output = compositeMarkLayer(source, marks);

      expect(output.width).toBe(1024);
      expect(output.height).toBe(768);
      // Original first, marks on top — the source pixels are never modified.
      expect(draws).toHaveLength(2);
      expect(draws[0].args[0]).toBe(source);
      expect(draws[1].args[0]).toBe(marks);
    });

    it('cuts the clamped rectangle out of the source at natural scale', () => {
      const { draws } = stubCanvas(dom);
      const source = { width: 400, height: 400 } as never;

      const output = cropBitmap(source, { x: 380, y: 10, width: 100, height: 100 });

      // x is pulled back so the 100-wide cut fits inside a 400-wide picture.
      expect(output.width).toBe(100);
      expect(output.height).toBe(100);
      expect(draws[0].args.slice(1)).toEqual([300, 10, 100, 100, 0, 0, 100, 100]);
    });

    it('exports BARE base64, the shape write_canvas_image_bytes expects', () => {
      stubCanvas(dom);
      const canvas = createCanvasSurface({ width: 8, height: 8 });
      const exported = exportCanvasPngBase64(canvas);
      expect(exported).toBe('QUJD');
      expect(exported.startsWith('data:')).toBe(false);
    });

    /**
     * P5 review P11: a canvas past the browser's maximum surface area does not
     * throw — `toDataURL` quietly returns the empty `data:,`. Passing that on
     * wrote a zero-byte PNG and blamed the backend for it.
     */
    it('names "too large" instead of exporting the empty data:, canvas', () => {
      stubCanvas(dom);
      dom.window.HTMLCanvasElement.prototype.toDataURL = (() => 'data:,') as never;
      const canvas = createCanvasSurface({ width: 40000, height: 40000 });

      expect(() => exportCanvasPngBase64(canvas)).toThrow(CanvasTooLargeError);
    });

    it('never produces a zero-sized surface', () => {
      stubCanvas(dom);
      const canvas = createCanvasSurface({ width: 0, height: -4 });
      expect(canvas.width).toBe(1);
      expect(canvas.height).toBe(1);
    });
  });

  /**
   * P5 review P10: the editor's undo stack holds full-resolution `ImageData`.
   * Thirty entries of a 4096² layer is ~2 GB — enough to take the webview down
   * on exactly the pictures this feature is most useful on.
   */
  describe('undo depth', () => {
    it('gives ordinary pictures the full depth', () => {
      expect(canvasMarkUndoLimit({ width: 800, height: 600 })).toBe(CANVAS_MARK_UNDO_LIMIT);
    });

    it('shrinks the depth so a large layer cannot blow the memory budget', () => {
      const size = { width: 2048, height: 2048 };
      const limit = canvasMarkUndoLimit(size);

      expect(limit).toBeLessThan(CANVAS_MARK_UNDO_LIMIT);
      expect(limit).toBeGreaterThan(CANVAS_MARK_UNDO_MIN);
      expect(limit * size.width * size.height * 4)
        .toBeLessThanOrEqual(CANVAS_MARK_UNDO_BUDGET_BYTES);
    });

    /**
     * The floor wins over the budget, deliberately: one undo has to work even
     * on a picture where a single snapshot is enormous. It is still a tenth of
     * the ~2 GB the flat thirty-entry cap used to reach at this size.
     */
    it('keeps the floor on a 4096² layer, an order of magnitude under the old cap', () => {
      const size = { width: 4096, height: 4096 };
      const perEntry = size.width * size.height * 4;

      expect(canvasMarkUndoLimit(size)).toBe(CANVAS_MARK_UNDO_MIN);
      expect(CANVAS_MARK_UNDO_MIN * perEntry)
        .toBeLessThan(CANVAS_MARK_UNDO_LIMIT * perEntry / 5);
    });

    it('never drops below one useful step, however absurd the picture', () => {
      expect(canvasMarkUndoLimit({ width: 60000, height: 60000 }))
        .toBe(CANVAS_MARK_UNDO_MIN);
    });
  });

  describe('decoding', () => {
    it('turns a base64 data URL into a blob of the declared type', () => {
      const blob = dataUrlToBlob('data:image/png;base64,QUJD');
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBe(3);
    });

    it('rejects anything that is not a data URL', () => {
      // The guard that keeps a future convertFileSrc URL from silently
      // tainting the export canvas.
      expect(() => dataUrlToBlob('asset://localhost/x.png')).toThrow();
    });
  });

  describe('destination paths', () => {
    it('keys the scratch composite on the operation id', () => {
      const path = canvasScratchRelativePath('op-42');
      expect(path).toBe(`${CANVAS_SCRATCH_PREFIX}op-42-mark.png`);
      // The whole point of the scratch directory: it is outside every one of
      // the four MANAGED_MEDIA_SOURCES scan roots, so the media library can
      // never surface an intermediate. Pinned literally on purpose.
      expect(path.startsWith('.void/infinite-canvas/scratch/')).toBe(true);
      expect(path.startsWith('media/generated/')).toBe(false);
      expect(path.startsWith('media/input/')).toBe(false);
      expect(path.startsWith('.void/media/')).toBe(false);
    });

    it('puts crops where the media library will find them', () => {
      const path = canvasCropRelativePath('media/generated/batch-1/image-001.png', 1730000000000);
      expect(path).toBe(`${CANVAS_CROP_PREFIX}image-001-crop-1730000000000.png`);
    });

    it('sanitises names the allowlist would reject', () => {
      const path = canvasCropRelativePath('C:/weird/../名前 一.PNG', 7);
      expect(path.startsWith(CANVAS_CROP_PREFIX)).toBe(true);
      expect(path.endsWith('.png')).toBe(true);
      const stem = path.slice(CANVAS_CROP_PREFIX.length);
      expect(stem).not.toContain('..');
      expect(stem).not.toContain(':');
      expect(stem).not.toContain('/');
    });

    it('never produces an empty stem', () => {
      expect(canvasScratchRelativePath('///')).toBe(`${CANVAS_SCRATCH_PREFIX}image-mark.png`);
    });
  });
});

/**
 * P6: the outpainting geometry.
 *
 * Two rules carry the whole feature — the frame may only grow outwards, and it
 * may only grow so far — and one draw call carries the composite.
 */
describe('outpainting geometry', () => {
  const NATURAL = { width: 400, height: 200 };
  let dom: JSDOM;
  let draws: DrawCall[];

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    ({ draws } = stubCanvas(dom));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses an inset that would make the canvas smaller than the picture', () => {
    expect(clampExpandInsets({ left: -50, top: -1, right: -999, bottom: -0.4 }, NATURAL))
      .toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    expect(expandedCanvasSize(NATURAL, { left: 0, top: 0, right: 0, bottom: 0 }))
      .toEqual(NATURAL);
  });

  it('caps each side at its own axis, not at the larger one', () => {
    const clamped = clampExpandInsets(
      { left: 10_000, top: 10_000, right: 10_000, bottom: 10_000 },
      NATURAL,
    );
    expect(clamped).toEqual({
      left: NATURAL.width * CANVAS_EXPAND_MAX_RATIO,
      right: NATURAL.width * CANVAS_EXPAND_MAX_RATIO,
      top: NATURAL.height * CANVAS_EXPAND_MAX_RATIO,
      bottom: NATURAL.height * CANVAS_EXPAND_MAX_RATIO,
    });
    // At the cap the canvas is 3x on each axis, which is what the 32 MB write
    // ceiling was sized against.
    expect(expandedCanvasSize(NATURAL, clamped)).toEqual({ width: 1200, height: 600 });
  });

  it('rounds to whole pixels and keeps sub-pixel drags honest', () => {
    expect(clampExpandInsets({ left: 12.4, top: 0.6, right: 0, bottom: 0 }, NATURAL))
      .toEqual({ left: 12, top: 1, right: 0, bottom: 0 });
    expect(clampExpandInsets(
      { left: Number.NaN, top: 0, right: 0, bottom: 0 },
      NATURAL,
    ).left).toBe(0);
  });

  it('knows whether anything was asked for at all', () => {
    expect(isCanvasExpanded({ left: 0, top: 0, right: 0, bottom: 0 })).toBe(false);
    expect(isCanvasExpanded({ left: 0, top: 0, right: 1, bottom: 0 })).toBe(true);
  });

  it('draws the source once, at the inset offset, on the expanded surface', () => {
    const source = { width: 400, height: 200 } as unknown as CanvasImageSource & {
      width: number;
      height: number;
    };
    const output = expandBitmap(source, { left: 60, top: 30, right: 20, bottom: 10 });
    expect(output.width).toBe(480);
    expect(output.height).toBe(240);
    // One call, two coordinates: the source travels at natural scale and the
    // margin is left at the canvas's own transparent default.
    expect(draws).toHaveLength(1);
    expect(draws[0].args.slice(1)).toEqual([60, 30]);
  });

  it('reports a tidy ratio when there is one and a decimal when there is not', () => {
    expect(formatCanvasAspectRatio({ width: 1000, height: 500 })).toBe('2 : 1');
    expect(formatCanvasAspectRatio({ width: 1920, height: 1080 })).toBe('16 : 9');
    expect(formatCanvasAspectRatio({ width: 1001, height: 500 })).toBe('2.00 : 1');
  });

  it('names the outpainting scratch file after its own lane', () => {
    expect(canvasScratchRelativePath('op-42', 'expand'))
      .toBe(`${CANVAS_SCRATCH_PREFIX}op-42-expand.png`);
    // The default is unchanged, so the mask lane's path is byte-identical.
    expect(canvasScratchRelativePath('op-42')).toBe(`${CANVAS_SCRATCH_PREFIX}op-42-mark.png`);
  });
});
