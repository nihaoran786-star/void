import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TeamDefinition,
  TeamDefinitionDraft,
  TeamDefinitionRecord,
} from '@/infrastructure/config/types';
import { TeamAuthoringError } from '../TeamAuthoringGateway';
import { ExistingTeamDefinitionAdapter } from './ExistingTeamDefinitionAdapter';

const configApiMock = vi.hoisted(() => ({
  listTeamDefinitions: vi.fn(),
  getTeamDefinition: vi.fn(),
  createTeamDefinition: vi.fn(),
  updateTeamDefinition: vi.fn(),
  installTeamDefinition: vi.fn(),
  deleteTeamDefinition: vi.fn(),
}));

vi.mock('@/infrastructure/api', () => ({
  configAPI: configApiMock,
}));

const definition: TeamDefinition = {
  schemaVersion: 1,
  teamDefinitionId: 'custom-0123456789abcdef0123456789abcdef',
  displayName: '软件交付团队',
  description: '负责完整软件交付。',
  category: '技术工程',
  capabilityTags: ['软件开发'],
  scenarioEligibility: ['code'],
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
  workflows: [{
    workflowId: 'workflow-0123456789abcdef0123456789abcdef',
    displayName: '软件交付',
    triggerDescription: '需要开发软件时使用。',
    phases: [{
      phaseId: 'phase-0123456789abcdef0123456789abcdef',
      displayName: '实现',
      kind: 'serial',
      dependsOnPhaseIds: [],
      assignedMemberIds: ['member-fedcba9876543210fedcba9876543210'],
      expectedOutputs: ['实现方案'],
      completionRule: '提交可验证方案。',
    }],
  }],
  collaborationPolicy: 'lead_mediated',
  permissionPolicy: 'inherit_parent_intersection',
  origin: 'user',
};

const record: TeamDefinitionRecord = {
  definition,
  revision: 'revision-1',
  level: 'user',
  path: 'D:/void/teams/custom-team.json',
  isAuthorable: true,
};

const draft: TeamDefinitionDraft = {
  displayName: definition.displayName,
  description: definition.description,
  category: definition.category,
  capabilityTags: definition.capabilityTags,
  scenarioEligibility: definition.scenarioEligibility,
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

describe('ExistingTeamDefinitionAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('把 canonical draft 和 definition 原样交给现有 ConfigAPI', async () => {
    configApiMock.createTeamDefinition.mockResolvedValue(record);
    configApiMock.updateTeamDefinition.mockResolvedValue(record);
    const adapter = new ExistingTeamDefinitionAdapter();

    await expect(adapter.create({
      level: 'user',
      draft,
    })).resolves.toEqual(record);
    await expect(adapter.update({
      teamDefinitionId: definition.teamDefinitionId,
      level: 'user',
      expectedRevision: record.revision,
      definition,
    })).resolves.toEqual(record);

    expect(configApiMock.createTeamDefinition).toHaveBeenCalledWith({
      level: 'user',
      draft,
    });
    expect(configApiMock.updateTeamDefinition).toHaveBeenCalledWith({
      teamDefinitionId: definition.teamDefinitionId,
      level: 'user',
      expectedRevision: record.revision,
      definition,
    });
  });

  it('保留结构化错误事实，不解析本地化错误文案', async () => {
    configApiMock.installTeamDefinition.mockRejectedValue({
      code: 'package_changed_after_preview',
      message: '安装前文件发生变化',
      source: 'desktop_team_definition',
      retryable: true,
      recoveryPath: 'D:/recovery/team.json',
    });
    const adapter = new ExistingTeamDefinitionAdapter();

    const promise = adapter.install({
      sourcePath: 'D:/packages/team.void-team.json',
      level: 'user',
    });

    await expect(promise).rejects.toMatchObject<Partial<TeamAuthoringError>>({
      code: 'package_changed_after_preview',
      causeMessage: '安装前文件发生变化',
      source: 'desktop_team_definition',
      retryable: true,
      recoveryPath: 'D:/recovery/team.json',
    });
  });

  it('未知传输错误按当前操作分类，不伪装成校验错误', async () => {
    configApiMock.getTeamDefinition.mockRejectedValue(
      new Error('transport disconnected'),
    );
    const adapter = new ExistingTeamDefinitionAdapter();

    await expect(adapter.get({
      teamDefinitionId: definition.teamDefinitionId,
      level: 'user',
    })).rejects.toMatchObject({
      code: 'read_failed',
      causeMessage: 'transport disconnected',
    });
  });
});
