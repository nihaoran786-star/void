import { describe, expect, it, vi } from 'vitest';
import type {
  TeamDefinition,
  TeamDefinitionRecord,
} from '@/infrastructure/config/types';
import type { TeamAuthoringGateway } from '../TeamAuthoringGateway';
import { ExistingTeamCatalogAdapter } from './ExistingTeamCatalogAdapter';

function teamRecord(
  id: string,
  origin: TeamDefinition['origin'],
): TeamDefinitionRecord {
  const leadId = `member-${id}-lead`;
  const specialistId = `member-${id}-specialist`;
  return {
    revision: `revision-${id}`,
    level: origin === 'project' ? 'project' : 'user',
    path: `D:/void/teams/${id}.json`,
    isAuthorable: origin !== 'installed',
    definition: {
      schemaVersion: 1,
      teamDefinitionId: id,
      displayName: `${id} 团队`,
      description: '用于目录投影测试。',
      category: '测试',
      capabilityTags: ['测试团队'],
      scenarioEligibility: ['code'],
      leadMemberId: leadId,
      members: [
        {
          memberId: leadId,
          displayName: '主理人',
          professionalRole: '负责人',
          role: 'lead',
          instructions: '负责统筹。',
          outputResponsibility: '汇总结果。',
          agentId: 'agentic',
          allowedSkillKeys: [],
          allowedToolNames: [],
          permissionPolicy: 'inherit_parent_intersection',
          isReadonly: false,
        },
        {
          memberId: specialistId,
          displayName: '执行专家',
          professionalRole: '专业人员',
          role: 'specialist',
          instructions: '负责执行。',
          outputResponsibility: '提交结果。',
          allowedSkillKeys: [],
          allowedToolNames: [],
          permissionPolicy: 'inherit_parent_intersection',
          isReadonly: false,
        },
      ],
      workflows: [],
      collaborationPolicy: 'lead_mediated',
      permissionPolicy: 'inherit_parent_intersection',
      origin,
    },
  };
}

function leadOf(record: TeamDefinitionRecord) {
  const member = record.definition.members.find(
    candidate => candidate.memberId === record.definition.leadMemberId,
  );
  if (!member) throw new Error('missing test lead');
  return member;
}

function specialistOf(record: TeamDefinitionRecord) {
  const member = record.definition.members.find(
    candidate => candidate.memberId !== record.definition.leadMemberId,
  );
  if (!member) throw new Error('missing test specialist');
  return member;
}

function gatewayWithRecords(
  records: TeamDefinitionRecord[],
): TeamAuthoringGateway {
  return {
    list: vi.fn(async () => ({
      status: 'ready',
      records,
      diagnostics: [],
    })),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    install: vi.fn(),
    delete: vi.fn(),
  };
}

