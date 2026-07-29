import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TeamDefinition,
  TeamDefinitionDraft,
  TeamDefinitionRecord,
} from '../../config/types';
import { ConfigAPI } from './ConfigAPI';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('./ApiClient', () => ({
  api: {
    invoke: invokeMock,
  },
}));

describe('ConfigAPI batch config reads', () => {
  let configAPI: ConfigAPI;

  beforeEach(() => {
    configAPI = new ConfigAPI();
    invokeMock.mockReset();
  });

  it('reads multiple config paths through one batch command', async () => {
    const configs = {
      'ai.models': [],
      'ai.default_models': { chat: 'gpt-5' },
    };
    invokeMock.mockResolvedValueOnce(configs);

    await expect(
      configAPI.getConfigs(['ai.models', 'ai.models', 'ai.default_models'])
    ).resolves.toEqual(configs);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('get_configs', {
      request: {
        paths: ['ai.models', 'ai.default_models'],
        skipRetryOnNotFound: false,
      },
    });
  });

  it('falls back to existing single-path reads when the batch command fails', async () => {
    invokeMock.mockImplementation((command: string, args?: any) => {
      if (command === 'get_configs') {
        return Promise.reject(new Error('unknown command get_configs'));
      }

      return Promise.resolve(`value:${args.request.path}`);
    });

    await expect(configAPI.getConfigs(['ai.models', 'ai.default_models'])).resolves.toEqual({
      'ai.models': 'value:ai.models',
      'ai.default_models': 'value:ai.default_models',
    });

    expect(invokeMock).toHaveBeenCalledTimes(3);
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'get_configs', {
      request: {
        paths: ['ai.models', 'ai.default_models'],
        skipRetryOnNotFound: false,
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'get_config', {
      request: {
        path: 'ai.models',
        skipRetryOnNotFound: false,
      },
    }, undefined);
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'get_config', {
      request: {
        path: 'ai.default_models',
        skipRetryOnNotFound: false,
      },
    }, undefined);
  });
});

describe('ConfigAPI Skill authoring errors', () => {
  let configAPI: ConfigAPI;

  beforeEach(() => {
    configAPI = new ConfigAPI();
    invokeMock.mockReset();
  });

  it('从 ApiClient 包装中恢复桌面端结构化错误，不依赖英文文案', async () => {
    invokeMock.mockRejectedValueOnce({
      code: 'COMMAND_FAILED',
      message: '[object Object]',
      details: {
        originalError: {
          code: 'validation_failed',
          message: '任意本地化后的校验说明',
        },
      },
    });

    await expect(configAPI.createSkill({
      level: 'user',
      displayName: '测试技能',
      description: '测试描述',
      instructions: '测试说明',
      allowedParentAgentIds: ['agentic'],
      suggestedPrompts: ['试试这个技能'],
    })).rejects.toEqual({
      code: 'validation_failed',
      message: '任意本地化后的校验说明',
      recoveryPath: undefined,
    });
  });

  it('保留回滚恢复路径', async () => {
    invokeMock.mockRejectedValueOnce({
      code: 'rollback_failed',
      message: '自动恢复未完成',
      recoveryPath: 'D:/recovery/.SKILL.backup',
    });

    await expect(configAPI.getSkillDetail({
      skillKey: 'user::void::custom-0123456789abcdef0123456789abcdef',
    })).rejects.toEqual({
      code: 'rollback_failed',
      message: '自动恢复未完成',
      recoveryPath: 'D:/recovery/.SKILL.backup',
    });
  });
});

const teamDraft: TeamDefinitionDraft = {
  displayName: '软件交付团队',
  description: '负责完整软件交付。',
  category: '技术工程',
  capabilityTags: ['软件开发'],
  scenarioEligibility: ['code'],
  leadMemberKey: 'lead',
  members: [
    {
      clientKey: 'lead',
      displayName: '交付负责人',
      professionalRole: '技术统筹',
      role: 'lead',
      instructions: '协调团队。',
      outputResponsibility: '交付最终结果。',
      agentId: 'agentic',
      allowedSkillKeys: [],
      allowedToolNames: [],
      isReadonly: false,
    },
    {
      clientKey: 'developer',
      displayName: '开发工程师',
      professionalRole: '实现专家',
      role: 'specialist',
      instructions: '完成实现。',
      outputResponsibility: '提交实现方案。',
      allowedSkillKeys: [],
      allowedToolNames: [],
      isReadonly: false,
    },
  ],
  workflows: [{
    clientKey: 'delivery',
    displayName: '软件交付',
    triggerDescription: '需要开发软件时使用。',
    phases: [{
      clientKey: 'implementation',
      displayName: '实现',
      kind: 'serial',
      dependsOnPhaseKeys: [],
      assignedMemberKeys: ['developer'],
      expectedOutputs: ['实现方案'],
      completionRule: '提交可验证方案。',
    }],
  }],
};

