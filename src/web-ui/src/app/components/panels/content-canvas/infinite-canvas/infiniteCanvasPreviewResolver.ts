/**
 * Default media preview resolver for infinite-canvas cards.
 *
 * A card's `mediaRef` is `{ workspacePath, relativePath }`; the webview cannot
 * load the raw local file path, so it must be converted with Tauri's
 * `convertFileSrc` — the exact same proven lane the Workspace Media library
 * thumbnails (WorkspaceMediaLibrary.previewUrlForPath) and the canvas image
 * picker use. No environment sniffing and no base64 fallback: when the
 * conversion is unavailable or fails, the card falls back to the existing
 * `previewUnavailable` state instead of a broken image icon.
 */
import { convertFileSrc } from '@tauri-apps/api/core';

import { joinWorkspaceMediaPath } from '@/shared/services/workspace-media/WorkspaceMediaPaths';

import type {
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from './InfiniteCanvasNodes';

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

export const resolveInfiniteCanvasMediaPreviewUrl: InfiniteCanvasImagePreviewResolver =
  async mediaRef => {
    try {
      return convertFileSrc(infiniteCanvasMediaFilePath(mediaRef)) || undefined;
    } catch {
      // Outside a Tauri webview (or on conversion failure) there is no
      // loadable URL; the card shows its previewUnavailable state.
      return undefined;
    }
  };
