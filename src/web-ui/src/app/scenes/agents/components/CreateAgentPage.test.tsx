import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeAgentDraftFingerprint } from '@/shared/services/customization/AgentDebugDraft';
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

const debugRuntime = vi.hoisted(() => {
  const createDebugSession = vi.fn(async () => ({
    sessionId: 'debug-session-1',
    subagentId: 'custom-debug-1',
    subagentKey: 'user::void::custom-debug-1',
    draftFingerprint: 'fp-1',
    workspacePath: 'D:/workspace/project',
  }));
  const disposeDebugSession = vi.fn(async () => {});
  const sendMessage = vi.fn(async () => {});
  return {
    createAgentDebugRuntime: vi.fn(() => ({
      createDebugSession,
      disposeDebugSession,
      prepareForSend: vi.fn(),
      sendMessage,
      sweepOrphanedDebugSubagents: vi.fn(),
    })),
    defaultAgentDebugRuntimeDeps: vi.fn(() => ({})),
    createDebugSession,
    disposeDebugSession,
  };
});

const flowChatStoreMock = vi.hoisted(() => {
  const sessions = new Map<string, Record<string, unknown>>();
  return {
    flowChatStore: {
      subscribe: () => () => undefined,
      getState: () => ({ sessions }),
    },
    sessions,
  };
});

const debugPanelProps = vi.hoisted(() => ({
  props: null as {
    session: unknown;
    status: string;
    draftFingerprint: string;
    justReplaced: boolean;
    error: string | null | undefined;
    onRetry: (() => void) | undefined;
  } | null,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/shared/services/customization/AgentDebugRuntimeService', () => debugRuntime);

vi.mock('@/flow_chat/store/FlowChatStore', () => flowChatStoreMock);

vi.mock('./AgentDebugChatPanel', () => ({
  AgentDebugChatPanel: (props: {
    session?: unknown;
    status?: string;
    draftFingerprint?: string;
    justReplaced?: boolean;
    error?: string | null;
    onRetry?: () => void;
  }) => {
    debugPanelProps.props = props;
    return <div data-testid="agent-debug-chat-panel" />;
  },
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
    debugPanelProps.props = null;
    flowChatStoreMock.sessions.clear();
    debugRuntime.createDebugSession.mockImplementation(async (draft: { prompt?: string }) => ({
      sessionId: 'debug-session-1',
      subagentId: 'custom-debug-1',
      subagentKey: 'user::void::custom-debug-1',
      draftFingerprint: computeAgentDraftFingerprint(
        draft as { displayName: string; description: string; prompt: string; tools: string[]; readonly: boolean; review: boolean },
      ),
      workspacePath: 'D:/workspace/project',
    }));
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

  it('shows only the three beginner fields until "advanced" is opened', async () => {
    await renderPage();

    const panel = container.querySelector<HTMLElement>('[data-testid="agent-advanced-panel"]');
    const toggle = container.querySelector<HTMLElement>('[data-testid="agent-advanced-toggle"]');

    // Name, one-line job and how-it-works are always on the page…
    expect(container.querySelector('#agent-display-name')).toBeTruthy();
    expect(container.querySelector('#agent-description')).toBeTruthy();
    expect(container.querySelector('#agent-prompt')).toBeTruthy();

    // …everything with a safe default starts folded behind one disclosure.
    expect(panel?.hasAttribute('hidden')).toBe(true);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(panel?.querySelector('[data-testid="agent-route-describe"]')).toBeTruthy();

    await clickButton('agent-advanced-toggle');

    expect(panel?.hasAttribute('hidden')).toBe(false);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
  });

  it('creates from the plain form without asking for an English runtime ID', async () => {
    await renderPage();

    expect(container.querySelector('#agent-display-name')).toBeTruthy();
    expect(container.textContent).toContain('agentsOverview.form.runtimeIdAuto');
    expect(container.querySelector('input[placeholder*="letter"]')).toBeNull();

    await act(async () => {
      setInputValue(container.querySelector('#agent-display-name')!, '前端开发专家');
      setInputValue(container.querySelector('#agent-description')!, '负责前端交付');
      setInputValue(container.querySelector('#agent-prompt')!, '你负责实现和验证前端功能。');
      await Promise.resolve();
    });
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
  }, 15_000);

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

  it('yields a ready debug panel once the draft is valid', async () => {
    flowChatStoreMock.sessions.set('debug-session-1', {
      sessionId: 'debug-session-1',
      title: 'Debug',
    } as unknown as Record<string, unknown>);
    await renderPage();

    await act(async () => {
      setInputValue(container.querySelector('#agent-display-name')!, '前端开发专家');
      setInputValue(container.querySelector('#agent-description')!, '负责前端交付');
      setInputValue(container.querySelector('#agent-prompt')!, '你负责实现和验证前端功能。');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(debugRuntime.createDebugSession).toHaveBeenCalledTimes(1);
    expect(debugPanelProps.props?.status).toBe('ready');
    expect(debugPanelProps.props?.session).toEqual(
      expect.objectContaining({ sessionId: 'debug-session-1' }),
    );
    expect(container.querySelector('[data-testid="agent-debug-chat-column"]')).toBeTruthy();
  });

  it('disposes the debug session when navigating back', async () => {
    await renderPage();

    await act(async () => {
      setInputValue(container.querySelector('#agent-display-name')!, '前端开发专家');
      setInputValue(container.querySelector('#agent-description')!, '负责前端交付');
      setInputValue(container.querySelector('#agent-prompt')!, '你负责实现和验证前端功能。');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(debugRuntime.createDebugSession).toHaveBeenCalledTimes(1);

    await clickButton('agentsOverview.form.cancel');
    expect(useAgentsStore.getState().page).toBe('home');

    act(() => root.unmount());

    expect(debugRuntime.disposeDebugSession).toHaveBeenCalledTimes(1);
    expect(debugRuntime.disposeDebugSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'debug-session-1' }),
    );
  });
});
