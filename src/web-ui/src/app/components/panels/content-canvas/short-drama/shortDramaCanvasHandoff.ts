/**
 * "Refine on the canvas": everything the short-drama panel is NOT allowed to
 * know (contract §5.1.5, plan §3.1).
 *
 * `ShortDramaCenterPanel.tsx` is an orchestration hotspot, so it gets a purely
 * presentational button and nothing else — no canvas service import, no
 * decision logic, and above all no business DOM event. Every judgement lives
 * here, and the container wires this to the button through a small context.
 *
 * Note what this does NOT touch: `activeArtifactFocusByStage`. That state
 * feeds the context package handed to the stage agents, and letting a
 * cross-panel open quietly rewrite an agent's focus would be a side effect
 * nobody asked for. Sending a picture to the board is not focusing an asset.
 */
import type { CanvasWorkspaceFacts } from '@/shared/services/canvas';
import { canvasSurfaceCommandService } from '../registry/CanvasSurfaceCommandRuntime';
import type { ShortDramaArtifact } from '@/shared/services/short-drama/ShortDramaTypes';
import { canRefineShortDramaArtifactOnCanvas } from '@/shared/services/canvas-short-drama/shortDramaCanvasPredicates';
import { toCanvasMediaRef } from '@/shared/services/canvas-short-drama/shortDramaCanvasRefBridge';
import {
  INFINITE_CANVAS_DOMAIN_MODULE_IDS,
  INFINITE_CANVAS_DOMAIN_ROLES,
} from '@/shared/services/infinite-canvas/document/InfiniteCanvasTypes';
import { INFINITE_CANVAS_SURFACE_ID } from '../registry/CanvasSurfaceIds';

export interface ShortDramaCanvasHandoffTarget {
  workspace: CanvasWorkspaceFacts;
  hostId: string;
  sourceSessionId: string;
}

export type ShortDramaCanvasHandoffResult =
  | { status: 'sent' }
  | { status: 'refused'; reason: 'not-refinable' | 'unusable-picture' | 'canvas-unavailable' };

function createRequestId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `sd-canvas-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Opens the board carrying this asset. The request id is both the surface
 * idempotency key and the panel's one-shot import key, so a double click
 * cannot produce two cards.
 *
 * The picture's path deliberately does NOT travel in the payload — see
 * §5.1.5. Only "which asset" does; the board resolves the current picture
 * itself, so an asset that changed picture between the click and the open
 * still lands correctly.
 */
export async function sendShortDramaArtifactToCanvas(
  artifact: Pick<ShortDramaArtifact, 'id' | 'type' | 'mediaReference'>,
  target: ShortDramaCanvasHandoffTarget,
): Promise<ShortDramaCanvasHandoffResult> {
  if (!canRefineShortDramaArtifactOnCanvas(artifact)) {
    return { status: 'refused', reason: 'not-refinable' };
  }
  if (target.workspace.status !== 'ready' || target.workspace.backend === 'remote') {
    return { status: 'refused', reason: 'canvas-unavailable' };
  }
  // Checked here, before anything opens: a picture whose path cannot be
  // converted would open an empty board and leave the user guessing.
  if (!toCanvasMediaRef(artifact.mediaReference, target.workspace.workspacePath)) {
    return { status: 'refused', reason: 'unusable-picture' };
  }

  const requestId = createRequestId();
  const result = await canvasSurfaceCommandService.open({
    surfaceId: INFINITE_CANVAS_SURFACE_ID,
    source: 'canvas-control',
    input: {
      domainRef: {
        moduleId: INFINITE_CANVAS_DOMAIN_MODULE_IDS[0],
        kind: artifact.type,
        id: artifact.id,
        role: INFINITE_CANVAS_DOMAIN_ROLES[0],
      },
      requestId,
    },
    idempotencyKey: requestId,
    sourceSessionId: target.sourceSessionId,
    target: { ...target.workspace, hostId: target.hostId },
  });

  return result.status === 'opened' || result.status === 'updated' || result.status === 'focused'
    ? { status: 'sent' }
    : { status: 'refused', reason: 'canvas-unavailable' };
}
