/**
 * Bootstrap UI font stack used before ThemeService has resolved a theme.
 *
 * `--font-family-sans` remains the canonical runtime CSS API. Keep this value
 * aligned with the Sass bootstrap token so Canvas and other JS-rendered
 * surfaces do not introduce a second visual font.
 */
export const DEFAULT_UI_FONT_FAMILY =
  "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Display', Roboto, sans-serif";
