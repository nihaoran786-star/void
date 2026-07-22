import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadWorkspacePresentationStyles } from './workspacePresentationStyles';

describe('workspacePresentationStyles', () => {
  it('keeps classic presentation free of minimal presentation assets', async () => {
    await expect(loadWorkspacePresentationStyles('classic')).resolves.toBeUndefined();
  });

  it('loads the minimal presentation asset on demand', async () => {
    await expect(loadWorkspacePresentationStyles('minimal')).resolves.toBeUndefined();
  });

  it('includes the workspace manager portal override in the minimal bundle only', () => {
    const stylesheet = readFileSync(
      new URL('./minimalWorkspacePresentation.scss', import.meta.url),
      'utf8',
    ).replace(/\r\n/g, '\n');

    expect(stylesheet).toContain(
      "@use '../../tools/workspace/components/WorkspaceManager.minimal.scss' as workspace-manager;",
    );
    expect(stylesheet).toContain('@include workspace-manager.styles;');
  });

  it('loads legacy portal surface overrides from the same on-demand Minimal asset', () => {
    const stylesheet = readFileSync(
      new URL('./minimalWorkspacePresentation.scss', import.meta.url),
      'utf8',
    ).replace(/\r\n/g, '\n');

    expect(stylesheet).toContain('BranchSelectModal.minimal.scss');
    expect(stylesheet).toContain('QuickLook.minimal.scss');
    expect(stylesheet).toContain('EditorBreadcrumb.minimal.scss');
    expect(stylesheet).toContain('@include branch-select-modal.styles;');
    expect(stylesheet).toContain('@include quick-look.styles;');
    expect(stylesheet).toContain('@include editor-breadcrumb.styles;');
    expect(stylesheet).toContain('EditorStatusBar.minimal.scss');
    expect(stylesheet).toContain('StatusBarPopovers.minimal.scss');
    expect(stylesheet).toContain('DiffFullscreenViewer.minimal.scss');
    expect(stylesheet).toContain('SnapshotFullscreenDiffViewer.minimal.scss');
    expect(stylesheet).toContain('RemoteFileBrowser.minimal.scss');
    expect(stylesheet).toContain('@include editor-status-bar.styles;');
    expect(stylesheet).toContain('@include status-bar-popovers.styles;');
    expect(stylesheet).toContain('@include fullscreen-diff.styles;');
    expect(stylesheet).toContain('@include snapshot-fullscreen-diff.styles;');
    expect(stylesheet).toContain('@include remote-file-browser.styles;');
  });

  it('loads the Welcome projection only through the on-demand Minimal asset', () => {
    const stylesheet = readFileSync(
      new URL('./minimalWorkspacePresentation.scss', import.meta.url),
      'utf8',
    ).replace(/\r\n/g, '\n');

    expect(stylesheet.match(/WelcomeScene\.minimal\.scss/g)).toHaveLength(1);
    expect(stylesheet.match(/@include welcome-scene\.styles;/g)).toHaveLength(1);
  });
});
