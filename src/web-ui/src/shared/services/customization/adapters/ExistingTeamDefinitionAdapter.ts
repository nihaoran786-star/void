import { configAPI } from '@/infrastructure/api';
import {
  extractTeamDefinitionCommandError,
  type TeamDefinitionCommandErrorCode,
  type TeamDefinitionCommandErrorPayload,
} from '@/infrastructure/api/service-api/ConfigAPI';
import {
  TeamAuthoringError,
  type CreateTeamDefinitionInput,
  type DeleteTeamDefinitionInput,
  type GetTeamDefinitionInput,
  type InstallTeamDefinitionInput,
  type ListTeamDefinitionsInput,
  type TeamAuthoringErrorCode,
  type TeamAuthoringGateway,
  type UpdateTeamDefinitionInput,
} from '../TeamAuthoringGateway';

const DOMAIN_ERROR_CODES = new Set<TeamAuthoringErrorCode>([
  'unsupported_transport',
  'unsupported_remote_project',
  'not_found',
  'not_authorable',
  'fixed_team_immutable',
  'revision_conflict',
  'definition_already_exists',
  'invalid_schema',
  'validation_failed',
  'reference_not_found',
  'permission_expansion',
  'package_too_large',
  'untrusted_package',
  'package_changed_after_preview',
  'read_failed',
  'write_failed',
  'install_failed',
  'delete_failed',
  'rollback_failed',
]);

function toDomainError(
  error: unknown,
  fallbackCode: TeamAuthoringErrorCode,
): TeamAuthoringError {
  if (error instanceof TeamAuthoringError) return error;
  const structured = extractTeamDefinitionCommandError(error)
    ?? (
      error !== null
      && typeof error === 'object'
      && 'code' in error
      && 'message' in error
      && typeof error.code === 'string'
      && typeof error.message === 'string'
      && DOMAIN_ERROR_CODES.has(error.code as TeamAuthoringErrorCode)
        ? error as TeamDefinitionCommandErrorPayload
        : null
    );
  if (structured) {
    return new TeamAuthoringError(
      structured.code as TeamDefinitionCommandErrorCode,
      structured.message,
      {
        source: structured.source,
        retryable: structured.retryable,
        diagnostics: structured.diagnostics,
        recoveryPath: structured.recoveryPath,
      },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new TeamAuthoringError(fallbackCode, message);
}

export class ExistingTeamDefinitionAdapter implements TeamAuthoringGateway {
  async list(input: ListTeamDefinitionsInput = {}) {
    try {
      return await configAPI.listTeamDefinitions(input);
    } catch (error) {
      throw toDomainError(error, 'read_failed');
    }
  }

  async get(input: GetTeamDefinitionInput) {
    try {
      return await configAPI.getTeamDefinition(input);
    } catch (error) {
      throw toDomainError(error, 'read_failed');
    }
  }

  async create(input: CreateTeamDefinitionInput) {
    try {
      return await configAPI.createTeamDefinition(input);
    } catch (error) {
      throw toDomainError(error, 'write_failed');
    }
  }

  async update(input: UpdateTeamDefinitionInput) {
    try {
      return await configAPI.updateTeamDefinition(input);
    } catch (error) {
      throw toDomainError(error, 'write_failed');
    }
  }

  async install(input: InstallTeamDefinitionInput) {
    try {
      return await configAPI.installTeamDefinition(input);
    } catch (error) {
      throw toDomainError(error, 'install_failed');
    }
  }

  async delete(input: DeleteTeamDefinitionInput) {
    try {
      await configAPI.deleteTeamDefinition(input);
    } catch (error) {
      throw toDomainError(error, 'delete_failed');
    }
  }
}

export const existingTeamDefinitionAdapter =
  new ExistingTeamDefinitionAdapter();
