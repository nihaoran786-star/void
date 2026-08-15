import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasSurfaceDefinition } from '@/shared/services/canvas/CanvasSurfaceContracts';
import { CanvasSurfaceRegistry } from '@/shared/services/canvas/CanvasSurfaceRegistry';
import { CanvasSurfaceService } from '@/shared/services/canvas/CanvasSurfaceService';
import type { PanelContent } from '../types';
import {
  resetAgentCanvasWorkspaceSnapshotsForTests,
  switchAgentCanvasWorkspace,
  useAgentCanvasStore,
} from '../stores/canvasStore';
import { createCanvasStoreHostAdapter } from './CanvasStoreHostAdapter';
import { CanvasSurfaceRendererRegistry } from './CanvasSurfaceRendererRegistry';
import {
  ensureFirstPartyCanvasSurfacesRegistered,
  registerFirstPartyCanvasSurfaces,
  SHORT_DRAMA_SURFACE_ID,
  WORKSPACE_MEDIA_SURFACE_ID,
} from './firstPartyCanvasSurfaces';

vi.mock('./ShortDramaCanvasOpenPolicyRuntime', () => ({
  prepareShortDramaCanvasOpen: vi.fn(async () => ({ status: 'ready' })),
  beforeShortDramaCanvasHostMutation: vi.fn(),
}));

