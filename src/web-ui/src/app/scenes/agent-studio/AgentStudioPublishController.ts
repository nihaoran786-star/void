import type { AgentDraftRecord } from '@/shared/services/customization/AgentAuthoringGateway';
import type { AgentDebugBinding } from '@/shared/services/customization/AgentDebugSessionBinding';
import type {
  AgentActivationAction,
  AgentActivationResult,
  AgentPublishAndActivateRequest,
} from '@/shared/services/customization/AgentRevisionActivation';

/**
 * Publishes the draft that was actually tried out, and applies one action.
 *
 * The publish rules themselves live in AgentRevisionActivation: evidence must
 * exist for the exact draft revision, publish and set-default stay separate
 * atomic commands, and a failure after a successful publish is reported as
 * published_not_activated rather than as success or as failure. This layer only
 * assembles the request from what the studio currently has open, and it refuses
 * the two states the activator cannot see for itself: no trial at all, and a
 * draft edited after the trial.
 */

export interface AgentStudioPublishControllerDeps {
  currentBinding: () => AgentDebugBinding | null;
  readDefaultRevisionId: (draft: AgentDraftRecord) => Promise<string | null>;
  publishAndActivate: (
    request: AgentPublishAndActivateRequest,
  ) => Promise<AgentActivationResult>;
  releaseDebugSession: () => Promise<void>;
}

export type AgentStudioPublishResult =
  | AgentActivationResult
  | { status: 'untried'; reason: string };

export function createAgentStudioPublishController(
  deps: AgentStudioPublishControllerDeps,
) {
  async function publish(
    draft: AgentDraftRecord,
    action: AgentActivationAction,
  ): Promise<AgentStudioPublishResult> {
    const binding = deps.currentBinding();
    if (!binding) {
      return {
        status: 'untried',
        reason: 'Try the draft in the trial conversation before publishing it.',
      };
    }
    if (binding.draftRevisionId !== draft.draftRevisionId) {
      // The user edited after trying. The activator would reject this on
      // evidence, but saying so here names the actual cause.
      return {
        status: 'stale',
        reason: 'This draft changed after its trial run; try it again before publishing.',
      };
    }

    const expectedDefaultRevisionId = await deps.readDefaultRevisionId(draft);
    const result = await deps.publishAndActivate({
      binding,
      expectedBaseRevisionId: draft.baseRevisionId,
      expectedDefaultRevisionId,
      action,
    });

    // A published revision is immutable, so its trial session is spent whether
    // or not the activation landed. Anything that did not publish keeps its
    // session so the user can carry on trying.
    if (result.status === 'activated' || result.status === 'published_not_activated') {
      await deps.releaseDebugSession();
    }
    return result;
  }

  return { publish };
}
