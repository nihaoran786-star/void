/**
 * Build MiniApp theme payload from main app ThemeConfig.
 * Maps to --void-* CSS variables for iframe theme sync.
 */
import type { ThemeConfig, ThemeType } from '@/infrastructure/theme/types';

export interface MiniAppThemePayload {
  type: ThemeType;
  id: string;
  vars: Record<string, string>;
}

export function buildMiniAppThemeVars(theme: ThemeConfig | null): MiniAppThemePayload | null {
  if (!theme) return null;

  const { colors, effects, typography } = theme;
  const vars: Record<string, string> = {};

  vars['--void-bg'] = colors.background.primary;
  vars['--void-bg-secondary'] = colors.background.secondary;
  vars['--void-bg-tertiary'] = colors.background.tertiary;
  vars['--void-bg-elevated'] = colors.background.elevated;

  vars['--void-text'] = colors.text.primary;
  vars['--void-text-secondary'] = colors.text.secondary;
  vars['--void-text-muted'] = colors.text.muted;

  vars['--void-accent'] = colors.accent[500];
  vars['--void-accent-hover'] = colors.accent[600];

  vars['--void-success'] = colors.semantic.success;
  vars['--void-warning'] = colors.semantic.warning;
  vars['--void-error'] = colors.semantic.error;
  vars['--void-info'] = colors.semantic.info;

  vars['--void-border'] = colors.border.base;
  vars['--void-border-subtle'] = colors.border.subtle;

  vars['--void-element-bg'] = colors.element.base;
  vars['--void-element-hover'] = colors.element.medium;

  if (effects?.radius) {
    vars['--void-radius'] = effects.radius.base;
    vars['--void-radius-lg'] = effects.radius.lg;
  }

  if (typography?.font) {
    vars['--void-font-sans'] = typography.font.sans;
    vars['--void-font-mono'] = typography.font.mono;
  }

  if (colors.scrollbar) {
    vars['--void-scrollbar-thumb'] = colors.scrollbar.thumb;
    vars['--void-scrollbar-thumb-hover'] = colors.scrollbar.thumbHover;
  } else {
    vars['--void-scrollbar-thumb'] =
      theme.type === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.15)';
    vars['--void-scrollbar-thumb-hover'] =
      theme.type === 'dark' ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.28)';
  }

  return {
    type: theme.type,
    id: theme.id,
    vars,
  };
}
