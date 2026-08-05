import {
  DeepReviewTeamAdapter,
} from './adapters/DeepReviewTeamAdapter';
import {
  ExistingAgentCatalogAdapter,
} from './adapters/ExistingAgentCatalogAdapter';
import {
  ExistingTeamCatalogAdapter,
} from './adapters/ExistingTeamCatalogAdapter';
import {
  SHORT_DRAMA_TEAM_CATALOG_ID,
  ShortDramaTeamAdapter,
} from './adapters/ShortDramaTeamAdapter';
import { CapabilityCatalogService } from './CapabilityCatalogService';
import type {
  ActivePersonaBinding,
  AgentCatalogEntry,
  CapabilityCatalogResult,
  CustomizationScenario,
  TeamCatalogEntry,
} from './types';

export const DEEP_REVIEW_TEAM_CATALOG_ID = 'default-review-team';

export type ComposerFixedTeamAction =
  | 'launch_deep_review'
  | 'open_short_drama';

export interface ComposerPersonaCatalog {
  status: CapabilityCatalogResult['status'];
  agents: AgentCatalogEntry[];
  teams: TeamCatalogEntry[];
  errors: CapabilityCatalogResult['errors'];
}

export const composerCapabilityCatalog = new CapabilityCatalogService([
  new ExistingAgentCatalogAdapter(),
  new ExistingTeamCatalogAdapter(),
  new DeepReviewTeamAdapter(),
  new ShortDramaTeamAdapter(),
]);

function isKnownRevision(
  revision: AgentCatalogEntry['identity']['revision'],
): revision is { status: 'known'; value: string } {
  return revision.status === 'known' && Boolean(revision.value.trim());
}

export class ComposerPersonaService {
  constructor(
    private readonly catalog: CapabilityCatalogService = composerCapabilityCatalog,
  ) {}

  async list(input: {
    scenario: CustomizationScenario;
    executionPolicy?: string;
    workspacePath?: string;
  }): Promise<ComposerPersonaCatalog> {
    const result = await this.catalog.list({
      kinds: ['agent', 'team'],
      scenario: input.scenario,
      executionPolicy: input.executionPolicy,
      workspacePath: input.workspacePath,
    });

    return {
      status: result.status,
      agents: result.entries.filter(
        (entry): entry is AgentCatalogEntry =>
          entry.kind === 'agent'
          && entry.agentKind === 'subagent'
          && entry.activationSupport === 'parent_persona'
          && entry.availability.status === 'available'
          && (entry.origin === 'user' || entry.origin === 'project')
          && isKnownRevision(entry.identity.revision)
          && /^(user|project)::void::[^:]+$/.test(entry.identity.id),
      ),
      teams: result.entries.filter(
        (entry): entry is TeamCatalogEntry =>
          entry.kind === 'team'
          && entry.availability.status === 'available'
          && (
            this.isReusableTeam(entry, input.scenario)
            || entry.activationSupport === 'existing_flow_only'
          ),
      ),
      errors: result.errors,
    };
  }

  createAgentBinding(
    entry: AgentCatalogEntry,
    scenario: CustomizationScenario,
  ): ActivePersonaBinding {
    if (
      entry.activationSupport !== 'parent_persona'
      || entry.availability.status !== 'available'
      || !entry.scenarioEligibility.includes(scenario)
      || (entry.origin !== 'user' && entry.origin !== 'project')
      || !/^(user|project)::void::[^:]+$/.test(entry.identity.id)
      || !isKnownRevision(entry.identity.revision)
    ) {
      throw new TypeError('Agent is not available as a parent persona');
    }

    return {
      kind: 'agent',
      personaId: entry.identity.id,
      personaRevision: entry.identity.revision,
    };
  }

  resolveTeamAction(
    entry: TeamCatalogEntry,
    scenario: CustomizationScenario,
  ): ComposerFixedTeamAction {
    if (
      entry.activationSupport !== 'existing_flow_only'
      || entry.availability.status !== 'available'
      || !entry.scenarioEligibility.includes(scenario)
    ) {
      throw new TypeError('Team is not available in this scenario');
    }
    if (entry.identity.id === DEEP_REVIEW_TEAM_CATALOG_ID) {
      return 'launch_deep_review';
    }
    if (entry.identity.id === SHORT_DRAMA_TEAM_CATALOG_ID) {
      return 'open_short_drama';
    }
    throw new TypeError('Unsupported fixed team action');
  }

  isReusableTeam(
    entry: TeamCatalogEntry,
    scenario: CustomizationScenario,
  ): boolean {
    return entry.activationSupport === 'parent_persona'
      && entry.leadBinding === 'parent_persona'
      && entry.availability.status === 'available'
      && entry.scenarioEligibility.includes(scenario)
      && isKnownRevision(entry.identity.revision)
      && isKnownRevision(entry.lead.identity.revision)
      && entry.lead.identity.revision.value
        === `${entry.identity.revision.value}:${entry.lead.identity.id}`;
  }
}
