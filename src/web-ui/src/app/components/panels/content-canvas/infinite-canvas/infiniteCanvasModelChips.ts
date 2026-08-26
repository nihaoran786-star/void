/**
 * The little capability chips under each model name (visual language §7.3-C).
 *
 * The reference screenshot puts a row of tiny outlined chips under every model
 * in the list: its resolution, its duration range, and a speaker when the model
 * produces sound. Every value here is DERIVED from
 * `infiniteCanvasGenerationCapabilities` — the front-end mirror of
 * `agentic/media/capabilities.rs`. Nothing is invented, and nothing is
 * hard-coded per model:
 *
 * - the resolution chip is the highest entry of that model's own allow list;
 * - the duration chip is the span of its own duration allow list;
 * - the speaker chip is only ever shown for a model the table marks as
 *   producing audio. The table carries no audio flag today, so no model shows
 *   one; faking it would be inventing a capability.
 *
 * Pure functions over the table: no React, no I/O.
 */
import type { InfiniteCanvasModelCapability } from '@/shared/services/infinite-canvas';

export interface InfiniteCanvasModelChips {
  /** Highest resolution the model offers, in the screenshot's casing (`1080P`). */
  resolution?: string;
  /** Duration span in seconds, e.g. `4-15S`, or `5S` for a single value. */
  duration?: string;
  /** Only true for a model the capability table says emits audio. */
  hasAudio: boolean;
}

/**
 * Sort weight for a resolution token. `4k` outranks `1080p`, `0.5K` is the
 * smallest — the two families never mix inside one model, but one comparator
 * keeps the caller simple.
 */
function resolutionWeight(value: string): number {
  const match = /^([\d.]+)\s*([kp])$/i.exec(value.trim());
  if (!match) return 0;
  const size = Number.parseFloat(match[1]);
  if (!Number.isFinite(size)) return 0;
  return match[2].toLowerCase() === 'k' ? size * 1024 : size;
}

/** The highest entry of an allow list, verbatim; `undefined` for an empty one. */
export function highestInfiniteCanvasResolution(
  resolutions: readonly string[],
): string | undefined {
  let best: string | undefined;
  let bestWeight = -1;
  for (const entry of resolutions) {
    const weight = resolutionWeight(entry);
    if (weight > bestWeight) {
      best = entry;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * Whether the capability table says this model emits audio. It carries no such
 * field yet, so this is deliberately always false rather than a guess from the
 * model's name — §7.3-C says capability values come from the table.
 */
function hasAudioCapability(capability: InfiniteCanvasModelCapability): boolean {
  const flagged = capability as { hasAudio?: boolean };
  return flagged.hasAudio === true;
}

export function infiniteCanvasModelChips(
  capability: InfiniteCanvasModelCapability,
): InfiniteCanvasModelChips {
  const resolution = highestInfiniteCanvasResolution(capability.resolutions)?.toUpperCase();
  if (capability.mediaKind === 'image') {
    return { resolution, hasAudio: hasAudioCapability(capability) };
  }
  const durations = capability.durations;
  const min = durations.length > 0 ? Math.min(...durations) : undefined;
  const max = durations.length > 0 ? Math.max(...durations) : undefined;
  const duration = min === undefined || max === undefined
    ? undefined
    : (min === max ? `${min}S` : `${min}-${max}S`);
  return { resolution, duration, hasAudio: hasAudioCapability(capability) };
}
