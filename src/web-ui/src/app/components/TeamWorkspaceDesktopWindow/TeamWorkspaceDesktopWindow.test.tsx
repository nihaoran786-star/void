// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TeamWorkspaceSnapshot,
  TeamWorkspaceTeamProjection,
} from '@/team_workspace/types';
import type { TeamWorkspaceWindowPresentation } from '@/team_workspace/services/TeamWorkspaceWindowBridge';
import { TeamWorkspaceDesktopWindow } from './TeamWorkspaceDesktopWindow';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const bridgeMock = vi.hoisted(() => ({
  listenTeamWorkspaceBinding: vi.fn(),
  requestTeamWorkspaceBinding: vi.fn(),
}));

const windowServiceMock = vi.hoisted(() => ({
  revealTeamWorkspaceWindow: vi.fn(),
}));

const flowChatManagerMock = vi.hoisted(() => ({
  attachPresentationHost: vi.fn(async () => undefined),
  initialize: vi.fn(async () => undefined),
}));

const projectionMock = vi.hoisted(() => ({
  read: vi.fn(),
}));

const currentWindowMock = vi.hoisted(() => ({
  startDragging: vi.fn(async () => undefined),
  toggleMaximize: vi.fn(async () => undefined),
  isMaximized: vi.fn(async () => false),
  minimize: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => currentWindowMock,
}));
vi.mock('@/infrastructure/runtime', async importOriginal => ({
  ...(await importOriginal<typeof import('@/infrastructure/runtime')>()),
  supportsNativeWindowDragging: () => true,
}));

vi.mock('@/team_workspace/services/TeamWorkspaceWindowBridge', () => bridgeMock);
vi.mock('@/infrastructure/config/services/TeamWorkspaceWindowService', () => windowServiceMock);
vi.mock('@/flow_chat/services/FlowChatManager', () => ({
  flowChatManager: flowChatManagerMock,
}));
vi.mock('@/team_workspace/services/TeamWorkspaceProjectionService', () => ({
  teamWorkspaceProjectionService: projectionMock,
}));

vi.mock('@/flow_chat/components/btw/BtwSessionPanel', () => ({
  BtwSessionPanel: ({
    childSessionId,
    parentSessionId,
    workspacePath,
    presentationTitle,
    restoreMissingSessionAs,
  }: {
    childSessionId?: string;
    parentSessionId?: string;
    workspacePath?: string;
    presentationTitle?: string;
    restoreMissingSessionAs?: string;
  }) => (
    <div
      data-testid="member-conversation"
      data-child-session-id={childSessionId}
      data-parent-session-id={parentSessionId}
      data-workspace-path={workspacePath}
      data-restore-missing-session-as={restoreMissingSessionAs}
    >
      {presentationTitle}
    </div>
  ),
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, values?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'teamWorkspace.ariaLabel': '团队工作区',
        'teamWorkspace.states.loadingTitle': '正在读取团队',
        'teamWorkspace.states.loadingDescription': '正在恢复成员和流程状态。',
        'teamWorkspace.memberStatus.not_started': '未开始',
        'teamWorkspace.memberStatus.running': '工作中',
        'teamWorkspace.memberConversation.notStartedTitle': '尚未开始对话',
        'teamWorkspace.roles.lead': '主理人',
        'teamWorkspace.runStatus.running': '运行中',
        'teamWorkspace.window.unboundTitle': '还没有绑定团队',
        'teamWorkspace.window.unboundDescription': '在主窗口选择一个团队后再打开这个窗口。',
        'teamWorkspace.window.disconnectedTitle': '联系不上主窗口',
        'teamWorkspace.window.disconnectedDescription': '这个窗口还在向主窗口询问要显示哪个团队。',
      };
      if (key === 'teamWorkspace.members.open') return `查看${values?.name ?? ''}的会话`;
      return translations[key] ?? key;
    },
  }),
}));

