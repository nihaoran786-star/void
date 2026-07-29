import type { SkillInfo, SkillMarketItem } from '@/infrastructure/config/types';
import {
  resolveDefaultCatalogPresentation,
  type CatalogPresentation,
} from './presentationMetadata';

export const BUILTIN_SKILL_PRESENTATION_IDS = [
  'agent-browser',
  'cinematic-style-repair',
  'docx',
  'find-skills',
  'gstack-autoplan',
  'gstack-cso',
  'gstack-design-consultation',
  'gstack-design-review',
  'gstack-document-release',
  'gstack-investigate',
  'gstack-office-hours',
  'gstack-plan-ceo-review',
  'gstack-plan-design-review',
  'gstack-plan-eng-review',
  'gstack-qa',
  'gstack-qa-only',
  'gstack-retro',
  'gstack-review',
  'gstack-ship',
  'pdf',
  'pptx',
  'short-drama-character-board',
  'writing-skills',
  'xlsx',
] as const;

const BUILTIN_SKILL_PRESENTATION_ID_SET = new Set<string>(
  BUILTIN_SKILL_PRESENTATION_IDS,
);

export interface SkillPresentationInput {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string;
  dirName?: string;
  isBuiltin?: boolean;
}

function resolveKnownBuiltinId(skill: SkillPresentationInput): string | null {
  if (!skill.isBuiltin || !skill.dirName) return null;
  return BUILTIN_SKILL_PRESENTATION_ID_SET.has(skill.dirName)
    ? skill.dirName
    : null;
}

export function resolveSkillCatalogPresentation(
  skill: SkillPresentationInput,
): CatalogPresentation {
  const builtinId = resolveKnownBuiltinId(skill);
  if (!builtinId) {
    return {
      displayName: skill.displayName?.trim() || skill.name,
      description: skill.description?.trim() ?? '',
      aliases: Array.from(new Set(
        [skill.id, skill.name, skill.displayName, skill.dirName].filter(Boolean) as string[],
      )),
    };
  }
  return {
    ...resolveDefaultCatalogPresentation({
      kind: 'skill',
      id: builtinId,
      runtimeName: skill.name,
      runtimeDescription: skill.description,
    }),
    displayNameKey: `catalog.builtin.${builtinId}.name`,
    descriptionKey: `catalog.builtin.${builtinId}.description`,
  };
}

export function presentationForInstalledSkill(skill: SkillInfo): CatalogPresentation {
  return resolveSkillCatalogPresentation({
    id: skill.key,
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    dirName: skill.dirName,
    isBuiltin: skill.isBuiltin,
  });
}

export function presentationForMarketSkill(skill: SkillMarketItem): CatalogPresentation {
  return {
    displayName: skill.name,
    description: skill.description?.trim() ?? '',
    aliases: Array.from(new Set([skill.id, skill.name])),
  };
}

/** Marketplace compatibility is deliberately keyed by the unlocalized package name. */
export function isMarketSkillInstalled(
  installedRawNames: ReadonlySet<string>,
  marketSkill: Pick<SkillMarketItem, 'name'>,
): boolean {
  return installedRawNames.has(marketSkill.name);
}
