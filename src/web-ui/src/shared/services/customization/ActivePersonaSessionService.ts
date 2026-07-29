import type {
  ActivePersonaBinding,
  ActivePersonaSessionState,
  PersonaTurnSnapshot,
  PersonaTurnSnapshotDescriptor,
  PersistedPersonaSessionDescriptor,
  PersonaSessionDescriptor,
} from './types';
import {
  normalizeActivePersonaBinding,
  restorePersonaSessionState,
} from './adapters/SessionPersonaMetadataAdapter';

export interface ActivePersonaSelectionInput extends PersonaSessionDescriptor {
  binding: ActivePersonaBinding;
}

export interface ActivePersonaSessionServiceContract {
  resolve(descriptor: PersonaSessionDescriptor): ActivePersonaSessionState;
  select(input: ActivePersonaSelectionInput): ActivePersonaSessionState;
  clear(descriptor: PersonaSessionDescriptor): ActivePersonaSessionState;
  restore(
    descriptor: PersistedPersonaSessionDescriptor
  ): ActivePersonaSessionState;
  snapshot(descriptor: PersonaSessionDescriptor): PersonaTurnSnapshot | undefined;
}

function isParentState(state: ActivePersonaSessionState): boolean {
  return state.status !== 'child_session_ignored';
}

const EXECUTABLE_PERSONA_KEY = /^(user|project)::void::[^:]+$/;

/**
 * Pure v1 snapshot boundary. Absence is valid for defaults and child sessions;
 * an explicitly selected but unsupported binding fails closed.
 */
export function createPersonaTurnSnapshot(
  descriptor: PersonaTurnSnapshotDescriptor
): PersonaTurnSnapshot | undefined {
  if (
    descriptor.sessionKind !== undefined &&
    descriptor.sessionKind !== 'normal'
  ) {
    return undefined;
  }
  if (
    descriptor.status === 'child_session_ignored' ||
    descriptor.activePersonaBinding === null
  ) {
    return undefined;
  }

  const binding = descriptor.activePersonaBinding;
  if (binding.kind !== 'agent') {
    throw new TypeError('Team leads cannot execute as a v1 persona snapshot');
  }
  if (binding.personaRevision.status !== 'known') {
    throw new TypeError('Persona snapshot requires a known revision');
  }
  if (!EXECUTABLE_PERSONA_KEY.test(binding.personaId)) {
    throw new TypeError('Persona snapshot requires a source-qualified subagent key');
  }

  const executionPolicy = descriptor.executionPolicy.trim();
  if (!executionPolicy) {
    throw new TypeError('Persona snapshot requires an execution policy');
  }

  return {
    schemaVersion: 1,
    kind: 'agent',
    personaKey: binding.personaId,
    personaRevision: binding.personaRevision.value,
    scenario: descriptor.scenario,
    executionPolicy,
    resolvedSkillRefs: [],
  };
}

export class ActivePersonaSessionService
  implements ActivePersonaSessionServiceContract
{
  private readonly stateBySessionId = new Map<string, ActivePersonaSessionState>();

  resolve(descriptor: PersonaSessionDescriptor): ActivePersonaSessionState {
    const fallback = restorePersonaSessionState(descriptor);
    if (!isParentState(fallback)) {
      return fallback;
    }

    return this.stateBySessionId.get(descriptor.sessionId) ?? fallback;
  }

  select(input: ActivePersonaSelectionInput): ActivePersonaSessionState {
    const current = this.resolve(input);
    if (!isParentState(current)) {
      return current;
    }

    const binding = normalizeActivePersonaBinding(input.binding);
    if (!binding) {
      throw new TypeError('Invalid active persona binding');
    }

    const selected: ActivePersonaSessionState = {
      ...current,
      status: 'selected',
      source: 'selection',
      activePersonaBinding: binding,
    };
    this.stateBySessionId.set(input.sessionId, selected);
    return selected;
  }

  clear(descriptor: PersonaSessionDescriptor): ActivePersonaSessionState {
    const current = this.resolve(descriptor);
    if (!isParentState(current)) {
      return current;
    }

    const cleared: ActivePersonaSessionState = {
      ...current,
      status: 'scenario_default',
      source: 'selection',
      activePersonaBinding: null,
    };
    this.stateBySessionId.set(descriptor.sessionId, cleared);
    return cleared;
  }

  restore(
    descriptor: PersistedPersonaSessionDescriptor
  ): ActivePersonaSessionState {
    const restored = restorePersonaSessionState(descriptor);
    if (!isParentState(restored)) {
      this.stateBySessionId.delete(descriptor.sessionId);
      return restored;
    }

    this.stateBySessionId.set(descriptor.sessionId, restored);
    return restored;
  }

  snapshot(descriptor: PersonaSessionDescriptor): PersonaTurnSnapshot | undefined {
    const state = this.resolve(descriptor);
    return createPersonaTurnSnapshot({
      ...state,
      sessionKind: descriptor.sessionKind,
    });
  }
}
