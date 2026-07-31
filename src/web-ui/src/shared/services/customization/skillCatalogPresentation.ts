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

/**
 * Stable directory IDs for the standard user skills shipped through the
 * user's ~/.codex/skills registry. These IDs are presentation metadata only;
 * runtime identity and installation matching continue to use the raw values.
 */
export const STANDARD_SKILL_PRESENTATION_IDS = [
  'adapt',
  'agent-app-architecture',
  'animate',
  'arrange',
  'audit',
  'bolder',
  'caveman',
  'clarify',
  'code-review-graph',
  'colorize',
  'continuous-agent-loop',
  'creator-style-distiller',
  'critique',
  'delight',
  'diagnose',
  'distill',
  'extract',
  'frontend-design',
  'grill-me',
  'grill-with-docs',
  'handoff',
  'harden',
  'improve-codebase-architecture',
  'migrate-to-shoehorn',
  'normalize',
  'onboard',
  'optimize',
  'overdrive',
  'personal-ip-douyin-script',
  'polish',
  'project-constitution-writer',
  'prototype',
  'quieter',
  'scaffold-exercises',
  'setup-matt-pocock-skills',
  'setup-pre-commit',
  'storyboard-image-director',
  'tdd',
  'teach-impeccable',
  'to-issues',
  'to-prd',
  'triage',
  'typeset',
  'write-voice-driven-script',
  'zoom-out',
] as const;

const BUILTIN_SKILL_PRESENTATION_ID_SET = new Set<string>(
  BUILTIN_SKILL_PRESENTATION_IDS,
);

const STANDARD_SKILL_PRESENTATION_ID_SET = new Set<string>(
  STANDARD_SKILL_PRESENTATION_IDS,
);

export interface SkillPresentationInput {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string;
  dirName?: string;
  isBuiltin?: boolean;
  level?: SkillInfo['level'];
  sourceSlot?: string;
}

function resolveKnownBuiltinId(skill: SkillPresentationInput): string | null {
  if (!skill.isBuiltin || !skill.dirName) return null;
  return BUILTIN_SKILL_PRESENTATION_ID_SET.has(skill.dirName)
    ? skill.dirName
    : null;
}

function resolveKnownStandardUserId(
  skill: SkillPresentationInput,
): string | null {
  if (
    skill.level !== 'user'
    || skill.isBuiltin !== false
    || skill.sourceSlot !== 'home.codex'
    || skill.displayName != null
    || !skill.dirName
    || skill.name !== skill.dirName
    || skill.id !== `user::home.codex::${skill.dirName}`
  ) {
    return null;
  }
  return STANDARD_SKILL_PRESENTATION_ID_SET.has(skill.dirName)
    ? skill.dirName
    : null;
}

export function resolveSkillCatalogPresentation(
  skill: SkillPresentationInput,
): CatalogPresentation {
  const builtinId = resolveKnownBuiltinId(skill);
  const standardUserId = resolveKnownStandardUserId(skill);
  if (!builtinId && !standardUserId) {
    return {
      displayName: skill.displayName?.trim() || skill.name,
      description: skill.description?.trim() ?? '',
      aliases: Array.from(new Set(
        [skill.id, skill.name, skill.displayName, skill.dirName].filter(Boolean) as string[],
      )),
    };
  }
  const presentationId = builtinId ?? standardUserId!;
  const catalogGroup = builtinId ? 'builtin' : 'standard';
  const knownPresentation = resolveDefaultCatalogPresentation({
    kind: 'skill',
    id: presentationId,
    runtimeName: skill.name,
    runtimeDescription: skill.description,
  });
  return {
    ...knownPresentation,
    aliases: Array.from(new Set([
      ...knownPresentation.aliases,
      skill.id,
      ...(skill.dirName ? [skill.dirName] : []),
    ])),
    displayNameKey: `catalog.${catalogGroup}.${presentationId}.name`,
    descriptionKey: `catalog.${catalogGroup}.${presentationId}.description`,
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
    level: skill.level,
    sourceSlot: skill.sourceSlot,
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
