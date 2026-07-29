/**
 * Subagent API
 */

import { api } from './ApiClient';



export type SubagentSource = 'builtin' | 'project' | 'user';
export type BuiltinSubagentExposure = 'public' | 'restricted' | 'hidden';
export type SubagentOverrideState = 'enabled' | 'disabled';
export type SubagentStateReason =
  | 'builtin_default_visible'
  | 'builtin_default_hidden'
  | 'custom_default_enabled'
  | 'blocked_by_visibility_policy'
  | 'enabled_by_project_override'
  | 'disabled_by_project_override'
  | 'enabled_by_user_override'
  | 'disabled_by_user_override';

export interface SubagentVisibilitySummary {
  exposure: BuiltinSubagentExposure;
  allowedParentAgentIds: string[];
  deniedParentAgentIds: string[];
  showInGlobalRegistry: boolean;
}

export interface SubagentInfo {
  key: string;
  id: string;
  name: string;
  description: string;
  isReadonly: boolean;
  isReview: boolean;
  toolCount: number;
  defaultTools: string[];
  defaultEnabled: boolean;
  effectiveEnabled: boolean;
  overrideState?: SubagentOverrideState;
  stateReason?: SubagentStateReason;
  subagentSource?: SubagentSource;
  path?: string;
   
  model?: string;
  visibility?: SubagentVisibilitySummary;
  configProfileId?: string;
  configProfileLabel?: string;
  configProfileMemberModeIds?: string[];
}

export interface ListSubagentsOptions {
  source?: SubagentSource;
  workspacePath?: string;
}

export interface ListVisibleSubagentsOptions {
  workspacePath?: string;
  parentAgentType: string;
}

export interface ListManageableSubagentsOptions {
  workspacePath?: string;
  parentAgentType: string;
}

export interface ReloadSubagentsOptions {
  workspacePath?: string;
}

export type SubagentLevel = 'user' | 'project';

export interface SubagentManagementTarget {
  subagentKey?: string;
  subagentId: string;
  workspacePath?: string;
}

export interface CreateSubagentPayload {
  level: SubagentLevel;
  /** Legacy runtime ID. New authoring flows leave this unset. */
  name?: string;
  displayName?: string;
  allowedParentAgentIds?: string[];
  description: string;
  prompt: string;
  tools?: string[];
   
  readonly?: boolean;
  review?: boolean;
  workspacePath?: string;
}

export interface UpdateSubagentConfigPayload extends SubagentManagementTarget {
  parentAgentType?: string;
  enabled?: boolean;
  model?: string;
}

export interface UpdateSubagentConfigResponse {
  availabilityUpdated: boolean;
  modelUpdated: boolean;
}

/** Full definition for create/edit form (custom user/project sub-agents) */
export interface SubagentDetail {
  subagentKey: string;
  subagentId: string;
  /** Immutable runtime ID retained for diagnostics and legacy callers. */
  name: string;
  displayName: string;
  allowedParentAgentIds: string[];
  description: string;
  prompt: string;
  tools: string[];
  readonly: boolean;
  review: boolean;
  enabled: boolean;
  model: string;
  path: string;
  level: SubagentLevel;
}

export type GetSubagentDetailPayload = SubagentManagementTarget;

export interface UpdateSubagentPayload extends SubagentManagementTarget {
  displayName?: string;
  allowedParentAgentIds?: string[];
  description: string;
  prompt: string;
  tools?: string[];
  readonly?: boolean;
  review?: boolean;
}

export type DeleteSubagentPayload = SubagentManagementTarget;

// ==================== API ====================

export const SubagentAPI = {
   
  async listSubagents(options?: ListSubagentsOptions): Promise<SubagentInfo[]> {
    return api.invoke<SubagentInfo[]>('list_subagents', {
      request: options ?? {},
    });
  },

  async listVisibleSubagents(options: ListVisibleSubagentsOptions): Promise<SubagentInfo[]> {
    return api.invoke<SubagentInfo[]>('list_visible_subagents', {
      request: options,
    });
  },

  async listManageableSubagents(options: ListManageableSubagentsOptions): Promise<SubagentInfo[]> {
    return api.invoke<SubagentInfo[]>('list_manageable_subagents', {
      request: options,
    });
  },

   
  async reloadSubagents(options: ReloadSubagentsOptions = {}): Promise<void> {
    return api.invoke('reload_subagents', {
      request: options,
    });
  },

   
  async createSubagent(payload: CreateSubagentPayload): Promise<string> {
    return api.invoke<string>('create_subagent', {
      request: payload,
    });
  },

   
  async listAgentToolNames(): Promise<string[]> {
    return api.invoke<string[]>('list_agent_tool_names');
  },

   
  async updateSubagentConfig(
    payload: UpdateSubagentConfigPayload,
  ): Promise<UpdateSubagentConfigResponse> {
    return api.invoke<UpdateSubagentConfigResponse>('update_subagent_config', {
      request: payload,
    });
  },

  async getSubagentDetail(payload: GetSubagentDetailPayload): Promise<SubagentDetail> {
    const raw = await api.invoke<SubagentDetail & { level: string }>('get_subagent_detail', {
      request: {
        subagentKey: payload.subagentKey,
        subagentId: payload.subagentId,
        workspacePath: payload.workspacePath,
      },
    });
    return {
      ...raw,
      displayName: raw.displayName || raw.name,
      allowedParentAgentIds: raw.allowedParentAgentIds ?? [],
      level: raw.level === 'project' ? 'project' : 'user',
    };
  },

  async updateSubagent(payload: UpdateSubagentPayload): Promise<void> {
    return api.invoke('update_subagent', {
      request: {
        subagentKey: payload.subagentKey,
        subagentId: payload.subagentId,
        displayName: payload.displayName,
        allowedParentAgentIds: payload.allowedParentAgentIds,
        description: payload.description,
        prompt: payload.prompt,
        tools: payload.tools,
        readonly: payload.readonly,
        review: payload.review,
        workspacePath: payload.workspacePath,
      },
    });
  },

  async deleteSubagent(payload: DeleteSubagentPayload): Promise<void> {
    return api.invoke('delete_subagent', {
      request: payload,
    });
  },
};
