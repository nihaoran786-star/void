import type { CapabilityKind } from './types';

export type CatalogPresentationKind =
  | CapabilityKind
  | 'mode'
  | 'subagent'
  | 'team_member';

export interface CatalogPresentationInput {
  kind: CatalogPresentationKind;
  id: string;
  runtimeName?: string;
  runtimeDescription?: string;
}

export interface CatalogPresentation {
  /** Raw runtime fallback. Localized UI copy is resolved only at a React boundary. */
  displayName: string;
  description: string;
  aliases: string[];
  displayNameKey?: string;
  descriptionKey?: string;
}

interface PresentationDescriptor {
  localeKey: string;
  aliases?: string[];
}

const descriptor = (
  localeKey: string,
  aliases?: string[],
): PresentationDescriptor => ({ localeKey, aliases });

const PRESENTATION: Record<string, PresentationDescriptor> = {
  'mode:agentic': descriptor('catalog.presentations.modes.agentic'),
  'mode:Plan': descriptor('catalog.presentations.modes.plan'),
  'mode:debug': descriptor('catalog.presentations.modes.debug'),
  'mode:Multitask': descriptor('catalog.presentations.modes.multitask'),
  'mode:Team': descriptor('catalog.presentations.modes.team'),
  'mode:Cowork': descriptor('catalog.presentations.modes.cowork'),
  'mode:DeepResearch': descriptor('catalog.presentations.modes.deepResearch'),
  'mode:Claw': descriptor('catalog.presentations.modes.claw'),
  'mode:Media': descriptor('catalog.presentations.modes.media'),
  'mode:ComputerUse': descriptor('catalog.presentations.modes.computerUse'),

  'subagent:Explore': descriptor('catalog.presentations.subagents.explore'),
  'subagent:FileFinder': descriptor('catalog.presentations.subagents.fileFinder'),
  'subagent:CodeReview': descriptor('catalog.presentations.subagents.codeReview'),
  'subagent:GenerateDoc': descriptor('catalog.presentations.subagents.generateDoc'),
  'subagent:GeneralPurpose': descriptor('catalog.presentations.subagents.generalPurpose'),
  'subagent:ResearchSpecialist': descriptor('catalog.presentations.subagents.researchSpecialist'),
  'subagent:ComputerUse': descriptor('catalog.presentations.modes.computerUse'),
  'subagent:DeepReview': descriptor('catalog.presentations.subagents.deepReview'),
  'subagent:ReviewBusinessLogic': descriptor('catalog.presentations.subagents.reviewBusinessLogic'),
  'subagent:ReviewPerformance': descriptor('catalog.presentations.subagents.reviewPerformance'),
  'subagent:ReviewSecurity': descriptor('catalog.presentations.subagents.reviewSecurity'),
  'subagent:ReviewArchitecture': descriptor('catalog.presentations.subagents.reviewArchitecture'),
  'subagent:ReviewFrontend': descriptor('catalog.presentations.subagents.reviewFrontend'),
  'subagent:ReviewJudge': descriptor('catalog.presentations.subagents.reviewJudge'),
  'subagent:ReviewFixer': descriptor('catalog.presentations.subagents.reviewFixer'),
  'subagent:ScriptAI': descriptor('catalog.presentations.subagents.scriptAI'),
  'subagent:AssetAI': descriptor('catalog.presentations.subagents.assetAI'),
  'subagent:SplitAI': descriptor('catalog.presentations.subagents.splitAI'),
  'subagent:VideoAI': descriptor('catalog.presentations.subagents.videoAI'),
  'subagent:EditorAI': descriptor('catalog.presentations.subagents.editorAI'),

  'team:default-review-team': descriptor(
    'catalog.presentations.teams.deepReview',
    ['Deep Review', 'Code Review Team'],
  ),
  'team:ai-short-drama-team': descriptor(
    'catalog.presentations.teams.shortDrama',
    ['AI Short Drama Team'],
  ),

  'team_member:DeepReview': descriptor('catalog.presentations.teamMembers.deepReview'),
  'team_member:ReviewBusinessLogic': descriptor('catalog.presentations.teamMembers.reviewBusinessLogic'),
  'team_member:ReviewPerformance': descriptor('catalog.presentations.teamMembers.reviewPerformance'),
  'team_member:ReviewSecurity': descriptor('catalog.presentations.teamMembers.reviewSecurity'),
  'team_member:ReviewArchitecture': descriptor('catalog.presentations.teamMembers.reviewArchitecture'),
  'team_member:ReviewFrontend': descriptor('catalog.presentations.teamMembers.reviewFrontend'),
  'team_member:ReviewJudge': descriptor('catalog.presentations.teamMembers.reviewJudge'),
  'team_member:Media': descriptor('catalog.presentations.teamMembers.media'),
  'team_member:ScriptAI': descriptor('catalog.presentations.teamMembers.scriptAI'),
  'team_member:AssetAI': descriptor('catalog.presentations.teamMembers.assetAI'),
  'team_member:SplitAI': descriptor('catalog.presentations.teamMembers.splitAI'),
  'team_member:VideoAI': descriptor('catalog.presentations.teamMembers.videoAI'),
  'team_member:EditorAI': descriptor('catalog.presentations.teamMembers.editorAI'),
};

export function resolveDefaultCatalogPresentation(
  input: CatalogPresentationInput,
): CatalogPresentation {
  const known = PRESENTATION[`${input.kind}:${input.id}`];
  const runtimeName = input.runtimeName?.trim();
  const aliases = Array.from(new Set([
    input.id,
    ...(runtimeName ? [runtimeName] : []),
    ...(known?.aliases ?? []),
  ]));
  return {
    displayName: runtimeName ?? input.id,
    description: input.runtimeDescription?.trim() ?? '',
    aliases,
    displayNameKey: known ? `${known.localeKey}.name` : undefined,
    descriptionKey: known ? `${known.localeKey}.description` : undefined,
  };
}

export type CatalogPresentationTranslator = (key: string) => string;

export function localizeCatalogPresentation(
  presentation: CatalogPresentation,
  translate: CatalogPresentationTranslator,
): CatalogPresentation {
  return {
    ...presentation,
    displayName: presentation.displayNameKey
      ? translate(presentation.displayNameKey)
      : presentation.displayName,
    description: presentation.descriptionKey
      ? translate(presentation.descriptionKey)
      : presentation.description,
  };
}
