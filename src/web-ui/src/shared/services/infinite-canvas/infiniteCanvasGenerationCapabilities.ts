/**
 * Front-end mirror of the media generation capability table (P4 W2, plan
 * §2.2).
 *
 * ⚠️ THE SINGLE SOURCE OF TRUTH IS THE RUST TABLE:
 * `src/crates/assembly/core/src/agentic/media/capabilities.rs`
 * (`image_capability` / `video_capability`, and the `DEFAULT_IMAGE_MODEL` /
 * `DEFAULT_VIDEO_MODEL` constants). Anyone who edits that table MUST edit
 * this file in the same change. This module is pure data plus pure functions:
 * no React, no Tauri, no I/O.
 *
 * Two disciplines make the duplication safe:
 *
 * 1. The UI only ever offers values this table lists, so the common case
 *    never reaches the backend validator at all.
 * 2. If this table drifts anyway, the fallback is a typed degrade, not a
 *    silent one: the tool layer answers `MediaValidationError`, the desktop
 *    command maps it to `invalid_input`, and the card settles as a
 *    retryable typed failure with the parameter name in the message.
 *
 * "Clamping" here always means DROPPING an unsupported value, never
 * substituting an invented one. An absent parameter is exactly the pre-P4
 * request: the field is not sent and the provider's own default applies.
 * The Rust table has no per-model default values to copy, so inventing them
 * front-side would change behaviour behind the user's back.
 *
 * Two P4-review refinements, neither of which invents anything: a value that
 * differs from an allow-list entry only by letter case is MAPPED onto that
 * entry (`1K` → `1k`), and whatever really cannot be carried over is reported
 * back to the caller so the UI can say what it dropped.
 */
import type {
  InfiniteCanvasGenerationMediaKind,
  InfiniteCanvasGenerationParams,
} from './InfiniteCanvasTypes';

/** capabilities.rs `DEFAULT_IMAGE_MODEL`. */
export const INFINITE_CANVAS_DEFAULT_IMAGE_MODEL = 'gpt-image-2';
/** capabilities.rs `DEFAULT_VIDEO_MODEL`. */
export const INFINITE_CANVAS_DEFAULT_VIDEO_MODEL = 'Omni-Flash-Ext';
/** Hard batch ceiling from the GenerateImage tool schema; never configurable. */
export const INFINITE_CANVAS_MAX_BATCH_SIZE = 4;

export interface InfiniteCanvasImageModelCapability {
  mediaKind: 'image';
  modelId: string;
  /** `size` (aspect ratio) allow list, in the Rust table's order. */
  sizes: readonly string[];
  /** `resolution` allow list — CASE IS PER MODEL, copied verbatim. */
  resolutions: readonly string[];
  /** Highest legal `n`; gpt-image-2 is pinned to 1 (`n_max = 1`). */
  nMax: number;
}

export interface InfiniteCanvasVideoModelCapability {
  mediaKind: 'video';
  modelId: string;
  /**
   * Aspect-ratio allow list. Which request field carries it differs per
   * model, hence {@link aspectRatioField}: `Omni-Flash-Ext` accepts both
   * `aspect_ratio` and `size`, `doubao-seedance-2.0*` only `size`
   * (`aspect_ratios` is empty there), `kling-v3-omni` only `aspect_ratio`
   * (`sizes` is empty there).
   */
  aspectRatios: readonly string[];
  aspectRatioField: 'aspectRatio' | 'size';
  /** `resolution` allow list; empty = the model exposes no choice. */
  resolutions: readonly string[];
  /** `duration` allow list in seconds. */
  durations: readonly number[];
}

export type InfiniteCanvasModelCapability =
  | InfiniteCanvasImageModelCapability
  | InfiniteCanvasVideoModelCapability;

const GEMINI_PRO_SIZES = [
  'auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
] as const;

const GEMINI_FLASH_SIZES = [
  'auto', '1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '5:4', '4:5', '21:9',
  '1:4', '4:1', '1:8', '8:1',
] as const;

const SEEDANCE_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

function geminiProImage(modelId: string): InfiniteCanvasImageModelCapability {
  return {
    mediaKind: 'image',
    modelId,
    sizes: GEMINI_PRO_SIZES,
    resolutions: ['1K', '2K', '4K'],
    nMax: 4,
  };
}

function geminiFlashImage(modelId: string): InfiniteCanvasImageModelCapability {
  return {
    mediaKind: 'image',
    modelId,
    sizes: GEMINI_FLASH_SIZES,
    resolutions: ['0.5K', '1K', '2K', '4K'],
    nMax: 4,
  };
}

function seedanceVideo(modelId: string): InfiniteCanvasVideoModelCapability {
  return {
    mediaKind: 'video',
    modelId,
    // capabilities.rs: `aspect_ratios` is empty for seedance, the ratio
    // travels in `size`.
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
    aspectRatioField: 'size',
    resolutions: ['480p', '720p', '1080p'],
    durations: SEEDANCE_DURATIONS,
  };
}

