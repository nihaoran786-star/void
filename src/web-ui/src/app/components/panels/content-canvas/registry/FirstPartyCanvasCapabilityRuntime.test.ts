import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activateFirstPartyCanvasDeliveryScope,
  isFirstPartyCanvasCapabilityAvailableForSession,
  openFirstPartyCanvasCapability,
} from './FirstPartyCanvasCapabilityRuntime';
import { canvasSurfaceCommandService } from './CanvasSurfaceCommandRuntime';
import { ensureFirstPartyCanvasCapabilitiesRegistered } from './firstPartyCanvasCapabilities';

describe('FirstPartyCanvasCapabilityRuntime', () => {
  afterEach(() => {
    ensureFirstPartyCanvasCapabilitiesRegistered().dispose();
  });

  it('fails closed for unknown capabilities during availability checks', () => {
    expect(isFirstPartyCanvasCapabilityAvailableForSession(
      'unknown-capability',
      { mode: 'media', sessionKind: 'normal' },
    )).toBe(false);
    expect(isFirstPartyCanvasCapabilityAvailableForSession(
      'short-drama',
      { mode: 'media', sessionKind: 'normal' },
    )).toBe(true);
    expect(isFirstPartyCanvasCapabilityAvailableForSession(
      'short-drama',
      { mode: 'agent', sessionKind: 'normal' },
    )).toBe(false);
  });

  it('returns an incompatible command result for an unknown capability', async () => {
    await expect(openFirstPartyCanvasCapability({
      capabilityId: 'unknown-capability',
      source: 'capability-rail',
      input: undefined,
      idempotencyKey: 'unknown-capability-open',
      sourceSessionId: 'session-1',
      target: {
        status: 'ready',
        hostId: 'agent',
        workspaceId: 'workspace-1',
        workspacePath: 'C:/workspace',
        backend: 'local',
      },
    })).resolves.toEqual({
      status: 'incompatible',
      reason: 'Canvas capability "unknown-capability" is not registered.',
    });
  });

  it('forwards a current typed delivery scope to the Canvas host', async () => {
    const open = vi.fn(async () => ({
      status: 'opened' as const,
      instanceId: 'short-drama-tab',
    }));
    const hostRegistration = canvasSurfaceCommandService.registerHost({
      hostId: 'delivery-scope-host',
      workspace: {
        status: 'ready',
        workspaceId: 'workspace-1',
        workspacePath: 'C:/workspace',
        backend: 'local',
      },
      activeSessionId: 'session-1',
      open,
    });
    const scopeActivation = activateFirstPartyCanvasDeliveryScope({
      scopeId: 'team-canvas-restore:session-1',
      revision: 'binding-1',
    });
    const { deliveryScope } = scopeActivation;

    try {
      await expect(openFirstPartyCanvasCapability({
        capabilityId: 'short-drama',
        source: 'restore',
        input: undefined,
        idempotencyKey: 'restore-binding-1',
        sourceSessionId: 'session-1',
        deliveryScope,
        target: {
          status: 'ready',
          hostId: 'delivery-scope-host',
          workspaceId: 'workspace-1',
          workspacePath: 'C:/workspace',
          backend: 'local',
        },
      })).resolves.toEqual({
        status: 'opened',
        instanceId: 'short-drama-tab',
      });
      expect(open).toHaveBeenCalledWith(expect.objectContaining({ deliveryScope }));
    } finally {
      scopeActivation.dispose();
      hostRegistration.dispose();
    }
  });
});
