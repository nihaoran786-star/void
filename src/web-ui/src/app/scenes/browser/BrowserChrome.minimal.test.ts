import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const chromeStyles = readFileSync(
  resolve(process.cwd(), 'src/app/scenes/browser/BrowserChrome.minimal.scss'),
  'utf8',
);
const panelStyles = readFileSync(
  resolve(process.cwd(), 'src/app/scenes/browser/BrowserPanel.scss'),
  'utf8',
);
const sceneStyles = readFileSync(
  resolve(process.cwd(), 'src/app/scenes/browser/BrowserScene.scss'),
  'utf8',
);

describe('minimal browser chrome contract', () => {
  it('shares one feature-local projection between the panel and scene surfaces', () => {
    expect(panelStyles).toContain("@include minimal.styles('browser-panel')");
    expect(sceneStyles).toContain("@include minimal.styles('browser-scene')");
  });

  it('reflows narrow browser surfaces without hiding address or navigation controls', () => {
    expect(chromeStyles).toContain('container-type: inline-size');
    expect(chromeStyles).toContain('(max-width: 260px)');
    expect(chromeStyles).toContain('flex-wrap: wrap');
    expect(chromeStyles).toContain('order: -1');
    expect(chromeStyles).toContain('flex: 1 0 100%');
    expect(chromeStyles).not.toContain('display: none;\n    }\n\n    .void-ui--minimal .#{$root}__address');
  });

  it('keeps the projection tokenized, single-ring, and reduced-motion safe', () => {
    expect(chromeStyles).toContain('var(--workspace-font-family)');
    expect(chromeStyles).toContain('var(--workspace-icon-target)');
    expect(chromeStyles).toContain('var(--workspace-focus-ring-subtle)');
    expect(chromeStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(chromeStyles).not.toMatch(/transition\s*:\s*all/i);
    expect(chromeStyles).not.toMatch(/(?:#[0-9a-f]{3,8}|rgba?\()/i);
  });

  it('removes decorative placeholder paint and bounds narrow error copy', () => {
    expect(chromeStyles).toContain('background: var(--workspace-surface-canvas)');
    expect(chromeStyles).toContain('-webkit-line-clamp: 3');
    expect(chromeStyles).not.toContain('radial-gradient');
  });
});
