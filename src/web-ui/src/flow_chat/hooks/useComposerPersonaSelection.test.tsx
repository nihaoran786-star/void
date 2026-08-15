// @vitest-environment jsdom

import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SubagentInfo } from '@/infrastructure/api/service-api/SubagentAPI';
import type { Session } from '@/flow_chat/types/flow-chat';
import {
  CapabilityCatalogService,
  ComposerPersonaService,
  mapSubagentToCatalogEntry,
  ReusableTeamActivationError,
  type CapabilityCatalogSource,
  type CustomizationRuntimeCapabilityReader,
  type ReusableTeamActivator,
  type TeamCatalogEntry,
} from '@/shared/services/customization';
import {
  useComposerPersonaSelection,
} from './useComposerPersonaSelection';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const entry = mapSubagentToCatalogEntry({
  key: 'user::void::writer',
  id: 'writer',
  name: '文案智能体',
  description: '编写中文文案。',
  isReadonly: false,
  isReview: false,
  toolCount: 1,
  defaultTools: ['Read'],
  defaultEnabled: true,
  effectiveEnabled: true,
  subagentSource: 'user',
  promptCacheScopeKey: 'writer-v1',
});

const teamEntry: TeamCatalogEntry = {
  kind: 'team',
  identity: {
    id: 'default-review-team',
    revision: { status: 'known', value: 'review-team-v1' },
    displayName: '代码审查团队',
    description: '复用现有 DeepReview 流程。',
    aliases: [],
  },
  source: {
    adapterId: 'deep-review-team',
    recordType: 'fixed_team',
    recordId: 'default-review-team',
  },
  origin: 'fixed_runtime',
  scenarioEligibility: ['code'],
  tags: [],
  availability: { status: 'available' },
  leadBinding: 'child_orchestrator',
  lead: {
    identity: {
      id: 'deep-review-lead',
      revision: { status: 'known', value: 'review-team-v1' },
      displayName: '审查主理人',
      description: '',
      aliases: [],
    },
    role: 'lead',
    isReadonly: true,
  },
  members: [],
  activationSupport: 'existing_flow_only',
};

const reusableTeamEntry: TeamCatalogEntry = {
  ...teamEntry,
  identity: {
    ...teamEntry.identity,
    id: 'software-team',
    revision: { status: 'known', value: 'revision1' },
    displayName: '软件开发团队',
  },
  source: {
    adapterId: 'existing-team-definitions',
    recordType: 'team_definition',
    recordId: 'project:software-team',
  },
  origin: 'project',
  leadBinding: 'parent_persona',
  lead: {
    ...teamEntry.lead,
    identity: {
      ...teamEntry.lead.identity,
      id: 'software-lead',
      revision: { status: 'known', value: 'revision1:software-lead' },
      displayName: '研发主理人',
    },
    isReadonly: false,
  },
  activationSupport: 'parent_persona',
  managementSupport: 'authorable',
  definitionLevel: 'project',
};

const upgradedFixedRuntimeTeamEntry: TeamCatalogEntry = {
  ...reusableTeamEntry,
  identity: {
    ...reusableTeamEntry.identity,
    id: 'ai-short-drama-team',
    revision: { status: 'known', value: 'short-drama-v2' },
    displayName: 'AI 短剧团队',
  },
  source: {
    adapterId: 'short-drama-team',
    recordType: 'fixed_team',
    recordId: 'ai-short-drama-team',
  },
  origin: 'fixed_runtime',
  scenarioEligibility: ['media'],
  lead: {
    ...reusableTeamEntry.lead,
    identity: {
      ...reusableTeamEntry.lead.identity,
      id: 'short-drama-lead',
      revision: {
        status: 'known',
        value: 'short-drama-v2:short-drama-lead',
      },
    },
    isReadonly: false,
  },
  managementSupport: 'readonly_fixed',
  definitionLevel: 'user',
};

const loadCatalog = vi.fn(async () => ({
  sourceId: 'hook-test',
  status: 'ready' as const,
  entries: [entry, teamEntry, reusableTeamEntry],
  errors: [],
}));

const source: CapabilityCatalogSource = {
  sourceId: 'hook-test',
  load: loadCatalog,
};

