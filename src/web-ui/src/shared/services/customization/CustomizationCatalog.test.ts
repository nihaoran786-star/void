import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ModeInfo } from '@/infrastructure/api/service-api/AgentAPI';
import type { SubagentInfo } from '@/infrastructure/api/service-api/SubagentAPI';
import type { SkillInfo } from '@/infrastructure/config/types';
import { FALLBACK_REVIEW_TEAM_DEFINITION } from '@/shared/services/review-team/defaults';
import { CapabilityCatalogService } from './CapabilityCatalogService';
import {
  ExistingAgentCatalogAdapter,
  mapModeToCatalogEntry,
  mapSubagentToCatalogEntry,
} from './adapters/ExistingAgentCatalogAdapter';
import { mapSkillToCatalogEntry } from './adapters/ExistingSkillCatalogAdapter';
import { mapDeepReviewDefinitionToCatalogEntry } from './adapters/DeepReviewTeamAdapter';
import {
  createShortDramaTeamCatalogEntry,
  SHORT_DRAMA_TEAM_CATALOG_ID,
} from './adapters/ShortDramaTeamAdapter';
import type {
  CapabilityCatalogEntry,
  CapabilityCatalogSource,
  CatalogSourceSnapshot,
  SkillCatalogEntry,
} from './types';
import {
  BUILTIN_SKILL_PRESENTATION_IDS,
  isMarketSkillInstalled,
  presentationForInstalledSkill,
  EXTERNAL_SKILL_PRESENTATION_IDS,
  presentationForMarketSkill,
  STANDARD_SKILL_PRESENTATION_IDS,
} from './skillCatalogPresentation';
import {
  localizeCatalogPresentation,
  resolveDefaultCatalogPresentation,
} from './presentationMetadata';

