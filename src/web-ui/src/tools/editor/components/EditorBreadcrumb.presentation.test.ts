// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(
  new URL('./EditorBreadcrumb.tsx', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
const baseStylesheet = readFileSync(
  new URL('./EditorBreadcrumb.scss', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
const minimalStylesheet = readFileSync(
  new URL('./EditorBreadcrumb.minimal.scss', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

describe('EditorBreadcrumb presentation boundary', () => {
  it('keeps file loading behind workspaceAPI and prevents stale directory results', () => {
    expect(component).toContain('workspaceAPI.getFileTree(dirPath, 1)');
    expect(component).toContain('directoryRequestIdRef');
    expect(component).toContain('requestId !== directoryRequestIdRef.current');
    expect(component).toContain("setDropdownError(t('editor.common.loadFailed'))");
    expect(component).not.toContain('invoke(');
  });

  it('exposes a localized keyboard menu with viewport-safe positioning', () => {
    expect(component).toContain('computeFixedPopoverPosition(');
    expect(component).toContain('role="menu"');
    expect(component).toContain('role="menuitem"');
    expect(component).toContain('aria-haspopup="menu"');
    expect(component).toContain("['ArrowDown', 'ArrowUp', 'Home', 'End']");
    expect(component).toContain("tCommon('nav.back')");
    expect(component).not.toContain('Go to parent directory');
    expect(component).not.toContain('Empty directory');
  });

  it('projects the compact dropdown through shared Minimal tokens', () => {
    expect(minimalStylesheet).toContain('.void-ui--minimal');
    expect(minimalStylesheet).toContain('var(--workspace-surface-raised)');
    expect(minimalStylesheet).toContain('var(--workspace-focus-ring)');
    expect(minimalStylesheet).toContain('padding: var(--workspace-space-1);');
    expect(baseStylesheet).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
