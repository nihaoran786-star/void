import {
  AgentAuthoringError,
  type AgentAuthoringGateway,
  type AgentDefinitionRecord,
  type AgentDefinitionScope,
  type AgentDraftRecord,
  type AgentPublishResult,
  type AgentRevisionContent,
  type AgentSetDefaultResult,
  type AgentValidationEvidenceInput,
  type GetAgentDefinitionInput,
  type ResolveAgentDefinitionByPersonaKeyInput,
  type OpenAgentDraftInput,
  type PublishAgentRevisionInput,
  type RecordAgentValidationInput,
  type ResolvedAgentDefinitionScope,
  type SaveAgentDraftInput,
  type SetAgentDefaultRevisionInput,
} from './AgentAuthoringGateway';

export interface GetAgentDefinitionRequest {
  scope: AgentDefinitionScope;
  definitionId: string;
}

export interface ResolveAgentDefinitionByPersonaKeyRequest {
  scope: AgentDefinitionScope;
  personaKey: string;
}

export interface OpenAgentDraftRequest {
  scope: AgentDefinitionScope;
  definitionId?: string;
  personaKey?: string;
  initialContent?: AgentRevisionContent;
  idempotencyKey: string;
}

export interface SaveAgentDraftRequest {
  scope: AgentDefinitionScope;
  definitionId: string;
  draftId: string;
  expectedDraftRevisionId: string;
  content: AgentRevisionContent;
  idempotencyKey: string;
}

export interface RecordAgentValidationRequest {
  scope: AgentDefinitionScope;
  definitionId: string;
  draftId: string;
  draftRevisionId: string;
  evidence: AgentValidationEvidenceInput;
  idempotencyKey: string;
}

export interface PublishAgentRevisionRequest {
  scope: AgentDefinitionScope;
  definitionId: string;
  draftId: string;
  expectedBaseRevisionId: string | null;
  expectedDraftRevisionId: string;
  idempotencyKey: string;
}

export interface SetAgentDefaultRevisionRequest {
  scope: AgentDefinitionScope;
  definitionId: string;
  revisionId: string;
  expectedDefaultRevisionId: string | null;
  idempotencyKey: string;
}

type RequiredIdErrorCode =
  | 'invalid_definition_id'
  | 'invalid_persona_key'
  | 'invalid_draft_id'
  | 'invalid_revision_id'
  | 'invalid_idempotency_key';

const REQUIRED_ID_LABELS: Record<RequiredIdErrorCode, string> = {
  invalid_definition_id: 'definition ID',
  invalid_persona_key: 'persona key',
  invalid_draft_id: 'draft ID',
  invalid_revision_id: 'revision ID',
  invalid_idempotency_key: 'idempotency key',
};

function normalizeRequiredId(value: string, code: RequiredIdErrorCode): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AgentAuthoringError(
      code,
      `A non-empty ${REQUIRED_ID_LABELS[code]} is required.`,
    );
  }
  return normalized;
}

