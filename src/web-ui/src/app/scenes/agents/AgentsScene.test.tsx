import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useAgentsStore } from './agentsStore';

const sceneFixture = vi.hoisted(() => ({
  agents: [] as Array<Record<string, unknown>>,
  runtimeSupported: true,
  listHookCalls: 0,
}));

vi.mock('@/shared/services/customization/CustomizationRuntimeCapabilityService', () => ({
  customizationRuntimeCapabilityService: {
    getCapability: () => sceneFixture.runtimeSupported
      ? { status: 'supported', transport: 'tauri' }
      : {
          status: 'unsupported',
          transport: 'websocket',
          reason: 'server_runtime_deferred',
        },
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('./components/ReviewTeamPage', () => ({
  default: () => <div data-testid="review-team-page">review team</div>,
  ReviewTeamErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./components/CreateAgentPage', () => ({
  default: () => <div data-testid="create-agent-page">create agent</div>,
}));

vi.mock('./components/TeamAuthoringPage', () => ({
  default: () => <div data-testid="team-authoring-page">team authoring</div>,
}));

vi.mock('./components/AgentCard', () => ({
  default: ({
    agent,
    onOpenDetails,
  }: {
    agent: { key: string; displayName: string };
    onOpenDetails: (agent: unknown) => void;
  }) => (
    <button
      type="button"
      data-testid={`agent-card-${agent.key}`}
      onClick={() => onOpenDetails(agent)}
    >
      {agent.displayName}
    </button>
  ),
}));

vi.mock('./components/AgentTeamCard', () => ({
  default: () => <div />,
}));

vi.mock('./components/TeamsCatalogView', () => ({
  default: () => <div data-testid="teams-catalog-view">teams</div>,
}));

vi.mock('./components/CoreAgentCard', () => ({
  default: () => <div />,
}));

vi.mock('@/component-library', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  IconButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  Search: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={placeholder}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  ),
  Switch: () => <input type="checkbox" readOnly />,
  confirmDanger: vi.fn(async () => false),
}));

vi.mock('@/app/components', () => ({
  GalleryDetailModal: ({
    children,
    title,
    actions,
  }: {
    children: React.ReactNode;
    title?: string;
    actions?: React.ReactNode;
  }) => <div><h2 data-testid="agent-detail-title">{title}</h2>{children}{actions}</div>,
  GalleryEmpty: () => <div />,
  GalleryGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  GalleryLayout: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <main className={className}>{children}</main>
  ),
  GalleryPageHeader: () => <header />,
  GallerySkeleton: () => <div />,
  GalleryZone: ({
    children,
    id,
  }: {
    children: React.ReactNode;
    id?: string;
  }) => <section id={id}>{children}</section>,
}));

vi.mock('./hooks/useAgentsList', () => ({
  useAgentsList: () => {
    sceneFixture.listHookCalls += 1;
    return {
      allAgents: sceneFixture.agents,
      filteredAgents: sceneFixture.agents,
      loading: false,
      availableTools: [],
      getModeProfile: () => null,
      getModeSkills: () => [],
      getModeManageableSubagents: () => [],
      counts: { builtin: 0, user: 0, project: 0, mode: 0, subagent: 0 },
      hiddenAgentIds: new Set<string>(),
      loadAgents: vi.fn(),
      getModeConfig: () => undefined,
      handleSetTools: vi.fn(),
      handleResetTools: vi.fn(),
      handleSetSkills: vi.fn(),
      handleResetSkills: vi.fn(),
      handleSetSubagentEnabled: vi.fn(),
    };
  },
}));

vi.mock('@/app/hooks/useGallerySceneAutoRefresh', () => ({
  useGallerySceneAutoRefresh: vi.fn(),
}));

vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useCurrentWorkspace: () => ({
    workspace: {
      id: 'workspace-1',
      name: 'Project',
      rootPath: 'D:/workspace/project',
    },
    workspacePath: 'D:/workspace/project',
  }),
}));

vi.mock('@/shared/notification-system', () => ({
  useNotification: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/infrastructure/api/service-api/SubagentAPI', () => ({
  SubagentAPI: {
    deleteSubagent: vi.fn(),
  },
}));

vi.mock('@/shared/services/reviewTeamService', () => ({
  loadDefaultReviewTeam: vi.fn(async () => null),
}));

let JSDOMCtor: (new (
  html?: string,
  options?: { pretendToBeVisual?: boolean }
) => { window: Window & typeof globalThis }) | null = null;

try {
  const jsdom = await import('jsdom');
  JSDOMCtor = jsdom.JSDOM as typeof JSDOMCtor;
} catch {
  JSDOMCtor = null;
}

const describeWithJsdom = JSDOMCtor ? describe : describe.skip;