const teamDefinition: TeamDefinition = {
  schemaVersion: 1,
  teamDefinitionId: 'custom-0123456789abcdef0123456789abcdef',
  displayName: teamDraft.displayName,
  description: teamDraft.description,
  category: teamDraft.category,
  capabilityTags: teamDraft.capabilityTags,
  scenarioEligibility: teamDraft.scenarioEligibility,
  leadMemberId: 'member-0123456789abcdef0123456789abcdef',
  members: [
    {
      memberId: 'member-0123456789abcdef0123456789abcdef',
      displayName: '交付负责人',
      professionalRole: '技术统筹',
      role: 'lead',
      instructions: '协调团队。',
      outputResponsibility: '交付最终结果。',
      agentId: 'agentic',
      allowedSkillKeys: [],
      allowedToolNames: [],
      permissionPolicy: 'inherit_parent_intersection',
      isReadonly: false,
    },
    {
      memberId: 'member-fedcba9876543210fedcba9876543210',
      displayName: '开发工程师',
      professionalRole: '实现专家',
      role: 'specialist',
      instructions: '完成实现。',
      outputResponsibility: '提交实现方案。',
      allowedSkillKeys: [],
      allowedToolNames: [],
      permissionPolicy: 'inherit_parent_intersection',
      isReadonly: false,
    },
  ],
  workflows: [],
  collaborationPolicy: 'lead_mediated',
  permissionPolicy: 'inherit_parent_intersection',
  origin: 'user',
};

const teamRecord: TeamDefinitionRecord = {
  definition: teamDefinition,
  revision: 'revision-1',
  level: 'user',
  path: 'D:/void/teams/team.json',
  isAuthorable: true,
};

describe('ConfigAPI Team definition contract', () => {
  let configAPI: ConfigAPI;

  beforeEach(() => {
    configAPI = new ConfigAPI();
    invokeMock.mockReset();
  });

  it('六个方法严格使用 Team persistence 约定的 command 与单 request 参数', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'list_team_definitions') {
        return Promise.resolve({
          status: 'ready',
          records: [teamRecord],
          diagnostics: [],
        });
      }
      if (command === 'delete_team_definition') {
        return Promise.resolve();
      }
      return Promise.resolve(teamRecord);
    });

    await configAPI.listTeamDefinitions({ workspacePath: 'D:/workspace' });
    await configAPI.getTeamDefinition({
      teamDefinitionId: teamDefinition.teamDefinitionId,
      level: 'user',
      workspacePath: 'D:/workspace',
    });
    await configAPI.createTeamDefinition({
      level: 'user',
      draft: teamDraft,
      workspacePath: 'D:/workspace',
    });
    await configAPI.updateTeamDefinition({
      teamDefinitionId: teamDefinition.teamDefinitionId,
      level: 'user',
      expectedRevision: teamRecord.revision,
      definition: teamDefinition,
      workspacePath: 'D:/workspace',
    });
    await configAPI.installTeamDefinition({
      sourcePath: 'D:/package/team.void-team.json',
      level: 'user',
      workspacePath: 'D:/workspace',
    });
    await configAPI.deleteTeamDefinition({
      teamDefinitionId: teamDefinition.teamDefinitionId,
      level: 'user',
      workspacePath: 'D:/workspace',
    });

    expect(invokeMock.mock.calls.map(([command]) => command)).toEqual([
      'list_team_definitions',
      'get_team_definition',
      'create_team_definition',
      'update_team_definition',
      'install_team_definition',
      'delete_team_definition',
    ]);
    for (const [, args] of invokeMock.mock.calls) {
      expect(args).toEqual({ request: expect.any(Object) });
    }
  });

  it('透传结构化 Team 错误，不依赖英文文案', async () => {
    invokeMock.mockRejectedValueOnce({
      code: 'COMMAND_FAILED',
      message: '[object Object]',
      details: {
        originalError: {
          code: 'revision_conflict',
          message: '定义已被其他窗口修改',
          recoveryPath: 'D:/recovery/team.json',
        },
      },
    });

    await expect(configAPI.updateTeamDefinition({
      teamDefinitionId: teamDefinition.teamDefinitionId,
      level: 'user',
      expectedRevision: teamRecord.revision,
      definition: teamDefinition,
    })).rejects.toEqual({
      code: 'revision_conflict',
      message: '定义已被其他窗口修改',
      source: undefined,
      retryable: undefined,
      diagnostics: undefined,
      recoveryPath: 'D:/recovery/team.json',
    });
  });
});
