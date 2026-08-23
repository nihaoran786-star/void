import { beforeEach, describe, expect, it } from 'vitest';

import type { CanvasSurfaceDefinition } from '@/shared/services/canvas/CanvasSurfaceContracts';
import { CanvasSurfaceRegistry } from '@/shared/services/canvas/CanvasSurfaceRegistry';
import { CanvasSurfaceService } from '@/shared/services/canvas/CanvasSurfaceService';
import {
  resetAgentCanvasWorkspaceSnapshotsForTests,
  switchAgentCanvasWorkspace,
  useAgentCanvasStore,
} from '../stores/canvasStore';
import { createCanvasStoreHostAdapter } from './CanvasStoreHostAdapter';
import { CanvasSurfaceRendererRegistry } from './CanvasSurfaceRendererRegistry';
import { INFINITE_CANVAS_SURFACE_ID } from './CanvasSurfaceIds';
import { registerFirstPartyCanvasSurfaces } from './firstPartyCanvasSurfaces';

const LOCAL_WORKSPACE = {
  status: 'ready',
  workspaceId: 'workspace-infinite-canvas',
  workspacePath: 'C:/infinite-canvas',
  backend: 'local',
} as const;

function activate() {
  const surfaces = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
  const renderers = new CanvasSurfaceRendererRegistry();
  const activation = registerFirstPartyCanvasSurfaces(surfaces, renderers);
  const service = new CanvasSurfaceService(
    surfaces,
    createCanvasStoreHostAdapter({
      ...useAgentCanvasStore.getState(),
      isRequestCurrent: () => true,
    }),
  );
  switchAgentCanvasWorkspace(null, LOCAL_WORKSPACE.workspaceId);
  return { surfaces, renderers, activation, service };
}

describe('infinite-canvas Canvas surface', () => {
  beforeEach(() => {
    resetAgentCanvasWorkspaceSnapshotsForTests();
    useAgentCanvasStore.getState().reset();
  });

  it('registers alongside the other first-party surfaces and disposes with them', () => {
    const { surfaces, activation } = activate();

    expect(activation.status).toBe('active');
    expect(surfaces.resolve(INFINITE_CANVAS_SURFACE_ID)).toBeDefined();

    activation.dispose();
    expect(surfaces.resolve(INFINITE_CANVAS_SURFACE_ID)).toBeUndefined();
  });

  it('claims no legacy content type, so it cannot hijack an existing panel', () => {
    const { surfaces } = activate();

    expect(surfaces.resolve(INFINITE_CANVAS_SURFACE_ID)?.legacyContentType).toBeUndefined();
  });

  it('rejects a non-empty input payload: phase 1 has one default document', async () => {
    const { service } = activate();

    for (const [index, input] of [[1, 2], { documentId: 'doc-1' }, 'doc'].entries()) {
      await expect(service.open({
        surfaceId: INFINITE_CANVAS_SURFACE_ID,
        source: 'capability-rail',
        workspace: LOCAL_WORKSPACE,
        sourceSessionId: 'session-1',
        input,
        idempotencyKey: `open-infinite-canvas-bad-${index}`,
      })).resolves.toMatchObject({ status: 'incompatible' });
    }
  });

  it('opens one workspace-scoped instance keyed by the workspace id', async () => {
    const { renderers, service } = activate();

    await expect(service.open({
      surfaceId: INFINITE_CANVAS_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: undefined,
      idempotencyKey: 'open-infinite-canvas-1',
    })).resolves.toMatchObject({ status: 'opened' });

    const content = useAgentCanvasStore.getState().primaryGroup.tabs[0]?.content;
    expect(content).toMatchObject({
      // K2: the opening session travels in the presentation data so the panel
      // can prefer it as the dispatch target.
      data: {
        workspacePath: LOCAL_WORKSPACE.workspacePath,
        sourceSessionId: 'session-1',
      },
      metadata: {
        canvasSurfaceId: INFINITE_CANVAS_SURFACE_ID,
        canvasSurfaceInstanceKey:
          `${INFINITE_CANVAS_SURFACE_ID}:${LOCAL_WORKSPACE.workspaceId}`,
        canvasWorkspaceId: LOCAL_WORKSPACE.workspaceId,
        duplicateCheckKey: `infinite-canvas:${LOCAL_WORKSPACE.workspaceId}`,
        sourceSessionId: 'session-1',
      },
    });
    expect(renderers.resolve(content!)?.surfaceId).toBe(INFINITE_CANVAS_SURFACE_ID);
  });

  it('focuses the existing instance when opened twice for the same workspace', async () => {
    const { service } = activate();

    const first = await service.open({
      surfaceId: INFINITE_CANVAS_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-1',
      input: undefined,
      idempotencyKey: 'open-infinite-canvas-same-1',
    });
    const second = await service.open({
      surfaceId: INFINITE_CANVAS_SURFACE_ID,
      source: 'capability-rail',
      workspace: LOCAL_WORKSPACE,
      sourceSessionId: 'session-2',
      input: undefined,
      idempotencyKey: 'open-infinite-canvas-same-2',
    });

    expect(first.status).toBe('opened');
    expect(second.status).toBe('focused');
    if (first.status !== 'opened' || second.status !== 'focused') return;
    expect(second.instanceId).toBe(first.instanceId);
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
  });

  it('is unavailable on a remote workspace, matching the media fail-closed rule', async () => {
    const { service } = activate();

    await expect(service.open({
      surfaceId: INFINITE_CANVAS_SURFACE_ID,
      source: 'capability-rail',
      workspace: {
        status: 'ready',
        workspaceId: 'workspace-remote',
        workspacePath: '/remote/project',
        backend: 'remote',
        remoteConnectionId: 'remote-1',
      },
      sourceSessionId: 'session-1',
      input: undefined,
      idempotencyKey: 'open-infinite-canvas-remote',
    })).resolves.toMatchObject({ status: 'unavailable' });
  });
});
