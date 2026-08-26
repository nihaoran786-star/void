/**
 * Deterministic swatch derivation for style presets without a thumbnail
 * (Infinite Canvas P5, slice W6).
 *
 * The midjourney and mg-motion families ship no sample images upstream, so
 * 156 of the 317 presets can never have a `thumbnailRef`. The visual language
 * (§7) forbids a half-finished grid where some tiles are pictures and the rest
 * are empty boxes: the tile without a picture must be a finished tile too.
 *
 * So it becomes a soft colour block carrying the first two characters of the
 * preset name. Both halves are derived purely from the preset id, so a given
 * preset keeps the same colour across renders, sessions, and machines — a
 * colour that drifts per render would read as a bug.
 *
 * Only the hue is produced here. Saturation, lightness, and the label colour
 * come from `--canvas-swatch-*` tokens so the block stays readable under both
 * the light and the dark board. Nothing in this module hard-codes a colour.
 */

/** Number of leading characters of the preset name shown inside the block. */
const SWATCH_LABEL_LENGTH = 2;

/**
 * FNV-1a over the preset id, folded into 0..359.
 *
 * FNV rather than a naive `hash * 31` accumulator: the previous accumulator
 * took `% 360` on every step, which collapsed short ids onto a handful of hues
 * and made neighbouring presets look identical.
 */
export function infiniteCanvasSwatchHue(presetId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < presetId.length; index += 1) {
    hash ^= presetId.charCodeAt(index);
    // 16777619, expressed as shifts to stay inside 32-bit integer maths.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

/**
 * The first characters of the preset name, used as the block's label.
 *
 * Uses `Array.from` rather than `slice` so a surrogate pair (an emoji, a rare
 * CJK ideograph) is not cut in half into a replacement glyph.
 */
export function infiniteCanvasSwatchLabel(name: string): string {
  return Array.from(name.trim()).slice(0, SWATCH_LABEL_LENGTH).join('');
}

export interface InfiniteCanvasStyleSwatch {
  hue: number;
  label: string;
}

export function infiniteCanvasStyleSwatch(
  presetId: string,
  name: string,
): InfiniteCanvasStyleSwatch {
  return { hue: infiniteCanvasSwatchHue(presetId), label: infiniteCanvasSwatchLabel(name) };
}
