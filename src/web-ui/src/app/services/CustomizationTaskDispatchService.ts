import { scenarioFromLegacyAgentType } from '@/shared/services/customization/adapters/SessionPersonaMetadataAdapter';
import {
  ReusableTeamActivationError,
  type ActivateReusableTeamInput,
  type ReusableTeamPersonaState,
} from '@/shared/services/customization/ReusableTeamActivationService';
import type {
  AgentCatalogEntry,
  CustomizationScenario,
  TeamCatalogEntry,
  PersonaTurnSnapshotDescriptor,
} from '@/shared/services/customization/types';
import type { SessionActivePersonaBinding } from '@/shared/types/session-history';
import { DEFAULT_REVIEW_TEAM_ID } from '@/shared/services/review-team/defaults';

export type TaskDispatchTarget = AgentCatalogEntry | TeamCatalogEntry;

export interface DispatchCustomizationTaskInput {
  target: TaskDispatchTarget;
  preferredScenario?: CustomizationScenario;
}

export interface CustomizationTaskDispatchResult {
  scenario: CustomizationScenario;
  executionPolicy: string;
  action: 'draft_opened';
}

export interface ActivateDraftPersonaInput {
  target: TaskDispatchTarget;
  sessionId: string;
  scenario: CustomizationScenario;
  executionPolicy: string;
  workspacePath?: string;
}

export interface CustomizationTaskDispatcher {
  dispatch(
    input: DispatchCustomizationTaskInput,
  ): Promise<CustomizationTaskDispatchResult>;
  activateCreatedSession(
    input: ActivateDraftPersonaInput,
  ): Promise<PersonaTurnSnapshotDescriptor | undefined>;
}

export interface CustomizationTaskDispatchDependencies {
  beginDraft(input: {
    scenario: CustomizationScenario;
    executionPolicy: string;
    personaTarget: TaskDispatchTarget | null;
  }): void | Promise<void>;
  openDraft(): void | Promise<void>;
  persistPersona(
    sessionId: string,
    state: {
      scenario: CustomizationScenario;
      executionPolicy: string;
      activePersonaBinding: SessionActivePersonaBinding | null;
    },
  ): Promise<void>;
  validateAgentTarget(input: {
    target: AgentCatalogEntry;
    scenario: CustomizationScenario;
    executionPolicy: string;
    workspacePath?: string;
  }): Promise<AgentCatalogEntry>;
  activateReusableTeam(input: ActivateReusableTeamInput): Promise<unknown>;
}

export class CustomizationTaskDispatchError extends Error {
  constructor(
    readonly code:
      | 'target_not_dispatchable'
      | 'draft_open_failed'
      | 'persona_activation_failed'
      | 'team_activation_failed',
    message: string,
    readonly sessionId?: string,
    readonly preserveSession = false,
  ) {
    super(message);
    this.name = 'CustomizationTaskDispatchError';
  }
}

const DEFAULT_EXECUTION_POLICY: Record<CustomizationScenario, string> = {
  code: 'agentic',
  cowork: 'Cowork',
  media: 'Media',
};

const defaultDependencies: CustomizationTaskDispatchDependencies = {
  beginDraft: async input => {
    const { beginNewSessionDraft } = await import(
      '@/flow_chat/services/NewSessionDraftService'
    );
    beginNewSessionDraft(input.scenario, null, {
      executionPolicy: input.executionPolicy,
      personaTarget: input.personaTarget,
    });
  },
  openDraft: async () => {
    const [{ appManager }, { useSceneStore }] = await Promise.all([
      import('@/app/services/AppManager'),
      import('@/app/stores/sceneStore'),
    ]);
    appManager.updateLayout({
      leftPanelActiveTab: 'sessions',
      leftPanelCollapsed: false,
    });
    useSceneStore.getState().openScene('session');
  },
  persistPersona: async (sessionId, state) => {
    const { FlowChatManager } = await import('@/flow_chat/services/FlowChatManager');
    return FlowChatManager.getInstance().updateChatSessionPersona(sessionId, state);
  },
  validateAgentTarget: async input => {
    const { ComposerPersonaService } = await import(
      '@/shared/services/customization/ComposerPersonaService'
    );
    const service = new ComposerPersonaService();
    const catalog = await service.list({
      scenario: input.scenario,
      executionPolicy: input.executionPolicy,
      workspacePath: input.workspacePath,
    });
    const current = catalog.agents.find(entry =>
      entry.identity.id === input.target.identity.id
      && entry.identity.revision.status === 'known'
      && input.target.identity.revision.status === 'known'
      && entry.identity.revision.value === input.target.identity.revision.value
    );
    if (!current) {
      throw new TypeError('Agent definition revision changed before first send.');
    }
    return current;
  },
  activateReusableTeam: async input => {
    const { reusableTeamActivationService } = await import(
      '@/shared/services/customization/ReusableTeamActivationService'
    );
    return reusableTeamActivationService.activate(input);
  },
};

function isReusableTeam(target: TeamCatalogEntry): boolean {
  const teamRevision = target.identity.revision.status === 'known'
    ? target.identity.revision.value.trim()
    : '';
  const leadRevision = target.lead.identity.revision.status === 'known'
    ? target.lead.identity.revision.value.trim()
    : '';
  return target.activationSupport === 'parent_persona'
    && target.leadBinding === 'parent_persona'
    && target.availability.status === 'available'
    && Boolean(teamRevision)
    && /^[A-Za-z0-9_-]+$/.test(teamRevision)
    && leadRevision === `${teamRevision}:${target.lead.identity.id}`;
}

