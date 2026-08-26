/**
 * The capability chips under each model name (§7.3-C).
 *
 * The rule these pin: every chip is READ from the capability table. The
 * speaker chip in particular is only ever shown for a model the table says
 * emits audio — the table carries no such flag today, so no model shows one
 * rather than the UI guessing from a model name.
 */
import { describe, expect, it } from 'vitest';

import {
  resolveInfiniteCanvasModelCapability,
  INFINITE_CANVAS_IMAGE_MODELS,
  INFINITE_CANVAS_VIDEO_MODELS,
} from '@/shared/services/infinite-canvas';
import {
  highestInfiniteCanvasResolution,
  infiniteCanvasModelChips,
} from './infiniteCanvasModelChips';

describe('highestInfiniteCanvasResolution', () => {
  it('ranks k above p and picks the table’s own spelling', () => {
    expect(highestInfiniteCanvasResolution(['1k', '2k', '4k'])).toBe('4k');
    expect(highestInfiniteCanvasResolution(['480p', '720p', '1080p'])).toBe('1080p');
    expect(highestInfiniteCanvasResolution(['720p', '1080p', '4k'])).toBe('4k');
    expect(highestInfiniteCanvasResolution([])).toBeUndefined();
  });
});

describe('infiniteCanvasModelChips', () => {
  it('reads the video chips off the model’s own allow lists', () => {
    const seedance = resolveInfiniteCanvasModelCapability('video', 'doubao-seedance-2.0');
    expect(infiniteCanvasModelChips(seedance)).toEqual({
      resolution: '1080P',
      duration: '4-15S',
      hasAudio: false,
    });

    const omni = resolveInfiniteCanvasModelCapability('video', undefined);
    expect(infiniteCanvasModelChips(omni)).toEqual({
      resolution: '4K',
      duration: '4-10S',
      hasAudio: false,
    });
  });

  it('gives an image model a resolution chip and no duration', () => {
    const gpt = resolveInfiniteCanvasModelCapability('image', 'gpt-image-2');
    expect(infiniteCanvasModelChips(gpt)).toEqual({ resolution: '4K', hasAudio: false });
  });

  it('omits the resolution chip for a model that exposes no choice', () => {
    const kling = resolveInfiniteCanvasModelCapability('video', 'kling-v3-omni');
    const chips = infiniteCanvasModelChips(kling);
    expect(chips.resolution).toBeUndefined();
    expect(chips.duration).toBe('3-15S');
  });

  it('claims sound for no model, because the table records none', () => {
    for (const model of [...INFINITE_CANVAS_IMAGE_MODELS, ...INFINITE_CANVAS_VIDEO_MODELS]) {
      expect(infiniteCanvasModelChips(model).hasAudio).toBe(false);
    }
  });
});
