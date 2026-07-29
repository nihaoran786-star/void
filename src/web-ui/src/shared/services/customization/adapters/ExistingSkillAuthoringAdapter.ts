import { configAPI } from '@/infrastructure/api';
import type {
  SkillAuthoringCommandErrorCode,
  SkillAuthoringCommandErrorPayload,
} from '@/infrastructure/api/service-api/ConfigAPI';
import {
  customizationRuntimeCapabilityService,
  type CustomizationRuntimeCapabilityReader,
} from '../CustomizationRuntimeCapabilityService';
import { SkillAuthoringError } from '../SkillAuthoringGateway';
import type {
  CreateAuthoredSkillInput,
  GetAuthoredSkillInput,
  SkillAuthoringGateway,
  UpdateAuthoredSkillInput,
} from '../SkillAuthoringGateway';

const COMMAND_ERROR_CODES = new Set<SkillAuthoringCommandErrorCode>([
  'unsupported_remote_project',
  'not_found',
  'not_authorable',
  'revision_conflict',
  'validation_failed',
  'read_failed',
  'write_failed',
  'rollback_failed',
]);

function isSkillAuthoringCommandError(
  error: unknown,
): error is SkillAuthoringCommandErrorPayload {
  if (error === null || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return typeof record.code === 'string'
    && COMMAND_ERROR_CODES.has(record.code as SkillAuthoringCommandErrorCode)
    && typeof record.message === 'string'
    && (
      record.recoveryPath === undefined
      || typeof record.recoveryPath === 'string'
    );
}

function mapSkillAuthoringError(error: unknown): SkillAuthoringError {
  if (error instanceof SkillAuthoringError) return error;
  if (isSkillAuthoringCommandError(error)) {
    return new SkillAuthoringError(
      error.code,
      error.message,
      error.recoveryPath,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new SkillAuthoringError('write_failed', message);
}

export class ExistingSkillAuthoringAdapter implements SkillAuthoringGateway {
  constructor(
    private readonly capabilityService: CustomizationRuntimeCapabilityReader =
      customizationRuntimeCapabilityService,
  ) {}

  private assertSupported(): void {
    if (
      this.capabilityService.getCapability('skill_management').status
      === 'unsupported'
    ) {
      throw new SkillAuthoringError(
        'unsupported_transport',
        'Skill authoring requires the desktop runtime.',
      );
    }
  }

  async getDetail(input: GetAuthoredSkillInput) {
    this.assertSupported();
    try {
      return await configAPI.getSkillDetail(input);
    } catch (error) {
      throw mapSkillAuthoringError(error);
    }
  }

  async create(input: CreateAuthoredSkillInput) {
    this.assertSupported();
    try {
      return await configAPI.createSkill(input);
    } catch (error) {
      throw mapSkillAuthoringError(error);
    }
  }

  async update(input: UpdateAuthoredSkillInput) {
    this.assertSupported();
    try {
      return await configAPI.updateSkill(input);
    } catch (error) {
      throw mapSkillAuthoringError(error);
    }
  }
}

export const existingSkillAuthoringAdapter = new ExistingSkillAuthoringAdapter();
