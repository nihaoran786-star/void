import { describe, expect, it, vi } from 'vitest';

import {
  CustomizationRuntimeCapabilityService,
  type CustomizationRuntimeCapability,
} from './CustomizationRuntimeCapabilityService';

const CAPABILITIES: CustomizationRuntimeCapability[] = [
  'catalog_read',
  'agent_management',
  'skill_management',
  'team_management',
  'team_package_install',
  'persona_activation',
];

describe('CustomizationRuntimeCapabilityService', () => {
  it('exposes all customization runtime capabilities through Tauri', () => {
    const detector = vi.fn(() => true);
    const service = new CustomizationRuntimeCapabilityService(detector);

    for (const capability of CAPABILITIES) {
      expect(service.getCapability(capability)).toEqual({
        status: 'supported',
        transport: 'tauri',
      });
    }
    expect(detector).toHaveBeenCalledTimes(CAPABILITIES.length);
  });

  it('fails closed with an explicit deferred-server reason in browsers', () => {
    const service = new CustomizationRuntimeCapabilityService(() => false);

    for (const capability of CAPABILITIES) {
      expect(service.getCapability(capability)).toEqual({
        status: 'unsupported',
        transport: 'websocket',
        reason: 'server_runtime_deferred',
      });
    }
  });
});
