import { describe, expect, it } from 'vitest';
import {
  restorePersonaSessionState,
  scenarioFromLegacyAgentType,
  serializePersonaSessionState,
  writePersonaSessionMetadata,
} from './SessionPersonaMetadataAdapter';

describe('SessionPersonaMetadataAdapter', () => {
  it.each([
    ['Cowork', 'cowork'],
    ['DeepResearch', 'cowork'],
    ['Claw', 'cowork'],
    ['Media', 'media'],
    ['agentic', 'code'],
    ['Plan', 'code'],
    [undefined, 'code'],
  ] as const)('projects legacy agent type %s to %s', (agentType, scenario) => {
    expect(scenarioFromLegacyAgentType(agentType)).toBe(scenario);
  });

  it('restores a valid selected team lead without changing legacy policy fields', () => {
    expect(
      restorePersonaSessionState({
        sessionId: 'parent-1',
        sessionKind: 'normal',
        mode: 'Plan',
        agentType: 'agentic',
        customMetadata: {
          customization: {
            schemaVersion: 1,
            scenario: 'code',
            executionPolicy: 'Plan',
            activePersonaBinding: {
              kind: 'team_lead',
              personaId: 'review-team-lead',
              personaRevision: { status: 'known', value: '2' },
              teamDefinitionId: 'review-team',
              teamInstanceId: 'run-1',
            },
          },
        },
      })
    ).toEqual({
      sessionId: 'parent-1',
      status: 'selected',
      source: 'persisted',
      scenario: 'code',
      executionPolicy: 'Plan',
      activePersonaBinding: {
        kind: 'team_lead',
        personaId: 'review-team-lead',
        personaRevision: { status: 'known', value: '2' },
        teamDefinitionId: 'review-team',
        teamInstanceId: 'run-1',
      },
    });
  });

  it('falls back safely when customization metadata is malformed', () => {
    expect(
      restorePersonaSessionState({
        sessionId: 'legacy-1',
        sessionKind: 'normal',
        agentType: 'Media',
        customMetadata: {
          customization: {
            schemaVersion: 1,
            scenario: 'media',
            executionPolicy: 'Media',
            activePersonaBinding: {
              kind: 'team_lead',
              personaId: 'short-drama-lead',
              personaRevision: { status: 'legacy_unversioned' },
            },
          },
        },
      })
    ).toEqual({
      sessionId: 'legacy-1',
      status: 'scenario_default',
      source: 'legacy_projection',
      scenario: 'media',
      executionPolicy: 'Media',
      activePersonaBinding: null,
    });
  });

  it('ignores customization metadata for every child session kind', () => {
    for (const sessionKind of [
      'btw',
      'review',
      'deep_review',
      'miniapp',
      'subagent',
    ] as const) {
      expect(
        restorePersonaSessionState({
          sessionId: `child-${sessionKind}`,
          sessionKind,
          agentType: 'Cowork',
          customMetadata: {
            customization: {
              schemaVersion: 1,
              scenario: 'media',
              executionPolicy: 'Media',
              activePersonaBinding: {
                kind: 'agent',
                personaId: 'media-agent',
                personaRevision: { status: 'legacy_unversioned' },
              },
            },
          },
        })
      ).toMatchObject({
        status: 'child_session_ignored',
        source: 'legacy_projection',
        scenario: 'cowork',
        executionPolicy: 'Cowork',
        activePersonaBinding: null,
      });
    }
  });

  it('serializes explicit null after clearing and rejects invalid bindings', () => {
    expect(
      serializePersonaSessionState({
        status: 'scenario_default',
        scenario: 'code',
        executionPolicy: 'debug',
        activePersonaBinding: null,
      })
    ).toEqual({
      schemaVersion: 1,
      scenario: 'code',
      executionPolicy: 'debug',
      activePersonaBinding: null,
    });

    expect(
      serializePersonaSessionState({
        status: 'selected',
        scenario: 'code',
        executionPolicy: 'agentic',
        activePersonaBinding: {
          kind: 'team_lead',
          personaId: 'lead',
          personaRevision: { status: 'legacy_unversioned' },
        } as never,
      })
    ).toBeUndefined();
  });

  it('removes inherited customization from child metadata', () => {
    expect(
      writePersonaSessionMetadata(
        {
          keep: 'value',
          customization: {
            schemaVersion: 1,
            scenario: 'code',
            executionPolicy: 'agentic',
            activePersonaBinding: null,
          },
        },
        {
          sessionId: 'child',
          sessionKind: 'subagent',
          agentType: 'agentic',
        }
      )
    ).toEqual({ keep: 'value' });
  });
});
