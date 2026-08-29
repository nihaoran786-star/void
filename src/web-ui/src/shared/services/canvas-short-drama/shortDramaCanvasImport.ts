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
import type {
  ShortDramaArtifactStatus,
  ShortDramaProject,
} from '@/shared/services/short-drama/ShortDramaTypes';
import type { InfiniteCanvasShortDramaBinding } from '@/shared/services/infinite-canvas/InfiniteCanvasAgentTaskTypes';
import {
  shortDramaStageForCanvasKind,
  toCanvasMediaRef,
  type CanvasMediaRef,
} from './shortDramaCanvasRefBridge';

/**
 * The English fact string the asset's media slot is labelled with when a
 * board generation files a picture there.
 *
 * English on purpose: it goes into `manifest.json`, where every other
 * runtime-written fact is stored in English and translated at display time.
 */
export const SHORT_DRAMA_CANVAS_GENERATION_LABEL = 'Generated on the infinite canvas';

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
  /**
   * K3 §5.2: what the asset is doing right now. The board shows only one thing
   * from it — that a picture it sent is waiting to be looked at — and it is
   * read, never written: the board cannot move an asset's status and does not
   * try. Resolved with the handle so a refined card stops looking finished
   * while a person still has to say yes.
   */
  status?: ShortDramaArtifactStatus;
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
    origin: {
      handle: resolved.entry.handle,
      title: resolved.artifact.title,
      status: resolved.artifact.status,
    },
  };
}

/**
 * K3 §6.2: the coordinates a generation started on an owned card should be
 * filed under — "whoever owns the data is responsible for generating it",
 * expressed as data rather than as a new permission for anybody.
 *
 * Same two-part check as everywhere else in this file (id AND type), for the
 * same reason: coordinates that name the wrong asset would file a picture into
 * someone else's project record, and that is the one mistake that cannot be
 * undone by deleting a card.
 *
 * `undefined` means "generate without coordinates". That is a deliberate
 * fail-OPEN, and the only one in K3: the user pressed generate, and a project
 * that cannot be read is no reason to refuse to draw their picture. They keep
 * the manual "send back to short drama" button, which fails closed and tells
 * them why.
 *
 * The asset's own `stage` wins over the kind→stage table; the table is only
 * consulted for a record that carries no stage at all.
 */
export function resolveShortDramaCanvasGenerationBinding(
  project: ShortDramaProject,
  domainRef: InfiniteCanvasDomainRef,
): InfiniteCanvasShortDramaBinding | undefined {
  const resolved = resolveShortDramaArtifactReference(project, domainRef.id);
  if (resolved.status !== 'ready' || resolved.artifact.type !== domainRef.kind) {
    return undefined;
  }
  const stage = resolved.artifact.stage ?? shortDramaStageForCanvasKind(domainRef.kind);
  if (!stage) return undefined;
  return {
    projectId: project.projectId,
    stage,
    artifactId: resolved.artifact.id,
    ...(resolved.entry.handle ? { artifactHandle: resolved.entry.handle } : {}),
    outputMediaLabel: SHORT_DRAMA_CANVAS_GENERATION_LABEL,
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
  return {
    handle: resolved.entry.handle,
    title: resolved.artifact.title,
    status: resolved.artifact.status,
  };
}
