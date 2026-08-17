import type { AgentDraftRecord } from '@/shared/services/customization/AgentAuthoringGateway';
import type {
  AgentDebugBindRequest,
  AgentDebugBindResult,
  AgentDebugBinding,
  AgentDebugOutcome,
  AgentDebugRecordResult,
  AgentDebugSendResult,
} from '@/shared/services/customization/AgentDebugSessionBinding';

/**
 * Drives the isolated trial conversation for the draft being authored.
 *
 * This owns no session machinery of its own. Binding, staleness and evidence all
 * live in AgentDebugSessionBinding, and the session itself is created by the
 * existing debug runtime that the legacy creation page already proved out. What
 * is added here is the link to the editor's draft lifecycle: every save advances
 * the draft revision, and a trial must never run a prompt the user has replaced.
 *
 * A failed bind clears the current binding rather than leaving the previous one
 * in place, so the panel cannot quietly keep talking to a superseded agent.
 */

export interface AgentStudioDebugControllerDeps {
  bind: (request: AgentDebugBindRequest) => Promise<AgentDebugBindResult>;
  send: (binding: AgentDebugBinding, message: string) => Promise<AgentDebugSendResult>;
  recordOutcome: (
    binding: AgentDebugBinding,
    outcome: AgentDebugOutcome,
  ) => Promise<AgentDebugRecordResult>;
  release: (binding: AgentDebugBinding) => Promise<void>;
  releaseAll: () => Promise<void>;
}

export type AgentStudioAttachResult =
  | { status: 'ready'; binding: AgentDebugBinding }
  | { status: 'failed'; reason: string };

export type AgentStudioSendResult =
  | { status: 'sent' }
  | { status: 'detached'; reason: string }
  | { status: 'stale'; reason: string }
  | { status: 'failed'; reason: string };

export type AgentStudioRecordResult =
  | { status: 'recorded' }
  | { status: 'detached'; reason: string }
  | { status: 'stale'; reason: string }
  | { status: 'failed'; reason: string };

const DETACHED_REASON =
  'No trial conversation is attached to this draft yet.';

/**
 * The debug persona only carries what the runtime actually applies. Model,
 * persona key and parent visibility stay with the catalog draft: a trial must
 * not be able to widen what the published revision would be allowed to do.
 */
function toDebugDraft(draft: AgentDraftRecord) {
  const { content } = draft;
  return {
    displayName: content.displayName,
    description: content.description,
    prompt: content.prompt,
    tools: [...content.tools],
    readonly: content.readonly,
    review: content.review,
  };
}

export function createAgentStudioDebugController(
  deps: AgentStudioDebugControllerDeps,
) {
  let current: AgentDebugBinding | null = null;

  async function attach(
    draft: AgentDraftRecord,
    sourceSessionId: string,
  ): Promise<AgentStudioAttachResult> {
    const result = await deps.bind({
      scope: draft.scope,
      definitionId: draft.definitionId,
      draftId: draft.draftId,
      draftRevisionId: draft.draftRevisionId,
      sourceSessionId,
      draft: toDebugDraft(draft),
    });
    if (result.status === 'failed') {
      current = null;
      return { status: 'failed', reason: result.reason };
    }
    current = result.binding;
    return { status: 'ready', binding: result.binding };
  }

  async function send(message: string): Promise<AgentStudioSendResult> {
    if (!current) return { status: 'detached', reason: DETACHED_REASON };
    const result = await deps.send(current, message);
    if (result.status === 'stale') {
      current = null;
      return { status: 'stale', reason: result.reason };
    }
    return result;
  }

  async function recordOutcome(
    outcome: AgentDebugOutcome,
  ): Promise<AgentStudioRecordResult> {
    if (!current) return { status: 'detached', reason: DETACHED_REASON };
    const result = await deps.recordOutcome(current, outcome);
    if (result.status === 'stale') {
      current = null;
      return { status: 'stale', reason: result.reason };
    }
    return result;
  }

  async function detach(): Promise<void> {
    if (!current) return;
    const binding = current;
    current = null;
    await deps.release(binding);
  }

  async function dispose(): Promise<void> {
    current = null;
    await deps.releaseAll();
  }

  return {
    attach,
    send,
    recordOutcome,
    detach,
    dispose,
    get binding(): AgentDebugBinding | null {
      return current;
    },
  };
}
