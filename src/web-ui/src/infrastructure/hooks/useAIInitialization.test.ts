import { describe, expect, it } from 'vitest';

import { vi } from 'vitest';

vi.mock('../services/api/aiService', () => ({
  AIService: {
    isAIInitialized: vi.fn(() => false),
    getCurrentConfig: vi.fn(() => null),
  },
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import type { ModelConfig } from '../../shared/types';
import { getAIInitializationReadiness } from './useAIInitialization';

const baseConfig: ModelConfig = {
  id: 'model-1',
  name: 'Model',
  baseUrl: 'https://api.example.com/v1',
  modelName: 'example-model',
  format: 'openai',
};

describe('getAIInitializationReadiness', () => {
  it('allows Codex CLI auth without an inline API key', () => {
    expect(getAIInitializationReadiness({
      ...baseConfig,
      auth: { type: 'codex_cli' },
    })).toEqual({ ready: true });
  });

  it('still requires an API key for legacy and explicit API key auth', () => {
    expect(getAIInitializationReadiness(baseConfig)).toEqual({
      ready: false,
      reason: 'missing_api_key',
    });
    expect(getAIInitializationReadiness({
      ...baseConfig,
      auth: { type: 'api_key' },
    })).toEqual({
      ready: false,
      reason: 'missing_api_key',
    });
  });

  it('requires model name and base URL for every auth source', () => {
    expect(getAIInitializationReadiness({
      ...baseConfig,
      modelName: '',
      auth: { type: 'codex_cli' },
    })).toEqual({ ready: false, reason: 'missing_model_name' });
    expect(getAIInitializationReadiness({
      ...baseConfig,
      baseUrl: '',
      auth: { type: 'codex_cli' },
    })).toEqual({ ready: false, reason: 'missing_base_url' });
  });
});
