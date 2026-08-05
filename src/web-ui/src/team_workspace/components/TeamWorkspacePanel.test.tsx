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
        'teamWorkspace.memberConversation.loadingTitle': '正在打开成员会话',
        'teamWorkspace.memberConversation.loadingDescription': '正在恢复这位成员的工作记录。',
      };
      if (key === 'teamWorkspace.members.count') return `${values?.count ?? 0} 人`;
      if (key === 'teamWorkspace.phases.count') return `${values?.count ?? 0} 个`;
      if (key === 'teamWorkspace.members.open') return `查看${values?.name ?? ''}的会话`;
      if (key === 'teamWorkspace.members.unavailable') return `${values?.name ?? ''}尚无子会话`;
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
  }: {
    childSessionId?: string;
    parentSessionId?: string;
    presentationTitle?: string;
  }) => (
    <div
      data-testid="member-conversation"
      data-child-session-id={childSessionId}
      data-parent-session-id={parentSessionId}
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
      },
      {
        definition: definition.members[1]!,
        state: { source: 'runtime', status: 'running', run: developerRun },
        childSessionId: 'child-1',
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

  it('以紧凑总览展示团队、成员和流程状态', async () => {
    await render(readyState());

    expect(container.textContent).toContain('软件交付团队');
    expect(container.textContent).toContain('完成用户需求');
    expect(container.textContent).toContain('研发主理人');
    expect(container.textContent).toContain('开发工程师');
    expect(container.textContent).toContain('实现');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('运行中');
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it('只有已有子会话的成员可进入，并复用 BTW 面板展示真实会话', async () => {
    await render(readyState());
    const leadButton = container.querySelector<HTMLButtonElement>('button[aria-label="研发主理人尚无子会话"]');
    const developerButton = container.querySelector<HTMLButtonElement>('button[aria-label="查看开发工程师的会话"]');

    expect(leadButton?.disabled).toBe(true);
    expect(developerButton?.disabled).toBe(false);
    await act(async () => {
      developerButton?.click();
      await Promise.resolve();
    });

    const conversation = container.querySelector<HTMLElement>('[data-testid="member-conversation"]');
    expect(conversation?.dataset.childSessionId).toBe('child-1');
    expect(conversation?.dataset.parentSessionId).toBe('parent-1');
    expect(conversation?.textContent).toBe('开发工程师');
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
  });
});
