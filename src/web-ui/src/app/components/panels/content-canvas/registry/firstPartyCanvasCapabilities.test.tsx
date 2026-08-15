import { describe, expect, it } from 'vitest';

import { CanvasCapabilityContributionRegistry } from './CanvasCapabilityContributionRegistry';
import {
  ensureFirstPartyCanvasCapabilitiesRegistered,
  registerFirstPartyCanvasCapabilities,
  SHORT_DRAMA_SURFACE_ID,
  WORKSPACE_MEDIA_SURFACE_ID,
} from './firstPartyCanvasCapabilities';

describe('registerFirstPartyCanvasCapabilities', () => {
  it('activates and disposes the Short Drama and Workspace Media presentations together', () => {
    const registry = new CanvasCapabilityContributionRegistry();

    const activation = registerFirstPartyCanvasCapabilities(registry);

    expect(activation.status).toBe('active');
    expect(registry.resolveByCapabilityId('short-drama')).toMatchObject({
      surfaceId: SHORT_DRAMA_SURFACE_ID,
      labelKey: 'layout.sessionCapabilities.shortDrama',
    });
    expect(registry.resolveByCapabilityId('workspace-media')).toMatchObject({
      surfaceId: WORKSPACE_MEDIA_SURFACE_ID,
      labelKey: 'layout.sessionCapabilities.workspaceMedia',
    });
    expect(registry.resolveBySurfaceId(SHORT_DRAMA_SURFACE_ID)?.capabilityId).toBe('short-drama');
    expect(registry.resolveBySurfaceId(WORKSPACE_MEDIA_SURFACE_ID)?.capabilityId).toBe('workspace-media');

    activation.dispose();
    expect(registry.resolveByCapabilityId('short-drama')).toBeUndefined();
    expect(registry.resolveByCapabilityId('workspace-media')).toBeUndefined();
  });

  it('rolls back Short Drama when the Workspace Media presentation conflicts', () => {
    const registry = new CanvasCapabilityContributionRegistry();
    registry.register({
      capabilityId: 'workspace-media',
      surfaceId: 'conflicting-media-surface',
      pluginVersion: '1.0.0',
      registrationKey: 'test.conflicting-media-capability.v1',
      labelKey: 'test.workspaceMedia',
      Icon: () => null,
    });

    const activation = registerFirstPartyCanvasCapabilities(registry);

    expect(activation.status).toBe('conflict');
    expect(registry.resolveByCapabilityId('short-drama')).toBeUndefined();
    expect(registry.resolveByCapabilityId('workspace-media')?.surfaceId).toBe(
      'conflicting-media-surface',
    );
  });

  it('reactivates the singleton registry after the active lifecycle is disposed', () => {
    const first = ensureFirstPartyCanvasCapabilitiesRegistered();
    expect(first.status).toBe('active');
    first.dispose();

    const second = ensureFirstPartyCanvasCapabilitiesRegistered();
    expect(second.status).toBe('active');
    expect(second).not.toBe(first);
    second.dispose();
  });
});
