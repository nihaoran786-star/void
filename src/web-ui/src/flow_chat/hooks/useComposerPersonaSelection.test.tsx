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
  type CapabilityCatalogSource,
  type CustomizationRuntimeCapabilityReader,
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
} as SubagentInfo & { promptCacheScopeKey: string });

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

const loadCatalog = vi.fn(async () => ({
  sourceId: 'hook-test',
  status: 'ready' as const,
  entries: [entry, teamEntry],
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

  beforeEach(() => {
    loadCatalog.mockClear();
    persistPersona.mockReset().mockResolvedValue(undefined);
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
      capabilityService,
      persistPersona,
    });
    useEffect(() => {
      current = value;
    }, [value]);
    return null;
  }

  it('选择和清除只提交父会话 persona 字段，不改变场景与执行策略', async () => {
    await act(async () => {
      root.render(<Harness target={session()} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(current?.agents).toHaveLength(1);
    expect(current?.teams).toHaveLength(1);

    await act(async () => {
      await current?.selectAgent(entry);
    });
    expect(persistPersona).toHaveBeenLastCalledWith('parent', {
      scenario: 'code',
      executionPolicy: 'agentic',
      activePersonaBinding: {
        kind: 'agent',
        personaId: 'user::void::writer',
        personaRevision: { status: 'known', value: 'writer-v1' },
      },
    });

    await act(async () => {
      await current?.clearAgent();
    });
    expect(persistPersona).toHaveBeenLastCalledWith('parent', {
      scenario: 'code',
      executionPolicy: 'agentic',
      activePersonaBinding: null,
    });
  });

  it('选择或清除失败不会隐藏目录，并可在同一会话中重试', async () => {
    await act(async () => {
      root.render(<Harness target={session()} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(current?.status).toBe('ready');
    expect(current?.agents).toHaveLength(1);

    persistPersona.mockRejectedValueOnce(new Error('disk unavailable'));
    await act(async () => {
      await expect(current?.selectAgent(entry)).rejects.toThrow('activation_failed');
    });
    expect(current?.status).toBe('ready');
    expect(current?.agents).toHaveLength(1);
    expect(current?.catalogError).toBeUndefined();
    expect(current?.actionError).toBe('activation_failed');

    persistPersona.mockResolvedValueOnce(undefined);
    await act(async () => {
      await current?.selectAgent(entry);
    });
    expect(current?.status).toBe('ready');
    expect(current?.actionError).toBeUndefined();

    persistPersona.mockRejectedValueOnce(new Error('disk unavailable'));
    await act(async () => {
      await expect(current?.clearAgent()).rejects.toThrow('clear_failed');
    });
    expect(current?.status).toBe('ready');
    expect(current?.agents).toHaveLength(1);
    expect(current?.actionError).toBe('clear_failed');

    persistPersona.mockResolvedValueOnce(undefined);
    await act(async () => {
      await current?.clearAgent();
    });
    expect(current?.status).toBe('ready');
    expect(current?.actionError).toBeUndefined();
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

  it('每轮快照始终采用输入框实际 currentAgentType 并修复旧策略', async () => {
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

    await act(async () => {
      await current?.selectAgent(entry);
    });
    expect(persistPersona).toHaveBeenLastCalledWith(
      'parent',
      expect.objectContaining({
        executionPolicy: 'Plan',
      }),
    );
  });

  it('人格持久化期间同步阻止并发切换，失败后解除门禁并可重试', async () => {
    let rejectPersistence: ((reason?: unknown) => void) | undefined;
    persistPersona.mockImplementationOnce(() => new Promise<void>((_, reject) => {
      rejectPersistence = reject;
    }));

    await act(async () => {
      root.render(<Harness target={session()} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    let activation: Promise<void> | undefined;
    act(() => {
      activation = current?.selectAgent(entry);
    });
    expect(current?.isPersonaPersistencePending()).toBe(true);

    await act(async () => {
      await expect(current?.clearAgent()).rejects.toThrow(
        'persona_persistence_pending',
      );
    });
    expect(persistPersona).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectPersistence?.(new Error('disk unavailable'));
      await expect(activation).rejects.toThrow('activation_failed');
    });
    expect(current?.personaPersistencePending).toBe(false);
    expect(current?.isPersonaPersistencePending()).toBe(false);
    expect(current?.personaSessionState).toMatchObject({
      status: 'scenario_default',
      activePersonaBinding: null,
    });

    persistPersona.mockResolvedValueOnce(undefined);
    await act(async () => {
      await current?.selectAgent(entry);
    });
    expect(persistPersona).toHaveBeenCalledTimes(2);
  });

  it('团队动作失败保留目录并允许直接重试', async () => {
    await act(async () => {
      root.render(<Harness target={session()} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const launchDeepReview = vi.fn()
      .mockRejectedValueOnce(new Error('launch failed'))
      .mockResolvedValueOnce(undefined);
    const actions = {
      launchDeepReview,
      openShortDrama: vi.fn(),
    };

    await act(async () => {
      await expect(current?.runTeamAction(teamEntry, actions)).rejects.toThrow(
        'team_action_failed',
      );
    });
    expect(current?.status).toBe('ready');
    expect(current?.agents).toHaveLength(1);
    expect(current?.teams).toHaveLength(1);
    expect(current?.actionError).toBe('team_action_failed');

    await act(async () => {
      await current?.runTeamAction(teamEntry, actions);
    });
    expect(launchDeepReview).toHaveBeenCalledTimes(2);
    expect(current?.actionError).toBeUndefined();
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
      openShortDrama: vi.fn(),
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
    expect(teamActions.openShortDrama).not.toHaveBeenCalled();
  });
});
