import type { AgentDefinitionScope } from '@/shared/services/customization/AgentAuthoringGateway';
import { createAgentStudioDraftEditor } from './AgentStudioDraftEditor';
import { createAgentStudioDebugController } from './AgentStudioDebugController';
import { createAgentStudioPublishController } from './AgentStudioPublishController';
import { createAgentStudioSession } from './agentStudioSession';

/**
 * Assembles the studio from the real services.
 *
 * The trial conversation does create a throwaway subagent through the existing
 * debug runtime, which the legacy creation page has always done. That is not the
 * dual-write this directory's boundary rule guards against: the temporary trial
 * persona is not the authored agent, and authoring itself still goes only
 * through the revision catalog.
 */

let sequence = 0;

function nextIdempotencyKey(prefix: string): string {
  sequence += 1;
  return `${prefix}:${sequence}`;
}

export async function createAgentStudio() {
  const [
    { AgentRevisionService },
    { DesktopAgentAuthoringAdapter },
    { createAgentDebugSessionBinder },
    { createAgentDebugRuntime, defaultAgentDebugRuntimeDeps },
    { createAgentRevisionActivator },
  ] = await Promise.all([
    import('@/shared/services/customization/AgentRevisionService'),
    import('@/shared/services/customization/adapters/DesktopAgentAuthoringAdapter'),
    import('@/shared/services/customization/AgentDebugSessionBinding'),
    import('@/shared/services/customization/AgentDebugRuntimeService'),
    import('@/shared/services/customization/AgentRevisionActivation'),
  ]);

  const revisions = new AgentRevisionService(new DesktopAgentAuthoringAdapter());
  const debugRuntime = createAgentDebugRuntime(defaultAgentDebugRuntimeDeps());

  const binder = createAgentDebugSessionBinder({
    createDebugSession: (draft, workspacePath) =>
      debugRuntime.createDebugSession(draft, workspacePath),
    disposeDebugSession: handle => debugRuntime.disposeDebugSession(handle),
    sendMessage: (handle, message) => debugRuntime.sendMessage(handle, message),
    recordValidation: async request => {
      await revisions.recordValidation(request);
    },
    createIdempotencyKey: () => nextIdempotencyKey('agent-studio-validation'),
  });

  const editor = createAgentStudioDraftEditor({
    openDraft: request => revisions.openDraft(request),
    saveDraft: request => revisions.saveDraft(request),
    createIdempotencyKey: () => nextIdempotencyKey('agent-studio-draft'),
  });

  const debug = createAgentStudioDebugController({
    bind: request => binder.bind(request),
    send: (binding, message) => binder.send(binding, message),
    recordOutcome: (binding, outcome) => binder.recordOutcome(binding, outcome),
    release: binding => binder.release(binding),
    releaseAll: () => binder.releaseAll(),
  });

  const activator = createAgentRevisionActivator({
    isBindingLive: binding => debug.binding?.debugSessionId === binding.debugSessionId,
    readDraftValidation: async binding => {
      const definition = await revisions.get({
        scope: binding.scope,
        definitionId: binding.definitionId,
      });
      const draft = definition.drafts.find(entry => entry.draftId === binding.draftId);
      return draft?.validationEvidence ?? [];
    },
    publish: async command => {
      const result = await revisions.publish(command);
      return { status: result.status, revisionId: result.revision.revisionId };
    },
    setDefault: async command => {
      const result = await revisions.setDefault(command);
      return { status: result.status };
    },
    forkSession: async () => {
      // Forking a conversation onto the new revision is a session-runtime action
      // that P1-A2 has not been approved to perform. Reporting it here keeps the
      // activator honest instead of silently pretending the fork happened.
      throw new Error('Forking a conversation onto a new revision is not available yet.');
    },
    createIdempotencyKey: () => nextIdempotencyKey('agent-studio-publish'),
  });

  const publisher = createAgentStudioPublishController({
    currentBinding: () => debug.binding,
    readDefaultRevisionId: async draft => {
      const definition = await revisions.get({
        scope: draft.scope,
        definitionId: draft.definitionId,
      });
      return definition.defaultRevisionId;
    },
    publishAndActivate: request => activator.publishAndActivate(request),
    releaseDebugSession: () => debug.detach(),
  });

  const session = createAgentStudioSession({
    openDraft: request => editor.open(request),
    saveDraft: (draft, content) => editor.save(draft, content),
    attachTrial: (draft, sourceSessionId) => debug.attach(draft, sourceSessionId),
    detachTrial: () => debug.detach(),
    publish: (draft, action) => publisher.publish(draft, action),
  });

  return {
    session,
    sendTrialMessage: (message: string) => debug.send(message),
    recordTrialOutcome: (status: 'passed' | 'failed', message?: string) =>
      debug.recordOutcome(message ? { status, message } : { status }),
    currentDebugSessionId: () => debug.binding?.debugSessionId ?? null,
    dispose: () => debug.dispose(),
  };
}

export type AgentStudio = Awaited<ReturnType<typeof createAgentStudio>>;
export type { AgentDefinitionScope };
