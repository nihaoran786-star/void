 

import { api } from './ApiClient';
import { createTauriCommandError } from '../errors/TauriCommandError';
import type {
  AgentProfileConfigItem,
  DiagnosticsBundleInfo,
  ModeSkillInfo,
  RuntimeLoggingInfo,
  SkillAuthoringDetail,
  SkillInfo,
  SkillLevel,
  SkillMarketDownloadResult,
  SkillMarketItem,
  SkillValidationResult,
  TeamDefinition,
  TeamDefinitionDiagnostic,
  TeamDefinitionDraft,
  TeamDefinitionLevel,
  TeamDefinitionListSnapshot,
  TeamDefinitionRecord,
} from '../../config/types';

export interface GetSkillConfigsParams {
  forceRefresh?: boolean;
  workspacePath?: string;
}

export interface GetModeSkillConfigsParams {
  modeId: string;
  forceRefresh?: boolean;
  workspacePath?: string;
}

export interface SetModeSkillDisabledParams {
  modeId: string;
  skillKey: string;
  disabled: boolean;
  workspacePath?: string;
}

export interface ReplaceModeSkillSelectionParams {
  modeId: string;
  enabledSkillKeys: string[];
  workspacePath?: string;
}

export interface ResetModeSkillSelectionParams {
  modeId: string;
  workspacePath?: string;
}

export interface AddSkillParams {
  sourcePath: string;
  level: SkillLevel;
  workspacePath?: string;
}

export interface CreateSkillParams {
  level: SkillLevel;
  displayName: string;
  description: string;
  instructions: string;
  allowedParentAgentIds: string[];
  suggestedPrompts: string[];
  workspacePath?: string;
}

export interface GetSkillDetailParams {
  skillKey: string;
  workspacePath?: string;
}

export interface UpdateSkillParams {
  skillKey: string;
  expectedRevision: string;
  displayName: string;
  description: string;
  instructions: string;
  allowedParentAgentIds: string[];
  suggestedPrompts: string[];
  workspacePath?: string;
}

export interface ListTeamDefinitionsParams {
  workspacePath?: string;
}

export interface GetTeamDefinitionParams {
  teamDefinitionId: string;
  level: TeamDefinitionLevel;
  workspacePath?: string;
}

export interface CreateTeamDefinitionParams {
  level: TeamDefinitionLevel;
  draft: TeamDefinitionDraft;
  workspacePath?: string;
}

export interface UpdateTeamDefinitionParams {
  teamDefinitionId: string;
  level: TeamDefinitionLevel;
  expectedRevision: string;
  definition: TeamDefinition;
  workspacePath?: string;
}

export interface InstallTeamDefinitionParams {
  sourcePath: string;
  level: TeamDefinitionLevel;
  workspacePath?: string;
}

export interface DeleteTeamDefinitionParams {
  teamDefinitionId: string;
  level: TeamDefinitionLevel;
  workspacePath?: string;
}

export type SkillAuthoringCommandErrorCode =
  | 'unsupported_remote_project'
  | 'not_found'
  | 'not_authorable'
  | 'revision_conflict'
  | 'validation_failed'
  | 'read_failed'
  | 'write_failed'
  | 'rollback_failed';

export interface SkillAuthoringCommandErrorPayload {
  code: SkillAuthoringCommandErrorCode;
  message: string;
  recoveryPath?: string;
}

export type TeamDefinitionCommandErrorCode =
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

export interface TeamDefinitionCommandErrorPayload {
  code: TeamDefinitionCommandErrorCode;
  message: string;
  source?: string;
  retryable?: boolean;
  diagnostics?: TeamDefinitionDiagnostic[];
  recoveryPath?: string;
}

const SKILL_AUTHORING_ERROR_CODES = new Set<SkillAuthoringCommandErrorCode>([
  'unsupported_remote_project',
  'not_found',
  'not_authorable',
  'revision_conflict',
  'validation_failed',
  'read_failed',
  'write_failed',
  'rollback_failed',
]);

const TEAM_DEFINITION_ERROR_CODES = new Set<TeamDefinitionCommandErrorCode>([
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
}

export function extractSkillAuthoringCommandError(
  error: unknown,
): SkillAuthoringCommandErrorPayload | null {
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
      typeof code === 'string'
      && SKILL_AUTHORING_ERROR_CODES.has(code as SkillAuthoringCommandErrorCode)
      && typeof message === 'string'
    ) {
      return {
        code: code as SkillAuthoringCommandErrorCode,
        message,
        recoveryPath: typeof record.recoveryPath === 'string'
          ? record.recoveryPath
          : undefined,
      };
    }
  }
  return null;
}

