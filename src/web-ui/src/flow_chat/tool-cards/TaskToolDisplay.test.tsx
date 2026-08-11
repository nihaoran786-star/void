import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskToolDisplay } from './TaskToolDisplay';
import { taskCollapseStateManager } from '../store/TaskCollapseStateManager';
import type { FlowToolItem, ToolCardConfig } from '../types/flow-chat';
import { useTeamWorkspacePresentationStore } from '@/team_workspace';

const mocks = vi.hoisted(() => ({
  openBtwSessionInAuxPane: vi.fn(),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return actual;
});

vi.mock('../../component-library', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  CubeLoading: () => <span data-testid="cube-loading" />,
}));

vi.mock('@/component-library/components/Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('@/shared/services/reviewTeamService', () => ({
  getReviewerContextBySubagentId: () => null,
}));

vi.mock('./ToolTimeoutIndicator', () => ({
  ToolTimeoutIndicator: () => <span data-testid="tool-timeout-indicator" />,
}));

vi.mock('../services/openBtwSession', () => ({
  openBtwSessionInAuxPane: (...args: unknown[]) => mocks.openBtwSessionInAuxPane(...args),
}));

vi.mock('../store/FlowChatStore', () => ({
  flowChatStore: {
    subscribe: () => () => {},
    getState: () => ({
      sessions: new Map([
        ['parent-session', {
          sessionId: 'parent-session',
          workspacePath: 'D:\\workspace\\repo',
          remoteConnectionId: 'remote-1',
          remoteSshHost: 'host-1',
        }],
      ]),
    }),
  },
}));

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

const config: ToolCardConfig = {
  toolName: 'Task',
  displayName: 'Task',
  icon: 'task',
  requiresConfirmation: false,
  resultDisplayType: 'summary',
};

function failedTaskItem(): FlowToolItem {
  return {
    id: 'task-tool-1',
    type: 'tool',
    toolName: 'Task',
    timestamp: Date.now(),
    status: 'error',
    toolCall: {
      id: 'task-call-1',
      input: {
        description: 'Review frontend',
        prompt: 'Review frontend code',
        subagent_type: 'ReviewFrontend',
      },
    },
    toolResult: {
      success: false,
      result: null,
      error: 'Subagent failed before finishing.',
    },
  };
}

function reviewTaskItem(
  status: FlowToolItem['status'],
  subagentType = 'ReviewFrontend',
  description = `Review frontend [packet reviewer:${subagentType}:group-1-of-1]`,
): FlowToolItem {
  return {
    id: 'task-tool-1',
    type: 'tool',
    toolName: 'Task',
    timestamp: Date.now(),
    status,
    toolCall: {
      id: 'task-call-1',
      input: {
        description,
        prompt: 'Review frontend code',
        subagent_type: subagentType,
      },
    },
    toolResult:
      status === 'completed'
        ? {
            success: true,
            result: {
              duration: 1000,
            },
          }
        : undefined,
  };
}

