import type { TeamDefinitionRecord } from '@/infrastructure/config/types';
import { SHORT_DRAMA_TEAM_CATALOG_ID } from '../fixedTeamIds';
import type { TeamAuthoringGateway } from '../TeamAuthoringGateway';
import {
  type CapabilityCatalogSource,
  type CatalogLoadContext,
  type CatalogSourceSnapshot,
  type TeamCatalogEntry,
} from '../types';
import { existingTeamDefinitionAdapter } from './ExistingTeamDefinitionAdapter';
import { mapTeamDefinitionRecordToCatalogEntry } from './ExistingTeamCatalogAdapter';

export { SHORT_DRAMA_TEAM_CATALOG_ID } from '../fixedTeamIds';

const PREVIEW_MEMBER_IDS = [
  ['member-00000000000000000000000000000001', 'Short Drama Producer', 'Production lead', 'lead', 'Media'],
  ['member-00000000000000000000000000000002', 'Script Director', 'Screenwriter and script director', 'specialist', 'ScriptAI'],
  ['member-00000000000000000000000000000003', 'Visual Asset Director', 'Character and setting designer', 'specialist', 'AssetAI'],
  ['member-00000000000000000000000000000004', 'Storyboard Director', 'Storyboard designer', 'specialist', 'SplitAI'],
  ['member-00000000000000000000000000000005', 'Video Director', 'AI video director', 'specialist', 'VideoAI'],
  ['member-00000000000000000000000000000006', 'Finishing Director', 'Editor and delivery director', 'quality_gate', 'EditorAI'],
] as const;

/** Presentation-only fallback used by isolated catalog previews and tests. */
function previewRecord(): TeamDefinitionRecord {
  return {
    revision: 'builtin-short-drama-preview-v1',
    level: 'user',
    path: 'builtin://ai-short-drama-team',
    isAuthorable: false,
    definition: {
      schemaVersion: 1,
      teamDefinitionId: SHORT_DRAMA_TEAM_CATALOG_ID,
      displayName: 'AI Short Drama Team',
      description: 'A production lead coordinates script, assets, storyboards, video, and finishing in the dedicated canvas.',
      category: 'Media',
      capabilityTags: ['AI short drama', 'video production', 'five-stage workflow'],
      scenarioEligibility: ['media'],
      leadMemberId: PREVIEW_MEMBER_IDS[0][0],
      members: PREVIEW_MEMBER_IDS.map(([
        memberId,
        displayName,
        professionalRole,
        role,
        agentId,
      ]) => ({
        memberId,
        displayName,
        professionalRole,
        role,
        instructions: 'Provided by the trusted built-in Team runtime.',
        outputResponsibility: professionalRole,
        agentId,
        allowedSkillKeys: [],
        allowedToolNames: [],
        permissionPolicy: 'inherit_parent_intersection',
        isReadonly: false,
      })),
      workflows: [],
      collaborationPolicy: 'lead_mediated',
      permissionPolicy: 'inherit_parent_intersection',
      origin: 'installed',
    },
  };
}

export function createShortDramaTeamCatalogEntry(
  record: TeamDefinitionRecord = previewRecord(),
): TeamCatalogEntry {
  const reusable = mapTeamDefinitionRecordToCatalogEntry(record);
  return {
    ...reusable,
    source: {
      adapterId: 'short-drama-team',
      recordType: 'fixed_team',
      recordId: SHORT_DRAMA_TEAM_CATALOG_ID,
    },
    origin: 'fixed_runtime',
    tags: Array.from(new Set([
      'ai_short_drama',
      'video_production',
      'five_stage_workflow',
      ...reusable.tags,
    ])),
    managementSupport: 'readonly_fixed',
  };
}

export class ShortDramaTeamAdapter implements CapabilityCatalogSource {
  readonly sourceId = 'short-drama-team';

  constructor(
    private readonly gateway: TeamAuthoringGateway =
      existingTeamDefinitionAdapter,
  ) {}

  async load(context: CatalogLoadContext): Promise<CatalogSourceSnapshot> {
    const snapshot = await this.gateway.list({
      workspacePath: context.workspacePath,
    });
    const record = snapshot.records.find(
      candidate => candidate.definition.teamDefinitionId
        === SHORT_DRAMA_TEAM_CATALOG_ID,
    );
    if (!record) {
      return {
        sourceId: this.sourceId,
        status: 'partial',
        entries: [],
        errors: [{
          sourceId: this.sourceId,
          code: 'short_drama_team_definition_missing',
          message: 'catalog.errors.short_drama_team_definition_missing',
        }],
      };
    }
    return {
      sourceId: this.sourceId,
      status: snapshot.status,
      entries: [createShortDramaTeamCatalogEntry(record)],
      errors: snapshot.diagnostics.map(diagnostic => ({
        sourceId: this.sourceId,
        code: diagnostic.error.code,
        message: `catalog.errors.${diagnostic.error.code}`,
      })),
    };
  }
}
