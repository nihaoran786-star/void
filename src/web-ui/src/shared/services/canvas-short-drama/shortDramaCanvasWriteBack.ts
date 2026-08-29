/**
 * "Send back to short drama" — the whole return leg, in one typed service
 * (K3 §5.2, plan §4.3).
 *
 * The board owns the decision and short drama owns the data, so this file sits
 * between them and belongs to neither. The canvas panel calls it and gets back
 * one of a small set of named answers; it never learns what a short-drama
 * project is, and the short-drama module never learns that a board exists.
 *
 * Three gates run before a single byte is written, all fail-closed:
 *
 *  1. **Workspace.** The card's picture must live in the workspace this write
 *     is aimed at (`areCanvasWorkspacePathsEquivalent`, via the path adapter),
 *     and the workspace must be local — the manifest writer refuses remote
 *     anyway, but a refusal the user can read beats a save that silently
 *     fails. One workspace holds exactly one `.void/short-drama/manifest.json`,
 *     so "same workspace" is also "same project"; there is no project field to
 *     check and none is invented. (Known limit: a future multi-project
 *     workspace would need one.)
 *  2. **Asset.** The reference must still name a real asset of the same type.
 *     An id can be reused after a delete-and-recreate, and a storyboard
 *     wearing a character's reference would send the picture to the wrong
 *     place.
 *  3. **Picture.** The card's `mediaRef` must convert to a clean
 *     workspace-relative image path. No guessing, no path assembly.
 *
 * Idempotency has two layers, and both matter. Here, the operation id is
 * derived from the asset and the picture, so pressing twice on an unchanged
 * card produces the same key. In the view model, the same key — or the picture
 * the asset is already holding — is recognised and the project is returned
 * untouched; the caller learns which happened from `outcome`. Sending a
 * *different* picture is never blocked, and neither is going back to a picture
 * this asset held earlier.
 *
 * The board never writes short drama's lifecycle: no status other than the
 * review it is asking for, no attempts, no deletes, no files.
 */
import { areCanvasWorkspacePathsEquivalent } from '@/shared/services/canvas/CanvasWorkspaceFacts';
import type { InfiniteCanvasDomainRef } from '@/shared/services/infinite-canvas/InfiniteCanvasTypes';
import { resolveShortDramaArtifactReference } from '@/shared/services/short-drama/ShortDramaArtifactIndex';
import {
  applyShortDramaCanvasRefinement,
  createShortDramaManifestLibraryService,
} from '@/shared/services/short-drama/ShortDramaProjectViewModel';
import {
  createShortDramaProjectPath,
} from '@/shared/services/short-drama/ShortDramaWorkspaceBinding';
import {
  emitShortDramaProjectChanged,
} from '@/shared/services/short-drama/ShortDramaProjectChangedEvent';
import type {
  ShortDramaProject,
} from '@/shared/services/short-drama/ShortDramaTypes';
import { createShortDramaWorkspaceManifestAdapter } from '@/shared/services/short-drama/ShortDramaWorkspaceManifestAdapter';
import { readShortDramaProjectForCanvas } from './shortDramaCanvasProjectReader';
import {
  toShortDramaMediaItemId,
  toShortDramaMediaReference,
  type CanvasMediaRef,
} from './shortDramaCanvasRefBridge';

/**
 * Matches the reader's id for the same reason it exists there: one workspace,
 * one manifest, and the id must not drift between the read and the write.
 */
const SHORT_DRAMA_CANVAS_PROJECT_ID = 'static_short_drama_001';

export interface ShortDramaCanvasWriteBackRequest {
  domainRef: InfiniteCanvasDomainRef;
  /** The picture on the card face right now. */
  mediaRef: CanvasMediaRef;
  /** Provenance: which card the user pressed. */
  canvasNodeId: string;
  workspacePath: string;
  backend?: 'local' | 'remote';
  timestamp?: number;
}

export type ShortDramaCanvasWriteBackRefusal =
  | 'remote-workspace'
  | 'foreign-workspace'
  | 'project-unreadable'
  | 'asset-missing'
  | 'unusable-picture'
  | 'save-failed';

/**
 * What actually happened, so the caller can say something true.
 *
 *  - `recorded` — a new revision was written and the asset is now in review.
 *  - `already-recorded` — nothing was written, because the asset is already
 *    holding this exact picture (or this exact press was already handled).
 *
 * The distinction matters to the user: both are "not a failure", but only the
 * first is "sent". Reporting a green "sent home" for the second is what made
 * "send A, send B, go back to A" look like it worked while doing nothing.
 * `alreadyRecorded` is kept as the boolean form of the same fact.
 */
export type ShortDramaCanvasWriteBackOutcome = 'recorded' | 'already-recorded';

export type ShortDramaCanvasWriteBackResult =
  | {
      status: 'sent';
      artifactId: string;
      mediaItemId: string;
      alreadyRecorded: boolean;
      outcome: ShortDramaCanvasWriteBackOutcome;
    }
  | { status: 'refused'; reason: ShortDramaCanvasWriteBackRefusal };

/**
 * Injection seams. Production reads and writes the workspace manifest through
 * the short-drama module's own entry points — no second writer is introduced,
 * and nothing here knows the manifest's shape.
 */
