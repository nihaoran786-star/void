import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pathFor = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const readSource = (relativePath: string): string =>
  readFileSync(pathFor(relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('Mini App scene Minimal presentation contract', () => {
  const source = readSource('./MiniAppScene.minimal.scss');

  it('loads through the Mini App scene stylesheet and stays Minimal-scoped', () => {
    const owner = readSource('./MiniAppScene.scss');

    expect(owner).toContain("@use './MiniAppScene.minimal' as minimal;");
    expect(owner).toContain('@include minimal.styles;');
    expect(source).toContain('@mixin styles {');
    expect(source).toContain('.void-ui--minimal .miniapp-scene {');
    expect(source).not.toMatch(/\n {2}\.(?:miniapp-scene|miniapp-customize-panel)/);
  });

  it('integrates customization as a scroll-safe split panel', () => {
    expect(source).toMatch(
      /\.miniapp-customize-panel \{[\s\S]*?margin: 0;[\s\S]*?overflow-y: auto;/,
    );
    expect(source).toMatch(
      /\.miniapp-customize-panel \{[\s\S]*?border-left: 1px solid var\(--workspace-border-subtle\);[\s\S]*?border-radius: 0;[\s\S]*?box-shadow: none;/,
    );
    expect(source).toMatch(
      /\.miniapp-customize-panel__header \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/,
    );
    expect(source).toMatch(
      /\.miniapp-customize-panel__footer \{[\s\S]*?position: sticky;[\s\S]*?bottom: 0;[\s\S]*?margin-top: auto;/,
    );
  });

  it('keeps the narrow overlay complete and its close action reachable', () => {
    expect(source).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.miniapp-customize-panel \{[\s\S]*?inset: 0;[\s\S]*?min-width: 0;[\s\S]*?border-left: 0;/,
    );
  });

  it('uses workspace tokens without decorative literal effects', () => {
    expect(source).not.toMatch(/(?:linear|radial|conic)-gradient/i);
    expect(source).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/i);
    expect(source).not.toMatch(/transition\s*:\s*all/i);
    expect(source).toContain('var(--workspace-surface-panel)');
    expect(source).toContain('var(--workspace-border-subtle)');
    expect(source).toContain('var(--workspace-status-warning-bg)');
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
