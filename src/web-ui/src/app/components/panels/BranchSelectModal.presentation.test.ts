// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(
  new URL('./BranchSelectModal.tsx', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
const baseStylesheet = readFileSync(
  new URL('./BranchSelectModal.scss', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
const minimalStylesheet = readFileSync(
  new URL('./BranchSelectModal.minimal.scss', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');
const workspaceItem = readFileSync(
  new URL('../NavPanel/sections/workspaces/WorkspaceItem.tsx', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

describe('BranchSelectModal presentation boundary', () => {
  it('keeps the existing Git API boundary while exposing a complete dialog focus lifecycle', () => {
    expect(component).toContain('gitAPI.getBranches(repositoryPath, false)');
    expect(component).toContain('role="dialog"');
    expect(component).toContain('aria-modal="true"');
    expect(component).toContain('aria-labelledby={titleId}');
    expect(component).toContain('BRANCH_DIALOG_FOCUSABLE_SELECTOR');
    expect(component).toContain('previouslyFocusedElement.focus({ preventScroll: true })');
    expect(component).toContain('onKeyDown={handleDialogKeyDown}');
    expect(component).not.toContain('getWorkspacePresentation');
    expect(workspaceItem).toContain('onClose={closeWorktreeModal}');
    expect(workspaceItem).toContain("querySelector<HTMLButtonElement>('button')");
  });

  it('uses native branch controls and projects Minimal styling through workspace tokens', () => {
    expect(component).toMatch(/<button\s+type="button"\s+className=\{`branch-select-dialog__item/);
    expect(component).toContain('disabled={isDisabled}');
    expect(component).toContain('aria-pressed=');
    expect(minimalStylesheet).toContain('.void-ui--minimal');
    expect(minimalStylesheet).toContain('var(--workspace-surface-raised)');
    expect(minimalStylesheet).toContain('var(--workspace-overlay-scrim)');
    expect(minimalStylesheet).toContain('var(--workspace-focus-ring)');
    expect(baseStylesheet).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
