import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readWorkspaceStripStylesheet(): string {
  const stylesheet = readFileSync(
    fileURLToPath(new URL('./ChatInputWorkspaceStrip.scss', import.meta.url)),
    'utf8',
  );
  return stylesheet.replace(/\r\n/g, '\n');
}

describe('ChatInputWorkspaceStrip layout styles', () => {
  it('keeps the environment row inside the composer flow', () => {
    const stylesheet = readWorkspaceStripStylesheet();

    expect(stylesheet).toContain('position: relative;');
    expect(stylesheet).toContain('min-height: 28px;');
    expect(stylesheet).toContain('&__picker-menu {');
    expect(stylesheet).toContain('bottom: calc(100% + 8px);');
    expect(stylesheet).not.toContain('bottom: 0;');
  });

  it('keeps the session usage action visible without overpowering the strip', () => {
    const stylesheet = readWorkspaceStripStylesheet();

    expect(stylesheet).toContain('max-width: calc(100% - 24px);');
    expect(stylesheet).toContain('width: 24px;');
    expect(stylesheet).toContain('height: 24px;');
    expect(stylesheet).toContain('min-width: 24px;');
    expect(stylesheet).toContain('width: 14px;');
    expect(stylesheet).toContain('height: 14px;');
    expect(stylesheet).toContain('color: color-mix(in srgb, var(--color-accent-500) 62%, var(--color-text-secondary));');
    expect(stylesheet).toContain('color: color-mix(in srgb, var(--color-accent-500) 86%, var(--color-text-primary));');
  });

  it('keeps workspace and permission actions comfortably clickable', () => {
    const stylesheet = readWorkspaceStripStylesheet();

    expect(stylesheet).toMatch(
      /&__permission-trigger\s*\{[\s\S]*?min-height:\s*28px;/,
    );
    expect(stylesheet).toMatch(
      /&__picker-trigger\s*\{[\s\S]*?min-height:\s*28px;/,
    );
    expect(stylesheet).toMatch(
      /&__picker-option\s*\{[\s\S]*?min-height:\s*36px;/,
    );
  });
});
