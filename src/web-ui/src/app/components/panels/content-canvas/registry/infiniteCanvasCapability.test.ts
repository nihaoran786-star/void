import { beforeEach, describe, expect, it } from 'vitest';

import { CanvasCapabilityContributionRegistry } from './CanvasCapabilityContributionRegistry';
import { registerFirstPartyCanvasCapabilities } from './firstPartyCanvasCapabilities';

describe('infinite-canvas capability registration', () => {
  let registry: CanvasCapabilityContributionRegistry;

  beforeEach(() => {
    registry = new CanvasCapabilityContributionRegistry();
  });

  it('registers infinite-canvas alongside the other first-party capabilities', () => {
    const activation = registerFirstPartyCanvasCapabilities(registry);

    expect(activation.status).toBe('active');
    expect(registry.resolveByCapabilityId('infinite-canvas')?.surfaceId)
      .toBe('infinite-canvas');
  });

  it('disposes symmetrically with the whole first-party batch', () => {
    const activation = registerFirstPartyCanvasCapabilities(registry);
    if (activation.status !== 'active') throw new Error('expected active');

    activation.dispose();

    expect(registry.resolveByCapabilityId('infinite-canvas')).toBeUndefined();
  });

  it('claims no legacy content type, so it cannot capture an existing panel', () => {
    registerFirstPartyCanvasCapabilities(registry);

    const contribution = registry.resolveByCapabilityId('infinite-canvas');
    expect(contribution?.legacyContentTypes ?? []).toEqual([]);
  });

  it('is only available for a media parent session in phase 1', () => {
    registerFirstPartyCanvasCapabilities(registry);
    const contribution = registry.resolveByCapabilityId('infinite-canvas');

    expect(contribution?.isAvailableForSession?.({
      mode: 'media', sessionKind: 'normal',
    })).toBe(true);
    expect(contribution?.isAvailableForSession?.({
      mode: 'Media', sessionKind: 'normal',
    })).toBe(true);
    expect(contribution?.isAvailableForSession?.({
      mode: 'chat', sessionKind: 'normal',
    })).toBe(false);
    expect(contribution?.isAvailableForSession?.({
      mode: 'media', sessionKind: 'subagent',
    })).toBe(false);
    expect(contribution?.isAvailableForSession?.({})).toBe(false);
  });
});
