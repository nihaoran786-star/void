import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';

type FeatureTypographyFixture = {
  name: 'short-drama' | 'workspace-media';
  base: string;
  minimal: string;
  tokenPrefix: string;
  allowedTokens: ReadonlySet<string>;
};

const readFixture = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const scannedFiles = [
  '../components/panels/content-canvas/short-drama/ShortDramaCenterPanel.scss',
  '../components/panels/content-canvas/short-drama/ShortDramaCenterPanel.minimal.scss',
  '../components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.scss',
  '../components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.minimal.scss',
] as const;

const fixtures: readonly FeatureTypographyFixture[] = [
  {
    name: 'short-drama',
    base: readFixture(scannedFiles[0]),
    minimal: readFixture(scannedFiles[1]),
    tokenPrefix: '--short-drama-font-size-',
    allowedTokens: new Set([
      '--short-drama-font-size-ui-micro',
      '--short-drama-font-size-ui-meta',
      '--short-drama-font-size-ui-label',
      '--short-drama-font-size-ui-control',
      '--short-drama-font-size-ui-body',
      '--short-drama-font-size-glyph',
      '--short-drama-font-size-editor-title',
      '--short-drama-font-size-editor-body',
    ]),
  },
  {
    name: 'workspace-media',
    base: readFixture(scannedFiles[2]),
    minimal: readFixture(scannedFiles[3]),
    tokenPrefix: '--workspace-media-font-size-',
    allowedTokens: new Set([
      '--workspace-media-font-size-ui-micro',
      '--workspace-media-font-size-ui-meta',
      '--workspace-media-font-size-ui-label',
      '--workspace-media-font-size-ui-control',
      '--workspace-media-font-size-ui-body',
      '--workspace-media-font-size-glyph',
    ]),
  },
];

const findRawFontSizeConsumers = (source: string) =>
  [...source.matchAll(/font-size\s*:\s*\d+(?:\.\d+)?px\b/g)].map(
    (match) => match[0],
  );

const findFeatureFontSizeConsumers = (source: string, tokenPrefix: string) =>
  [
    ...source.matchAll(
      new RegExp(
        `font-size\\s*:\\s*var\\((${tokenPrefix.replaceAll('-', '\\-')}[^)]+)\\)`,
        'g',
      ),
    ),
  ].map((match) => match[1]);

describe('feature typography governance', () => {
  it('stays scoped to the short-drama and workspace-media presentation files', () => {
    expect(fixtures.map(({ name }) => name)).toEqual([
      'short-drama',
      'workspace-media',
    ]);
    expect(
      scannedFiles.map((path) => basename(path)),
    ).toEqual([
      'ShortDramaCenterPanel.scss',
      'ShortDramaCenterPanel.minimal.scss',
      'WorkspaceMediaGallery.scss',
      'WorkspaceMediaGallery.minimal.scss',
    ]);
  });

  it.each(fixtures)(
    '$name has no raw font-size consumer or direct workspace-role bypass',
    ({ base, minimal }) => {
      expect(findRawFontSizeConsumers(base)).toEqual([]);
      expect(findRawFontSizeConsumers(minimal)).toEqual([]);
      expect(minimal).not.toMatch(
        /font-size\s*:\s*var\(--workspace-font-size-/,
      );
    },
  );

  it.each(fixtures)(
    '$name consumers use only the declared feature typography vocabulary',
    ({ base, minimal, tokenPrefix, allowedTokens }) => {
      const consumers = [
        ...findFeatureFontSizeConsumers(base, tokenPrefix),
        ...findFeatureFontSizeConsumers(minimal, tokenPrefix),
      ];

      expect(consumers.length).toBeGreaterThan(0);
      expect(
        consumers.filter((token) => !allowedTokens.has(token)),
      ).toEqual([]);
      for (const token of allowedTokens) {
        expect(base).toContain(`${token}:`);
        expect(minimal).toContain(`${token}:`);
      }
    },
  );

  it('detects a synthesized raw-size regression without widening the scan', () => {
    const mutatedShortDrama = `${fixtures[0].base}
.short-drama-synthetic-regression { font-size: 17px; }`;

    expect(findRawFontSizeConsumers(mutatedShortDrama)).toEqual([
      'font-size: 17px',
    ]);
    expect(findRawFontSizeConsumers(fixtures[1].base)).toEqual([]);
  });
});
