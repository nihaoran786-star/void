// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ActiveTeamWorkspaceState,
  TeamWorkspaceIssue,
  TeamWorkspaceTeamProjection,
} from '../types';
import { TeamWorkspacePanel } from './TeamWorkspacePanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, values?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'teamWorkspace.ariaLabel': '团队工作区',
        'teamWorkspace.actions.backToTeam': '返回团队',
        'teamWorkspace.actions.retry': '重试',
        'teamWorkspace.actions.close': '关闭团队工作区',
        'teamWorkspace.issueTitle': '需要处理',
        'teamWorkspace.issues.runtime_read_failed': '团队运行状态读取失败。',
        'teamWorkspace.issues.active_team_binding_incomplete': '当前会话的团队绑定信息不完整，请重新选择该团队。',
        'teamWorkspace.issues.bound_team_runtime_missing': '当前会话绑定的团队运行记录不存在，请重试或重新选择团队。',
        'teamWorkspace.issues.bound_team_definition_mismatch': '当前团队与会话绑定不一致，请重新选择团队后再继续。',
        'teamWorkspace.issues.bound_team_projection_missing': '当前团队暂时无法恢复完整状态，请重试。',
        'teamWorkspace.states.disabledTitle': '尚未进入会话',
        'teamWorkspace.states.disabledDescription': '选择一个会话后可查看团队。',
        'teamWorkspace.states.loadingTitle': '正在读取团队',
        'teamWorkspace.states.loadingDescription': '正在恢复成员和流程状态。',
        'teamWorkspace.states.errorTitle': '团队状态加载失败',
        'teamWorkspace.states.errorDescription': '暂时无法读取这个团队，可稍后重试。',
        'teamWorkspace.states.emptyTitle': '还没有召唤团队',
        'teamWorkspace.states.emptyDescription': '从输入框选择一个团队即可开始。',
        'teamWorkspace.overview.title': '当前工作',
        'teamWorkspace.members.title': '团队成员',
        'teamWorkspace.phases.title': '工作阶段',
        'teamWorkspace.roles.lead': '主理人',
        'teamWorkspace.roles.specialist': '专业成员',
        'teamWorkspace.runStatus.running': '运行中',
        'teamWorkspace.memberStatus.not_started': '未开始',
        'teamWorkspace.memberStatus.running': '工作中',
        'teamWorkspace.phaseStatus.running': '进行中',
        'teamWorkspace.phaseKinds.serial': '依次进行',
        'teamWorkspace.delegation.loading': '正在加载委派工作…',
        'teamWorkspace.delegation.partial': '部分委派工作暂不可用',
        'teamWorkspace.delegation.error': '委派工作不可用',
        'teamWorkspace.memberConversation.loadingTitle': '正在打开成员会话',
        'teamWorkspace.memberConversation.loadingDescription': '正在恢复这位成员的工作记录。',
        'teamWorkspace.memberConversation.notStartedTitle': '尚未开始对话',
        'teamWorkspace.memberConversation.notStartedDescription': '这位成员还没有工作记录。团队总管派发任务后，会在这里显示完整对话。',
        'teamWorkspace.memberConversation.failedTitle': '成员任务启动失败',
        'teamWorkspace.memberConversation.failedDescription': '本次派发未建立成员会话。请返回左侧主会话重新派发；团队绑定不会解除。',
      };
      if (key === 'teamWorkspace.members.count') return `${values?.count ?? 0} 人`;
      if (key === 'teamWorkspace.phases.count') return `${values?.count ?? 0} 个`;
      if (key === 'teamWorkspace.members.open') return `查看${values?.name ?? ''}的会话`;
      if (key === 'teamWorkspace.delegation.open') return `打开${values?.name ?? ''}的 Worker 会话`;
      if (key === 'teamWorkspace.delegation.count') return `${values?.count ?? 0} 个分身`;
      if (key === 'teamWorkspace.delegation.toggle') {
        return `展开或收起${values?.name ?? ''}的 ${values?.count ?? 0} 个分身`;
      }
      if (key === 'teamWorkspace.updatedAt') return `更新于 ${values?.value ?? ''}`;
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/flow_chat/components/btw/BtwSessionPanel', () => ({
  BtwSessionPanel: ({
    childSessionId,
    parentSessionId,
    presentationTitle,
    restoreMissingSessionAs,
  }: {
    childSessionId?: string;
    parentSessionId?: string;
    presentationTitle?: string;
    restoreMissingSessionAs?: string;
  }) => (
    <div
      data-testid="member-conversation"
      data-child-session-id={childSessionId}
      data-parent-session-id={parentSessionId}
      data-restore-missing-session-as={restoreMissingSessionAs}
    >
      {presentationTitle}
    </div>
  ),
}));