function isFixedTeam(target: TeamCatalogEntry): boolean {
  return target.activationSupport === 'existing_flow_only'
    && target.availability.status === 'available'
    && (
      target.identity.id === DEFAULT_REVIEW_TEAM_ID
    );
}

export function canDispatchCustomizationTarget(target: TaskDispatchTarget): boolean {
  if (target.kind === 'team') {
    return isReusableTeam(target) || isFixedTeam(target);
  }
  if (target.agentKind === 'mode') {
    return target.activationSupport === 'runtime_mode_only'
      && target.scenarioEligibility.length > 0;
  }
  return target.activationSupport === 'parent_persona'
    && target.availability.status === 'available'
    && target.identity.revision.status === 'known';
}

function resolveScenario(
  target: TaskDispatchTarget,
  preferred?: CustomizationScenario,
): CustomizationScenario {
  const eligible = target.scenarioEligibility;
  if (target.kind === 'agent' && target.agentKind === 'mode') {
    const modeScenario = scenarioFromLegacyAgentType(target.identity.id);
    if (eligible.includes(modeScenario)) return modeScenario;
  }
  if (preferred && eligible.includes(preferred)) return preferred;
  const scenario = eligible[0];
  if (!scenario) {
    throw new CustomizationTaskDispatchError(
      'target_not_dispatchable',
      'The selected Agent or Team has no compatible session scenario.',
    );
  }
  return scenario;
}

function resolveExecutionPolicy(
  target: TaskDispatchTarget,
  scenario: CustomizationScenario,
): string {
  if (target.kind === 'agent' && target.agentKind === 'mode') {
    return target.identity.id;
  }
  if (target.kind === 'agent') {
    const eligiblePolicy = target.executionPolicyEligibility.find(
      policy => scenarioFromLegacyAgentType(policy) === scenario,
    );
    if (eligiblePolicy) return eligiblePolicy;
  }
  return DEFAULT_EXECUTION_POLICY[scenario];
}

export class CustomizationTaskDispatchService
  implements CustomizationTaskDispatcher {
  constructor(
    private readonly dependencies: CustomizationTaskDispatchDependencies = defaultDependencies,
  ) {}

  async dispatch(
    input: DispatchCustomizationTaskInput,
  ): Promise<CustomizationTaskDispatchResult> {
    if (!canDispatchCustomizationTarget(input.target)) {
      throw new CustomizationTaskDispatchError(
        'target_not_dispatchable',
        'The selected Agent or Team is not available for task dispatch.',
      );
    }

    const scenario = resolveScenario(input.target, input.preferredScenario);
    const executionPolicy = resolveExecutionPolicy(input.target, scenario);
    try {
      await this.dependencies.beginDraft({
        scenario,
        executionPolicy,
        personaTarget:
          input.target.kind === 'agent' && input.target.agentKind === 'mode'
            ? null
            : input.target,
      });
      await this.dependencies.openDraft();
    } catch (error) {
      throw new CustomizationTaskDispatchError(
        'draft_open_failed',
        error instanceof Error ? error.message : 'New-session draft could not be opened.',
      );
    }

    return {
      scenario,
      executionPolicy,
      action: 'draft_opened',
    };
  }

  async activateCreatedSession(
    input: ActivateDraftPersonaInput,
  ): Promise<PersonaTurnSnapshotDescriptor | undefined> {
    if (input.target.kind === 'agent') {
      if (input.target.agentKind === 'mode') return undefined;
      try {
        const { ComposerPersonaService } = await import(
          '@/shared/services/customization/ComposerPersonaService'
        );
        const composerPersonaService = new ComposerPersonaService();
        const currentTarget = await this.dependencies.validateAgentTarget({
          target: input.target,
          scenario: input.scenario,
          executionPolicy: input.executionPolicy,
          workspacePath: input.workspacePath,
        });
        const binding = composerPersonaService.createAgentBinding(
          currentTarget,
          input.scenario,
        );
        await this.dependencies.persistPersona(input.sessionId, {
          scenario: input.scenario,
          executionPolicy: input.executionPolicy,
          activePersonaBinding: binding,
        });
        return {
          sessionId: input.sessionId,
          sessionKind: 'normal',
          status: 'selected',
          scenario: input.scenario,
          executionPolicy: input.executionPolicy,
          activePersonaBinding: binding,
        };
      } catch (error) {
        throw new CustomizationTaskDispatchError(
          'persona_activation_failed',
          error instanceof Error ? error.message : 'Agent activation failed.',
          input.sessionId,
        );
      }
    }

    if (isReusableTeam(input.target)) {
      const persistPersona = async (
        parentSessionId: string,
        state: ReusableTeamPersonaState,
      ) => this.dependencies.persistPersona(parentSessionId, state);
      try {
        const activation = await this.dependencies.activateReusableTeam({
          entry: input.target,
          parentSessionId: input.sessionId,
          scenario: input.scenario,
          executionPolicy: input.executionPolicy,
          persistPersona,
        });
        const binding = (activation as { binding?: SessionActivePersonaBinding }).binding;
        if (!binding) {
          throw new TypeError('Team activation did not return a persona binding.');
        }
        return {
          sessionId: input.sessionId,
          sessionKind: 'normal',
          status: 'selected',
          scenario: input.scenario,
          executionPolicy: input.executionPolicy,
          activePersonaBinding: binding,
        };
      } catch (error) {
        const preserveSession = error instanceof ReusableTeamActivationError
          && error.code === 'team_persona_persistence_failed';
        throw new CustomizationTaskDispatchError(
          'team_activation_failed',
          error instanceof Error ? error.message : 'Team activation failed.',
          input.sessionId,
          preserveSession,
        );
      }
    }

    return undefined;
  }
}

export const customizationTaskDispatchService =
  new CustomizationTaskDispatchService();
