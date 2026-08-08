import { describe, expect, it } from 'vitest';
import type {
  TeamMemberDraft,
  TeamWorkflowDraft,
} from '@/infrastructure/config/types';
import {
  createManualTeamDraft,
  createTeamDraftFromRoster,
  createTeamDraftFromDescription,
  createTeamDraftFromMaterial,
} from './TeamAuthoringService';

function validMembers(): TeamMemberDraft[] {
  return [
    {
      clientKey: 'lead',
      displayName: '交付负责人',
      professionalRole: '技术统筹',
      role: 'lead',
      instructions: '拆解任务并协调团队。',
      outputResponsibility: '汇总最终交付结果。',
      agentId: 'agentic',
      allowedSkillKeys: ['user::void::delivery'],
      allowedToolNames: ['Read'],
      isReadonly: false,
    },
    {
      clientKey: 'developer',
      displayName: '开发工程师',
      professionalRole: '实现专家',
      role: 'specialist',
      instructions: '独立完成实现并提供证据。',
      outputResponsibility: '提交可验证的实现方案。',
      agentId: 'agentic',
      allowedSkillKeys: [],
      allowedToolNames: [],
      isReadonly: false,
    },
  ];
}

function validWorkflow(): TeamWorkflowDraft {
  return {
    clientKey: 'delivery',
    displayName: '软件交付流程',
    triggerDescription: '需要设计和实现软件功能时使用。',
    phases: [
      {
        clientKey: 'implementation',
        displayName: '实现',
        kind: 'parallel',
        dependsOnPhaseKeys: [],
        assignedMemberKeys: ['developer'],
        expectedOutputs: ['实现方案'],
        completionRule: '开发工程师提交可验证方案。',
      },
      {
        clientKey: 'review',
        displayName: '复核',
        kind: 'review',
        dependsOnPhaseKeys: ['implementation'],
        assignedMemberKeys: ['lead'],
        expectedOutputs: ['复核结论'],
        completionRule: '负责人确认交付结果。',
      },
    ],
  };
}

