import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import type {
  AgentHubDirectory,
  AgentHubRow,
  AgentHubRowType,
  AgentHubSection,
} from './useAgentHubDirectory';
import type { AgentWithCapabilities } from '../agents/agentsStore';

// The AGENT page is an aggregation surface: it owns no catalog logic, so this
// guard pins the presentation contract instead — grouped rows with their own
// counts, text tabs, in-page filtering, a status word on every row, the five
// creation entries, and one explicit state per section (an empty list never
// stands in for loading or failure).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/component-library', () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock('@/app/components', () => ({
  GalleryDetailModal: ({ isOpen, children }: { isOpen: boolean; children?: React.ReactNode }) =>
    isOpen ? <div className="gallery-detail-modal">{children}</div> : null,
}));

vi.mock('@/app/components/CatalogPagination/CatalogPagination', () => ({
  default: ({ totalPages }: { totalPages: number }) =>
    (totalPages > 1 ? <nav className="catalog-pagination" /> : null),
}));

vi.mock('@/shared/notification-system', () => ({
  useNotification: () => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}));

vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    createAssistantWorkspace: vi.fn(),
    setActiveWorkspace: vi.fn(),
  }),
}));

vi.mock('@/shared/types', () => ({ isRemoteWorkspace: () => false }));

vi.mock('@/flow_chat/services/FlowChatManager', () => ({
  flowChatManager: { createChatSession: vi.fn() },
}));

vi.mock('@/flow_chat/services/openBtwSession', () => ({ openMainSession: vi.fn() }));

vi.mock('@/app/services/CustomizationTaskDispatchService', () => ({
  canDispatchCustomizationTarget: () => true,
  CustomizationTaskDispatchError: class extends Error { code = 'draft_open_failed'; },
  customizationTaskDispatchService: { dispatch: vi.fn() },
}));

const openScene = vi.fn();
vi.mock('@/app/stores/sceneStore', () => ({
  useSceneStore: (selector: (state: { openScene: typeof openScene }) => unknown) =>
    selector({ openScene }),
}));