function buildTeam(overrides: {
  developerChildSessionId?: string | null;
  runtimeRevision?: number;
} = {}): TeamWorkspaceTeamProjection {
  const { developerChildSessionId = 'child-1', runtimeRevision = 1 } = overrides;
  const definition: TeamWorkspaceTeamProjection['definition'] = {
    schemaVersion: 1,
    teamDefinitionId: 'team-1',
    displayName: '软件交付团队',
    description: '负责稳定交付软件。',
    category: '技术工程',
    capabilityTags: ['研发'],
    scenarioEligibility: ['code'],
    leadMemberId: 'lead',
    members: [
      {
        memberId: 'lead',
        displayName: '研发主理人',
        professionalRole: '交付负责人',
        role: 'lead',
        instructions: '负责编排。',
        outputResponsibility: '汇总交付结果。',
        agentId: 'agentic',
        allowedSkillKeys: [],
        allowedToolNames: [],
        permissionPolicy: 'inherit_parent_intersection',
        isReadonly: false,
      },
      {
        memberId: 'developer',
        displayName: '开发工程师',
        professionalRole: '工程师',
        role: 'specialist',
        instructions: '负责实现。',
        outputResponsibility: '提交代码。',
        agentId: 'agentic',
        allowedSkillKeys: [],
        allowedToolNames: [],
        permissionPolicy: 'inherit_parent_intersection',
        isReadonly: false,
      },
      {
        memberId: 'reviewer',
        displayName: '评审工程师',
        professionalRole: '评审',
        role: 'specialist',
        instructions: '负责评审。',
        outputResponsibility: '提交评审意见。',
        agentId: 'agentic',
        allowedSkillKeys: [],
        allowedToolNames: [],
        permissionPolicy: 'inherit_parent_intersection',
        isReadonly: false,
      },
    ],
    workflows: [{
      workflowId: 'delivery',
      displayName: '交付流程',
      triggerDescription: '实现软件需求。',
      phases: [{
        phaseId: 'build',
        displayName: '实现',
        kind: 'serial',
        dependsOnPhaseIds: [],
        assignedMemberIds: ['developer'],
        expectedOutputs: ['代码'],
        completionRule: '测试通过。',
      }],
    }],
    collaborationPolicy: 'lead_mediated',
    permissionPolicy: 'inherit_parent_intersection',
    origin: 'project',
  };

  return {
    teamInstanceId: 'instance-1',
    teamDefinitionId: 'team-1',
    teamDefinitionRevision: 'revision-1',
    runtimeRevision,
    definition,
    lifecycle: 'ready',
    activeRun: {
      source: 'runtime',
      status: 'running',
      run: {
        teamRunId: 'run-1',
        teamInstanceId: 'instance-1',
        workflowId: 'delivery',
        objective: '完成用户需求',
        parentDialogTurnId: 'turn-1',
        parentToolCallId: 'call-1',
        attempt: 1,
        status: 'running',
        createdAt: 2,
        updatedAt: 9,
      },
      workflow: definition.workflows[0]!,
    },
    members: [
      {
        definition: definition.members[0]!,
        state: { source: 'definition', status: 'not_started' },
        delegation: { status: 'ready', tasks: [] },
      },
      {
        definition: definition.members[1]!,
        state: developerChildSessionId
          ? {
              source: 'runtime',
              status: 'running',
              run: {
                memberRunId: 'member-run-1',
                teamRunId: 'run-1',
                teamInstanceId: 'instance-1',
                memberId: 'developer',
                phaseId: 'build',
                childSessionId: developerChildSessionId,
                attempt: 1,
                status: 'running',
                createdAt: 3,
                updatedAt: 8,
              },
            }
          : { source: 'definition', status: 'not_started' },
        ...(developerChildSessionId
          ? { childSessionId: developerChildSessionId }
          : {}),
        delegation: { status: 'ready', tasks: [] },
      },
      {
        // Never dispatched yet: must still be visible and selectable.
        definition: definition.members[2]!,
        state: { source: 'definition', status: 'not_started' },
        delegation: { status: 'ready', tasks: [] },
      },
    ],
    phases: [{
      definition: definition.workflows[0]!.phases[0]!,
      state: {
        source: 'runtime',
        status: 'running',
        run: {
          phaseRunId: 'phase-run-1',
          teamRunId: 'run-1',
          teamInstanceId: 'instance-1',
          workflowId: 'delivery',
          phaseId: 'build',
          attempt: 1,
          status: 'running',
          createdAt: 3,
          updatedAt: 8,
        },
      },
    }],
    issues: [],
    updatedAt: Date.UTC(2026, 7, 4, 10, 30),
    isTerminal: false,
  };
}

function snapshot(
  team = buildTeam(),
  shouldPoll = false,
): TeamWorkspaceSnapshot {
  return {
    status: 'ready',
    parentSessionId: 'parent-1',
    teams: [team],
    activeTeam: team,
    issues: [],
    shouldPoll,
  };
}

function readyBinding(sequence = 1): TeamWorkspaceWindowPresentation {
  return {
    status: 'ready',
    sequence,
    binding: {
      parentSessionId: 'parent-1',
      workspacePath: 'D:/repo',
      teamDefinitionId: 'team-1',
      teamInstanceId: 'instance-1',
      bindingKey: 'binding-1',
      refreshKey: 'refresh-1',
    },
  };
}