/** Mirrors `image_capability`, in menu order (the default model first). */
export const INFINITE_CANVAS_IMAGE_MODELS: readonly InfiniteCanvasImageModelCapability[] = [
  {
    mediaKind: 'image',
    modelId: INFINITE_CANVAS_DEFAULT_IMAGE_MODEL,
    sizes: [
      'auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16',
      '2:1', '1:2', '3:1', '1:3', '21:9', '9:21',
    ],
    // Lower case here and upper case on the gemini models is not a typo:
    // capabilities.rs really does differ per model.
    resolutions: ['1k', '2k', '4k'],
    nMax: 1,
  },
  geminiProImage('gemini-3-pro-image-preview'),
  geminiProImage('gemini-3-pro-image-preview-official'),
  geminiFlashImage('gemini-3.1-flash-image-preview'),
  geminiFlashImage('gemini-3.1-flash-image-preview-official'),
];

/** Mirrors `video_capability`, in menu order (the default model first). */
export const INFINITE_CANVAS_VIDEO_MODELS: readonly InfiniteCanvasVideoModelCapability[] = [
  {
    mediaKind: 'video',
    modelId: INFINITE_CANVAS_DEFAULT_VIDEO_MODEL,
    aspectRatios: ['16:9', '9:16'],
    aspectRatioField: 'aspectRatio',
    resolutions: ['720p', '1080p', '4k'],
    durations: [4, 6, 8, 10],
  },
  seedanceVideo('doubao-seedance-2.0'),
  seedanceVideo('doubao-seedance-2.0-fast'),
  seedanceVideo('doubao-seedance-2.0-face'),
  seedanceVideo('doubao-seedance-2.0-fast-face'),
  {
    mediaKind: 'video',
    modelId: 'kling-v3-omni',
    aspectRatios: ['16:9', '9:16', '1:1'],
    aspectRatioField: 'aspectRatio',
    // capabilities.rs: `resolutions` is empty — no resolution choice exists.
    resolutions: [],
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  },
];

/** The models a card of this media kind may choose from. */
export function listInfiniteCanvasModels(
  mediaKind: InfiniteCanvasGenerationMediaKind,
): readonly InfiniteCanvasModelCapability[] {
  return mediaKind === 'video' ? INFINITE_CANVAS_VIDEO_MODELS : INFINITE_CANVAS_IMAGE_MODELS;
}

export function defaultInfiniteCanvasModelId(
  mediaKind: InfiniteCanvasGenerationMediaKind,
): string {
  return mediaKind === 'video'
    ? INFINITE_CANVAS_DEFAULT_VIDEO_MODEL
    : INFINITE_CANVAS_DEFAULT_IMAGE_MODEL;
}

/**
 * Capability of an explicit model, or of the default model when `modelId` is
 * absent. A model this table does not know returns `undefined` — callers
 * treat that as "fall back to the default model" rather than guessing an
 * allow list.
 */
export function findInfiniteCanvasModelCapability(
  mediaKind: InfiniteCanvasGenerationMediaKind,
  modelId: string | undefined,
): InfiniteCanvasModelCapability | undefined {
  const wanted = modelId?.trim() ? modelId : defaultInfiniteCanvasModelId(mediaKind);
  return listInfiniteCanvasModels(mediaKind).find(entry => entry.modelId === wanted);
}

/** The effective capability: never undefined, falling back to the default model. */
export function resolveInfiniteCanvasModelCapability(
  mediaKind: InfiniteCanvasGenerationMediaKind,
  modelId: string | undefined,
): InfiniteCanvasModelCapability {
  return findInfiniteCanvasModelCapability(mediaKind, modelId)
    ?? findInfiniteCanvasModelCapability(mediaKind, undefined)!;
}

/**
 * Picks the allow-list entry for `value`.
 *
 * Exact match first, then a case-insensitive one that returns the allow list's
 * OWN spelling. The Rust table really does spell the same resolution `1K` on
 * the gemini models and `1k` on gpt-image-2 (plan §506), so switching between
 * them used to silently throw the user's choice away over letter case alone.
 * Mapping is not inventing a value: the result is still a verbatim entry of
 * the target model's allow list.
 */
function pick(
  allowed: readonly string[],
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (allowed.includes(value)) return value;
  const folded = value.trim().toLowerCase();
  return allowed.find(entry => entry.toLowerCase() === folded);
}

/**
 * What a normalization had to give up, in the user's own terms: the values
 * that could not be carried over to the target model. The popover shows them
 * so switching a model never loses a setting silently (P4 review C7).
 */
export interface InfiniteCanvasGenerationParamsNormalization {
  params: InfiniteCanvasGenerationParams;
  /** Verbatim values that were dropped, e.g. `['4:1', 'x4']`. Never localized. */
  dropped: string[];
}

