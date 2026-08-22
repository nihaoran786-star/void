import { describe, expect, it } from 'vitest';

import { deriveSessionCapabilities } from './sessionCapabilities';

function session(overrides: Record<string, unknown> = {}) {
  return {
    dialogTurns: [],
    ...overrides,
  } as never;
}

describe('agent-studio session capability', () => {
  it('is offered when the conversation is bound to an authored agent', () => {
    const capabilities = deriveSessionCapabilities(session({
      activePersonaBinding: { kind: 'agent', personaId: 'user::void::writer' },
    }));

    expect(capabilities.map(capability => capability.id)).toContain('agent-studio');
  });

  it('is not offered when the conversation runs a scenario default', () => {
    const capabilities = deriveSessionCapabilities(session());

    expect(capabilities.map(capability => capability.id)).not.toContain('agent-studio');
  });

  it('is not offered for a persona binding that carries no persona id', () => {
    const capabilities = deriveSessionCapabilities(session({
      activePersonaBinding: { kind: 'agent', personaId: '   ' },
    }));

    expect(capabilities.map(capability => capability.id)).not.toContain('agent-studio');
  });

  it('is not offered in a subagent conversation, which runs another agent persona', () => {
    const capabilities = deriveSessionCapabilities(session({
      sessionKind: 'subagent',
      activePersonaBinding: { kind: 'agent', personaId: 'user::void::writer' },
    }));

    expect(capabilities.map(capability => capability.id)).not.toContain('agent-studio');
  });

  it('is not offered for a team-lead binding, which is authored as a team', () => {
    const capabilities = deriveSessionCapabilities(session({
      activePersonaBinding: { kind: 'team', personaId: 'user::void::lead' },
    }));

    expect(capabilities.map(capability => capability.id)).not.toContain('agent-studio');
  });

  it('does not disturb the existing media capability ordering', () => {
    const capabilities = deriveSessionCapabilities(session({
      mode: 'media',
      activePersonaBinding: { kind: 'agent', personaId: 'user::void::writer' },
    }));

    const ids = capabilities.map(capability => capability.id);
    expect(ids).toEqual(['workspace-media', 'infinite-canvas', 'agent-studio']);
  });
});
