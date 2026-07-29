import type {
  SessionActivePersonaBinding,
  SessionCustomMetadata,
  SessionCustomizationMetadata,
  SessionCustomizationScenario,
  SessionKind,
  SessionPersonaRevision,
} from '@/shared/types/session-history';
import type {
  ActivePersonaSessionState,
  PersistedPersonaSessionDescriptor,
  PersonaSessionDescriptor,
} from '../types';

const DEFAULT_EXECUTION_POLICY = 'agentic';

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScenario(value: unknown): value is SessionCustomizationScenario {
  return value === 'code' || value === 'cowork' || value === 'media';
}

function parseRevision(value: unknown): SessionPersonaRevision | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.status === 'legacy_unversioned') {
    return { status: 'legacy_unversioned' };
  }

  const revision = normalizeNonEmptyString(value.value);
  if (value.status === 'known' && revision) {
    return { status: 'known', value: revision };
  }

  return undefined;
}

export function normalizeActivePersonaBinding(
  value: unknown
): SessionActivePersonaBinding | undefined {
  if (!isRecord(value) || (value.kind !== 'agent' && value.kind !== 'team_lead')) {
    return undefined;
  }

  const personaId = normalizeNonEmptyString(value.personaId);
  const personaRevision = parseRevision(value.personaRevision);
  if (!personaId || !personaRevision) {
    return undefined;
  }

  const teamDefinitionId = normalizeNonEmptyString(value.teamDefinitionId);
  const teamInstanceId = normalizeNonEmptyString(value.teamInstanceId);

  if (value.kind === 'team_lead') {
    if (!teamDefinitionId) {
      return undefined;
    }

    return {
      kind: 'team_lead',
      personaId,
      personaRevision,
      teamDefinitionId,
      ...(teamInstanceId ? { teamInstanceId } : {}),
    };
  }

  if (teamDefinitionId || teamInstanceId) {
    return undefined;
  }

  return {
    kind: 'agent',
    personaId,
    personaRevision,
  };
}

export function scenarioFromLegacyAgentType(
  agentType: string | null | undefined
): SessionCustomizationScenario {
  switch (normalizeNonEmptyString(agentType)) {
    case 'Cowork':
    case 'DeepResearch':
    case 'Claw':
      return 'cowork';
    case 'Media':
      return 'media';
    default:
      return 'code';
  }
}

function executionPolicyFromDescriptor(
  descriptor: Pick<PersonaSessionDescriptor, 'mode' | 'agentType'>
): string {
  return (
    normalizeNonEmptyString(descriptor.mode) ??
    normalizeNonEmptyString(descriptor.agentType) ??
    DEFAULT_EXECUTION_POLICY
  );
}

function isNormalParentSession(sessionKind: SessionKind | undefined): boolean {
  return sessionKind === undefined || sessionKind === 'normal';
}

function legacyProjection(
  descriptor: PersonaSessionDescriptor
): ActivePersonaSessionState {
  const executionPolicy = executionPolicyFromDescriptor(descriptor);
  const isParent = isNormalParentSession(descriptor.sessionKind);

  return {
    sessionId: descriptor.sessionId,
    status: isParent ? 'scenario_default' : 'child_session_ignored',
    source: 'legacy_projection',
    scenario: scenarioFromLegacyAgentType(executionPolicy),
    executionPolicy,
    activePersonaBinding: null,
  };
}

function parseCustomizationMetadata(
  value: unknown
): SessionCustomizationMetadata | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isScenario(value.scenario)
  ) {
    return undefined;
  }

  const executionPolicy = normalizeNonEmptyString(value.executionPolicy);
  if (!executionPolicy) {
    return undefined;
  }

  if (value.activePersonaBinding === null) {
    return {
      schemaVersion: 1,
      scenario: value.scenario,
      executionPolicy,
      activePersonaBinding: null,
    };
  }

  const activePersonaBinding = normalizeActivePersonaBinding(
    value.activePersonaBinding
  );
  if (!activePersonaBinding) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    scenario: value.scenario,
    executionPolicy,
    activePersonaBinding,
  };
}

export function restorePersonaSessionState(
  descriptor: PersistedPersonaSessionDescriptor
): ActivePersonaSessionState {
  const fallback = legacyProjection(descriptor);
  if (!isNormalParentSession(descriptor.sessionKind)) {
    return fallback;
  }

  const customization = parseCustomizationMetadata(
    descriptor.customMetadata?.customization
  );
  if (!customization) {
    return fallback;
  }

  return {
    sessionId: descriptor.sessionId,
    status: customization.activePersonaBinding
      ? 'selected'
      : 'scenario_default',
    source: 'persisted',
    scenario: customization.scenario,
    executionPolicy: customization.executionPolicy,
    activePersonaBinding: customization.activePersonaBinding,
  };
}

export function serializePersonaSessionState(
  state: Pick<
    ActivePersonaSessionState,
    'status' | 'scenario' | 'executionPolicy' | 'activePersonaBinding'
  >
): SessionCustomizationMetadata | undefined {
  if (state.status === 'child_session_ignored') {
    return undefined;
  }

  const executionPolicy = normalizeNonEmptyString(state.executionPolicy);
  if (!executionPolicy) {
    return undefined;
  }

  const activePersonaBinding =
    state.activePersonaBinding === null
      ? null
      : normalizeActivePersonaBinding(state.activePersonaBinding);
  if (activePersonaBinding === undefined) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    scenario: state.scenario,
    executionPolicy,
    activePersonaBinding,
  };
}

export function writePersonaSessionMetadata(
  existingCustomMetadata: SessionCustomMetadata | undefined,
  descriptor: PersonaSessionDescriptor & {
    scenario?: SessionCustomizationScenario;
    executionPolicy?: string;
    activePersonaBinding?: SessionActivePersonaBinding | null;
  }
): SessionCustomMetadata {
  const next: SessionCustomMetadata = { ...(existingCustomMetadata ?? {}) };
  delete next.customization;

  if (!isNormalParentSession(descriptor.sessionKind)) {
    return next;
  }

  const legacy = legacyProjection(descriptor);
  const customization = serializePersonaSessionState({
    status: descriptor.activePersonaBinding
      ? 'selected'
      : 'scenario_default',
    scenario: descriptor.scenario ?? legacy.scenario,
    executionPolicy:
      normalizeNonEmptyString(descriptor.executionPolicy) ??
      legacy.executionPolicy,
    activePersonaBinding: descriptor.activePersonaBinding ?? null,
  });

  if (customization) {
    next.customization = customization;
  }

  return next;
}
