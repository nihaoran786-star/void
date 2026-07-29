import type {
  TeamDefinition,
  TeamDefinitionDiagnostic,
  TeamDefinitionDraft,
  TeamDefinitionLevel,
  TeamDefinitionListSnapshot,
  TeamDefinitionRecord,
} from '@/infrastructure/config/types';

export interface ListTeamDefinitionsInput {
  workspacePath?: string;
}

export interface GetTeamDefinitionInput {
  teamDefinitionId: string;
  level: TeamDefinitionLevel;
  workspacePath?: string;
}

export interface CreateTeamDefinitionInput {
  level: TeamDefinitionLevel;
  draft: TeamDefinitionDraft;
  workspacePath?: string;
}

export interface UpdateTeamDefinitionInput {
  teamDefinitionId: string;
  level: TeamDefinitionLevel;
  expectedRevision: string;
  definition: TeamDefinition;
  workspacePath?: string;
}

export interface InstallTeamDefinitionInput {
  sourcePath: string;
  level: TeamDefinitionLevel;
  workspacePath?: string;
}

export interface DeleteTeamDefinitionInput {
  teamDefinitionId: string;
  level: TeamDefinitionLevel;
  workspacePath?: string;
}

export interface TeamAuthoringGateway {
  list(input?: ListTeamDefinitionsInput): Promise<TeamDefinitionListSnapshot>;
  get(input: GetTeamDefinitionInput): Promise<TeamDefinitionRecord>;
  create(input: CreateTeamDefinitionInput): Promise<TeamDefinitionRecord>;
  update(input: UpdateTeamDefinitionInput): Promise<TeamDefinitionRecord>;
  install(input: InstallTeamDefinitionInput): Promise<TeamDefinitionRecord>;
  delete(input: DeleteTeamDefinitionInput): Promise<void>;
}

export type TeamAuthoringErrorCode =
  | 'unsupported_transport'
  | 'unsupported_remote_project'
  | 'not_found'
  | 'not_authorable'
  | 'fixed_team_immutable'
  | 'revision_conflict'
  | 'definition_already_exists'
  | 'invalid_schema'
  | 'validation_failed'
  | 'reference_not_found'
  | 'permission_expansion'
  | 'package_too_large'
  | 'untrusted_package'
  | 'package_changed_after_preview'
  | 'read_failed'
  | 'write_failed'
  | 'install_failed'
  | 'delete_failed'
  | 'rollback_failed';

export interface TeamAuthoringErrorFacts {
  source?: string;
  retryable?: boolean;
  diagnostics?: TeamDefinitionDiagnostic[];
  recoveryPath?: string;
}

export class TeamAuthoringError extends Error {
  readonly source?: string;
  readonly retryable?: boolean;
  readonly diagnostics?: TeamDefinitionDiagnostic[];
  readonly recoveryPath?: string;

  constructor(
    public readonly code: TeamAuthoringErrorCode,
    public readonly causeMessage: string,
    facts: TeamAuthoringErrorFacts = {},
  ) {
    super(code);
    this.name = 'TeamAuthoringError';
    this.source = facts.source;
    this.retryable = facts.retryable;
    this.diagnostics = facts.diagnostics;
    this.recoveryPath = facts.recoveryPath;
  }
}