export function extractTeamDefinitionCommandError(
  error: unknown,
): TeamDefinitionCommandErrorPayload | null {
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
      typeof code === 'string'
      && TEAM_DEFINITION_ERROR_CODES.has(code as TeamDefinitionCommandErrorCode)
      && typeof message === 'string'
    ) {
      return {
        code: code as TeamDefinitionCommandErrorCode,
        message,
        source: typeof record.source === 'string' ? record.source : undefined,
        retryable: typeof record.retryable === 'boolean'
          ? record.retryable
          : undefined,
        diagnostics: Array.isArray(record.diagnostics)
          ? record.diagnostics as TeamDefinitionDiagnostic[]
          : undefined,
        recoveryPath: typeof record.recoveryPath === 'string'
          ? record.recoveryPath
          : undefined,
      };
    }
  }
  return null;
}

export interface DeleteSkillParams {
  skillKey: string;
  workspacePath?: string;
}

export interface DownloadSkillMarketParams {
  packageId: string;
  level?: SkillLevel;
  workspacePath?: string;
}


export class ConfigAPI {
   
  async getConfig(path?: string, options?: { skipRetryOnNotFound?: boolean }): Promise<any> {
    try {
      
      const shouldSkipRetry = options?.skipRetryOnNotFound ?? false;
      
      return await api.invoke('get_config', 
        {
          request: path
            ? { path, skipRetryOnNotFound: shouldSkipRetry }
            : { skipRetryOnNotFound: shouldSkipRetry },
        },
        shouldSkipRetry ? { retries: 0 } : undefined
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const normalized = errorMessage.toLowerCase();
      if (
        normalized.includes('not found:') &&
        normalized.includes('config path') &&
        normalized.includes(`'${path}'`)
      ) {
        return undefined;
      }
      throw createTauriCommandError('get_config', error, { path });
    }
  }

  async getConfigs(
    paths: string[],
    options?: { skipRetryOnNotFound?: boolean }
  ): Promise<Record<string, any>> {
    const uniquePaths = Array.from(new Set(paths));
    if (uniquePaths.length === 0) {
      return {};
    }

    const shouldSkipRetry = options?.skipRetryOnNotFound ?? false;

    try {
      return await api.invoke('get_configs', {
        request: {
          paths: uniquePaths,
          skipRetryOnNotFound: shouldSkipRetry,
        },
      });
    } catch {
      const entries = await Promise.all(
        uniquePaths.map(async (path) => [
          path,
          await this.getConfig(path, options),
        ] as const)
      );
      return Object.fromEntries(entries);
    }
  }

   
  async setConfig(path: string, value: any): Promise<void> {
    try {
      await api.invoke('set_config', { 
        request: { path, value } 
      });
    } catch (error) {
      throw createTauriCommandError('set_config', error, { path, value });
    }
  }

   
  async resetConfig(path?: string): Promise<void> {
    try {
      await api.invoke('reset_config', { 
        request: path ? { path } : {} 
      });
    } catch (error) {
      throw createTauriCommandError('reset_config', error, { path });
    }
  }

   
  async exportConfig(): Promise<any> {
    try {
      return await api.invoke('export_config', { 
        request: {} 
      });
    } catch (error) {
      throw createTauriCommandError('export_config', error);
    }
  }

   
  async importConfig(configData: any): Promise<void> {
    try {
      await api.invoke('import_config', { 
        request: { configData } 
      });
    } catch (error) {
      throw createTauriCommandError('import_config', error, { configData });
    }
  }

   
  async reloadConfig(): Promise<void> {
    try {
      await api.invoke('reload_config', { 
        request: {} 
      });
    } catch (error) {
      throw createTauriCommandError('reload_config', error);
    }
  }

  async getRuntimeLoggingInfo(): Promise<RuntimeLoggingInfo> {
    try {
      return await api.invoke('get_runtime_logging_info', {
        request: {},
      });
    } catch (error) {
      throw createTauriCommandError('get_runtime_logging_info', error);
    }
  }

  async exportDiagnosticsBundle(): Promise<DiagnosticsBundleInfo> {
    try {
      return await api.invoke('export_diagnostics_bundle', {
        request: {},
      });
    } catch (error) {
      throw createTauriCommandError('export_diagnostics_bundle', error);
    }
  }

   
  async getModelConfigs(): Promise<any[]> {
    try {
      return await api.invoke('get_model_configs', { 
        request: {} 
      });
    } catch (error) {
      throw createTauriCommandError('get_model_configs', error);
    }
  }

   
  async saveModelConfig(config: any): Promise<void> {
    try {
      await api.invoke('save_model_config', { 
        request: { config } 
      });
    } catch (error) {
      throw createTauriCommandError('save_model_config', error, { config });
    }
  }

   
  async deleteModelConfig(configId: string): Promise<void> {
    try {
      await api.invoke('delete_model_config', { 
        request: { configId } 
      });
    } catch (error) {
      throw createTauriCommandError('delete_model_config', error, { configId });
    }
  }

  

   
  async getAgentProfileConfigs(): Promise<Record<string, AgentProfileConfigItem>> {
    try {
      return await api.invoke<Record<string, AgentProfileConfigItem>>('get_agent_profile_configs');
    } catch (error) {
      throw createTauriCommandError('get_agent_profile_configs', error);
    }
  }

  async getAgentProfileConfig(agentId: string): Promise<AgentProfileConfigItem> {
    try {
      return await api.invoke<AgentProfileConfigItem>('get_agent_profile_config', { agentId });
    } catch (error) {
      throw createTauriCommandError('get_agent_profile_config', error, { agentId });
    }
  }

  async setAgentProfileConfig(agentId: string, config: any): Promise<string> {
    try {
      return await api.invoke('set_agent_profile_config', { agentId, config });
    } catch (error) {
      throw createTauriCommandError('set_agent_profile_config', error, { agentId, config });
    }
  }

  async resetAgentProfileConfig(agentId: string): Promise<string> {
    try {
      return await api.invoke('reset_agent_profile_config', { agentId });
    } catch (error) {
      throw createTauriCommandError('reset_agent_profile_config', error, { agentId });
    }
  }

  async deleteSubagent(subagentId: string): Promise<void> {
    try {
      await api.invoke('delete_subagent', {
        request: { subagentId },
      });
    } catch (error) {
      throw createTauriCommandError('delete_subagent', error, { subagentId });
    }
  }

  

   
  async getSkillConfigs({
    forceRefresh,
    workspacePath,
  }: GetSkillConfigsParams = {}): Promise<SkillInfo[]> {
    try {
      return await api.invoke('get_skill_configs', { forceRefresh, workspacePath });
    } catch (error) {
      throw createTauriCommandError('get_skill_configs', error, { forceRefresh, workspacePath });
    }
  }

   
  async getModeSkillConfigs({
    modeId,
    forceRefresh,
    workspacePath,
  }: GetModeSkillConfigsParams): Promise<ModeSkillInfo[]> {
    try {
      return await api.invoke('get_mode_skill_configs', { modeId, forceRefresh, workspacePath });
    } catch (error) {
      throw createTauriCommandError('get_mode_skill_configs', error, { modeId, forceRefresh, workspacePath });
    }
  }

   
  async setModeSkillDisabled({
    modeId,
    skillKey,
    disabled,
    workspacePath,
  }: SetModeSkillDisabledParams): Promise<string> {
    try {
      return await api.invoke('set_mode_skill_disabled', { modeId, skillKey, disabled, workspacePath });
    } catch (error) {
      throw createTauriCommandError('set_mode_skill_disabled', error, { modeId, skillKey, disabled, workspacePath });
    }
  }

  async replaceModeSkillSelection({
    modeId,
    enabledSkillKeys,
    workspacePath,
  }: ReplaceModeSkillSelectionParams): Promise<string> {
    try {
      return await api.invoke('replace_mode_skill_selection', {
        request: { modeId, enabledSkillKeys, workspacePath },
      });
    } catch (error) {
      throw createTauriCommandError('replace_mode_skill_selection', error, {
        modeId,
        enabledSkillKeys,
        workspacePath,
      });
    }
  }

  async resetModeSkillSelection({
    modeId,
    workspacePath,
  }: ResetModeSkillSelectionParams): Promise<string> {
    try {
      return await api.invoke('reset_mode_skill_selection', {
        request: { modeId, workspacePath },
      });
    } catch (error) {
      throw createTauriCommandError('reset_mode_skill_selection', error, {
        modeId,
        workspacePath,
      });
    }
  }

   
  async validateSkillPath(path: string): Promise<SkillValidationResult> {
    try {
      return await api.invoke('validate_skill_path', { path });
    } catch (error) {
      throw createTauriCommandError('validate_skill_path', error, { path });
    }
  }

  async getSkillDetail({
    skillKey,
    workspacePath,
  }: GetSkillDetailParams): Promise<SkillAuthoringDetail> {
    try {
      return await api.invoke('get_skill_detail', {
        request: { skillKey, workspacePath },
      });
    } catch (error) {
      const commandError = extractSkillAuthoringCommandError(error);
      if (commandError) throw commandError;
      throw createTauriCommandError('get_skill_detail', error, { skillKey, workspacePath });
    }
  }

  async createSkill(params: CreateSkillParams): Promise<SkillAuthoringDetail> {
    try {
      return await api.invoke('create_skill', { request: params });
    } catch (error) {
      const commandError = extractSkillAuthoringCommandError(error);
      if (commandError) throw commandError;
      throw createTauriCommandError('create_skill', error, params);
    }
  }

  async updateSkill(params: UpdateSkillParams): Promise<SkillAuthoringDetail> {
    try {
      return await api.invoke('update_skill', { request: params });
    } catch (error) {
      const commandError = extractSkillAuthoringCommandError(error);
      if (commandError) throw commandError;
      throw createTauriCommandError('update_skill', error, {
        skillKey: params.skillKey,
        workspacePath: params.workspacePath,
      });
    }
  }

  async listTeamDefinitions(
    params: ListTeamDefinitionsParams = {},
  ): Promise<TeamDefinitionListSnapshot> {
    try {
      return await api.invoke('list_team_definitions', { request: params });
    } catch (error) {
      const commandError = extractTeamDefinitionCommandError(error);
      if (commandError) throw commandError;
      throw createTauriCommandError('list_team_definitions', error, params);
    }
  }

  async getTeamDefinition(
    params: GetTeamDefinitionParams,
  ): Promise<TeamDefinitionRecord> {
    try {
      return await api.invoke('get_team_definition', { request: params });
    } catch (error) {
      const commandError = extractTeamDefinitionCommandError(error);
      if (commandError) throw commandError;
      throw createTauriCommandError('get_team_definition', error, params);
    }
  }

  async createTeamDefinition(
    params: CreateTeamDefinitionParams,
  ): Promise<TeamDefinitionRecord> {
    try {
      return await api.invoke('create_team_definition', { request: params });
    } catch (error) {
      const commandError = extractTeamDefinitionCommandError(error);
      if (commandError) throw commandError;
      throw createTauriCommandError('create_team_definition', error, params);
    }
  }

  async updateTeamDefinition(
    params: UpdateTeamDefinitionParams,
  ): Promise<TeamDefinitionRecord> {
    try {
      return await api.invoke('update_team_definition', { request: params });
    } catch (error) {
      const commandError = extractTeamDefinitionCommandError(error);
      if (commandError) throw commandError;
      throw createTauriCommandError('update_team_definition', error, {
        teamDefinitionId: params.teamDefinitionId,
        level: params.level,
        expectedRevision: params.expectedRevision,
        workspacePath: params.workspacePath,
      });
    }
  }

  async installTeamDefinition(
    params: InstallTeamDefinitionParams,
  ): Promise<TeamDefinitionRecord> {
    try {
      return await api.invoke('install_team_definition', { request: params });
    } catch (error) {
      const commandError = extractTeamDefinitionCommandError(error);
      if (commandError) throw commandError;
      throw createTauriCommandError('install_team_definition', error, params);
    }
  }

  async deleteTeamDefinition(
    params: DeleteTeamDefinitionParams,
  ): Promise<void> {
    try {
      await api.invoke('delete_team_definition', { request: params });
    } catch (error) {
      const commandError = extractTeamDefinitionCommandError(error);
      if (commandError) throw commandError;
      throw createTauriCommandError('delete_team_definition', error, params);
    }
  }

   
  async addSkill({
    sourcePath,
    level,
    workspacePath,
  }: AddSkillParams): Promise<string> {
    try {
      return await api.invoke('add_skill', { sourcePath, level, workspacePath });
    } catch (error) {
      throw createTauriCommandError('add_skill', error, { sourcePath, level, workspacePath });
    }
  }

   
  async deleteSkill({
    skillKey,
    workspacePath,
  }: DeleteSkillParams): Promise<string> {
    try {
      return await api.invoke('delete_skill', { skillKey, workspacePath });
    } catch (error) {
      throw createTauriCommandError('delete_skill', error, { skillKey, workspacePath });
    }
  }

  async listSkillMarket(query?: string, limit?: number): Promise<SkillMarketItem[]> {
    try {
      return await api.invoke('list_skill_market', {
        request: { query, limit }
      });
    } catch (error) {
      throw createTauriCommandError('list_skill_market', error, { query, limit });
    }
  }

  async searchSkillMarket(query: string, limit?: number): Promise<SkillMarketItem[]> {
    try {
      return await api.invoke('search_skill_market', {
        request: { query, limit }
      });
    } catch (error) {
      throw createTauriCommandError('search_skill_market', error, { query, limit });
    }
  }

  async downloadSkillMarket({
    packageId,
    level = 'project',
    workspacePath,
  }: DownloadSkillMarketParams): Promise<SkillMarketDownloadResult> {
    try {
      return await api.invoke('download_skill_market', {
        request: { package: packageId, level, workspacePath }
      });
    } catch (error) {
      throw createTauriCommandError('download_skill_market', error, {
        package: packageId,
        level,
        workspacePath,
      });
    }
  }
}


export const configAPI = new ConfigAPI();
