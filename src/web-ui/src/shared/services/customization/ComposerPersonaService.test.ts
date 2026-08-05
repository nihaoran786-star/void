import { describe, expect, it } from 'vitest';
import type { SubagentInfo } from '@/infrastructure/api/service-api/SubagentAPI';
import type { TeamDefinitionRecord } from '@/infrastructure/config/types';
import { FALLBACK_REVIEW_TEAM_DEFINITION } from '@/shared/services/review-team/defaults';
import { CapabilityCatalogService } from './CapabilityCatalogService';
import { ComposerPersonaService } from './ComposerPersonaService';
import { mapSubagentToCatalogEntry } from './adapters/ExistingAgentCatalogAdapter';
import { mapDeepReviewDefinitionToCatalogEntry } from './adapters/DeepReviewTeamAdapter';
import { mapTeamDefinitionRecordToCatalogEntry } from './adapters/ExistingTeamCatalogAdapter';
import { createShortDramaTeamCatalogEntry } from './adapters/ShortDramaTeamAdapter';
import type { CapabilityCatalogSource, TeamCatalogEntry } from './types';

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

function createReusableTeamEntry(): TeamCatalogEntry {
  const record: TeamDefinitionRecord = {
    revision: 'team-prompt-v1',
    level: 'project',
    path: 'D:/repo/.void/teams/software-team.json',
    isAuthorable: true,
    definition: {
      schemaVersion: 1,
      teamDefinitionId: 'software-team',
      displayName: '软件开发团队',
      description: '由主理人协调开发专家完成软件交付。',
      category: '技术工程',
      capabilityTags: ['软件开发'],
      scenarioEligibility: ['code'],
      leadMemberId: 'software-lead',
      members: [
        {
          memberId: 'software-lead',
          displayName: '研发主理人',
          professionalRole: '研发负责人',
          role: 'lead',
          instructions: '拆解任务并协调成员。',
          outputResponsibility: '汇总并交付最终结果。',
          agentId: 'agentic',
          allowedSkillKeys: [],
          allowedToolNames: [],
          permissionPolicy: 'inherit_parent_intersection',
          isReadonly: false,
        },
        {
          memberId: 'implementation-engineer',
          displayName: '实现工程师',
          professionalRole: '软件工程师',
          role: 'specialist',
          instructions: '完成分派的实现任务。',
          outputResponsibility: '提交实现结果。',
          allowedSkillKeys: [],
          allowedToolNames: [],
          permissionPolicy: 'inherit_parent_intersection',
          isReadonly: false,
        },
      ],
      workflows: [],
      collaborationPolicy: 'lead_mediated',
      permissionPolicy: 'inherit_parent_intersection',
      origin: 'project',
    },
  };
  return mapTeamDefinitionRecordToCatalogEntry(record);
}

const reusableTeam = createReusableTeamEntry();

const source: CapabilityCatalogSource = {
  sourceId: 'composer-test',
  async load() {
    return {
      sourceId: 'composer-test',
      status: 'ready',
      entries: [
        customAgent,
        builtinAgent,
        reusableTeam,
        mapDeepReviewDefinitionToCatalogEntry(FALLBACK_REVIEW_TEAM_DEFINITION),
        createShortDramaTeamCatalogEntry(),
      ],
      errors: [],
    };
  },
};

describe('ComposerPersonaService', () => {
  const service = new ComposerPersonaService(new CapabilityCatalogService([source]));

  it('向 Code 输入框提供可执行智能体、兼容通用团队与代码审查团队', async () => {
    const result = await service.list({
      scenario: 'code',
      executionPolicy: 'agentic',
      workspacePath: 'D:/repo',
    });

    expect(result.agents.map(entry => entry.identity.id)).toEqual([
      'project::void::frontend-lead',
    ]);
    expect(result.teams.map(entry => entry.identity.id)).toEqual([
      'software-team',
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
      'software-team',
      'default-review-team',
    ]);
  });

  it('生成 source-qualified 已知版本绑定，固定审查团队保留原入口，短剧团队使用通用主理人运行时', () => {
    expect(service.createAgentBinding(customAgent, 'code')).toEqual({
      kind: 'agent',
      personaId: 'project::void::frontend-lead',
      personaRevision: { status: 'known', value: 'prompt-v1' },
    });
    expect(service.resolveTeamAction(
      mapDeepReviewDefinitionToCatalogEntry(FALLBACK_REVIEW_TEAM_DEFINITION),
      'code',
    )).toBe('launch_deep_review');
    expect(service.isReusableTeam(
      createShortDramaTeamCatalogEntry(),
      'media',
    )).toBe(true);
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

  it('仅接受团队版本与主理人版本严格匹配的通用团队', async () => {
    const mismatchedTeam = createReusableTeamEntry();
    mismatchedTeam.lead.identity.revision = {
      status: 'known',
      value: 'stale-team-version:software-lead',
    };
    const mismatchedSource: CapabilityCatalogSource = {
      sourceId: 'mismatched-team-test',
      async load() {
        return {
          sourceId: 'mismatched-team-test',
          status: 'ready',
          entries: [mismatchedTeam],
          errors: [],
        };
      },
    };
    const strictService = new ComposerPersonaService(
      new CapabilityCatalogService([mismatchedSource]),
    );

    const result = await strictService.list({ scenario: 'code' });

    expect(strictService.isReusableTeam(mismatchedTeam, 'code')).toBe(false);
    expect(result.teams).toEqual([]);
  });

  it('通用团队只走父会话主理人激活，不会误入固定团队入口', () => {
    expect(service.isReusableTeam(reusableTeam, 'code')).toBe(true);
    expect(service.isReusableTeam(reusableTeam, 'media')).toBe(false);
    expect(() => service.resolveTeamAction(reusableTeam, 'code')).toThrow(
      'Team is not available in this scenario',
    );
  });
});
