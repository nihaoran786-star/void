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
  | 'disabled'
  | 'unsupported_provider'
  | 'access_denied'
  | 'invalid_model_id'
  | 'model_directory_missing'
  | 'model_missing'
  | 'model_corrupt'
  | 'engine_not_bundled'
  | 'busy'
  | 'session_not_found'
  | 'invalid_audio'
  | 'empty_audio'
  | 'recording_limit_reached'
  | 'transcription_failed'
  | 'cancelled'
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

export interface LocalAsrStartInputSessionRequest {
  language?: string | null;
  sampleRate?: number | null;
  maxRecordingSeconds?: number | null;
}

export interface LocalAsrInputSession {
  sessionId: string;
  modelId: string;
  language: string;
  sampleRate: number;
  maxRecordingSeconds: number;
}

export interface LocalAsrAppendAudioChunkResponse {
  receivedBytes: number;
  receivedSeconds: number;
  limitReached: boolean;
}

export interface LocalAsrTranscriptionResult {
  text: string;
  language: string;
  durationMs: number;
  audioDurationSeconds: number;
}

class LocalAsrAPI {
  async getStatus(): Promise<LocalAsrStatus> {
    try {
      return await api.invoke<LocalAsrStatus>('get_local_asr_status');
    } catch (error) {
      throw createTauriCommandError('get_local_asr_status', error);
    }
  }

  async startInputSession(
    request: LocalAsrStartInputSessionRequest = {},
  ): Promise<LocalAsrInputSession> {
    try {
      return await api.invoke<LocalAsrInputSession>(
        'local_asr_start_input_session',
        { request },
      );
    } catch (error) {
      throw createTauriCommandError('local_asr_start_input_session', error, request);
    }
  }

  async appendAudioChunk(
    sessionId: string,
    pcm16Base64: string,
  ): Promise<LocalAsrAppendAudioChunkResponse> {
    try {
      return await api.invoke<LocalAsrAppendAudioChunkResponse>(
        'local_asr_append_audio_chunk',
        { request: { sessionId, pcm16Base64 } },
      );
    } catch (error) {
      throw createTauriCommandError('local_asr_append_audio_chunk', error, { sessionId });
    }
  }

  async finishInputSession(sessionId: string): Promise<LocalAsrTranscriptionResult> {
    try {
      return await api.invoke<LocalAsrTranscriptionResult>(
        'local_asr_finish_input_session',
        { request: { sessionId } },
        { timeout: 120_000 },
      );
    } catch (error) {
      throw createTauriCommandError('local_asr_finish_input_session', error, { sessionId });
    }
  }

  async cancelInputSession(sessionId: string): Promise<void> {
    try {
      await api.invoke('local_asr_cancel_input_session', { request: { sessionId } });
    } catch (error) {
      throw createTauriCommandError('local_asr_cancel_input_session', error, { sessionId });
    }
  }
}

export const localAsrAPI = new LocalAsrAPI();
