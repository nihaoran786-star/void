import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentsStore } from '../agentsStore';

const subagentApi = vi.hoisted(() => ({
  createSubagent: vi.fn(async () => 'custom-generated-id'),
  getSubagentDetail: vi.fn(),
  updateSubagent: vi.fn(async () => undefined),
}));
const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
const toolApi = vi.hoisted(() => ({
  getAllToolsInfo: vi.fn(async () => []),
}));
const capabilityFixture = vi.hoisted(() => ({
  supported: true,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => key,
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
  }) => <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement> & { inputSize?: string; error?: boolean }) => {
    const {
      inputSize: _inputSize,
      error: _error,
      onChange,
      ...inputProps
    } = props;
    return (
      <input
        {...inputProps}
        onInput={(event) => onChange?.(event as unknown as React.ChangeEvent<HTMLInputElement>)}
      />
    );
  },
  Textarea: ({
    onChange,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea
      {...props}
      onInput={(event) => onChange?.(event as unknown as React.ChangeEvent<HTMLTextAreaElement>)}
    />
  ),
  Switch: ({
    checked,
    disabled,
    onChange,
  }: {
    checked: boolean;
    disabled?: boolean;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
  }) => <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />,
}));

vi.mock('@/infrastructure/api/service-api/SubagentAPI', () => ({
  SubagentAPI: subagentApi,
}));

vi.mock('@/infrastructure/api/service-api/ToolAPI', () => ({
  toolAPI: toolApi,
}));

vi.mock('@/shared/services/customization/CustomizationRuntimeCapabilityService', () => ({
  customizationRuntimeCapabilityService: {
    getCapability: () => capabilityFixture.supported
      ? { status: 'supported', transport: 'tauri' }
      : {
          status: 'unsupported',
          transport: 'websocket',
          reason: 'server_runtime_deferred',
        },
  },
}));

vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useCurrentWorkspace: () => ({
    hasWorkspace: true,
    workspacePath: 'D:/workspace/project',
  }),
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

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof window.HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
}

