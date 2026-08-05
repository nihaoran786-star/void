import type { SessionActivePersonaBinding } from '@/shared/types/session-history';
import { desktopTeamRuntimeAdapter } from './adapters/DesktopTeamRuntimeAdapter';
import type {
  TeamRuntimeGateway,
  TeamRuntimeRecord,
} from './TeamRuntimeGateway';
import type {
  CustomizationScenario,
  TeamCatalogEntry,
} from './types';

export interface ReusableTeamPersonaState {
  scenario: CustomizationScenario;
  executionPolicy: string;
  activePersonaBinding: SessionActivePersonaBinding;
}

export type PersistReusableTeamPersona = (
  sessionId: string,
  state: ReusableTeamPersonaState,
) => Promise<void>;

export interface ActivateReusableTeamInput {
  entry: TeamCatalogEntry;
  parentSessionId: string;
  scenario: CustomizationScenario;
  executionPolicy: string;
  persistPersona: PersistReusableTeamPersona;
}

export interface ReusableTeamActivationResult {
  binding: SessionActivePersonaBinding;
  record: TeamRuntimeRecord;
}

export interface ReusableTeamActivator {
  activate(
    input: ActivateReusableTeamInput,
  ): Promise<ReusableTeamActivationResult>;
}

export class ReusableTeamActivationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly recoveryAction?: string,
  ) {
    super(message);
    this.name = 'ReusableTeamActivationError';
  }
}

function knownRevision(
  entry: TeamCatalogEntry,
): { teamRevision: string; leadRevision: string } {
  const teamRevision = entry.identity.revision.status === 'known'
    ? entry.identity.revision.value.trim()
    : '';
  const leadRevision = entry.lead.identity.revision.status === 'known'
    ? entry.lead.identity.revision.value.trim()
    : '';
  if (!teamRevision || !/^[A-Za-z0-9_-]+$/.test(teamRevision)) {
    throw new ReusableTeamActivationError(
      'team_revision_invalid',
      'Reusable Team activation requires a storage-safe known revision.',
      false,
    );
  }
  if (leadRevision !== `${teamRevision}:${entry.lead.identity.id}`) {
    throw new ReusableTeamActivationError(
      'team_lead_revision_mismatch',
      'Reusable Team lead revision does not match its Team definition.',
      false,
    );
  }
  return { teamRevision, leadRevision };
}

function assertReusableEntry(
  entry: TeamCatalogEntry,
  scenario: CustomizationScenario,
): void {
  if (
    entry.activationSupport !== 'parent_persona'
    || entry.leadBinding !== 'parent_persona'
    || entry.availability.status !== 'available'
    || !entry.scenarioEligibility.includes(scenario)
  ) {
    throw new ReusableTeamActivationError(
      'team_not_activatable',
      'Team is not available as a parent persona in this scenario.',
      false,
    );
  }
}

function assertRuntimeRecord(
  record: TeamRuntimeRecord | null,
  expected: {
    parentSessionId: string;
    teamInstanceId: string;
    teamDefinitionId: string;
    teamRevision: string;
  },
): asserts record is TeamRuntimeRecord {
  const instance = record?.snapshot.instance;
  if (
    !record
    || !instance
    || instance.parentSessionId !== expected.parentSessionId
    || instance.teamInstanceId !== expected.teamInstanceId
    || instance.teamDefinitionId !== expected.teamDefinitionId
    || instance.teamDefinitionRevision !== expected.teamRevision
    || instance.lifecycle !== 'ready'
    || instance.executionProfile.kind !== 'prompt_orchestrated'
    || instance.leadBinding.kind !== 'parent_persona'
    || instance.leadBinding.parentSessionId !== expected.parentSessionId
  ) {
    throw new ReusableTeamActivationError(
      'team_runtime_projection_invalid',
      'Team runtime did not return the expected ready parent-persona instance.',
      true,
      'reload_team_runtime',
    );
  }
}

function transportError(error: unknown): ReusableTeamActivationError {
  if (error instanceof ReusableTeamActivationError) return error;
  if (typeof error === 'object' && error !== null) {
    const value = error as Record<string, unknown>;
    if (typeof value.code === 'string' && typeof value.message === 'string') {
      return new ReusableTeamActivationError(
        value.code,
        value.message,
        value.retryable === true,
        typeof value.recoveryAction === 'string'
          ? value.recoveryAction
          : undefined,
      );
    }
  }
  return new ReusableTeamActivationError(
    'team_runtime_transport_failed',
    error instanceof Error ? error.message : 'Team runtime request failed.',
    true,
    'retry_team_activation',
  );
}

/**
 * Coordinates the durable Team attachment and parent-persona update.
 *
 * The instance ID is stable for a definition revision inside a parent session.
 * Retrying after persona persistence fails therefore reuses the ready runtime
 * instead of creating duplicate Teams. Existing instances are never cancelled.
 */
export class ReusableTeamActivationService implements ReusableTeamActivator {
  constructor(
    private readonly runtime: TeamRuntimeGateway = desktopTeamRuntimeAdapter,
  ) {}

  async activate(
    input: ActivateReusableTeamInput,
  ): Promise<ReusableTeamActivationResult> {
    const parentSessionId = input.parentSessionId.trim();
    const executionPolicy = input.executionPolicy.trim();
    if (!parentSessionId || !executionPolicy) {
      throw new ReusableTeamActivationError(
        'team_activation_context_invalid',
        'Parent session and execution policy are required.',
        false,
      );
    }

    assertReusableEntry(input.entry, input.scenario);
    const { teamRevision, leadRevision } = knownRevision(input.entry);
    const teamInstanceId = `team-${teamRevision}`;
    const operationId = `team-attach-${teamRevision}`;

    let response;
    try {
      response = await this.runtime.attach({
        operationId,
        parentSessionId,
        teamInstanceId,
        teamDefinitionId: input.entry.identity.id,
        teamDefinitionRevision: teamRevision,
        creationSource: 'persona_activation',
      });
    } catch (error) {
      throw transportError(error);
    }

    if (!response.outcome.accepted) {
      const error = response.outcome.error;
      throw new ReusableTeamActivationError(
        error?.code ?? 'team_runtime_attach_rejected',
        error?.message ?? 'Team runtime rejected the attachment.',
        error?.retryable ?? false,
      );
    }

    assertRuntimeRecord(response.record, {
      parentSessionId,
      teamInstanceId,
      teamDefinitionId: input.entry.identity.id,
      teamRevision,
    });

    const binding: SessionActivePersonaBinding = {
      kind: 'team_lead',
      personaId: input.entry.lead.identity.id,
      personaRevision: { status: 'known', value: leadRevision },
      teamDefinitionId: input.entry.identity.id,
      teamInstanceId,
    };
    try {
      await input.persistPersona(parentSessionId, {
        scenario: input.scenario,
        executionPolicy,
        activePersonaBinding: binding,
      });
    } catch (error) {
      throw new ReusableTeamActivationError(
        'team_persona_persistence_failed',
        error instanceof Error
          ? error.message
          : 'Team lead persona could not be persisted.',
        true,
        'retry_team_activation',
      );
    }

    return { binding, record: response.record };
  }
}

export const reusableTeamActivationService =
  new ReusableTeamActivationService();
