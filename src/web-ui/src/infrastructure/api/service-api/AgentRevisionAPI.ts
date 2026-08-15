import { api } from './ApiClient';

export type AgentRevisionCommandErrorCode =
  | 'validation_failed'
  | 'not_found'
  | 'revision_conflict'
  | 'idempotency_conflict'
  | 'source_conflict'
  | 'unsupported_remote_project'
  | 'workspace_scope_mismatch'
  | 'io'
  | 'serialization'
  | 'rollback_failed';

export type AgentRevisionConflictKind =
  | 'base_revision'
  | 'draft_revision'
  | 'default_revision'
  | 'idempotency_key';

export interface AgentRevisionCommandErrorPayload {
  code: AgentRevisionCommandErrorCode;
  message: string;
  retryable?: boolean;
  recoveryPath?: string;
  conflictKind?: AgentRevisionConflictKind;
  expectedRevisionId?: string;
  actualRevisionId?: string;
}

const ERROR_CODES = new Set<AgentRevisionCommandErrorCode>([
  'validation_failed',
  'not_found',
  'revision_conflict',
  'idempotency_conflict',
  'source_conflict',
  'unsupported_remote_project',
  'workspace_scope_mismatch',
  'io',
  'serialization',
  'rollback_failed',
]);

const CONFLICT_KINDS = new Set<AgentRevisionConflictKind>([
  'base_revision',
  'draft_revision',
  'default_revision',
  'idempotency_key',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

export function extractAgentRevisionCommandError(
  error: unknown,
): AgentRevisionCommandErrorPayload | null {
  const root = asRecord(error);
  const details = asRecord(root?.details);
  const context = asRecord(root?.context);
  const contextOriginal = asRecord(context?.originalError);
  const contextDetails = asRecord(contextOriginal?.details);
  const candidates: unknown[] = [
    error,
    details?.originalError,
    context?.originalError,
    contextDetails?.originalError,
  ];
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (!record) continue;
    const code = record.code;
    const message = record.message;
    if (
      typeof code !== 'string'
      || !ERROR_CODES.has(code as AgentRevisionCommandErrorCode)
      || typeof message !== 'string'
    ) continue;
    const conflictKind = record?.conflictKind;
    return {
      code: code as AgentRevisionCommandErrorCode,
      message,
      retryable: typeof record.retryable === 'boolean'
        ? record.retryable
        : undefined,
      recoveryPath: typeof record.recoveryPath === 'string'
        ? record.recoveryPath
        : undefined,
      conflictKind: typeof conflictKind === 'string'
        && CONFLICT_KINDS.has(conflictKind as AgentRevisionConflictKind)
        ? conflictKind as AgentRevisionConflictKind
        : undefined,
      expectedRevisionId: typeof record.expectedRevisionId === 'string'
        ? record.expectedRevisionId
        : undefined,
      actualRevisionId: typeof record.actualRevisionId === 'string'
        ? record.actualRevisionId
        : undefined,
    };
  }
  return null;
}

export type AgentRevisionScopeDto =
  | { level: 'user' }
  | {
      level: 'project';
      workspace: {
        workspaceId: string;
        workspacePath: string;
        backend: 'local';
      };
    };

export interface AgentRevisionContentDto {
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

export interface AgentRevisionRecordDto {
  revisionId: string;
  definitionId: string;
  content: AgentRevisionContentDto;
  createdAt: string;
  legacyRuntimeRevisionAliases: string[];
}

export interface AgentLegacySourceSummaryDto {
  sourcePath: string;
  importedRuntimeRevisionAlias: string;
}

export interface AgentDefinitionRecordDto {
  definitionId: string;
  personaKey: string;
  scope: AgentRevisionScopeDto;
  defaultRevisionId: string | null;
  latestPublishedRevisionId: string | null;
  revisions: AgentRevisionRecordDto[];
  drafts: AgentDraftRecordDto[];
  legacySource: AgentLegacySourceSummaryDto | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentDraftStatusDto =
  | 'editing'
  | 'validating'
  | 'validated'
  | 'publishing'
  | 'published'
  | 'invalid'
  | 'failed'
  | 'stale'
  | 'conflict';

export interface AgentValidationEvidenceInputDto {
  status: 'passed' | 'failed';
  debugSessionId?: string;
  testCaseId?: string;
  capabilitySnapshot: string[];
  message?: string;
}

export interface AgentValidationEvidenceDto
  extends AgentValidationEvidenceInputDto {
  validationId: string;
  draftRevisionId: string;
  validatedAt: string;
}

export interface AgentDraftRecordDto {
  draftId: string;
  draftRevisionId: string;
  draftFingerprint: string;
  definitionId: string;
  scope: AgentRevisionScopeDto;
  baseRevisionId: string | null;
  status: AgentDraftStatusDto;
  content: AgentRevisionContentDto;
  validationEvidence: AgentValidationEvidenceDto[];
  updatedAt: string;
}

export interface GetAgentDefinitionRequestDto {
  scope: AgentRevisionScopeDto;
  definitionId: string;
}

export interface OpenAgentDraftRequestDto {
  scope: AgentRevisionScopeDto;
  definitionId?: string;
  personaKey?: string;
  initialContent?: AgentRevisionContentDto;
  idempotencyKey: string;
}

export interface SaveAgentDraftRequestDto {
  scope: AgentRevisionScopeDto;
  definitionId: string;
  draftId: string;
  expectedDraftRevisionId: string;
  content: AgentRevisionContentDto;
  idempotencyKey: string;
}

export interface RecordAgentValidationRequestDto {
  scope: AgentRevisionScopeDto;
  definitionId: string;
  draftId: string;
  draftRevisionId: string;
  evidence: AgentValidationEvidenceInputDto;
  idempotencyKey: string;
}

export interface PublishAgentRevisionRequestDto {
  scope: AgentRevisionScopeDto;
  definitionId: string;
  draftId: string;
  expectedBaseRevisionId: string | null;
  expectedDraftRevisionId: string;
  idempotencyKey: string;
}

export interface AgentPublishResultDto {
  status: 'published' | 'already_published';
  definition: AgentDefinitionRecordDto;
  revision: AgentRevisionRecordDto;
  draft: AgentDraftRecordDto;
}

export interface SetAgentDefaultRevisionRequestDto {
  scope: AgentRevisionScopeDto;
  definitionId: string;
  revisionId: string;
  expectedDefaultRevisionId: string | null;
  idempotencyKey: string;
}

export interface AgentSetDefaultResultDto {
  status: 'updated' | 'already_default';
  definition: AgentDefinitionRecordDto;
}

export class AgentRevisionAPI {
  get(request: GetAgentDefinitionRequestDto): Promise<AgentDefinitionRecordDto> {
    return api.invoke<AgentDefinitionRecordDto>('get_agent_definition_record', {
      request,
    });
  }

  openDraft(request: OpenAgentDraftRequestDto): Promise<AgentDraftRecordDto> {
    return api.invoke<AgentDraftRecordDto>('open_agent_revision_draft', {
      request,
    });
  }

  saveDraft(request: SaveAgentDraftRequestDto): Promise<AgentDraftRecordDto> {
    return api.invoke<AgentDraftRecordDto>('save_agent_revision_draft', {
      request,
    });
  }

  recordValidation(
    request: RecordAgentValidationRequestDto,
  ): Promise<AgentDraftRecordDto> {
    return api.invoke<AgentDraftRecordDto>('record_agent_revision_validation', {
      request,
    });
  }

  publish(
    request: PublishAgentRevisionRequestDto,
  ): Promise<AgentPublishResultDto> {
    return api.invoke<AgentPublishResultDto>('publish_agent_revision', {
      request,
    });
  }

  setDefault(
    request: SetAgentDefaultRevisionRequestDto,
  ): Promise<AgentSetDefaultResultDto> {
    return api.invoke<AgentSetDefaultResultDto>('set_agent_default_revision', {
      request,
    });
  }
}

export const agentRevisionAPI = new AgentRevisionAPI();
