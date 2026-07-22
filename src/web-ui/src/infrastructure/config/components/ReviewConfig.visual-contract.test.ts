import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  fileURLToPath(new URL('./ReviewConfig.scss', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('ReviewConfig visual contract', () => {
  it('uses canonical control surfaces for rest, hover, and selected states', () => {
    for (const declaration of [
      'background: var(--control-bg);',
      'background: var(--control-bg-hover);',
      'background: var(--control-bg-active);',
      'color: var(--color-text-primary);',
      'color: var(--color-text-secondary);',
      'color: var(--color-text-muted);',
    ]) {
      expect(stylesheet).toContain(declaration);
    }

    expect(stylesheet).not.toMatch(
      /var\(--(?:color-surface|element-bg-hover|color-primary-bg-subtle)\)/,
    );
  });

  it('uses the canonical compact spacing and radius scale', () => {
    for (const declaration of [
      "tokens' as *;",
      'gap: $size-gap-1;',
      'gap: $size-gap-2;',
      'gap: $size-gap-4;',
      'padding: $size-gap-3;',
      'padding: $size-gap-4;',
      'border-radius: $size-radius-base;',
    ]) {
      expect(stylesheet).toContain(declaration);
    }

    expect(stylesheet).not.toMatch(
      /(?:gap|padding|border-radius):\s*(?:4|6|8|12|16)px\b/,
    );
  });

  it('keeps all strategy choices on one wide row and collapses by container', () => {
    expect(stylesheet).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr));',
    );
    expect(stylesheet).toMatch(
      /@container config-panel \(max-width: 640px\) \{\s*\.review-config__strategy-options,\s*\.review-config__overview-grid \{\s*grid-template-columns: 1fr;/,
    );
    expect(stylesheet).not.toContain(
      'grid-template-columns: repeat(auto-fit',
    );
    expect(stylesheet).not.toMatch(
      /@media \(max-width: 860px\)[\s\S]*?\.review-config__overview-grid/,
    );
  });

  it('keeps keyboard focus visible without broad transitions', () => {
    expect(stylesheet).toMatch(
      /&:focus-visible\s*\{\s*outline: 2px solid var\(--control-focus-ring\);\s*outline-offset: 2px;/,
    );
    expect(stylesheet).toContain(
      'background-color var(--motion-fast) var(--easing-standard)',
    );
    expect(stylesheet).not.toMatch(/\btransition:\s*all\b/);
  });
});