function source(
  sourceId: string,
  result: CatalogSourceSnapshot | Error,
): CapabilityCatalogSource {
  return {
    sourceId,
    async load() {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

function skillEntry(overrides: Partial<SkillCatalogEntry> = {}): SkillCatalogEntry {
  return {
    kind: 'skill',
    identity: {
      id: 'docx',
      revision: { status: 'legacy_unversioned' },
      displayName: 'Word 文档',
      description: '创建和编辑 Word 文档。',
      aliases: ['docx'],
    },
    source: {
      adapterId: 'existing-skills',
      recordType: 'skill',
      recordId: 'builtin:docx',
    },
    origin: 'builtin',
    scenarioEligibility: ['code', 'cowork', 'media'],
    tags: ['内置技能'],
    availability: { status: 'available' },
    level: 'user',
    sourceSlot: 'builtin:docx',
    isBuiltin: true,
    isShadowed: false,
    isAuthorable: false,
    ...overrides,
  };
}

interface SkillLocaleCatalog {
  catalog: {
    standard: Record<string, { name: string; description: string }>;
  };
}

function readSkillLocale(locale: 'zh-CN' | 'en-US' | 'zh-TW'): SkillLocaleCatalog {
  const path = fileURLToPath(new URL(
    `../../../locales/${locale}/scenes/skills.json`,
    import.meta.url,
  ));
  return JSON.parse(readFileSync(path, 'utf8')) as SkillLocaleCatalog;
}

describe('CapabilityCatalogService', () => {
  it('按来源身份去重，且不会按中文展示名或裸 ID 合并不同来源', async () => {
    const first = skillEntry();
    const second = skillEntry({
      source: {
        adapterId: 'other-skills',
        recordType: 'skill',
        recordId: 'builtin:docx',
      },
      origin: 'project',
      sourceSlot: 'project:docx',
    });
    const service = new CapabilityCatalogService([
      source('skills', {
        sourceId: 'skills',
        status: 'ready',
        entries: [first, first, second],
        errors: [],
      }),
    ]);

    const result = await service.list();

    expect(result.status).toBe('ready');
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map(entry => entry.identity.id)).toEqual(['docx', 'docx']);
  });

  it('按场景过滤，且保留来源失败的 partial 状态', async () => {
    const mediaTeam = createShortDramaTeamCatalogEntry();
    const service = new CapabilityCatalogService([
      source('short-drama', {
        sourceId: 'short-drama',
        status: 'ready',
        entries: [mediaTeam],
        errors: [],
      }),
      source('broken', new Error('boom')),
    ]);

    const media = await service.list({ scenario: 'media' });
    const code = await service.list({ scenario: 'code' });

    expect(media.status).toBe('partial');
    expect(media.entries.map(entry => entry.identity.id)).toEqual([
      SHORT_DRAMA_TEAM_CATALOG_ID,
    ]);
    expect(code.status).toBe('partial');
    expect(code.entries).toEqual([]);
    expect(code.errors).toEqual([
      expect.objectContaining({ sourceId: 'broken', code: 'catalog_source_load_failed' }),
    ]);
  });
});

describe('existing Agent and Skill catalog mappings', () => {
  const mode: ModeInfo = {
    id: 'agentic',
    name: 'Agentic',
    description: 'Coding mode',
    isReadonly: false,
    toolCount: 12,
    promptCacheScopeKey: 'code',
    configProfileId: 'code',
    configProfileMemberModeIds: ['agentic'],
  };
  const subagent: SubagentInfo & { promptCacheScopeKey: string } = {
    key: 'user::void::agentic',
    id: 'agentic',
    name: 'Agentic helper',
    description: 'Custom helper',
    isReadonly: true,
    isReview: false,
    toolCount: 2,
    defaultTools: ['Read'],
    defaultEnabled: true,
    effectiveEnabled: true,
    subagentSource: 'user',
    promptCacheScopeKey:
      'custom_prompt_sha256:test||workspace_context|workspace_instructions',
  };

  it('中文展示与稳定 runtime ID 分离，并保留 mode/subagent 来源', async () => {
    const modeEntry = mapModeToCatalogEntry(mode);
    const subagentEntry = mapSubagentToCatalogEntry(subagent);
    const adapter = new ExistingAgentCatalogAdapter({
      loadModes: async () => [mode],
      loadSubagents: async () => [subagent],
    });
    const snapshot = await adapter.load({});

    expect(modeEntry.identity.id).toBe('agentic');
    expect(modeEntry.identity.id).toBe('agentic');
    expect(modeEntry.identity.displayName).toBe('Agentic');
    expect(modeEntry.identity.displayNameKey).toBe(
      'catalog.presentations.modes.agentic.name',
    );
    expect(modeEntry.availability.status).toBe('unsupported');
    expect(subagentEntry.identity.id).toBe('user::void::agentic');
    expect(subagentEntry.identity.revision).toEqual({
      status: 'known',
      value:
        'custom_prompt_sha256:test||workspace_context|workspace_instructions',
    });
    expect(subagentEntry.source.recordType).toBe('subagent');
    expect(subagentEntry.executionPolicyEligibility).toEqual([]);
    expect(subagentEntry.availability.status).toBe('available');
    expect(subagentEntry.activationSupport).toBe('parent_persona');
    expect(snapshot.entries).toHaveLength(2);
  });

  it('按精确执行策略过滤智能体，而不把同属 Code 的模式混在一起', async () => {
    const agenticOnly = mapSubagentToCatalogEntry({
      ...subagent,
      visibility: {
        showInGlobalRegistry: true,
        allowedParentAgentIds: ['agentic'],
      },
    });
    const service = new CapabilityCatalogService([
      source('agents', {
        sourceId: 'agents',
        status: 'ready',
        entries: [agenticOnly],
        errors: [],
      }),
    ]);

    expect((await service.list({
      scenario: 'code',
      executionPolicy: 'agentic',
    })).entries).toHaveLength(1);
    expect((await service.list({
      scenario: 'code',
      executionPolicy: 'Plan',
    })).entries).toEqual([]);
  });

  it('Skill 只用 key 作身份，并保留来源优先级与 shadowing 信息', () => {
    const skill: SkillInfo = {
      key: 'project::workspace::docx',
      name: 'Company document workflow',
      description: 'Document tools',
      path: 'ignored-by-catalog',
      level: 'project',
      sourceSlot: 'workspace',
      dirName: 'docx',
      isBuiltin: false,
      isShadowed: true,
      shadowedByKey: 'user:docx',
    };

    const entry = mapSkillToCatalogEntry(skill);

    expect(entry.identity.id).toBe('project::workspace::docx');
    expect(entry.identity.displayName).toBe('Company document workflow');
    expect(entry.identity.displayNameKey).toBeUndefined();
    expect(entry.sourceSlot).toBe('workspace');
    expect(entry.availability).toEqual(expect.objectContaining({
      status: 'disabled',
      reasonCode: 'shadowed',
    }));
    expect(entry.shadowedByKey).toBe('user:docx');
  });

  it('覆盖内置智能体中文展示但不修改 runtime ID', () => {
    const ids = [
      'Explore',
      'FileFinder',
      'CodeReview',
      'GenerateDoc',
      'GeneralPurpose',
      'ResearchSpecialist',
      'ComputerUse',
      'DeepReview',
      'ReviewArchitecture',
      'ScriptAI',
      'AssetAI',
      'SplitAI',
      'VideoAI',
      'EditorAI',
    ];
    const presentations = ids.map(id => ({
      id,
      presentation: resolveDefaultCatalogPresentation({
        kind: 'subagent',
        id,
        runtimeName: id,
      }),
    }));
    expect(presentations.every(
      item => item.presentation.displayNameKey?.endsWith('.name'),
    )).toBe(true);
    expect(presentations.map(item => item.id)).toEqual(ids);
  });

  it('使用真实复合 key 时只按 builtin dirName 解析展示，不改变 raw 身份', () => {
    const skill: SkillInfo = {
      key: 'user::void-system::docx',
      name: 'docx',
      description: 'Document tools',
      path: 'C:/skills/docx',
      level: 'user',
      sourceSlot: 'void-system',
      dirName: 'docx',
      isBuiltin: true,
    };
    const presentation = presentationForInstalledSkill(skill);
    const installedRawNames = new Set([skill.name]);

    expect(presentation.displayName).toBe('docx');
    expect(presentation.displayNameKey).toBe('catalog.builtin.docx.name');
    expect(localizeCatalogPresentation(
      presentation,
      key => key === 'catalog.builtin.docx.name' ? 'Word Documents' : 'Document tools',
    ).displayName).toBe('Word Documents');
    expect(skill).toEqual(expect.objectContaining({
      key: 'user::void-system::docx',
      name: 'docx',
      sourceSlot: 'void-system',
      dirName: 'docx',
    }));
    expect(isMarketSkillInstalled(installedRawNames, { name: 'docx' })).toBe(true);
    expect(isMarketSkillInstalled(installedRawNames, { name: 'Word 文档' })).toBe(false);
  });

  it('用户或项目技能即使目录名命中内置 ID 也保留原始展示', () => {
    const skill: SkillInfo = {
      key: 'project::workspace::docx',
      name: 'Company document workflow',
      description: 'Private workflow',
      path: 'D:/project/.agents/skills/docx',
      level: 'project',
      sourceSlot: 'workspace',
      dirName: 'docx',
      isBuiltin: false,
    };

    const presentation = presentationForInstalledSkill(skill);

    expect(presentation.displayName).toBe('Company document workflow');
    expect(presentation.description).toBe('Private workflow');
    expect(presentation.displayNameKey).toBeUndefined();
    expect(skill.key).toBe('project::workspace::docx');
    expect(skill.sourceSlot).toBe('workspace');
  });

  it('未知 builtin dirName 回退 raw name 和 description', () => {
    const presentation = presentationForInstalledSkill({
      key: 'user::void-system::future-skill',
      name: 'Future Skill',
      description: 'Future raw description',
      path: 'C:/builtin/future-skill',
      level: 'user',
      sourceSlot: 'void-system',
      dirName: 'future-skill',
      isBuiltin: true,
    });

    expect(presentation).toEqual(expect.objectContaining({
      displayName: 'Future Skill',
      description: 'Future raw description',
    }));
    expect(presentation.displayNameKey).toBeUndefined();
    expect(presentation.descriptionKey).toBeUndefined();
  });

  it('权威 24 项 builtin dirName 全部拥有正式翻译 key', () => {
    expect(BUILTIN_SKILL_PRESENTATION_IDS).toHaveLength(24);
    for (const dirName of BUILTIN_SKILL_PRESENTATION_IDS) {
      const presentation = presentationForInstalledSkill({
        key: `user::void-system::${dirName}`,
        name: dirName,
        description: `${dirName} raw description`,
        path: `C:/builtin/${dirName}`,
        level: 'user',
        sourceSlot: 'void-system',
        dirName,
        isBuiltin: true,
      });
      expect(presentation.displayNameKey).toBe(`catalog.builtin.${dirName}.name`);
      expect(presentation.descriptionKey).toBe(`catalog.builtin.${dirName}.description`);
    }
  });

  it('45 项标准用户技能拥有唯一、稳定且完整的展示 ID', () => {
    expect(STANDARD_SKILL_PRESENTATION_IDS).toHaveLength(45);
    expect(new Set(STANDARD_SKILL_PRESENTATION_IDS).size).toBe(45);

    for (const dirName of STANDARD_SKILL_PRESENTATION_IDS) {
      const presentation = presentationForInstalledSkill({
        key: `user::home.codex::${dirName}`,
        name: dirName,
        description: `${dirName} raw description`,
        path: `C:/Users/test/.codex/skills/${dirName}`,
        level: 'user',
        sourceSlot: 'home.codex',
        dirName,
        isBuiltin: false,
      });
      expect(presentation.displayNameKey).toBe(`catalog.standard.${dirName}.name`);
      expect(presentation.descriptionKey).toBe(`catalog.standard.${dirName}.description`);
      expect(presentation.aliases).toEqual(expect.arrayContaining([
        `user::home.codex::${dirName}`,
        dirName,
      ]));
    }
  });

  it('当前环境额外 5 项用户技能全部使用中文展示并保留英文检索别名', () => {
    expect(EXTERNAL_SKILL_PRESENTATION_IDS).toHaveLength(5);
    expect(new Set(EXTERNAL_SKILL_PRESENTATION_IDS).size).toBe(5);

    for (const dirName of EXTERNAL_SKILL_PRESENTATION_IDS) {
      const presentation = presentationForInstalledSkill({
        key: `user::home.claude::${dirName}`,
        name: dirName,
        description: `${dirName} raw description`,
        path: `C:/Users/test/.claude/skills/${dirName}`,
        level: 'user',
        sourceSlot: 'home.claude',
        dirName,
        isBuiltin: false,
      });
      expect(presentation.displayNameKey).toBe(`catalog.external.${dirName}.name`);
      expect(presentation.descriptionKey).toBe(`catalog.external.${dirName}.description`);
      expect(presentation.aliases).toEqual(expect.arrayContaining([
        `user::home.claude::${dirName}`,
        dirName,
      ]));
    }
  });

  it('标准技能中文化只命中精确 home.codex 用户身份且不修改原始对象', () => {
    const sourceSkill: SkillInfo = {
      key: 'user::home.codex::arrange',
      name: 'arrange',
      description: 'Improve layout and spacing.',
      path: 'C:/Users/test/.codex/skills/arrange',
      level: 'user',
      sourceSlot: 'home.codex',
      dirName: 'arrange',
      isBuiltin: false,
    };
    const before = structuredClone(sourceSkill);
    const presentation = presentationForInstalledSkill(sourceSkill);

    expect(presentation.displayNameKey).toBe('catalog.standard.arrange.name');
    expect(presentation.descriptionKey).toBe('catalog.standard.arrange.description');
    expect(sourceSkill).toEqual(before);

    const mismatches: SkillInfo[] = [
      { ...sourceSkill, key: 'project::workspace::arrange', level: 'project', sourceSlot: 'workspace' },
      { ...sourceSkill, key: 'user::void-system::arrange', sourceSlot: 'void-system' },
      { ...sourceSkill, key: 'user::home.codex::arrange-copy' },
      { ...sourceSkill, name: 'My Arrange Skill' },
      { ...sourceSkill, displayName: '我的布局技能' },
      { ...sourceSkill, isBuiltin: true },
      { ...sourceSkill, key: 'user::home.codex::unknown-skill', name: 'unknown-skill', dirName: 'unknown-skill' },
    ];

    for (const skill of mismatches) {
      const fallback = presentationForInstalledSkill(skill);
      expect(fallback.displayNameKey).toBeUndefined();
      expect(fallback.descriptionKey).toBeUndefined();
      expect(fallback.displayName).toBe(skill.displayName?.trim() || skill.name);
    }
  });

  it('标准技能三种语言的键集合一致且名称和用途均非空', () => {
    const expected = [...STANDARD_SKILL_PRESENTATION_IDS].sort();
    for (const locale of ['zh-CN', 'en-US', 'zh-TW'] as const) {
      const standard = readSkillLocale(locale).catalog.standard;
      expect(Object.keys(standard).sort()).toEqual(expected);
      for (const id of expected) {
        expect(standard[id].name.trim()).not.toBe('');
        expect(standard[id].description.trim()).not.toBe('');
      }
    }
  });

  it('额外用户技能三种语言的键集合一致且名称和用途均非空', () => {
    const expected = [...EXTERNAL_SKILL_PRESENTATION_IDS].sort();
    for (const locale of ['zh-CN', 'en-US', 'zh-TW'] as const) {
      const external = readSkillLocale(locale).catalog.external;
      expect(Object.keys(external).sort()).toEqual(expected);
      for (const id of expected) {
        expect(external[id].name.trim()).not.toBe('');
        expect(external[id].description.trim()).not.toBe('');
      }
    }
  });

  it('额外技能显示中文时仍保留英文名称、目录 ID 和复合 key 作为搜索别名', () => {
    const presentation = presentationForInstalledSkill({
      key: 'user::home.claude::paperclip-create-agent',
      name: 'paperclip-create-agent',
      description: 'Create governed agents in Paperclip.',
      path: 'C:/Users/test/.claude/skills/paperclip-create-agent',
      level: 'user',
      sourceSlot: 'home.claude',
      dirName: 'paperclip-create-agent',
      isBuiltin: false,
    });
    const zhCN = readSkillLocale('zh-CN').catalog.external['paperclip-create-agent'];
    const localized = localizeCatalogPresentation(
      presentation,
      key => key.endsWith('.name') ? zhCN.name : zhCN.description,
    );

    expect(localized.displayName).toBe('Paperclip 智能体创建');
    expect(localized.aliases).toEqual(expect.arrayContaining([
      'paperclip-create-agent',
      'user::home.claude::paperclip-create-agent',
    ]));
  });

  it('中文展示名和原始英文 ID 都能命中同一个标准技能展示', () => {
    const presentation = presentationForInstalledSkill({
      key: 'user::home.codex::arrange',
      name: 'arrange',
      description: 'Improve layout and spacing.',
      path: 'C:/Users/test/.codex/skills/arrange',
      level: 'user',
      sourceSlot: 'home.codex',
      dirName: 'arrange',
      isBuiltin: false,
    });
    const zhCN = readSkillLocale('zh-CN').catalog.standard.arrange;
    const localized = localizeCatalogPresentation(
      presentation,
      key => key.endsWith('.name') ? zhCN.name : zhCN.description,
    );
    const searchable = [
      localized.displayName,
      localized.description,
      ...localized.aliases,
    ].map(value => value.toLowerCase());

    expect(searchable.some(value => value.includes('布局'))).toBe(true);
    expect(searchable.some(value => value.includes('arrange'))).toBe(true);
  });

  it('市场项始终保留 raw name 且 React/download 身份仍是 installId', () => {
    const marketSkill = {
      id: 'docx',
      name: '@vendor/docx-pro',
      description: 'Marketplace package',
      source: 'skills.sh',
      installs: 42,
      url: 'https://skills.sh/vendor/docx-pro',
      installId: '@vendor/docx-pro@1.0.0',
    };

    const presentation = presentationForMarketSkill(marketSkill);

    expect(presentation).toEqual(expect.objectContaining({
      displayName: '@vendor/docx-pro',
      description: 'Marketplace package',
    }));
    expect(presentation.displayNameKey).toBeUndefined();
    expect(marketSkill.installId).toBe('@vendor/docx-pro@1.0.0');
    expect(isMarketSkillInstalled(new Set(['@vendor/docx-pro']), marketSkill)).toBe(true);
  });
});

describe('fixed team adapters', () => {
  it('代码审查团队映射真实成员并保留 child orchestrator 边界', () => {
    const entry = mapDeepReviewDefinitionToCatalogEntry(
      FALLBACK_REVIEW_TEAM_DEFINITION,
    );

    expect(entry.identity.id).toBe('default-review-team');
    expect(entry.identity.displayName).toBe(FALLBACK_REVIEW_TEAM_DEFINITION.name);
    expect(entry.identity.displayNameKey).toBe(
      'catalog.presentations.teams.deepReview.name',
    );
    expect(entry.leadBinding).toBe('child_orchestrator');
    expect(entry.lead.identity.id).toBe('DeepReview');
    expect(entry.members.map(member => member.identity.id)).toEqual([
      'ReviewBusinessLogic',
      'ReviewPerformance',
      'ReviewSecurity',
      'ReviewArchitecture',
      'ReviewFrontend',
      'ReviewJudge',
    ]);
    expect(entry.members.find(member => member.identity.id === 'ReviewJudge')).toEqual(
      expect.objectContaining({ role: 'quality_gate', isReadonly: true }),
    );
  });

  it('AI 短剧团队只投影五个真实阶段智能体和 Media 兼容主理人', () => {
    const entry = createShortDramaTeamCatalogEntry();
    const entries: CapabilityCatalogEntry[] = [entry];

    expect(entries[0].identity.id).toBe('ai-short-drama-team');
    expect(entry.leadBinding).toBe('parent_persona_compatibility');
    expect(entry.lead.identity.id).toBe('Media');
    expect(entry.scenarioEligibility).toEqual(['media']);
    expect(entry.members.map(member => member.identity.id)).toEqual([
      'ScriptAI',
      'AssetAI',
      'SplitAI',
      'VideoAI',
      'EditorAI',
    ]);
    expect(entry.members.map(member => member.identity.displayNameKey)).toEqual([
      'catalog.presentations.teamMembers.scriptAI.name',
      'catalog.presentations.teamMembers.assetAI.name',
      'catalog.presentations.teamMembers.splitAI.name',
      'catalog.presentations.teamMembers.videoAI.name',
      'catalog.presentations.teamMembers.editorAI.name',
    ]);
  });
});
