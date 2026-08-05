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
    isReadonly: member.isReadonly,
  };
}

interface ReusableTeamCompatibility {
  availability: TeamCatalogEntry['availability'];
  leadBinding: TeamCatalogEntry['leadBinding'];
  activationSupport: TeamCatalogEntry['activationSupport'];
}

function reusableTeamCompatibility(
  members: TeamMemberDefinition[],
  leadMemberId: string,
): ReusableTeamCompatibility {
  const lead = members.find(member => member.memberId === leadMemberId);
  if (lead?.isReadonly) {
    return unsupportedCompatibility('team_lead_readonly_unsupported');
  }
  if (
    lead?.allowedToolNames.length
    && !lead.allowedToolNames.includes('Task')
  ) {
    return unsupportedCompatibility('team_lead_task_tool_required');
  }

  const specialists = members.filter(member => member.memberId !== leadMemberId);
  if (specialists.some(member => member.allowedToolNames.length > 0)) {
    return unsupportedCompatibility('team_member_tool_narrowing_unsupported');
  }
  if (specialists.some(member => member.isReadonly)) {
    return unsupportedCompatibility('team_member_readonly_unsupported');
  }

  return {
    availability: { status: 'available' },
    leadBinding: 'parent_persona',
    activationSupport: 'parent_persona',
  };
}

function unsupportedCompatibility(
  reasonCode:
    | 'team_lead_readonly_unsupported'
    | 'team_lead_task_tool_required'
    | 'team_member_tool_narrowing_unsupported'
    | 'team_member_readonly_unsupported',
): ReusableTeamCompatibility {
  return {
    availability: {
      status: 'unsupported',
      reasonCode,
      message: `catalog.availability.${reasonCode}`,
    },
    leadBinding: 'definition_only',
    activationSupport: 'definition_only',
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
  const compatibility = reusableTeamCompatibility(
    definition.members,
    definition.leadMemberId,
  );
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
    availability: compatibility.availability,
    leadBinding: compatibility.leadBinding,
    lead: memberCatalogProjection(lead, revision),
    members: definition.members
      .filter(member => member.memberId !== definition.leadMemberId)
      .map(member =>
        memberCatalogProjection(member, revision)
      ),
    activationSupport: compatibility.activationSupport,
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
    const reusableRecords = snapshot.records.filter(
      record => (record.definition.origin as string) !== 'fixed_runtime',
    );
    const recordsByDefinitionId = new Map<string, TeamDefinitionRecord[]>();

    for (const record of reusableRecords) {
      const definitionId = record.definition.teamDefinitionId;
      const records = recordsByDefinitionId.get(definitionId) ?? [];
      records.push(record);
      recordsByDefinitionId.set(definitionId, records);
    }

    for (const records of recordsByDefinitionId.values()) {
      if (records.length > 1) {
        errors.push({
          sourceId: this.sourceId,
          code: 'team_definition_id_ambiguous',
          message: 'catalog.errors.team_definition_id_ambiguous',
        });
        continue;
      }

      const record = records[0];
      if (!record) continue;
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
