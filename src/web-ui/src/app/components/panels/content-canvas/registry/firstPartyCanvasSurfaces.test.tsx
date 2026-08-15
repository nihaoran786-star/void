import { beforeEach, describe, expect, it } from 'vitest';

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
  WORKSPACE_MEDIA_SURFACE_ID,
} from './firstPartyCanvasSurfaces';

describe('registerFirstPartyCanvasSurfaces', () => {
  beforeEach(() => {
    resetAgentCanvasWorkspaceSnapshotsForTests();
    useAgentCanvasStore.getState().reset();
  });

  it('activates and disposes the Workspace Media definition and renderer together', () => {
    const surfaces = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    const renderers = new CanvasSurfaceRendererRegistry();

    const activation = registerFirstPartyCanvasSurfaces(surfaces, renderers);

    expect(activation.status).toBe('active');
    expect(surfaces.resolve(WORKSPACE_MEDIA_SURFACE_ID)).toBeDefined();
    expect(renderers.resolve({
      type: 'workspace-media-gallery',
      title: 'Media',
    } as PanelContent)).toBeDefined();

    activation.dispose();
    expect(surfaces.resolve(WORKSPACE_MEDIA_SURFACE_ID)).toBeUndefined();
    expect(renderers.resolve({
      type: 'workspace-media-gallery',
      title: 'Media',
    } as PanelContent)).toBeUndefined();
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
