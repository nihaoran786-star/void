import { describe, expect, it } from 'vitest';
import {
  organizeSkillDraft,
  skillScenariosFromAllowedParentAgentIds,
} from './SkillAuthoringService';

describe('SkillAuthoringService', () => {
  it('将自然语言整理为同一份规范化技能定义', () => {
    const result = organizeSkillDraft({
      route: 'describe',
      displayName: '财务报告分析',
      sourceText: '分析财务报告，核对关键指标并给出风险提示。',
      scenarios: ['cowork'],
    });

    expect(result.isValid).toBe(true);
    expect(result.draft).toEqual(expect.objectContaining({
      displayName: '财务报告分析',
      scenarios: ['cowork'],
      permissionPolicy: 'inherit_parent_intersection',
      authoringSource: 'deterministic_local',
    }));
    expect(result.draft.allowedParentAgentIds).toEqual([
      'Claw',
      'Cowork',
      'DeepResearch',
    ]);
    expect(result.draft.suggestedPrompts).toHaveLength(3);
    expect(result.draft.instructions).toContain('财务报告');
  });

  it('手动定义缺少关键字段时返回结构化诊断', () => {
    const result = organizeSkillDraft({
      route: 'manual',
      displayName: '',
      description: '',
      instructions: '',
      scenarios: [],
      suggestedPrompts: [],
    });

    expect(result.isValid).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'display_name_required',
      'description_required',
      'instructions_required',
      'scenario_required',
      'suggested_prompt_required',
    ]);
  });

  it('从运行时父智能体范围还原三个中文场景', () => {
    expect(skillScenariosFromAllowedParentAgentIds(['agentic', 'Media'])).toEqual([
      'code',
      'media',
    ]);
    expect(skillScenariosFromAllowedParentAgentIds([])).toEqual([
      'code',
      'cowork',
      'media',
    ]);
  });
});
