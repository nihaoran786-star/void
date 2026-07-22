import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type SettingsTypographyFixture = {
  name: string;
  path: string;
  source: string;
};

const fixturePaths = [
  '../../infrastructure/config/components/AIModelConfig.scss',
  '../../infrastructure/config/components/AppearanceConfig.scss',
  '../../infrastructure/config/components/ConfigForm.scss',
  '../../infrastructure/config/components/DefaultModelConfig.scss',
  '../../infrastructure/config/components/BasicsConfig.scss',
  '../scenes/settings/components/KeyboardShortcutsTab.scss',
] as const;

const fixtures: readonly SettingsTypographyFixture[] = fixturePaths.map(path => ({
  name: path.split('/').at(-1) ?? path,
  path,
  source: readFileSync(new URL(path, import.meta.url), 'utf8'),
}));

const fixture = (name: string) => {
  const match = fixtures.find(candidate => candidate.name === name);
  if (!match) {
    throw new Error(`Missing settings typography fixture: ${name}`);
  }
  return match.source;
};

const findRawFontSizeConsumers = (source: string) =>
  [...source.matchAll(/(?<![-\w])font-size\s*:\s*\d+(?:\.\d+)?px\b/g)].map(
    match => match[0],
  );

const findPixelCustomPropertyDefaults = (source: string) =>
  [
    ...source.matchAll(
      /(--[\w-]*font-size)\s*:\s*(\d+(?:\.\d+)?px)\s*;/g,
    ),
  ].map(match => `${match[1]}: ${match[2]}`);

describe('settings typography governance', () => {
  it('keeps the scan limited to the six settings presentation stylesheets', () => {
    expect(fixtures.map(({ name }) => name)).toEqual([
      'AIModelConfig.scss',
      'AppearanceConfig.scss',
      'ConfigForm.scss',
      'DefaultModelConfig.scss',
      'BasicsConfig.scss',
      'KeyboardShortcutsTab.scss',
    ]);
  });

  it.each(fixtures)('$name has no direct pixel font-size consumer', ({ source }) => {
    expect(findRawFontSizeConsumers(source)).toEqual([]);
  });

  it('keeps Classic-only compact and preview exceptions explicit and narrow', () => {
    expect(
      fixtures.flatMap(({ source }) => findPixelCustomPropertyDefaults(source)),
    ).toEqual([
      '--ai-model-compact-capability-font-size: 9px',
      '--appearance-compact-badge-font-size: 9px',
      '--appearance-preview-title-font-size: 8px',
      '--default-model-name-font-size: 10px',
      '--default-model-meta-font-size: 8px',
    ]);
  });

  it('maps readable compact text to canonical tokens in Minimal mode', () => {
    expect(fixture('AIModelConfig.scss')).toContain(
      '.void-ui--minimal .void-ai-model-config {\n  --ai-model-compact-capability-font-size: var(--font-size-xxs);',
    );
    expect(fixture('AppearanceConfig.scss')).toContain(
      '.void-ui--minimal .theme-card {\n  --appearance-compact-badge-font-size: var(--font-size-xxs);',
    );
    expect(fixture('DefaultModelConfig.scss')).toContain(
      '.void-ui--minimal .default-model-config {\n  --default-model-name-font-size: var(--font-size-xs);\n  --default-model-meta-font-size: var(--font-size-2xs);',
    );
  });

  it('keeps the miniature theme preview isolated from application text sizing', () => {
    const appearance = fixture('AppearanceConfig.scss');

    expect(appearance).toContain(
      '--appearance-preview-title-font-size: 8px;',
    );
    expect(appearance).toContain(
      'font-size: var(--appearance-preview-title-font-size);',
    );
    expect(
      appearance.match(/--appearance-preview-title-font-size\s*:/g),
    ).toHaveLength(1);
  });

  it('uses semantic tokens for text-like glyphs instead of raw pixel consumers', () => {
    expect(fixture('AIModelConfig.scss')).toMatch(
      /content:\s*'\+';\s*font-size:\s*var\(--font-size-xl\);/,
    );
    expect(fixture('AppearanceConfig.scss')).toMatch(
      /&__language-check\s*\{[\s\S]*?font-size:\s*var\(--font-size-xxs\);/,
    );
    expect(fixture('KeyboardShortcutsTab.scss')).toMatch(
      /&__revert-btn\s*\{[\s\S]*?font-size:\s*var\(--font-size-sm\);/,
    );
  });

  it('detects a synthesized raw-size regression', () => {
    const mutated = `${fixture('ConfigForm.scss')}
.settings-synthetic-regression { font-size: 15px; }`;

    expect(findRawFontSizeConsumers(mutated)).toEqual([
      'font-size: 15px',
    ]);
  });
});
