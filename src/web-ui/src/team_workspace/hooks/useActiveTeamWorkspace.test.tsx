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
});
