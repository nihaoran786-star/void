/**
 * K3 §5.1.5, second half: what the board does with a `domainRef` once the
 * surface has handed it one.
 *
 * The payload names an asset and nothing else — no path, no media id. So the
 * board has to look the asset up and ask it for its current picture, and that
 * lookup is what lives here. It sits in the neutral adapter folder for the
 * same reason the path conversion does: the canvas must not learn the shape of
 * a short-drama project, and the short-drama module must not learn what a
 * canvas card is.
 *
 * Everything is fail-closed. A missing asset, a type that no longer matches
 * the reference, a picture whose path cannot be converted — each comes back as
 * its own refusal, never as a card pointing at a guess.
 */
import type {
  InfiniteCanvasDomainRef,
} from '@/shared/services/infinite-canvas/InfiniteCanvasTypes';
import { resolveShortDramaArtifactReference } from '@/shared/services/short-drama/ShortDramaArtifactIndex';
import type { ShortDramaProject } from '@/shared/services/short-drama/ShortDramaTypes';
import { toCanvasMediaRef, type CanvasMediaRef } from './shortDramaCanvasRefBridge';

/**
 * What the card face needs to say where it came from: the asset's display
 * handle (`CHAR-001`) and its title.
 *
 * The handle is resolved at runtime rather than stored on the card, because a
 * handle can be renamed and `domainRef` is a four-field contract that must
 * survive that rename. The cost is this lookup; the benefit is that a rename
 * shows up on the board instead of leaving a stale label behind.
 */
export interface ShortDramaCanvasOrigin {
  handle?: string;
  title?: string;
}

export type ShortDramaCanvasImportResolution =
  | { status: 'ready'; mediaRef: CanvasMediaRef; origin: ShortDramaCanvasOrigin }
  | { status: 'refused'; reason: 'asset-missing' | 'unusable-picture' };

/**
 * Looks up the asset a domain reference names, in this workspace's project.
 *
 * The type check matters as much as the id check: an id can be reused by a
 * different asset type after a delete-and-recreate, and a storyboard card
 * wearing a character's reference would send a later refinement to the wrong
 * place.
 */
export function resolveShortDramaCanvasImport(
  project: ShortDramaProject,
  domainRef: InfiniteCanvasDomainRef,
  workspacePath: string,
): ShortDramaCanvasImportResolution {
  const resolved = resolveShortDramaArtifactReference(project, domainRef.id);
  if (resolved.status !== 'ready' || resolved.artifact.type !== domainRef.kind) {
    return { status: 'refused', reason: 'asset-missing' };
  }
  const mediaRef = toCanvasMediaRef(resolved.artifact.mediaReference, workspacePath);
  if (!mediaRef) {
    return { status: 'refused', reason: 'unusable-picture' };
  }
  return {
    status: 'ready',
    mediaRef,
    origin: { handle: resolved.entry.handle, title: resolved.artifact.title },
  };
}

/**
 * The badge's side of the same lookup: who is this card's asset, today?
 *
 * `undefined` means the asset is gone. The board does NOT then delete the card
 * or strip its reference — the user's picture is still there and still theirs.
 * The badge just degrades to "no longer exists" and the return leg is refused.
 */
export function resolveShortDramaCanvasOrigin(
  project: ShortDramaProject,
  domainRef: InfiniteCanvasDomainRef,
): ShortDramaCanvasOrigin | undefined {
  const resolved = resolveShortDramaArtifactReference(project, domainRef.id);
  if (resolved.status !== 'ready' || resolved.artifact.type !== domainRef.kind) {
    return undefined;
  }
  return { handle: resolved.entry.handle, title: resolved.artifact.title };
}
