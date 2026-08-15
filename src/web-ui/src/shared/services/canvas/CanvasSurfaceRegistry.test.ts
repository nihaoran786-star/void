import { describe, expect, it } from 'vitest';

import type { CanvasSurfaceRegistration } from './CanvasSurfaceContracts';
import { CanvasSurfaceRegistry } from './CanvasSurfaceRegistry';

describe('CanvasSurfaceRegistry', () => {
  it('resolves a registered surface until its idempotent disposer releases it', () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceRegistration>();
    const definition = {
      surfaceId: 'workspace-media',
      pluginVersion: '1.0.0',
      registrationKey: 'builtin.workspace-media.v1',
    } satisfies CanvasSurfaceRegistration;

    const registration = registry.register(definition);

    expect(registration.status).toBe('registered');
    expect(registry.resolve('workspace-media')).toBe(definition);

    registration.dispose();
    registration.dispose();

    expect(registry.resolve('workspace-media')).toBeUndefined();
  });

  it('reference-counts equivalent registrations before removing the definition', () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceRegistration>();
    const definition = {
      surfaceId: 'agent-studio',
      pluginVersion: '1.0.0',
      registrationKey: 'plugin.agent-studio.v1',
    } satisfies CanvasSurfaceRegistration;

    const first = registry.register(definition);
    const second = registry.register({ ...definition });

    expect(first.status).toBe('registered');
    expect(second.status).toBe('already_registered');
    first.dispose();
    expect(registry.resolve(definition.surfaceId)).toBe(definition);
    second.dispose();
    expect(registry.resolve(definition.surfaceId)).toBeUndefined();
  });

  it('rejects conflicting ownership without overwriting the active definition', () => {
    const registry = new CanvasSurfaceRegistry<CanvasSurfaceRegistration>();
    const owner = {
      surfaceId: 'workspace-media',
      pluginVersion: '1.0.0',
      registrationKey: 'builtin.workspace-media.v1',
    } satisfies CanvasSurfaceRegistration;
    registry.register(owner);

    const conflict = registry.register({
      ...owner,
      pluginVersion: '2.0.0',
      registrationKey: 'plugin.takeover.v2',
    });

    expect(conflict).toMatchObject({
      status: 'conflict',
      surfaceId: 'workspace-media',
    });
    expect(registry.resolve('workspace-media')).toBe(owner);
    conflict.dispose();
    expect(registry.resolve('workspace-media')).toBe(owner);
  });
});
