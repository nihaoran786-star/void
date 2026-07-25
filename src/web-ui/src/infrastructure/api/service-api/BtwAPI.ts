import { api } from './ApiClient';
import { createTauriCommandError } from '../errors/TauriCommandError';
import type { ImageContextData } from './ImageContextTypes';

export interface BtwAskStreamRequest {
  requestId: string;
  sessionId: string;
  question: string;
  modelId?: string;
  childSessionId: string;
  childSessionName?: string;
  imageContexts?: ImageContextData[];
  /** Long-term memory is opt-in and disabled when omitted. */
  memoryEnabled?: boolean;
}

export type BtwHydrationState = 'loading' | 'ready' | 'stale' | 'failed';

export interface BtwSessionRecord {
  schemaVersion: number;
  parentSessionId: string;
  childSessionId: string;
  requestId?: string;
  childSessionName?: string;
  hydrationState: BtwHydrationState;
  hydrationDetail?: string;
  memoryEnabled: boolean;
  legacyText?: string;
}

export interface BtwAskStreamResponse {
  ok: boolean;
  relationship: BtwSessionRecord;
}

export interface BtwCancelRequest {
  requestId: string;
}

export class BtwAPI {
  async askStream(request: BtwAskStreamRequest): Promise<BtwAskStreamResponse> {
    try {
      return await api.invoke<BtwAskStreamResponse>('btw_ask_stream', { request });
    } catch (error) {
      throw createTauriCommandError('btw_ask_stream', error, request);
    }
  }

  async cancel(request: BtwCancelRequest): Promise<void> {
    try {
      await api.invoke<void>('btw_cancel', { request });
    } catch (error) {
      throw createTauriCommandError('btw_cancel', error, request);
    }
  }
}

export const btwAPI = new BtwAPI();