describeWithJsdom('TaskToolDisplay', () => {
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
    vi.stubGlobal('CustomEvent', window.CustomEvent);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    taskCollapseStateManager.clearAll();
    useTeamWorkspacePresentationStore.setState({ sessions: {} });
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
    vi.clearAllMocks();
    taskCollapseStateManager.clearAll();
  });

  it('allows a failed subagent task card to collapse after it was expanded', async () => {
    taskCollapseStateManager.setCollapsed('task-tool-1', false);

    await act(async () => {
      root.render(
        <TaskToolDisplay
          toolItem={failedTaskItem()}
          config={config}
          sessionId="parent-session"
        />,
      );
    });

    expect(taskCollapseStateManager.isCollapsed('task-tool-1')).toBe(false);

    const card = container.querySelector<HTMLElement>('.base-tool-card');
    expect(card).toBeTruthy();

    await act(async () => {
      card!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(taskCollapseStateManager.isCollapsed('task-tool-1')).toBe(true);
  });

  it('keeps Deep Review reviewer task cards collapsed when they start running', async () => {
    await act(async () => {
      root.render(
        <TaskToolDisplay
          toolItem={reviewTaskItem('completed')}
          config={config}
          sessionId="parent-session"
        />,
      );
    });

    expect(taskCollapseStateManager.isCollapsed('task-tool-1')).toBe(true);

    await act(async () => {
      root.render(
        <TaskToolDisplay
          toolItem={reviewTaskItem('streaming')}
          config={config}
          sessionId="parent-session"
        />,
      );
    });

    expect(taskCollapseStateManager.isCollapsed('task-tool-1')).toBe(true);
  });

  it('keeps extra Deep Review reviewer task cards collapsed from packet metadata', async () => {
    await act(async () => {
      root.render(
        <TaskToolDisplay
          toolItem={reviewTaskItem('completed', 'ExtraReadonlyReview')}
          config={config}
          sessionId="parent-session"
        />,
      );
    });

    expect(taskCollapseStateManager.isCollapsed('task-tool-1')).toBe(true);

    await act(async () => {
      root.render(
        <TaskToolDisplay
          toolItem={reviewTaskItem('running', 'ExtraReadonlyReview')}
          config={config}
          sessionId="parent-session"
        />,
      );
    });

    expect(taskCollapseStateManager.isCollapsed('task-tool-1')).toBe(true);
  });

  it('renders the quiet status ring and step narrative while a subagent runs', async () => {
    await act(async () => {
      root.render(
        <TaskToolDisplay
          toolItem={reviewTaskItem('running', 'Explore', 'Map the dependency chain')}
          config={config}
          sessionId="parent-session"
        />,
      );
    });

    expect(container.querySelector('.task-status-ring--active')).toBeTruthy();
    const steps = Array.from(container.querySelectorAll('.task-steps__step'));
    expect(steps).toHaveLength(3);
    expect(steps[2]?.classList.contains('task-steps__step--now')).toBe(true);
    expect(steps[0]?.classList.contains('task-steps__step--past')).toBe(true);
    expect(container.querySelector('[data-testid="cube-loading"]')).toBeNull();
  });

  it('keeps settled delegation cards quiet: static ring, no step narrative', async () => {
    await act(async () => {
      root.render(
        <TaskToolDisplay
          toolItem={reviewTaskItem('completed', 'Explore', 'Map the dependency chain')}
          config={config}
          sessionId="parent-session"
        />,
      );
    });

    expect(container.querySelector('.task-status-ring--done')).toBeTruthy();
    expect(container.querySelector('.task-status-ring--animate')).toBeNull();
    expect(container.querySelector('.task-steps')).toBeNull();
  });

  it('animates completion once after this mount observes the task running', async () => {
    const renderStatus = async (status: FlowToolItem['status']) => {
      await act(async () => {
        root.render(
          <TaskToolDisplay
            toolItem={reviewTaskItem(status, 'Explore', 'Map the dependency chain')}
            config={config}
            sessionId="parent-session"
          />,
        );
      });
    };

    await renderStatus('pending');
    expect(container.querySelector('.task-status-ring--animate')).toBeNull();

    await renderStatus('running');
    expect(container.querySelector('.task-status-ring--active')).toBeTruthy();

    await renderStatus('completed');
    expect(container.querySelector('.task-status-ring--animate')).toBeTruthy();

    await renderStatus('running');
    await renderStatus('completed');
    expect(container.querySelector('.task-status-ring--animate')).toBeNull();
  });

  it('opens the real subagent session in the aux pane when the task card rail is clicked', async () => {
    const toolItem: FlowToolItem = {
      ...reviewTaskItem('completed', 'Explore', 'Investigate task card behavior'),
      subagentSessionId: 'subagent-session-1',
    };

    await act(async () => {
      root.render(
        <TaskToolDisplay
          toolItem={toolItem}
          config={config}
          sessionId="parent-session"
        />,
      );
    });

    const openButton = container.querySelector<HTMLButtonElement>('.task-header-rail__hit');
    expect(openButton).toBeTruthy();

    await act(async () => {
      openButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.openBtwSessionInAuxPane).toHaveBeenCalledWith({
      childSessionId: 'subagent-session-1',
      parentSessionId: 'parent-session',
      workspacePath: 'D:\\workspace\\repo',
      sessionKind: 'subagent',
      sessionTitle: expect.any(String),
      agentType: 'Explore',
      parentToolCallId: 'task-call-1',
      subagentType: 'Explore',
      remoteConnectionId: 'remote-1',
      remoteSshHost: 'host-1',
      includeInternal: true,
    });
  });

  it('routes a bound Team member to the dedicated right workspace instead of the canvas', async () => {
    useTeamWorkspacePresentationStore.setState({
      sessions: {
        'parent-session': {
          bindingKey: 'team-binding-1',
          isOpen: false,
          selectedMemberId: null,
          members: [{
            memberId: 'member-script',
            childSessionId: 'subagent-session-1',
            agentId: 'ScriptAI',
          }],
        },
      },
    });
    const toolItem: FlowToolItem = {
      ...reviewTaskItem('completed', 'ScriptAI', 'Write the short-drama script'),
      subagentSessionId: 'subagent-session-1',
    };

    await act(async () => {
      root.render(
        <TaskToolDisplay
          toolItem={toolItem}
          config={config}
          sessionId="parent-session"
        />,
      );
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.task-header-rail__hit')?.click();
    });

    expect(mocks.openBtwSessionInAuxPane).not.toHaveBeenCalled();
    expect(
      useTeamWorkspacePresentationStore.getState().sessions['parent-session'],
    ).toMatchObject({
      isOpen: true,
      selectedMemberId: 'member-script',
    });
  });

  it('routes a Team member by stable agent identity while its child binding is still hydrating', async () => {
    useTeamWorkspacePresentationStore.setState({
      sessions: {
        'parent-session': {
          bindingKey: 'team-binding-1',
          isOpen: false,
          selectedMemberId: null,
          members: [{
            memberId: 'member-script',
            agentId: 'ScriptAI',
          }],
        },
      },
    });
    const toolItem: FlowToolItem = {
      ...reviewTaskItem('running', 'ScriptAI', 'Write the short-drama script'),
      subagentSessionId: 'late-child-session',
    };

    await act(async () => {
      root.render(
        <TaskToolDisplay
          toolItem={toolItem}
          config={config}
          sessionId="parent-session"
        />,
      );
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.task-header-rail__hit')?.click();
    });

    expect(mocks.openBtwSessionInAuxPane).not.toHaveBeenCalled();
    expect(
      useTeamWorkspacePresentationStore.getState().sessions['parent-session'],
    ).toMatchObject({
      isOpen: true,
      selectedMemberId: 'member-script',
    });
  });

  it('shows the typed recovery block reason on a hydrated task card', async () => {
    taskCollapseStateManager.setCollapsed('task-tool-1', false);
    const toolItem: FlowToolItem = {
      ...reviewTaskItem('completed', 'Explore', 'Resume interrupted task'),
      subagentTask: {
        schemaVersion: 3,
        taskId: 'bg-1',
        parentSessionId: 'parent-session',
        childSessionId: 'subagent-session-1',
        objective: 'Resume interrupted task',
        executionMode: 'background',
        contextMode: 'fresh',
        status: 'interrupted',
        owner: 'worker-1',
        deliveryState: 'blocked',
        deliveryReplaySafety: 'idempotent',
        deliveryIdempotencyKey: 'delivery-1',
        deliveryAttempts: 1,
        recoveryState: 'blocked',
        recoveryBlock: {
          code: 'missing_launch_spec',
          detail: 'The legacy task has no durable launch inputs.',
        },
        createdAt: 10,
        updatedAt: 20,
      },
    };

    await act(async () => {
      root.render(
        <TaskToolDisplay
          toolItem={toolItem}
          config={config}
          sessionId="parent-session"
        />,
      );
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'missing_launch_spec: The legacy task has no durable launch inputs.',
    );
  });
});
