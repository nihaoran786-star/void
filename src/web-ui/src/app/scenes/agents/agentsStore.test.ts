import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentsStore } from './agentsStore';

const hookApi = vi.hoisted(() => ({
  getAvailableModes: vi.fn(async () => []),
  listSubagents: vi.fn(),
  listManageableSubagents: vi.fn(async () => []),
  updateSubagentConfig: vi.fn(async () => ({
    availabilityUpdated: true,
    modelUpdated: false,
  })),
  getAllToolsInfo: vi.fn(async () => []),
  getAgentProfileConfigs: vi.fn(async () => ({})),
  getModeSkillConfigs: vi.fn(async () => []),
}));

vi.mock('@/infrastructure/api/service-api/AgentAPI', () => ({
  agentAPI: {
    getAvailableModes: hookApi.getAvailableModes,
  },
}));

vi.mock('@/infrastructure/api/service-api/SubagentAPI', () => ({
  SubagentAPI: {
    listSubagents: hookApi.listSubagents,
    listManageableSubagents: hookApi.listManageableSubagents,
    updateSubagentConfig: hookApi.updateSubagentConfig,
  },
}));

vi.mock('@/infrastructure/api/service-api/ToolAPI', () => ({
  toolAPI: {
    getAllToolsInfo: hookApi.getAllToolsInfo,
  },
}));

vi.mock('@/infrastructure/api/service-api/ConfigAPI', () => ({
  configAPI: {
    getAgentProfileConfigs: hookApi.getAgentProfileConfigs,
    getModeSkillConfigs: hookApi.getModeSkillConfigs,
  },
}));

vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useCurrentWorkspace: () => ({ workspacePath: 'D:/workspace/catalog-refresh' }),
}));

vi.mock('@/shared/notification-system', () => ({
  useNotification: () => ({ error: vi.fn() }),
}));

vi.mock('@/shared/services/reviewTeamService', () => ({
  loadDefaultReviewTeamDefinition: vi.fn(async () => undefined),
}));

describe('agentsStore catalog view', () => {
  beforeEach(() => {
    useAgentsStore.setState({
      page: 'home',
      catalogView: 'agents',
      agentEditorMode: 'create',
      editingAgentKey: null,
      editingAgentId: null,
      teamEditorMode: 'create',
      editingTeamDefinitionId: null,
      editingTeamLevel: null,
      catalogRefreshRevision: 0,
    });
  });

  it('切换智能体和团队目录不破坏原有子页面状态动作', () => {
    useAgentsStore.getState().setCatalogView('teams');
    useAgentsStore.getState().openCreateAgent();
    expect(useAgentsStore.getState()).toEqual(expect.objectContaining({
      catalogView: 'teams',
      page: 'createAgent',
    }));

    useAgentsStore.getState().openHome();
    expect(useAgentsStore.getState()).toEqual(expect.objectContaining({
      catalogView: 'teams',
      page: 'home',
    }));

    useAgentsStore.getState().openReviewTeam();
    expect(useAgentsStore.getState()).toEqual(expect.objectContaining({
      catalogView: 'teams',
      page: 'reviewTeam',
    }));
  });

  it('用单调 revision 通知已挂载目录重新加载', () => {
    expect(useAgentsStore.getState().catalogRefreshRevision).toBe(0);

    useAgentsStore.getState().requestCatalogRefresh();
    useAgentsStore.getState().requestCatalogRefresh();

    expect(useAgentsStore.getState().catalogRefreshRevision).toBe(2);
  });

  it('保存来源限定 key 和运行时 id 作为独立编辑身份', () => {
    useAgentsStore.getState().openEditAgent(
      'project::void::shared-agent',
      'shared-agent',
    );

    expect(useAgentsStore.getState()).toEqual(expect.objectContaining({
      page: 'createAgent',
      agentEditorMode: 'edit',
      editingAgentKey: 'project::void::shared-agent',
      editingAgentId: 'shared-agent',
    }));
  });

  it('用稳定定义 ID 和层级打开团队编辑页', () => {
    useAgentsStore.getState().openEditTeam(
      'custom-0123456789abcdef0123456789abcdef',
      'project',
    );

    expect(useAgentsStore.getState()).toEqual(expect.objectContaining({
      page: 'teamAuthoring',
      catalogView: 'teams',
      teamEditorMode: 'edit',
      editingTeamDefinitionId: 'custom-0123456789abcdef0123456789abcdef',
      editingTeamLevel: 'project',
    }));

    useAgentsStore.getState().openHome();
    expect(useAgentsStore.getState()).toEqual(expect.objectContaining({
      page: 'home',
      editingTeamDefinitionId: null,
      editingTeamLevel: null,
    }));
  });
});

let JSDOMCtor: (new (
  html?: string,
  options?: { pretendToBeVisual?: boolean; url?: string },
) => { window: Window & typeof globalThis }) | null = null;

try {
  const jsdom = await import('jsdom');
  JSDOMCtor = jsdom.JSDOM as typeof JSDOMCtor;
} catch {
  JSDOMCtor = null;
}

const describeWithJsdom = JSDOMCtor ? describe : describe.skip;

