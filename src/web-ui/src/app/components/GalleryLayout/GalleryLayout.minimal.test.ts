import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pathFor = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const readSource = (relativePath: string): string =>
  readFileSync(pathFor(relativePath), 'utf8').replace(/\r\n/g, '\n');

const sha256 = (relativePath: string): string =>
  createHash('sha256').update(readFileSync(pathFor(relativePath))).digest('hex');

describe('GalleryLayout Minimal presentation contract', () => {
  const source = readSource('./GalleryLayout.minimal.scss');
  const baseSource = readSource('./GalleryLayout.scss');

  it('loads exactly once through the Minimal presentation aggregator', () => {
    const aggregator = readSource('../../presentation/minimalWorkspacePresentation.scss');

    expect(aggregator.match(/GalleryLayout\.minimal\.scss/g)).toHaveLength(1);
    expect(aggregator.match(/@include gallery-layout\.styles;/g)).toHaveLength(1);
  });

  it('keeps Classic component and stylesheet byte-identical', () => {
    expect(sha256('./GalleryLayout.scss')).toBe(
      'f9537fa166db577bdf010da2cf40030336c967cc6a5d4d6a4693b5fd850947e3',
    );
    expect(sha256('./GalleryLayout.tsx')).toBe(
      'b0418d1352064bcb00d92aab9b4ce8ee7ffef54f61d3e417df33db1097f5e923',
    );
  });

  it('scopes the projection to Minimal GalleryLayout and preserves sticky anchors', () => {
    expect(source).toContain('@mixin styles {');
    expect(source).toContain('.void-ui--minimal .gallery-layout {');
    expect(source).not.toMatch(/\n {2}\.gallery-/);
    expect(source).toMatch(
      /\.gallery-page-header \{[\s\S]*?position: sticky;[\s\S]*?top: 0;[\s\S]*?z-index: 10;/,
    );
    expect(source).not.toContain('scroll-margin-top:');
    expect(baseSource).toContain('scroll-margin-top: 152px;');
  });

  it('uses flat workspace surfaces, compact type and 28px-or-larger targets', () => {
    expect(source).toContain('font-family: var(--workspace-font-family);');
    expect(source).toContain('font-size: var(--workspace-font-size-control);');
    expect(source).toMatch(
      /\.gallery-page-header \{[\s\S]*?background: var\(--workspace-surface-canvas\);[\s\S]*?border-bottom: 1px solid var\(--workspace-border-subtle\);[\s\S]*?backdrop-filter: none;/,
    );
    expect(source).toContain('min-width: var(--workspace-icon-target);');
    expect(source).toContain('min-height: var(--workspace-icon-target);');
  });

  it('lets gallery tracks shrink inside maximized and split desktop layouts', () => {
    expect(source).toMatch(
      /\.gallery-layout__body-inner \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/,
    );
    expect(source).toMatch(
      /\.gallery-zones \{[\s\S]*?width: 100%;[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0;/,
    );
    expect(source).toMatch(
      /\.gallery-zone \{[\s\S]*?min-width: 0;/,
    );
    expect(source).toMatch(
      /\.gallery-grid \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/,
    );
  });

  it('presents passive zone counts as metadata instead of button-like badges', () => {
    expect(source).toMatch(
      /\.gallery-filter-count \{[\s\S]*?background: var\(--workspace-surface-panel\);[\s\S]*?border-color: var\(--workspace-border-subtle\);/,
    );
    expect(source).toMatch(
      /\.gallery-zone-count \{[\s\S]*?min-width: 0;[\s\S]*?height: auto;[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?font-variant-numeric: tabular-nums;/,
    );
  });

  it('keeps the compact title and actions on one line until truly narrow widths', () => {
    expect(source).toMatch(
      /@media \(max-width: 1080px\)[\s\S]*?\.gallery-page-header \{[\s\S]*?flex-direction: row;[\s\S]*?align-items: center;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 1080px\)[\s\S]*?\.gallery-page-header__actions \{[\s\S]*?width: auto;[\s\S]*?flex-wrap: nowrap;/,
    );
    expect(source).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.gallery-page-header \{[\s\S]*?flex-direction: column;[\s\S]*?align-items: stretch;/,
    );
  });

  it('keeps interaction feedback short, composited-free and single-ring', () => {
    expect(source).toContain(
      'background-color var(--workspace-motion-fast) var(--workspace-easing-standard)',
    );
    expect(source).toContain(
      'color var(--workspace-motion-fast) var(--workspace-easing-standard)',
    );
    expect(source).toContain(
      'border-color var(--workspace-motion-fast) var(--workspace-easing-standard)',
    );
    expect(source).toMatch(
      /&:focus-visible \{[\s\S]*?outline: 2px solid var\(--workspace-focus-ring\);[\s\S]*?outline-offset: -2px;[\s\S]*?box-shadow: none;/,
    );
    expect(source).not.toMatch(/transition\s*:\s*all/i);
    expect(source).not.toMatch(/transition\s*:[^;]*(?:width|height|padding|margin|transform)/i);
    expect(source).not.toMatch(/\bscale\s*\(|\btransform\s*:/i);
  });

  it('uses governed tokens without raw colors, fallbacks, blur or gradients', () => {
    expect(source).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/i);
    expect(source).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(source).not.toMatch(/var\(--workspace-[^)]+,/);
    expect(
      [...source.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;]+);/gi)]
        .map((match) => match[1].trim()),
    ).toEqual(['none', 'none']);
  });

  it('stops transitions, skeleton shimmer, spinner and item entrance for reduced motion', () => {
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none;[\s\S]*?\.gallery-skeleton-card,[\s\S]*?\.gallery-skeleton-card::after,[\s\S]*?\.gallery-spinning \{[\s\S]*?animation: none;/,
    );
  });
});
