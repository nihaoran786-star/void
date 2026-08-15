import { beforeEach, describe, expect, it } from 'vitest';

import type { CanvasHostOpenRequest } from '@/shared/services/canvas/CanvasSurfaceContracts';
import { useAgentCanvasStore } from '../stores/canvasStore';
import { createCanvasStoreHostAdapter } from './CanvasStoreHostAdapter';

function createHost(
  isRequestCurrent: (request: CanvasHostOpenRequest) => boolean = () => true,
) {
  return createCanvasStoreHostAdapter({
    ...useAgentCanvasStore.getState(),
    isRequestCurrent,
  });
}

const mediaRequest: CanvasHostOpenRequest = {
  surfaceId: 'workspace-media',
  instanceKey: 'workspace-media:workspace-1',
  workspace: {
    status: 'ready',
    workspaceId: 'workspace-1',
    workspacePath: 'C:/work',
    backend: 'local',
  },
  source: 'canvas-control',
  legacyContentType: 'workspace-media-gallery',
  title: 'Media',
  data: { workspacePath: 'C:/work' },
};

describe('createCanvasStoreHostAdapter', () => {
  beforeEach(() => {
    useAgentCanvasStore.getState().reset();
  });

  it('opens a legacy surface in the current Canvas store with typed instance metadata', async () => {
    const host = createHost();

    const result = await host.open(mediaRequest);

    expect(result).toMatchObject({ status: 'opened' });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({
          type: 'workspace-media-gallery',
          data: { workspacePath: 'C:/work' },
          metadata: expect.objectContaining({
            canvasSurfaceId: 'workspace-media',
            canvasSurfaceInstanceKey: 'workspace-media:workspace-1',
            canvasWorkspaceId: 'workspace-1',
          }),
        }),
      }),
    ]);
  });

  it('focuses a hidden typed instance and updates its presentation facts', async () => {
    const canvas = useAgentCanvasStore.getState();
    const host = createHost();
    const opened = await host.open(mediaRequest);
    expect(opened.status).toBe('opened');
    if (opened.status === 'error') return;
    const instance = host.findInstance(mediaRequest.instanceKey, mediaRequest);
    expect(instance).toBeDefined();
    canvas.hideTab(opened.instanceId, 'primary');

    await expect(host.focus(opened.instanceId)).resolves.toEqual({
      status: 'focused',
      instanceId: opened.instanceId,
    });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs[0].isHidden).toBe(false);

    await expect(host.update(opened.instanceId, {
      ...mediaRequest,
      source: 'restore',
      title: 'Updated Media',
    })).resolves.toEqual({
      status: 'updated',
      instanceId: opened.instanceId,
    });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs[0].content).toMatchObject({
      title: 'Updated Media',
      metadata: { canvasSurfaceSource: 'restore' },
    });
  });

  it('does not resolve a typed instance owned by another surface or workspace', () => {
    const canvas = useAgentCanvasStore.getState();
    canvas.addTab({
      type: 'canvas-surface',
      title: 'Foreign',
      metadata: {
        canvasSurfaceInstanceKey: mediaRequest.instanceKey,
        canvasSurfaceId: 'foreign-surface',
        canvasWorkspaceId: 'foreign-workspace',
      },
    }, 'active', 'primary');
    const host = createHost();

    expect(host.findInstance(mediaRequest.instanceKey, mediaRequest)).toBeUndefined();
  });

  it('does not claim an unrelated legacy tab with a colliding duplicate key', () => {
    const canvas = useAgentCanvasStore.getState();
    canvas.addTab({
      type: 'code-editor',
      title: 'Code',
      metadata: { duplicateCheckKey: 'workspace-media:C:/work' },
    }, 'active', 'primary');
    const host = createHost();

    expect(host.findInstance(mediaRequest.instanceKey, {
      ...mediaRequest,
      metadata: { duplicateCheckKey: 'workspace-media:C:/work' },
    })).toBeUndefined();
  });

  it('does not use legacy duplicate matching without an explicit legacy content type', () => {
    const canvas = useAgentCanvasStore.getState();
    canvas.addTab({
      type: 'workspace-media-gallery',
      title: 'Legacy media',
      metadata: { duplicateCheckKey: 'workspace-media:C:/work' },
    }, 'active', 'primary');
    const host = createHost();
    const request: CanvasHostOpenRequest = {
      surfaceId: 'generic-surface',
      instanceKey: 'generic-surface:workspace-1',
      workspace: mediaRequest.workspace,
      source: 'canvas-control',
      title: 'Generic surface',
      metadata: { duplicateCheckKey: 'workspace-media:C:/work' },
    };

    expect(host.findInstance(request.instanceKey, request)).toBeUndefined();
  });

  it('rejects a request whose workspace is no longer the current host scope', async () => {
    let currentWorkspaceId = 'workspace-b';
    const host = createHost(request => (
      request.workspace.workspaceId === currentWorkspaceId
    ));

    await expect(host.open(mediaRequest)).resolves.toMatchObject({
      status: 'error',
      error: { code: 'host-failed' },
    });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);

    currentWorkspaceId = 'workspace-1';
    await expect(host.open(mediaRequest)).resolves.toMatchObject({ status: 'opened' });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
  });

  it('rejects a request after the Canvas host has unmounted', async () => {
    let mounted = true;
    const host = createHost(() => mounted);
    mounted = false;

    await expect(host.open(mediaRequest)).resolves.toMatchObject({
      status: 'error',
      error: { code: 'host-failed' },
    });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);
  });
});
