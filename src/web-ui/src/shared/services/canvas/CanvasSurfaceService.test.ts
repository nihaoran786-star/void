import { describe, expect, it, vi } from 'vitest';

import type {
  CanvasHostOpenRequest,
  CanvasHostPort,
  CanvasSurfaceDefinition,
  CanvasWorkspaceFacts,
} from './CanvasSurfaceContracts';
import { CanvasSurfaceRegistry } from './CanvasSurfaceRegistry';
import { CanvasSurfaceService } from './CanvasSurfaceService';

const workspace: CanvasWorkspaceFacts = {
  status: 'ready',
  workspaceId: 'workspace-1',
  workspacePath: 'C:/work',
  backend: 'local',
};

describe('CanvasSurfaceService', () => {
  it('opens a registered surface through the host using validated workspace facts', async () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    registry.register({
      surfaceId: 'workspace-media',
      pluginVersion: '1.0.0',
      registrationKey: 'builtin.workspace-media.v1',
      legacyContentType: 'workspace-media-gallery',
      validateInput: input => (
        typeof input === 'object' && input !== null
          ? { status: 'valid', value: input }
          : { status: 'invalid', reason: 'input must be an object' }
      ),
      createInstanceKey: context => `workspace-media:${context.workspace.workspaceId}`,
      createPresentation: context => ({
        title: 'Media',
        data: context.input,
        metadata: {
          duplicateCheckKey: `workspace-media:${context.workspace.workspacePath}`,
        },
      }),
    });
    const opened: CanvasHostOpenRequest[] = [];
    const host: CanvasHostPort = {
      findInstance: vi.fn(() => undefined),
      open: vi.fn(async request => {
        opened.push(request);
        return { status: 'opened', instanceId: 'tab-media-1' };
      }),
      focus: vi.fn(async instanceId => ({ status: 'focused', instanceId })),
      update: vi.fn(async instanceId => ({ status: 'updated', instanceId })),
    };

    const result = await new CanvasSurfaceService(registry, host).open({
      surfaceId: 'workspace-media',
      source: 'canvas-control',
      workspace,
      input: { workspacePath: 'C:/work' },
      idempotencyKey: 'media-click-1',
    });

    expect(result).toEqual({ status: 'opened', instanceId: 'tab-media-1' });
    expect(opened).toEqual([{
      surfaceId: 'workspace-media',
      instanceKey: 'workspace-media:workspace-1',
      workspace,
      source: 'canvas-control',
      legacyContentType: 'workspace-media-gallery',
      title: 'Media',
      data: { workspacePath: 'C:/work' },
      metadata: {
        duplicateCheckKey: 'workspace-media:C:/work',
      },
    }]);
  });

  it('coalesces only concurrent deliveries with the same idempotency key', async () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    registry.register({
      surfaceId: 'workspace-media',
      pluginVersion: '1.0.0',
      registrationKey: 'builtin.workspace-media.v1',
      validateInput: input => ({ status: 'valid', value: input }),
      createInstanceKey: context => `workspace-media:${context.workspace.workspaceId}`,
      createPresentation: context => ({ title: 'Media', data: context.input }),
    });
    let finishOpen: ((value: { status: 'opened'; instanceId: string }) => void) | undefined;
    const host: CanvasHostPort = {
      findInstance: vi.fn(() => undefined),
      open: vi.fn(() => new Promise(resolve => {
        finishOpen = resolve;
      })),
      focus: vi.fn(async instanceId => ({ status: 'focused', instanceId })),
      update: vi.fn(async instanceId => ({ status: 'updated', instanceId })),
    };
    const service = new CanvasSurfaceService(registry, host);
    const request = {
      surfaceId: 'workspace-media',
      source: 'restore' as const,
      workspace,
      input: { workspacePath: 'C:/work' },
      idempotencyKey: 'restore-1',
    };

    const first = service.open(request);
    const duplicate = service.open(request);

    expect(host.open).toHaveBeenCalledTimes(1);
    finishOpen?.({ status: 'opened', instanceId: 'tab-media-1' });
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      { status: 'opened', instanceId: 'tab-media-1' },
      { status: 'opened', instanceId: 'tab-media-1' },
    ]);
  });

  it('classifies definition failures before the host boundary', async () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    registry.register({
      surfaceId: 'broken-surface',
      pluginVersion: '1.0.0',
      registrationKey: 'test.broken-surface.v1',
      validateInput: input => ({ status: 'valid', value: input }),
      createInstanceKey: () => {
        throw new Error('bad definition');
      },
      createPresentation: () => ({ title: 'Broken' }),
    });
    const host: CanvasHostPort = {
      findInstance: vi.fn(() => undefined),
      open: vi.fn(async () => ({ status: 'opened', instanceId: 'unexpected' })),
      focus: vi.fn(async instanceId => ({ status: 'focused', instanceId })),
      update: vi.fn(async instanceId => ({ status: 'updated', instanceId })),
    };

    const result = await new CanvasSurfaceService(registry, host).open({
      surfaceId: 'broken-surface',
      source: 'canvas-control',
      workspace,
      input: {},
      idempotencyKey: 'broken-1',
    });

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'definition-failed' },
    });
    expect(host.findInstance).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
  });

  it('rejects unavailable workspace facts before resolving or mutating the host', async () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    const host: CanvasHostPort = {
      findInstance: vi.fn(() => undefined),
      open: vi.fn(async () => ({ status: 'opened', instanceId: 'unexpected' })),
      focus: vi.fn(async instanceId => ({ status: 'focused', instanceId })),
      update: vi.fn(async instanceId => ({ status: 'updated', instanceId })),
    };

    const result = await new CanvasSurfaceService(registry, host).open({
      surfaceId: 'workspace-media',
      source: 'canvas-control',
      workspace: { status: 'unavailable', reason: 'invalid-workspace' },
      input: { workspacePath: 'C:/wrong' },
      idempotencyKey: 'invalid-1',
    });

    expect(result).toEqual({ status: 'unavailable', reason: 'invalid-workspace' });
    expect(host.findInstance).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
  });

  it('returns an incompatible result for invalid definition input without touching the host', async () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    registry.register({
      surfaceId: 'workspace-media',
      pluginVersion: '1.0.0',
      registrationKey: 'builtin.workspace-media.v1',
      validateInput: () => ({ status: 'invalid', reason: 'workspace path mismatch' }),
      createInstanceKey: () => 'unexpected',
      createPresentation: () => ({ title: 'Unexpected' }),
    });
    const host: CanvasHostPort = {
      findInstance: vi.fn(() => undefined),
      open: vi.fn(async () => ({ status: 'opened', instanceId: 'unexpected' })),
      focus: vi.fn(async instanceId => ({ status: 'focused', instanceId })),
      update: vi.fn(async instanceId => ({ status: 'updated', instanceId })),
    };

    const result = await new CanvasSurfaceService(registry, host).open({
      surfaceId: 'workspace-media',
      source: 'background-discovery',
      workspace,
      input: { workspacePath: 'C:/other' },
      idempotencyKey: 'discovery-invalid',
    });

    expect(result).toEqual({ status: 'incompatible', reason: 'workspace path mismatch' });
    expect(host.findInstance).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
  });

  it('does not cache a completed delivery under its idempotency key', async () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    registry.register({
      surfaceId: 'workspace-media',
      pluginVersion: '1.0.0',
      registrationKey: 'builtin.workspace-media.v1',
      validateInput: input => ({ status: 'valid', value: input }),
      createInstanceKey: context => `workspace-media:${context.workspace.workspaceId}`,
      createPresentation: context => ({ title: 'Media', data: context.input }),
    });
    let opened = false;
    const host: CanvasHostPort = {
      findInstance: vi.fn(() => opened ? ({
        instanceId: 'tab-media-1',
        instanceKey: 'workspace-media:workspace-1',
        surfaceId: 'workspace-media',
        workspaceId: 'workspace-1',
      }) : undefined),
      open: vi.fn(async () => {
        opened = true;
        return { status: 'opened', instanceId: 'tab-media-1' };
      }),
      focus: vi.fn(async instanceId => ({ status: 'focused', instanceId })),
      update: vi.fn(async instanceId => ({ status: 'updated', instanceId })),
    };
    const service = new CanvasSurfaceService(registry, host);
    const request = {
      surfaceId: 'workspace-media',
      source: 'capability-rail' as const,
      workspace,
      input: { workspacePath: 'C:/work' },
      idempotencyKey: 'delivered-event-1',
    };

    await expect(service.open(request)).resolves.toEqual({
      status: 'opened',
      instanceId: 'tab-media-1',
    });
    await expect(service.open(request)).resolves.toEqual({
      status: 'focused',
      instanceId: 'tab-media-1',
    });
    expect(host.open).toHaveBeenCalledTimes(1);
    expect(host.focus).toHaveBeenCalledTimes(1);
  });

  it('uses the definition update policy for an existing instance', async () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    registry.register({
      surfaceId: 'agent-studio',
      pluginVersion: '1.0.0',
      registrationKey: 'plugin.agent-studio.v1',
      existingInstanceStrategy: 'update',
      validateInput: input => ({ status: 'valid', value: input }),
      createInstanceKey: context => `agent-studio:${context.workspace.workspaceId}`,
      createPresentation: context => ({ title: 'Agent Studio', data: context.input }),
    });
    const host: CanvasHostPort = {
      findInstance: vi.fn(() => ({
        instanceId: 'tab-agent-studio',
        instanceKey: 'agent-studio:workspace-1',
        surfaceId: 'agent-studio',
        workspaceId: 'workspace-1',
      })),
      open: vi.fn(async () => ({ status: 'opened', instanceId: 'unexpected' })),
      focus: vi.fn(async instanceId => ({ status: 'focused', instanceId })),
      update: vi.fn(async instanceId => ({ status: 'updated', instanceId })),
    };

    const result = await new CanvasSurfaceService(registry, host).open({
      surfaceId: 'agent-studio',
      source: 'canvas-control',
      workspace,
      input: { agentId: 'agent-1' },
      idempotencyKey: 'studio-1',
    });

    expect(result).toEqual({ status: 'updated', instanceId: 'tab-agent-studio' });
    expect(host.update).toHaveBeenCalledWith(
      'tab-agent-studio',
      expect.objectContaining({ instanceKey: 'agent-studio:workspace-1' }),
    );
    expect(host.focus).not.toHaveBeenCalled();
  });

  it('classifies thrown host failures without retrying another host operation', async () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    registry.register({
      surfaceId: 'workspace-media',
      pluginVersion: '1.0.0',
      registrationKey: 'builtin.workspace-media.v1',
      validateInput: input => ({ status: 'valid', value: input }),
      createInstanceKey: context => `workspace-media:${context.workspace.workspaceId}`,
      createPresentation: context => ({ title: 'Media', data: context.input }),
    });
    const host: CanvasHostPort = {
      findInstance: vi.fn(() => {
        throw new Error('store unavailable');
      }),
      open: vi.fn(async () => ({ status: 'opened', instanceId: 'unexpected' })),
      focus: vi.fn(async instanceId => ({ status: 'focused', instanceId })),
      update: vi.fn(async instanceId => ({ status: 'updated', instanceId })),
    };

    const result = await new CanvasSurfaceService(registry, host).open({
      surfaceId: 'workspace-media',
      source: 'restore',
      workspace,
      input: { workspacePath: 'C:/work' },
      idempotencyKey: 'restore-throw',
    });

    expect(result).toMatchObject({ status: 'error', error: { code: 'host-failed' } });
    expect(host.open).not.toHaveBeenCalled();
    expect(host.focus).not.toHaveBeenCalled();
    expect(host.update).not.toHaveBeenCalled();
  });

  it('updates route facts on remote reconnect without changing the stable instance key', async () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    registry.register({
      surfaceId: 'generic-remote-surface',
      pluginVersion: '1.0.0',
      registrationKey: 'test.generic-remote.v1',
      validateInput: input => ({ status: 'valid', value: input }),
      createInstanceKey: context => `generic:${context.workspace.workspaceId}`,
      createPresentation: context => ({ title: 'Remote', data: context.input }),
    });
    const host: CanvasHostPort = {
      findInstance: vi.fn(() => ({
        instanceId: 'tab-remote',
        instanceKey: 'generic:remote-workspace',
        surfaceId: 'generic-remote-surface',
        workspaceId: 'remote-workspace',
        remoteConnectionId: 'connection-old',
      })),
      open: vi.fn(async () => ({ status: 'opened', instanceId: 'unexpected' })),
      focus: vi.fn(async instanceId => ({ status: 'focused', instanceId })),
      update: vi.fn(async instanceId => ({ status: 'updated', instanceId })),
    };
    const remoteWorkspace: CanvasWorkspaceFacts = {
      status: 'ready',
      workspaceId: 'remote-workspace',
      workspacePath: '/srv/app',
      backend: 'remote',
      remoteConnectionId: 'connection-new',
      remoteHost: 'host-a',
    };

    const result = await new CanvasSurfaceService(registry, host).open({
      surfaceId: 'generic-remote-surface',
      source: 'restore',
      workspace: remoteWorkspace,
      input: {},
      idempotencyKey: 'remote-reconnect',
    });

    expect(result).toEqual({ status: 'updated', instanceId: 'tab-remote' });
    expect(host.update).toHaveBeenCalledWith(
      'tab-remote',
      expect.objectContaining({
        instanceKey: 'generic:remote-workspace',
        workspace: remoteWorkspace,
      }),
    );
  });

  it('does not coalesce deliveries routed through different remote connections', async () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    registry.register({
      surfaceId: 'generic-remote-surface',
      pluginVersion: '1.0.0',
      registrationKey: 'test.generic-remote.v1',
      validateInput: input => ({ status: 'valid', value: input }),
      createInstanceKey: context => `generic:${context.workspace.workspaceId}`,
      createPresentation: context => ({ title: 'Remote', data: context.input }),
    });
    const host: CanvasHostPort = {
      findInstance: vi.fn(() => undefined),
      open: vi.fn(async request => ({
        status: 'opened',
        instanceId: request.workspace.backend === 'remote'
          ? request.workspace.remoteConnectionId
          : 'local',
      })),
      focus: vi.fn(async instanceId => ({ status: 'focused', instanceId })),
      update: vi.fn(async instanceId => ({ status: 'updated', instanceId })),
    };
    const service = new CanvasSurfaceService(registry, host);
    const requestBase = {
      surfaceId: 'generic-remote-surface',
      source: 'restore' as const,
      input: {},
      idempotencyKey: 'same-delivery-id',
    };

    await Promise.all([
      service.open({
        ...requestBase,
        workspace: {
          status: 'ready',
          workspaceId: 'remote-workspace',
          workspacePath: '/srv/app',
          backend: 'remote',
          remoteConnectionId: 'connection-old',
        },
      }),
      service.open({
        ...requestBase,
        workspace: {
          status: 'ready',
          workspaceId: 'remote-workspace',
          workspacePath: '/srv/app',
          backend: 'remote',
          remoteConnectionId: 'connection-new',
        },
      }),
    ]);

    expect(host.open).toHaveBeenCalledTimes(2);
  });

  it('rejects a host instance owned by another surface or workspace', async () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceDefinition>();
    registry.register({
      surfaceId: 'workspace-media',
      pluginVersion: '1.0.0',
      registrationKey: 'builtin.workspace-media.v1',
      validateInput: input => ({ status: 'valid', value: input }),
      createInstanceKey: () => 'shared-key',
      createPresentation: () => ({ title: 'Media' }),
    });
    const host: CanvasHostPort = {
      findInstance: vi.fn(() => ({
        instanceId: 'foreign-tab',
        instanceKey: 'shared-key',
        surfaceId: 'foreign-surface',
        workspaceId: 'foreign-workspace',
      })),
      open: vi.fn(async () => ({ status: 'opened', instanceId: 'unexpected' })),
      focus: vi.fn(async instanceId => ({ status: 'focused', instanceId })),
      update: vi.fn(async instanceId => ({ status: 'updated', instanceId })),
    };

    const result = await new CanvasSurfaceService(registry, host).open({
      surfaceId: 'workspace-media',
      source: 'canvas-control',
      workspace,
      input: {},
      idempotencyKey: 'collision',
    });

    expect(result).toMatchObject({ status: 'error', error: { code: 'host-failed' } });
    expect(host.open).not.toHaveBeenCalled();
    expect(host.focus).not.toHaveBeenCalled();
    expect(host.update).not.toHaveBeenCalled();
  });
});