vi.mock('@/app/stores/sessionModeStore', () => ({
  useSessionModeStore: (selector: (state: { mode: string }) => unknown) =>
    selector({ mode: 'code' }),
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

vi.mock('../agents/components/AgentAvatar', () => ({
  default: () => <span className="agent-avatar" />,
}));

vi.mock('../agents/components/AgentEquipmentPanel', () => ({
  default: ({ agent }: { agent: { id: string } }) => (
    <div
      className="agent-equipment-panel"
      data-testid="agent-equipment-panel"
      data-agent-id={agent.id}
    />
  ),
}));

vi.mock('../agents/components/TeamCatalogDetail', () => ({ default: () => null }));

let agentsStorePage: 'home' | 'createAgent' | 'teamAuthoring' | 'reviewTeam' = 'home';
const openHome = vi.fn();
vi.mock('../agents/agentsStore', () => ({
  useAgentsStore: () => ({
    page: agentsStorePage,
    openHome,
    openCreateAgent: vi.fn(),
    openCreateTeam: vi.fn(),
    openEditTeam: vi.fn(),
    openReviewTeam: vi.fn(),
  }),
}));

vi.mock('../agents/components/CreateAgentPage', () => ({
  default: () => <div className="mock-create-agent" data-testid="create-agent-page" />,
}));

vi.mock('../agents/components/TeamAuthoringPage', () => ({
  default: () => <div className="mock-team-authoring" data-testid="team-authoring-page" />,
}));

vi.mock('../agents/components/ReviewTeamPage', () => ({
  default: () => <div className="mock-review-team" data-testid="review-team-page" />,
  ReviewTeamErrorBoundary: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../agents/utils', () => ({
  getAgentBadge: () => ({ variant: 'neutral', label: 'badge' }),
  getAgentDescription: () => 'description',
}));

vi.mock('../my-agent/myAgentStore', () => ({
  useMyAgentStore: (
    selector: (state: { setSelectedAssistantWorkspaceId: () => void }) => unknown,
  ) => selector({ setSelectedAssistantWorkspaceId: vi.fn() }),
}));

vi.mock('../skills/components/SkillCatalogAvatar', () => ({
  default: () => <span className="skill-glyph" />,
}));

vi.mock('../skills/components/SkillAuthoringPage', () => ({
  default: ({ mode, skillKey }: { mode: string; skillKey?: string }) => (
    <div
      className="mock-skill-authoring"
      data-testid="skill-authoring-page"
      data-mode={mode}
      data-skill-key={skillKey ?? ''}
    />
  ),
}));

vi.mock('@/infrastructure/config/components/ConnectorCatalogAvatar', () => ({
  default: () => <span className="connector-glyph" />,
}));

vi.mock('@/infrastructure/config/components/McpToolsConfig', () => ({
  default: () => <div className="mock-mcp-tools-config" data-testid="mcp-tools-config" />,
}));

let directory: AgentHubDirectory;
vi.mock('./useAgentHubDirectory', () => ({
  AGENT_HUB_ROW_TYPES: ['assistant', 'agent', 'team', 'skill', 'connector'],
  useAgentHubDirectory: () => directory,
}));

function row(type: AgentHubRowType, name: string, statusKey: string): AgentHubRow {
  return {
    id: `${type}:${name}`,
    type,
    name,
    line: `${name} line`,
    status: { key: statusKey, tone: 'muted' },
    avatarProps: { identity: name, name },
    searchText: `${name} ${name} line`.toLowerCase(),
  };
}

function ready(type: AgentHubRowType, rows: AgentHubRow[]): AgentHubSection {
  return { type, status: rows.length ? 'ready' : 'empty', rows };
}

function buildDirectory(
  overrides: Partial<Record<AgentHubRowType, AgentHubSection>> = {},
): AgentHubDirectory {
  const sections: Record<AgentHubRowType, AgentHubSection> = {
    assistant: ready('assistant', [row('assistant', 'nova', 'idle')]),
    agent: ready('agent', [
      row('agent', 'alpha', 'enabled'),
      row('agent', 'beta', 'enabled'),
    ]),
    team: ready('team', [row('team', 'review', 'ready')]),
    skill: ready('skill', [row('skill', 'docx', 'enabled')]),
    connector: ready('connector', [row('connector', 'notion', 'connected')]),
    ...overrides,
  };

  return {
    sections,
    counts: {
      assistant: sections.assistant.rows.length,
      agent: sections.agent.rows.length,
      team: sections.team.rows.length,
      skill: sections.skill.rows.length,
      connector: sections.connector.rows.length,
    },
    total: Object.values(sections).reduce((sum, section) => sum + section.rows.length, 0),
    assistantsById: {},
    agentsById: {},
    teamsById: {},
    skillsById: {},
    connectorsById: {},
    agentCapabilities: {
      availableTools: [],
      getModeConfig: () => null,
      getModeSkills: () => [],
      getModeManageableSubagents: () => [],
      handleSetTools: vi.fn(),
      handleResetTools: vi.fn(),
      handleSetSkills: vi.fn(),
      handleResetSkills: vi.fn(),
      handleSetSubagentEnabled: vi.fn(),
    },
  };
}

let JSDOMCtor: (new (
  html?: string,
  options?: { pretendToBeVisual?: boolean; url?: string }
) => { window: Window & typeof globalThis }) | null = null;

try {
  const jsdom = await import('jsdom');
  JSDOMCtor = jsdom.JSDOM as typeof JSDOMCtor;
} catch {
  JSDOMCtor = null;
}

const describeWithJsdom = JSDOMCtor ? describe : describe.skip;

describeWithJsdom('AgentHubScene', () => {
  let dom: { window: Window & typeof globalThis };
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    directory = buildDirectory();
    agentsStorePage = 'home';
    openHome.mockClear();
    openScene.mockClear();
    dom = new JSDOMCtor!('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost',
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const render = async () => {
    const { default: AgentHubScene } = await import('./AgentHubScene');
    await act(async () => {
      root.render(<AgentHubScene />);
    });
  };

  const click = async (element: Element | null | undefined) => {
    expect(element).toBeTruthy();
    await act(async () => {
      (element as HTMLElement).dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true }),
      );
    });
  };

  const type = async (input: HTMLInputElement, value: string) => {
    input.value = value;
    await act(async () => {
      Simulate.change(input);
    });
  };

  const rowsIn = (type_: AgentHubRowType): Element[] =>
    Array.from(
      container.querySelectorAll(`[data-testid="agent-hub-group-${type_}"] .agent-hub-row`),
    );

  it('每组各自渲染并显示自己的计数', async () => {
    await render();

    const groups = Array.from(container.querySelectorAll('.agent-hub-group'));
    expect(groups).toHaveLength(5);

    const labels = groups.map(group => group.querySelector('.agent-hub-group__label')?.textContent);
    expect(labels).toEqual([
      'groups.assistant · 1',
      'groups.agent · 2',
      'groups.team · 1',
      'groups.skill · 1',
      'groups.connector · 1',
    ]);

    expect(container.querySelectorAll('.agent-hub-row')).toHaveLength(6);
  });

  it('每行最多只有一个动作按钮，其余靠点整行进入详情', async () => {
    await render();

    const counts = Array.from(container.querySelectorAll('.agent-hub-row')).map(
      element => element.querySelectorAll('.agent-hub-row__action').length,
    );
    expect(Math.max(...counts)).toBe(1);

    // Assistants start a chat, agents/teams get a task, skills open the editor;
    // connectors have no distinct action, so the row itself is the only target.
    const labelsFor = (type_: AgentHubRowType) =>
      rowsIn(type_).flatMap(element =>
        Array.from(element.querySelectorAll('.agent-hub-row__action')).map(
          action => action.getAttribute('aria-label'),
        ),
      );
    expect(labelsFor('assistant')).toEqual(['actions.newSession']);
    expect(labelsFor('agent')).toEqual(['actions.dispatch', 'actions.dispatch']);
    expect(labelsFor('skill')).toEqual(['actions.edit']);
    expect(labelsFor('connector')).toEqual([]);
  });

  it('每一行都用文字显式说明状态', async () => {
    await render();

    const statuses = Array.from(container.querySelectorAll('.agent-hub-row')).map(
      element => element.querySelector('.agent-hub-row__status')?.textContent,
    );
    expect(statuses).toEqual([
      'status.idle',
      'status.enabled',
      'status.enabled',
      'status.ready',
      'status.enabled',
      'status.connected',
    ]);
  });

  it('切换页签后只呈现该类型', async () => {
    await render();

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    expect(tabs).toHaveLength(6);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');

    await click(tabs[2]);

    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelectorAll('.agent-hub-group')).toHaveLength(1);
    expect(rowsIn('agent')).toHaveLength(2);
    expect(rowsIn('skill')).toHaveLength(0);
  });

  it('搜索在本页内即时过滤全部类型', async () => {
    await render();

    await click(container.querySelector('.agent-hub-head__tool'));
    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    await type(input, 'alpha');

    expect(container.querySelectorAll('.agent-hub-row')).toHaveLength(1);
    expect(rowsIn('agent')[0]?.textContent).toContain('alpha');
    expect(
      container.querySelector('[data-testid="agent-hub-group-skill"] .agent-hub-group__state')
        ?.textContent,
    ).toBe('states.noMatch');
  });

  it("'+' 菜单提供五个创建入口", async () => {
    await render();

    expect(container.querySelector('[role="menu"]')).toBeNull();

    await click(container.querySelector('.agent-hub-head__create .agent-hub-head__tool'));

    const items = Array.from(container.querySelectorAll('[role="menuitem"]'));
    expect(items.map(item => item.textContent)).toEqual([
      'create.assistant',
      'create.agent',
      'create.team',
      'create.skill',
      'create.connector',
    ]);
  });

  it('加载、空、错误三态各自显式，绝不用空列表冒充', async () => {
    directory = buildDirectory({
      assistant: { type: 'assistant', status: 'loading', rows: [] },
      agent: { type: 'agent', status: 'error', rows: [], error: 'boom' },
      team: { type: 'team', status: 'empty', rows: [] },
    });
    await render();

    const stateFor = (type_: AgentHubRowType) =>
      container.querySelector(
        `[data-testid="agent-hub-group-${type_}"] .agent-hub-group__state`,
      );

    expect(stateFor('assistant')?.textContent).toBe('states.loading');
    expect(stateFor('assistant')?.getAttribute('aria-busy')).toBe('true');
    expect(stateFor('agent')?.textContent).toBe('states.error');
    expect(stateFor('agent')?.getAttribute('role')).toBe('alert');
    expect(stateFor('team')?.textContent).toBe('states.empty');
    expect(stateFor('skill')).toBeNull();
  });

  it('可重试的失败分组给出行内重试文字动作，而不是弹出提示', async () => {
    const retry = vi.fn();
    directory = buildDirectory({
      agent: { type: 'agent', status: 'error', rows: [], error: 'boom', retry },
      team: { type: 'team', status: 'error', rows: [], error: 'boom' },
    });
    await render();

    const retryButton = container.querySelector(
      '[data-testid="agent-hub-group-agent"] .agent-hub-group__retry',
    );
    expect(retryButton?.textContent).toBe('states.retry');
    await click(retryButton);
    expect(retry).toHaveBeenCalledTimes(1);

    expect(
      container.querySelector('[data-testid="agent-hub-group-team"] .agent-hub-group__retry'),
    ).toBeNull();
  });

  it('打开智能体详情后渲染装配面板并传入正确的智能体', async () => {
    const agent = {
      id: 'alpha',
      key: 'alpha',
      name: 'alpha',
      displayName: 'alpha',
      catalogEntry: { availability: { status: 'available' } },
      capabilities: [],
      displayDescription: 'description',
      aliases: [],
      agentKind: 'mode',
    } as unknown as AgentWithCapabilities;

    directory = buildDirectory();
    directory.agentsById['agent:alpha'] = agent;

    await render();
    await click(rowsIn('agent')[0]);

    const panel = container.querySelector('.agent-equipment-panel');
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute('data-agent-id')).toBe('alpha');
  });

  it('点连接器行后整页打开连接器管理视图，返回后回到目录', async () => {
    await render();

    expect(container.querySelector('.agent-hub-group')).toBeTruthy();
    expect(container.querySelector('[data-testid="mcp-tools-config"]')).toBeNull();

    await click(rowsIn('connector')[0]);

    expect(container.querySelector('.agent-hub-group')).toBeNull();
    expect(container.querySelector('[data-testid="mcp-tools-config"]')).toBeTruthy();
    expect(openScene).not.toHaveBeenCalled();

    await click(container.querySelector('.agent-hub-hosted-head__back'));

    expect(container.querySelector('[data-testid="mcp-tools-config"]')).toBeNull();
    expect(container.querySelector('.agent-hub-group')).toBeTruthy();
  });

  it('+ 菜单的添加入口同样切到连接器视图', async () => {
    await render();

    await click(container.querySelector('.agent-hub-head__create .agent-hub-head__tool'));
    const addConnectorItem = Array.from(
      container.querySelectorAll('[role="menuitem"]'),
    ).find(item => item.textContent === 'create.connector');
    await click(addConnectorItem);
    expect(container.querySelector('[data-testid="mcp-tools-config"]')).toBeTruthy();
    expect(openScene).not.toHaveBeenCalled();
  });

  it('技能行编辑进入 SkillAuthoringPage 且不调 openScene', async () => {
    await render();

    const editButton = rowsIn('skill')[0].querySelector(
      '.agent-hub-row__action[aria-label="actions.edit"]',
    );
    await click(editButton);

    const page = container.querySelector('[data-testid="skill-authoring-page"]');
    expect(page).toBeTruthy();
    expect(page?.getAttribute('data-mode')).toBe('edit');
    expect(page?.getAttribute('data-skill-key')).toBe('docx');
    expect(openScene).not.toHaveBeenCalled();

    await click(container.querySelector('.agent-hub-hosted-head__back'));

    expect(container.querySelector('[data-testid="skill-authoring-page"]')).toBeNull();
    expect(container.querySelector('.agent-hub-group')).toBeTruthy();
  });

  it("'+ 新建技能' 进入 SkillAuthoringPage", async () => {
    await render();

    await click(container.querySelector('.agent-hub-head__create .agent-hub-head__tool'));
    const createSkillItem = Array.from(
      container.querySelectorAll('[role="menuitem"]'),
    ).find(item => item.textContent === 'create.skill');
    await click(createSkillItem);

    const page = container.querySelector('[data-testid="skill-authoring-page"]');
    expect(page).toBeTruthy();
    expect(page?.getAttribute('data-mode')).toBe('create');
    expect(openScene).not.toHaveBeenCalled();

    await click(container.querySelector('.agent-hub-hosted-head__back'));

    expect(container.querySelector('[data-testid="skill-authoring-page"]')).toBeNull();
    expect(container.querySelector('.agent-hub-group')).toBeTruthy();
  });

  it("agentsStore.page 为 'createAgent' 时渲染 CreateAgentPage 而不是名册", async () => {
    agentsStorePage = 'createAgent';
    await render();

    expect(container.querySelector('.agent-hub-group')).toBeNull();
    expect(container.querySelector('[data-testid="create-agent-page"]')).toBeTruthy();
  });
});
