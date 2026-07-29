import {
  loadDefaultReviewTeamDefinition,
  type ReviewTeamDefinition,
} from '@/shared/services/reviewTeamService';
import { resolveDefaultCatalogPresentation } from '../presentationMetadata';
import {
  LEGACY_UNVERSIONED_REVISION,
  type CapabilityCatalogSource,
  type CatalogLoadContext,
  type CatalogSourceSnapshot,
  type TeamCatalogEntry,
  type TeamCatalogMember,
} from '../types';

function memberIdentity(
  id: string,
  runtimeName: string,
  runtimeDescription: string,
) {
  return {
    id,
    revision: LEGACY_UNVERSIONED_REVISION,
    ...resolveDefaultCatalogPresentation({
      kind: 'team_member',
      id,
      runtimeName,
      runtimeDescription,
    }),
  };
}

export function mapDeepReviewDefinitionToCatalogEntry(
  definition: ReviewTeamDefinition,
): TeamCatalogEntry {
  const presentation = resolveDefaultCatalogPresentation({
    kind: 'team',
    id: definition.id,
    runtimeName: definition.name,
    runtimeDescription: definition.description,
  });
  const members: TeamCatalogMember[] = definition.coreRoles.map(role => ({
    identity: memberIdentity(
      role.subagentId,
      role.funName || role.roleName,
      role.description,
    ),
    role: role.subagentId === 'ReviewJudge' ? 'quality_gate' : 'specialist',
    isReadonly: true,
  }));
  return {
    kind: 'team',
    identity: {
      id: definition.id,
      revision: LEGACY_UNVERSIONED_REVISION,
      ...presentation,
    },
    source: {
      adapterId: 'deep-review-team',
      recordType: 'fixed_team',
      recordId: definition.id,
    },
    origin: 'fixed_runtime',
    scenarioEligibility: ['code'],
    tags: ['code_review', 'parallel_review', 'quality_gate'],
    availability: { status: 'available' },
    leadBinding: 'child_orchestrator',
    lead: {
      identity: memberIdentity('DeepReview', 'Deep Review', definition.description),
      role: 'lead',
      isReadonly: false,
    },
    members,
    activationSupport: 'existing_flow_only',
    managementSupport: 'readonly_fixed',
  };
}

export class DeepReviewTeamAdapter implements CapabilityCatalogSource {
  readonly sourceId = 'deep-review-team';

  constructor(
    private readonly loadDefinition: () => Promise<ReviewTeamDefinition> =
      loadDefaultReviewTeamDefinition,
  ) {}

  async load(_context: CatalogLoadContext): Promise<CatalogSourceSnapshot> {
    return {
      sourceId: this.sourceId,
      status: 'ready',
      entries: [mapDeepReviewDefinitionToCatalogEntry(await this.loadDefinition())],
      errors: [],
    };
  }
}