function activeTeam(): TeamWorkspaceTeamProjection {
  const developerRun = {
    memberRunId: 'member-run-1',
    teamRunId: 'run-1',
    teamInstanceId: 'instance-1',
    memberId: 'developer',
    phaseId: 'build',
    childSessionId: 'child-1',
    attempt: 1,
    status: 'running' as const,
    createdAt: 3,
    updatedAt: 8,
  };
  const phaseRun = {
    phaseRunId: 'phase-run-1',
    teamRunId: 'run-1',
    teamInstanceId: 'instance-1',
    workflowId: 'delivery',
    phaseId: 'build',
    attempt: 1,
    status: 'running' as const,
    createdAt: 3,
    updatedAt: 8,
  };
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
    runtimeRevision: 1,
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
        state: { source: 'runtime', status: 'running', run: developerRun },
        childSessionId: 'child-1',
        delegation: { status: 'ready', tasks: [] },
      },
    ],
    phases: [{
      definition: definition.workflows[0]!.phases[0]!,
      state: { source: 'runtime', status: 'running', run: phaseRun },
    }],
    issues: [],
    updatedAt: Date.UTC(2026, 7, 4, 10, 30),
    isTerminal: false,
  };
}

function readyState(team = activeTeam()): ActiveTeamWorkspaceState {
  return {
    status: 'ready',
    snapshot: {
      status: 'ready',
      parentSessionId: 'parent-1',
      teams: [team],
      activeTeam: team,
      issues: [],
      shouldPoll: true,
    },
    reload: vi.fn(),
  };
}

