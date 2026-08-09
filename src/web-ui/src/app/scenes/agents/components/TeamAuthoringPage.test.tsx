import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TeamDefinition,
  TeamDefinitionRecord,
} from '@/infrastructure/config/types';
import type {
  CustomizationRuntimeCapabilityReader,
  TeamAuthoringGateway,
} from '@/shared/services/customization';
import { useAgentsStore } from '../agentsStore';

const agentApi = vi.hoisted(() => ({
  getAvailableModes: vi.fn(async () => [{
    id: 'agentic',
    name: 'agentic',
    description: 'Runtime code persona',
    isReadonly: true,
    toolCount: 8,
  }]),
}));
const subagentApi = vi.hoisted(() => ({
  listSubagents: vi.fn(async () => [
    {
      key: 'user::void::product-lead',
      id: 'product-lead',
      name: '产品主理人',
      description: '负责产品方向与最终交付',
      isReadonly: false,
      isReview: false,
      toolCount: 3,
      defaultTools: [],
      defaultEnabled: true,
      effectiveEnabled: true,
      subagentSource: 'user',
      promptCacheScopeKey: 'custom_prompt_sha256:lead',
      visibility: {
        exposure: 'public',
        allowedParentAgentIds: ['agentic'],
        deniedParentAgentIds: [],
        showInGlobalRegistry: true,
      },
    },
    {
      key: 'project::void::frontend-maker',
      id: 'frontend-maker',
      name: '前端开发智能体',
      description: '负责界面实现与验证',
      isReadonly: false,
      isReview: false,
      toolCount: 5,
      defaultTools: [],
      defaultEnabled: true,
      effectiveEnabled: true,
      subagentSource: 'project',
      promptCacheScopeKey: 'custom_prompt_sha256:frontend',
      visibility: {
        exposure: 'public',
        allowedParentAgentIds: ['agentic'],
        deniedParentAgentIds: [],
        showInGlobalRegistry: true,
      },
    },
  ]),
}));
const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
const workspaceFixture = vi.hoisted(() => ({
  workspacePath: 'D:/workspace/project',
  hasWorkspace: true,
  isRemoteWorkspace: false,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => (
      key === 'catalog.presentations.modes.agentic.name'
        ? '代码执行智能体'
        : key
    ),
  }),
}));

vi.mock('@/component-library', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Input: ({
    inputSize: _inputSize,
    error: _error,
    onChange,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & {
    inputSize?: string;
    error?: boolean;
  }) => (
    <input
      {...props}
      onInput={event => onChange?.(
        event as unknown as React.ChangeEvent<HTMLInputElement>,
      )}
    />
  ),
  Textarea: ({
    onChange,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea
      {...props}
      onInput={event => onChange?.(
        event as unknown as React.ChangeEvent<HTMLTextAreaElement>,
      )}
    />
  ),
}));

vi.mock('@/infrastructure/api/service-api/AgentAPI', () => ({
  agentAPI: agentApi,
}));

vi.mock('@/infrastructure/api/service-api/SubagentAPI', () => ({
  SubagentAPI: subagentApi,
}));

vi.mock('@/infrastructure/hooks/useWorkspaceManagerSync', () => ({
  useWorkspaceManagerSync: () => workspaceFixture,
}));

vi.mock('@/shared/notification-system', () => ({
  useNotification: () => notifications,
}));

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

const supportedCapability: CustomizationRuntimeCapabilityReader = {
  getCapability: () => ({ status: 'supported', transport: 'tauri' }),
};
const unsupportedCapability: CustomizationRuntimeCapabilityReader = {
  getCapability: () => ({
    status: 'unsupported',
    transport: 'websocket',
    reason: 'server_runtime_deferred',
  }),
};

