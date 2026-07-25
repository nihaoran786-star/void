import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOptionalConfig: vi.fn(),
  setConfig: vi.fn(),
  getStatus: vi.fn(),
}));

vi.mock('./ConfigManager', () => ({
  configManager: {
    getOptionalConfig: mocks.getOptionalConfig,
    setConfig: mocks.setConfig,
  },
}));

vi.mock('@/infrastructure/api/service-api/LocalAsrAPI', () => ({
  localAsrAPI: { getStatus: mocks.getStatus },
}));

import {
  DEFAULT_VOICE_INPUT_CONFIG,
  localAsrConfigService,
  normalizeVoiceInputConfig,
} from './LocalAsrConfigService';

describe('LocalAsrConfigService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setConfig.mockResolvedValue(undefined);
  });

  it('normalizes unsafe or incomplete persisted values to a disabled local config', () => {
    expect(normalizeVoiceInputConfig({
      enabled: 'yes',
      provider: 'unknown',
      model_id: '  ',
      max_recording_seconds: 999,
    })).toEqual({
      ...DEFAULT_VOICE_INPUT_CONFIG,
      max_recording_seconds: 300,
    });
  });

  it('persists only the typed voice input configuration path', async () => {
    const saved = await localAsrConfigService.saveConfig({
      ...DEFAULT_VOICE_INPUT_CONFIG,
      enabled: true,
      model_directory: ' D:/models/asr ',
    });

    expect(saved.model_directory).toBe('D:/models/asr');
    expect(mocks.setConfig).toHaveBeenCalledOnce();
    expect(mocks.setConfig).toHaveBeenCalledWith(
      'app.ai_experience.voice_input',
      saved,
    );
  });

  it('delegates model and engine inspection to the backend adapter', async () => {
    const status = {
      source: 'local_filesystem',
      status: 'unavailable',
      configuredModelId: 'sensevoice-small-int8',
      modelDirectory: 'D:/models/asr',
      modelAvailable: true,
      engineAvailable: false,
      discoveredModels: ['sensevoice-small-int8'],
      error: {
        code: 'engine_not_bundled',
        message: 'Not bundled',
        retryable: false,
      },
    };
    mocks.getStatus.mockResolvedValue(status);

    await expect(localAsrConfigService.getStatus()).resolves.toEqual(status);
  });
});
