import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (name: string) => readFileSync(
  fileURLToPath(new URL(name, import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

const minimalSource = readSource('./TabBar.minimal.scss');
const tabBarSource = readSource('./TabBar.scss');
const overflowSource = readSource('./TabOverflowMenu.scss');

describe('TabBar minimal presentation contract', () => {
  it('loads one isolated Minimal projection after the Classic presentation', () => {
    expect(tabBarSource).toContain("@use './TabBar.minimal' as minimal;");
    expect(tabBarSource.trimEnd()).toMatch(/@include minimal\.styles;$/);
  });

  it('uses compact shared workspace metrics for the header, tabs, and actions', () => {
    expect(minimalSource).toMatch(
      /\.void-ui--minimal \.canvas-tab-bar \{[\s\S]*?height: var\(--workspace-topbar-height\);/,
    );
    expect(minimalSource).toMatch(
      /\.void-ui--minimal \.canvas-tab \{[\s\S]*?height: var\(--workspace-icon-target\);[\s\S]*?font/,
    );
    expect(minimalSource).toContain('font-size: var(--workspace-font-size-label);');
  });

  it('keeps the Minimal projection token-only and avoids layout animation', () => {
    expect(minimalSource).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(minimalSource).not.toMatch(/\brgba?\s*\(/i);
    expect(minimalSource).not.toMatch(/transition\s*:\s*all/);
    expect(minimalSource).not.toMatch(
      /transition\s*:[^;]*(?:width|height|padding|margin)/,
    );
    expect(overflowSource).not.toMatch(/transition\s*:\s*all/);
  });

  it('projects portal menus onto canonical workspace surfaces and status roles', () => {
    expect(minimalSource).toMatch(
      /\.void-ui--minimal \.canvas-tab-overflow-menu \{[\s\S]*?background: var\(--workspace-surface-raised\);[\s\S]*?box-shadow: var\(--workspace-shadow-raised\);/,
    );
    expect(minimalSource).toContain('color: var(--workspace-status-error-text);');
    expect(minimalSource).toContain('color: var(--workspace-status-warning-text);');
  });
});
