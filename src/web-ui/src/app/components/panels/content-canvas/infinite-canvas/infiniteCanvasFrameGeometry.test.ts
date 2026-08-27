/**
 * §7.4.1's shared box geometry, direction by direction.
 *
 * The interesting claim of the merge is that the DRAG is one expression for
 * both directions and only the CLAMP knows which one it is in. Both halves are
 * pinned here, along with the lossless round trip between the edge offsets the
 * component holds and the rectangle each lane's submit path needs.
 */
import { describe, expect, it } from 'vitest';

import {
  CANVAS_CROP_MIN_SIZE,
  CANVAS_EXPAND_MAX_RATIO,
} from './infiniteCanvasImageRaster';
import {
  canvasFrameFromRect,
  canvasFrameLayout,
  canvasFrameReadout,
  canvasFrameSize,
  canvasFrameToRect,
  clampCanvasFrameEdges,
  dragCanvasFrameEdges,
  initialCanvasFrameEdges,
  isCanvasFrameConfirmable,
  moveCanvasFrameEdges,
} from './infiniteCanvasFrameGeometry';

const NATURAL = { width: 1000, height: 500 };
const FLUSH = { left: 0, top: 0, right: 0, bottom: 0 };

describe('infiniteCanvasFrameGeometry', () => {
  it('round-trips a rectangle through the edge offsets without loss', () => {
    const rect = { x: 37, y: 11, width: 613, height: 289 };
    expect(canvasFrameToRect(canvasFrameFromRect(rect, NATURAL), NATURAL)).toEqual(rect);
  });

  it('opens inward centred at 80% and outward flush with the picture', () => {
    expect(canvasFrameToRect(initialCanvasFrameEdges('inward', NATURAL), NATURAL))
      .toEqual({ x: 100, y: 50, width: 800, height: 400 });
    expect(initialCanvasFrameEdges('outward', NATURAL)).toEqual(FLUSH);
  });

  /**
   * The whole reason one component can serve both lanes: the west grip reads
   * the same way whichever side of the picture the box is on.
   */
  it('applies one drag expression regardless of direction', () => {
    const start = { left: 10, top: 20, right: 30, bottom: 40 };
    expect(dragCanvasFrameEdges(start, 'nw', -5, -7))
      .toEqual({ left: 15, top: 27, right: 30, bottom: 40 });
    expect(dragCanvasFrameEdges(start, 'se', 5, 7))
      .toEqual({ left: 10, top: 20, right: 35, bottom: 47 });
    // An edge grip touches one axis only.
    expect(dragCanvasFrameEdges(start, 'e', 5, 999)).toEqual({ ...start, right: 35 });
  });

  it('pans without changing the size', () => {
    const start = canvasFrameFromRect({ x: 100, y: 50, width: 800, height: 400 }, NATURAL);
    const moved = canvasFrameToRect(moveCanvasFrameEdges(start, 40, 20), NATURAL);
    expect(moved).toEqual({ x: 140, y: 70, width: 800, height: 400 });
  });

  describe('the inward clamp', () => {
    const clamp = (edges: Parameters<typeof clampCanvasFrameEdges>[1]) => (
      canvasFrameToRect(clampCanvasFrameEdges('inward', edges, NATURAL), NATURAL)
    );

    it('pulls a box dragged past the edge back inside the picture', () => {
      const start = initialCanvasFrameEdges('inward', NATURAL);
      const rect = clamp(dragCanvasFrameEdges(start, 'nw', -600, -600));
      expect(rect.x).toBe(0);
      expect(rect.y).toBe(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(NATURAL.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(NATURAL.height);
    });

    it('holds the minimum size', () => {
      const start = initialCanvasFrameEdges('inward', NATURAL);
      const rect = clamp(dragCanvasFrameEdges(start, 'se', -799, -399));
      expect(rect.width).toBeGreaterThanOrEqual(CANVAS_CROP_MIN_SIZE);
      expect(rect.height).toBeGreaterThanOrEqual(CANVAS_CROP_MIN_SIZE);
    });

    it('mirrors rather than collapses a grip dragged past the opposite edge', () => {
      const start = canvasFrameFromRect({ x: 100, y: 50, width: 800, height: 400 }, NATURAL);
      // Drag the east edge 900 to the left: past the west edge by 100.
      const rect = clamp(dragCanvasFrameEdges(start, 'e', -900, 0));
      expect(rect.width).toBe(100);
      expect(rect.x).toBe(0);
    });

    it('will not confirm a box below the usable size', () => {
      const tiny = canvasFrameFromRect({ x: 0, y: 0, width: 4, height: 4 }, NATURAL);
      expect(isCanvasFrameConfirmable('inward', tiny, NATURAL)).toBe(false);
      expect(
        isCanvasFrameConfirmable('inward', initialCanvasFrameEdges('inward', NATURAL), NATURAL),
      ).toBe(true);
    });

    it('reports the size of the cut', () => {
      expect(canvasFrameReadout('inward', initialCanvasFrameEdges('inward', NATURAL), NATURAL))
        .toBe('800 × 400');
    });
  });

  describe('the outward clamp', () => {
    const clamp = (edges: Parameters<typeof clampCanvasFrameEdges>[1]) => (
      clampCanvasFrameEdges('outward', edges, NATURAL)
    );

    /**
     * The load-bearing rule: outpainting must leave the source pixels alone, so
     * a frame dragged inwards is refused rather than quietly becoming a crop.
     */
    it('refuses every inward drag', () => {
      expect(clamp(dragCanvasFrameEdges(FLUSH, 'e', -400, 0))).toEqual(FLUSH);
      expect(clamp(dragCanvasFrameEdges(FLUSH, 'nw', 400, 400))).toEqual(FLUSH);
      expect(isCanvasFrameConfirmable('outward', FLUSH, NATURAL)).toBe(false);
    });

    it('caps each axis at the write-ceiling ratio', () => {
      const capped = clamp(dragCanvasFrameEdges(FLUSH, 'se', 1e6, 1e6));
      expect(capped.right).toBe(NATURAL.width * CANVAS_EXPAND_MAX_RATIO);
      expect(capped.bottom).toBe(NATURAL.height * CANVAS_EXPAND_MAX_RATIO);
      expect(canvasFrameSize('outward', capped, NATURAL)).toEqual({
        width: NATURAL.width * (1 + CANVAS_EXPAND_MAX_RATIO),
        height: NATURAL.height * (1 + CANVAS_EXPAND_MAX_RATIO),
      });
    });

    it('confirms as soon as any side has been dragged out', () => {
      const grown = clamp(dragCanvasFrameEdges(FLUSH, 'w', -1, 0));
      expect(isCanvasFrameConfirmable('outward', grown, NATURAL)).toBe(true);
    });

    it('reports the shape of the new canvas', () => {
      expect(canvasFrameReadout('outward', FLUSH, NATURAL)).toBe('2 : 1');
      expect(canvasFrameReadout('outward', { ...FLUSH, right: 500 }, NATURAL)).toBe('3 : 1');
    });
  });

  /**
   * Both directions render as "a stage, a picture on it, a box over it", which
   * is what lets one set of grips serve both. The stage is whichever of the two
   * is larger.
   */
  describe('the shared layout', () => {
    it('puts the picture over the whole inward stage and the box inside it', () => {
      const layout = canvasFrameLayout(
        'inward',
        initialCanvasFrameEdges('inward', NATURAL),
        NATURAL,
      );
      expect(layout.stage).toEqual(NATURAL);
      expect(layout.image).toEqual({ left: 0, top: 0, width: 100, height: 100 });
      expect(layout.frame).toEqual({ left: 10, top: 10, width: 80, height: 80 });
    });

    it('puts the box around the whole outward stage and the picture inside it', () => {
      const layout = canvasFrameLayout('outward', { ...FLUSH, left: 1000 }, NATURAL);
      expect(layout.stage).toEqual({ width: 2000, height: 500 });
      expect(layout.image).toEqual({ left: 50, top: 0, width: 50, height: 100 });
      expect(layout.frame).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    });
  });
});
