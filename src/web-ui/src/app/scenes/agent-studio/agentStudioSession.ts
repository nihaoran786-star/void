import type {
  AgentDraftRecord,
  AgentDefinitionScope,
  AgentRevisionContent,
} from '@/shared/services/customization/AgentAuthoringGateway';
import type { AgentActivationAction } from '@/shared/services/customization/AgentRevisionActivation';
import type { AgentStudioOpenResult, AgentStudioSaveResult } from './AgentStudioDraftEditor';
import type { AgentStudioAttachResult } from './AgentStudioDebugController';
import type { AgentStudioPublishResult } from './AgentStudioPublishController';

/**
 * Holds what the studio has open, so the UI renders state instead of inferring it.
 *
 * The rule the rest of the studio depends on: a draft is publishable only while
 * the trial that ran it is still the current one. Saving supersedes the trial and
 * a successful publish spends it, so in both cases the draft goes back to untried
 * and the publish actions go quiet. That is the same guarantee the binder and the
 * activator enforce underneath; keeping it in the visible state means the buttons
 * cannot offer something the layers below will refuse.
 */

export type AgentStudioPhase = 'closed' | 'editing';
export type AgentStudioTrialState = 'untried' | 'ready';

export interface AgentStudioState {
  phase: AgentStudioPhase;
  trial: AgentStudioTrialState;
  draft: AgentDraftRecord | null;
  canPublish: boolean;
}

export interface AgentStudioSessionDeps {
  openDraft: (request: {
    scope: AgentDefinitionScope;
    definitionId: string;
  }) => Promise<AgentStudioOpenResult>;
  saveDraft: (
    draft: AgentDraftRecord,
    content: AgentRevisionContent,
  ) => Promise<AgentStudioSaveResult>;
  attachTrial: (
    draft: AgentDraftRecord,
    sourceSessionId: string,
  ) => Promise<AgentStudioAttachResult>;
  detachTrial: () => Promise<void>;
  publish: (
    draft: AgentDraftRecord,
    action: AgentActivationAction,
  ) => Promise<AgentStudioPublishResult>;
}

const CLOSED: AgentStudioState = {
  phase: 'closed',
  trial: 'untried',
  draft: null,
  canPublish: false,
};

export function createAgentStudioSession(deps: AgentStudioSessionDeps) {
  let state: AgentStudioState = CLOSED;
  let sourceSessionId = '';
  const subscribers = new Set<(next: AgentStudioState) => void>();

  function set(next: Partial<AgentStudioState>): void {
    const merged = { ...state, ...next };
    state = {
      ...merged,
      canPublish: merged.phase === 'editing'
        && merged.trial === 'ready'
        && merged.draft !== null,
    };
    for (const subscriber of subscribers) subscriber(state);
  }

  async function open(
    request: { scope: AgentDefinitionScope; definitionId: string },
    forSessionId: string,
  ): Promise<AgentStudioOpenResult> {
    const result = await deps.openDraft(request);
    if (result.status !== 'open') return result;
    sourceSessionId = forSessionId;
    set({ phase: 'editing', trial: 'untried', draft: result.draft });
    return result;
  }

  async function save(content: AgentRevisionContent): Promise<AgentStudioSaveResult> {
    const draft = state.draft;
    if (!draft) {
      return { status: 'invalid', reason: 'No draft is open.' };
    }
    const result = await deps.saveDraft(draft, content);
    if (result.status !== 'saved') return result;
    // The saved draft is a new revision, so whatever was tried is now the
    // previous one and must not count towards publishing.
    if (state.trial === 'ready') {
      await deps.detachTrial();
    }
    set({ draft: result.draft, trial: 'untried' });
    return result;
  }

  async function startTrial(): Promise<AgentStudioAttachResult> {
    const draft = state.draft;
    if (!draft) {
      return { status: 'failed', reason: 'No draft is open.' };
    }
    const result = await deps.attachTrial(draft, sourceSessionId);
    if (result.status !== 'ready') return result;
    set({ trial: 'ready' });
    return result;
  }

  async function publish(
    action: AgentActivationAction,
  ): Promise<AgentStudioPublishResult> {
    const draft = state.draft;
    if (!draft || state.trial !== 'ready') {
      return {
        status: 'untried',
        reason: 'Try the draft in the trial conversation before publishing it.',
      };
    }
    const result = await deps.publish(draft, action);
    if (result.status === 'activated' || result.status === 'published_not_activated') {
      // The revision exists now and its trial is spent, so the draft has to be
      // tried again before it can be published a second time.
      set({ trial: 'untried' });
    }
    return result;
  }

  async function close(): Promise<void> {
    if (state.trial === 'ready') {
      await deps.detachTrial();
    }
    sourceSessionId = '';
    set(CLOSED);
  }

  return {
    open,
    save,
    startTrial,
    publish,
    close,
    subscribe(subscriber: (next: AgentStudioState) => void): () => void {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    get state(): AgentStudioState {
      return state;
    },
  };
}
