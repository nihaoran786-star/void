import { btwAPI } from '@/infrastructure/api';
import type { BtwSessionRecord } from '@/infrastructure/api/service-api/BtwAPI';
import { flowChatStore } from '../store/FlowChatStore';

/**
 * Restores persisted BTW lineage as transient UI shells. It never pretends the
 * old runtime survived; sending from a runtime_unavailable shell starts a new
 * coordinator turn with the same child identity.
 */
export async function hydrateBtwRelationships(params: {
  parentSessionId: string;
  workspacePath: string;
}): Promise<BtwSessionRecord[]> {
  const records = await btwAPI.listRelationships({
    parentSessionId: params.parentSessionId,
    workspacePath: params.workspacePath,
  });
  for (const record of records) {
    if (flowChatStore.getState().sessions.has(record.childSessionId)) {
      continue;
    }
    const title =
      record.childSessionName?.trim() ||
      record.legacyText?.trim().slice(0, 48) ||
      record.childSessionId;
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
        },
        isTransient: true,
        agentBackedTransient: false,
      },
    );
    if (record.requestId) {
      flowChatStore.addBtwThreadMarker(record.parentSessionId, {
        requestId: record.requestId,
        childSessionId: record.childSessionId,
        title,
        status: record.hydrationState === 'ready' ? 'done' : 'error',
        createdAt: Date.now(),
        error: record.hydrationDetail,
      });
    }
  }
  return records;
}