function normalizeStringList(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function validatePersonaKeyForScope(
  personaKey: string,
  scope: ResolvedAgentDefinitionScope,
): string {
  const expectedPrefix = scope.level === 'user'
    ? 'user::void::'
    : 'project::void::';
  if (
    !personaKey.startsWith(expectedPrefix)
    || !personaKey.slice(expectedPrefix.length).trim()
  ) {
    throw new AgentAuthoringError(
      'validation_failed',
      'The Agent persona key does not match its authoring scope.',
      { retryable: false },
    );
  }
  return personaKey;
}

function normalizeContent(
  content: AgentRevisionContent,
  scope: ResolvedAgentDefinitionScope,
): AgentRevisionContent {
  const normalized = {
    personaKey: content.personaKey.trim(),
    displayName: content.displayName.trim(),
    description: content.description.trim(),
    prompt: content.prompt.trim(),
    tools: normalizeStringList(content.tools),
    readonly: content.readonly,
    review: content.review,
    model: content.model.trim(),
    allowedParentAgentIds: normalizeStringList(content.allowedParentAgentIds),
  };
  validatePersonaKeyForScope(normalized.personaKey, scope);
  if (!normalized.displayName || !normalized.description || !normalized.prompt) {
    throw new AgentAuthoringError(
      'validation_failed',
      'Agent revision content requires display name, description, and prompt.',
      { retryable: false },
    );
  }
  return normalized;
}

function normalizeEvidenceInput(
  evidence: AgentValidationEvidenceInput,
): AgentValidationEvidenceInput {
  return {
    status: evidence.status,
    ...(evidence.debugSessionId?.trim()
      ? { debugSessionId: evidence.debugSessionId.trim() }
      : {}),
    ...(evidence.testCaseId?.trim()
      ? { testCaseId: evidence.testCaseId.trim() }
      : {}),
    capabilitySnapshot: normalizeStringList(evidence.capabilitySnapshot),
    ...(evidence.message?.trim() ? { message: evidence.message.trim() } : {}),
  };
}

function normalizeOptionalId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeNullableRevision(value: string | null): string | null {
  return value === null
    ? null
    : normalizeRequiredId(value, 'invalid_revision_id');
}

function resolveScope(scope: AgentDefinitionScope): ResolvedAgentDefinitionScope {
  if (scope.level === 'user') {
    return scope;
  }
  const workspaceId = scope.workspace.workspaceId.trim();
  const workspacePath = scope.workspace.workspacePath.trim();
  if (!workspaceId || !workspacePath) {
    throw new AgentAuthoringError(
      'invalid_scope',
      'Project Agent authoring requires workspace ID and path facts.',
      { retryable: false },
    );
  }
  if (scope.workspace.backend === 'local') {
    return {
      level: 'project',
      workspace: { workspaceId, workspacePath, backend: 'local' },
    };
  }
  if (!scope.workspace.remoteConnectionId.trim()) {
    throw new AgentAuthoringError(
      'invalid_scope',
      'Remote project Agent authoring requires a connection identity.',
      { retryable: false },
    );
  }
  throw new AgentAuthoringError(
    'unsupported_remote_project',
    'Versioned project Agent authoring is not available for remote workspaces.',
    { retryable: false },
  );
}

function assertRecordScope(
  expected: ResolvedAgentDefinitionScope,
  record: AgentDefinitionRecord,
): void {
  assertScope(expected, record.scope);
}

function assertScope(
  expected: ResolvedAgentDefinitionScope,
  actual: ResolvedAgentDefinitionScope,
): void {
  const matches = expected.level === actual.level
    && (
      expected.level === 'user'
      || (
        actual.level === 'project'
        && expected.workspace.workspaceId === actual.workspace.workspaceId
        && expected.workspace.workspacePath === actual.workspace.workspacePath
        && expected.workspace.backend === actual.workspace.backend
      )
    );
  if (!matches) {
    throw new AgentAuthoringError(
      'workspace_scope_mismatch',
      'The returned Agent definition does not belong to the requested workspace.',
      { retryable: false },
    );
  }
}

function assertDraftScope(
  expected: ResolvedAgentDefinitionScope,
  draft: AgentDraftRecord,
): void {
  assertScope(expected, draft.scope);
}

function assertExactValidation(
  expectedDraftRevisionId: string,
  draft: AgentDraftRecord,
): void {
  if (
    draft.draftRevisionId !== expectedDraftRevisionId
    || draft.draftFingerprint !== expectedDraftRevisionId
    || draft.validationEvidence.length === 0
    || draft.validationEvidence.some(
      (evidence) => evidence.draftRevisionId !== expectedDraftRevisionId,
    )
  ) {
    throw new AgentAuthoringError(
      'stale_validation_evidence',
      'The stored validation evidence is not bound to the current draft revision.',
      { retryable: false },
    );
  }
}

function assertDraftFingerprint(draft: AgentDraftRecord): void {
  if (draft.draftFingerprint !== draft.draftRevisionId) {
    throw new AgentAuthoringError(
      'stale_validation_evidence',
      'The draft fingerprint must be the opaque draft revision identity.',
      { retryable: false },
    );
  }
}

export class AgentRevisionService {
  constructor(private readonly gateway: AgentAuthoringGateway) {}

  async get(request: GetAgentDefinitionRequest): Promise<AgentDefinitionRecord> {
    const input: GetAgentDefinitionInput = {
      scope: resolveScope(request.scope),
      definitionId: normalizeRequiredId(request.definitionId, 'invalid_definition_id'),
    };
    const record = await this.gateway.get(input);
    assertRecordScope(input.scope, record);
    return record;
  }

  /**
   * Resolves the definition a session's persona binding points at.
   *
   * Kept separate from openDraft, which also accepts a persona key but writes:
   * opening the studio to look at an agent must not create a draft.
   */
  async resolveByPersonaKey(
    request: ResolveAgentDefinitionByPersonaKeyRequest,
  ): Promise<AgentDefinitionRecord> {
    const scope = resolveScope(request.scope);
    const input: ResolveAgentDefinitionByPersonaKeyInput = {
      scope,
      personaKey: validatePersonaKeyForScope(
        normalizeRequiredId(request.personaKey, 'invalid_persona_key'),
        scope,
      ),
    };
    const record = await this.gateway.resolveByPersonaKey(input);
    assertRecordScope(input.scope, record);
    return record;
  }

  async openDraft(request: OpenAgentDraftRequest): Promise<AgentDraftRecord> {
    const scope = resolveScope(request.scope);
    const definitionId = normalizeOptionalId(request.definitionId);
    const normalizedPersonaKey = normalizeOptionalId(request.personaKey);
    const personaKey = normalizedPersonaKey
      ? validatePersonaKeyForScope(normalizedPersonaKey, scope)
      : undefined;
    const initialContent = request.initialContent
      ? normalizeContent(request.initialContent, scope)
      : undefined;
    if (!definitionId && !personaKey && !initialContent) {
      throw new AgentAuthoringError(
        'validation_failed',
        'Opening an Agent draft requires a definition ID, persona key, or initial content.',
        { retryable: false },
      );
    }
    const input: OpenAgentDraftInput = {
      scope,
      ...(definitionId ? { definitionId } : {}),
      ...(personaKey ? { personaKey } : {}),
      ...(initialContent ? { initialContent } : {}),
      idempotencyKey: normalizeRequiredId(
        request.idempotencyKey,
        'invalid_idempotency_key',
      ),
    };
    const draft = await this.gateway.openDraft(input);
    assertDraftScope(input.scope, draft);
    assertDraftFingerprint(draft);
    return draft;
  }

  async saveDraft(request: SaveAgentDraftRequest): Promise<AgentDraftRecord> {
    const scope = resolveScope(request.scope);
    const input: SaveAgentDraftInput = {
      scope,
      definitionId: normalizeRequiredId(
        request.definitionId,
        'invalid_definition_id',
      ),
      draftId: normalizeRequiredId(request.draftId, 'invalid_draft_id'),
      expectedDraftRevisionId: normalizeRequiredId(
        request.expectedDraftRevisionId,
        'invalid_revision_id',
      ),
      content: normalizeContent(request.content, scope),
      idempotencyKey: normalizeRequiredId(
        request.idempotencyKey,
        'invalid_idempotency_key',
      ),
    };
    const draft = await this.gateway.saveDraft(input);
    assertDraftScope(input.scope, draft);
    assertDraftFingerprint(draft);
    if (draft.validationEvidence.length !== 0) {
      throw new AgentAuthoringError(
        'stale_validation_evidence',
        'Saving a new draft revision must invalidate earlier validation evidence.',
        { retryable: false },
      );
    }
    return draft;
  }

  async recordValidation(
    request: RecordAgentValidationRequest,
  ): Promise<AgentDraftRecord> {
    const draftRevisionId = normalizeRequiredId(
      request.draftRevisionId,
      'invalid_revision_id',
    );
    const evidence = normalizeEvidenceInput(request.evidence);
    const input: RecordAgentValidationInput = {
      scope: resolveScope(request.scope),
      definitionId: normalizeRequiredId(
        request.definitionId,
        'invalid_definition_id',
      ),
      draftId: normalizeRequiredId(request.draftId, 'invalid_draft_id'),
      draftRevisionId,
      evidence,
      idempotencyKey: normalizeRequiredId(
        request.idempotencyKey,
        'invalid_idempotency_key',
      ),
    };
    const draft = await this.gateway.recordValidation(input);
    assertDraftScope(input.scope, draft);
    assertDraftFingerprint(draft);
    assertExactValidation(draftRevisionId, draft);
    return draft;
  }

  async publish(
    request: PublishAgentRevisionRequest,
  ): Promise<AgentPublishResult> {
    const input: PublishAgentRevisionInput = {
      scope: resolveScope(request.scope),
      definitionId: normalizeRequiredId(
        request.definitionId,
        'invalid_definition_id',
      ),
      draftId: normalizeRequiredId(request.draftId, 'invalid_draft_id'),
      expectedBaseRevisionId: normalizeNullableRevision(
        request.expectedBaseRevisionId,
      ),
      expectedDraftRevisionId: normalizeRequiredId(
        request.expectedDraftRevisionId,
        'invalid_revision_id',
      ),
      idempotencyKey: normalizeRequiredId(
        request.idempotencyKey,
        'invalid_idempotency_key',
      ),
    };
    const result = await this.gateway.publish(input);
    assertRecordScope(input.scope, result.definition);
    assertDraftScope(input.scope, result.draft);
    assertDraftFingerprint(result.draft);
    assertExactValidation(input.expectedDraftRevisionId, result.draft);
    return result;
  }

  async setDefault(
    request: SetAgentDefaultRevisionRequest,
  ): Promise<AgentSetDefaultResult> {
    const input: SetAgentDefaultRevisionInput = {
      scope: resolveScope(request.scope),
      definitionId: normalizeRequiredId(
        request.definitionId,
        'invalid_definition_id',
      ),
      revisionId: normalizeRequiredId(request.revisionId, 'invalid_revision_id'),
      expectedDefaultRevisionId: normalizeNullableRevision(
        request.expectedDefaultRevisionId,
      ),
      idempotencyKey: normalizeRequiredId(
        request.idempotencyKey,
        'invalid_idempotency_key',
      ),
    };
    const result = await this.gateway.setDefault(input);
    assertRecordScope(input.scope, result.definition);
    return result;
  }
}