export interface ShortDramaCanvasWriteBackDeps {
  readProject?: (workspacePath: string | undefined) => Promise<ShortDramaProject | undefined>;
  saveProject?: (project: ShortDramaProject, workspacePath: string) => Promise<{ status: string }>;
  notifyProjectChanged?: (workspacePath: string) => void;
}

function defaultSaveProject(project: ShortDramaProject, workspacePath: string) {
  return createShortDramaManifestLibraryService(
    createShortDramaWorkspaceManifestAdapter(workspacePath),
    SHORT_DRAMA_CANVAS_PROJECT_ID,
  ).saveProject(project);
}

/**
 * The short-drama panel already reloads itself on this typed event — the same
 * one the AI write path emits. Reusing it is why the panel needs no wiring at
 * all to show the review, and why no DOM event is invented here.
 */
function defaultNotifyProjectChanged(workspacePath: string) {
  emitShortDramaProjectChanged({
    workspaceRoot: workspacePath,
    projectPath: createShortDramaProjectPath(workspacePath),
    action: 'update_artifact',
    projectState: 'ready',
    source: 'ShortDramaProject',
  });
}

/**
 * The key that makes a double press harmless.
 *
 * Derived, not random: the same asset and the same picture yield the same
 * operation id, so a second press of an unchanged card is recognised as the
 * repeat it is. A random id per press would defeat the whole guard.
 */
export function shortDramaCanvasWriteBackOperationId(
  domainRef: InfiniteCanvasDomainRef,
  mediaItemId: string,
): string {
  return `canvas-${domainRef.kind}-${domainRef.id}-${mediaItemId}`;
}

export async function sendCanvasPictureBackToShortDrama(
  request: ShortDramaCanvasWriteBackRequest,
  deps: ShortDramaCanvasWriteBackDeps = {},
): Promise<ShortDramaCanvasWriteBackResult> {
  const backend = request.backend ?? 'local';
  const workspacePath = request.workspacePath.trim();
  // Gate 1a: remote. The surface already refuses to open a board on a remote
  // workspace, and the manifest writer refuses to write one; this says so in
  // words the user can act on instead of failing at the last step.
  if (backend === 'remote' || !workspacePath) {
    return { status: 'refused', reason: 'remote-workspace' };
  }
  // Gate 1b: the card's own workspace. Checked before the project is even
  // read, so a foreign card cannot cause a read of someone else's manifest.
  if (!request.mediaRef?.workspacePath
    || !areCanvasWorkspacePathsEquivalent(request.mediaRef.workspacePath, workspacePath, backend)) {
    return { status: 'refused', reason: 'foreign-workspace' };
  }

  // Gate 3, run early: a picture that cannot be described is a refusal, not a
  // half-written project.
  const mediaReference = toShortDramaMediaReference(
    request.mediaRef,
    workspacePath,
    backend,
    { timestamp: request.timestamp ?? Date.now() },
  );
  if (!mediaReference) {
    return { status: 'refused', reason: 'unusable-picture' };
  }

  const readProject = deps.readProject ?? readShortDramaProjectForCanvas;
  const project = await readProject(workspacePath);
  if (!project) {
    return { status: 'refused', reason: 'project-unreadable' };
  }

  // Gate 2: the asset, by id AND by type.
  const resolved = resolveShortDramaArtifactReference(project, request.domainRef.id);
  if (resolved.status !== 'ready' || resolved.artifact.type !== request.domainRef.kind) {
    return { status: 'refused', reason: 'asset-missing' };
  }

  const operationId = shortDramaCanvasWriteBackOperationId(
    request.domainRef,
    mediaReference.mediaItemId,
  );
  const next = applyShortDramaCanvasRefinement(project, {
    artifactId: resolved.artifact.id,
    mediaReference,
    operationId,
    canvasNodeId: request.canvasNodeId,
    timestamp: request.timestamp ?? Date.now(),
  });

  // Already recorded: the view model returned the project it was given. There
  // is nothing to save, and saving anyway would rewrite the manifest's
  // timestamps for no reason.
  if (next === project) {
    return {
      status: 'sent',
      artifactId: resolved.artifact.id,
      mediaItemId: mediaReference.mediaItemId,
      alreadyRecorded: true,
      outcome: 'already-recorded',
    };
  }

  const saveProject = deps.saveProject ?? defaultSaveProject;
  const saved = await saveProject(next, workspacePath);
  if (saved.status !== 'ready') {
    return { status: 'refused', reason: 'save-failed' };
  }

  (deps.notifyProjectChanged ?? defaultNotifyProjectChanged)(workspacePath);

  return {
    status: 'sent',
    artifactId: resolved.artifact.id,
    mediaItemId: mediaReference.mediaItemId,
    alreadyRecorded: false,
    outcome: 'recorded',
  };
}

/**
 * Would a press be refused before it started? Used by the card to keep the
 * entry away from a card whose asset is gone — the answer the board already
 * has from the badge lookup, expressed once.
 */
export function canSendCanvasPictureBackToShortDrama(
  mediaRef: CanvasMediaRef | undefined,
  workspacePath: string | undefined,
  backend: 'local' | 'remote' = 'local',
): boolean {
  if (!mediaRef || !workspacePath || backend === 'remote') return false;
  return toShortDramaMediaReference(mediaRef, workspacePath, backend) !== null;
}

export { toShortDramaMediaItemId };
