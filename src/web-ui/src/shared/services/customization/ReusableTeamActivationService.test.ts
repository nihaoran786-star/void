import { describe, expect, it, vi } from 'vitest';
import {
  ReusableTeamActivationError,
  ReusableTeamActivationService,
} from './ReusableTeamActivationService';
import type {
  TeamRuntimeGateway,
  TeamRuntimeMutationResponse,
  TeamRuntimeRecord,
} from './TeamRuntimeGateway';
import type { TeamCatalogEntry } from './types';

const teamEntry: TeamCatalogEntry = {
  kind: 'team',
  identity: {
    id: 'software-team',
    revision: { status: 'known', value: 'revision1' },
    displayName: '软件开发团队',
    description: '协调软件开发工作。',
    aliases: [],
  },
  source: {
    adapterId: 'existing-team-definitions',
    recordType: 'team_definition',
    recordId: 'project:software-team',
  },
  origin: 'project',
  scenarioEligibility: ['code'],
  tags: [],
  availability: { status: 'available' },
  leadBinding: 'parent_persona',
  lead: {
    identity: {
      id: 'software-lead',
      revision: { status: 'known', value: 'revision1:software-lead' },
      displayName: '研发主理人',
      description: '负责协调团队。',
      aliases: [],
    },
    role: 'lead',
    isReadonly: false,
  },
  members: [],
  activationSupport: 'parent_persona',
  managementSupport: 'authorable',
  definitionLevel: 'project',
  workflowCount: 0,
};

function readyRecord(
  overrides: Partial<TeamRuntimeRecord['snapshot']['instance']> = {},
): TeamRuntimeRecord {
  return {
    schemaVersion: 1,
    revision: 1,
    snapshot: {
      instance: {
        schemaVersion: 1,
        teamInstanceId: 'team-revision1',
        teamDefinitionId: 'software-team',
        teamDefinitionRevision: 'revision1',
        workspace: {
          workspaceId: 'workspace-1',
          contextKey: 'local:D:/repo',
          backend: 'local',
        },
        parentSessionId: 'parent-1',
        executionProfile: { kind: 'prompt_orchestrated' },
        leadBinding: {
          kind: 'parent_persona',
          parentSessionId: 'parent-1',
        },
        memberBindings: [],
        lifecycle: 'ready',
        creationSource: 'persona_activation',
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
      },
      teamRuns: [],
      memberRuns: [],
      phaseRuns: [],
    },
  };
}

function accepted(record = readyRecord()): TeamRuntimeMutationResponse {
  return {
    outcome: {
      operationId: 'team-attach-revision1',
      accepted: true,
      operationIds: [],
      notes: [],
    },
    record,
  };
}

function runtimeWith(
  response: TeamRuntimeMutationResponse,
): TeamRuntimeGateway & { attach: ReturnType<typeof vi.fn> } {
  return {
    list: vi.fn(),
    get: vi.fn(),
    attach: vi.fn().mockResolvedValue(response),
    observe: vi.fn(),
    message: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    recover: vi.fn(),
  };
}

