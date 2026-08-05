import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentCatalogEntry,
  TeamCatalogEntry,
} from '@/shared/services/customization';

import {
  CustomizationTaskDispatchError,
  CustomizationTaskDispatchService,
  type CustomizationTaskDispatchDependencies,
} from './CustomizationTaskDispatchService';

function modeAgent(id: string, scenario: 'code' | 'cowork' | 'media'): AgentCatalogEntry {
  return {
    kind: 'agent',
    identity: {
      id,
      revision: { status: 'legacy_unversioned' },
      displayName: id,
      description: '',
      aliases: [],
    },
    source: { adapterId: 'existing-agents', recordType: 'mode', recordId: id },
    origin: 'builtin',
    scenarioEligibility: [scenario],
    tags: ['builtin_mode'],
    availability: { status: 'unsupported' },
    agentKind: 'mode',
    executionPolicyEligibility: [id],
    isReadonly: false,
    toolCount: 1,
    activationSupport: 'runtime_mode_only',
  };
}

function customAgent(): AgentCatalogEntry {
  return {
    kind: 'agent',
    identity: {
      id: 'user::void::designer',
      revision: { status: 'known', value: 'persona-v1' },
      displayName: '视觉设计智能体',
      description: '负责视觉设计。',
      aliases: [],
    },
    source: {
      adapterId: 'existing-agents',
      recordType: 'subagent',
      recordId: 'user::void::designer',
    },
    origin: 'user',
    scenarioEligibility: ['code', 'media'],
    tags: ['agent'],
    availability: { status: 'available' },
    agentKind: 'subagent',
    executionPolicyEligibility: [],
    isReadonly: false,
    toolCount: 2,
    activationSupport: 'parent_persona',
  };
}

function reusableTeam(): TeamCatalogEntry {
  return {
    kind: 'team',
    identity: {
      id: 'delivery-team',
      revision: { status: 'known', value: 'team-v1' },
      displayName: '软件交付团队',
      description: '负责软件交付。',
      aliases: [],
    },
    source: {
      adapterId: 'existing-team-definitions',
      recordType: 'team_definition',
      recordId: 'user:delivery-team',
    },
    origin: 'user',
    scenarioEligibility: ['code'],
    tags: ['team_definition'],
    availability: { status: 'available' },
    leadBinding: 'parent_persona',
    lead: {
      identity: {
        id: 'delivery-lead',
        revision: { status: 'known', value: 'team-v1:delivery-lead' },
        displayName: '交付主理人',
        description: '',
        aliases: [],
      },
      role: 'lead',
      isReadonly: false,
    },
    members: [],
    activationSupport: 'parent_persona',
    managementSupport: 'authorable',
  };
}

function fixedTeam(id: 'default-review-team' | 'ai-short-drama-team'): TeamCatalogEntry {
  const scenario = id === 'default-review-team' ? 'code' : 'media';
  return {
    ...reusableTeam(),
    identity: {
      id,
      revision: { status: 'legacy_unversioned' },
      displayName: id,
      description: '',
      aliases: [],
    },
    source: { adapterId: id, recordType: 'fixed_team', recordId: id },
    origin: 'fixed_runtime',
    scenarioEligibility: [scenario],
    leadBinding: 'child_orchestrator',
    activationSupport: 'existing_flow_only',
    managementSupport: 'readonly_fixed',
  };
}

