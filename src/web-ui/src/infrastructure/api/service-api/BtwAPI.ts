import { api } from './ApiClient';
import { createTauriCommandError } from '../errors/TauriCommandError';
import type { ImageContextData } from './ImageContextTypes';

export interface BtwAskStreamRequest {
  requestId: string;
  sessionId: string;
  workspacePath: string;
  question: string;
  modelId?: string;
  childSessionId: string;
  childSessionName?: string;
  imageContexts?: ImageContextData[];
  /** Long-term memory is opt-in on creation; omission preserves an existing choice. */
  memoryEnabled?: boolean;
}

export type BtwHydrationState =
  | 'loading'
  | 'ready'
  | 'runtime_unavailable'
  | 'stale'
  | 'failed';

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

interface LegacyCompatibleBtwAskStreamResponse {
  ok: boolean;
  relationship?: BtwSessionRecord;
}

export interface BtwCancelRequest {
  requestId: string;
}

export interface BtwListRelationshipsRequest {
  workspacePath: string;
  parentSessionId: string;
}

export interface BtwUpdateMemoryRequest {
  workspacePath: string;
  parentSessionId: string;
  childSessionId: string;
  enabled: boolean;
}

export class BtwAPI {
  async askStream(request: BtwAskStreamRequest): Promise<BtwAskStreamResponse> {
    try {
      const response = await api.invoke<LegacyCompatibleBtwAskStreamResponse>(
        'btw_ask_stream',
        { request },
      );
      if (!response.ok) {
        throw new Error(
          response.relationship?.hydrationDetail ||
            'BTW relationship persistence failed',
        );
      }
      if (response.relationship) {
        return {
          ok: true,
          relationship: response.relationship,
        };
      }

      // Desktop builds predating durable BTW relationships returned only
      // `{ ok: true }`. The stream is already running at this point, so
      // rejecting would discard the live child session and misreport success
      // as a launch failure.
      return {
        ok: true,
        relationship: {
          schemaVersion: 1,
          parentSessionId: request.sessionId,
          childSessionId: request.childSessionId,
          requestId: request.requestId,
          childSessionName: request.childSessionName,
          hydrationState: 'runtime_unavailable',
          hydrationDetail:
            'The desktop backend does not expose persisted BTW relationship metadata.',
          memoryEnabled: request.memoryEnabled ?? false,
        },
      };
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

  async listRelationships(
    request: BtwListRelationshipsRequest,
  ): Promise<BtwSessionRecord[]> {
    try {
      return await api.invoke<BtwSessionRecord[]>('btw_list_relationships', { request });
    } catch (error) {
      throw createTauriCommandError('btw_list_relationships', error, request);
    }
  }

  async updateMemoryEnabled(
    request: BtwUpdateMemoryRequest,
  ): Promise<BtwSessionRecord> {
    try {
      return await api.invoke<BtwSessionRecord>('btw_update_memory_enabled', {
        request,
      });
    } catch (error) {
      throw createTauriCommandError(
        'btw_update_memory_enabled',
        error,
        request,
      );
    }
  }
}

export const btwAPI = new BtwAPI();
