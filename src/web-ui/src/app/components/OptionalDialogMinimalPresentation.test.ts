import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string): string =>
  readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');

const minimalProjection = (source: string): string =>
  source.split(
    '// ==================== Minimal presentation projection ====================',
  )[1] ?? '';

describe('optional dialog Minimal presentation', () => {
  it('scopes both dialog projections to Minimal without component branches', () => {
    const newProjectStyles = minimalProjection(
      readSource('./NewProjectDialog/NewProjectDialog.scss'),
    );
    const remoteConnectStyles = minimalProjection(
      readSource('./RemoteConnectDialog/RemoteConnectDialog.scss'),
    );
    const newProjectSource = readSource(
      './NewProjectDialog/NewProjectDialog.tsx',
    );
    const remoteConnectSource = readSource(
      './RemoteConnectDialog/RemoteConnectDialog.tsx',
    );
    const appLayoutSource = readSource('../layout/AppLayout.tsx');
    const footerSource = readSource(
      './NavPanel/components/PersistentFooterActions.tsx',
    );

    for (const stylesheet of [newProjectStyles, remoteConnectStyles]) {
      expect(stylesheet).toContain('.void-ui--minimal .modal-overlay');
      expect(stylesheet).not.toContain('.void-ui--classic');
      expect(stylesheet).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
      expect(stylesheet).not.toMatch(/\blinear-gradient\s*\(/i);
    }

    expect(newProjectSource).not.toContain('workspacePresentation');
    expect(remoteConnectSource).not.toContain('workspacePresentation');
    expect(newProjectSource).toContain(
      'overlayClassName={overlayClassName}',
    );
    expect(remoteConnectSource.match(/overlayClassName=\{overlayClassName\}/g))
      .toHaveLength(2);
    expect(appLayoutSource).toContain(
      'applyWorkspacePresentationToPortalRoot(\n      document.body,\n      workspacePresentation,',
    );
    expect(appLayoutSource).not.toContain(
      'overlayClassName={workspacePresentationClassName(workspacePresentation)}',
    );
    expect(footerSource).not.toContain('readWorkspacePresentation');
    expect(footerSource).not.toContain('overlayClassName=');
  });

  it('uses the shared workspace hierarchy and removes decorative motion', () => {
    const newProjectStyles = minimalProjection(
      readSource('./NewProjectDialog/NewProjectDialog.scss'),
    );
    const remoteConnectStyles = minimalProjection(
      readSource('./RemoteConnectDialog/RemoteConnectDialog.scss'),
    );

    for (const contract of [
      'var(--workspace-font-family)',
      'var(--workspace-surface-raised)',
      'var(--workspace-border-subtle)',
      'var(--workspace-radius-panel)',
      'var(--workspace-shadow-raised)',
      'var(--workspace-focus-ring)',
    ]) {
      expect(newProjectStyles).toContain(contract);
      expect(remoteConnectStyles).toContain(contract);
    }

    expect(newProjectStyles).toContain('&__icon-wrapper {\n      display: none;');
    expect(newProjectStyles).toContain('&__field {\n      gap: var(--workspace-space-1);\n      animation: none;');
    expect(newProjectStyles).toContain('&:active:not(:disabled) {\n        transform: none;');
    expect(remoteConnectStyles).toContain('&__group-divider,\n    &__subtab-divider {\n      display: none;');
    expect(remoteConnectStyles).toContain('&__mode-selector {\n      align-self: flex-start;');
    expect(remoteConnectStyles).toContain(
      '.modal:has(.void-remote-connect) {\n    max-width: 440px;',
    );
    expect(remoteConnectStyles).toContain(
      'outline: 2px solid var(--workspace-focus-ring);',
    );
    expect(remoteConnectStyles).toContain('&.is-active {\n        color: var(--workspace-text-primary);\n        background: var(--workspace-surface-active);');
    expect(remoteConnectStyles).not.toMatch(/\bscale\s*\(/i);
  });
});
