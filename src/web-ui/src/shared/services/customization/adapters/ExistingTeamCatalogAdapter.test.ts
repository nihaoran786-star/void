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
          isReadonly: origin === 'installed',
        },
      ],
      workflows: [],
      collaborationPolicy: 'lead_mediated',
      permissionPolicy: 'inherit_parent_intersection',
      origin,
    },
  };
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
  it('把自建和安装定义投影为 definition_only，绝不宣称已有运行时', async () => {
    const user = teamRecord('custom-user', 'user');
    const installed = teamRecord('custom-installed', 'installed');
    const gateway = gatewayWithRecords([user, installed]);
    const adapter = new ExistingTeamCatalogAdapter(gateway);

    const snapshot = await adapter.load({ workspacePath: 'D:/workspace' });

    expect(gateway.list).toHaveBeenCalledWith({
      workspacePath: 'D:/workspace',
    });
    expect(snapshot.status).toBe('ready');
    expect(snapshot.entries).toHaveLength(2);
    for (const entry of snapshot.entries) {
      expect(entry).toMatchObject({
        kind: 'team',
        leadBinding: 'definition_only',
        activationSupport: 'definition_only',
        availability: {
          status: 'unsupported',
          reasonCode: 'team_definition_runtime_not_implemented',
        },
      });
    }
    expect(snapshot.entries[1]?.lead.isReadonly).toBe(true);
    expect(snapshot.entries[1]?.members[0]?.isReadonly).toBe(true);
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
