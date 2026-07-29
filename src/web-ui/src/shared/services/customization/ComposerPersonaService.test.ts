import { describe, expect, it } from 'vitest';
import type { SubagentInfo } from '@/infrastructure/api/service-api/SubagentAPI';
import { FALLBACK_REVIEW_TEAM_DEFINITION } from '@/shared/services/review-team/defaults';
import { CapabilityCatalogService } from './CapabilityCatalogService';
import { ComposerPersonaService } from './ComposerPersonaService';
import { mapSubagentToCatalogEntry } from './adapters/ExistingAgentCatalogAdapter';
import { mapDeepReviewDefinitionToCatalogEntry } from './adapters/DeepReviewTeamAdapter';
import { createShortDramaTeamCatalogEntry } from './adapters/ShortDramaTeamAdapter';
import type { CapabilityCatalogSource } from './types';

const customAgent = mapSubagentToCatalogEntry({
  key: 'project::void::frontend-lead',
  id: 'frontend-lead',
  name: '前端负责人',
  description: '负责前端架构与交付。',
  isReadonly: false,
  isReview: false,
  toolCount: 3,
  defaultTools: ['Read', 'Edit', 'Bash'],
  defaultEnabled: true,
  effectiveEnabled: true,
  subagentSource: 'project',
  promptCacheScopeKey: 'prompt-v1',
  visibility: {
    showInGlobalRegistry: true,
    allowedParentAgentIds: ['agentic'],
  },
} as SubagentInfo & { promptCacheScopeKey: string });

const builtinAgent = mapSubagentToCatalogEntry({
  key: 'builtin::void::Explore',
  id: 'Explore',
  name: 'Explore',
  description: 'Explore files',
  isReadonly: true,
  isReview: false,
  toolCount: 1,
  defaultTools: ['Read'],
  defaultEnabled: true,
  effectiveEnabled: true,
  subagentSource: 'builtin',
} as SubagentInfo);

const source: CapabilityCatalogSource = {
  sourceId: 'composer-test',
  async load() {
    return {
      sourceId: 'composer-test',
      status: 'ready',
      entries: [
        customAgent,
        builtinAgent,
        mapDeepReviewDefinitionToCatalogEntry(FALLBACK_REVIEW_TEAM_DEFINITION),
        createShortDramaTeamCatalogEntry(),
      ],
      errors: [],
    };
  },
};

describe('ComposerPersonaService', () => {
  const service = new ComposerPersonaService(new CapabilityCatalogService([source]));

  it('只向 Code 输入框提供可执行的项目/用户智能体与代码审查团队', async () => {
    const result = await service.list({
      scenario: 'code',
      executionPolicy: 'agentic',
      workspacePath: 'D:/repo',
    });

    expect(result.agents.map(entry => entry.identity.id)).toEqual([
      'project::void::frontend-lead',
    ]);
    expect(result.teams.map(entry => entry.identity.id)).toEqual([
      'default-review-team',
    ]);
  });

  it('按当前执行策略精确过滤智能体，避免在 Plan 中展示仅限 Agentic 的人格', async () => {
    const result = await service.list({
      scenario: 'code',
      executionPolicy: 'Plan',
      workspacePath: 'D:/repo',
    });

    expect(result.agents).toEqual([]);
    expect(result.teams.map(entry => entry.identity.id)).toEqual([
      'default-review-team',
    ]);
  });

  it('生成 source-qualified 已知版本绑定，且固定团队只解析为原入口动作', () => {
    expect(service.createAgentBinding(customAgent, 'code')).toEqual({
      kind: 'agent',
      personaId: 'project::void::frontend-lead',
      personaRevision: { status: 'known', value: 'prompt-v1' },
    });
    expect(service.resolveTeamAction(
      mapDeepReviewDefinitionToCatalogEntry(FALLBACK_REVIEW_TEAM_DEFINITION),
      'code',
    )).toBe('launch_deep_review');
    expect(service.resolveTeamAction(
      createShortDramaTeamCatalogEntry(),
      'media',
    )).toBe('open_short_drama');
  });

  it('拒绝把 builtin 智能体或跨场景团队伪装成父会话人格', () => {
    expect(() => service.createAgentBinding(builtinAgent, 'code')).toThrow(
      'Agent is not available as a parent persona',
    );
    expect(() => service.resolveTeamAction(
      createShortDramaTeamCatalogEntry(),
      'code',
    )).toThrow('Team is not available in this scenario');
  });
});