const service = new ComposerPersonaService(new CapabilityCatalogService([source]));
const supportedCapabilityService: CustomizationRuntimeCapabilityReader = {
  getCapability: () => ({ status: 'supported', transport: 'tauri' }),
};
const unsupportedCapabilityService: CustomizationRuntimeCapabilityReader = {
  getCapability: () => ({
    status: 'unsupported',
    transport: 'websocket',
    reason: 'server_runtime_deferred',
  }),
};
const session = (overrides: Partial<Session> = {}): Session => ({
  sessionId: 'parent',
  title: 'Parent',
  dialogTurns: [],
  status: 'idle',
  config: { agentType: 'agentic' },
  createdAt: 1,
  lastActiveAt: 1,
  error: null,
  sessionKind: 'normal',
  mode: 'agentic',
  scenario: 'code',
  executionPolicy: 'agentic',
  workspacePath: 'D:/repo',
  ...overrides,
});

describe('useComposerPersonaSelection', () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: ReturnType<typeof useComposerPersonaSelection> | undefined;
  const persistPersona = vi.fn();
  const activateReusableTeam = vi.fn();
  const teamActivationService: ReusableTeamActivator = {
    activate: activateReusableTeam,
  };

  beforeEach(() => {
    loadCatalog.mockClear();
    persistPersona.mockReset().mockResolvedValue(undefined);
    activateReusableTeam.mockReset().mockResolvedValue(undefined);
    current = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function Harness({
    target,
    currentAgentType = target.mode,
    capabilityService = supportedCapabilityService,
  }: {
    target: Session;
    currentAgentType?: string;
    capabilityService?: CustomizationRuntimeCapabilityReader;
  }) {
    const value = useComposerPersonaSelection({
      session: target,
      workspacePath: target.workspacePath,
      currentAgentType,
      enabled: target.sessionKind === 'normal',
      service,
      teamActivationService,
      capabilityService,
      persistPersona,
    });
    useEffect(() => {
      current = value;
    }, [value]);
    return null;
  }

  it('已创建的默认会话也锁定主身份，不能原地添加或清除智能体', async () => {
    await act(async () => {
      root.render(<Harness target={session()} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(current?.agents).toHaveLength(1);
    expect(current?.teams).toHaveLength(2);

    expect(current?.personaLocked).toBe(true);
    await act(async () => {
      await expect(current?.selectAgent(entry)).rejects.toThrow('persona_locked');
      await expect(current?.clearAgent()).rejects.toThrow('persona_locked');
    });
    expect(persistPersona).not.toHaveBeenCalled();
  });

  it('新会话草稿加载同一目录，选择和清除只更新草稿目标', async () => {
    let draftTarget: typeof entry | TeamCatalogEntry | null = null;
    const onChange = vi.fn((target: typeof draftTarget) => {
      draftTarget = target;
    });

    function DraftHarness() {
      const value = useComposerPersonaSelection({
        workspacePath: 'D:/repo',
        currentAgentType: 'agentic',
        enabled: true,
        deferredSelection: { target: draftTarget, onChange },
        service,
        teamActivationService,
        capabilityService: supportedCapabilityService,
        persistPersona,
      });
      useEffect(() => {
        current = value;
      }, [value]);
      return null;
    }

    await act(async () => {
      root.render(<DraftHarness />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(current?.enabled).toBe(true);
    expect(current?.agents).toContain(entry);

    await act(async () => {
      await current?.selectAgent(entry);
    });
    expect(onChange).toHaveBeenLastCalledWith(entry);
    expect(persistPersona).not.toHaveBeenCalled();

    await act(async () => {
      await current?.runTeamAction(reusableTeamEntry, {
        launchDeepReview: vi.fn(),
        openCanvasCapability: vi.fn(),
      });
    });
    expect(onChange).toHaveBeenLastCalledWith(reusableTeamEntry);
    expect(activateReusableTeam).not.toHaveBeenCalled();

    await act(async () => {
      await current?.clearAgent();
    });
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(persistPersona).not.toHaveBeenCalled();
  });

  it('已创建会话的人格绑定不可清除或更换，使用其他团队必须新建会话', async () => {
    const lockedSession = session({
      activePersonaBinding: {
        kind: 'team_lead',
        personaId: reusableTeamEntry.lead.identity.id,
        personaRevision: {
          status: 'known',
          value: 'revision1:software-lead',
        },
        teamDefinitionId: reusableTeamEntry.identity.id,
        teamInstanceId: 'instance-1',
      },
    });

    await act(async () => {
      root.render(<Harness target={lockedSession} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(current?.personaLocked).toBe(true);
    await act(async () => {
      await expect(current?.clearAgent()).rejects.toThrow('persona_locked');
      await expect(current?.selectAgent(entry)).rejects.toThrow('persona_locked');
      await expect(current?.runTeamAction(teamEntry, {
        launchDeepReview: vi.fn(),
        openCanvasCapability: vi.fn(),
      })).rejects.toThrow('persona_locked');
    });
    expect(persistPersona).not.toHaveBeenCalled();
    expect(activateReusableTeam).not.toHaveBeenCalled();
  });

  it.each([
    ['Media', 'media'],
    ['Cowork', 'cowork'],
  ] as const)(
    '无会话草稿从 %s 推导 %s 场景并保留工作区与执行策略',
    async (currentAgentType, expectedScenario) => {
      const listSpy = vi.spyOn(service, 'list');

      function DraftHarness() {
        const value = useComposerPersonaSelection({
          workspacePath: 'D:\\draft-repo',
          currentAgentType,
          enabled: true,
          deferredSelection: { target: null, onChange: vi.fn() },
          service,
          teamActivationService,
          capabilityService: supportedCapabilityService,
          persistPersona,
        });
        useEffect(() => {
          current = value;
        }, [value]);
        return null;
      }

      await act(async () => {
        root.render(<DraftHarness />);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(listSpy).toHaveBeenCalledWith({
        scenario: expectedScenario,
        executionPolicy: currentAgentType,
        workspacePath: 'D:/draft-repo',
      });
      listSpy.mockRestore();
    },
  );

  it('只把身份、类型和已知版本完全匹配的目录项标记为当前智能体或团队', async () => {
    const renderBinding = async (
      activePersonaBinding: Session['activePersonaBinding'],
    ) => {
      await act(async () => {
        root.render(<Harness target={session({ activePersonaBinding })} />);
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    await renderBinding({
      kind: 'agent',
      personaId: entry.identity.id,
      personaRevision: { status: 'known', value: 'writer-v1' },
    });
    expect(current?.activeAgent).toBe(entry);
    expect(current?.activeTeam).toBeUndefined();

    for (const activePersonaBinding of [
      {
        kind: 'team_lead' as const,
        personaId: entry.identity.id,
        personaRevision: { status: 'known' as const, value: 'writer-v1' },
        teamDefinitionId: reusableTeamEntry.identity.id,
      },
      {
        kind: 'agent' as const,
        personaId: 'different-agent',
        personaRevision: { status: 'known' as const, value: 'writer-v1' },
      },
      {
        kind: 'agent' as const,
        personaId: entry.identity.id,
        personaRevision: { status: 'known' as const, value: 'writer-v2' },
      },
      {
        kind: 'agent' as const,
        personaId: entry.identity.id,
        personaRevision: { status: 'legacy_unversioned' as const },
      },
    ]) {
      await renderBinding(activePersonaBinding);
      expect(current?.activeAgent).toBeUndefined();
    }

    await renderBinding({
      kind: 'team_lead',
      personaId: reusableTeamEntry.lead.identity.id,
      personaRevision: {
        status: 'known',
        value: 'revision1:software-lead',
      },
      teamDefinitionId: reusableTeamEntry.identity.id,
      teamInstanceId: 'instance-1',
    });
    expect(current?.activeAgent).toBeUndefined();
    expect(current?.activeTeam).toBe(reusableTeamEntry);

    for (const activePersonaBinding of [
      {
        kind: 'team_lead' as const,
        personaId: reusableTeamEntry.lead.identity.id,
        personaRevision: {
          status: 'known' as const,
          value: 'revision1:software-lead',
        },
        teamDefinitionId: 'different-team',
      },
      {
        kind: 'team_lead' as const,
        personaId: 'different-lead',
        personaRevision: {
          status: 'known' as const,
          value: 'revision1:software-lead',
        },
        teamDefinitionId: reusableTeamEntry.identity.id,
      },
      {
        kind: 'team_lead' as const,
        personaId: reusableTeamEntry.lead.identity.id,
        personaRevision: { status: 'known' as const, value: 'stale-revision' },
        teamDefinitionId: reusableTeamEntry.identity.id,
      },
      {
        kind: 'team_lead' as const,
        personaId: reusableTeamEntry.lead.identity.id,
        personaRevision: { status: 'legacy_unversioned' as const },
        teamDefinitionId: reusableTeamEntry.identity.id,
      },
      {
        kind: 'agent' as const,
        personaId: reusableTeamEntry.lead.identity.id,
        personaRevision: {
          status: 'known' as const,
          value: 'revision1:software-lead',
        },
        teamDefinitionId: reusableTeamEntry.identity.id,
      },
    ]) {
      await renderBinding(activePersonaBinding);
      expect(current?.activeTeam).toBeUndefined();
    }
  });

  it('流式状态和历史对象更新不会重复加载同一场景与工作区目录', async () => {
    const initial = session();
    await act(async () => {
      root.render(<Harness target={initial} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadCatalog).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<Harness target={{
        ...initial,
        status: 'running',
        lastActiveAt: 2,
        dialogTurns: [{
          id: 'turn-1',
          sessionId: 'parent',
          modelRounds: [],
          status: 'processing',
          userMessage: {
            id: 'message-1',
            content: '正在输出',
            timestamp: 2,
          },
          startTime: 2,
        }],
      }} />);
      await Promise.resolve();
    });

    expect(loadCatalog).toHaveBeenCalledTimes(1);
  });

  it('标题和人格变化不重载目录，会话、场景或工作区变化会重载', async () => {
    const initial = session();
    await act(async () => {
      root.render(<Harness target={initial} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadCatalog).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<Harness target={{
        ...initial,
        title: 'Renamed',
        activePersonaBinding: {
          kind: 'agent',
          personaId: 'user::void::writer',
          personaRevision: { status: 'known', value: 'writer-v1' },
        },
      }} />);
      await Promise.resolve();
    });
    expect(loadCatalog).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<Harness target={{
        ...initial,
        sessionId: 'another-parent',
      }} />);
      await Promise.resolve();
    });
    expect(loadCatalog).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.render(<Harness target={{
        ...initial,
        sessionId: 'another-parent',
        scenario: 'media',
        mode: 'Media',
      }} />);
      await Promise.resolve();
    });
    expect(loadCatalog).toHaveBeenCalledTimes(3);

    await act(async () => {
      root.render(<Harness target={{
        ...initial,
        sessionId: 'another-parent',
        scenario: 'media',
        mode: 'Media',
        workspacePath: 'D:/another',
      }} />);
      await Promise.resolve();
    });
    expect(loadCatalog).toHaveBeenCalledTimes(4);
  });

  it('每轮快照始终采用输入框实际 currentAgentType', async () => {
    await act(async () => {
      root.render(
        <Harness
          target={session({
            mode: 'agentic',
            executionPolicy: 'agentic',
          })}
          currentAgentType="Plan"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(current?.personaSessionState).toMatchObject({
      scenario: 'code',
      executionPolicy: 'Plan',
    });

  });

  it('已绑定的同一通用团队可原地刷新版本，不误入固定团队动作', async () => {
    await act(async () => {
      root.render(<Harness target={session({
        activePersonaBinding: {
          kind: 'team_lead',
          personaId: reusableTeamEntry.lead.identity.id,
          personaRevision: { status: 'known', value: 'revision1:software-lead' },
          teamDefinitionId: reusableTeamEntry.identity.id,
          teamInstanceId: 'instance-1',
        },
      })} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const actions = {
      launchDeepReview: vi.fn(),
      openCanvasCapability: vi.fn(),
    };

    await act(async () => {
      await current?.runTeamAction(reusableTeamEntry, actions);
    });

    expect(activateReusableTeam).toHaveBeenCalledWith({
      entry: reusableTeamEntry,
      parentSessionId: 'parent',
      scenario: 'code',
      executionPolicy: 'agentic',
      persistPersona,
    });
    expect(actions.launchDeepReview).not.toHaveBeenCalled();
    expect(actions.openCanvasCapability).not.toHaveBeenCalled();
    expect(current?.personaPersistencePending).toBe(false);
    expect(current?.actionError).toBeUndefined();
  });

  it('同一通用团队刷新失败保留精确错误并解除并发门禁', async () => {
    activateReusableTeam.mockRejectedValueOnce(
      new ReusableTeamActivationError(
        'definition_revision_mismatch',
        'revision changed',
        false,
      ),
    );
    await act(async () => {
      root.render(<Harness target={session({
        activePersonaBinding: {
          kind: 'team_lead',
          personaId: reusableTeamEntry.lead.identity.id,
          personaRevision: { status: 'known', value: 'revision1:software-lead' },
          teamDefinitionId: reusableTeamEntry.identity.id,
          teamInstanceId: 'instance-1',
        },
      })} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await expect(current?.runTeamAction(reusableTeamEntry, {
        launchDeepReview: vi.fn(),
        openCanvasCapability: vi.fn(),
      })).rejects.toThrow('definition_revision_mismatch');
    });

    expect(current?.actionError).toBe('definition_revision_mismatch');
    expect(current?.isPersonaPersistencePending()).toBe(false);
    expect(current?.teams).toHaveLength(2);
  });

  it('官方固定团队升级后自动重绑最新版本且不重复激活', async () => {
    loadCatalog.mockResolvedValueOnce({
      sourceId: 'hook-test',
      status: 'ready',
      entries: [upgradedFixedRuntimeTeamEntry],
      errors: [],
    });
    const staleSession = session({
      mode: 'Media',
      config: { agentType: 'Media' },
      scenario: 'media',
      executionPolicy: 'Media',
      activePersonaBinding: {
        kind: 'team_lead',
        personaId: 'short-drama-lead',
        personaRevision: {
          status: 'known',
          value: 'short-drama-v1:short-drama-lead',
        },
        teamDefinitionId: 'ai-short-drama-team',
        teamInstanceId: 'team-short-drama-v1',
      },
    });

    await act(async () => {
      root.render(<Harness target={staleSession} />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(activateReusableTeam).toHaveBeenCalledTimes(1);
    expect(activateReusableTeam).toHaveBeenCalledWith(expect.objectContaining({
      entry: upgradedFixedRuntimeTeamEntry,
      parentSessionId: 'parent',
      scenario: 'media',
      executionPolicy: 'Media',
    }));

    await act(async () => {
      root.render(<Harness target={staleSession} />);
      await Promise.resolve();
    });
    expect(activateReusableTeam).toHaveBeenCalledTimes(1);
  });

  it('子会话不暴露选择器，也不会产生每轮 persona 快照', async () => {
    await act(async () => {
      root.render(<Harness target={session({
        sessionId: 'child',
        sessionKind: 'btw',
        parentSessionId: 'parent',
      })} />);
    });

    expect(current?.enabled).toBe(false);
    expect(current?.personaSessionState).toBeUndefined();
    expect(persistPersona).not.toHaveBeenCalled();
  });

  it('浏览器明确返回不支持且不读取目录、不持久化人格或启动团队', async () => {
    await act(async () => {
      root.render(
        <Harness
          target={session({
            activePersonaBinding: {
              kind: 'agent',
              personaId: 'user::void::writer',
              personaRevision: { status: 'known', value: 'writer-v1' },
            },
          })}
          capabilityService={unsupportedCapabilityService}
        />,
      );
      await Promise.resolve();
    });

    expect(current?.enabled).toBe(true);
    expect(current?.status).toBe('unsupported');
    expect(current?.agents).toEqual([]);
    expect(current?.teams).toEqual([]);
    expect(current?.personaSessionState).toBeUndefined();
    expect(loadCatalog).not.toHaveBeenCalled();

    const teamActions = {
      launchDeepReview: vi.fn(),
      openCanvasCapability: vi.fn(),
    };
    await act(async () => {
      await expect(current?.selectAgent(entry)).rejects.toThrow(
        'server_runtime_deferred',
      );
      await expect(current?.clearAgent()).rejects.toThrow(
        'server_runtime_deferred',
      );
      await expect(current?.runTeamAction(teamEntry, teamActions)).rejects.toThrow(
        'server_runtime_deferred',
      );
    });

    expect(persistPersona).not.toHaveBeenCalled();
    expect(teamActions.launchDeepReview).not.toHaveBeenCalled();
    expect(teamActions.openCanvasCapability).not.toHaveBeenCalled();
  });
});