/**
 * Clamps a parameter set onto one model's allow lists (plan §2.2 "switching
 * the model clamps"). Unsupported values — and every field that does not
 * apply to this media kind — are dropped, so the resulting request is always
 * a subset of what the backend accepts. Dropping is the whole strategy: a
 * dropped field reproduces the pre-P4 request byte for byte.
 *
 * `model` overrides `params.model`, which is what the model picker passes
 * when the user switches models; with no override the params' own model (or
 * the default one) rules. A model this table does not know is dropped too.
 */
export function normalizeInfiniteCanvasGenerationParams(
  params: InfiniteCanvasGenerationParams | undefined,
  mediaKind: InfiniteCanvasGenerationMediaKind,
  model?: string,
): InfiniteCanvasGenerationParams {
  return normalizeInfiniteCanvasGenerationParamsWithReport(params, mediaKind, model).params;
}

/**
 * Same clamp as {@link normalizeInfiniteCanvasGenerationParams}, plus the list
 * of values it had to give up. The UI needs both: the clamped set to persist
 * and the losses to say out loud (P4 review C7 — dropping a setting behind the
 * user's back is the bug, dropping it is still the right behaviour).
 */
export function normalizeInfiniteCanvasGenerationParamsWithReport(
  params: InfiniteCanvasGenerationParams | undefined,
  mediaKind: InfiniteCanvasGenerationMediaKind,
  model?: string,
): InfiniteCanvasGenerationParamsNormalization {
  const requested = model !== undefined ? model : params?.model;
  const capability = findInfiniteCanvasModelCapability(mediaKind, requested);
  const next: InfiniteCanvasGenerationParams = {};
  const dropped: string[] = [];
  if (!capability) return { params: next, dropped };
  // Only a non-default model is worth persisting; the default one is what an
  // absent field already means.
  if (capability.modelId !== defaultInfiniteCanvasModelId(mediaKind)) {
    next.model = capability.modelId;
  }
  const keepOrReport = (
    allowed: readonly string[],
    value: string | undefined,
  ): string | undefined => {
    const kept = pick(allowed, value);
    if (kept === undefined && value !== undefined) dropped.push(value);
    return kept;
  };

  if (capability.mediaKind === 'image') {
    const size = keepOrReport(capability.sizes, params?.size);
    if (size !== undefined) next.size = size;
    const resolution = keepOrReport(capability.resolutions, params?.resolution);
    if (resolution !== undefined) next.resolution = resolution;
    const n = params?.n;
    if (n !== undefined && Number.isInteger(n) && n >= 1) {
      const clamped = Math.min(n, capability.nMax, INFINITE_CANVAS_MAX_BATCH_SIZE);
      // n = 1 is the implicit default; storing it would only add noise.
      if (clamped > 1) next.n = clamped;
      // Batch size is spend: shrinking it silently is exactly the surprise C7
      // is about, so the lost count is reported like any other dropped value.
      if (clamped < n) dropped.push(`x${n}`);
    }
    return { params: next, dropped };
  }
  const aspectRatio = keepOrReport(capability.aspectRatios, params?.aspectRatio);
  if (aspectRatio !== undefined) next.aspectRatio = aspectRatio;
  const resolution = keepOrReport(capability.resolutions, params?.resolution);
  if (resolution !== undefined) next.resolution = resolution;
  const duration = params?.duration;
  if (duration !== undefined) {
    if (capability.durations.includes(duration)) next.duration = duration;
    else dropped.push(`${duration}s`);
  }
  return { params: next, dropped };
}

/** True when the set carries nothing worth persisting on the node. */
export function isEmptyGenerationParams(
  params: InfiniteCanvasGenerationParams | undefined,
): boolean {
  return !params || Object.keys(params).length === 0;
}

/**
 * Collapsed summary for the card pill, e.g. `gpt-image-2 · 16:9 · 2k · x3`.
 * Model ids and provider parameter values are identifiers, not prose, so this
 * needs no translation. An empty set summarises to an empty string.
 */
export function summarizeInfiniteCanvasGenerationParams(
  params: InfiniteCanvasGenerationParams | undefined,
  mediaKind: InfiniteCanvasGenerationMediaKind,
): string {
  if (!params) return '';
  const parts: string[] = [];
  if (params.model) parts.push(params.model);
  const ratio = mediaKind === 'video' ? params.aspectRatio : params.size;
  if (ratio) parts.push(ratio);
  if (params.resolution) parts.push(params.resolution);
  if (mediaKind === 'video') {
    if (params.duration !== undefined) parts.push(`${params.duration}s`);
  } else if (params.n !== undefined && params.n > 1) {
    parts.push(`x${params.n}`);
  }
  return parts.join(' · ');
}
