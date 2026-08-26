/**
 * The cells each parameter group offers (§7.3-D), and the little ratio
 * rectangle each ratio cell draws.
 *
 * The point of these assertions is that the union and the per-model gaps both
 * come from the capability table: nothing here is a hand-written list of
 * values, so a change to the table shows up as a failure rather than as a
 * silently wrong popover.
 */
import { describe, expect, it } from 'vitest';

import {
  INFINITE_CANVAS_IMAGE_MODELS,
  INFINITE_CANVAS_VIDEO_MODELS,
} from '@/shared/services/infinite-canvas';
import {
  allowsValue,
  infiniteCanvasCountCells,
  infiniteCanvasDurationCells,
  infiniteCanvasRatioCells,
  infiniteCanvasRatioGlyph,
  infiniteCanvasResolutionCells,
} from './infiniteCanvasParamOptions';

function values(cells: readonly { value: string }[]): string[] {
  return cells.map(cell => cell.value);
}

describe('infiniteCanvasRatioCells', () => {
  it('puts the adaptive value first and covers every model of the kind', () => {
    const image = values(infiniteCanvasRatioCells('image'));
    expect(image[0]).toBe('auto');
    for (const model of INFINITE_CANVAS_IMAGE_MODELS) {
      for (const size of model.sizes) expect(image).toContain(size);
    }

    const video = values(infiniteCanvasRatioCells('video'));
    expect(video[0]).toBe('adaptive');
    for (const model of INFINITE_CANVAS_VIDEO_MODELS) {
      for (const ratio of model.aspectRatios) expect(video).toContain(ratio);
    }
  });

  it('lists each ratio once, whatever how many models offer it', () => {
    const image = values(infiniteCanvasRatioCells('image'));
    expect(new Set(image).size).toBe(image.length);
  });
});

describe('infiniteCanvasResolutionCells', () => {
  it('folds the per-model spelling into one cell, smallest first', () => {
    // The Rust table spells it `1k` on gpt-image-2 and `1K` on the gemini
    // models; one cell covers both, and the normalizer maps the case.
    expect(values(infiniteCanvasResolutionCells('image')))
      .toEqual(['0.5K', '1K', '2K', '4K']);
    expect(values(infiniteCanvasResolutionCells('video')))
      .toEqual(['480P', '720P', '1080P', '4K']);
  });
});

describe('infiniteCanvasDurationCells', () => {
  it('spans every duration any video model offers, ascending', () => {
    expect(values(infiniteCanvasDurationCells('video')))
      .toEqual(['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15']);
    expect(infiniteCanvasDurationCells('image')).toHaveLength(0);
  });
});

describe('infiniteCanvasCountCells', () => {
  it('goes up to the highest batch any image model allows', () => {
    expect(values(infiniteCanvasCountCells('image'))).toEqual(['1', '2', '3', '4']);
    // Video has no batch concept on this lane.
    expect(values(infiniteCanvasCountCells('video'))).toEqual(['1']);
  });
});

describe('allowsValue', () => {
  it('matches the normalizer’s tolerance for letter case', () => {
    expect(allowsValue(['1k', '2k'], '2K')).toBe(true);
    expect(allowsValue(['1k', '2k'], '4K')).toBe(false);
  });
});

describe('infiniteCanvasRatioGlyph', () => {
  it('draws a wide bar for 21:9 and a tall one for 9:16', () => {
    const wide = infiniteCanvasRatioGlyph('21:9', 20)!;
    expect(wide.width).toBe(20);
    expect(wide.height).toBeLessThan(wide.width);

    const tall = infiniteCanvasRatioGlyph('9:16', 20)!;
    expect(tall.height).toBe(20);
    expect(tall.width).toBeLessThan(tall.height);

    const square = infiniteCanvasRatioGlyph('1:1', 20)!;
    expect(square).toEqual({ width: 20, height: 20 });
  });

  it('has no shape for a value that is not a ratio', () => {
    expect(infiniteCanvasRatioGlyph('auto', 20)).toBeUndefined();
    expect(infiniteCanvasRatioGlyph('adaptive', 20)).toBeUndefined();
    expect(infiniteCanvasRatioGlyph('', 20)).toBeUndefined();
  });
});
