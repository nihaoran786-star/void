import {
  agentRevisionAPI,
  extractAgentRevisionCommandError,
  type AgentDefinitionRecordDto,
  type AgentDraftRecordDto,
  type AgentPublishResultDto,
  type AgentSetDefaultResultDto,
  type AgentRevisionContentDto,
  type AgentRevisionRecordDto,
  type AgentRevisionScopeDto,
  type GetAgentDefinitionRequestDto,
  type OpenAgentDraftRequestDto,
  type PublishAgentRevisionRequestDto,
  type RecordAgentValidationRequestDto,
  type SaveAgentDraftRequestDto,
  type SetAgentDefaultRevisionRequestDto,
} from '@/infrastructure/api/service-api/AgentRevisionAPI';
import {
  AgentAuthoringError,
  type AgentAuthoringErrorCode,
  type AgentAuthoringGateway,
  type AgentDefinitionRecord,
  type AgentDraftRecord,
  type AgentPublishResult,
  type AgentRevisionContent,
  type AgentRevisionRecord,
  type AgentSetDefaultResult,
  type GetAgentDefinitionInput,
  type OpenAgentDraftInput,
  type PublishAgentRevisionInput,
  type RecordAgentValidationInput,
  type ResolvedAgentDefinitionScope,
  type SaveAgentDraftInput,
  type SetAgentDefaultRevisionInput,
} from '../AgentAuthoringGateway';

