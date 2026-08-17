import type { AgentDefinitionScope, AgentValidationEvidence } from './AgentAuthoringGateway';
import type { AgentDebugBinding } from './AgentDebugSessionBinding';

/**
 * Publishes a validated draft and applies exactly one activation action.
 *
 * The invariant that outranks everything else here: the source conversation
 * stays pinned to the revision it started on. None of the three actions rebinds
 * it. "Continue" changes nothing, "fork" starts a separate session on the new
 * revision, and "future default" moves a pointer that only new sessions read.
 *
 * Publish and set-default are separate atomic commands, and a published revision
 * is immutable and append-only. So a failure after a successful publish cannot
 * be rolled back and must not be reported as a plain failure either: the caller
 * is told the revision exists but the action did not land, which is the only
 * description of that state that is actually true.
 */

export type AgentActivationAction =
  | { kind: 'continue' }
  | { kind: 'fork'; forkFromMessageId?: string }
  | { kind: 'future-default' };

export interface AgentPublishAndActivateRequest {
  binding: AgentDebugBinding;
  expectedBaseRevisionId: string | null;
  expectedDefaultRevisionId: string | null;
  action: AgentActivationAction;
}

export interface AgentPublishCommand {
  scope: AgentDefinitionScope;
  definitionId: string;
  draftId: string;
  expectedBaseRevisionId: string | null;
  expectedDraftRevisionId: string;
  idempotencyKey: string;
}

export interface AgentSetDefaultCommand {
  scope: AgentDefinitionScope;
  definitionId: string;
  revisionId: string;
  expectedDefaultRevisionId: string | null;
  idempotencyKey: string;
}

export interface AgentForkCommand {
  sourceSessionId: string;
  definitionId: string;
  revisionId: string;
  fromMessageId?: string;
}

export type AgentPublishOutcome =
  | { status: 'published' | 'already_published'; revisionId: string }
  | { status: 'conflict'; reason: string };

export type AgentSetDefaultOutcome = { status: 'updated' | 'already_default' };

export interface AgentRevisionActivatorDeps {
  isBindingLive: (binding: AgentDebugBinding) => boolean;
  readDraftValidation: (
    binding: AgentDebugBinding,
  ) => Promise<readonly AgentValidationEvidence[]>;
  publish: (command: AgentPublishCommand) => Promise<AgentPublishOutcome>;
  setDefault: (command: AgentSetDefaultCommand) => Promise<AgentSetDefaultOutcome>;
  forkSession: (command: AgentForkCommand) => Promise<string>;
  createIdempotencyKey: () => string;
}

export type AgentActivationResult =
  | { status: 'activated'; revisionId: string; forkedSessionId?: string }
  | { status: 'published_not_activated'; revisionId: string; reason: string }
  | { status: 'stale'; reason: string }
  | { status: 'unvalidated'; reason: string }
  | { status: 'conflict'; reason: string }
  | { status: 'failed'; reason: string };

function reasonOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function hasPassingEvidence(
  evidence: readonly AgentValidationEvidence[],
  draftRevisionId: string,
): boolean {
  return evidence.some(
    entry => entry.status === 'passed' && entry.draftRevisionId === draftRevisionId,
  );
}

export function createAgentRevisionActivator(deps: AgentRevisionActivatorDeps) {
  async function publishAndActivate(
    request: AgentPublishAndActivateRequest,
  ): Promise<AgentActivationResult> {
    const { binding, action } = request;

    if (!deps.isBindingLive(binding)) {
      return {
        status: 'stale',
        reason: 'The draft moved on after this debug run, so it can no longer be published.',
      };
    }

    let evidence: readonly AgentValidationEvidence[];
    try {
      evidence = await deps.readDraftValidation(binding);
    } catch (error) {
      return { status: 'failed', reason: reasonOf(error, 'The draft validation could not be read.') };
    }

    if (!hasPassingEvidence(evidence, binding.draftRevisionId)) {
      return {
        status: 'unvalidated',
        reason: 'This exact draft revision has no passing debug run, so it cannot be published.',
      };
    }

    let published: AgentPublishOutcome;
    try {
      published = await deps.publish({
        scope: binding.scope,
        definitionId: binding.definitionId,
        draftId: binding.draftId,
        expectedBaseRevisionId: request.expectedBaseRevisionId,
        expectedDraftRevisionId: binding.draftRevisionId,
        idempotencyKey: deps.createIdempotencyKey(),
      });
    } catch (error) {
      return { status: 'failed', reason: reasonOf(error, 'The revision could not be published.') };
    }

    if (published.status === 'conflict') {
      return { status: 'conflict', reason: published.reason };
    }

    const { revisionId } = published;

    // Past this point the revision exists and is immutable. An activation
    // failure is reported against that fact rather than pretending nothing
    // happened.
    if (action.kind === 'continue') {
      return { status: 'activated', revisionId };
    }

    if (action.kind === 'fork') {
      try {
        const forkedSessionId = await deps.forkSession({
          sourceSessionId: binding.sourceSessionId,
          definitionId: binding.definitionId,
          revisionId,
          ...(action.forkFromMessageId ? { fromMessageId: action.forkFromMessageId } : {}),
        });
        return { status: 'activated', revisionId, forkedSessionId };
      } catch (error) {
        return {
          status: 'published_not_activated',
          revisionId,
          reason: reasonOf(error, 'The forked session could not be created.'),
        };
      }
    }

    try {
      await deps.setDefault({
        scope: binding.scope,
        definitionId: binding.definitionId,
        revisionId,
        expectedDefaultRevisionId: request.expectedDefaultRevisionId,
        idempotencyKey: deps.createIdempotencyKey(),
      });
      return { status: 'activated', revisionId };
    } catch (error) {
      return {
        status: 'published_not_activated',
        revisionId,
        reason: reasonOf(error, 'The default revision pointer could not be updated.'),
      };
    }
  }

  return { publishAndActivate };
}
