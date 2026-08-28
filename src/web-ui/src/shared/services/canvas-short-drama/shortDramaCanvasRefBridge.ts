/**
 * The one place `relativePath` is converted between the short-drama domain and
 * the infinite canvas (contract §5.1.7).
 *
 * It belongs to neither side on purpose. The short-drama module must not learn
 * what a canvas `mediaRef` is, and the canvas must not learn what a
 * `ShortDramaMediaReference` is; both would be a dependency in the wrong
 * direction and both would end up with a second copy of these rules.
 *
 * Two rules make this file boring, which is the point:
 *
 * 1. **Only `relativePath` is read.** `localPath` and `filePath` are redundant
 *    mirrors of it, and `mediaItemId` is a short-drama primary key the canvas
 *    neither understands nor stores.
 * 2. **Paths are never assembled.** No join, no resolve, no
 *    `replace(workspacePath, '')`. If a clean relative path is not already
 *    sitting there, the answer is `null` and the caller says "this picture
 *    cannot go to the board right now". Guessing here would silently hand the
 *    user the wrong file.
 *
 * Pure: no React, no Tauri, no panel imports.
 */
import { areCanvasWorkspacePathsEquivalent } from '@/shared/services/canvas';
import { INFINITE_CANVAS_DOMAIN_KINDS } from '@/shared/services/infinite-canvas/InfiniteCanvasTypes';
import type {
  ShortDramaArtifact,
  ShortDramaMediaReference,
} from '@/shared/services/short-drama/ShortDramaTypes';

export interface CanvasMediaRef {
  workspacePath: string;
  relativePath: string;
}

/**
 * Windows drive letters (`C:/…`), POSIX roots (`/…`), UNC shares (`//host/…`)
 * and URL-ish schemes are all absolute: a workspace-relative path is none of
 * them.
 */
function isAbsoluteLikePath(value: string): boolean {
  return value.startsWith('/')
    || value.startsWith('\\')
    || /^[A-Za-z]:[\\/]/.test(value)
    || /^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(value);
}

/**
 * Normalises separators for inspection only — the returned value keeps forward
 * slashes because that is what every canvas `mediaRef` in the document already
 * uses, and mixing the two would break equality checks between cards.
 */
function cleanRelativePath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const normalized = trimmed.replace(/\\/g, '/');
  if (isAbsoluteLikePath(normalized)) return undefined;
  // A traversal segment means the path is not really workspace-relative, and
  // resolving it here is exactly the path arithmetic this file refuses to do.
  if (normalized.split('/').some(segment => segment === '..')) return undefined;
  return normalized;
}

/**
 * K3 §5.1.5: may this asset be refined on the board at all?
 *
 * It lives here, not in the panel and not next to the surface call, for one
 * reason: this is the only question the short-drama panel is allowed to ask,
 * and answering it must not drag a canvas service into the panel's import
 * graph. `ShortDramaCenterPanel.tsx` is an orchestration hotspot; the predicate
 * it calls has to be a pure function over two plain shapes.
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
 * Short drama → canvas. `null` means "not convertible", never a best guess.
 *
 * The media kind matters: the board's refinement pipeline is an image
 * pipeline, so a video or audio asset has nothing to do there even though the
 * canvas can render a video card.
 */
export function toCanvasMediaRef(
  media: ShortDramaMediaReference | undefined,
  workspacePath: string,
): CanvasMediaRef | null {
  if (!media || media.kind !== 'image') return null;
  const relativePath = cleanRelativePath(media.relativePath);
  if (relativePath === undefined) return null;
  const trimmedWorkspacePath = workspacePath.trim();
  if (trimmedWorkspacePath.length === 0) return null;
  return { workspacePath: trimmedWorkspacePath, relativePath };
}

/**
 * Canvas → short drama (the return leg, phase two). The workspace has to match
 * before anything comes back: a card pointing at another workspace's file
 * would write a path the short-drama project cannot resolve.
 */
export function toShortDramaRelativePath(
  mediaRef: Partial<CanvasMediaRef> | undefined,
  expectedWorkspacePath: string,
  backend: 'local' | 'remote' = 'local',
): string | null {
  if (!mediaRef) return null;
  const relativePath = cleanRelativePath(mediaRef.relativePath);
  if (relativePath === undefined) return null;
  const cardWorkspacePath = mediaRef.workspacePath?.trim();
  const expected = expectedWorkspacePath.trim();
  if (!cardWorkspacePath || !expected) return null;
  if (!areCanvasWorkspacePathsEquivalent(cardWorkspacePath, expected, backend)) {
    return null;
  }
  return relativePath;
}