function toDomainError(
  error: unknown,
  fallbackCode: AgentAuthoringErrorCode,
): AgentAuthoringError {
  if (error instanceof AgentAuthoringError) return error;
  const payload = extractAgentRevisionCommandError(error);
  if (!payload) {
    return new AgentAuthoringError(
      fallbackCode,
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
  const code: AgentAuthoringErrorCode = payload.code === 'io'
    ? fallbackCode
    : payload.code === 'serialization'
      ? 'serialization_failed'
      : payload.code;
  return new AgentAuthoringError(code, payload.message, {
    retryable: payload.retryable,
    recoveryPath: payload.recoveryPath,
    conflictKind: payload.conflictKind,
    expectedRevisionId: payload.expectedRevisionId,
    actualRevisionId: payload.actualRevisionId,
    cause: error,
  });
}

async function runApi<T>(
  fallbackCode: AgentAuthoringErrorCode,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toDomainError(error, fallbackCode);
  }
}

export interface AgentRevisionApiPort {
  get(request: GetAgentDefinitionRequestDto): Promise<AgentDefinitionRecordDto>;
  openDraft(request: OpenAgentDraftRequestDto): Promise<AgentDraftRecordDto>;
  recordValidation(
    request: RecordAgentValidationRequestDto,
  ): Promise<AgentDraftRecordDto>;
  publish(request: PublishAgentRevisionRequestDto): Promise<AgentPublishResultDto>;
  setDefault(
    request: SetAgentDefaultRevisionRequestDto,
  ): Promise<AgentSetDefaultResultDto>;
  saveDraft(request: SaveAgentDraftRequestDto): Promise<AgentDraftRecordDto>;
}

function toApiScope(scope: ResolvedAgentDefinitionScope): AgentRevisionScopeDto {
  if (scope.level === 'user') return { level: 'user' };
  return {
    level: 'project',
    workspace: {
      workspaceId: scope.workspace.workspaceId,
      workspacePath: scope.workspace.workspacePath,
      backend: 'local',
    },
  };
}

function toDomainScope(scope: AgentRevisionScopeDto): ResolvedAgentDefinitionScope {
  if (scope.level === 'user') return { level: 'user' };
  return {
    level: 'project',
    workspace: {
      workspaceId: scope.workspace.workspaceId,
      workspacePath: scope.workspace.workspacePath,
      backend: 'local',
    },
  };
}

function toApiContent(content: AgentRevisionContent): AgentRevisionContentDto {
  return {
    personaKey: content.personaKey,
    displayName: content.displayName,
    description: content.description,
    prompt: content.prompt,
    tools: [...content.tools],
    readonly: content.readonly,
    review: content.review,
    model: content.model,
    allowedParentAgentIds: [...content.allowedParentAgentIds],
  };
}

function toDomainContent(content: AgentRevisionContentDto): AgentRevisionContent {
  return {
    personaKey: content.personaKey,
    displayName: content.displayName,
    description: content.description,
    prompt: content.prompt,
    tools: [...content.tools],
    readonly: content.readonly,
    review: content.review,
    model: content.model,
    allowedParentAgentIds: [...content.allowedParentAgentIds],
  };
}

function toDomainRevision(record: AgentRevisionRecordDto): AgentRevisionRecord {
  return {
    revisionId: record.revisionId,
    definitionId: record.definitionId,
    content: toDomainContent(record.content),
    createdAt: record.createdAt,
    legacyRuntimeRevisionAliases: [...record.legacyRuntimeRevisionAliases],
  };
}

function toDomainDefinition(record: AgentDefinitionRecordDto): AgentDefinitionRecord {
  return {
    definitionId: record.definitionId,
    personaKey: record.personaKey,
    scope: toDomainScope(record.scope),
    defaultRevisionId: record.defaultRevisionId,
    latestPublishedRevisionId: record.latestPublishedRevisionId,
    revisions: record.revisions.map(toDomainRevision),
    drafts: record.drafts.map(toDomainDraft),
    legacySource: record.legacySource
      ? {
          sourcePath: record.legacySource.sourcePath,
          importedRuntimeRevisionAlias:
            record.legacySource.importedRuntimeRevisionAlias,
        }
      : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toDomainDraft(record: AgentDraftRecordDto): AgentDraftRecord {
  return {
    draftId: record.draftId,
    draftRevisionId: record.draftRevisionId,
    draftFingerprint: record.draftFingerprint,
    definitionId: record.definitionId,
    scope: toDomainScope(record.scope),
    baseRevisionId: record.baseRevisionId,
    status: record.status,
    content: toDomainContent(record.content),
    validationEvidence: record.validationEvidence.map((evidence) => ({
      validationId: evidence.validationId,
      draftRevisionId: evidence.draftRevisionId,
      status: evidence.status,
      validatedAt: evidence.validatedAt,
      ...(evidence.debugSessionId
        ? { debugSessionId: evidence.debugSessionId }
        : {}),
      ...(evidence.testCaseId ? { testCaseId: evidence.testCaseId } : {}),
      capabilitySnapshot: [...evidence.capabilitySnapshot],
      ...(evidence.message ? { message: evidence.message } : {}),
    })),
    updatedAt: record.updatedAt,
  };
}

export class DesktopAgentAuthoringAdapter implements AgentAuthoringGateway {
  constructor(
    private readonly api: AgentRevisionApiPort = agentRevisionAPI,
  ) {}

  async get(input: GetAgentDefinitionInput): Promise<AgentDefinitionRecord> {
    return runApi('read_failed', async () => {
      const record = await this.api.get({
        scope: toApiScope(input.scope),
        definitionId: input.definitionId,
      });
      return toDomainDefinition(record);
    });
  }

  async openDraft(input: OpenAgentDraftInput): Promise<AgentDraftRecord> {
    return runApi('write_failed', async () => {
      const record = await this.api.openDraft({
        scope: toApiScope(input.scope),
        ...(input.definitionId ? { definitionId: input.definitionId } : {}),
        ...(input.personaKey ? { personaKey: input.personaKey } : {}),
        ...(input.initialContent
          ? { initialContent: toApiContent(input.initialContent) }
          : {}),
        idempotencyKey: input.idempotencyKey,
      });
      return toDomainDraft(record);
    });
  }

  async saveDraft(input: SaveAgentDraftInput): Promise<AgentDraftRecord> {
    return runApi('write_failed', async () => {
      const record = await this.api.saveDraft({
        scope: toApiScope(input.scope),
        definitionId: input.definitionId,
        draftId: input.draftId,
        expectedDraftRevisionId: input.expectedDraftRevisionId,
        content: toApiContent(input.content),
        idempotencyKey: input.idempotencyKey,
      });
      return toDomainDraft(record);
    });
  }

  async recordValidation(
    input: RecordAgentValidationInput,
  ): Promise<AgentDraftRecord> {
    return runApi('write_failed', async () => {
      const record = await this.api.recordValidation({
        scope: toApiScope(input.scope),
        definitionId: input.definitionId,
        draftId: input.draftId,
        draftRevisionId: input.draftRevisionId,
        evidence: {
          status: input.evidence.status,
          ...(input.evidence.debugSessionId
            ? { debugSessionId: input.evidence.debugSessionId }
            : {}),
          ...(input.evidence.testCaseId
            ? { testCaseId: input.evidence.testCaseId }
            : {}),
          capabilitySnapshot: [...input.evidence.capabilitySnapshot],
          ...(input.evidence.message ? { message: input.evidence.message } : {}),
        },
        idempotencyKey: input.idempotencyKey,
      });
      return toDomainDraft(record);
    });
  }

  async publish(input: PublishAgentRevisionInput): Promise<AgentPublishResult> {
    return runApi('publish_failed', async () => {
      const result = await this.api.publish({
        scope: toApiScope(input.scope),
        definitionId: input.definitionId,
        draftId: input.draftId,
        expectedBaseRevisionId: input.expectedBaseRevisionId,
        expectedDraftRevisionId: input.expectedDraftRevisionId,
        idempotencyKey: input.idempotencyKey,
      });
      return {
        status: result.status,
        definition: toDomainDefinition(result.definition),
        revision: toDomainRevision(result.revision),
        draft: toDomainDraft(result.draft),
      };
    });
  }

  async setDefault(
    input: SetAgentDefaultRevisionInput,
  ): Promise<AgentSetDefaultResult> {
    return runApi('write_failed', async () => {
      const result = await this.api.setDefault({
        scope: toApiScope(input.scope),
        definitionId: input.definitionId,
        revisionId: input.revisionId,
        expectedDefaultRevisionId: input.expectedDefaultRevisionId,
        idempotencyKey: input.idempotencyKey,
      });
      return {
        status: result.status,
        definition: toDomainDefinition(result.definition),
      };
    });
  }
}

export const desktopAgentAuthoringAdapter = new DesktopAgentAuthoringAdapter();
