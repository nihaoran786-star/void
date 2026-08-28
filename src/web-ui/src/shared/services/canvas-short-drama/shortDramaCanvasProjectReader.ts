/**
 * The board's read-only window onto the short-drama project.
 *
 * K3 phase one is strictly one-directional: the canvas reads which asset a
 * card belongs to and what its current picture is, and writes nothing back.
 * This file is the whole of that window, and it exists so the canvas panel has
 * exactly one import instead of assembling a manifest adapter and a library
 * service itself.
 *
 * It reuses the existing short-drama read path unchanged — no new read
 * interface was added to the short-drama module, which stays byte-for-byte the
 * same in this phase.
 */
import { createShortDramaManifestLibraryService } from '@/shared/services/short-drama/ShortDramaProjectViewModel';
import type { ShortDramaProject } from '@/shared/services/short-drama/ShortDramaTypes';
import { createShortDramaWorkspaceManifestAdapter } from '@/shared/services/short-drama/ShortDramaWorkspaceManifestAdapter';

/**
 * One workspace holds exactly one `.void/short-drama/manifest.json`, and the
 * reader below ignores this id when resolving the file. It is passed anyway,
 * matching the id the short-drama panel passes, so the two cannot drift apart
 * if a future multi-project world ever gives it meaning.
 */
const SHORT_DRAMA_CANVAS_PROJECT_ID = 'static_short_drama_001';

/**
 * Reads the project, or `undefined` if there is none to read. Every failure —
 * no workspace, no manifest, unreadable, remote — collapses to `undefined`:
 * the caller's answer is the same in all of them ("this card's asset cannot be
 * resolved right now"), and a card is never built on a partial read.
 */
export async function readShortDramaProjectForCanvas(
  workspacePath: string | undefined,
): Promise<ShortDramaProject | undefined> {
  const trimmed = workspacePath?.trim();
  if (!trimmed) return undefined;
  const service = createShortDramaManifestLibraryService(
    createShortDramaWorkspaceManifestAdapter(trimmed),
    SHORT_DRAMA_CANVAS_PROJECT_ID,
  );
  try {
    const state = await service.loadProject(trimmed);
    return state.status === 'ready' ? state.project : undefined;
  } catch {
    return undefined;
  }
}
