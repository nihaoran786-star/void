import { workspaceAPI } from '@/infrastructure/api/service-api/WorkspaceAPI';
import type { ShortDramaManifestAdapter } from './ShortDramaTypes';

export interface ShortDramaWorkspaceManifestFileOps {
  readTextFile(path: string): Promise<string | undefined>;
  writeTextFile(path: string, content: string): Promise<void>;
  ensureDirectory(path: string): Promise<void>;
}

const defaultWorkspaceManifestFileOps: ShortDramaWorkspaceManifestFileOps = {
  async readTextFile(path: string) {
    try {
      return await workspaceAPI.readFileContent(path);
    } catch {
      return undefined;
    }
  },
  async writeTextFile(path: string, content: string) {
    await workspaceAPI.writeFile(path, content);
  },
  async ensureDirectory(path: string) {
    await workspaceAPI.createDirectory(path);
  },
};

export function createShortDramaWorkspaceManifestAdapter(
  workspacePath: string,
  fileOps: ShortDramaWorkspaceManifestFileOps = defaultWorkspaceManifestFileOps,
): ShortDramaManifestAdapter {
  const root = workspacePath.replace(/[\\/]+$/, '');
  const normalizeKey = (key: string) => {
    const normalized = key.replace(/^[\\/]+/, '').replace(/\\/g, '/');
    if (normalized.split('/').some(part => part === '..')) {
      throw new Error('Short drama manifest path must stay inside the workspace.');
    }
    return normalized;
  };
  const resolvePath = (key: string) => `${root}/${normalizeKey(key)}`;
  const ensureParentDirectories = async (key: string) => {
    const parts = normalizeKey(key).split('/');
    const dirs = parts.slice(0, -1);
    for (let index = 1; index <= dirs.length; index += 1) {
      await fileOps.ensureDirectory(`${root}/${dirs.slice(0, index).join('/')}`);
    }
  };

  return {
    kind: 'local',
    // Two adapters built for the same workspace are different objects writing
    // the same file; the save queue keys on this so they share one lock.
    scope: root,
    read(key: string) {
      return fileOps.readTextFile(resolvePath(key));
    },
    async write(key: string, value: string) {
      await ensureParentDirectories(key);
      await fileOps.writeTextFile(resolvePath(key), value);
    },
  };
}
