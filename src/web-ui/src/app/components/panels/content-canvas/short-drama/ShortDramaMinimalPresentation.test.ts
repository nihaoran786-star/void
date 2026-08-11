import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./ShortDramaCenterPanel.minimal.scss', import.meta.url),
  'utf8',
);
const baseSource = readFileSync(
  new URL('./ShortDramaCenterPanel.scss', import.meta.url),
  'utf8',
);

describe('ShortDramaCenter minimal presentation contract', () => {
  it('keeps the Classic type scale exact behind semantic feature tokens', () => {
    expect(baseSource).toContain('--short-drama-font-size-ui-micro: 10px;');
    expect(baseSource).toContain('--short-drama-font-size-ui-meta: 11px;');
    expect(baseSource).toContain('--short-drama-font-size-ui-label: 12px;');
    expect(baseSource).toContain('--short-drama-font-size-ui-control: 13px;');
    expect(baseSource).toContain('--short-drama-font-size-ui-body: 14px;');
    expect(baseSource).toContain('--short-drama-font-size-glyph: 16px;');
    expect(baseSource).toContain('--short-drama-font-size-editor-title: 20px;');
    expect(baseSource).toContain('--short-drama-font-size-editor-body: 14px;');

    const consumers = [
      ...baseSource.matchAll(
        /font-size:\s*var\((--short-drama-font-size-[^)]+)\)/g,
      ),
    ].map((match) => match[1]);

    expect(consumers).toEqual([
      '--short-drama-font-size-ui-label',
      '--short-drama-font-size-ui-meta',
      '--short-drama-font-size-ui-control',
      '--short-drama-font-size-ui-meta',
      '--short-drama-font-size-ui-micro',
      '--short-drama-font-size-ui-control',
      '--short-drama-font-size-ui-meta',
      '--short-drama-font-size-ui-label',
      '--short-drama-font-size-ui-control',
      '--short-drama-font-size-ui-micro',
      '--short-drama-font-size-ui-label',
      '--short-drama-font-size-ui-control',
      '--short-drama-font-size-editor-title',
      '--short-drama-font-size-editor-body',
      '--short-drama-font-size-ui-meta',
      '--short-drama-font-size-ui-label',
      '--short-drama-font-size-ui-meta',
      '--short-drama-font-size-glyph',
      '--short-drama-font-size-ui-body',
      '--short-drama-font-size-ui-label',
      '--short-drama-font-size-ui-meta',
      '--short-drama-font-size-ui-micro',
      '--short-drama-font-size-ui-micro',
      '--short-drama-font-size-ui-label',
      '--short-drama-font-size-ui-body',
      '--short-drama-font-size-ui-label',
      '--short-drama-font-size-ui-micro',
      '--short-drama-font-size-ui-label',
      '--short-drama-font-size-ui-meta',
      '--short-drama-font-size-ui-control',
      '--short-drama-font-size-ui-control',
      '--short-drama-font-size-ui-label',
      '--short-drama-font-size-ui-meta',
    ]);
    expect(baseSource).not.toMatch(/font-size\s*:\s*\d+(?:\.\d+)?px/);
  });

  it('maps Minimal UI and editor roles once while preserving glyph geometry', () => {
    expect(source).toContain(
      '--short-drama-font-size-ui-micro: var(--workspace-font-size-meta);',
    );
    expect(source).toContain(
      '--short-drama-font-size-ui-meta: var(--workspace-font-size-meta);',
    );
    expect(source).toContain(
      '--short-drama-font-size-ui-label: var(--workspace-font-size-label);',
    );
    expect(source).toContain(
      '--short-drama-font-size-ui-control: var(--workspace-font-size-control);',
    );
    expect(source).toContain(
      '--short-drama-font-size-ui-body: var(--workspace-font-size-body);',
    );
    expect(source).toContain(
      '--short-drama-font-size-editor-title: var(--workspace-font-size-title);',
    );
    expect(source).toContain(
      '--short-drama-font-size-editor-body: var(--workspace-font-size-body);',
    );
    expect(source).toContain('--short-drama-font-size-glyph: 16px;');
    expect(source).not.toMatch(/font-size\s*:\s*\d+(?:\.\d+)?px/);

    expect(baseSource).toMatch(
      /\.short-drama-pending-row__content > strong \{[\s\S]*?font-size: var\(--short-drama-font-size-ui-control\);/,
    );
    expect(baseSource).toMatch(
      /\.short-drama-pending-row__content > span \{[\s\S]*?font-size: var\(--short-drama-font-size-ui-micro\);/,
    );
    expect(baseSource).not.toContain('.short-drama-asset-row__disclosure');
    expect(source).not.toContain('.short-drama-asset-row__disclosure');
  });

  it('keeps keyboard focus visible inside clipped tab and rail containers', () => {
    expect(source).toMatch(
      /\.short-drama-center__tab:focus-visible \{[\s\S]*?outline: 2px solid var\(--workspace-focus-ring\);[\s\S]*?box-shadow: none;/,
    );
    expect(source).toMatch(
      /\.short-drama-center__episode-rail button:focus-visible,[\s\S]*?outline: 2px solid var\(--workspace-focus-ring\);[\s\S]*?box-shadow: inset 0 0 0 2px var\(--workspace-focus-ring\);/,
    );
    expect(source).toMatch(
      /\.short-drama-center__episode-rail button:focus-visible \{[\s\S]*?border-color: transparent;[\s\S]*?box-shadow: none;/,
    );
  });

  it('keeps the episode rail vertical when viewport and component breakpoints disagree', () => {
    expect(source).toMatch(
      /\.short-drama-center__body \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) var\(--workspace-space-8\);[\s\S]*?overflow-x: hidden;/,
    );
    expect(source).toMatch(
      /\.short-drama-center__episode-rail \{[\s\S]*?position: sticky;[\s\S]*?right: 0;[\s\S]*?display: grid;[\s\S]*?width: var\(--workspace-space-8\);[\s\S]*?padding-left: var\(--workspace-space-1\);[\s\S]*?background: var\(--workspace-surface-canvas\);/,
    );
  });

  it('uses a compact horizontally reachable stage navigation strip', () => {
    expect(source).toMatch(
      /\.short-drama-center__topbar \{[\s\S]*?min-height: var\(--workspace-topbar-height\);/,
    );
    expect(source).toMatch(
      /\.short-drama-center__tabs \{[\s\S]*?overflow-x: auto;[\s\S]*?scrollbar-width: none;/,
    );
    expect(source).toMatch(
      /\.short-drama-center__tab \{[\s\S]*?width: var\(--workspace-icon-target\);[\s\S]*?min-height: var\(--workspace-control-height\);[\s\S]*?flex: 0 0 auto;[\s\S]*?padding: 0;/,
    );
    expect(source).toMatch(
      /\.short-drama-center__tab-icon \{[\s\S]*?display: block;/,
    );
    expect(source).toMatch(
      /\.short-drama-center__tab-label \{[\s\S]*?position: absolute;[\s\S]*?clip-path: inset\(50%\);/,
    );
    expect(source).toMatch(
      /@container short-drama-panel \(max-width: 420px\)[\s\S]*?\.short-drama-center__tab \{[\s\S]*?width: var\(--workspace-icon-target\);[\s\S]*?flex: 0 0 auto;/,
    );
  });

  it('recovers script line length at compact panel widths', () => {
    expect(source).toMatch(
      /@container short-drama-panel \(max-width: 620px\)[\s\S]*?\.short-drama-center__body \{[\s\S]*?gap: var\(--workspace-space-1\);[\s\S]*?padding: var\(--workspace-space-3\) var\(--workspace-space-2\);/,
    );
    expect(source).toMatch(
      /@container short-drama-panel \(max-width: 620px\)[\s\S]*?\.short-drama-center__script-editor \.ProseMirror \{[\s\S]*?padding: var\(--workspace-space-6\) var\(--workspace-space-3\);/,
    );
    expect(source).toMatch(
      /@container short-drama-panel \(max-width: 420px\)[\s\S]*?\.short-drama-center__script-empty \{[\s\S]*?width: 100%;[\s\S]*?margin: var\(--workspace-space-3\) 0 0;/,
    );
  });

  it('keeps the inline AI activation hint readable without changing global editor styles', () => {
    expect(source).toMatch(
      /\.short-drama-center__script-editor[\s\S]*?\.m-editor-tiptap[\s\S]*?> p\.is-empty::before \{[\s\S]*?color: var\(--workspace-text-secondary\);/,
    );
  });

  it('flattens post-production preview and result rows without hiding status', () => {
    expect(source).toMatch(
      /\.short-drama-center__final-preview \{[\s\S]*?border: 0;[\s\S]*?padding: 0;[\s\S]*?background: transparent;/,
    );
    expect(source).toMatch(
      /\.short-drama-center__post-list \{[\s\S]*?overflow: visible;[\s\S]*?border: 0;[\s\S]*?background: transparent;/,
    );
    expect(source).toMatch(
      /\.short-drama-center__post-row \{[\s\S]*?grid-template-columns: 80px minmax\(0, 1fr\) auto;[\s\S]*?padding: var\(--workspace-space-2\) 0;/,
    );
    expect(source).toMatch(
      /\.short-drama-center__post-row > \.short-drama-pill \{[\s\S]*?grid-column: 3;[\s\S]*?grid-row: 1 \/ -1;/,
    );
    expect(source).toMatch(
      /@container short-drama-panel \(max-width: 420px\)[\s\S]*?\.short-drama-media-preview--final[\s\S]*?\.short-drama-media-preview__meta \{[\s\S]*?grid-template-areas:[\s\S]*?"title duration"[\s\S]*?"label label";/,
    );
    expect(source).toMatch(
      /@container short-drama-panel \(max-width: 420px\)[\s\S]*?\.short-drama-center__final-preview-meta \{[\s\S]*?flex-wrap: nowrap;[\s\S]*?padding: 0;/,
    );
    expect(source).toMatch(
      /\.short-drama-center__final-preview-meta[\s\S]*?\.short-drama-pill \{[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?text-overflow: ellipsis;/,
    );
  });
});
