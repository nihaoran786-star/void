import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pathFor = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const readSource = (relativePath: string): string =>
  readFileSync(pathFor(relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('Insights Minimal presentation contract', () => {
  const source = readSource('./InsightsScene.minimal.scss');

  it('loads once through the Insights feature stylesheet', () => {
    const owner = readSource('./InsightsScene.scss');

    expect(owner.match(/@use '\.\/InsightsScene\.minimal' as minimal;/g)).toHaveLength(1);
    expect(owner.match(/@include minimal\.styles;/g)).toHaveLength(1);
  });

  it('scopes the projection to the Minimal Insights scene', () => {
    expect(source).toContain('@mixin styles {');
    expect(source).toContain('.void-ui--minimal .insights-scene {');
    expect(source).not.toMatch(/\n {2}\.insights-/);
  });

  it('uses one compact command row with a visible scene title', () => {
    expect(source).toMatch(
      /\.insights-scene__header \{[\s\S]*?min-height: 60px;[\s\S]*?border-bottom:/,
    );
    expect(source).toMatch(
      /\.insights-scene__header-title \{[\s\S]*?font-size: var\(--workspace-font-size-body\);[\s\S]*?white-space: nowrap;/,
    );
    expect(source).toMatch(
      /\.insights-scene__header-actions \{[\s\S]*?flex-wrap: nowrap;[\s\S]*?justify-content: flex-end;/,
    );
    expect(source).toContain('overscroll-behavior-inline: contain;');
  });

  it('keeps long report lists cheap and removes decorative card movement', () => {
    expect(source).toMatch(
      /\.insights-meta-card \{[\s\S]*?content-visibility: auto;[\s\S]*?contain-intrinsic-size: auto 88px;/,
    );
    expect(source).toMatch(
      /\.insights-meta-card \{[\s\S]*?will-change: auto;/,
    );
    expect(source).not.toMatch(/\b(?:translate|scale)\s*\(/i);
    expect(source).not.toMatch(/transition\s*:\s*all/i);
    expect(source).not.toMatch(/(?:linear|radial|conic)-gradient/i);
  });

  it('provides one subtle focus ring and reduced-motion fallback', () => {
    expect(source).toMatch(
      /:where\(button, a\):focus-visible \{[\s\S]*?outline: 1px solid var\(--workspace-focus-ring-subtle\);[\s\S]*?box-shadow: none;/,
    );
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps the empty state graphical without adding another action path', () => {
    const component = readSource('./InsightsScene.tsx');

    expect(component).toContain('<BarChart3 size={18} aria-hidden="true" />');
    expect(component.match(/onClick=\{generateReport\}/g)).toHaveLength(1);
  });
});