describe('ReusableTeamActivationService', () => {
  it('先附着并校验持久团队实例，再保存父会话主理人人格', async () => {
    const runtime = runtimeWith(accepted());
    const persistPersona = vi.fn().mockResolvedValue(undefined);
    const service = new ReusableTeamActivationService(runtime);

    const result = await service.activate({
      entry: teamEntry,
      parentSessionId: 'parent-1',
      scenario: 'code',
      executionPolicy: 'agentic',
      persistPersona,
    });

    expect(runtime.attach).toHaveBeenCalledWith({
      operationId: 'team-attach-revision1',
      parentSessionId: 'parent-1',
      teamInstanceId: 'team-revision1',
      teamDefinitionId: 'software-team',
      teamDefinitionRevision: 'revision1',
      creationSource: 'persona_activation',
    });
    expect(persistPersona).toHaveBeenCalledWith('parent-1', {
      scenario: 'code',
      executionPolicy: 'agentic',
      activePersonaBinding: {
        kind: 'team_lead',
        personaId: 'software-lead',
        personaRevision: {
          status: 'known',
          value: 'revision1:software-lead',
        },
        teamDefinitionId: 'software-team',
        teamInstanceId: 'team-revision1',
      },
    });
    expect(result.binding.kind).toBe('team_lead');
  });

  it('运行时拒绝或返回错位实例时 fail closed，绝不保存人格', async () => {
    const rejectedRuntime = runtimeWith({
      outcome: {
        operationId: 'team-attach-revision1',
        accepted: false,
        operationIds: [],
        notes: [],
        error: {
          code: 'definition_revision_mismatch',
          message: 'revision changed',
          retryable: false,
        },
      },
      record: null,
    });
    const persistPersona = vi.fn();

    await expect(new ReusableTeamActivationService(rejectedRuntime).activate({
      entry: teamEntry,
      parentSessionId: 'parent-1',
      scenario: 'code',
      executionPolicy: 'agentic',
      persistPersona,
    })).rejects.toMatchObject({
      code: 'definition_revision_mismatch',
      retryable: false,
    });

    const mismatchedRuntime = runtimeWith(accepted(readyRecord({
      parentSessionId: 'another-parent',
    })));
    await expect(new ReusableTeamActivationService(mismatchedRuntime).activate({
      entry: teamEntry,
      parentSessionId: 'parent-1',
      scenario: 'code',
      executionPolicy: 'agentic',
      persistPersona,
    })).rejects.toMatchObject({ code: 'team_runtime_projection_invalid' });
    expect(persistPersona).not.toHaveBeenCalled();
  });

  it('人格保存失败后以同一实例和操作 ID 重试，不制造重复团队', async () => {
    const runtime = runtimeWith(accepted());
    const persistPersona = vi.fn()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValueOnce(undefined);
    const service = new ReusableTeamActivationService(runtime);
    const input = {
      entry: teamEntry,
      parentSessionId: 'parent-1',
      scenario: 'code' as const,
      executionPolicy: 'agentic',
      persistPersona,
    };

    await expect(service.activate(input)).rejects.toBeInstanceOf(
      ReusableTeamActivationError,
    );
    await expect(service.activate(input)).resolves.toMatchObject({
      binding: { teamInstanceId: 'team-revision1' },
    });

    expect(runtime.attach).toHaveBeenCalledTimes(2);
    expect(runtime.attach.mock.calls[0]?.[0]).toEqual(
      runtime.attach.mock.calls[1]?.[0],
    );
  });

  it('在调用运行时前拒绝跨场景、未知版本和主理人版本串台', async () => {
    const runtime = runtimeWith(accepted());
    const persistPersona = vi.fn();
    const service = new ReusableTeamActivationService(runtime);
    const invalidEntries: TeamCatalogEntry[] = [
      {
        ...teamEntry,
        identity: {
          ...teamEntry.identity,
          revision: { status: 'legacy_unversioned' },
        },
      },
      {
        ...teamEntry,
        lead: {
          ...teamEntry.lead,
          identity: {
            ...teamEntry.lead.identity,
            revision: { status: 'known', value: 'other:software-lead' },
          },
        },
      },
    ];

    await expect(service.activate({
      entry: teamEntry,
      parentSessionId: 'parent-1',
      scenario: 'media',
      executionPolicy: 'Media',
      persistPersona,
    })).rejects.toMatchObject({ code: 'team_not_activatable' });
    for (const entry of invalidEntries) {
      await expect(service.activate({
        entry,
        parentSessionId: 'parent-1',
        scenario: 'code',
        executionPolicy: 'agentic',
        persistPersona,
      })).rejects.toBeInstanceOf(ReusableTeamActivationError);
    }
    expect(runtime.attach).not.toHaveBeenCalled();
  });
});
