import { configAPI } from '@/infrastructure/api/service-api/ConfigAPI';
import type { SkillInfo } from '@/infrastructure/config/types';
import { presentationForInstalledSkill } from '../skillCatalogPresentation';
import { skillScenariosFromAllowedParentAgentIds } from '../SkillAuthoringService';
import {
  ALL_CUSTOMIZATION_SCENARIOS,
  LEGACY_UNVERSIONED_REVISION,
  type CapabilityCatalogSource,
  type CatalogLoadContext,
  type CatalogSourceSnapshot,
  type SkillCatalogEntry,
} from '../types';

export function mapSkillToCatalogEntry(skill: SkillInfo): SkillCatalogEntry {
  const presentation = presentationForInstalledSkill(skill);
  return {
    kind: 'skill',
    identity: {
      id: skill.key,
      revision: skill.revision?.trim()
        ? { status: 'known', value: skill.revision }
        : LEGACY_UNVERSIONED_REVISION,
      ...presentation,
    },
    source: {
      adapterId: 'existing-skills',
      recordType: 'skill',
      recordId: skill.sourceSlot,
    },
    origin: skill.isBuiltin ? 'builtin' : skill.level,
    scenarioEligibility: skill.allowedParentAgentIds?.length
      ? skillScenariosFromAllowedParentAgentIds(skill.allowedParentAgentIds)
      : [...ALL_CUSTOMIZATION_SCENARIOS],
    tags: [skill.isBuiltin ? 'builtin' : skill.level],
    availability: skill.isShadowed
      ? {
          status: 'disabled',
          reasonCode: 'shadowed',
          message: 'catalog.availability.shadowed',
        }
      : { status: 'available' },
    level: skill.level,
    sourceSlot: skill.sourceSlot,
    isBuiltin: skill.isBuiltin,
    isAuthorable: Boolean(skill.isAuthorable),
    isShadowed: Boolean(skill.isShadowed),
    shadowedByKey: skill.shadowedByKey ?? undefined,
  };
}

export class ExistingSkillCatalogAdapter implements CapabilityCatalogSource {
  readonly sourceId = 'existing-skills';

  constructor(
    private readonly loadSkills: (context: CatalogLoadContext) => Promise<SkillInfo[]> =
      context => configAPI.getSkillConfigs({ workspacePath: context.workspacePath }),
  ) {}

  async load(context: CatalogLoadContext): Promise<CatalogSourceSnapshot> {
    return {
      sourceId: this.sourceId,
      status: 'ready',
      entries: (await this.loadSkills(context)).map(mapSkillToCatalogEntry),
      errors: [],
    };
  }
}
