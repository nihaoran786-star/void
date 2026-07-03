import { describe, expect, it } from 'vitest';

import { builtinThemes, DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID } from './index';
import {
  createStartupThemeBootstrapEntry,
  createStartupThemeBootstrapManifest,
  STARTUP_THEME_BOOTSTRAP_VERSION,
} from './startupThemeBootstrap';
import {
  createThemePromptSnapshotEntry,
  createThemePromptSnapshotManifest,
  THEME_PROMPT_SNAPSHOT_VERSION,
} from './themePromptSnapshots';

describe('startup theme bootstrap manifest', () => {
  it('projects the minimal startup colors from each builtin theme', () => {
    const theme = builtinThemes.find(item => item.id === 'void-dark');
    expect(theme).toBeDefined();

    const entry = createStartupThemeBootstrapEntry(theme!);

    expect(entry).toEqual({
      id: 'void-dark',
      bgPrimary: theme!.colors.background.primary,
      bgSecondary: theme!.colors.background.secondary,
      bgScene: theme!.colors.background.scene,
      isLight: false,
      textPrimary: theme!.colors.text.primary,
      textMuted: theme!.colors.text.muted,
      accentColor: theme!.colors.accent[500],
    });
  });

  it('creates a complete manifest for the current Void builtin themes', () => {
    const manifest = createStartupThemeBootstrapManifest(builtinThemes);

    expect(manifest.version).toBe(STARTUP_THEME_BOOTSTRAP_VERSION);
    expect(manifest.defaultLightThemeId).toBe(DEFAULT_LIGHT_THEME_ID);
    expect(manifest.defaultDarkThemeId).toBe(DEFAULT_DARK_THEME_ID);
    expect(manifest.themes.map(theme => theme.id)).toEqual(builtinThemes.map(theme => theme.id));
    expect(manifest.themes).toHaveLength(8);
    expect(manifest.themes.every(theme => theme.id.startsWith('void-'))).toBe(true);
  });
});

describe('theme prompt snapshot manifest', () => {
  it('projects theme facts useful for prompts without copying full theme objects', () => {
    const theme = builtinThemes.find(item => item.id === 'void-light');
    expect(theme).toBeDefined();

    const entry = createThemePromptSnapshotEntry(theme!);

    expect(entry).toEqual({
      id: 'void-light',
      themeType: theme!.type,
      bgPrimary: theme!.colors.background.primary,
      bgSecondary: theme!.colors.background.secondary,
      bgScene: theme!.colors.background.scene,
      textPrimary: theme!.colors.text.primary,
      textMuted: theme!.colors.text.muted,
      accent500: theme!.colors.accent[500],
      accent600: theme!.colors.accent[600],
      borderBase: theme!.colors.border.base,
      elementBase: theme!.colors.element.base,
      radiusBase: theme!.effects.radius.base,
      spacing4: theme!.effects.spacing[4],
      shadowBase: theme!.effects.shadow.base,
      styleNotes: theme!.description ?? theme!.name,
    });
  });

  it('creates a complete prompt snapshot manifest for current builtin themes', () => {
    const manifest = createThemePromptSnapshotManifest(builtinThemes);

    expect(manifest.version).toBe(THEME_PROMPT_SNAPSHOT_VERSION);
    expect(manifest.defaultLightThemeId).toBe(DEFAULT_LIGHT_THEME_ID);
    expect(manifest.defaultDarkThemeId).toBe(DEFAULT_DARK_THEME_ID);
    expect(manifest.themes.map(theme => theme.id)).toEqual(builtinThemes.map(theme => theme.id));
    expect(manifest.themes.every(theme => theme.id.startsWith('void-'))).toBe(true);
  });
});
