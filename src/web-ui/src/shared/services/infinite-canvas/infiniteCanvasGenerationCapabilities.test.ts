import { describe, expect, it } from 'vitest';

import {
  INFINITE_CANVAS_DEFAULT_IMAGE_MODEL,
  INFINITE_CANVAS_DEFAULT_VIDEO_MODEL,
  INFINITE_CANVAS_IMAGE_MODELS,
  INFINITE_CANVAS_MAX_BATCH_SIZE,
  INFINITE_CANVAS_VIDEO_MODELS,
  defaultInfiniteCanvasModelId,
  findInfiniteCanvasModelCapability,
  isEmptyGenerationParams,
  listInfiniteCanvasModels,
  normalizeInfiniteCanvasGenerationParams,
  normalizeInfiniteCanvasGenerationParamsWithReport,
  resolveInfiniteCanvasModelCapability,
  summarizeInfiniteCanvasGenerationParams,
} from './infiniteCanvasGenerationCapabilities';

describe('infinite canvas generation capability table', () => {
  it('lists the default model first for both media kinds', () => {
    expect(INFINITE_CANVAS_IMAGE_MODELS[0].modelId).toBe(INFINITE_CANVAS_DEFAULT_IMAGE_MODEL);
    expect(INFINITE_CANVAS_VIDEO_MODELS[0].modelId).toBe(INFINITE_CANVAS_DEFAULT_VIDEO_MODEL);
    expect(defaultInfiniteCanvasModelId('image')).toBe(INFINITE_CANVAS_DEFAULT_IMAGE_MODEL);
    expect(defaultInfiniteCanvasModelId('video')).toBe(INFINITE_CANVAS_DEFAULT_VIDEO_MODEL);
    expect(listInfiniteCanvasModels('image')).toBe(INFINITE_CANVAS_IMAGE_MODELS);
    expect(listInfiniteCanvasModels('video')).toBe(INFINITE_CANVAS_VIDEO_MODELS);
  });

  it('keeps every allow list free of duplicates and within the schema caps', () => {
    for (const model of INFINITE_CANVAS_IMAGE_MODELS) {
      expect(new Set(model.sizes).size).toBe(model.sizes.length);
      expect(new Set(model.resolutions).size).toBe(model.resolutions.length);
      expect(model.sizes.length).toBeGreaterThan(0);
      expect(model.nMax).toBeGreaterThanOrEqual(1);
      expect(model.nMax).toBeLessThanOrEqual(INFINITE_CANVAS_MAX_BATCH_SIZE);
    }
    for (const model of INFINITE_CANVAS_VIDEO_MODELS) {
      expect(new Set(model.aspectRatios).size).toBe(model.aspectRatios.length);
      expect(new Set(model.durations).size).toBe(model.durations.length);
      // Whichever request field carries it, the ratio choice must exist.
      expect(model.aspectRatios.length).toBeGreaterThan(0);
      expect(model.durations.length).toBeGreaterThan(0);
    }
  });

  it('mirrors the per-model resolution casing of capabilities.rs verbatim', () => {
    // The Rust table really is inconsistent here; copying it wrong would turn
    // every generation into an invalid_input failure.
    expect(findInfiniteCanvasModelCapability('image', 'gpt-image-2'))
      .toMatchObject({ resolutions: ['1k', '2k', '4k'], nMax: 1 });
    expect(findInfiniteCanvasModelCapability('image', 'gemini-3-pro-image-preview'))
      .toMatchObject({ resolutions: ['1K', '2K', '4K'], nMax: 4 });
    expect(findInfiniteCanvasModelCapability('image', 'gemini-3.1-flash-image-preview'))
      .toMatchObject({ resolutions: ['0.5K', '1K', '2K', '4K'], nMax: 4 });
  });

  it('records which request field carries the video aspect ratio', () => {
    expect(findInfiniteCanvasModelCapability('video', 'Omni-Flash-Ext'))
      .toMatchObject({ aspectRatioField: 'aspectRatio', durations: [4, 6, 8, 10] });
    // capabilities.rs leaves `aspect_ratios` empty for seedance: the ratio
    // travels in `size` there.
    expect(findInfiniteCanvasModelCapability('video', 'doubao-seedance-2.0'))
      .toMatchObject({ aspectRatioField: 'size' });
    // kling exposes no resolution choice at all.
    expect(findInfiniteCanvasModelCapability('video', 'kling-v3-omni'))
      .toMatchObject({ aspectRatioField: 'aspectRatio', resolutions: [] });
  });

  it('resolves an unknown model to undefined but never leaves the caller without one', () => {
    expect(findInfiniteCanvasModelCapability('image', 'made-up-model')).toBeUndefined();
    expect(resolveInfiniteCanvasModelCapability('image', 'made-up-model').modelId)
      .toBe(INFINITE_CANVAS_DEFAULT_IMAGE_MODEL);
    expect(findInfiniteCanvasModelCapability('image', undefined)?.modelId)
      .toBe(INFINITE_CANVAS_DEFAULT_IMAGE_MODEL);
  });
});

