import { isTauriRuntime } from '@/infrastructure/runtime';

export type CustomizationRuntimeCapability =
  | 'catalog_read'
  | 'agent_management'
  | 'skill_management'
  | 'team_management'
  | 'team_package_install'
  | 'persona_activation';

export type CustomizationRuntimeCapabilityState =
  | {
      status: 'supported';
      transport: 'tauri';
    }
  | {
      status: 'unsupported';
      transport: 'websocket';
      reason: 'server_runtime_deferred';
    };

export interface CustomizationRuntimeCapabilityReader {
  getCapability(
    capability: CustomizationRuntimeCapability,
  ): CustomizationRuntimeCapabilityState;
}

export type CustomizationRuntimeDetector = () => boolean;

/**
 * Owns the transport boundary for customization runtime features.
 *
 * Pages and composer components consume this explicit capability contract
 * instead of probing transports or interpreting request failures.
 */
export class CustomizationRuntimeCapabilityService
implements CustomizationRuntimeCapabilityReader {
  constructor(
    private readonly detectTauriRuntime: CustomizationRuntimeDetector =
      isTauriRuntime,
  ) {}

  getCapability(
    _capability: CustomizationRuntimeCapability,
  ): CustomizationRuntimeCapabilityState {
    return this.detectTauriRuntime()
      ? {
          status: 'supported',
          transport: 'tauri',
        }
      : {
          status: 'unsupported',
          transport: 'websocket',
          reason: 'server_runtime_deferred',
        };
  }
}

export const customizationRuntimeCapabilityService =
  new CustomizationRuntimeCapabilityService();
