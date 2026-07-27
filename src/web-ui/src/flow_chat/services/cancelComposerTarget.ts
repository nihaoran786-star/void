import type { DialogTurn, Session } from '../types/flow-chat';
import { resolveSessionRelationship } from '../utils/sessionMetadata';

interface ComposerCancellationAdapters {
  cancelMain: () => Promise<unknown>;
  cancelBtw: (requestId: string) => Promise<unknown>;
  cancelSubagent: (sessionId: string) => Promise<unknown>;
}

const defaultAdapters: ComposerCancellationAdapters = {
  cancelMain: async () => {
    const { FlowChatManager } = await import('./FlowChatManager');
    return FlowChatManager.getInstance().cancelCurrentTask();
  },
  cancelBtw: async requestId => {
    const { btwAPI } = await import('@/infrastructure/api/service-api/BtwAPI');
    return btwAPI.cancel({ requestId });
  },
  cancelSubagent: async sessionId => {
    const { agentAPI } = await import('@/infrastructure/api');
    return agentAPI.cancelSession(sessionId);
  },
};

function isActiveTurn(status?: DialogTurn['status']): boolean {
  return status === 'pending'
    || status === 'image_analyzing'
    || status === 'processing'
    || status === 'finishing';
}

function resolveActiveBtwRequestId(session: Session): string | undefined {
  for (let index = session.dialogTurns.length - 1; index >= 0; index -= 1) {
    const turn = session.dialogTurns[index];
    if (!isActiveTurn(turn.status)) continue;
    const match = turn.id.match(/^btw-turn-(.+)$/);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return session.btwOrigin?.requestId?.trim() || undefined;
}

export async function cancelComposerTarget(
  session: Session,
  adapters: ComposerCancellationAdapters = defaultAdapters,
): Promise<void> {
  const relationship = resolveSessionRelationship(session);
  if (relationship.kind === 'subagent') {
    await adapters.cancelSubagent(session.sessionId);
    return;
  }
  if (relationship.kind === 'btw') {
    const requestId = resolveActiveBtwRequestId(session);
    if (!requestId) {
      throw new Error(`Active /btw request not found for session: ${session.sessionId}`);
    }
    await adapters.cancelBtw(requestId);
    return;
  }
  await adapters.cancelMain();
}