describe('normalizeInfiniteCanvasGenerationParams', () => {
  it('keeps values the chosen model supports', () => {
    expect(normalizeInfiniteCanvasGenerationParams(
      { model: 'gemini-3-pro-image-preview', size: '16:9', resolution: '2K', n: 3 },
      'image',
    )).toEqual({ model: 'gemini-3-pro-image-preview', size: '16:9', resolution: '2K', n: 3 });
  });

  it('clamps everything the new model cannot do when the model switches', () => {
    // gemini → gpt-image-2: n_max is 1, and `2K` survives as gpt-image-2's own
    // `2k` spelling (P4 review C7 — a case difference is not a lost setting).
    expect(normalizeInfiniteCanvasGenerationParams(
      { model: 'gemini-3-pro-image-preview', size: '21:9', resolution: '2K', n: 4 },
      'image',
      'gpt-image-2',
    )).toEqual({ size: '21:9', resolution: '2k' });
    // 1:4 only exists on the flash model.
    expect(normalizeInfiniteCanvasGenerationParams(
      { model: 'gemini-3.1-flash-image-preview', size: '1:4', resolution: '0.5K' },
      'image',
      'gemini-3-pro-image-preview',
    )).toEqual({ model: 'gemini-3-pro-image-preview' });
  });

  it('never persists the default model or an n of one (an absent field means both)', () => {
    expect(normalizeInfiniteCanvasGenerationParams(
      { model: 'gpt-image-2', n: 1 },
      'image',
    )).toEqual({});
    expect(isEmptyGenerationParams(normalizeInfiniteCanvasGenerationParams(undefined, 'image')))
      .toBe(true);
  });

  it('drops an unknown model together with everything that hung off it', () => {
    expect(normalizeInfiniteCanvasGenerationParams(
      { model: 'model-from-the-future', size: '16:9', n: 4 },
      'image',
    )).toEqual({});
  });

  it('drops the fields that do not belong to the media kind', () => {
    // duration / aspectRatio are video-only; size / n are image-only.
    expect(normalizeInfiniteCanvasGenerationParams(
      { size: '16:9', n: 4, duration: 8, aspectRatio: '16:9' },
      'image',
    )).toEqual({ size: '16:9' });
    expect(normalizeInfiniteCanvasGenerationParams(
      { size: '16:9', n: 4, duration: 8, aspectRatio: '16:9', resolution: '1080p' },
      'video',
    )).toEqual({ duration: 8, aspectRatio: '16:9', resolution: '1080p' });
  });

  it('clamps video duration and resolution onto the chosen video model', () => {
    // 5s and 480p exist on seedance but not on the default video model.
    expect(normalizeInfiniteCanvasGenerationParams(
      { model: 'doubao-seedance-2.0', duration: 5, resolution: '480p', aspectRatio: '4:3' },
      'video',
      'Omni-Flash-Ext',
    )).toEqual({});
    expect(normalizeInfiniteCanvasGenerationParams(
      { duration: 5, resolution: '1080p', aspectRatio: '4:3' },
      'video',
      'doubao-seedance-2.0',
    )).toEqual({
      model: 'doubao-seedance-2.0',
      duration: 5,
      resolution: '1080p',
      aspectRatio: '4:3',
    });
  });

  it('is idempotent: normalizing an already normalized set changes nothing', () => {
    const once = normalizeInfiniteCanvasGenerationParams(
      { model: 'gemini-3.1-flash-image-preview', size: '8:1', resolution: '0.5K', n: 2 },
      'image',
    );
    expect(normalizeInfiniteCanvasGenerationParams(once, 'image')).toEqual(once);
  });
});

// P4 review C7: the two halves of "a model switch never loses a setting in
// silence" — map what only differs by letter case, and report what really goes.
describe('normalizeInfiniteCanvasGenerationParamsWithReport', () => {
  it('maps a resolution that differs only by case onto the target spelling', () => {
    const report = normalizeInfiniteCanvasGenerationParamsWithReport(
      { model: 'gemini-3-pro-image-preview', resolution: '1K' },
      'image',
      'gpt-image-2',
    );

    expect(report.params.resolution).toBe('1k');
    expect(report.dropped).toEqual([]);

    // …and back again, with the gemini spelling restored.
    const back = normalizeInfiniteCanvasGenerationParamsWithReport(
      { model: 'gpt-image-2', resolution: '1k' },
      'image',
      'gemini-3-pro-image-preview',
    );
    expect(back.params.resolution).toBe('1K');
    expect(back.dropped).toEqual([]);
  });

  it('reports every value the target model really cannot keep', () => {
    const report = normalizeInfiniteCanvasGenerationParamsWithReport(
      { model: 'gemini-3.1-flash-image-preview', size: '1:4', resolution: '0.5K', n: 4 },
      'image',
      'gpt-image-2',
    );

    expect(report.params).toEqual({});
    expect(report.dropped).toEqual(['1:4', '0.5K', 'x4']);
  });

  it('reports a video duration the target model does not offer', () => {
    const report = normalizeInfiniteCanvasGenerationParamsWithReport(
      { model: 'doubao-seedance-2.0', aspectRatio: '4:3', duration: 12 },
      'video',
      'Omni-Flash-Ext',
    );

    expect(report.dropped).toEqual(['4:3', '12s']);
    expect(report.params).toEqual({});
  });
});

describe('summarizeInfiniteCanvasGenerationParams', () => {
  it('collapses a parameter set into the card pill text', () => {
    expect(summarizeInfiniteCanvasGenerationParams(
      { model: 'gemini-3-pro-image-preview', size: '16:9', resolution: '2K', n: 3 },
      'image',
    )).toBe('gemini-3-pro-image-preview · 16:9 · 2K · x3');
    expect(summarizeInfiniteCanvasGenerationParams(
      { aspectRatio: '9:16', resolution: '1080p', duration: 8 },
      'video',
    )).toBe('9:16 · 1080p · 8s');
    expect(summarizeInfiniteCanvasGenerationParams(undefined, 'image')).toBe('');
    expect(summarizeInfiniteCanvasGenerationParams({}, 'image')).toBe('');
  });
});
