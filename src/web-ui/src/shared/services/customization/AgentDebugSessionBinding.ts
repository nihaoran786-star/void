import type {
  AgentDefinitionScope,
  AgentValidationEvidenceInput,
} from './AgentAuthoringGateway';
import type { AgentDebugDraft } from './AgentDebugDraft';
import type { AgentDebugSessionHandle } from './AgentDebugRuntimeService';

/**
 * Binds an isolated agent_debug session to one exact draft revision.
 *
 * The persona revision is content-derived and validated per turn, so editing a
 * draft invalidates the session that was running it. The debug runtime already
 * replaces the session when the draft content changes, but it will still send on
 * a handle the caller happens to be holding. That is the gap this layer closes:
 * a binding is bound to a `draftRevisionId`, and once that revision is
 * superseded or released the binding fails closed for both sending and evidence.
 *
 * Validation evidence is therefore always attributed to the revision that
 * actually ran, never to a newer draft the user has since typed.
 */

export interface AgentDebugBinding {
  readonly debugSessionId: string;
  readonly sourceSessionId: string;
  readonly scope: AgentDefinitionScope;
  readonly definitionId: string;
  readonly draftId: string;
  readonly draftRevisionId: string;
  readonly capabilitySnapshot: readonly string[];
}

export interface AgentDebugBindRequest {
  scope: AgentDefinitionScope;
  definitionId: string;
  draftId: string;
  draftRevisionId: string;
  sourceSessionId: string;
  draft: AgentDebugDraft;
}

export interface AgentDebugRecordValidationRequest {
  scope: AgentDefinitionScope;
  definitionId: string;
  draftId: string;
  draftRevisionId: string;
  evidence: AgentValidationEvidenceInput;
  idempotencyKey: string;
}

export interface AgentDebugSessionBinderDeps {
  createDebugSession: (
    draft: AgentDebugDraft,
    workspacePath: string,
  ) => Promise<AgentDebugSessionHandle>;
  disposeDebugSession: (handle: AgentDebugSessionHandle) => Promise<void>;
  sendMessage: (handle: AgentDebugSessionHandle, message: string) => Promise<void>;
  recordValidation: (request: AgentDebugRecordValidationRequest) => Promise<void>;
  createIdempotencyKey: () => string;
}

export type AgentDebugBindResult =
  | { status: 'bound'; binding: AgentDebugBinding }
  | { status: 'failed'; reason: string };

export type AgentDebugSendResult =
  | { status: 'sent' }
  | { status: 'stale'; reason: string }
  | { status: 'failed'; reason: string };

export type AgentDebugRecordResult =
  | { status: 'recorded' }
  | { status: 'stale'; reason: string }
  | { status: 'failed'; reason: string };

export interface AgentDebugOutcome {
  status: 'passed' | 'failed';
  testCaseId?: string;
  message?: string;
}

const STALE_REASON =
  'This debug run belongs to an earlier draft revision and can no longer send or record evidence.';

function bindingKey(request: { definitionId: string; draftId: string }): string {
  return `${request.definitionId}::${request.draftId}`;
}

function workspacePathOf(scope: AgentDefinitionScope): string {
  return scope.level === 'project' ? scope.workspace.workspacePath : '';
}

function snapshotCapabilities(draft: AgentDebugDraft): string[] {
  const seen = new Set<string>();
  for (const tool of draft.tools) {
    const normalized = tool.trim();
    if (normalized) seen.add(normalized);
  }
  return Array.from(seen).sort();
}

function reasonOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface LiveBinding {
  binding: AgentDebugBinding;
  handle: AgentDebugSessionHandle;
}

export function createAgentDebugSessionBinder(deps: AgentDebugSessionBinderDeps) {
  const live = new Map<string, LiveBinding>();

  function resolveLive(binding: AgentDebugBinding): LiveBinding | null {
    const entry = live.get(bindingKey(binding));
    if (!entry) return null;
    // One identity check is enough: bind() always creates a fresh session for a
    // new draft revision, so a superseded binding never matches the live one.
    if (entry.binding.debugSessionId !== binding.debugSessionId) return null;
    return entry;
  }

  async function releaseEntry(entry: LiveBinding): Promise<void> {
    live.delete(bindingKey(entry.binding));
    await deps.disposeDebugSession(entry.handle);
  }

  async function bind(request: AgentDebugBindRequest): Promise<AgentDebugBindResult> {
    const key = bindingKey(request);
    const existing = live.get(key);
    if (existing) {
      if (existing.binding.draftRevisionId === request.draftRevisionId) {
        return { status: 'bound', binding: existing.binding };
      }
      // The draft moved on: the running session is pinned to a revision the user
      // has already replaced, so it must go before a new one is created.
      try {
        await releaseEntry(existing);
      } catch (error) {
        return { status: 'failed', reason: reasonOf(error, 'The previous debug session could not be released.') };
      }
    }

    let handle: AgentDebugSessionHandle;
    try {
      handle = await deps.createDebugSession(request.draft, workspacePathOf(request.scope));
    } catch (error) {
      return { status: 'failed', reason: reasonOf(error, 'The debug session could not be created.') };
    }

    const binding: AgentDebugBinding = {
      debugSessionId: handle.sessionId,
      sourceSessionId: request.sourceSessionId,
      scope: request.scope,
      definitionId: request.definitionId,
      draftId: request.draftId,
      draftRevisionId: request.draftRevisionId,
      capabilitySnapshot: snapshotCapabilities(request.draft),
    };
    live.set(key, { binding, handle });
    return { status: 'bound', binding };
  }

  async function send(
    binding: AgentDebugBinding,
    message: string,
  ): Promise<AgentDebugSendResult> {
    const entry = resolveLive(binding);
    if (!entry) return { status: 'stale', reason: STALE_REASON };
    try {
      await deps.sendMessage(entry.handle, message);
      return { status: 'sent' };
    } catch (error) {
      return { status: 'failed', reason: reasonOf(error, 'The debug message could not be sent.') };
    }
  }

  async function recordOutcome(
    binding: AgentDebugBinding,
    outcome: AgentDebugOutcome,
  ): Promise<AgentDebugRecordResult> {
    const entry = resolveLive(binding);
    if (!entry) return { status: 'stale', reason: STALE_REASON };
    try {
      await deps.recordValidation({
        scope: entry.binding.scope,
        definitionId: entry.binding.definitionId,
        draftId: entry.binding.draftId,
        draftRevisionId: entry.binding.draftRevisionId,
        evidence: {
          status: outcome.status,
          debugSessionId: entry.binding.debugSessionId,
          capabilitySnapshot: [...entry.binding.capabilitySnapshot],
          ...(outcome.testCaseId ? { testCaseId: outcome.testCaseId } : {}),
          ...(outcome.message ? { message: outcome.message } : {}),
        },
        idempotencyKey: deps.createIdempotencyKey(),
      });
      return { status: 'recorded' };
    } catch (error) {
      return { status: 'failed', reason: reasonOf(error, 'The validation evidence could not be recorded.') };
    }
  }

  async function release(binding: AgentDebugBinding): Promise<void> {
    const entry = resolveLive(binding);
    if (!entry) return;
    await releaseEntry(entry);
  }

  async function releaseAll(): Promise<void> {
    const entries = Array.from(live.values());
    live.clear();
    for (const entry of entries) {
      await deps.disposeDebugSession(entry.handle);
    }
  }

  return { bind, send, recordOutcome, release, releaseAll };
}
