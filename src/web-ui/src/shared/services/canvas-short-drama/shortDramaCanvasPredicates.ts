/**
 * The two questions the short-drama side is allowed to ask about the board —
 * and nothing else.
 *
 * They used to live next to the path adapter in `shortDramaCanvasRefBridge`,
 * which imports `@/shared/services/canvas` for one workspace-equivalence
 * helper. That barrel unconditionally re-exports `CanvasSurfaceCommandService`,
 * `CanvasSurfaceRegistry` and their singletons, so the short-drama panel — an
 * orchestration hotspot that only wanted a boolean — was pulling the canvas
 * surface services into its own module graph through a side door. The
 * type-only care taken in the handoff context was undone by one value import
 * three files away.
 *
 * So the predicates moved here. This file imports NO canvas module: only the
 * canvas domain-kind constant (a frozen list of strings) and short-drama
 * types, which are erased at build time. Both answers are pure functions over
 * two plain shapes, which is what let them be asked from a panel in the first
 * place.
 */
import { INFINITE_CANVAS_DOMAIN_KINDS } from '@/shared/services/infinite-canvas/document/InfiniteCanvasTypes';
import type { ShortDramaArtifact } from '@/shared/services/short-drama/ShortDramaTypes';

/**
 * K3 §5.1.5: may this asset be refined on the board at all?
 *
 * Two conditions, both narrow on purpose:
 *  - the asset type is one the board knows how to own a reference to, and
 *  - the picture is a picture. Video and audio assets are out of scope: the
 *    board can render a video card, but the refinement pipeline behind it is
 *    an image pipeline, so a video sent there would have nothing to do.
 */
export function canRefineShortDramaArtifactOnCanvas(
  artifact: Pick<ShortDramaArtifact, 'type' | 'mediaReference'>,
): boolean {
  if (!(INFINITE_CANVAS_DOMAIN_KINDS as readonly string[]).includes(artifact.type)) {
    return false;
  }
  return artifact.mediaReference?.kind === 'image';
}

/**
 * K3 §5.2: is the picture this asset is holding right now one that came back
 * from the canvas?
 *
 * Answered from the newest revision alone, and only from the two additive
 * fields — a project written before K3 has neither, which reads as "no". The
 * short-drama panel needs this to explain a review the user did not start from
 * an agent run.
 *
 * `revisions` is treated as ordered, oldest first, which is how every writer
 * in the module appends to it.
 */
export function wasShortDramaArtifactRefinedOnCanvas(
  artifact: Pick<ShortDramaArtifact, 'revisions'>,
): boolean {
  const latest = artifact.revisions[artifact.revisions.length - 1];
  return latest?.sourceCanvasNodeId !== undefined;
}
