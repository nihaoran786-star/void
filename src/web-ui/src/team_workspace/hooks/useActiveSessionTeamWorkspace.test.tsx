// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { FlowChatState, Session } from '@/flow_chat/types/flow-chat';
import type {
  ActiveTeamWorkspaceState,
  TeamWorkspaceProjectionReader,
  TeamWorkspaceSnapshot,
} from '../types';
import {
  deriveTeamWorkspaceRailStatus,
  useActiveSessionTeamWorkspace,
  type ActiveSessionTeamWorkspaceState,
} from './useActiveSessionTeamWorkspace';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'session-1',
    title: '会话',
    dialogTurns: [],
    status: 'active',
    config: {
      agentType: 'agentic',
      maxContextTokens: 128128,
      autoCompact: true,
      enableTools: true,
    },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    historyState: 'ready',
    sessionKind: 'normal',
    workspacePath: 'D:/workspace',
    activePersonaBinding: {
      kind: 'team_lead',
      personaId: 'lead-1',
      personaRevision: { status: 'known', value: 'revision-1' },
      teamDefinitionId: 'team-1',
      teamInstanceId: 'instance-1',
    },
    ...overrides,
  };
}

function emptySnapshot(parentSessionId: string): TeamWorkspaceSnapshot {
  return {
    status: 'ready',
    parentSessionId,
    teams: [],
    activeTeam: null,
    issues: [],
    shouldPoll: false,
  };
}

function setStore(session: Session | null) {
  flowChatStore.setState((): FlowChatState => ({
    sessions: session ? new Map([[session.sessionId, session]]) : new Map(),
    activeSessionId: session?.sessionId ?? null,
  }));
}

describe('useActiveSessionTeamWorkspace', () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: ActiveSessionTeamWorkspaceState | undefined;
  let reader: TeamWorkspaceProjectionReader;

  function Probe() {
    current = useActiveSessionTeamWorkspace({
      reader,
      supported: true,
      refreshOnFocus: false,
    });
    return <output data-status={current.status} />;
  }

  beforeEach(() => {
    reader = { read: vi.fn(({ parentSessionId }) => (
      Promise.resolve(emptySnapshot(parentSessionId))
    )) };
    setStore(null);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    current = undefined;
  });

  afterEach(() => {
    act(() => root.unmount());
    setStore(null);
    container.remove();
    vi.restoreAllMocks();
  });

  it('仅为完整的普通父会话团队绑定读取投影', async () => {
    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
    });
    expect(current).toMatchObject({
      status: 'disabled',
      sessionId: null,
      hasTeamBinding: false,
    });
    expect(reader.read).not.toHaveBeenCalled();

    await act(async () => {
      setStore(createSession());
      await Promise.resolve();
    });
    expect(reader.read).toHaveBeenCalledWith({
      parentSessionId: 'session-1',
      workspacePath: 'D:/workspace',
      teamDefinitionId: 'team-1',
      teamInstanceId: 'instance-1',
    });
    expect(current).toMatchObject({
      status: 'ready',
      sessionId: 'session-1',
      hasTeamBinding: true,
    });
  });

  it('拒绝 BTW、未知版本和缺少实例标识的团队绑定', async () => {
    await act(async () => {
      root.render(<Probe />);
      setStore(createSession({ sessionKind: 'btw' }));
      await Promise.resolve();
    });
    expect(current?.hasTeamBinding).toBe(false);

    await act(async () => {
      setStore(createSession({
        activePersonaBinding: {
          kind: 'team_lead',
          personaId: 'lead-1',
          personaRevision: { status: 'legacy_unversioned' },
          teamDefinitionId: 'team-1',
          teamInstanceId: 'instance-1',
        },
      }));
      await Promise.resolve();
    });
    expect(current?.hasTeamBinding).toBe(false);

    await act(async () => {
      setStore(createSession({
        activePersonaBinding: {
          kind: 'team_lead',
          personaId: 'lead-1',
          personaRevision: { status: 'known', value: 'revision-1' },
          teamDefinitionId: 'team-1',
        },
      }));
      await Promise.resolve();
    });
    expect(current?.hasTeamBinding).toBe(false);
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('最后一轮状态变化会刷新，其他无关会话字段变化不会重复读取', async () => {
    const turn = {
      id: 'turn-1',
      userMessage: { content: '开始' },
      modelRounds: [],
      status: 'processing' as const,
      startTime: 1,
    };
    await act(async () => {
      setStore(createSession({ dialogTurns: [turn] }));
      root.render(<Probe />);
      await Promise.resolve();
    });
    expect(reader.read).toHaveBeenCalledTimes(1);

    await act(async () => {
      setStore(createSession({ dialogTurns: [{ ...turn, status: 'completed' }] }));
      await Promise.resolve();
    });
    expect(reader.read).toHaveBeenCalledTimes(2);

    await act(async () => {
      setStore(createSession({
        dialogTurns: [{ ...turn, status: 'completed' }],
        title: '只改标题',
      }));
      await Promise.resolve();
    });
    expect(reader.read).toHaveBeenCalledTimes(2);
  });

  it('同一会话切换团队时按新的 definition 和 instance 重新读取', async () => {
    await act(async () => {
      setStore(createSession());
      root.render(<Probe />);
      await Promise.resolve();
    });
    expect(reader.read).toHaveBeenLastCalledWith({
      parentSessionId: 'session-1',
      workspacePath: 'D:/workspace',
      teamDefinitionId: 'team-1',
      teamInstanceId: 'instance-1',
    });

    await act(async () => {
      setStore(createSession({
        activePersonaBinding: {
          kind: 'team_lead',
          personaId: 'lead-2',
          personaRevision: { status: 'known', value: 'revision-2' },
          teamDefinitionId: 'team-2',
          teamInstanceId: 'instance-2',
        },
      }));
      await Promise.resolve();
    });

    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(reader.read).toHaveBeenLastCalledWith({
      parentSessionId: 'session-1',
      workspacePath: 'D:/workspace',
      teamDefinitionId: 'team-2',
      teamInstanceId: 'instance-2',
    });
  });

  it.each([
    ['queued', 'running'],
    ['running', 'running'],
    ['waiting_user', 'attention'],
    ['blocked', 'attention'],
    ['completed', 'completed'],
    ['failed', 'error'],
    ['cancelled', 'error'],
  ] as const)('把运行态 %s 映射为能力栏状态 %s', (runStatus, expected) => {
    const state = {
      status: 'ready',
      reload: vi.fn(),
      snapshot: {
        activeTeam: {
          activeRun: { status: runStatus },
        },
      },
    } as ActiveTeamWorkspaceState;

    expect(deriveTeamWorkspaceRailStatus(state)).toBe(expected);
  });

  it.each([
    ['provisioning', 'loading'],
    ['unavailable', 'error'],
    ['archived', 'completed'],
  ] as const)('把团队生命周期 %s 映射为能力栏状态 %s', (lifecycle, expected) => {
    const state = {
      status: 'ready',
      reload: vi.fn(),
      snapshot: {
        activeTeam: {
          lifecycle,
          activeRun: null,
        },
      },
    } as ActiveTeamWorkspaceState;

    expect(deriveTeamWorkspaceRailStatus(state)).toBe(expected);
  });
});