function definitionFixture(): TeamDefinition {
  return {
    schemaVersion: 1,
    teamDefinitionId: 'team-stable-id',
    displayName: '代码交付团队',
    description: '由不同职责的代码专家协作完成交付。',
    category: '软件开发',
    capabilityTags: ['代码交付'],
    scenarioEligibility: ['code'],
    leadMemberId: 'member-lead-id',
    members: [
      {
        memberId: 'member-lead-id',
        displayName: '交付主理人',
        professionalRole: '技术交付负责人',
        role: 'lead',
        instructions: '拆解任务并汇总结果。',
        outputResponsibility: '最终交付结果。',
        agentId: 'agentic',
        allowedSkillKeys: [],
        allowedToolNames: [],
        permissionPolicy: 'inherit_parent_intersection',
        isReadonly: false,
      },
      {
        memberId: 'member-specialist-id',
        displayName: '实现专家',
        professionalRole: '高级开发工程师',
        role: 'specialist',
        instructions: '实现代码并提交证据。',
        outputResponsibility: '可验证的代码产物。',
        agentId: 'agentic',
        allowedSkillKeys: [],
        allowedToolNames: [],
        permissionPolicy: 'inherit_parent_intersection',
        isReadonly: false,
      },
    ],
    workflows: [{
      workflowId: 'workflow-stable-id',
      displayName: '标准交付流程',
      triggerDescription: '需要完成代码交付时使用。',
      phases: [
        {
          phaseId: 'phase-implement-id',
          displayName: '实现',
          kind: 'serial',
          dependsOnPhaseIds: [],
          assignedMemberIds: ['member-specialist-id'],
          expectedOutputs: ['实现结果'],
          completionRule: '实现结果通过验证。',
        },
        {
          phaseId: 'phase-review-id',
          displayName: '复核',
          kind: 'review',
          dependsOnPhaseIds: ['phase-implement-id'],
          assignedMemberIds: ['member-lead-id'],
          expectedOutputs: ['最终结果'],
          completionRule: '主理人完成复核。',
        },
      ],
    }],
    collaborationPolicy: 'lead_mediated',
    permissionPolicy: 'inherit_parent_intersection',
    origin: 'project',
  };
}

function recordFixture(
  definition = definitionFixture(),
  revision = 'revision-stable-7',
): TeamDefinitionRecord {
  return {
    definition,
    revision,
    level: 'project',
    path: 'D:/workspace/project/.void/teams/team-stable-id.json',
    isAuthorable: true,
  };
}

