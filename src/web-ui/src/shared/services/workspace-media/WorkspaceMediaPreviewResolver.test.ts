import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workspaceAPI } from '@/infrastructure/api/service-api/WorkspaceAPI';
import {
  clearWorkspaceMediaPreviewUrlCache,
  resolveWorkspaceMediaPreviewUrl,
} from './WorkspaceMediaPreviewResolver';

vi.mock('@/infrastructure/api/service-api/WorkspaceAPI', () => ({
  workspaceAPI: {
    readFileContent: vi.fn(),
  },
}));

const readFileContent = vi.mocked(workspaceAPI.readFileContent);

describe('WorkspaceMediaPreviewResolver', () => {
  beforeEach(() => {
    clearWorkspaceMediaPreviewUrlCache();
    readFileContent.mockReset();
  });

  it('reuses the resolved data url for repeated requests of the same file', async () => {
    readFileContent.mockResolvedValue('QUJD');

    const first = await resolveWorkspaceMediaPreviewUrl({ filePath: 'C:/work/a.png', extension: 'png', kind: 'image' });
    const second = await resolveWorkspaceMediaPreviewUrl({ filePath: 'C:/work/a.png', extension: 'png', kind: 'image' });

    expect(first).toBe('data:image/png;base64,QUJD');
    expect(second).toBe(first);
    expect(readFileContent).toHaveBeenCalledTimes(1);
  });

  it('deduplicates in-flight resolutions for the same file', async () => {
    let release!: (value: string) => void;
    readFileContent.mockImplementation(() => new Promise(resolve => {
      release = resolve;
    }));

    const pending = [
      resolveWorkspaceMediaPreviewUrl({ filePath: 'C:/work/b.png', extension: 'png', kind: 'image' }),
      resolveWorkspaceMediaPreviewUrl({ filePath: 'C:/work/b.png', extension: 'png', kind: 'image' }),
    ];
    release('RERG');
    const [first, second] = await Promise.all(pending);

    expect(first).toBe('data:image/png;base64,RERG');
    expect(second).toBe(first);
    expect(readFileContent).toHaveBeenCalledTimes(1);
  });

  it('keys the cache by modification time so regenerated files re-resolve', async () => {
    readFileContent.mockResolvedValueOnce('QUJD').mockResolvedValueOnce('RERG');

    const before = await resolveWorkspaceMediaPreviewUrl({ filePath: 'C:/work/c.png', kind: 'image', modifiedAt: 1 });
    const after = await resolveWorkspaceMediaPreviewUrl({ filePath: 'C:/work/c.png', kind: 'image', modifiedAt: 2 });

    expect(before).not.toBe(after);
    expect(readFileContent).toHaveBeenCalledTimes(2);
  });

  it('does not cache failed reads so pending-to-ready tiles recover', async () => {
    readFileContent.mockRejectedValueOnce(new Error('missing')).mockResolvedValueOnce('QUJD');

    const failed = await resolveWorkspaceMediaPreviewUrl({ filePath: 'C:/work/d.png', kind: 'image' });
    const recovered = await resolveWorkspaceMediaPreviewUrl({ filePath: 'C:/work/d.png', kind: 'image' });

    expect(failed).toBeUndefined();
    expect(recovered).toBe('data:image/png;base64,QUJD');
    expect(readFileContent).toHaveBeenCalledTimes(2);
  });
});
