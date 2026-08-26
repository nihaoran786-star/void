/**
 * Display labels for workspace media inside the canvas surfaces.
 *
 * Owner bug report 2026-08-26: the library picker showed `image-001.png` in
 * every cell, because each generation batch names its first file that. The
 * file name alone is not an identity here.
 *
 * Pure formatting of data the caller already holds — no copy, so nothing to
 * translate, and no I/O.
 */
import type { WorkspaceMediaItem } from '@/shared/services/workspace-media/WorkspaceMediaTypes';

/**
 * "batch / file" for generated media (the batch id is what actually
 * distinguishes two same-named files), "folder / file" for anything else, and
 * the bare name when there is no folder to name.
 */
export function workspaceMediaTileLabel(item: WorkspaceMediaItem): string {
  const fileName = item.fileName || item.relativePath;
  const batch = item.generatedIdentity?.batchId;
  if (batch) return `${batch} / ${fileName}`;
  const segments = item.relativePath.split(/[\\/]/).filter(Boolean);
  const folder = segments.length >= 2 ? segments[segments.length - 2] : undefined;
  return folder ? `${folder} / ${fileName}` : fileName;
}
