import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSibling(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

const guaranteedThemeTokens = [
  '--border-subtle',
  '--color-accent-400',
  '--color-accent-500',
  '--color-accent-600',
  '--color-accent-700',
  '--color-bg-elevated',
  '--color-bg-primary',
  '--color-error',
  '--color-success',
  '--color-warning',
  '--control-focus-ring',
] as const;

describe('NavPanel theme ownership contract', () => {
  const baseStyles = readSibling('./NavPanel.scss');
  const minimalStyles = readSibling('./NavPanel.minimal.scss');
  const sessionStyles = readSibling(
    './sections/sessions/SessionsSection.scss',
  );
  const workspaceStyles = readSibling(
    './sections/workspaces/WorkspaceListSection.scss',
  );
  const tokenStyles = readSibling(
    '../../../component-library/styles/tokens.scss',
  );
  const navigationStyles = [
    baseStyles,
    minimalStyles,
    sessionStyles,
    workspaceStyles,
  ].join('\n');

  it('uses the shared theme contract instead of repeating guaranteed fallbacks', () => {
    for (const token of guaranteedThemeTokens) {
      expect(tokenStyles).toContain(`${token}:`);
      expect(navigationStyles).not.toMatch(
        new RegExp(`var\\(\\s*${token}\\s*,`),
      );
    }

    expect(navigationStyles).not.toContain('var(--color-text-tertiary');
  });

  it('keeps semantic navigation accents token-backed', () => {
    expect(baseStyles).not.toMatch(/#60a5fa\b/i);
    expect(baseStyles).not.toMatch(/rgba\(\s*96\s*,\s*165\s*,\s*250\s*,/i);
    expect(sessionStyles).not.toMatch(
      /#(?:8b5cf6|f59e0b|22c55e|ef4444|4caf50)\b/i,
    );
    expect(workspaceStyles).not.toMatch(
      /#(?:22c55e|ef4444|f59e0b|36c275|e8b54b|e05d5d)\b/i,
    );
  });

  it('preserves Classic status values while projecting Minimal aliases', () => {
    expect(baseStyles).toContain('color: #ca8a04;');
    expect(workspaceStyles).toContain(
      '--void-nav-status-unknown: #94a3b8;',
    );
    expect(workspaceStyles).toContain(
      'background: var(--void-nav-status-unknown);',
    );
    expect(minimalStyles).toContain(
      '--void-nav-status-unknown: var(--workspace-text-muted);',
    );
  });

  it('projects portal navigation surfaces through the Minimal theme contract', () => {
    expect(minimalStyles).toContain('&__mode-dropdown,');
    expect(minimalStyles).toContain('&__inline-item-menu-popover,');
    expect(minimalStyles).toContain('&__workspace-item-menu-popover,');
  });

  it('keeps the Minimal projection free of raw colors and broad transitions', () => {
    expect(minimalStyles).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(minimalStyles).not.toMatch(/\brgba?\(/i);
    expect(minimalStyles).not.toMatch(/\btransition\s*:\s*all\b/i);
  });
});