describe('ExistingTeamCatalogAdapter', () => {
  it('把兼容的用户级、项目级和已安装团队投影为可选父会话主理人', async () => {
    const user = teamRecord('custom-user', 'user');
    const project = teamRecord('custom-project', 'project');
    const installed = teamRecord('custom-installed', 'installed');
    const gateway = gatewayWithRecords([user, project, installed]);
    const adapter = new ExistingTeamCatalogAdapter(gateway);

    const snapshot = await adapter.load({ workspacePath: 'D:/workspace' });

    expect(gateway.list).toHaveBeenCalledWith({
      workspacePath: 'D:/workspace',
    });
    expect(snapshot.status).toBe('ready');
    expect(snapshot.entries).toHaveLength(3);
    for (const entry of snapshot.entries) {
      expect(entry).toMatchObject({
        kind: 'team',
        leadBinding: 'parent_persona',
        activationSupport: 'parent_persona',
        availability: { status: 'available' },
      });
    }
    expect(snapshot.entries.map(entry => entry.managementSupport)).toEqual([
      'authorable',
      'authorable',
      'installed_readonly',
    ]);
    expect(snapshot.entries[2]?.lead.isReadonly).toBe(false);
    expect(snapshot.entries[2]?.members[0]?.isReadonly).toBe(false);
  });

  it.each([
    {
      title: '主理人要求只读',
      reasonCode: 'team_lead_readonly_unsupported',
      mutate: (record: TeamDefinitionRecord) => {
        leadOf(record).isReadonly = true;
      },
    },
    {
      title: '主理人显式收窄工具但缺少 Task',
      reasonCode: 'team_lead_task_tool_required',
      mutate: (record: TeamDefinitionRecord) => {
        leadOf(record).allowedToolNames = ['Read'];
      },
    },
    {
      title: '成员收窄工具',
      reasonCode: 'team_member_tool_narrowing_unsupported',
      mutate: (record: TeamDefinitionRecord) => {
        specialistOf(record).allowedToolNames = ['Read'];
      },
    },
    {
      title: '成员要求只读',
      reasonCode: 'team_member_readonly_unsupported',
      mutate: (record: TeamDefinitionRecord) => {
        specialistOf(record).isReadonly = true;
      },
    },
  ])('对$title的团队保持可见但明确标记为暂不支持', async ({
    reasonCode,
    mutate,
  }) => {
    const record = teamRecord(`unsupported-${reasonCode}`, 'user');
    mutate(record);
    const adapter = new ExistingTeamCatalogAdapter(
      gatewayWithRecords([record]),
    );

    const snapshot = await adapter.load({});

    expect(snapshot.status).toBe('ready');
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]).toMatchObject({
      leadBinding: 'definition_only',
      activationSupport: 'definition_only',
      availability: {
        status: 'unsupported',
        reasonCode,
        message: `catalog.availability.${reasonCode}`,
      },
    });
  });

  it('主理人 Skill 白名单由可信运行时收窄，不再阻止团队激活', async () => {
    const record = teamRecord('lead-with-skills', 'user');
    leadOf(record).allowedSkillKeys = ['skill-a'];
    const adapter = new ExistingTeamCatalogAdapter(
      gatewayWithRecords([record]),
    );

    const snapshot = await adapter.load({});

    expect(snapshot.entries[0]).toMatchObject({
      leadBinding: 'parent_persona',
      activationSupport: 'parent_persona',
      availability: { status: 'available' },
    });
  });

  it('成员 Skill 白名单由可信运行时收窄，不再阻止团队激活', async () => {
    const record = teamRecord('specialist-with-skills', 'user');
    specialistOf(record).allowedSkillKeys = ['skill-a'];
    const adapter = new ExistingTeamCatalogAdapter(
      gatewayWithRecords([record]),
    );

    const snapshot = await adapter.load({});

    expect(snapshot.entries[0]).toMatchObject({
      leadBinding: 'parent_persona',
      activationSupport: 'parent_persona',
      availability: { status: 'available' },
    });
  });

  it('忽略 fixed_runtime 记录，固定团队继续由原专用 adapters 所有', async () => {
    const fixed = teamRecord(
      'ai-short-drama-team',
      'user',
    );
    (fixed.definition as unknown as { origin: string }).origin =
      'fixed_runtime';
    const adapter = new ExistingTeamCatalogAdapter(gatewayWithRecords([fixed]));

    const snapshot = await adapter.load({});

    expect(snapshot.entries).toEqual([]);
    expect(snapshot.errors).toEqual([]);
  });

  it('跨用户级和项目级出现相同团队 ID 时隐藏全部冲突项，其他团队仍可选择', async () => {
    const user = teamRecord('duplicate-team', 'user');
    const project = teamRecord('duplicate-team', 'project');
    const unique = teamRecord('unique-team', 'project');
    const adapter = new ExistingTeamCatalogAdapter(
      gatewayWithRecords([user, project, unique]),
    );

    const snapshot = await adapter.load({ workspacePath: 'D:/workspace' });

    expect(snapshot.status).toBe('partial');
    expect(snapshot.entries.map(entry => entry.identity.id)).toEqual([
      'unique-team',
    ]);
    expect(snapshot.errors).toEqual([
      {
        sourceId: 'existing-team-definitions',
        code: 'team_definition_id_ambiguous',
        message: 'catalog.errors.team_definition_id_ambiguous',
      },
    ]);
  });

  it('已安装团队与可编辑团队 ID 冲突时同样 fail closed 且只报告一次', async () => {
    const installed = teamRecord('installed-conflict', 'installed');
    const editable = teamRecord('installed-conflict', 'user');
    const adapter = new ExistingTeamCatalogAdapter(
      gatewayWithRecords([installed, editable]),
    );

    const snapshot = await adapter.load({});

    expect(snapshot.status).toBe('partial');
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.errors).toEqual([
      {
        sourceId: 'existing-team-definitions',
        code: 'team_definition_id_ambiguous',
        message: 'catalog.errors.team_definition_id_ambiguous',
      },
    ]);
  });

  it('单个损坏定义产生 partial，不会让其他定义消失', async () => {
    const valid = teamRecord('custom-valid', 'project');
    const invalid = teamRecord('custom-invalid', 'user');
    invalid.definition.leadMemberId = 'missing';
    const adapter = new ExistingTeamCatalogAdapter(
      gatewayWithRecords([invalid, valid]),
    );

    const snapshot = await adapter.load({});

    expect(snapshot.status).toBe('partial');
    expect(snapshot.entries.map(entry => entry.identity.id)).toEqual([
      'custom-valid',
    ]);
    expect(snapshot.errors).toContainEqual({
      sourceId: 'existing-team-definitions',
      code: 'team_definition_projection_failed',
      message: 'catalog.errors.team_definition_projection_failed',
    });
  });
});
