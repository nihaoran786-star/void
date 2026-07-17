import { describe, expect, it } from 'vitest';
import { loadWorkspacePresentationStyles } from './workspacePresentationStyles';

describe('workspacePresentationStyles', () => {
  it('keeps classic presentation free of minimal presentation assets', async () => {
    await expect(loadWorkspacePresentationStyles('classic')).resolves.toBeUndefined();
  });

  it('loads the minimal presentation asset on demand', async () => {
    await expect(loadWorkspacePresentationStyles('minimal')).resolves.toBeUndefined();
  });
});
