/**
 * Default media preview resolver for infinite-canvas cards.
 *
 * A card's `mediaRef` is `{ workspacePath, relativePath }`. This app does not
 * enable Tauri's asset protocol (`convertFileSrc` URLs are refused by the
 * webview), so cards load media exactly the way the Workspace Media gallery
 * does: through `resolveWorkspaceMediaPreviewUrl`, which reads the file over
 * the workspace API and serves a data URL (images go through its bounded
 * thumbnail cache). On any failure the card falls back to its existing
 * `previewUnavailable` state instead of a broken image icon.
 */
import {
  resolveWorkspaceMediaPreviewUrl,
} from '@/shared/services/workspace-media/WorkspaceMediaPreviewResolver';
import { joinWorkspaceMediaPath } from '@/shared/services/workspace-media/WorkspaceMediaPaths';

import type {
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from '@/shared/services/infinite-canvas';

/**
 * Joins workspacePath + relativePath into one absolute file path.
 *
 * `joinWorkspaceMediaPath` picks the separator from the workspace path
 * (Windows `\` vs POSIX `/`) but only rewrites forward slashes in the
 * relative part, so a relativePath that arrives with backslashes is
 * normalized first — the result never mixes separators.
 */
export function infiniteCanvasMediaFilePath(mediaRef: InfiniteCanvasMediaRef): string {
  return joinWorkspaceMediaPath(
    mediaRef.workspacePath,
    mediaRef.relativePath.replace(/\\/g, '/'),
  );
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);

function mediaKindForPath(relativePath: string): 'image' | 'video' {
  const extension = relativePath.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTENSIONS.has(extension) ? 'video' : 'image';
}

export const resolveInfiniteCanvasMediaPreviewUrl: InfiniteCanvasImagePreviewResolver =
  async mediaRef => {
    const filePath = infiniteCanvasMediaFilePath(mediaRef);
    const kind = mediaKindForPath(mediaRef.relativePath);
    return resolveWorkspaceMediaPreviewUrl({
      filePath,
      kind,
      // Images opt into the gallery's bounded data-url cache; the asset
      // protocol is disabled in this app, so streaming URLs never load.
      forceDataUrl: true,
    });
  };
