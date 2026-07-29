import type {
  TeamDefinitionRecord,
  TeamMemberDefinition,
} from '@/infrastructure/config/types';
import { resolveDefaultCatalogPresentation } from '../presentationMetadata';
import type { TeamAuthoringGateway } from '../TeamAuthoringGateway';
import {
  type CapabilityCatalogSource,
  type CatalogLoadContext,
  type CatalogSourceError,
  type CatalogSourceSnapshot,
  type TeamCatalogEntry,
  type TeamCatalogMember,
} from '../types';
import { existingTeamDefinitionAdapter } from './ExistingTeamDefinitionAdapter';

function memberCatalogProjection(
  member: TeamMemberDefinition,
  teamRevision: string,
  recordIsAuthorable: boolean,
): TeamCatalogMember {
  const presentation = resolveDefaultCatalogPresentation({
    kind: 'team_member',
    id: member.memberId,
    runtimeName: member.displayName,
    runtimeDescription: member.professionalRole,
  });
  return {
    identity: {
      id: member.memberId,
      revision: {
        status: 'known',
        value: `${teamRevision}:${member.memberId}`,
      },
      ...presentation,
    },
    role: member.role,
    isReadonly: member.isReadonly || !recordIsAuthorable,
  };
}

export function mapTeamDefinitionRecordToCatalogEntry(
  record: TeamDefinitionRecord,
): TeamCatalogEntry {
  const { definition, revision } = record;
  const lead = definition.members.find(
    member => member.memberId === definition.leadMemberId,
  );
  if (!lead || lead.role !== 'lead') {
    throw new Error('team_definition_lead_missing');
  }
  const presentation = resolveDefaultCatalogPresentation({
    kind: 'team',
    id: definition.teamDefinitionId,
    runtimeName: definition.displayName,
    runtimeDescription: definition.description,
  });
  return {
    kind: 'team',
    identity: {
      id: definition.teamDefinitionId,
      revision: { status: 'known', value: revision },
      ...presentation,
    },
    source: {
      adapterId: 'existing-team-definitions',
      recordType: 'team_definition',
      recordId: `${record.level}:${definition.teamDefinitionId}`,
    },
    origin: definition.origin,
    scenarioEligibility: definition.scenarioEligibility,
    tags: Array.from(new Set([
      'team_definition',
      ...definition.capabilityTags,
    ])),
    availability: {
      status: 'unsupported',
      reasonCode: 'team_definition_runtime_not_implemented',
      message: 'catalog.availability.team_definition_runtime_not_implemented',
    },
    leadBinding: 'definition_only',
    lead: memberCatalogProjection(lead, revision, record.isAuthorable),
    members: definition.members
      .filter(member => member.memberId !== definition.leadMemberId)
      .map(member =>
        memberCatalogProjection(member, revision, record.isAuthorable)
      ),
    activationSupport: 'definition_only',
    managementSupport: record.isAuthorable
      ? 'authorable'
      : 'installed_readonly',
    definitionLevel: record.level,
    workflowCount: definition.workflows.length,
  };
}

export class ExistingTeamCatalogAdapter implements CapabilityCatalogSource {
  readonly sourceId = 'existing-team-definitions';

  constructor(
    private readonly gateway: TeamAuthoringGateway =
      existingTeamDefinitionAdapter,
  ) {}

  async load(context: CatalogLoadContext): Promise<CatalogSourceSnapshot> {
    const snapshot = await this.gateway.list({
      workspacePath: context.workspacePath,
    });
    const errors: CatalogSourceError[] = snapshot.diagnostics.map(
      diagnostic => ({
        sourceId: this.sourceId,
        code: diagnostic.error.code,
        message: `catalog.errors.${diagnostic.error.code}`,
      }),
    );
    const entries: TeamCatalogEntry[] = [];

    for (const record of snapshot.records) {
      // Fixed runtime teams remain owned by their dedicated read-only adapters.
      if ((record.definition.origin as string) === 'fixed_runtime') continue;
      try {
        entries.push(mapTeamDefinitionRecordToCatalogEntry(record));
      } catch {
        errors.push({
          sourceId: this.sourceId,
          code: 'team_definition_projection_failed',
          message: 'catalog.errors.team_definition_projection_failed',
        });
      }
    }

    return {
      sourceId: this.sourceId,
      status: snapshot.status === 'partial' || errors.length > 0
        ? 'partial'
        : 'ready',
      entries,
      errors,
    };
  }
}
