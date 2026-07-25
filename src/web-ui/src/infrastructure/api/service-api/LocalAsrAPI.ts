import { api } from './ApiClient';
import { createTauriCommandError } from '../errors/TauriCommandError';

export type LocalAsrSource = 'local_filesystem';
export type LocalAsrStatusCode =
  | 'disabled'
  | 'missing_directory'
  | 'missing_model'
  | 'unavailable'
  | 'ready'
  | 'failed';
export type LocalAsrErrorCode =
  | 'unsupported_provider'
  | 'invalid_model_id'
  | 'model_directory_missing'
  | 'model_missing'
  | 'engine_not_bundled'
  | 'inspection_failed';

export interface LocalAsrError {
  code: LocalAsrErrorCode;
  message: string;
  retryable: boolean;
}

export interface LocalAsrStatus {
  source: LocalAsrSource;
  status: LocalAsrStatusCode;
  configuredModelId: string;
  modelDirectory: string;
  modelAvailable: boolean;
  engineAvailable: boolean;
  discoveredModels: string[];
  error?: LocalAsrError | null;
}

class LocalAsrAPI {
  async getStatus(): Promise<LocalAsrStatus> {
    try {
      return await api.invoke<LocalAsrStatus>('get_local_asr_status');
    } catch (error) {
      throw createTauriCommandError('get_local_asr_status', error);
    }
  }
}

export const localAsrAPI = new LocalAsrAPI();
