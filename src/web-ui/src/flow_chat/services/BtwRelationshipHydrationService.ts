import type { BtwSessionRecord } from '@/infrastructure/api/service-api/BtwAPI';
import { flowChatStore } from '../store/FlowChatStore';

/**
 * Restores persisted BTW lineage and, when available, its hidden child
 * transcript through the existing session-history interface. Runtime execution
 * is still resumed only when the user sends a new turn.
 */
export async function hydrateBtwRelationships(params: {
  parentSessionId: string;
  workspacePath: string;
}): Promise<BtwSessionRecord[]> {
  const { btwAPI } = await import(
    '@/infrastructure/api/service-api/BtwAPI'
  );
  const records = await btwAPI.listRelationships({
    parentSessionId: params.parentSessionId,
    workspacePath: params.workspacePath,
  });
  for (const record of records) {
    const existingSession =
      flowChatStore.getState().sessions.get(record.childSessionId);
    const title =
      record.childSessionName?.trim() ||
      record.legacyText?.trim().slice(0, 48) ||
      record.childSessionId;
    if (!existingSession) {
      flowChatStore.addExternalSession(
        record.childSessionId,
        title,
        'agentic',
        params.workspacePath,
        {
          parentSessionId: record.parentSessionId,
          sessionKind: 'btw',
          btwOrigin: {
            requestId: record.requestId,
            parentSessionId: record.parentSessionId,
            memoryEnabled: record.memoryEnabled,
          },
          isTransient: true,
          isHistorical: true,
          agentBackedTransient: false,
        },
      );
    } else {
      flowChatStore.updateSessionBtwOrigin(
        record.childSessionId,
        {
          requestId: record.requestId,
          parentSessionId: record.parentSessionId,
          memoryEnabled: record.memoryEnabled,
        },
        'btw',
      );
    }
    let transcriptRestored = false;
    if (!record.legacyText && (!existingSession || existingSession.isHistorical)) {
      try {
        await flowChatStore.loadSessionHistory(
          record.childSessionId,
          params.workspacePath,
          undefined,
          existingSession?.remoteConnectionId,
          existingSession?.remoteSshHost,
          { includeInternal: true },
        );
        transcriptRestored = true;
      } catch {
        // Keep the typed relationship shell usable. Older sidecars may not have
        // a durable child transcript, and a new turn can still recreate it.
      }
    }
    if (record.requestId) {
      const runtimeAvailable =
        existingSession !== undefined && existingSession.isHistorical !== true;
      flowChatStore.addBtwThreadMarker(record.parentSessionId, {
        requestId: record.requestId,
        childSessionId: record.childSessionId,
        title,
        status:
          runtimeAvailable ||
          transcriptRestored ||
          record.hydrationState === 'ready'
            ? 'done'
            : 'error',
        createdAt: Date.now(),
        error:
          runtimeAvailable || transcriptRestored
            ? undefined
            : record.hydrationDetail,
      });
    }
  }
  return records;
}
