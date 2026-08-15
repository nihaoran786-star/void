import { describe, expect, it, vi } from 'vitest';

import type {
  CanvasSurfaceCommandHost,
  CanvasSurfaceOpenRequest,
} from './CanvasSurfaceContracts';
import { CanvasSurfaceCommandService } from './CanvasSurfaceCommandService';

describe('CanvasSurfaceCommandService', () => {
  it('routes an intent through the matching host with its authoritative workspace facts', async () => {
    const hostWorkspace = {
      status: 'ready' as const,
      workspaceId: 'workspace-1',
      workspacePath: 'C:/work',
      backend: 'local' as const,
    };
    const opened: CanvasSurfaceOpenRequest[] = [];
    const host: CanvasSurfaceCommandHost = {
      hostId: 'session-canvas',
      workspace: hostWorkspace,
      activeSessionId: 'session-1',
      open: vi.fn(async request => {
        opened.push(request);
        return { status: 'opened', instanceId: 'tab-media-1' };
      }),
    };
    const service = new CanvasSurfaceCommandService();
    service.registerHost(host);

    const result = await service.open({
      surfaceId: 'workspace-media',
      source: 'capability-rail',
      input: { filter: 'video' },
      idempotencyKey: 'open-media-1',
      sourceSessionId: 'session-1',
      target: {
        status: 'ready',
        hostId: 'session-canvas',
        workspaceId: 'workspace-1',
        workspacePath: 'c:\\work\\',
        backend: 'local',
      },
    });

    expect(result).toEqual({ status: 'opened', instanceId: 'tab-media-1' });
    expect(opened).toEqual([{
      surfaceId: 'workspace-media',
      source: 'capability-rail',
      input: { filter: 'video' },
      idempotencyKey: 'open-media-1',
      sourceSessionId: 'session-1',
      workspace: hostWorkspace,
    }]);
  });

  it('rejects a conflicting host without replacing the registered owner', async () => {
    const workspace = {
      status: 'ready' as const,
      workspaceId: 'workspace-1',
      workspacePath: 'C:/work',
      backend: 'local' as const,
    };
    const firstHost: CanvasSurfaceCommandHost = {
      hostId: 'session-canvas',
      workspace,
      open: vi.fn(async () => ({ status: 'opened', instanceId: 'first-tab' })),
    };
    const conflictingHost: CanvasSurfaceCommandHost = {
      hostId: 'session-canvas',
      workspace,
      open: vi.fn(async () => ({ status: 'opened', instanceId: 'second-tab' })),
    };
    const service = new CanvasSurfaceCommandService();

    const registration = service.registerHost(firstHost);
    const conflict = service.registerHost(conflictingHost);
    conflict.dispose();
    conflict.dispose();

    expect(registration.status).toBe('registered');
    expect(conflict.status).toBe('conflict');
    await expect(service.open({
      surfaceId: 'workspace-media',
      source: 'canvas-control',
      input: {},
      idempotencyKey: 'owner-check',
      target: {
        status: 'ready',
        hostId: 'session-canvas',
        workspaceId: 'workspace-1',
        workspacePath: 'C:/work',
        backend: 'local',
      },
    })).resolves.toEqual({ status: 'opened', instanceId: 'first-tab' });
    expect(conflictingHost.open).not.toHaveBeenCalled();

    registration.dispose();
    registration.dispose();
    expect(service.registerHost(conflictingHost).status).toBe('registered');
  });

  it('classifies a thrown host failure without leaking a rejected command', async () => {
    const workspace = {
      status: 'ready' as const,
      workspaceId: 'workspace-1',
      workspacePath: 'C:/work',
      backend: 'local' as const,
    };
    const service = new CanvasSurfaceCommandService();
    service.registerHost({
      hostId: 'session-canvas',
      workspace,
      activeSessionId: 'session-1',
      open: vi.fn(async () => {
        throw new Error('canvas store unavailable');
      }),
    });

    const result = await service.open({
      surfaceId: 'short-drama',
      source: 'capability-rail',
      input: {},
      idempotencyKey: 'open-drama-1',
      sourceSessionId: 'session-1',
      target: {
        status: 'ready',
        hostId: 'session-canvas',
        workspaceId: 'workspace-1',
        workspacePath: 'C:/work',
        backend: 'local',
      },
    });

    expect(result).toMatchObject({
      status: 'error',
      error: {
        code: 'host-failed',
        cause: expect.any(Error),
      },
    });
  });

  it.each([
    {
      name: 'host id',
      hostId: '   ',
      workspaceId: 'workspace-1',
      workspacePath: 'C:/work',
    },
    {
      name: 'workspace id',
      hostId: 'session-canvas',
      workspaceId: '   ',
      workspacePath: 'C:/work',
    },
    {
      name: 'workspace path',
      hostId: 'session-canvas',
      workspaceId: 'workspace-1',
      workspacePath: '   ',
    },
  ])('rejects an empty target $name before invoking a host', async ({
    hostId,
    workspaceId,
    workspacePath,
  }) => {
    const open = vi.fn(async () => ({ status: 'opened' as const, instanceId: 'unexpected' }));
    const service = new CanvasSurfaceCommandService();
    service.registerHost({
      hostId,
      workspace: {
        status: 'ready',
        workspaceId,
        workspacePath,
        backend: 'local',
      },
      open,
    });

    const result = await service.open({
      surfaceId: 'short-drama',
      source: 'capability-rail',
      input: {},
      idempotencyKey: 'invalid-target',
      target: {
        status: 'ready',
        hostId,
        workspaceId,
        workspacePath,
        backend: 'local',
      },
    });

    expect(result).toMatchObject({ status: 'unavailable' });
    expect(open).not.toHaveBeenCalled();
  });

  it('fails closed for unavailable, unregistered, and mismatched command targets', async () => {
    const open = vi.fn(async () => ({ status: 'opened' as const, instanceId: 'unexpected' }));
    const service = new CanvasSurfaceCommandService();
    service.registerHost({
      hostId: 'session-canvas',
      workspace: {
        status: 'ready',
        workspaceId: 'workspace-1',
        workspacePath: 'C:/work',
        backend: 'local',
      },
      open,
    });
    const intent = {
      surfaceId: 'short-drama',
      source: 'capability-rail' as const,
      input: {},
      idempotencyKey: 'scope-check',
    };

    await expect(service.open({
      ...intent,
      target: { status: 'unavailable', reason: 'no active Canvas host' },
    })).resolves.toEqual({ status: 'unavailable', reason: 'no active Canvas host' });
    await expect(service.open({
      ...intent,
      target: {
        status: 'ready',
        hostId: 'missing-canvas',
        workspaceId: 'workspace-1',
        workspacePath: 'C:/work',
        backend: 'local',
      },
    })).resolves.toMatchObject({ status: 'unavailable' });
    await expect(service.open({
      ...intent,
      target: {
        status: 'ready',
        hostId: 'session-canvas',
        workspaceId: 'workspace-2',
        workspacePath: 'C:/work',
        backend: 'local',
      },
    })).resolves.toMatchObject({ status: 'unavailable' });
    await expect(service.open({
      ...intent,
      target: {
        status: 'ready',
        hostId: 'session-canvas',
        workspaceId: 'workspace-1',
        workspacePath: 'C:/other',
        backend: 'local',
      },
    })).resolves.toMatchObject({ status: 'unavailable' });

    expect(open).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'local target into a remote host',
      target: {
        status: 'ready' as const,
        hostId: 'session-canvas',
        workspaceId: 'workspace-1',
        workspacePath: '/srv/work',
        backend: 'local' as const,
      },
    },
    {
      name: 'another remote connection into the same remote workspace',
      target: {
        status: 'ready' as const,
        hostId: 'session-canvas',
        workspaceId: 'workspace-1',
        workspacePath: '/srv/work',
        backend: 'remote' as const,
        remoteConnectionId: 'remote-b',
      },
    },
  ])('rejects $name before invoking the host', async ({ target }) => {
    const open = vi.fn(async () => ({ status: 'opened' as const, instanceId: 'unexpected' }));
    const service = new CanvasSurfaceCommandService();
    service.registerHost({
      hostId: 'session-canvas',
      workspace: {
        status: 'ready',
        workspaceId: 'workspace-1',
        workspacePath: '/srv/work',
        backend: 'remote',
        remoteConnectionId: 'remote-a',
      },
      open,
    });

    await expect(service.open({
      surfaceId: 'workspace-media',
      source: 'capability-rail',
      input: undefined,
      idempotencyKey: 'remote-route-mismatch',
      target,
    })).resolves.toMatchObject({ status: 'unavailable' });
    expect(open).not.toHaveBeenCalled();
  });

  it('rejects an obsolete delivery revision before invoking the registered host', async () => {
    const open = vi.fn(async () => ({ status: 'opened' as const, instanceId: 'current-tab' }));
    const service = new CanvasSurfaceCommandService();
    service.registerHost({
      hostId: 'session-canvas',
      workspace: {
        status: 'ready',
        workspaceId: 'workspace-1',
        workspacePath: 'C:/work',
        backend: 'local',
      },
      activeSessionId: 'session-1',
      open,
    });
    const staleActivation = service.activateDeliveryScope({
      scopeId: 'team-canvas:session-1',
      revision: 'binding-a',
    });
    const currentActivation = service.activateDeliveryScope({
      scopeId: 'team-canvas:session-1',
      revision: 'binding-b',
    });

    const staleResult = await service.open({
      surfaceId: 'short-drama',
      source: 'restore',
      input: undefined,
      idempotencyKey: 'restore-binding-a',
      sourceSessionId: 'session-1',
      deliveryScope: staleActivation.deliveryScope,
      target: {
        status: 'ready',
        hostId: 'session-canvas',
        workspaceId: 'workspace-1',
        workspacePath: 'C:/work',
        backend: 'local',
      },
    });

    expect(staleResult).toMatchObject({ status: 'unavailable' });
    expect(open).not.toHaveBeenCalled();

    staleActivation.dispose();
    await expect(service.open({
      surfaceId: 'short-drama',
      source: 'restore',
      input: undefined,
      idempotencyKey: 'restore-binding-b',
      sourceSessionId: 'session-1',
      deliveryScope: currentActivation.deliveryScope,
      target: {
        status: 'ready',
        hostId: 'session-canvas',
        workspaceId: 'workspace-1',
        workspacePath: 'C:/work',
        backend: 'local',
      },
    })).resolves.toEqual({ status: 'opened', instanceId: 'current-tab' });
    expect(open).toHaveBeenCalledTimes(1);
    currentActivation.dispose();
  });
});
