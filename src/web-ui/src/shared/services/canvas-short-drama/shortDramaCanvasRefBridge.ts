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
import { joinWorkspaceMediaPath } from '@/shared/services/workspace-media/WorkspaceMediaPaths';

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

/**
 * The name short drama will file this picture under.
 *
 * A `mediaItemId` is an opaque key to short drama — it displays a label, not
 * this — but it is one half of the write-back's idempotency, so it has to be
 * the SAME string for the same file every time, and ideally the same string
 * the backend would have chosen.
 *
 * So: a picture that a media job produced already carries its job's identity
 * in its own path (`media/generated/<batchId>/<name>-<index>.<ext>`), and
 * `<batchId>-<index>` is character-for-character what the backend writes for
 * that file. Reading it back means a picture delivered by the board and the
 * same picture delivered by a future generation-with-coordinates collapse onto
 * one revision instead of two.
 *
 * Anything else — a crop, an imported reference — has no job identity to read,
 * so its key is its own path behind a prefix. Deterministic, unique per file,
 * and honest about not being a job id. This is a naming rule, not path
 * arithmetic: the string is never handed to a filesystem.
 */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'];

function isImageRelativePath(relativePath: string): boolean {
  const extension = relativePath.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.includes(extension);
}

const GENERATED_BATCH_PATTERN = /^(?:media\/generated|\.void\/media\/generated)\/([^/]+)\/[^/]+-(\d+)\.[^/.]+$/i;

export function toShortDramaMediaItemId(relativePath: string): string {
  const match = relativePath.match(GENERATED_BATCH_PATTERN);
  const itemIndex = match ? Number.parseInt(match[2], 10) : Number.NaN;
  if (match && Number.isFinite(itemIndex) && itemIndex > 0) {
    return `${match[1]}-${itemIndex}`;
  }
  return `canvas-refine:${relativePath}`;
}

/**
 * K3 §5.2, the short-drama panel's one question about the board: is the
 * picture this asset is holding right now one that came back from the canvas?
 *
 * Answered from the newest revision alone, and only from the two additive
 * fields — a project written before K3 has neither, which reads as "no". The
 * short-drama panel needs this to explain a review the user did not start from
 * an agent run, and the predicate lives here so the panel (an orchestration
 * hotspot) never has to know what a canvas card is.
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

/**
 * Canvas → short drama, the whole media reference (K3 §5.2).
 *
 * `null` for anything that is not a clean, in-workspace relative path, for the
 * same reason as everywhere else in this file: a guess here writes the wrong
 * file into someone's project.
 *
 * The absolute path IS produced, through the workspace-media join helper the
 * canvas preview resolver already uses — not by string surgery here. It has to
 * be: the short-drama card reads `localPath ?? filePath` to draw a picture, so
 * a reference without one would come home invisible. What is deliberately NOT
 * carried over is `previewUrl` / `thumbnailUrl`: those are `convertFileSrc`
 * output this app's webview refuses, and leaving them absent makes the card
 * resolve the file itself, which works.
 */
export function toShortDramaMediaReference(
  mediaRef: Partial<CanvasMediaRef> | undefined,
  expectedWorkspacePath: string,
  backend: 'local' | 'remote' = 'local',
  options: { label?: string; timestamp?: number } = {},
): ShortDramaMediaReference | null {
  const relativePath = toShortDramaRelativePath(mediaRef, expectedWorkspacePath, backend);
  if (relativePath === null) return null;
  // The refinement pipeline is an image pipeline on both sides. A card holding
  // something else has nothing to send home, and mislabelling it `image` would
  // hand the short-drama card a file it cannot draw.
  if (!isImageRelativePath(relativePath)) return null;
  const filePath = joinWorkspaceMediaPath(expectedWorkspacePath.trim(), relativePath);
  return {
    mediaItemId: toShortDramaMediaItemId(relativePath),
    kind: 'image',
    ...(options.label === undefined ? {} : { label: options.label }),
    relativePath,
    localPath: filePath,
    filePath,
    ...(options.timestamp === undefined ? {} : { modifiedAt: options.timestamp }),
    source: 'generated',
  };
}
