import { DEFAULT_UI_FONT_FAMILY } from '@/shared/constants/typography';

const UI_FONT_FAMILY_PROPERTY = '--font-family-sans';
const DEFAULT_CANVAS_FONT_SIZE_PX = 12;
const DEFAULT_CANVAS_FONT_WEIGHT = 400;
const MIN_CANVAS_FONT_SIZE_PX = 6;
const MAX_CANVAS_FONT_SIZE_PX = 96;
const SAFE_CANVAS_FONT_WEIGHT = /^(?:normal|bold|[1-9]00)$/;

export interface CanvasFontOptions {
  fontFamily?: string;
  fontWeight?: number | string;
}

/**
 * Resolves the canonical UI font from the active theme.
 *
 * The fallback keeps non-DOM tests, early bootstrap, Canvas and embedded
 * renderers deterministic without coupling them to ThemeService.
 */
export function readUiFontFamily(element?: Element | null): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return DEFAULT_UI_FONT_FAMILY;
  }

  const target = element ?? document.documentElement;
  const value = window
    .getComputedStyle(target)
    .getPropertyValue(UI_FONT_FAMILY_PROPERTY)
    .trim();

  return value || DEFAULT_UI_FONT_FAMILY;
}

/**
 * Builds a size- and weight-bounded Canvas font declaration from the shared UI
 * font contract. The optional family is trusted CSS input from the caller; this
 * helper does not sanitize arbitrary font-family strings.
 */
export function buildCanvasFont(
  sizePx: number,
  options: CanvasFontOptions = {},
): string {
  const safeSize = Number.isFinite(sizePx)
    ? Math.min(MAX_CANVAS_FONT_SIZE_PX, Math.max(MIN_CANVAS_FONT_SIZE_PX, sizePx))
    : DEFAULT_CANVAS_FONT_SIZE_PX;
  const requestedWeight = String(
    options.fontWeight ?? DEFAULT_CANVAS_FONT_WEIGHT,
  ).trim();
  const safeWeight = SAFE_CANVAS_FONT_WEIGHT.test(requestedWeight)
    ? requestedWeight
    : String(DEFAULT_CANVAS_FONT_WEIGHT);
  const safeFamily = options.fontFamily?.trim() || readUiFontFamily();

  return `${safeWeight} ${safeSize}px ${safeFamily}`;
}
