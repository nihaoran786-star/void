import type {
  SkillAuthoringDetail,
  SkillLevel,
} from '@/infrastructure/config/types';

export interface CreateAuthoredSkillInput {
  level: SkillLevel;
  displayName: string;
  description: string;
  instructions: string;
  allowedParentAgentIds: string[];
  suggestedPrompts: string[];
  workspacePath?: string;
}

export interface UpdateAuthoredSkillInput extends Omit<CreateAuthoredSkillInput, 'level'> {
  skillKey: string;
  expectedRevision: string;
}

export interface GetAuthoredSkillInput {
  skillKey: string;
  workspacePath?: string;
}

export interface SkillAuthoringGateway {
  getDetail(input: GetAuthoredSkillInput): Promise<SkillAuthoringDetail>;
  create(input: CreateAuthoredSkillInput): Promise<SkillAuthoringDetail>;
  update(input: UpdateAuthoredSkillInput): Promise<SkillAuthoringDetail>;
}

export type SkillAuthoringErrorCode =
  | 'unsupported_transport'
  | 'unsupported_remote_project'
  | 'not_found'
  | 'not_authorable'
  | 'revision_conflict'
  | 'validation_failed'
  | 'read_failed'
  | 'write_failed'
  | 'rollback_failed';

export class SkillAuthoringError extends Error {
  constructor(
    public readonly code: SkillAuthoringErrorCode,
    public readonly causeMessage: string,
    public readonly recoveryPath?: string,
  ) {
    super(code);
    this.name = 'SkillAuthoringError';
  }
}
