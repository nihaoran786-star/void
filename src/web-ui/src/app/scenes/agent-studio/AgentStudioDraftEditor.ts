import type {
  AgentDefinitionScope,
  AgentDraftRecord,
  AgentRevisionContent,
} from '@/shared/services/customization/AgentAuthoringGateway';
import type {
  OpenAgentDraftRequest,
  SaveAgentDraftRequest,
} from '@/shared/services/customization/AgentRevisionService';

/**
 * Edits an agent draft through the revision catalog and nothing else.
 *
 * The legacy Agent creation page is still live and still writes the old `.md`
 * source, so a second write path here would dual-write the same agent. That is
 * prevented structurally rather than by convention: a core-boundaries rule
 * forbids this directory from referencing the subagent API or any file write,
 * so the only way out of this module is the catalog draft interface.
 */

export interface AgentStudioDraftEditorDeps {
  openDraft: (request: OpenAgentDraftRequest) => Promise<AgentDraftRecord>;
  saveDraft: (request: SaveAgentDraftRequest) => Promise<AgentDraftRecord>;
  createIdempotencyKey: () => string;
}

export interface AgentStudioOpenRequest {
  scope: AgentDefinitionScope;
  definitionId: string;
}

export type AgentStudioOpenResult =
  | { status: 'open'; draft: AgentDraftRecord }
  | { status: 'failed'; reason: string };

export type AgentStudioSaveResult =
  | { status: 'saved'; draft: AgentDraftRecord }
  | { status: 'invalid'; reason: string }
  | { status: 'failed'; reason: string };

function reasonOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function validateContent(
  draft: AgentDraftRecord,
  content: AgentRevisionContent,
): string | null {
  if (content.personaKey.trim() !== draft.content.personaKey.trim()) {
    // The persona key is the identity the running session resolves against.
    // Editing it here would silently retarget the draft at another agent.
    return 'An agent draft cannot change its persona key.';
  }
  if (!content.prompt.trim()) {
    return 'An agent prompt cannot be empty.';
  }
  if (!content.displayName.trim()) {
    return 'An agent display name cannot be empty.';
  }
  return null;
}

export function createAgentStudioDraftEditor(deps: AgentStudioDraftEditorDeps) {
  async function open(request: AgentStudioOpenRequest): Promise<AgentStudioOpenResult> {
    try {
      const draft = await deps.openDraft({
        scope: request.scope,
        definitionId: request.definitionId,
        idempotencyKey: deps.createIdempotencyKey(),
      });
      return { status: 'open', draft };
    } catch (error) {
      return { status: 'failed', reason: reasonOf(error, 'The draft could not be opened.') };
    }
  }

  async function save(
    draft: AgentDraftRecord,
    content: AgentRevisionContent,
  ): Promise<AgentStudioSaveResult> {
    const invalid = validateContent(draft, content);
    if (invalid) {
      return { status: 'invalid', reason: invalid };
    }
    try {
      const saved = await deps.saveDraft({
        scope: draft.scope,
        definitionId: draft.definitionId,
        draftId: draft.draftId,
        // Exact compare-and-swap: a save built on a stale revision must be
        // rejected by the catalog rather than overwrite a concurrent edit.
        expectedDraftRevisionId: draft.draftRevisionId,
        content,
        idempotencyKey: deps.createIdempotencyKey(),
      });
      return { status: 'saved', draft: saved };
    } catch (error) {
      return { status: 'failed', reason: reasonOf(error, 'The draft could not be saved.') };
    }
  }

  return { open, save };
}
