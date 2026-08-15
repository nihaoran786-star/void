import React from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasCapabilityContributionRegistry } from './CanvasCapabilityContributionRegistry';

const TestIcon: React.FC<{ size?: string | number }> = () => null;

describe('CanvasCapabilityContributionRegistry', () => {
  it('resolves one idempotent contribution by capability and surface until all registrations dispose', () => {
    const registry = new CanvasCapabilityContributionRegistry();
    const contribution = {
      capabilityId: 'short-drama',
      surfaceId: 'short-drama',
      pluginVersion: '1.0.0',
      registrationKey: 'test.short-drama.capability.v1',
      labelKey: 'layout.sessionCapabilities.shortDrama',
      Icon: TestIcon,
    };

    const first = registry.register(contribution);
    const second = registry.register(contribution);

    expect(first.status).toBe('registered');
    expect(second.status).toBe('already_registered');
    expect(registry.resolveByCapabilityId('short-drama')).toBe(contribution);
    expect(registry.resolveBySurfaceId('short-drama')).toBe(contribution);

    first.dispose();
    expect(registry.resolveByCapabilityId('short-drama')).toBe(contribution);
    second.dispose();
    expect(registry.resolveByCapabilityId('short-drama')).toBeUndefined();
    expect(registry.resolveBySurfaceId('short-drama')).toBeUndefined();
  });

  it('rejects capability and surface ownership conflicts without replacing the active contribution', () => {
    const registry = new CanvasCapabilityContributionRegistry();
    const contribution = {
      capabilityId: 'short-drama',
      surfaceId: 'short-drama',
      pluginVersion: '1.0.0',
      registrationKey: 'test.short-drama.capability.v1',
      labelKey: 'layout.sessionCapabilities.shortDrama',
      Icon: TestIcon,
    };
    registry.register(contribution);

    expect(registry.register({
      ...contribution,
      surfaceId: 'other-surface',
      registrationKey: 'test.conflicting-capability.v1',
    }).status).toBe('conflict');
    expect(registry.register({
      ...contribution,
      capabilityId: 'other-capability',
      registrationKey: 'test.conflicting-surface.v1',
    }).status).toBe('conflict');
    expect(registry.resolveByCapabilityId('short-drama')).toBe(contribution);
    expect(registry.resolveBySurfaceId('short-drama')).toBe(contribution);
  });

  it('rejects a semantically different alias set under the same registration identity', () => {
    const registry = new CanvasCapabilityContributionRegistry();
    const contribution = {
      capabilityId: 'short-drama',
      surfaceId: 'short-drama',
      pluginVersion: '1.0.0',
      registrationKey: 'test.short-drama.capability.v1',
      labelKey: 'layout.sessionCapabilities.shortDrama',
      Icon: TestIcon,
      legacyContentTypes: ['short-drama-center'],
    };
    registry.register(contribution);

    const conflicting = registry.register({
      ...contribution,
      legacyContentTypes: ['renamed-short-drama-center'],
    });

    expect(conflicting.status).toBe('conflict');
    expect(registry.resolveByLegacyContentType('short-drama-center')).toBe(contribution);
    expect(registry.resolveByLegacyContentType('renamed-short-drama-center')).toBeUndefined();
  });

  it('rejects changed presentation or availability policy under the same registration identity', () => {
    const registry = new CanvasCapabilityContributionRegistry();
    const availability = () => true;
    const contribution = {
      capabilityId: 'short-drama',
      surfaceId: 'short-drama',
      pluginVersion: '1.0.0',
      registrationKey: 'test.short-drama.capability.v1',
      labelKey: 'layout.sessionCapabilities.shortDrama',
      Icon: TestIcon,
      isAvailableForSession: availability,
    };
    registry.register(contribution);

    expect(registry.register({
      ...contribution,
      labelKey: 'layout.sessionCapabilities.changed',
    }).status).toBe('conflict');
    expect(registry.register({
      ...contribution,
      isAvailableForSession: () => true,
    }).status).toBe('conflict');
  });
});
