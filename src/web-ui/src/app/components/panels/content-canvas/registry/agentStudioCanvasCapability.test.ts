import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CanvasCapabilityContributionRegistry,
  type CanvasCapabilityContribution,
} from './CanvasCapabilityContributionRegistry';
import { resolveCanvasCapabilityInput } from './canvasCapabilityInput';

const BASE: CanvasCapabilityContribution = {
  capabilityId: 'test-capability',
  surfaceId: 'test-surface',
  pluginVersion: '1.0.0',
  registrationKey: 'test.capability.v1',
  labelKey: 'layout.sessionCapabilities.shortDrama',
  Icon: () => null,
};

describe('canvas capability input resolution', () => {
  it('passes a caller-supplied input straight through', async () => {
    const result = await resolveCanvasCapabilityInput(BASE, { definitionId: 'explicit' }, {});

    expect(result).toEqual({ status: 'resolved', input: { definitionId: 'explicit' } });
  });

  it('leaves input undefined for a contribution that derives nothing', async () => {
    const result = await resolveCanvasCapabilityInput(BASE, undefined, {});

    expect(result).toEqual({ status: 'resolved', input: undefined });
  });

  it('asks the contribution to derive its own input from session context', async () => {
    const resolveInput = vi.fn(async () => ({
      status: 'resolved' as const,
      input: { definitionId: 'derived-1' },
    }));

    const result = await resolveCanvasCapabilityInput(
      { ...BASE, resolveInput },
      undefined,
      { sourceSessionId: 'session-1', personaId: 'user::void::alpha' },
    );

    expect(result).toEqual({ status: 'resolved', input: { definitionId: 'derived-1' } });
    expect(resolveInput).toHaveBeenCalledWith({
      sourceSessionId: 'session-1',
      personaId: 'user::void::alpha',
    });
  });

  it('prefers an explicit caller input over the derived one', async () => {
    const resolveInput = vi.fn(async () => ({
      status: 'resolved' as const,
      input: { definitionId: 'derived-1' },
    }));

    const result = await resolveCanvasCapabilityInput(
      { ...BASE, resolveInput },
      { definitionId: 'explicit' },
      { personaId: 'user::void::alpha' },
    );

    expect(result).toEqual({ status: 'resolved', input: { definitionId: 'explicit' } });
    expect(resolveInput).not.toHaveBeenCalled();
  });

  it('reports an unresolvable capability as unavailable rather than opening an empty surface', async () => {
    const result = await resolveCanvasCapabilityInput(
      {
        ...BASE,
        resolveInput: async () => ({
          status: 'unavailable',
          reason: 'This conversation is not bound to an authored agent.',
        }),
      },
      undefined,
      {},
    );

    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.reason).toContain('not bound');
  });

  it('turns a thrown resolver into explicit state instead of propagating', async () => {
    const result = await resolveCanvasCapabilityInput(
      {
        ...BASE,
        resolveInput: async () => {
          throw new Error('the catalog could not be read');
        },
      },
      undefined,
      {},
    );

    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.reason).toContain('catalog');
  });
});

describe('agent-studio capability registration', () => {
  let registry: CanvasCapabilityContributionRegistry;

  beforeEach(() => {
    registry = new CanvasCapabilityContributionRegistry();
  });

  it('registers agent-studio alongside the other first-party capabilities', async () => {
    const { registerFirstPartyCanvasCapabilities } = await import('./firstPartyCanvasCapabilities');

    const activation = registerFirstPartyCanvasCapabilities(registry);

    expect(activation.status).toBe('active');
    expect(registry.resolveByCapabilityId('agent-studio')?.surfaceId).toBe('agent-studio');
  });

  it('claims no legacy content type, so it cannot capture an existing panel', async () => {
    const { registerFirstPartyCanvasCapabilities } = await import('./firstPartyCanvasCapabilities');
    registerFirstPartyCanvasCapabilities(registry);

    const contribution = registry.resolveByCapabilityId('agent-studio');
    expect(contribution?.legacyContentTypes ?? []).toEqual([]);
  });

  it('is unavailable in a subagent conversation, which has no authored persona of its own', async () => {
    const { registerFirstPartyCanvasCapabilities } = await import('./firstPartyCanvasCapabilities');
    registerFirstPartyCanvasCapabilities(registry);

    const contribution = registry.resolveByCapabilityId('agent-studio');
    expect(contribution?.isAvailableForSession?.({ sessionKind: 'subagent' })).toBe(false);
    expect(contribution?.isAvailableForSession?.({ sessionKind: 'normal' })).toBe(true);
  });

  it('is unavailable when the conversation carries no persona binding', async () => {
    const { registerFirstPartyCanvasCapabilities } = await import('./firstPartyCanvasCapabilities');
    registerFirstPartyCanvasCapabilities(registry);

    const contribution = registry.resolveByCapabilityId('agent-studio');
    const resolution = await contribution?.resolveInput?.({ sourceSessionId: 'session-1' });

    expect(resolution?.status).toBe('unavailable');
  });
});
