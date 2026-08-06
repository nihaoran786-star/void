// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ActiveTeamWorkspaceState,
  TeamWorkspaceProjectionReader,
  TeamWorkspaceSnapshot,
} from '../types';
import {
  useActiveTeamWorkspace,
  type UseActiveTeamWorkspaceInput,
} from './useActiveTeamWorkspace';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function snapshot(
  parentSessionId: string,
  options: {
    status?: TeamWorkspaceSnapshot['status'];
    shouldPoll?: boolean;
    hasTeam?: boolean;
  } = {},
): TeamWorkspaceSnapshot {
  const hasTeam = options.hasTeam ?? false;
  const team = hasTeam ? {
    teamInstanceId: `instance-${parentSessionId}`,
    teamDefinitionId: 'team-1',
    teamDefinitionRevision: 'revision-1',
    runtimeRevision: 1,
    definition: {
      schemaVersion: 1 as const,
      teamDefinitionId: 'team-1',
      displayName: '软件团队',
      description: '测试团队',
      category: '技术',
      capabilityTags: [],
      scenarioEligibility: ['code' as const],
      leadMemberId: 'lead',
      members: [],
      workflows: [],
      collaborationPolicy: 'lead_mediated' as const,
      permissionPolicy: 'inherit_parent_intersection' as const,
      origin: 'project' as const,
    },
    lifecycle: 'ready' as const,
    activeRun: null,
    members: [],
    phases: [],
    issues: [],
    updatedAt: 1,
    isTerminal: !(options.shouldPoll ?? false),
  } : null;
  return {
    status: options.status ?? 'ready',
    parentSessionId,
    teams: team ? [team] : [],
    activeTeam: team,
    issues: [],
    shouldPoll: options.shouldPoll ?? false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useActiveTeamWorkspace', () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: ActiveTeamWorkspaceState | undefined;

  function Probe(props: UseActiveTeamWorkspaceInput) {
    current = useActiveTeamWorkspace(props);
    return <output data-status={current.status} />;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    current = undefined;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('disabled 和 server unsupported 均返回显式状态且不触发 reader', async () => {
    const reader: TeamWorkspaceProjectionReader = { read: vi.fn() };
    await act(async () => {
      root.render(<Probe sessionId="session-1" enabled={false} reader={reader} />);
      await Promise.resolve();
    });
    expect(current?.status).toBe('disabled');
    expect(reader.read).not.toHaveBeenCalled();

    await act(async () => {
      root.render(<Probe sessionId="session-1" supported={false} reader={reader} />);
      await Promise.resolve();
    });
    expect(current).toMatchObject({
      status: 'unsupported',
      error: { code: 'unsupported_transport', retryable: false },
    });
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('无团队的 ready 快照只读取一次，不启动轮询', async () => {
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn().mockResolvedValue(snapshot('session-1')),
    };
    await act(async () => {
      root.render(
        <Probe
          sessionId="session-1"
          teamDefinitionId="team-1"
          teamInstanceId="instance-1"
          reader={reader}
        />,
      );
      await Promise.resolve();
    });
    expect(current).toMatchObject({
      status: 'ready',
      snapshot: { teams: [], shouldPoll: false },
    });
    expect(reader.read).toHaveBeenCalledWith({
      parentSessionId: 'session-1',
      workspacePath: undefined,
      teamDefinitionId: 'team-1',
      teamInstanceId: 'instance-1',
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(reader.read).toHaveBeenCalledTimes(1);
  });

  it('非终态团队以 2 秒单飞轮询，终态后立即停止', async () => {
    const first = deferred<TeamWorkspaceSnapshot>();
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce(snapshot('session-1', {
          hasTeam: true,
          shouldPoll: false,
        })),
    };
    await act(async () => {
      root.render(<Probe sessionId="session-1" reader={reader} />);
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(reader.read).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(snapshot('session-1', { hasTeam: true, shouldPoll: true }));
      await first.promise;
    });
    expect(current?.snapshot?.shouldPoll).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(current?.snapshot?.shouldPoll).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(reader.read).toHaveBeenCalledTimes(2);
  });

  it('切换会话后旧请求即使晚返回也不能覆盖新会话', async () => {
    const oldRequest = deferred<TeamWorkspaceSnapshot>();
    const newRequest = deferred<TeamWorkspaceSnapshot>();
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn(({ parentSessionId }) => (
        parentSessionId === 'session-old'
          ? oldRequest.promise
          : newRequest.promise
      )),
    };

    await act(async () => {
      root.render(<Probe sessionId="session-old" reader={reader} />);
      await Promise.resolve();
    });
    await act(async () => {
      root.render(<Probe sessionId="session-new" reader={reader} />);
      await Promise.resolve();
    });
    await act(async () => {
      newRequest.resolve(snapshot('session-new', { hasTeam: true }));
      await newRequest.promise;
    });
    expect(current?.snapshot?.parentSessionId).toBe('session-new');

    await act(async () => {
      oldRequest.resolve(snapshot('session-old', { hasTeam: true }));
      await oldRequest.promise;
    });
    expect(current?.snapshot?.parentSessionId).toBe('session-new');
  });

  it('manual reload 使用相同 reader 重新获取并更新快照', async () => {
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn()
        .mockResolvedValueOnce(snapshot('session-1'))
        .mockResolvedValueOnce(snapshot('session-1', { hasTeam: true })),
    };
    await act(async () => {
      root.render(<Probe sessionId="session-1" reader={reader} />);
      await Promise.resolve();
    });
    expect(current?.snapshot?.teams).toHaveLength(0);

    await act(async () => {
      current?.reload();
      await Promise.resolve();
    });
    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(current?.snapshot?.teams).toHaveLength(1);
  });

  it('refreshKey 变化时重新读取同一会话且不依赖轮询', async () => {
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn().mockResolvedValue(snapshot('session-1')),
    };
    await act(async () => {
      root.render(
        <Probe sessionId="session-1" refreshKey="turn-1:processing" reader={reader} />,
      );
      await Promise.resolve();
    });
    expect(reader.read).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <Probe sessionId="session-1" refreshKey="turn-1:completed" reader={reader} />,
      );
      await Promise.resolve();
    });
    expect(reader.read).toHaveBeenCalledTimes(2);
  });

  it('同一团队后台刷新时保留已有工作区且不卸载成员会话', async () => {
    const initialSnapshot = snapshot('session-1', { hasTeam: true });
    const refresh = deferred<TeamWorkspaceSnapshot>();
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn()
        .mockResolvedValueOnce(initialSnapshot)
        .mockReturnValueOnce(refresh.promise),
    };
    let mounts = 0;
    let unmounts = 0;

    function ExistingMemberConversation() {
      React.useEffect(() => {
        mounts += 1;
        return () => {
          unmounts += 1;
        };
      }, []);
      return <span data-testid="member-conversation">existing member conversation</span>;
    }

    function WorkspaceProbe({ refreshKey }: { refreshKey: string }) {
      current = useActiveTeamWorkspace({
        sessionId: 'session-1',
        teamDefinitionId: 'team-1',
        teamInstanceId: 'instance-session-1',
        refreshKey,
        reader,
      });
      return current.status === 'loading'
        ? <span data-testid="loading">loading</span>
        : <ExistingMemberConversation />;
    }

    await act(async () => {
      root.render(<WorkspaceProbe refreshKey="turn-1:processing" />);
      await Promise.resolve();
    });
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);

    await act(async () => {
      root.render(<WorkspaceProbe refreshKey="turn-1:completed" />);
      await Promise.resolve();
    });

    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(current?.status).toBe('ready');
    expect(container.querySelector('[data-testid="loading"]')).toBeNull();
    expect(container.querySelector('[data-testid="member-conversation"]')).not.toBeNull();
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);

    await act(async () => {
      refresh.resolve(snapshot('session-1', { hasTeam: true }));
      await refresh.promise;
    });
  });

  it('后台刷新返回语义相同快照时保留原快照引用', async () => {
    const initialSnapshot = snapshot('session-1', { hasTeam: true });
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn()
        .mockResolvedValueOnce(initialSnapshot)
        .mockResolvedValueOnce(structuredClone(initialSnapshot)),
    };

    await act(async () => {
      root.render(
        <Probe sessionId="session-1" refreshKey="turn-1" reader={reader} />,
      );
      await Promise.resolve();
    });
    expect(current?.snapshot).toBe(initialSnapshot);

    await act(async () => {
      root.render(
        <Probe sessionId="session-1" refreshKey="turn-2" reader={reader} />,
      );
      await Promise.resolve();
    });

    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(current?.snapshot).toBe(initialSnapshot);
  });

  it('父界面无关重渲染时保留 hook 对外状态引用', async () => {
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn().mockResolvedValue(snapshot('session-1', { hasTeam: true })),
    };

    function ParentRerenderProbe({ label }: { label: string }) {
      current = useActiveTeamWorkspace({ sessionId: 'session-1', reader });
      return <output>{label}</output>;
    }

    await act(async () => {
      root.render(<ParentRerenderProbe label="before" />);
      await Promise.resolve();
    });
    const existingState = current;

    await act(async () => {
      root.render(<ParentRerenderProbe label="after" />);
      await Promise.resolve();
    });

    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(current).toBe(existingState);
  });

  it('后台刷新返回暂时错误快照时保留已有团队和成员会话', async () => {
    const initialSnapshot = snapshot('session-1', { hasTeam: true });
    const issue = {
      code: 'runtime_read_failed' as const,
      source: 'projection' as const,
      message: 'temporary failure',
      retryable: true,
    };
    const failedRefresh: TeamWorkspaceSnapshot = {
      status: 'error',
      parentSessionId: 'session-1',
      teams: [],
      activeTeam: null,
      issues: [issue],
      shouldPoll: false,
    };
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn()
        .mockResolvedValueOnce(initialSnapshot)
        .mockResolvedValueOnce(failedRefresh),
    };

    await act(async () => {
      root.render(
        <Probe sessionId="session-1" refreshKey="turn-1" reader={reader} />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      root.render(
        <Probe sessionId="session-1" refreshKey="turn-2" reader={reader} />,
      );
      await Promise.resolve();
    });

    expect(current?.status).toBe('ready');
    expect(current?.snapshot).toBe(initialSnapshot);
    expect(current?.error).toEqual(issue);
  });

  it('后台轮询期间不改变可见状态，同值结果不重复发布', async () => {
    const initialSnapshot = snapshot('session-1', {
      hasTeam: true,
      shouldPoll: true,
    });
    const poll = deferred<TeamWorkspaceSnapshot>();
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn()
        .mockResolvedValueOnce(initialSnapshot)
        .mockReturnValueOnce(poll.promise),
    };

    await act(async () => {
      root.render(<Probe sessionId="session-1" reader={reader} />);
      await Promise.resolve();
    });
    const visibleState = current;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(current).toBe(visibleState);

    await act(async () => {
      poll.resolve(structuredClone(initialSnapshot));
      await poll.promise;
    });
    expect(current).toBe(visibleState);
  });

  it('跨会话切换的首个 render 同步隔离旧快照', async () => {
    const nextRequest = deferred<TeamWorkspaceSnapshot>();
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn(({ parentSessionId }) => parentSessionId === 'session-old'
        ? Promise.resolve(snapshot('session-old', { hasTeam: true }))
        : nextRequest.promise),
    };
    const renders: Array<{
      requestedSessionId: string;
      status: ActiveTeamWorkspaceState['status'];
      snapshotSessionId?: string;
    }> = [];

    function IdentityProbe({ sessionId }: { sessionId: string }) {
      const state = useActiveTeamWorkspace({ sessionId, reader });
      renders.push({
        requestedSessionId: sessionId,
        status: state.status,
        snapshotSessionId: state.snapshot?.parentSessionId,
      });
      return <output data-status={state.status} />;
    }

    await act(async () => {
      root.render(<IdentityProbe sessionId="session-old" />);
      await Promise.resolve();
    });
    renders.length = 0;
    await act(async () => {
      root.render(<IdentityProbe sessionId="session-new" />);
      await Promise.resolve();
    });

    expect(renders[0]).toEqual({
      requestedSessionId: 'session-new',
      status: 'loading',
      snapshotSessionId: undefined,
    });
  });

  it('同会话切换团队绑定的首个 render 不组合新绑定与旧成员', async () => {
    const nextRequest = deferred<TeamWorkspaceSnapshot>();
    const reader: TeamWorkspaceProjectionReader = {
      read: vi.fn(({ teamDefinitionId }) => teamDefinitionId === 'team-old'
        ? Promise.resolve(snapshot('session-1', { hasTeam: true }))
        : nextRequest.promise),
    };
    const renders: Array<{
      requestedTeamId: string;
      status: ActiveTeamWorkspaceState['status'];
      snapshotTeamId?: string;
    }> = [];

    function BindingProbe({
      teamDefinitionId,
      teamInstanceId,
    }: {
      teamDefinitionId: string;
      teamInstanceId: string;
    }) {
      const state = useActiveTeamWorkspace({
        sessionId: 'session-1',
        teamDefinitionId,
        teamInstanceId,
        reader,
      });
      renders.push({
        requestedTeamId: teamDefinitionId,
        status: state.status,
        snapshotTeamId: state.snapshot?.activeTeam?.teamDefinitionId,
      });
      return <output data-status={state.status} />;
    }

    await act(async () => {
      root.render(
        <BindingProbe
          teamDefinitionId="team-old"
          teamInstanceId="instance-old"
        />,
      );
      await Promise.resolve();
    });
    renders.length = 0;
    await act(async () => {
      root.render(
        <BindingProbe
          teamDefinitionId="team-new"
          teamInstanceId="instance-new"
        />,
      );
      await Promise.resolve();
    });

    expect(renders[0]).toEqual({
      requestedTeamId: 'team-new',
      status: 'loading',
      snapshotTeamId: undefined,
    });
  });
});