describeWithJsdom('CreateAgentPage', () => {
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
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useAgentsStore.setState({ catalogRefreshRevision: 0 });
    useAgentsStore.getState().openCreateAgent();
    capabilityFixture.supported = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
    useAgentsStore.getState().openHome();
  });

  async function renderPage() {
    const { default: CreateAgentPage } = await import('./CreateAgentPage');
    await act(async () => {
      root.render(<CreateAgentPage />);
      await Promise.resolve();
    });
  }

  async function clickButton(testIdOrText: string) {
    const byTestId = container.querySelector<HTMLButtonElement>(
      `[data-testid="${testIdOrText}"]`,
    );
    const button = byTestId ?? Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.includes(testIdOrText));
    expect(button).toBeTruthy();
    await act(async () => {
      button!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
  }

  it('creates from the manual route without asking for an English runtime ID', async () => {
    await renderPage();
    await clickButton('agent-route-manual');

    expect(container.querySelector('#agent-display-name')).toBeTruthy();
    expect(container.textContent).toContain('agentsOverview.form.runtimeIdAuto');
    expect(container.querySelector('input[placeholder*="letter"]')).toBeNull();

    await act(async () => {
      setInputValue(container.querySelector('#agent-display-name')!, '前端开发专家');
      setInputValue(container.querySelector('#agent-description')!, '负责前端交付');
      setInputValue(container.querySelector('#agent-prompt')!, '你负责实现和验证前端功能。');
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="agent-draft-preview"]')?.textContent)
      .toContain('前端开发专家');
    await clickButton('agentsOverview.form.submit');

    expect(subagentApi.createSubagent).toHaveBeenCalledWith({
      level: 'user',
      displayName: '前端开发专家',
      allowedParentAgentIds: ['Multitask', 'Plan', 'Team', 'agentic', 'debug'],
      description: '负责前端交付',
      prompt: '你负责实现和验证前端功能。',
      readonly: true,
      review: false,
      tools: undefined,
      workspacePath: undefined,
    });
    expect(subagentApi.createSubagent.mock.calls[0]?.[0]).not.toHaveProperty('name');
    expect(useAgentsStore.getState().catalogRefreshRevision).toBe(1);
    expect(useAgentsStore.getState().page).toBe('home');
  });

  it('loads the immutable runtime ID only as secondary text while editing localized fields', async () => {
    subagentApi.getSubagentDetail.mockResolvedValue({
      subagentKey: 'user::void::custom-stable-runtime-id',
      subagentId: 'custom-stable-runtime-id',
      name: 'custom-stable-runtime-id',
      displayName: '财报分析师',
      allowedParentAgentIds: ['Cowork', 'DeepResearch', 'Claw'],
      description: '分析财务资料',
      prompt: '按证据分析财务资料。',
      tools: ['Read'],
      readonly: true,
      review: false,
      enabled: true,
      model: 'fast',
      path: 'custom-stable-runtime-id.md',
      level: 'user',
    });
    useAgentsStore.getState().openEditAgent(
      'user::void::custom-stable-runtime-id',
      'custom-stable-runtime-id',
    );

    await renderPage();
    for (let index = 0; index < 10 && !container.textContent?.includes('custom-stable-runtime-id'); index += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(container.textContent).toContain('custom-stable-runtime-id');
    expect((container.querySelector('#agent-display-name') as HTMLInputElement).value)
      .toBe('财报分析师');
    expect(container.querySelector('[data-testid^="agent-route-"]')).toBeNull();

    await clickButton('agentsOverview.form.save');
    expect(subagentApi.getSubagentDetail).toHaveBeenCalledWith({
      subagentKey: 'user::void::custom-stable-runtime-id',
      subagentId: 'custom-stable-runtime-id',
      workspacePath: 'D:/workspace/project',
    });
    expect(subagentApi.updateSubagent).toHaveBeenCalledWith(expect.objectContaining({
      subagentKey: 'user::void::custom-stable-runtime-id',
      subagentId: 'custom-stable-runtime-id',
      displayName: '财报分析师',
      allowedParentAgentIds: ['Claw', 'Cowork', 'DeepResearch'],
      workspacePath: 'D:/workspace/project',
    }));
    expect(useAgentsStore.getState().catalogRefreshRevision).toBe(1);
    expect(useAgentsStore.getState().page).toBe('home');
  });

  it('does not refresh or leave the editor when persistence fails', async () => {
    subagentApi.createSubagent.mockRejectedValueOnce(new Error('write failed'));
    await renderPage();
    await clickButton('agent-route-manual');

    await act(async () => {
      setInputValue(container.querySelector('#agent-display-name')!, '失败测试专家');
      setInputValue(container.querySelector('#agent-description')!, '验证失败状态');
      setInputValue(container.querySelector('#agent-prompt')!, '保持编辑状态并显示错误。');
      await Promise.resolve();
    });
    await clickButton('agentsOverview.form.submit');

    expect(useAgentsStore.getState().catalogRefreshRevision).toBe(0);
    expect(useAgentsStore.getState().page).toBe('createAgent');
    expect(notifications.error).toHaveBeenCalled();
  });

  it('浏览器只显示明确不支持状态且不读取工具、详情或写入智能体', async () => {
    capabilityFixture.supported = false;
    useAgentsStore.getState().openEditAgent(
      'user::void::custom-stable-runtime-id',
      'custom-stable-runtime-id',
    );

    await renderPage();

    expect(container.querySelector(
      '[data-testid="create-agent-runtime-unsupported"]',
    )).toBeTruthy();
    expect(container.textContent).toContain('runtimeUnsupported.description');
    expect(toolApi.getAllToolsInfo).not.toHaveBeenCalled();
    expect(subagentApi.getSubagentDetail).not.toHaveBeenCalled();
    expect(subagentApi.createSubagent).not.toHaveBeenCalled();
    expect(subagentApi.updateSubagent).not.toHaveBeenCalled();
  });
});
