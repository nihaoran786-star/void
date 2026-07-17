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
});