describeWithJsdom('AgentsScene', () => {
  let dom: { window: Window & typeof globalThis };
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOMCtor!('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost',
    });

    const { window } = dom;
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', window.document);
    vi.stubGlobal('navigator', window.navigator);
    vi.stubGlobal('HTMLElement', window.HTMLElement);
    vi.stubGlobal('MutationObserver', window.MutationObserver);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    useAgentsStore.getState().openHome();
    useAgentsStore.getState().setCatalogView('agents');
    useAgentsStore.getState().setSearchQuery('');
    sceneFixture.agents = [];
    sceneFixture.runtimeSupported = true;
    sceneFixture.listHookCalls = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
    useAgentsStore.getState().openHome();
    useAgentsStore.getState().setCatalogView('agents');
    useAgentsStore.getState().setSearchQuery('');
  });

  it('keeps the review team detail page inside a full-height scene page wrapper', async () => {
    useAgentsStore.getState().openReviewTeam();
    const { default: AgentsScene } = await import('./AgentsScene');

    await act(async () => {
      root.render(<AgentsScene />);
    });

    expect(container.querySelector('[data-testid="review-team-page"]')).toBeTruthy();
    expect(container.querySelector('.void-agents-scene--page')).toBeTruthy();
  });

  it('keeps agent subpages stretched across the active scene viewport', () => {
    const stylesheet = readFileSync(
      fileURLToPath(new URL('./AgentsScene.scss', import.meta.url)),
      'utf8',
    );

    expect(stylesheet).toContain('width: 100%;');
    expect(stylesheet).toContain('flex: 1 1 auto;');
    expect(stylesheet).toContain('min-width: 0;');
  });

  it('imports presentation helpers directly without loading runtime adapters', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./AgentsScene.tsx', import.meta.url)),
      'utf8',
    );

    expect(source).toContain(
      "@/shared/services/customization/presentationMetadata",
    );
    expect(source).toContain(
      "@/shared/services/customization/skillCatalogPresentation",
    );
    expect(source).not.toContain(
      "from '@/shared/services/customization';",
    );
    expect(source).not.toContain('CustomizationTopNav');
    expect(source).not.toContain('<CustomizationTopNav');
  });

  it('在统一目录中切换团队视图且不进入旧子页面', async () => {
    useAgentsStore.getState().setCatalogView('teams');
    const { default: AgentsScene } = await import('./AgentsScene');

    await act(async () => {
      root.render(<AgentsScene />);
    });

    expect(container.querySelector('[data-testid="customization-top-nav"]')).toBeNull();
    expect(container.querySelector('[data-testid="teams-catalog-view"]')).toBeTruthy();
    expect(useAgentsStore.getState().page).toBe('home');
  });

  it('让团队创建编辑页保持在统一定制外壳内', async () => {
    useAgentsStore.getState().openCreateTeam();
    const { default: AgentsScene } = await import('./AgentsScene');

    await act(async () => {
      root.render(<AgentsScene />);
    });

    expect(container.querySelector('[data-testid="customization-top-nav"]')).toBeNull();
    expect(container.querySelector('[data-testid="team-authoring-page"]')).toBeTruthy();
    expect(container.querySelector('.void-agents-scene--page')).toBeTruthy();
  });

  it('用 canonical key 独立选择同运行时 ID 的 User 和 Project 卡片', async () => {
    const sharedAgent = (key: string, source: 'user' | 'project', displayName: string) => ({
      key,
      id: 'shared-agent',
      name: displayName,
      displayName,
      description: `${displayName} description`,
      displayDescription: `${displayName} description`,
      aliases: [],
      isReadonly: true,
      isReview: false,
      toolCount: 0,
      defaultTools: [],
      defaultEnabled: true,
      effectiveEnabled: true,
      subagentSource: source,
      capabilities: [],
      agentKind: 'subagent',
    });
    sceneFixture.agents = [
      sharedAgent('user::void::shared-agent', 'user', 'User Shared'),
      sharedAgent('project::void::shared-agent', 'project', 'Project Shared'),
    ];
    const { default: AgentsScene } = await import('./AgentsScene');

    await act(async () => {
      root.render(<AgentsScene />);
    });
    const projectCard = container.querySelector<HTMLButtonElement>(
      '[data-testid="agent-card-project::void::shared-agent"]',
    );
    expect(projectCard).toBeTruthy();
    await act(async () => {
      projectCard!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="agent-detail-title"]')?.textContent)
      .toBe('Project Shared');
  });

  it('从智能体详情派发到带 Persona 的新会话', async () => {
    const agent = {
      key: 'user::void::designer',
      id: 'designer',
      name: 'Designer',
      displayName: '视觉设计智能体',
      description: '负责视觉设计。',
      displayDescription: '负责视觉设计。',
      aliases: [],
      isReadonly: false,
      isReview: false,
      toolCount: 1,
      defaultTools: [],
      defaultEnabled: true,
      effectiveEnabled: true,
      subagentSource: 'user',
      capabilities: [],
      agentKind: 'subagent',
      catalogEntry: {
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
        scenarioEligibility: ['media'],
        tags: ['agent'],
        availability: { status: 'available' },
        agentKind: 'subagent',
        executionPolicyEligibility: [],
        isReadonly: false,
        toolCount: 1,
        activationSupport: 'parent_persona',
      },
    };
    sceneFixture.agents = [agent];
    const taskDispatcher = { dispatch: vi.fn(async () => ({
      scenario: 'media' as const,
      executionPolicy: 'Media',
      action: 'draft_opened' as const,
    })) };
    const { default: AgentsScene } = await import('./AgentsScene');

    await act(async () => {
      root.render(<AgentsScene taskDispatcher={taskDispatcher} />);
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="agent-card-user::void::designer"]',
      )!.click();
    });
    const dispatchButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('agentCard.actions.dispatchTask'));
    expect(dispatchButton).toBeTruthy();
    await act(async () => {
      dispatchButton!.click();
      await Promise.resolve();
    });

    expect(taskDispatcher.dispatch).toHaveBeenCalledWith({
      target: agent.catalogEntry,
      preferredScenario: 'code',
    });
  });

  it('移除可见页面标题并让全部智能体固定每页八张', async () => {
    sceneFixture.agents = Array.from({ length: 9 }, (_, index) => ({
      key: `user::void::agent-${index}`,
      id: `agent-${index}`,
      name: `Agent ${index}`,
      displayName: `智能体 ${index}`,
      description: `智能体 ${index} description`,
      displayDescription: `智能体 ${index} description`,
      aliases: [],
      isReadonly: true,
      isReview: false,
      toolCount: 0,
      defaultTools: [],
      defaultEnabled: true,
      effectiveEnabled: true,
      subagentSource: 'user',
      capabilities: [],
      agentKind: 'subagent',
    }));
    const { default: AgentsScene } = await import('./AgentsScene');

    await act(async () => {
      root.render(<AgentsScene />);
    });

    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelectorAll('[data-testid^="agent-card-"]')).toHaveLength(8);
    expect(container.textContent).toContain('nav.coreAgents');
    expect(container.textContent).toContain('nav.agents');
    expect(container.querySelector('[aria-label="page.searchPlaceholder"]')).toBeTruthy();

    const next = container.querySelector<HTMLButtonElement>('[aria-label="pagination.next"]');
    expect(next).toBeTruthy();
    await act(async () => {
      next!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelectorAll('[data-testid^="agent-card-"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="agent-card-user::void::agent-8"]')).toBeTruthy();
  });

  it('搜索条件变化后回到智能体第一页', async () => {
    sceneFixture.agents = Array.from({ length: 9 }, (_, index) => ({
      key: `user::void::agent-${index}`,
      id: `agent-${index}`,
      name: `Agent ${index}`,
      displayName: `智能体 ${index}`,
      description: `智能体 ${index} description`,
      displayDescription: `智能体 ${index} description`,
      aliases: [],
      isReadonly: true,
      isReview: false,
      toolCount: 0,
      defaultTools: [],
      defaultEnabled: true,
      effectiveEnabled: true,
      subagentSource: 'user',
      capabilities: [],
      agentKind: 'subagent',
    }));
    const { default: AgentsScene } = await import('./AgentsScene');

    await act(async () => {
      root.render(<AgentsScene />);
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="pagination.next"]')!
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="agent-card-user::void::agent-8"]')).toBeTruthy();

    await act(async () => {
      useAgentsStore.getState().setSearchQuery('审查');
    });

    expect(container.querySelector('[data-testid="agent-card-user::void::agent-0"]')).toBeTruthy();
  });

  it('浏览器只渲染明确不支持状态且不挂载目录或子页面', async () => {
    sceneFixture.runtimeSupported = false;
    useAgentsStore.getState().openCreateAgent();
    const { default: AgentsScene } = await import('./AgentsScene');

    await act(async () => {
      root.render(<AgentsScene />);
    });

    expect(container.querySelector('[data-testid="agents-runtime-unsupported"]'))
      .toBeTruthy();
    expect(container.textContent).toContain('runtimeUnsupported.description');
    expect(container.querySelector('[data-testid="create-agent-page"]')).toBeNull();
    expect(container.querySelector('[data-testid="review-team-page"]')).toBeNull();
    expect(container.querySelector('[data-testid="team-authoring-page"]')).toBeNull();
    expect(container.querySelector('[data-testid="teams-catalog-view"]')).toBeNull();
    expect(sceneFixture.listHookCalls).toBe(0);
  });
});