describe('TeamWorkspaceDesktopWindow', () => {
  let container: HTMLDivElement;
  let root: Root;
  let deliverBinding: ((presentation: TeamWorkspaceWindowPresentation) => void) | null;
  let unlistenBinding: ReturnType<typeof vi.fn>;

  const flush = async () => {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  };

  const mount = async () => {
    await act(async () => {
      root.render(<TeamWorkspaceDesktopWindow />);
      await flush();
    });
  };

  const send = async (presentation: TeamWorkspaceWindowPresentation) => {
    await act(async () => {
      deliverBinding?.(presentation);
      await flush();
    });
  };

  const memberButton = (name: string) => container.querySelector<HTMLButtonElement>(
    `button[aria-label="查看${name}的会话"]`,
  );

  beforeEach(() => {
    deliverBinding = null;
    unlistenBinding = vi.fn();
    bridgeMock.listenTeamWorkspaceBinding.mockImplementation(
      (handler: (presentation: TeamWorkspaceWindowPresentation) => void) => {
        deliverBinding = handler;
        return Promise.resolve(unlistenBinding);
      },
    );
    bridgeMock.requestTeamWorkspaceBinding.mockResolvedValue(undefined);
    windowServiceMock.revealTeamWorkspaceWindow.mockResolvedValue(undefined);
    flowChatManagerMock.attachPresentationHost.mockResolvedValue(undefined);
    projectionMock.read.mockResolvedValue(snapshot());
    currentWindowMock.startDragging.mockClear();
    currentWindowMock.toggleMaximize.mockClear();
    currentWindowMock.minimize.mockClear();
    currentWindowMock.close.mockClear();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    bridgeMock.listenTeamWorkspaceBinding.mockReset();
    bridgeMock.requestTeamWorkspaceBinding.mockReset();
    windowServiceMock.revealTeamWorkspaceWindow.mockReset();
    flowChatManagerMock.attachPresentationHost.mockReset();
    flowChatManagerMock.initialize.mockReset();
    projectionMock.read.mockReset();
  });

  it('stays blank and asks for the binding until the main window answers', async () => {
    await mount();

    expect(container.textContent).toBe('');
    expect(container.querySelector('main')?.getAttribute('aria-hidden')).toBe('true');
    expect(bridgeMock.requestTeamWorkspaceBinding).toHaveBeenCalled();
    // Nothing is revealed, read, or attached before an identity exists.
    expect(windowServiceMock.revealTeamWorkspaceWindow).not.toHaveBeenCalled();
    expect(projectionMock.read).not.toHaveBeenCalled();
    expect(flowChatManagerMock.attachPresentationHost).not.toHaveBeenCalled();
  });

  it('reveals the native window exactly once, after the first presentation', async () => {
    await mount();
    expect(windowServiceMock.revealTeamWorkspaceWindow).not.toHaveBeenCalled();

    await send(readyBinding(1));
    expect(windowServiceMock.revealTeamWorkspaceWindow).toHaveBeenCalledTimes(1);

    await send(readyBinding(2));
    expect(windowServiceMock.revealTeamWorkspaceWindow).toHaveBeenCalledTimes(1);
  });

  it('never stays invisible when the main window never answers', async () => {
    vi.useFakeTimers();
    await mount();
    expect(windowServiceMock.revealTeamWorkspaceWindow).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_500);
      await flush();
    });

    // The window shows itself and says why, instead of hiding forever.
    expect(windowServiceMock.revealTeamWorkspaceWindow).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('联系不上主窗口');
    expect(bridgeMock.requestTeamWorkspaceBinding.mock.calls.length).toBeGreaterThan(1);

    // A late binding still upgrades the visible state in place.
    await act(async () => {
      deliverBinding?.(readyBinding(1));
      await flush();
    });
    expect(container.textContent).toContain('软件交付团队');
    expect(container.textContent).not.toContain('联系不上主窗口');
  });

  it('shows itself immediately when the event transport is unusable', async () => {
    bridgeMock.listenTeamWorkspaceBinding.mockImplementation(
      (handler: (presentation: TeamWorkspaceWindowPresentation) => void) => {
        handler({ status: 'unavailable', sequence: 0, reason: 'transport-unavailable' });
        return Promise.resolve(unlistenBinding);
      },
    );

    await mount();

    expect(container.textContent).toContain('联系不上主窗口');
    expect(windowServiceMock.revealTeamWorkspaceWindow).toHaveBeenCalledTimes(1);
    expect(projectionMock.read).not.toHaveBeenCalled();
  });

  it('shows an explicit unbound state rather than an empty frame', async () => {
    await mount();
    await send({ status: 'unavailable', sequence: 1, reason: 'no-team-binding' });

    expect(container.textContent).toContain('还没有绑定团队');
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(projectionMock.read).not.toHaveBeenCalled();
    expect(windowServiceMock.revealTeamWorkspaceWindow).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale binding event delivered after a newer one', async () => {
    await mount();
    await send(readyBinding(5));
    expect(container.textContent).toContain('软件交付团队');

    await send({ status: 'unavailable', sequence: 4, reason: 'no-active-session' });

    expect(container.textContent).toContain('软件交付团队');
    expect(container.textContent).not.toContain('还没有绑定团队');
  });

  it('reads the team through the same typed projection the in-app panel used', async () => {
    await mount();
    await send(readyBinding());

    expect(projectionMock.read).toHaveBeenCalledWith({
      parentSessionId: 'parent-1',
      workspacePath: 'D:/repo',
      teamDefinitionId: 'team-1',
      teamInstanceId: 'instance-1',
    });
    // Live events only — no session discovery or selection in this host.
    expect(flowChatManagerMock.attachPresentationHost)
      .toHaveBeenCalledExactlyOnceWith('D:/repo');
    expect(flowChatManagerMock.initialize).not.toHaveBeenCalled();
  });

  it('keeps the lead in the main conversation and never repeats it here', async () => {
    await mount();
    await send(readyBinding());

    expect(container.textContent).toContain('软件交付团队');
    expect(container.textContent).not.toContain('研发主理人');
    expect(memberButton('研发主理人')).toBeNull();
    expect(memberButton('开发工程师')).not.toBeNull();
  });

  it('shows a never-dispatched specialist as explicitly selectable', async () => {
    await mount();
    await send(readyBinding());

    const reviewer = memberButton('评审工程师');
    expect(reviewer).not.toBeNull();
    expect(reviewer?.disabled).toBe(false);

    await act(async () => {
      reviewer?.click();
      await flush();
    });

    expect(container.textContent).toContain('尚未开始对话');
    expect(container.querySelector('[data-testid="member-conversation"]')).toBeNull();
  });

  it('opens a member conversation as its existing /btw child session', async () => {
    await mount();
    await send(readyBinding());

    await act(async () => {
      memberButton('开发工程师')?.click();
      await flush();
    });

    const conversation = container.querySelector<HTMLElement>(
      '[data-testid="member-conversation"]',
    );
    expect(conversation?.dataset.childSessionId).toBe('child-1');
    expect(conversation?.dataset.parentSessionId).toBe('parent-1');
    expect(conversation?.dataset.workspacePath).toBe('D:/repo');
    expect(conversation?.dataset.restoreMissingSessionAs).toBe('subagent');
  });

  it('exposes the team region and its run status to assistive technology', async () => {
    await mount();
    await send(readyBinding());

    const region = container.querySelector('aside[aria-label="团队工作区"]');
    expect(region).not.toBeNull();
    expect(region?.hasAttribute('data-running')).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('运行中');
  });

  it('loads once, then keeps the member conversation mounted across equivalent polls', async () => {
    vi.useFakeTimers();
    projectionMock.read.mockResolvedValue(snapshot(buildTeam(), true));

    await mount();
    await send(readyBinding());
    expect(container.textContent).not.toContain('正在读取团队');

    await act(async () => {
      memberButton('开发工程师')?.click();
      await flush();
    });
    const first = container.querySelector('[data-testid="member-conversation"]');
    expect(first).not.toBeNull();

    const readsBeforePoll = projectionMock.read.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
      await flush();
    });

    expect(projectionMock.read.mock.calls.length).toBeGreaterThan(readsBeforePoll);
    expect(container.textContent).not.toContain('正在读取团队');
    // Same DOM node: an equivalent snapshot must not remount or flash.
    expect(container.querySelector('[data-testid="member-conversation"]')).toBe(first);
  });

  it('draws its own top bar and drives the window from it', async () => {
    await mount();
    await send(readyBinding());

    const titleBar = container.querySelector<HTMLElement>(
      '[data-testid="team-window-title-bar"]',
    );
    expect(titleBar).not.toBeNull();
    expect(titleBar?.textContent).toContain('软件交付团队');

    await act(async () => {
      titleBar?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      await flush();
    });
    expect(currentWindowMock.startDragging).toHaveBeenCalledTimes(1);

    // Closing goes through the native close path the host already intercepts,
    // so the Team run and its child sessions are untouched.
    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="team-window-close"]',
      )?.click();
      await flush();
    });
    expect(currentWindowMock.close).toHaveBeenCalledTimes(1);
    expect(currentWindowMock.startDragging).toHaveBeenCalledTimes(1);
  });

  it('stops listening for bindings when the window is torn down', async () => {
    await mount();
    await send(readyBinding());

    act(() => root.unmount());
    expect(unlistenBinding).toHaveBeenCalledTimes(1);

    root = createRoot(container);
  });
});
