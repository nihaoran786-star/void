import type { TFunction } from 'i18next';
import type { ModeSkillInfo } from '@/infrastructure/config/types';
import type { SubagentInfo } from '@/infrastructure/api/service-api/SubagentAPI';
import {
  localizeCatalogPresentation,
  resolveDefaultCatalogPresentation,
} from '@/shared/services/customization/presentationMetadata';
import {
  resolveSkillCatalogPresentation,
} from '@/shared/services/customization/skillCatalogPresentation';

const UNGROUPED_SKILL_GROUP = '__ungrouped__';

const SKILL_GROUP_ORDER: Record<string, number> = {
  office: 0,
  meta: 1,
  team: 2,
  [UNGROUPED_SKILL_GROUP]: 99,
};

export interface SkillGroup {
  key: string;
  label: string;
  skills: ModeSkillInfo[];
  enabledCount: number;
  totalCount: number;
}

export function getConfiguredEnabledSkillKeys(skills: ModeSkillInfo[]): string[] {
  return skills.filter((skill) => skill.effectiveEnabled).map((skill) => skill.key);
}

export function buildDuplicateSkillNameSet(skills: ModeSkillInfo[]): Set<string> {
  const counts = new Map<string, number>();
  for (const skill of skills) {
    counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
  );
}

function formatSkillOrigin(skill: ModeSkillInfo): string {
  return `${skill.level}/${skill.sourceSlot}`;
}

function localizedSkillPresentation(
  skill: ModeSkillInfo,
  tSkills: TFunction<'scenes/skills'>,
) {
  return localizeCatalogPresentation(resolveSkillCatalogPresentation({
    id: skill.key,
    name: skill.name,
    description: skill.description,
    dirName: skill.dirName,
    isBuiltin: skill.isBuiltin,
  }), key => tSkills(key));
}

export function formatSkillDisplayName(
  skill: ModeSkillInfo,
  duplicateNames: Set<string>,
  tSkills: TFunction<'scenes/skills'>,
): string {
  const presentation = localizedSkillPresentation(skill, tSkills);
  if (!duplicateNames.has(skill.name)) {
    return presentation.displayName;
  }
  return `${presentation.displayName} [${formatSkillOrigin(skill)}]`;
}

export function getSkillGroupKey(skill: ModeSkillInfo): string {
  return skill.groupKey?.trim() || UNGROUPED_SKILL_GROUP;
}

export function getSkillGroupLabel(groupKey: string, t: TFunction<'scenes/agents'>): string {
  switch (groupKey) {
    case 'office':
      return t('agentsOverview.skillGroups.office');
    case 'computer-use':
      return t('agentsOverview.skillGroups.computerUse');
    case 'meta':
      return t('agentsOverview.skillGroups.meta');
    case 'team':
      return t('agentsOverview.skillGroups.team');
    default:
      return t('agentsOverview.skillGroups.other');
  }
}

export function getSkillTitle(
  skill: ModeSkillInfo,
  t: TFunction<'scenes/agents'>,
  tSkills: TFunction<'scenes/skills'>,
): string {
  const presentation = localizedSkillPresentation(skill, tSkills);
  return [
    presentation.description || presentation.displayName,
    `key: ${skill.key}`,
    skill.effectiveEnabled && !skill.selectedForRuntime
      ? t('agentsOverview.skillShadowed')
      : null,
  ].filter(Boolean).join('\n');
}

export function subagentPresentation(
  subagent: SubagentInfo,
  t: TFunction<'scenes/agents'>,
) {
  return localizeCatalogPresentation(resolveDefaultCatalogPresentation({
    kind: 'subagent',
    id: subagent.id,
    runtimeName: subagent.name,
    runtimeDescription: subagent.description,
  }), key => t(key));
}

export function buildSkillGroups(
  skills: ModeSkillInfo[],
  enabledSkillKeys: string[],
  t: TFunction<'scenes/agents'>,
): SkillGroup[] {
  const enabledSkillKeySet = new Set(enabledSkillKeys);
  const groups = new Map<string, ModeSkillInfo[]>();

  for (const skill of skills) {
    const groupKey = getSkillGroupKey(skill);
    const items = groups.get(groupKey);
    if (items) {
      items.push(skill);
    } else {
      groups.set(groupKey, [skill]);
    }
  }

  return [...groups.entries()]
    .map(([groupKey, groupSkills]) => ({
      key: groupKey,
      label: getSkillGroupLabel(groupKey, t),
      skills: [...groupSkills].sort((a, b) => {
        const aEnabled = enabledSkillKeySet.has(a.key);
        const bEnabled = enabledSkillKeySet.has(b.key);
        if (aEnabled && !bEnabled) return -1;
        if (!aEnabled && bEnabled) return 1;
        return a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
      }),
      enabledCount: groupSkills.filter((skill) => enabledSkillKeySet.has(skill.key)).length,
      totalCount: groupSkills.length,
    }))
    .sort((a, b) => {
      const orderDiff = (SKILL_GROUP_ORDER[a.key] ?? 50) - (SKILL_GROUP_ORDER[b.key] ?? 50);
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return a.label.localeCompare(b.label);
    });
}