describe('TeamWorkspacePanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function render(state: ActiveTeamWorkspaceState) {
    await act(async () => {
      root.render(<TeamWorkspacePanel state={state} workspacePath="D:/repo" />);
      await Promise.resolve();
    });
  }

  it('以紧凑作战地图展示团队成员和流程状态,不再渲染冗余说明文字', async () => {
    await render(readyState());

    expect(container.textContent).toContain('软件交付团队');
    expect(container.textContent).not.toContain('完成用户需求');
    expect(container.textContent).not.toContain('研发主理人');
    expect(container.textContent).toContain('开发工程师');
    expect(container.textContent).toContain('实现');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('运行中');
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelector('aside')?.hasAttribute('data-running')).toBe(true);
    expect(container.querySelector('.team-workspace-panel__map-topbar')?.hasAttribute('data-team-drag')).toBe(true);
  });

  it('总管留在左侧主会话，右侧只展示并打开专业成员', async () => {
    await render(readyState());
    const developerButton = container.querySelector<HTMLButtonElement>('button[aria-label="查看开发工程师的会话"]');

    expect(container.querySelector('button[aria-label*="研发主理人"]')).toBeNull();
    expect(developerButton?.disabled).toBe(false);
    await act(async () => {
      developerButton?.click();
      await Promise.resolve();
    });

    const conversation = container.querySelector<HTMLElement>('[data-testid="member-conversation"]');
    expect(conversation?.dataset.childSessionId).toBe('child-1');
    expect(conversation?.dataset.parentSessionId).toBe('parent-1');
    expect(conversation?.dataset.restoreMissingSessionAs).toBe('subagent');
    expect(conversation?.textContent).toBe('开发工程师');
    expect(container.querySelector('.team-workspace-panel__strip')?.hasAttribute('data-team-drag')).toBe(true);
  });

  it('成员对话视图仍保留可见的关闭按钮', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <TeamWorkspacePanel
          state={readyState()}
          selectedMemberId="developer"
          workspacePath="D:/repo"
          onClose={onClose}
        />,
      );
      await Promise.resolve();
    });

    const closeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="关闭团队工作区"]',
    );
    expect(closeButton).not.toBeNull();
    act(() => closeButton?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('成员尚无子会话时仍可点击打开明确的空对话', async () => {
    const team = activeTeam();
    team.members[1] = {
      definition: team.definition.members[1]!,
      state: { source: 'definition', status: 'not_started' },
      delegation: { status: 'ready', tasks: [] },
    };
    await render(readyState(team));

    const developerButton = container.querySelector<HTMLButtonElement>('button[aria-label="查看开发工程师的会话"]');
    expect(developerButton?.disabled).toBe(false);
    await act(async () => {
      developerButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('尚未开始对话');
    expect(container.textContent).toContain('团队总管派发任务后');
    expect(container.querySelector('[data-testid="member-conversation"]')).toBeNull();
  });

  it('成员派发失败且没有子会话时展示失败而不是待命', async () => {
    const team = activeTeam();
    const member = team.members[1]!;
    if (member.state.source !== 'runtime') {
      throw new Error('Expected a runtime-backed member fixture.');
    }
    member.state = {
      source: 'runtime',
      status: 'failed',
      run: {
        ...member.state.run,
        status: 'failed',
        childSessionId: undefined,
        error: {
          source: 'team_runtime_service',
          code: 'adapterrejected',
          message: 'Member launch was rejected.',
          retryable: false,
        },
      },
    };
    member.childSessionId = undefined;

    await render(readyState(team));
    const developerButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="查看开发工程师的会话"]',
    );
    await act(async () => {
      developerButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('成员任务启动失败');
    expect(container.textContent).toContain('请返回左侧主会话重新派发');
    expect(container.textContent).not.toContain('尚未开始对话');
  });

  it('同一成员快照刷新不替换会话 DOM，切换成员时正确更新子会话', async () => {
    const firstState = readyState();
    await act(async () => {
      root.render(
        <TeamWorkspacePanel
          state={firstState}
          selectedMemberId="developer"
          workspacePath="D:/repo"
        />,
      );
      await Promise.resolve();
    });
    const originalConversation = container.querySelector<HTMLElement>(
      '[data-testid="member-conversation"]',
    );
    expect(originalConversation?.dataset.childSessionId).toBe('child-1');

    await act(async () => {
      root.render(
        <TeamWorkspacePanel
          state={readyState()}
          selectedMemberId="developer"
          workspacePath="D:/repo"
        />,
      );
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="member-conversation"]'))
      .toBe(originalConversation);

    const nextTeam = activeTeam();
    const reviewer = {
      ...nextTeam.definition.members[1]!,
      memberId: 'reviewer',
      displayName: '测试工程师',
      professionalRole: '质量保障',
    };
    nextTeam.definition.members.push(reviewer);
    nextTeam.members.push({
      definition: reviewer,
      state: { source: 'definition', status: 'not_started' },
      childSessionId: 'child-2',
      delegation: { status: 'ready', tasks: [] },
    });
    await act(async () => {
      root.render(
        <TeamWorkspacePanel
          state={readyState(nextTeam)}
          selectedMemberId="reviewer"
          workspacePath="D:/repo"
        />,
      );
      await Promise.resolve();
    });

    expect(container.querySelector<HTMLElement>(
      '[data-testid="member-conversation"]',
    )?.dataset.childSessionId).toBe('child-2');
    expect(container.textContent).toContain('测试工程师');
  });

  it('从成员会话返回后恢复到原成员按钮焦点', async () => {
    await render(readyState());
    const developerButton = container.querySelector<HTMLButtonElement>('button[aria-label="查看开发工程师的会话"]')!;
    await act(async () => {
      developerButton.click();
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')?.click();
      await Promise.resolve();
    });

    expect(document.activeElement?.getAttribute('aria-label')).toBe('查看开发工程师的会话');
  });

  it('在成员下递归展示 Worker，并打开 Core 返回的真实子会话', async () => {
    const team = activeTeam();
    team.definition.schemaVersion = 2;
    team.definition.members[1]!.delegationPolicy = {
      kind: 'bounded',
      maxWorkerTasks: 8,
      maxParallelWorkers: 3,
    };
    team.members[1]!.delegation = {
      status: 'ready',
      tasks: [
        {
          taskId: 'worker-1',
          parentSessionId: 'child-1',
          teamInstanceId: 'instance-1',
          memberId: 'developer',
          memberRunId: 'member-run-1',
          childSessionId: 'worker-child-1',
          objective: '实现登录流程',
          owner: '登录工程师',
          status: 'running',
          depth: 1,
          createdAt: 4,
          updatedAt: 5,
        },
        {
          taskId: 'worker-2',
          parentTaskId: 'worker-1',
          parentSessionId: 'worker-child-1',
          teamInstanceId: 'instance-1',
          memberId: 'developer',
          memberRunId: 'member-run-1',
          childSessionId: 'worker-child-2',
          objective: '补齐登录测试',
          owner: '测试 Worker',
          status: 'created',
          depth: 2,
          createdAt: 5,
          updatedAt: 6,
        },
      ],
    };
    await render(readyState(team));

    // Workers stay behind an explicit control on their member, so the map
    // stays readable when several members delegate at once.
    const workerNodes = () => container.querySelectorAll(
      '.team-workspace-panel__node--worker',
    );
    expect(workerNodes()).toHaveLength(0);
    const chip = container.querySelector<HTMLButtonElement>(
      'button[aria-label="展开或收起开发工程师的 2 个分身"]',
    );
    expect(chip?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => {
      chip?.click();
      await Promise.resolve();
    });
    expect(chip?.getAttribute('aria-expanded')).toBe('true');

    expect(workerNodes()).toHaveLength(2);
    expect(container.querySelector('.team-workspace-panel__node--worker[data-depth="2"]')).not.toBeNull();
    const workerButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="打开测试 Worker的 Worker 会话"]',
    );
    await act(async () => {
      workerButton?.click();
      await Promise.resolve();
    });

    const conversation = container.querySelector<HTMLElement>('[data-testid="member-conversation"]');
    expect(conversation?.dataset.childSessionId).toBe('worker-child-2');
    expect(conversation?.dataset.parentSessionId).toBe('worker-child-1');
    expect(conversation?.textContent).toBe('测试 Worker');
  });

  it('在成员节点上明确展示委派加载状态', async () => {
    const team = activeTeam();
    team.members[1]!.delegation = { status: 'loading', tasks: [] };
    await render(readyState(team));

    const stateLabel = container.querySelector('.team-workspace-panel__node-delegation');
    expect(stateLabel?.getAttribute('data-state')).toBe('loading');
    expect(stateLabel?.textContent).toBe('正在加载委派工作…');
    // A member with no readable worker list must not offer the expander.
    expect(container.querySelector('.team-workspace-panel__node-chip')).toBeNull();
  });

  it('主理人是自己的节点，不进成员列', async () => {
    await render(readyState());

    const memberNodes = container.querySelectorAll('[data-testid="team-member-node"]');
    expect(memberNodes).toHaveLength(1);
    const member = memberNodes[0]!;
    expect(member.textContent).toContain('开发工程师');
    expect(member.textContent).toContain('工程师');
    expect(member.textContent).not.toContain('研发主理人');

    const lead = container.querySelector('[data-testid="team-lead-node"]');
    expect(lead?.textContent).toContain('软件交付团队');
    expect(lead?.textContent).toContain('主理人');
    expect(container.querySelector('button[aria-label*="研发主理人"]')).toBeNull();
  });

  it('只有正在执行的节点发光，未派发的成员不发光但仍可点开', async () => {
    const team = activeTeam();
    await render(readyState(team));

    const running = container.querySelector('[data-testid="team-member-node"]');
    expect(running?.hasAttribute('data-live')).toBe(true);
    expect(container.querySelector('[data-testid="team-lead-node"]')?.hasAttribute('data-live'))
      .toBe(true);

    const idle = activeTeam();
    idle.members[1] = {
      definition: idle.definition.members[1]!,
      state: { source: 'definition', status: 'not_started' },
      delegation: { status: 'ready', tasks: [] },
    };
    await render(readyState(idle));

    const node = container.querySelector('[data-testid="team-member-node"]');
    expect(node?.hasAttribute('data-live')).toBe(false);
    // Not glowing is not the same as unavailable: it stays selectable.
    expect(container.querySelector<HTMLButtonElement>(
      'button[aria-label="查看开发工程师的会话"]',
    )?.disabled).toBe(false);
  });

  it('每条连线从上游节点的端口出发，运行中的那条走强调色', async () => {
    await render(readyState());

    const ports = container.querySelectorAll('.team-workspace-panel__node-port');
    expect(ports.length).toBeGreaterThan(0);
    const link = container.querySelector('.team-workspace-panel__map-wires path');
    expect(link?.getAttribute('d')).toMatch(/^M -?[\d.]+ -?[\d.]+ C /);
    expect(link?.classList.contains('is-live')).toBe(true);
  });

  it('错误状态显示本地化恢复信息，重试走注入的 reload', async () => {
    const reload = vi.fn();
    const error: TeamWorkspaceIssue = {
      code: 'runtime_read_failed',
      source: 'projection',
      message: 'raw internal transport details',
      retryable: true,
    };
    await render({ status: 'error', error, reload });

    expect(container.textContent).toContain('团队运行状态读取失败。');
    expect(container.textContent).not.toContain(error.message);
    act(() => container.querySelector<HTMLButtonElement>('button')?.click());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['active_team_binding_incomplete', '当前会话的团队绑定信息不完整，请重新选择该团队。', false],
    ['bound_team_runtime_missing', '当前会话绑定的团队运行记录不存在，请重试或重新选择团队。', true],
    ['bound_team_definition_mismatch', '当前团队与会话绑定不一致，请重新选择团队后再继续。', false],
    ['bound_team_projection_missing', '当前团队暂时无法恢复完整状态，请重试。', true],
  ] as const)('绑定异常 %s 优先于普通空状态', async (code, description, retryable) => {
    const reload = vi.fn();
    const issue: TeamWorkspaceIssue = {
      code,
      source: 'projection',
      message: 'raw internal binding details',
      retryable,
    };
    await render({
      status: 'partial',
      snapshot: {
        status: 'partial',
        parentSessionId: 'parent-1',
        teams: [activeTeam()],
        activeTeam: null,
        issues: [issue],
        shouldPoll: retryable,
      },
      reload,
    });

    expect(container.textContent).toContain(description);
    expect(container.textContent).not.toContain('还没有召唤团队');
    expect(container.textContent).not.toContain(issue.message);
    const retry = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('重试'));
    expect(Boolean(retry)).toBe(retryable);
    if (retry) act(() => retry.click());
    expect(reload).toHaveBeenCalledTimes(retryable ? 1 : 0);
  });

  it('无团队且没有异常时保留普通空状态', async () => {
    await render({
      status: 'ready',
      snapshot: {
        status: 'ready',
        parentSessionId: 'parent-1',
        teams: [],
        activeTeam: null,
        issues: [],
        shouldPoll: false,
      },
      reload: vi.fn(),
    });

    expect(container.textContent).toContain('还没有召唤团队');
    expect(container.textContent).not.toContain('团队状态加载失败');
    expect(container.textContent).not.toContain('重试');
  });

  it('无具体异常的错误状态继续显示通用错误文案', async () => {
    await render({ status: 'error', reload: vi.fn() });

    expect(container.textContent).toContain('暂时无法读取这个团队，可稍后重试。');
    expect(container.textContent).not.toContain('还没有召唤团队');
  });

  it('未选择会话时给出明确空状态且仍有可访问区域名称', async () => {
    await render({ status: 'disabled', reload: vi.fn() });

    expect(container.textContent).toContain('尚未进入会话');
    expect(container.querySelector('aside')?.getAttribute('aria-label')).toBe('团队工作区');
    expect(container.querySelector('aside')?.hasAttribute('data-running')).toBe(false);
  });
});
