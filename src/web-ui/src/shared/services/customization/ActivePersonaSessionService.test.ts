import { describe, expect, it } from 'vitest';
import { ActivePersonaSessionService } from './ActivePersonaSessionService';

const binding = (personaId: string) => ({
  kind: 'agent' as const,
  personaId,
  personaRevision: { status: 'known' as const, value: '1' },
});

describe('ActivePersonaSessionService', () => {
  it('captures a strict v1 snapshot from a normal parent single-agent binding', () => {
    const service = new ActivePersonaSessionService();
    service.select({
      sessionId: 'parent',
      sessionKind: 'normal',
      agentType: 'agentic',
      binding: binding('user::void::writer'),
    });

    expect(service.snapshot({
      sessionId: 'parent',
      sessionKind: 'normal',
      agentType: 'agentic',
    })).toEqual({
      schemaVersion: 1,
      kind: 'agent',
      personaKey: 'user::void::writer',
      personaRevision: '1',
      scenario: 'code',
      executionPolicy: 'agentic',
      resolvedSkillRefs: [],
    });
  });

  it('does not snapshot children and fails closed for legacy bindings', () => {
    const service = new ActivePersonaSessionService();
    service.select({
      sessionId: 'child',
      sessionKind: 'btw',
      agentType: 'agentic',
      binding: binding('user::void::writer'),
    });
    expect(service.snapshot({
      sessionId: 'child',
      sessionKind: 'btw',
      agentType: 'agentic',
    })).toBeUndefined();

    service.restore({
      sessionId: 'legacy',
      sessionKind: 'normal',
      agentType: 'agentic',
      customMetadata: {
        customization: {
          schemaVersion: 1,
          scenario: 'code',
          executionPolicy: 'agentic',
          activePersonaBinding: {
            kind: 'agent',
            personaId: 'user::void::writer',
            personaRevision: { status: 'legacy_unversioned' },
          },
        },
      },
    });
    expect(() => service.snapshot({
      sessionId: 'legacy',
      sessionKind: 'normal',
      agentType: 'agentic',
    })).toThrow('known revision');
  });

  it('captures a strict reusable Team lead snapshot with durable identities', () => {
    const service = new ActivePersonaSessionService();
    service.select({
      sessionId: 'parent-team',
      sessionKind: 'normal',
      agentType: 'Cowork',
      binding: {
        kind: 'team_lead',
        personaId: 'member-lead',
        personaRevision: {
          status: 'known',
          value: 'definition-revision:member-lead',
        },
        teamDefinitionId: 'custom-team',
        teamInstanceId: 'team-instance-1',
      },
    });

    expect(service.snapshot({
      sessionId: 'parent-team',
      sessionKind: 'normal',
      agentType: 'Cowork',
    })).toEqual({
      schemaVersion: 1,
      kind: 'team_lead',
      personaKey: 'member-lead',
      personaRevision: 'definition-revision:member-lead',
      teamDefinitionId: 'custom-team',
      teamInstanceId: 'team-instance-1',
      scenario: 'cowork',
      executionPolicy: 'Cowork',
      resolvedSkillRefs: [],
    });
  });

  it('fails closed when a Team lead binding is incomplete or uses another lead revision', () => {
    const service = new ActivePersonaSessionService();
    service.select({
      sessionId: 'incomplete-team',
      sessionKind: 'normal',
      agentType: 'agentic',
      binding: {
        kind: 'team_lead',
        personaId: 'member-lead',
        personaRevision: { status: 'known', value: 'revision:other-lead' },
        teamDefinitionId: 'custom-team',
      },
    });

    expect(() => service.snapshot({
      sessionId: 'incomplete-team',
      sessionKind: 'normal',
      agentType: 'agentic',
    })).toThrow('definition, instance, and lead');
  });

  it('isolates selections by parent session id', () => {
    const service = new ActivePersonaSessionService();

    service.select({
      sessionId: 'parent-a',
      sessionKind: 'normal',
      agentType: 'agentic',
      binding: binding('agent-a'),
    });
    service.select({
      sessionId: 'parent-b',
      sessionKind: 'normal',
      agentType: 'Media',
      binding: binding('agent-b'),
    });

    expect(
      service.resolve({ sessionId: 'parent-a', agentType: 'agentic' })
        .activePersonaBinding
    ).toMatchObject({ personaId: 'agent-a' });
    expect(
      service.resolve({ sessionId: 'parent-b', agentType: 'Media' })
        .activePersonaBinding
    ).toMatchObject({ personaId: 'agent-b' });
  });

  it('clears to the scenario default without changing scenario or policy', () => {
    const service = new ActivePersonaSessionService();
    service.select({
      sessionId: 'parent',
      agentType: 'Media',
      binding: binding('director'),
    });

    expect(
      service.clear({ sessionId: 'parent', agentType: 'Media' })
    ).toEqual({
      sessionId: 'parent',
      status: 'scenario_default',
      source: 'selection',
      scenario: 'media',
      executionPolicy: 'Media',
      activePersonaBinding: null,
    });
  });

  it('restores old sessions through the legacy projection', () => {
    const service = new ActivePersonaSessionService();

    expect(
      service.restore({
        sessionId: 'legacy',
        sessionKind: 'normal',
        agentType: 'Claw',
      })
    ).toEqual({
      sessionId: 'legacy',
      status: 'scenario_default',
      source: 'legacy_projection',
      scenario: 'cowork',
      executionPolicy: 'Claw',
      activePersonaBinding: null,
    });
  });

  it('never retains or selects a persona for child sessions', () => {
    const service = new ActivePersonaSessionService();
    const result = service.select({
      sessionId: 'child',
      sessionKind: 'btw',
      agentType: 'agentic',
      binding: binding('forbidden'),
    });

    expect(result.status).toBe('child_session_ignored');
    expect(result.activePersonaBinding).toBeNull();
    expect(
      service.restore({
        sessionId: 'child',
        sessionKind: 'btw',
        agentType: 'agentic',
        customMetadata: {
          customization: {
            schemaVersion: 1,
            scenario: 'media',
            executionPolicy: 'Media',
            activePersonaBinding: binding('forbidden'),
          },
        },
      }).activePersonaBinding
    ).toBeNull();
  });
});
