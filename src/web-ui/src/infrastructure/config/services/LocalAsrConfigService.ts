import { localAsrAPI, type LocalAsrStatus } from '@/infrastructure/api/service-api/LocalAsrAPI';
import type { VoiceInputConfig } from '../types';
import { configManager } from './ConfigManager';

export const DEFAULT_VOICE_INPUT_CONFIG: VoiceInputConfig = {
  enabled: false,
  provider: 'local',
  model_id: 'sensevoice-small-int8',
  model_directory: '',
  default_language: 'auto',
  max_recording_seconds: 60,
  microphone_device_id: '',
};

function boundedRecordingSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 60;
  return Math.min(300, Math.max(5, Math.round(value)));
}

export function normalizeVoiceInputConfig(value: unknown): VoiceInputConfig {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_VOICE_INPUT_CONFIG };
  }
  const candidate = value as Partial<VoiceInputConfig>;
  return {
    enabled: candidate.enabled === true,
    provider: 'local',
    model_id: typeof candidate.model_id === 'string' && candidate.model_id.trim()
      ? candidate.model_id.trim()
      : DEFAULT_VOICE_INPUT_CONFIG.model_id,
    model_directory: typeof candidate.model_directory === 'string'
      ? candidate.model_directory.trim()
      : '',
    default_language: typeof candidate.default_language === 'string'
      && candidate.default_language.trim()
      ? candidate.default_language.trim()
      : 'auto',
    max_recording_seconds: boundedRecordingSeconds(candidate.max_recording_seconds),
    microphone_device_id: typeof candidate.microphone_device_id === 'string'
      ? candidate.microphone_device_id
      : '',
  };
}

class LocalAsrConfigService {
  async loadConfig(): Promise<VoiceInputConfig> {
    const value = await configManager.getOptionalConfig<unknown>(
      'app.ai_experience.voice_input',
    );
    return normalizeVoiceInputConfig(value);
  }

  async saveConfig(config: VoiceInputConfig): Promise<VoiceInputConfig> {
    const normalized = normalizeVoiceInputConfig(config);
    await configManager.setConfig('app.ai_experience.voice_input', normalized);
    return normalized;
  }

  getStatus(): Promise<LocalAsrStatus> {
    return localAsrAPI.getStatus();
  }
}

export const localAsrConfigService = new LocalAsrConfigService();
