import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOptionalConfig: vi.fn(),
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  getFreshConfig: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('./ConfigManager', () => ({
  configManager: {
    getOptionalConfig: mocks.getOptionalConfig,
    getConfig: mocks.getConfig,
    setConfig: mocks.setConfig,
  },
}));
vi.mock('@/infrastructure/event-bus', () => ({
  globalEventBus: { emit: mocks.emit },
}));
vi.mock('@/infrastructure/api/service-api/ConfigAPI', () => ({
  configAPI: { getConfig: mocks.getFreshConfig },
}));

import {
  normalizeToolPermissionConfig,
  toolPermissionConfigService,
} from './ToolPermissionConfigService';

describe('ToolPermissionConfigService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setConfig.mockResolvedValue(undefined);
    mocks.getFreshConfig.mockResolvedValue(undefined);
  });

  it('fails closed for invalid config while preserving valid ordered rules', () => {
    expect(normalizeToolPermissionConfig({
      mode: 'invalid',
      rules: [
        { tool: 'Bash', decision: 'deny' },
        { tool: '', decision: 'allow' },
      ],
    })).toEqual({
      mode: 'ask',
      rules: [{ tool: 'Bash', decision: 'deny' }],
    });
  });

  it('migrates the legacy auto-execute flag to Auto presentation', async () => {
    mocks.getOptionalConfig.mockResolvedValue(undefined);
    mocks.getConfig.mockResolvedValue(true);

    await expect(toolPermissionConfigService.loadConfig()).resolves.toEqual({
      mode: 'auto',
      rules: [],
    });
  });

  it('saves one typed config update and lets the backend project compatibility atomically', async () => {
    await toolPermissionConfigService.saveMode('full_access', {
      mode: 'ask',
      rules: [{ tool: 'Bash', decision: 'deny' }],
    });

    expect(mocks.setConfig).toHaveBeenCalledOnce();
    expect(mocks.setConfig).toHaveBeenCalledWith('ai.tool_permissions', {
      mode: 'full_access',
      rules: [{ tool: 'Bash', decision: 'deny' }],
    });
    expect(mocks.emit).toHaveBeenCalledWith('permission:config:updated', expect.any(Object));
  });

  it('patches only the mode on the latest backend policy', async () => {
    mocks.getFreshConfig.mockResolvedValue({
      mode: 'ask',
      rules: [{ tool: 'Bash', decision: 'deny' }],
    });

    await toolPermissionConfigService.saveMode('auto', {
      mode: 'ask',
      rules: [],
    });

    expect(mocks.setConfig).toHaveBeenCalledWith('ai.tool_permissions', {
      mode: 'auto',
      rules: [{ tool: 'Bash', decision: 'deny' }],
    });
  });
});
