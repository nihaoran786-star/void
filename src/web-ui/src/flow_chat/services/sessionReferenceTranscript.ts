import { sessionAPI } from '@/infrastructure/api';
import type {
  SessionReferenceAccessScope,
  SessionReferenceTranscriptResult,
} from '@/infrastructure/api/service-api/SessionAPI';
import type { SessionReferenceContext } from '@/shared/types/context';

export interface SessionReferenceTranscriptInjection {
  prompt: string;
  results: SessionReferenceTranscriptResult[];
}

function failedResult(
  reference: SessionReferenceContext,
  message: string,
): SessionReferenceTranscriptResult {
  return {
    source: {
      kind: 'session_reference',
      sessionId: reference.sessionId,
      sessionTitle: reference.sessionTitle,
    },
    status: 'failed',
    messageCount: 0,
    estimatedTokens: 0,
    error: {
      code: 'failed',
      message,
    },
  };
}

export async function resolveSessionReferenceTranscriptInjection(
  references: readonly SessionReferenceContext[],
  scope: SessionReferenceAccessScope | undefined,
): Promise<SessionReferenceTranscriptInjection> {
  if (references.length === 0) {
    return { prompt: '', results: [] };
  }
  if (!scope?.currentSessionId || !scope.workspacePath.trim()) {
    const results = references.map(reference =>
      failedResult(reference, 'The active session does not expose a supported workspace scope.'));
    return {
      prompt: results.map(result =>
        `[Session reference unavailable: ${result.source.sessionTitle}; status=${result.status}]`,
      ).join('\n'),
      results,
    };
  }

  let results: SessionReferenceTranscriptResult[];
  try {
    results = await sessionAPI.resolveSessionReferences(scope, references);
  } catch {
    results = references.map(reference =>
      failedResult(reference, 'Referenced session could not be resolved.'));
  }

  return {
    prompt: results.map(result => {
      if (result.status === 'ready' && result.transcript) {
        return result.transcript;
      }
      return [
        `[Session reference unavailable: ${result.source.sessionTitle}; status=${result.status}]`,
      ].filter(Boolean).join('\n');
    }).join('\n\n'),
    results,
  };
}

export function sessionReferenceResolutionMetadata(
  results: readonly SessionReferenceTranscriptResult[],
): Array<Pick<SessionReferenceTranscriptResult, 'source' | 'status' | 'error'>> {
  return results.map(({ source, status, error }) => ({ source, status, error }));
}
