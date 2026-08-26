/**
 * The full set of cells each parameter group shows (visual language §7.3-D).
 *
 * §7.3-D reverses an earlier decision. The popover used to offer ONLY what the
 * chosen model supports, so switching models made cells appear and disappear
 * and the owner read that as "the feature does not exist". Now every group
 * shows the same cells every time — the union of what the models of this media
 * kind can do — and the ones the CURRENT model cannot produce are greyed out
 * and unclickable, with the reason spelled out.
 *
 * The union is computed from `infiniteCanvasGenerationCapabilities`, the mirror
 * of the Rust capability table. This module adds no value that is not in that
 * table; it only orders them and folds the per-model spelling differences
 * (`1k` vs `1K`) into one cell.
 *
 * Pure data functions: no React, no I/O.
 */
import type {
  InfiniteCanvasGenerationMediaKind,
  InfiniteCanvasModelCapability,
} from '@/shared/services/infinite-canvas';
import {
  listInfiniteCanvasModels,
  INFINITE_CANVAS_MAX_BATCH_SIZE,
} from '@/shared/services/infinite-canvas';

/**
 * Ratio tokens that mean "let the provider decide the shape". They lead every
 * ratio group, per §7.3-D ("adaptive / auto comes first").
 */
const ADAPTIVE_RATIOS = new Set(['auto', 'adaptive']);

/** One cell of a segmented group. */
export interface InfiniteCanvasParamCell {
  /** The value sent to the normalizer; `''` means "send nothing". */
  value: string;
  /** What the cell reads, when it differs from the value. */
  label: string;
}

function ratiosOf(capability: InfiniteCanvasModelCapability): readonly string[] {
  return capability.mediaKind === 'image' ? capability.sizes : capability.aspectRatios;
}

/** Case-insensitive membership, matching the normalizer's own tolerance. */
export function allowsValue(allowed: readonly string[], value: string): boolean {
  const folded = value.trim().toLowerCase();
  return allowed.some(entry => entry.trim().toLowerCase() === folded);
}

/**
 * Every ratio any model of this kind offers, adaptive ones first and the rest
 * in the capability table's own order.
 */
export function infiniteCanvasRatioCells(
  mediaKind: InfiniteCanvasGenerationMediaKind,
): readonly InfiniteCanvasParamCell[] {
  const seen = new Set<string>();
  const adaptive: string[] = [];
  const rest: string[] = [];
  for (const capability of listInfiniteCanvasModels(mediaKind)) {
    for (const ratio of ratiosOf(capability)) {
      const key = ratio.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      (ADAPTIVE_RATIOS.has(key) ? adaptive : rest).push(ratio);
    }
  }
  return [...adaptive, ...rest].map(value => ({ value, label: value }));
}

function resolutionWeight(value: string): number {
  const match = /^([\d.]+)\s*([kp])$/i.exec(value.trim());
  if (!match) return Number.MAX_SAFE_INTEGER;
  const size = Number.parseFloat(match[1]);
  if (!Number.isFinite(size)) return Number.MAX_SAFE_INTEGER;
  return match[2].toLowerCase() === 'k' ? size * 1024 : size;
}

/**
 * Every resolution any model of this kind offers, smallest first, in ONE
 * spelling. The Rust table really does say `1k` on gpt-image-2 and `1K` on the
 * gemini models; the normalizer maps case, so the cell can carry the upper-case
 * form and still land on each model's own entry.
 */
export function infiniteCanvasResolutionCells(
  mediaKind: InfiniteCanvasGenerationMediaKind,
): readonly InfiniteCanvasParamCell[] {
  const byKey = new Map<string, string>();
  for (const capability of listInfiniteCanvasModels(mediaKind)) {
    for (const resolution of capability.resolutions) {
      const key = resolution.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, resolution.toUpperCase());
    }
  }
  return [...byKey.values()]
    .sort((left, right) => resolutionWeight(left) - resolutionWeight(right))
    .map(value => ({ value, label: value }));
}

/** Every duration any video model offers, ascending. */
export function infiniteCanvasDurationCells(
  mediaKind: InfiniteCanvasGenerationMediaKind,
): readonly InfiniteCanvasParamCell[] {
  const seen = new Set<number>();
  for (const capability of listInfiniteCanvasModels(mediaKind)) {
    if (capability.mediaKind !== 'video') continue;
    for (const duration of capability.durations) seen.add(duration);
  }
  return [...seen]
    .sort((left, right) => left - right)
    .map(duration => ({ value: String(duration), label: `${duration}s` }));
}

/**
 * Batch sizes: 1 up to the highest any image model of this kind allows, capped
 * by the tool schema's own ceiling. Models pinned to one image still show the
 * larger cells, greyed, so the limit is visible rather than missing.
 */
export function infiniteCanvasCountCells(
  mediaKind: InfiniteCanvasGenerationMediaKind,
): readonly InfiniteCanvasParamCell[] {
  let max = 1;
  for (const capability of listInfiniteCanvasModels(mediaKind)) {
    if (capability.mediaKind !== 'image') continue;
    max = Math.max(max, Math.min(capability.nMax, INFINITE_CANVAS_MAX_BATCH_SIZE));
  }
  return Array.from({ length: max }, (_unused, index) => ({
    value: String(index + 1),
    label: String(index + 1),
  }));
}

/**
 * The width and height of the little preview rectangle §7.3-D asks each ratio
 * cell to draw, fitted inside a `box` × `box` square. Adaptive ratios have no
 * shape of their own and answer `undefined`, so the cell draws its dashed
 * placeholder instead.
 */
export function infiniteCanvasRatioGlyph(
  ratio: string,
  box: number,
): { width: number; height: number } | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(ratio.trim());
  if (!match) return undefined;
  const w = Number.parseFloat(match[1]);
  const h = Number.parseFloat(match[2]);
  if (!(w > 0) || !(h > 0)) return undefined;
  const scale = w >= h ? box / w : box / h;
  return {
    width: Math.max(2, Math.round(w * scale * 10) / 10),
    height: Math.max(2, Math.round(h * scale * 10) / 10),
  };
}