describe('TeamAuthoringService', () => {
  it('把选中的已有智能体整理为唯一主理人与默认协作流程', () => {
    const result = createTeamDraftFromRoster({
      displayName: '游戏制作小队',
      goal: '完成游戏玩法、视觉与交付复核。',
      leadAgentId: 'user::void::producer',
      selectedAgents: [
        {
          agentId: 'user::void::producer',
          displayName: '游戏制作人',
          description: '负责整体方向',
          scenarioEligibility: ['code', 'media'],
          isReadonly: false,
        },
        {
          agentId: 'project::void::developer',
          displayName: '玩法开发',
          description: '负责玩法实现',
          scenarioEligibility: ['code'],
          isReadonly: false,
        },
        {
          agentId: 'user::void::reviewer',
          displayName: '质量审核',
          description: '负责交付审核',
          scenarioEligibility: ['code', 'cowork'],
          isReadonly: true,
        },
      ],
      template: { defaultCategory: '智能体团队' },
    });

    expect(result.isValid).toBe(true);
    expect(result.draft.scenarioEligibility).toEqual(['code']);
    expect(result.draft.members.map(member => member.agentId)).toEqual([
      'user::void::producer',
      'project::void::developer',
      'user::void::reviewer',
    ]);
    expect(result.draft.members.filter(member => member.role === 'lead'))
      .toEqual([expect.objectContaining({ agentId: 'user::void::producer' })]);
    expect(result.draft.workflows[0]?.phases).toEqual([
      expect.objectContaining({
        kind: 'parallel',
        assignedMemberKeys: ['member-2', 'member-3'],
      }),
      expect.objectContaining({
        kind: 'review',
        assignedMemberKeys: ['member-1'],
        dependsOnPhaseKeys: ['specialist-work'],
      }),
    ]);
  });

  it('去重智能体引用，并在切换主理人时重建复核阶段引用', () => {
    const duplicateAgent = {
      agentId: 'user::void::writer',
      displayName: '剧情编剧',
      description: '负责剧情',
      scenarioEligibility: ['media'] as const,
      isReadonly: false,
    };
    const result = createTeamDraftFromRoster({
      displayName: '短剧小队',
      goal: '交付一版可拍摄短剧。',
      leadAgentId: 'user::void::director',
      selectedAgents: [
        duplicateAgent,
        duplicateAgent,
        {
          agentId: 'user::void::director',
          displayName: '短剧导演',
          description: '负责统筹',
          scenarioEligibility: ['media'],
          isReadonly: false,
        },
      ],
    });

    expect(result.isValid).toBe(true);
    expect(result.draft.members).toHaveLength(2);
    expect(result.draft.leadMemberKey).toBe('member-2');
    expect(result.draft.workflows[0]?.phases[1]?.assignedMemberKeys)
      .toEqual(['member-2']);
  });

  it('没有共同可用房间时拒绝生成可保存团队', () => {
    const result = createTeamDraftFromRoster({
      displayName: '不兼容团队',
      goal: '尝试跨房间协作。',
      leadAgentId: 'user::void::coder',
      selectedAgents: [
        {
          agentId: 'user::void::coder',
          displayName: '代码智能体',
          description: '',
          scenarioEligibility: ['code'],
          isReadonly: false,
        },
        {
          agentId: 'user::void::artist',
          displayName: '设计智能体',
          description: '',
          scenarioEligibility: ['media'],
          isReadonly: false,
        },
      ],
    });

    expect(result.isValid).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'scenario_required',
      field: 'scenarioEligibility',
    }));
  });

  it('把自然语言入口整理为含主理人、专家和显式工作流的 canonical draft', () => {
    const result = createTeamDraftFromDescription({
      displayName: '软件交付团队',
      sourceText: '负责从需求澄清、实现到交付复核的完整软件开发流程。',
      scenarioEligibility: ['code'],
      template: {
        defaultCategory: '通用团队',
        leadDisplayName: '团队主理人',
      },
    });

    expect(result.isValid).toBe(true);
    expect(result.draft).toMatchObject({
      displayName: '软件交付团队',
      category: '通用团队',
      leadMemberKey: 'lead',
      scenarioEligibility: ['code'],
    });
    expect(result.draft.members).toHaveLength(2);
    expect(result.draft.members.map(member => member.role)).toEqual([
      'lead',
      'specialist',
    ]);
    expect(result.draft.members[0]?.displayName).toBe('团队主理人');
    expect(result.draft.workflows[0]?.phases).toHaveLength(2);
    expect(result.draft.workflows[0]?.phases[1]?.dependsOnPhaseKeys).toEqual([
      'specialist-work',
    ]);
  });

  it('资料入口使用可注入模板，不把英文默认文案写入用户定义', () => {
    const result = createTeamDraftFromMaterial({
      displayName: '财报分析团队',
      sourceText: '先核对报表口径，再分析关键指标，最后复核风险。',
      scenarioEligibility: ['cowork'],
      template: {
        defaultCategory: '金融分析',
        leadDisplayName: '首席分析师',
        specialistDisplayName: '财务研究员',
        workflowDisplayName: '财报复核流程',
      },
    });

    expect(result.isValid).toBe(true);
    expect(result.draft.category).toBe('金融分析');
    expect(result.draft.members[0]?.displayName).toBe('首席分析师');
    expect(result.draft.members[1]?.displayName).toBe('财务研究员');
    expect(result.draft.members[0]?.instructions).toContain('核对报表口径');
    expect(result.draft.workflows[0]?.displayName).toBe('财报复核流程');
  });

  it('手动入口保留 raw Agent、Skill、Tool 引用并归一化顺序外的空白', () => {
    const result = createManualTeamDraft({
      displayName: ' 软件交付团队 ',
      description: ' 负责软件交付。 ',
      category: ' 技术工程 ',
      capabilityTags: [' 交付 ', '交付', '质量'],
      scenarioEligibility: ['code', 'code'],
      leadMemberKey: ' lead ',
      members: validMembers(),
      workflows: [validWorkflow()],
    });

    expect(result.isValid).toBe(true);
    expect(result.draft.displayName).toBe('软件交付团队');
    expect(result.draft.capabilityTags).toEqual(['交付', '质量']);
    expect(result.draft.members[0]).toMatchObject({
      clientKey: 'lead',
      agentId: 'agentic',
      allowedSkillKeys: ['user::void::delivery'],
      allowedToolNames: ['Read'],
    });
  });

  it('拒绝单成员、重复主理人、未知引用与工作流环', () => {
    const members = validMembers();
    members[1] = {
      ...members[1]!,
      clientKey: 'lead',
      role: 'lead',
      agentId: undefined,
    };
    const workflow = validWorkflow();
    workflow.phases[0] = {
      ...workflow.phases[0]!,
      dependsOnPhaseKeys: ['review'],
      assignedMemberKeys: ['missing-member'],
    };

    const result = createManualTeamDraft({
      displayName: '异常团队',
      description: '用于验证错误。',
      category: '',
      scenarioEligibility: [],
      leadMemberKey: 'lead',
      members,
      workflows: [workflow],
    });
    const codes = result.diagnostics.map(diagnostic => diagnostic.code);

    expect(result.isValid).toBe(false);
    expect(codes).toEqual(expect.arrayContaining([
      'category_required',
      'scenario_required',
      'duplicate_member_key',
      'lead_member_must_appear_once',
      'member_agent_reference_required',
      'phase_member_not_found',
      'workflow_cycle',
    ]));
  });

  it('对成员、工作流和阶段数量执行与 Core 一致的上限门禁', () => {
    const result = createManualTeamDraft({
      displayName: '超限团队',
      description: '用于验证上限。',
      category: '测试',
      scenarioEligibility: ['code'],
      leadMemberKey: 'lead',
      members: validMembers().slice(0, 1),
      workflows: Array.from({ length: 9 }, (_, index) => ({
        ...validWorkflow(),
        clientKey: `workflow-${index}`,
        phases: Array.from({ length: 21 }, (__, phaseIndex) => ({
          ...validWorkflow().phases[0]!,
          clientKey: `phase-${phaseIndex}`,
        })),
      })),
    });
    const codes = result.diagnostics.map(diagnostic => diagnostic.code);

    expect(result.isValid).toBe(false);
    expect(codes).toContain('member_count_out_of_range');
    expect(codes).toContain('workflow_count_out_of_range');
    expect(codes).toContain('phase_count_out_of_range');
  });
});