describeWithJsdom('useAgentsList catalog refresh', () => {
  let dom: { window: Window & typeof globalThis };
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOMCtor!('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost',
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Text', dom.window.Text);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useAgentsStore.setState({ catalogRefreshRevision: 0 });
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('reloads on a refresh revision and ignores the older in-flight response', async () => {
    type SubagentList = Awaited<ReturnType<
      typeof import('@/infrastructure/api/service-api/SubagentAPI').SubagentAPI.listSubagents
    >>;
    let resolveFirst: (value: SubagentList) => void = () => undefined;
    const firstResponse = new Promise<SubagentList>((resolve) => {
      resolveFirst = resolve;
    });
    const subagent = (id: string) => ({
      key: `user::void::${id}`,
      id,
      name: id,
      description: `${id} description`,
      isReadonly: true,
      isReview: false,
      toolCount: 0,
      defaultTools: [],
      defaultEnabled: true,
      effectiveEnabled: true,
      subagentSource: 'user' as const,
    });
    hookApi.listSubagents
      .mockReset()
      .mockResolvedValue([])
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce([subagent('newer-agent')]);

    const { useAgentsList } = await import('./hooks/useAgentsList');
    const translate = ((key: string) => key) as never;
    let latestIds: string[] = [];
    const Probe = () => {
      const result = useAgentsList({
        searchQuery: '',
        filterLevel: 'all',
        filterType: 'all',
        t: translate,
      });
      latestIds = result.allAgents.map((agent) => agent.id);
      return null;
    };

    await act(async () => {
      root.render(React.createElement(Probe));
      await Promise.resolve();
    });
    expect(hookApi.listSubagents).toHaveBeenCalledTimes(1);

    await act(async () => {
      useAgentsStore.getState().requestCatalogRefresh();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hookApi.listSubagents).toHaveBeenCalledTimes(2);

    for (let index = 0; index < 10 && !latestIds.includes('newer-agent'); index += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(latestIds).toEqual(['newer-agent']);

    await act(async () => {
      resolveFirst([subagent('stale-agent')]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latestIds).toEqual(['newer-agent']);
  });

  it('keeps same-id user and project cards independent by canonical key', async () => {
    const shared = (key: string, source: 'user' | 'project') => ({
      key,
      id: 'shared-agent',
      name: `${source} agent`,
      description: `${source} description`,
      isReadonly: true,
      isReview: false,
      toolCount: 0,
      defaultTools: [],
      defaultEnabled: true,
      effectiveEnabled: true,
      subagentSource: source,
    });
    hookApi.listSubagents
      .mockReset()
      .mockResolvedValue([
        shared('user::void::shared-agent', 'user'),
        shared('project::void::shared-agent', 'project'),
      ]);

    const { useAgentsList } = await import('./hooks/useAgentsList');
    const translate = ((key: string) => key) as never;
    let identities: string[] = [];
    const Probe = () => {
      const result = useAgentsList({
        searchQuery: '',
        filterLevel: 'all',
        filterType: 'all',
        t: translate,
      });
      identities = result.allAgents.map((agent) => agent.key);
      return null;
    };

    await act(async () => {
      root.render(React.createElement(Probe));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(identities).toEqual([
      'user::void::shared-agent',
      'project::void::shared-agent',
    ]);
  });

  it('updates availability with both canonical key and runtime id', async () => {
    const projectSubagent = {
      key: 'project::void::shared-agent',
      id: 'shared-agent',
      name: 'Project Shared',
      description: 'Project description',
      isReadonly: true,
      isReview: false,
      toolCount: 0,
      defaultTools: [],
      defaultEnabled: true,
      effectiveEnabled: true,
      subagentSource: 'project' as const,
    };
    hookApi.getAvailableModes.mockResolvedValueOnce([{
      id: 'agentic',
      name: 'Agentic',
      description: 'Agentic mode',
      isReadonly: false,
      toolCount: 1,
      defaultTools: ['Task'],
      configProfileId: 'agentic',
      configProfileMemberModeIds: ['agentic'],
    }]);
    hookApi.listSubagents.mockResolvedValueOnce([]);
    hookApi.listManageableSubagents.mockResolvedValue([projectSubagent]);

    const { useAgentsList } = await import('./hooks/useAgentsList');
    const translate = ((key: string) => key) as never;
    let setSubagentEnabled: ReturnType<typeof useAgentsList>['handleSetSubagentEnabled']
      = async () => undefined;
    const Probe = () => {
      const result = useAgentsList({
        searchQuery: '',
        filterLevel: 'all',
        filterType: 'all',
        t: translate,
      });
      setSubagentEnabled = result.handleSetSubagentEnabled;
      return null;
    };

    await act(async () => {
      root.render(React.createElement(Probe));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await setSubagentEnabled('agentic', projectSubagent, false);
    });

    expect(hookApi.updateSubagentConfig).toHaveBeenCalledWith({
      subagentKey: 'project::void::shared-agent',
      subagentId: 'shared-agent',
      parentAgentType: 'agentic',
      enabled: false,
      workspacePath: 'D:/workspace/catalog-refresh',
    });
  });
});