describe('registerFirstPartyCanvasSurfaces', () => {
  beforeEach(() => {
    resetAgentCanvasWorkspaceSnapshotsForTests();
    useAgentCanvasStore.getState().reset();
  });

  it('activates and disposes the first-party definitions and renderers together', () => {
    const surfaces = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    const renderers = new CanvasSurfaceRendererRegistry();

    const activation = registerFirstPartyCanvasSurfaces(surfaces, renderers);

    expect(activation.status).toBe('active');
    expect(surfaces.resolve(SHORT_DRAMA_SURFACE_ID)).toBeDefined();
    expect(surfaces.resolve(WORKSPACE_MEDIA_SURFACE_ID)).toBeDefined();
    expect(renderers.resolve({
      type: 'short-drama-center',
      title: 'AI Short Drama',
    } as PanelContent)).toBeDefined();
    expect(renderers.resolve({
      type: 'workspace-media-gallery',
      title: 'Media',
    } as PanelContent)).toBeDefined();

    activation.dispose();
    expect(surfaces.resolve(SHORT_DRAMA_SURFACE_ID)).toBeUndefined();
    expect(surfaces.resolve(WORKSPACE_MEDIA_SURFACE_ID)).toBeUndefined();
    expect(renderers.resolve({
      type: 'short-drama-center',
      title: 'AI Short Drama',
    } as PanelContent)).toBeUndefined();
    expect(renderers.resolve({
      type: 'workspace-media-gallery',
      title: 'Media',
    } as PanelContent)).toBeUndefined();
  });

  it('opens a workspace-scoped Short Drama surface with authoritative session facts', async () => {
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
    switchAgentCanvasWorkspace(null, 'workspace-short-drama');

    await expect(service.open({
      surfaceId: SHORT_DRAMA_SURFACE_ID,
      source: 'capability-rail',
      workspace: {
        status: 'ready',
        workspaceId: 'workspace-short-drama',
        workspacePath: 'C:/short-drama',
        backend: 'local',
      },
      sourceSessionId: 'media-session-1',
      input: { staticFixtureEpisodeCount: 3 },
      idempotencyKey: 'open-short-drama',
    })).resolves.toMatchObject({ status: 'opened' });

    const content = useAgentCanvasStore.getState().primaryGroup.tabs[0]?.content;
    expect(content).toMatchObject({
      type: 'short-drama-center',
      data: {
        workspacePath: 'C:/short-drama',
        sourceSessionId: 'media-session-1',
        staticFixtureEpisodeCount: 3,
      },
      metadata: {
        canvasSurfaceId: SHORT_DRAMA_SURFACE_ID,
        canvasSurfaceInstanceKey: `${SHORT_DRAMA_SURFACE_ID}:workspace-short-drama`,
        canvasWorkspaceId: 'workspace-short-drama',
        canvasWorkspacePath: 'C:/short-drama',
        duplicateCheckKey: 'short-drama:C:/short-drama',
        sourceSessionId: 'media-session-1',
        contentRole: 'short-drama-center',
      },
    });
    expect(renderers.resolve(content as PanelContent)?.surfaceId).toBe(SHORT_DRAMA_SURFACE_ID);

    activation.dispose();
  });

  it('updates the workspace Short Drama surface when a new source session opens it', async () => {
    const surfaces = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    const renderers = new CanvasSurfaceRendererRegistry();
    registerFirstPartyCanvasSurfaces(surfaces, renderers);
    const service = new CanvasSurfaceService(
      surfaces,
      createCanvasStoreHostAdapter({
        ...useAgentCanvasStore.getState(),
        isRequestCurrent: () => true,
      }),
    );
    switchAgentCanvasWorkspace(null, 'workspace-short-drama');
    const workspace = {
      status: 'ready' as const,
      workspaceId: 'workspace-short-drama',
      workspacePath: 'C:/short-drama',
      backend: 'local' as const,
    };

    await service.open({
      surfaceId: SHORT_DRAMA_SURFACE_ID,
      source: 'session-default',
      workspace,
      sourceSessionId: 'media-session-1',
      input: undefined,
      idempotencyKey: 'restore-media-session-1',
    });
    await expect(service.open({
      surfaceId: SHORT_DRAMA_SURFACE_ID,
      source: 'capability-rail',
      workspace,
      sourceSessionId: 'media-session-2',
      input: undefined,
      idempotencyKey: 'open-media-session-2',
    })).resolves.toMatchObject({ status: 'updated' });

    const tabs = useAgentCanvasStore.getState().primaryGroup.tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.content).toMatchObject({
      data: { sourceSessionId: 'media-session-2' },
      metadata: { sourceSessionId: 'media-session-2' },
    });
  });

  it('fails closed without a source session or a local workspace route', async () => {
    const surfaces = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    const renderers = new CanvasSurfaceRendererRegistry();
    registerFirstPartyCanvasSurfaces(surfaces, renderers);
    const service = new CanvasSurfaceService(
      surfaces,
      createCanvasStoreHostAdapter({
        ...useAgentCanvasStore.getState(),
        isRequestCurrent: () => true,
      }),
    );

    await expect(service.open({
      surfaceId: SHORT_DRAMA_SURFACE_ID,
      source: 'capability-rail',
      workspace: {
        status: 'ready',
        workspaceId: 'workspace-local',
        workspacePath: 'C:/short-drama',
        backend: 'local',
      },
      input: undefined,
      idempotencyKey: 'missing-session',
    })).resolves.toMatchObject({ status: 'incompatible' });

    await expect(service.open({
      surfaceId: SHORT_DRAMA_SURFACE_ID,
      source: 'capability-rail',
      workspace: {
        status: 'ready',
        workspaceId: 'workspace-remote',
        workspacePath: '/srv/short-drama',
        backend: 'remote',
        remoteConnectionId: 'remote-a',
      },
      sourceSessionId: 'media-session-remote',
      input: undefined,
      idempotencyKey: 'remote-route',
    })).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('rolls back the surface definition when its renderer alias conflicts', () => {
    const surfaces = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    const renderers = new CanvasSurfaceRendererRegistry();
    renderers.register({
      surfaceId: 'conflicting-media',
      pluginVersion: '1.0.0',
      registrationKey: 'test.conflicting-media.renderer.v1',
      legacyContentTypes: ['workspace-media-gallery'],
      Renderer: () => null,
    });

    const activation = registerFirstPartyCanvasSurfaces(surfaces, renderers);

    expect(activation.status).toBe('conflict');
    expect(surfaces.resolve(SHORT_DRAMA_SURFACE_ID)).toBeUndefined();
    expect(surfaces.resolve(WORKSPACE_MEDIA_SURFACE_ID)).toBeUndefined();
    expect(renderers.resolve({
      type: 'workspace-media-gallery',
      title: 'Media',
    } as PanelContent)?.surfaceId).toBe('conflicting-media');
  });

  it('reactivates the singleton registries after the active lifecycle is disposed', () => {
    const first = ensureFirstPartyCanvasSurfacesRegistered();
    expect(first.status).toBe('active');
    first.dispose();

    const second = ensureFirstPartyCanvasSurfacesRegistered();
    expect(second.status).toBe('active');
    expect(second).not.toBe(first);
  });

  it('keeps the builtin surface resolvable through open, workspace restore, and unload', async () => {
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
    switchAgentCanvasWorkspace(null, 'workspace-a');

    await expect(service.open({
      surfaceId: WORKSPACE_MEDIA_SURFACE_ID,
      source: 'canvas-control',
      workspace: {
        status: 'ready',
        workspaceId: 'workspace-a',
        workspacePath: 'C:/work-a',
        backend: 'local',
      },
      input: undefined,
      idempotencyKey: 'open-workspace-a',
    })).resolves.toMatchObject({ status: 'opened' });

    switchAgentCanvasWorkspace('workspace-a', 'workspace-b');
    switchAgentCanvasWorkspace('workspace-b', 'workspace-a');
    const restored = useAgentCanvasStore.getState().primaryGroup.tabs[0].content;
    expect(restored.metadata).toMatchObject({
      canvasSurfaceId: WORKSPACE_MEDIA_SURFACE_ID,
      canvasWorkspaceId: 'workspace-a',
    });
    expect(renderers.resolve(restored)?.surfaceId).toBe(WORKSPACE_MEDIA_SURFACE_ID);

    activation.dispose();
    expect(surfaces.resolve(WORKSPACE_MEDIA_SURFACE_ID)).toBeUndefined();
    expect(renderers.resolve(restored)).toBeUndefined();
  });
});
