import { resolveDefaultCatalogPresentation } from '../presentationMetadata';
import {
  LEGACY_UNVERSIONED_REVISION,
  type CapabilityCatalogSource,
  type CatalogLoadContext,
  type CatalogSourceSnapshot,
  type TeamCatalogEntry,
  type TeamCatalogMember,
} from '../types';

export const SHORT_DRAMA_TEAM_CATALOG_ID = 'ai-short-drama-team';

const SHORT_DRAMA_MEMBER_IDS = [
  'ScriptAI',
  'AssetAI',
  'SplitAI',
  'VideoAI',
  'EditorAI',
] as const;

function teamMember(id: string, role: TeamCatalogMember['role']): TeamCatalogMember {
  const presentation = resolveDefaultCatalogPresentation({
    kind: 'team_member',
    id,
    runtimeName: id,
  });
  return {
    identity: {
      id,
      revision: LEGACY_UNVERSIONED_REVISION,
      ...presentation,
    },
    role,
    isReadonly: false,
  };
}

export function createShortDramaTeamCatalogEntry(): TeamCatalogEntry {
  const presentation = resolveDefaultCatalogPresentation({
    kind: 'team',
    id: SHORT_DRAMA_TEAM_CATALOG_ID,
    runtimeName: 'AI Short Drama Team',
  });
  return {
    kind: 'team',
    identity: {
      id: SHORT_DRAMA_TEAM_CATALOG_ID,
      revision: LEGACY_UNVERSIONED_REVISION,
      ...presentation,
    },
    source: {
      adapterId: 'short-drama-team',
      recordType: 'fixed_team',
      recordId: SHORT_DRAMA_TEAM_CATALOG_ID,
    },
    origin: 'fixed_runtime',
    scenarioEligibility: ['media'],
    tags: ['ai_short_drama', 'video_production', 'five_stage_workflow'],
    availability: { status: 'available' },
    leadBinding: 'parent_persona_compatibility',
    lead: teamMember('Media', 'lead'),
    members: SHORT_DRAMA_MEMBER_IDS.map(id => teamMember(id, 'specialist')),
    activationSupport: 'existing_flow_only',
    managementSupport: 'readonly_fixed',
  };
}

export class ShortDramaTeamAdapter implements CapabilityCatalogSource {
  readonly sourceId = 'short-drama-team';

  async load(_context: CatalogLoadContext): Promise<CatalogSourceSnapshot> {
    return {
      sourceId: this.sourceId,
      status: 'ready',
      entries: [createShortDramaTeamCatalogEntry()],
      errors: [],
    };
  }
}
