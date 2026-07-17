import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSibling(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('MainNav workspace menu accessibility contract', () => {
  it('moves focus into the portal menu and restores it on Escape', () => {
    const source = readSibling('./MainNav.tsx');

    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('aria-controls="void-workspace-menu"');
    expect(source).toContain('onKeyDown={handleWorkspaceMenuTriggerKeyDown}');
    expect(source).toContain('onKeyDown={handleWorkspaceMenuKeyDown}');
    expect(source).toContain('workspaceMenuInitialFocusRef.current');
    expect(source).toContain('closeWorkspaceMenu(true);');
    expect(source).toContain('workspacePresentationClassName(workspacePresentation)');
    expect(source).toContain("setAttribute('data-keyboard-focus', 'true')");
    expect(source).toContain('onFocusCapture={handleWorkspaceMenuFocusCapture}');
  });

  it('keeps portal focus visible in classic and minimal presentations', () => {
    const baseStyles = readSibling('./NavPanel.scss');
    const minimalStyles = readSibling('./NavPanel.minimal.scss');

    expect(baseStyles).toMatch(
      /&__workspace-menu-item\s*\{[\s\S]*?&:focus,\s*&\[data-keyboard-focus='true'\]\s*\{[\s\S]*?outline:\s*2px solid var\(--control-focus-ring, var\(--color-accent-500\)\);/,
    );
    expect(minimalStyles).toContain(
      '.void-ui--minimal.void-nav-panel__workspace-menu',
    );
    expect(minimalStyles).toMatch(
      /&:focus,\s*&\[data-keyboard-focus='true'\]\s*\{[\s\S]*?outline:\s*2px solid var\([\s\S]*?--workspace-focus-ring,[\s\S]*?--control-focus-ring,[\s\S]*?--color-accent-500/,
    );
    expect(minimalStyles).toContain("&[data-keyboard-focus='true']");
  });
});
