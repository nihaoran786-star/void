 

export { voidDarkTheme } from './dark-theme';
export { voidLightTheme } from './light-theme';
export { voidMidnightTheme } from './midnight-theme';
export { voidChinaStyleTheme } from './china-style-theme';
export { voidChinaNightTheme } from './china-night-theme';
export { voidCyberTheme } from './cyber-theme';
export { voidSlateTheme } from './slate-theme';
export { voidTokyoNightTheme } from './tokyo-night-theme';

import { voidDarkTheme } from './dark-theme';
import { voidLightTheme } from './light-theme';
import { voidMidnightTheme } from './midnight-theme';
import { voidChinaStyleTheme } from './china-style-theme';
import { voidChinaNightTheme } from './china-night-theme';
import { voidCyberTheme } from './cyber-theme';
import { voidSlateTheme } from './slate-theme';
import { voidTokyoNightTheme } from './tokyo-night-theme';
import { ThemeConfig, ThemeId } from '../types';

/** Default light / dark builtin themes used when following system appearance. */
export const DEFAULT_LIGHT_THEME_ID: ThemeId = 'void-light';
export const DEFAULT_DARK_THEME_ID: ThemeId = 'void-dark';

/**
 * Picks void-dark vs void-light from `prefers-color-scheme`.
 * Used when the user has no saved theme preference.
 */
export function getSystemPreferredDefaultThemeId(): ThemeId {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return DEFAULT_LIGHT_THEME_ID;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? DEFAULT_DARK_THEME_ID
    : DEFAULT_LIGHT_THEME_ID;
}

/** Static fallback when system preference is unavailable (e.g. SSR). */
export const DEFAULT_THEME_ID: ThemeId = DEFAULT_LIGHT_THEME_ID;

 
export const builtinThemes: ThemeConfig[] = [
  voidLightTheme,
  voidSlateTheme,
  voidDarkTheme,
  voidMidnightTheme,
  voidChinaStyleTheme,
  voidChinaNightTheme,
  voidCyberTheme,
  voidTokyoNightTheme,
];

 



