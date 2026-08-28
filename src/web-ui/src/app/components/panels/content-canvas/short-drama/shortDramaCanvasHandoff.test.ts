/**
 * S4: what pressing "refine on the canvas" is allowed to do.
 *
 * Behaviour only — no styling assertions. The three things worth pinning down
 * are that the board is opened through the typed service (never a DOM event),
 * that the payload names the asset and nothing else, and that every refusal
 * happens BEFORE anything opens, so a user never lands on an empty board.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShortDramaArtifact } from '@/shared/services/short-drama/ShortDramaTypes';

const open = vi.fn();

vi.mock('../registry/CanvasSurfaceCommandRuntime', () => ({
  canvasSurfaceCommandService: { open: (...args: unknown[]) => open(...args) },
}));

const { sendShortDramaArtifactToCanvas } = await import('./shortDramaCanvasHandoff');

const WORKSPACE = {
  status: 'ready',
  workspaceId: 'ws-1',
  workspacePath: 'C:/projects/demo',
  backend: 'local',
} as const;

function artifact(overrides: Partial<ShortDramaArtifact> = {}) {
  return {
    id: 'artifact-1',
    type: 'character',
    mediaReference: {
      mediaItemId: 'media-1',
      kind: 'image',
      relativePath: 'media/generated/batch-1/item-1.png',
    },
    ...overrides,
  } as ShortDramaArtifact;
}

function target(workspace: Record<string, unknown> = {}) {
  return {
    workspace: { ...WORKSPACE, ...workspace } as never,
    hostId: 'agent',
    sourceSessionId: 'session-1',
  };
}

describe('sendShortDramaArtifactToCanvas', () => {
  beforeEach(() => {
    open.mockReset();
    open.mockResolvedValue({ status: 'opened', instanceId: 'instance-1' });
  });

  it('opens the board through the typed service, carrying only the asset', async () => {
    const result = await sendShortDramaArtifactToCanvas(artifact(), target());

    expect(result).toEqual({ status: 'sent' });
    expect(open).toHaveBeenCalledTimes(1);
    const request = open.mock.calls[0][0] as {
      input: { domainRef: Record<string, string>; requestId: string };
      idempotencyKey: string;
      source: string;
    };
    expect(request.input.domainRef).toEqual({
      moduleId: 'short-drama',
      kind: 'character',
      id: 'artifact-1',
      role: 'refine',
    });
    // The picture's path deliberately does not travel: the board resolves the
    // asset's current picture itself, so a swap between click and open cannot
    // send the wrong file.
    expect(Object.keys(request.input)).toEqual(['domainRef', 'requestId']);
    // One press, one import: the request id is also the surface's idempotency
    // key, so a double click cannot produce two cards.
    expect(request.idempotencyKey).toBe(request.input.requestId);
    expect(request.source).toBe('canvas-control');
  });

  it('gives every press its own request id', async () => {
    await sendShortDramaArtifactToCanvas(artifact(), target());
    await sendShortDramaArtifactToCanvas(artifact(), target());

    const first = (open.mock.calls[0][0] as { idempotencyKey: string }).idempotencyKey;
    const second = (open.mock.calls[1][0] as { idempotencyKey: string }).idempotencyKey;
    expect(first).not.toBe(second);
  });

  it('reports an already-open board that took the asset as sent', async () => {
    open.mockResolvedValue({ status: 'updated', instanceId: 'instance-1' });

    expect(await sendShortDramaArtifactToCanvas(artifact(), target()))
      .toEqual({ status: 'sent' });
  });

  it.each([
    ['an asset with no picture', artifact({ mediaReference: undefined })],
    ['a video asset', artifact({
      mediaReference: { mediaItemId: 'media-1', kind: 'video' },
    })],
  ])('refuses %s without opening anything', async (_label, subject) => {
    expect(await sendShortDramaArtifactToCanvas(subject, target()))
      .toEqual({ status: 'refused', reason: 'not-refinable' });
    expect(open).not.toHaveBeenCalled();
  });

  it.each([
    ['a workspace that is not ready', { status: 'scanning' }],
    ['a remote workspace', { backend: 'remote' }],
  ])('refuses %s without opening anything', async (_label, workspace) => {
    expect(await sendShortDramaArtifactToCanvas(artifact(), target(workspace)))
      .toEqual({ status: 'refused', reason: 'canvas-unavailable' });
    expect(open).not.toHaveBeenCalled();
  });

  it('refuses a picture whose path cannot be converted, before opening', async () => {
    const subject = artifact({
      mediaReference: {
        mediaItemId: 'media-1',
        kind: 'image',
        // Only `relativePath` is convertible; these mirrors are never a
        // fallback, so the answer has to be a refusal rather than a guess.
        localPath: 'C:/projects/demo/media/generated/item-1.png',
      },
    });

    expect(await sendShortDramaArtifactToCanvas(subject, target()))
      .toEqual({ status: 'refused', reason: 'unusable-picture' });
    expect(open).not.toHaveBeenCalled();
  });

  it('reports a board that refused to open', async () => {
    open.mockResolvedValue({ status: 'unavailable', reason: 'no host' });

    expect(await sendShortDramaArtifactToCanvas(artifact(), target()))
      .toEqual({ status: 'refused', reason: 'canvas-unavailable' });
  });
});
