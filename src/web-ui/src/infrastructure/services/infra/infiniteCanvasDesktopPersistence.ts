/**
 * Desktop adapter for the Infinite Canvas persistence port.
 *
 * Routes all file I/O through the existing workspaceAPI facade (same pattern
 * as the Workspace Media node adapter), so the domain service in
 * `shared/services/infinite-canvas/` never touches Tauri directly.
 */
import { workspaceAPI } from '@/infrastructure/api/service-api/WorkspaceAPI';
import type { InfiniteCanvasPersistencePort } from '@/shared/services/infinite-canvas/document/InfiniteCanvasPersistencePort';

async function pathExists(path: string): Promise<boolean> {
  try {
    await workspaceAPI.getFileMetadata(path);
    return true;
  } catch {
    return false;
  }
}

export const infiniteCanvasDesktopPersistence: InfiniteCanvasPersistencePort = {
  async readTextFile(path) {
    if (!(await pathExists(path))) {
      return null;
    }
    return workspaceAPI.readFileContent(path);
  },

  /**
   * Atomic-write discipline: write a sibling temp file first, then rename it
   * over the target so a crash mid-write never leaves a truncated document.
   * Windows rename does not overwrite, so a stale target is removed after the
   * temp content is safely on disk.
   */
  async writeTextFileAtomic(path, content) {
    const tempPath = `${path}.tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await workspaceAPI.writeFile(tempPath, content);
    try {
      if (await pathExists(path)) {
        await workspaceAPI.deleteFile(path);
      }
      await workspaceAPI.renameFile(tempPath, path);
    } catch (error) {
      // Do not leave temp files behind on a failed swap.
      await workspaceAPI.deleteFile(tempPath).catch(() => undefined);
      throw error;
    }
  },

  async ensureDirectory(path) {
    try {
      const metadata = await workspaceAPI.getFileMetadata(path);
      if (metadata.isDir) {
        return;
      }
    } catch {
      // Missing paths are created below; other errors surface from createDirectory.
    }
    await workspaceAPI.createDirectory(path);
  },
};
