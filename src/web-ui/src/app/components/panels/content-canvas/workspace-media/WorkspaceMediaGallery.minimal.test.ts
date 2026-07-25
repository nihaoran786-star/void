import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./WorkspaceMediaGallery.minimal.scss', import.meta.url),
  'utf8',
);
const baseSource = readFileSync(
  new URL('./WorkspaceMediaGallery.scss', import.meta.url),
  'utf8',
);

describe('WorkspaceMediaGallery minimal card presentation', () => {
  it('keeps the Classic type scale exact behind semantic feature tokens', () => {
    expect(baseSource).toContain('--workspace-media-font-size-ui-micro: 10px;');
    expect(baseSource).toContain('--workspace-media-font-size-ui-meta: 11px;');
    expect(baseSource).toContain('--workspace-media-font-size-ui-label: 12px;');
    expect(baseSource).toContain('--workspace-media-font-size-ui-control: 15px;');
    expect(baseSource).toContain('--workspace-media-font-size-ui-body: 13px;');
    expect(baseSource).toContain('--workspace-media-font-size-glyph: 12px;');

    const consumers = [
      ...baseSource.matchAll(
        /font-size:\s*var\((--workspace-media-font-size-[^)]+)\)/g,
      ),
    ].map((match) => match[1]);

    expect(consumers).toEqual([
      '--workspace-media-font-size-ui-control',
      '--workspace-media-font-size-ui-meta',
      '--workspace-media-font-size-ui-micro',
      '--workspace-media-font-size-ui-meta',
      '--workspace-media-font-size-ui-label',
      '--workspace-media-font-size-ui-micro',
      '--workspace-media-font-size-ui-meta',
      '--workspace-media-font-size-ui-meta',
      '--workspace-media-font-size-ui-body',
      '--workspace-media-font-size-ui-micro',
      '--workspace-media-font-size-glyph',
      '--workspace-media-font-size-ui-label',
      '--workspace-media-font-size-ui-micro',
      '--workspace-media-font-size-ui-meta',
      '--workspace-media-font-size-ui-label',
      '--workspace-media-font-size-ui-meta',
      '--workspace-media-font-size-ui-meta',
      '--workspace-media-font-size-ui-label',
      '--workspace-media-font-size-ui-label',
    ]);
    expect(baseSource).not.toMatch(/font-size\s*:\s*\d+(?:\.\d+)?px/);
  });

  it('maps Minimal roles once and keeps search text and action glyphs distinct', () => {
    expect(source).toContain(
      '--workspace-media-font-size-ui-micro: var(--workspace-font-size-meta);',
    );
    expect(source).toContain(
      '--workspace-media-font-size-ui-meta: var(--workspace-font-size-meta);',
    );
    expect(source).toContain(
      '--workspace-media-font-size-ui-label: var(--workspace-font-size-label);',
    );
    expect(source).toContain(
      '--workspace-media-font-size-ui-control: var(--workspace-font-size-control);',
    );
    expect(source).toContain(
      '--workspace-media-font-size-ui-body: var(--workspace-font-size-body);',
    );
    expect(source).toContain('--workspace-media-font-size-glyph: 12px;');
    expect(source).not.toMatch(/font-size\s*:\s*\d+(?:\.\d+)?px/);

    expect(baseSource).toMatch(
      /\.workspace-media-gallery__search input \{[\s\S]*?font-size: var\(--workspace-media-font-size-ui-control\);/,
    );
    expect(source).toMatch(
      /\.workspace-media-gallery__search input \{[\s\S]*?font-size: var\(--workspace-media-font-size-ui-control\);/,
    );
    expect(baseSource).toMatch(
      /\.workspace-media-card__action \{[\s\S]*?font-size: var\(--workspace-media-font-size-glyph\);[\s\S]*?line-height: 1;/,
    );
  });

  it('uses one compact command bar with a focus/query-expanded search', () => {
    expect(source).toMatch(
      /\.workspace-media-gallery__toolbar \{[\s\S]*?min-height: 40px;[\s\S]*?padding: var\(--workspace-space-1\) var\(--workspace-space-3\);/,
    );
    expect(source).toMatch(
      /\.workspace-media-gallery__toolbar-main \{[\s\S]*?display: flex;[\s\S]*?min-height: var\(--workspace-control-height\);/,
    );
    expect(source).toMatch(
      /\.workspace-media-gallery__search-row \{[\s\S]*?flex: 0 0 var\(--workspace-icon-target\);/,
    );
    expect(source).toMatch(
      /\.workspace-media-gallery__search:focus-within,[\s\S]*?\.workspace-media-gallery__search\.has-query \{[\s\S]*?width: 100%;/,
    );
    expect(source).toMatch(
      /\.workspace-media-gallery__refinement-panel \{[\s\S]*?width: min\(260px, calc\(100cqw - var\(--workspace-space-4\)\)\);/,
    );
    expect(source).toMatch(
      /\.workspace-media-gallery__refinement-panel \{[\s\S]*?box-shadow: var\(--workspace-shadow-raised\);/,
    );
    expect(source).not.toMatch(/transition\s*:[^;]*(?:width|max-width)/);
  });

  it('keeps typography and color on the shared workspace token contract', () => {
    expect(source).not.toMatch(/font-size\s*:\s*\d+(?:\.\d+)?px/);
    expect(source).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\brgba?\s*\(/i);
  });

  it('keeps the filename visible while progressively disclosing secondary metadata', () => {
    expect(source).toMatch(
      /\.workspace-media-card:not\(\.is-pending\) \.workspace-media-card__overlay small,[\s\S]*?\.workspace-media-card:not\(\.is-pending\) \.workspace-media-card__meta \{[\s\S]*?max-height: 0;[\s\S]*?opacity: 0;/,
    );
    expect(source).toMatch(
      /\.workspace-media-card:not\(\.is-pending\):hover \.workspace-media-card__overlay small,[\s\S]*?\.workspace-media-card:not\(\.is-pending\):focus-visible \.workspace-media-card__meta \{[\s\S]*?max-height: 32px;[\s\S]*?opacity: 1;/,
    );
    expect(source).toMatch(
      /\.workspace-media-card__overlay strong \{[\s\S]*?font-size: var\(--workspace-media-font-size-ui-label\);/,
    );
    expect(source).toMatch(
      /\.workspace-media-card:not\(\.is-pending\) \.workspace-media-card__overlay small,[\s\S]*?\.workspace-media-card:not\(\.is-pending\) \.workspace-media-card__meta \{[\s\S]*?transition:\s*opacity [^,;]+,\s*transform [^;]+;/,
    );
    expect(source).not.toMatch(
      /transition\s*:[^;]*(?:height|max-height)/,
    );
  });

  it('preserves keyboard focus treatment for card actions', () => {
    expect(source).toContain('.void-ui--minimal .workspace-media-card__action:focus-visible');
    expect(source).toMatch(
      /\.workspace-media-card__action:hover \{[\s\S]*?color: var\(--workspace-text-primary\);/,
    );
  });

  it('uses an inset semantic ring without changing selected-card geometry', () => {
    expect(source).toMatch(
      /\.workspace-media-card-shell\.is-selected \.workspace-media-card \{[\s\S]*?border-color: var\(--workspace-accent\);[\s\S]*?box-shadow: inset 0 0 0 1px var\(--workspace-accent\);/,
    );
  });
});
