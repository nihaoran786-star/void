export interface AgentLocalWorkspaceFacts {
  workspaceId: string;
  workspacePath: string;
  backend: 'local';
}

export interface AgentRemoteWorkspaceFacts {
  workspaceId: string;
  workspacePath: string;
  backend: 'remote';
  remoteConnectionId: string;
  remoteHost?: string;
}

export type AgentWorkspaceFacts =
  | AgentLocalWorkspaceFacts
  | AgentRemoteWorkspaceFacts;

export type AgentDefinitionScope =
  | { level: 'user' }
  | { level: 'project'; workspace: AgentWorkspaceFacts };

export type ResolvedAgentDefinitionScope =
  | { level: 'user' }
  | { level: 'project'; workspace: AgentLocalWorkspaceFacts };

export interface AgentRevisionContent {
  personaKey: string;
  displayName: string;
  description: string;
  prompt: string;
  tools: string[];
  readonly: boolean;
  review: boolean;
  model: string;
  allowedParentAgentIds: string[];
}

export interface AgentRevisionRecord {
  revisionId: string;
  definitionId: string;
  content: AgentRevisionContent;
  createdAt: string;
  legacyRuntimeRevisionAliases: string[];
}

export interface AgentLegacySourceFacts {
  sourcePath: string;
  importedRuntimeRevisionAlias: string;
}

export type AgentDraftStatus =
  | 'editing'
  | 'validating'
  | 'validated'
  | 'publishing'
  | 'published'
  | 'invalid'
  | 'failed'
  | 'stale'
  | 'conflict';

export interface AgentValidationEvidenceInput {
  status: 'passed' | 'failed';
  debugSessionId?: string;
  testCaseId?: string;
  capabilitySnapshot: string[];
  message?: string;
}

export interface AgentValidationEvidence extends AgentValidationEvidenceInput {
  validationId: string;
  draftRevisionId: string;
  validatedAt: string;
}

export interface AgentDraftRecord {
  draftId: string;
  draftRevisionId: string;
  draftFingerprint: string;
  definitionId: string;
  scope: ResolvedAgentDefinitionScope;
  baseRevisionId: string | null;
  status: AgentDraftStatus;
  content: AgentRevisionContent;
  validationEvidence: AgentValidationEvidence[];
  updatedAt: string;
}

export interface AgentDefinitionRecord {
  definitionId: string;
  personaKey: string;
  scope: ResolvedAgentDefinitionScope;
  defaultRevisionId: string | null;
  latestPublishedRevisionId: string | null;
  revisions: AgentRevisionRecord[];
  drafts: AgentDraftRecord[];
  legacySource: AgentLegacySourceFacts | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetAgentDefinitionInput {
  scope: ResolvedAgentDefinitionScope;
  definitionId: string;
}

export interface OpenAgentDraftInput {
  scope: ResolvedAgentDefinitionScope;
  definitionId?: string;
  personaKey?: string;
  initialContent?: AgentRevisionContent;
  idempotencyKey: string;
}

export interface SaveAgentDraftInput {
  scope: ResolvedAgentDefinitionScope;
  definitionId: string;
  draftId: string;
  expectedDraftRevisionId: string;
  content: AgentRevisionContent;
  idempotencyKey: string;
}

export interface RecordAgentValidationInput {
  scope: ResolvedAgentDefinitionScope;
  definitionId: string;
  draftId: string;
  draftRevisionId: string;
  evidence: AgentValidationEvidenceInput;
  idempotencyKey: string;
}

export interface PublishAgentRevisionInput {
  scope: ResolvedAgentDefinitionScope;
  definitionId: string;
  draftId: string;
  expectedBaseRevisionId: string | null;
  expectedDraftRevisionId: string;
  idempotencyKey: string;
}

export interface AgentPublishResult {
  status: 'published' | 'already_published';
  definition: AgentDefinitionRecord;
  revision: AgentRevisionRecord;
  draft: AgentDraftRecord;
}

export interface SetAgentDefaultRevisionInput {
  scope: ResolvedAgentDefinitionScope;
  definitionId: string;
  revisionId: string;
  expectedDefaultRevisionId: string | null;
  idempotencyKey: string;
}

export interface AgentSetDefaultResult {
  status: 'updated' | 'already_default';
  definition: AgentDefinitionRecord;
}

export interface AgentAuthoringGateway {
  get(input: GetAgentDefinitionInput): Promise<AgentDefinitionRecord>;
  openDraft(input: OpenAgentDraftInput): Promise<AgentDraftRecord>;
  saveDraft(input: SaveAgentDraftInput): Promise<AgentDraftRecord>;
  recordValidation(input: RecordAgentValidationInput): Promise<AgentDraftRecord>;
  publish(input: PublishAgentRevisionInput): Promise<AgentPublishResult>;
  setDefault(input: SetAgentDefaultRevisionInput): Promise<AgentSetDefaultResult>;
}

export type AgentAuthoringErrorCode =
  | 'invalid_scope'
  | 'invalid_definition_id'
  | 'invalid_persona_key'
  | 'invalid_draft_id'
  | 'invalid_revision_id'
  | 'invalid_idempotency_key'
  | 'unsupported_transport'
  | 'unsupported_remote_project'
  | 'workspace_scope_mismatch'
  | 'not_found'
  | 'revision_conflict'
  | 'idempotency_conflict'
  | 'source_conflict'
  | 'validation_failed'
  | 'stale_validation_evidence'
  | 'read_failed'
  | 'write_failed'
  | 'publish_failed'
  | 'serialization_failed'
  | 'rollback_failed';

export interface AgentAuthoringErrorFacts {
  retryable?: boolean;
  recoveryPath?: string;
  conflictKind?: AgentAuthoringConflictKind;
  expectedRevisionId?: string;
  actualRevisionId?: string;
  cause?: unknown;
}

export type AgentAuthoringConflictKind =
  | 'base_revision'
  | 'draft_revision'
  | 'default_revision'
  | 'idempotency_key';

export class AgentAuthoringError extends Error {
  readonly retryable?: boolean;
  readonly recoveryPath?: string;
  readonly conflictKind?: AgentAuthoringConflictKind;
  readonly expectedRevisionId?: string;
  readonly actualRevisionId?: string;
  readonly cause?: unknown;

  constructor(
    public readonly code: AgentAuthoringErrorCode,
    public readonly causeMessage: string,
    facts: AgentAuthoringErrorFacts = {},
  ) {
    super(code);
    this.name = 'AgentAuthoringError';
    this.retryable = facts.retryable;
    this.recoveryPath = facts.recoveryPath;
    this.conflictKind = facts.conflictKind;
    this.expectedRevisionId = facts.expectedRevisionId;
    this.actualRevisionId = facts.actualRevisionId;
    this.cause = facts.cause;
  }
}