function gatewayFixture(
  overrides: Partial<TeamAuthoringGateway> = {},
): TeamAuthoringGateway {
  const record = recordFixture();
  return {
    list: vi.fn(async () => ({
      status: 'ready',
      records: [],
      diagnostics: [],
    })),
    get: vi.fn(async () => record),
    create: vi.fn(async () => record),
    update: vi.fn(async () => record),
    install: vi.fn(async () => record),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function setInputValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype = element instanceof window.HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
}

describeWithJsdom('TeamAuthoringPage', () => {
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
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    vi.stubGlobal('HTMLTextAreaElement', dom.window.HTMLTextAreaElement);
    vi.stubGlobal('HTMLSelectElement', dom.window.HTMLSelectElement);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useAgentsStore.setState({ catalogRefreshRevision: 0 });
    useAgentsStore.getState().openCreateTeam();
    workspaceFixture.workspacePath = 'D:/workspace/project';
    workspaceFixture.hasWorkspace = true;
    workspaceFixture.isRemoteWorkspace = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
    useAgentsStore.getState().openHome();
  });

  async function renderPage(
    gateway: TeamAuthoringGateway,
    capabilityService = supportedCapability,
  ) {
    const { default: TeamAuthoringPage } = await import('./TeamAuthoringPage');
    await act(async () => {
      root.render(
        <TeamAuthoringPage
          gateway={gateway}
          capabilityService={capabilityService}
        />,
      );
      await Promise.resolve();
    });
  }

  async function flush(maxTicks = 8) {
    for (let index = 0; index < maxTicks; index += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  async function clickButton(text: string) {
    const button = Array.from(container.querySelectorAll('button'))
      .find(candidate => candidate.textContent?.includes(text));
    expect(button).toBeTruthy();
    await act(async () => {
      button!.dispatchEvent(new dom.window.MouseEvent('click', {
        bubbles: true,
      }));
      await Promise.resolve();
    });
  }

  it('在浏览器能力不支持时不读取目录或调用团队持久化网关', async () => {
    const gateway = gatewayFixture();

    await renderPage(gateway, unsupportedCapability);

    expect(container.querySelector(
      '[data-testid="team-authoring-runtime-unsupported"]',
    )).toBeTruthy();
    expect(agentApi.getAvailableModes).not.toHaveBeenCalled();
    expect(subagentApi.listSubagents).not.toHaveBeenCalled();
    expect(gateway.get).not.toHaveBeenCalled();
    expect(gateway.create).not.toHaveBeenCalled();
    expect(gateway.update).not.toHaveBeenCalled();
  }, 15_000);

  it('像选角色一样组队，第一位自动成为主理人并提交稳定 raw agentId', async () => {
    const gateway = gatewayFixture();

    await renderPage(gateway);
    await flush();

    expect(container.textContent).toContain('产品主理人');
    expect(container.textContent).toContain('前端开发智能体');
    await clickButton('产品主理人');
    await clickButton('前端开发智能体');
    expect(container.querySelectorAll('.team-roster__slot')).toHaveLength(2);
    expect(Array.from(container.querySelectorAll('.team-roster__agent'))
      .every(agent => agent.getAttribute('aria-pressed') === 'true'))
      .toBe(true);
    expect(container.querySelector('.team-roster__slot.is-lead')?.textContent)
      .toContain('产品主理人');

    const inputs = container.querySelectorAll<HTMLInputElement>('input');
    const displayName = Array.from(inputs).find(
      input => input.placeholder === 'teamAuthoring.roster.namePlaceholder',
    );
    const description = container.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="teamAuthoring.roster.goalPlaceholder"]',
    );
    expect(displayName).toBeTruthy();
    expect(description).toBeTruthy();
    await act(async () => {
      setInputValue(displayName!, '中文软件开发团队');
      setInputValue(description!, '由中文展示的智能体共同完成软件交付。');
      await Promise.resolve();
    });
    await clickButton('teamAuthoring.actions.create');

    expect(gateway.create).toHaveBeenCalledWith(expect.objectContaining({
      level: 'project',
      workspacePath: 'D:/workspace/project',
      draft: expect.objectContaining({
        displayName: '中文软件开发团队',
        members: expect.arrayContaining([
          expect.objectContaining({ agentId: 'user::void::product-lead' }),
          expect.objectContaining({ agentId: 'project::void::frontend-maker' }),
        ]),
      }),
    }));
    const createInput = vi.mocked(gateway.create).mock.calls[0]?.[0];
    expect(createInput?.draft.members.map(member => member.agentId))
      .toEqual(['user::void::product-lead', 'project::void::frontend-maker']);
    expect(createInput?.draft.members.filter(member => member.role === 'lead'))
      .toEqual([expect.objectContaining({
        agentId: 'user::void::product-lead',
      })]);
    const userScope = Array.from(container.querySelectorAll<HTMLButtonElement>(
      '.team-roster__scope button',
    )).find(button => button.textContent === 'teamAuthoring.scope.user');
    expect(userScope?.disabled).toBe(true);
  });

  it('允许一键更换主理人，且同一智能体不会重复出现在阵容', async () => {
    const gateway = gatewayFixture();

    await renderPage(gateway);
    await flush();
    await clickButton('产品主理人');
    await clickButton('前端开发智能体');

    const makeLead = container.querySelector<HTMLButtonElement>(
      '.team-roster__lead-action',
    );
    expect(makeLead).toBeTruthy();
    await act(async () => {
      makeLead!.click();
      await Promise.resolve();
    });

    expect(container.querySelector('.team-roster__slot.is-lead')?.textContent)
      .toContain('前端开发智能体');
    expect(container.querySelectorAll('.team-roster__slot')).toHaveLength(2);
    expect(Array.from(container.querySelectorAll('.team-roster__slot'))
      .filter(slot => slot.textContent?.includes('前端开发智能体')))
      .toHaveLength(1);
  });

  it('没有已创建智能体时给出明确空态并可直接进入智能体创建页', async () => {
    subagentApi.listSubagents.mockResolvedValueOnce([]);
    const gateway = gatewayFixture();

    await renderPage(gateway);
    await flush();

    expect(container.textContent).toContain('teamAuthoring.roster.emptyAgents');
    await clickButton('teamAuthoring.roster.createAgentFirst');
    expect(useAgentsStore.getState().page).toBe('createAgent');
  });

  it('目录刷新失败时保留已选阵容并提供重试', async () => {
    const gateway = gatewayFixture();

    await renderPage(gateway);
    await flush();
    await clickButton('产品主理人');
    await clickButton('前端开发智能体');
    subagentApi.listSubagents.mockRejectedValueOnce(new Error('catalog offline'));
    workspaceFixture.workspacePath = 'D:/workspace/changed';
    await renderPage(gateway);
    await flush();

    expect(container.textContent).toContain('teamAuthoring.roster.loadFailed');
    expect(container.querySelectorAll('.team-roster__slot')).toHaveLength(2);
    await clickButton('teamAuthoring.roster.retry');
    await flush();
    expect(container.querySelectorAll('.team-roster__slot')).toHaveLength(2);
    expect(container.textContent).not.toContain('teamAuthoring.roster.loadFailed');
  });

  it('创建失败时保留名称、目标和完整阵容供用户重试', async () => {
    const gateway = gatewayFixture({
      create: vi.fn(async () => {
        throw new Error('disk busy');
      }),
    });

    await renderPage(gateway);
    await flush();
    await clickButton('产品主理人');
    await clickButton('前端开发智能体');
    const displayName = container.querySelector<HTMLInputElement>(
      'input[placeholder="teamAuthoring.roster.namePlaceholder"]',
    );
    const goal = container.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="teamAuthoring.roster.goalPlaceholder"]',
    );
    await act(async () => {
      setInputValue(displayName!, '保留现场团队');
      setInputValue(goal!, '创建失败后可以直接重试。');
      await Promise.resolve();
    });
    await clickButton('teamAuthoring.actions.create');
    await flush();

    expect(notifications.error).toHaveBeenCalledWith('teamAuthoring.errors.write_failed');
    expect(displayName?.value).toBe('保留现场团队');
    expect(goal?.value).toBe('创建失败后可以直接重试。');
    expect(container.querySelectorAll('.team-roster__slot')).toHaveLength(2);
  });

  it('编辑时保留定义、成员、工作流和阶段 ID 并携带 expectedRevision', async () => {
    const existing = definitionFixture();
    const record = recordFixture(existing);
    const gateway = gatewayFixture({
      get: vi.fn(async () => record),
      update: vi.fn(async () => record),
    });
    useAgentsStore.getState().openEditTeam(existing.teamDefinitionId, 'project');

    await renderPage(gateway);
    await flush();
    expect(container.textContent).toContain(existing.displayName);
    await clickButton('teamAuthoring.actions.save');

    expect(gateway.get).toHaveBeenCalledWith({
      teamDefinitionId: 'team-stable-id',
      level: 'project',
      workspacePath: 'D:/workspace/project',
    });
    expect(gateway.update).toHaveBeenCalledTimes(1);
    const updateInput = vi.mocked(gateway.update).mock.calls[0]![0];
    expect(updateInput.teamDefinitionId).toBe('team-stable-id');
    expect(updateInput.expectedRevision).toBe('revision-stable-7');
    expect(updateInput.level).toBe('project');
    expect(updateInput.workspacePath).toBe('D:/workspace/project');
    expect(updateInput.definition.teamDefinitionId).toBe('team-stable-id');
    expect(updateInput.definition.members.map(member => member.memberId))
      .toEqual(['member-lead-id', 'member-specialist-id']);
    expect(updateInput.definition.workflows.map(workflow => workflow.workflowId))
      .toEqual(['workflow-stable-id']);
    expect(updateInput.definition.workflows[0]?.phases.map(phase => phase.phaseId))
      .toEqual(['phase-implement-id', 'phase-review-id']);
    expect(updateInput.definition.workflows[0]?.phases[1]?.dependsOnPhaseIds)
      .toEqual(['phase-implement-id']);
    expect(updateInput.definition.workflows[0]?.phases[0]?.assignedMemberIds)
      .toEqual(['member-specialist-id']);
  });
});
