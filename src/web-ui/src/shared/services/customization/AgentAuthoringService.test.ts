import { describe, expect, it } from 'vitest';
import {
  organizeAgentDraft,
  scenariosFromAllowedParentAgentIds,
} from './AgentAuthoringService';

describe('AgentAuthoringService', () => {
  it('organizes a natural-language description into the canonical local draft', () => {
    const result = organizeAgentDraft({
      route: 'describe',
      displayName: ' 前端开发专家 ',
      sourceText: '负责 React 与 TypeScript 开发，并在交付前检查可访问性。',
      scenarios: ['code'],
    });

    expect(result.isValid).toBe(true);
    expect(result.draft).toMatchObject({
      displayName: '前端开发专家',
      description: '负责 React 与 TypeScript 开发，并在交付前检查可访问性。',
      scenarios: ['code'],
      authoringSource: 'deterministic_local',
    });
    expect(result.draft.prompt).toContain('You are "前端开发专家"');
    expect(result.draft.allowedParentAgentIds).toEqual([
      'Multitask',
      'Plan',
      'Team',
      'agentic',
      'debug',
    ]);
  });

  it('imports supplied material without pretending an AI generation occurred', () => {
    const result = organizeAgentDraft({
      route: 'material',
      displayName: '财报分析师',
      sourceText: '流程：先提取财务指标，再识别风险，最后给出证据引用。',
      scenarios: ['cowork'],
    });

    expect(result.isValid).toBe(true);
    expect(result.draft.authoringSource).toBe('deterministic_local');
    expect(result.draft.prompt).toContain('Imported material:');
    expect(result.draft.prompt).toContain('先提取财务指标');
    expect(result.draft.allowedParentAgentIds).toEqual([
      'Claw',
      'Cowork',
      'DeepResearch',
    ]);
  });

  it('keeps manual input in the same canonical draft and reports typed diagnostics', () => {
    const result = organizeAgentDraft({
      route: 'manual',
      displayName: '',
      description: '',
      prompt: '',
      scenarios: [],
    });

    expect(result.isValid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'display_name_required',
      'description_required',
      'prompt_required',
      'scenario_required',
    ]);
    expect(result.draft.allowedParentAgentIds).toEqual([]);
  });

  it('maps legacy public details to every scenario and restricted details to matching scenarios', () => {
    expect(scenariosFromAllowedParentAgentIds([])).toEqual(['code', 'cowork', 'media']);
    expect(scenariosFromAllowedParentAgentIds(['Media', 'agentic'])).toEqual([
      'code',
      'media',
    ]);
  });
});