describe('CustomizationTaskDispatchService', () => {
  let dependencies: CustomizationTaskDispatchDependencies;
  let service: CustomizationTaskDispatchService;

  beforeEach(() => {
    dependencies = {
      beginDraft: vi.fn(),
      openDraft: vi.fn(),
      persistPersona: vi.fn(async () => undefined),
      validateAgentTarget: vi.fn(async input => input.target),
      activateReusableTeam: vi.fn(async () => ({
        binding: {
          kind: 'team_lead',
          personaId: 'delivery-lead',
          personaRevision: { status: 'known', value: 'team-v1:delivery-lead' },
          teamDefinitionId: 'delivery-team',
          teamInstanceId: 'team-team-v1',
        },
      })),
      openShortDrama: vi.fn(async () => undefined),
    };
    service = new CustomizationTaskDispatchService(dependencies);
  });

  it('市场派发只打开新会话草稿，不提前创建真实会话', async () => {
    const result = await service.dispatch({
      target: customAgent(),
      preferredScenario: 'media',
    });

    expect(dependencies.beginDraft).toHaveBeenCalledWith({
      scenario: 'media',
      executionPolicy: 'Media',
      personaTarget: customAgent(),
    });
    expect(dependencies.openDraft).toHaveBeenCalledOnce();
    expect(dependencies.persistPersona).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      scenario: 'media',
      action: 'draft_opened',
    });
  });

  it('把内置模式派发到它自己的房间', async () => {
    const result = await service.dispatch({
      target: modeAgent('Cowork', 'cowork'),
      preferredScenario: 'code',
    });

    expect(dependencies.beginDraft).toHaveBeenCalledWith({
      scenario: 'cowork',
      executionPolicy: 'Cowork',
      personaTarget: null,
    });
    expect(dependencies.persistPersona).not.toHaveBeenCalled();
    expect(result).toMatchObject({ scenario: 'cowork', action: 'draft_opened' });
  });

  it('真实会话创建后、首条消息发送前激活自定义智能体', async () => {
    const result = await service.activateCreatedSession({
      target: customAgent(),
      sessionId: 'session-created',
      scenario: 'media',
      executionPolicy: 'Media',
    });

    expect(dependencies.persistPersona).toHaveBeenCalledWith(
      'session-created',
      expect.objectContaining({
        scenario: 'media',
        executionPolicy: 'Media',
        activePersonaBinding: {
          kind: 'agent',
          personaId: 'user::void::designer',
          personaRevision: { status: 'known', value: 'persona-v1' },
        },
      }),
    );
    expect(result).toMatchObject({
      sessionId: 'session-created',
      status: 'selected',
      activePersonaBinding: { personaId: 'user::void::designer' },
    });
  });

  it('真实会话创建后、首条消息发送前激活团队主理人', async () => {
    const result = await service.activateCreatedSession({
      target: reusableTeam(),
      sessionId: 'session-created',
      scenario: 'code',
      executionPolicy: 'agentic',
    });

    expect(dependencies.activateReusableTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        parentSessionId: 'session-created',
        scenario: 'code',
        executionPolicy: 'agentic',
      }),
    );
    expect(result?.activePersonaBinding).toMatchObject({
      kind: 'team_lead',
      teamDefinitionId: 'delivery-team',
    });
  });

  it('代码审查团队只进入带团队胶囊的 Code 新会话草稿', async () => {
    const result = await service.dispatch({
      target: fixedTeam('default-review-team'),
    });

    expect(dependencies.beginDraft).toHaveBeenCalledWith(expect.objectContaining({
      scenario: 'code',
      personaTarget: expect.objectContaining({
        identity: expect.objectContaining({ id: 'default-review-team' }),
      }),
    }));
    expect(result.action).toBe('draft_opened');
  });

  it('短剧团队等真实 Media 会话创建后再打开原有短剧画布', async () => {
    await service.activateCreatedSession({
      target: fixedTeam('ai-short-drama-team'),
      sessionId: 'session-created',
      scenario: 'media',
      executionPolicy: 'Media',
    });

    expect(dependencies.openShortDrama).toHaveBeenCalledOnce();
  });

  it('定义不可运行时在打开新会话草稿前失败关闭', async () => {
    const target = reusableTeam();
    target.activationSupport = 'definition_only';
    target.leadBinding = 'definition_only';
    target.availability = { status: 'unsupported' };

    await expect(service.dispatch({ target })).rejects.toMatchObject({
      code: 'target_not_dispatchable',
    } satisfies Partial<CustomizationTaskDispatchError>);
    expect(dependencies.beginDraft).not.toHaveBeenCalled();
  });

  it('团队版本与主理人版本不一致时不创建空会话', async () => {
    const target = reusableTeam();
    target.lead.identity.revision = { status: 'known', value: 'other:delivery-lead' };

    await expect(service.dispatch({ target })).rejects.toMatchObject({
      code: 'target_not_dispatchable',
    } satisfies Partial<CustomizationTaskDispatchError>);
    expect(dependencies.beginDraft).not.toHaveBeenCalled();
  });

  it('智能体激活失败时阻止首条消息继续发送', async () => {
    vi.mocked(dependencies.persistPersona).mockRejectedValueOnce(new Error('persist failed'));

    await expect(service.activateCreatedSession({
      target: customAgent(),
      sessionId: 'session-created',
      scenario: 'code',
      executionPolicy: 'agentic',
    })).rejects.toMatchObject({ code: 'persona_activation_failed' });

    expect(dependencies.openShortDrama).not.toHaveBeenCalled();
  });

  it('首发前智能体版本已变化时拒绝激活且不持久化旧角色', async () => {
    vi.mocked(dependencies.validateAgentTarget).mockRejectedValueOnce(
      new Error('revision changed'),
    );

    await expect(service.activateCreatedSession({
      target: customAgent(),
      sessionId: 'session-created',
      scenario: 'code',
      executionPolicy: 'agentic',
      workspacePath: 'D:/workspace/project',
    })).rejects.toMatchObject({ code: 'persona_activation_failed' });

    expect(dependencies.persistPersona).not.toHaveBeenCalled();
  });
});
