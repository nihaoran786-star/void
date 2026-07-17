import { describe, expect, it, vi } from 'vitest';

vi.mock('./ConfigManager', () => ({
  configManager: {
    getConfig: vi.fn().mockResolvedValue([]),
    setConfig: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/infrastructure/i18n', () => ({
  i18nService: {
    t: (key: string) => key,
  },
}));

import {
  getProviderDisplayName,
  mapBackendModelConfig,
  mapModelConfigToBackend,
} from './modelConfigs';

describe('modelConfigs', () => {
  it('preserves custom provider names even when the base URL matches a known provider', () => {
    expect(getProviderDisplayName({
      name: 'My Zhipu Proxy',
      base_url: 'https://open.bigmodel.cn/api/paas/v4',
      model_name: 'glm-5',
    })).toBe('My Zhipu Proxy');
  });

  it('keeps legacy URL inference when a provider name is missing', () => {
    expect(getProviderDisplayName({
      base_url: 'https://open.bigmodel.cn/api/paas/v4',
      model_name: 'glm-5',
    })).toBe('settings/ai-model:providers.zhipu.name');
  });

  it('preserves CLI auth while mapping backend model configuration', () => {
    const config = mapBackendModelConfig({
      id: 'codex-model',
      name: 'Codex CLI',
      base_url: 'https://chatgpt.com/backend-api/codex',
      model_name: 'gpt-5.3-codex',
      provider: 'responses',
      auth: { type: 'codex_cli' },
    });

    expect(config.auth).toEqual({ type: 'codex_cli' });
    expect(mapModelConfigToBackend(config).auth).toEqual({ type: 'codex_cli' });
  });

  it('keeps the legacy API key auth default when auth is absent', () => {
    const config = mapBackendModelConfig({
      id: 'legacy-model',
      name: 'Legacy',
      base_url: 'https://api.example.com/v1',
      model_name: 'example-model',
      provider: 'openai',
    });

    expect(config.auth).toEqual({ type: 'api_key' });
    expect(mapModelConfigToBackend(config).auth).toEqual({ type: 'api_key' });
  });
});
