import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { FlowChatContext } from './FlowChatContext';
import { UserMessageItem } from './UserMessageItem';
import { snapshotAPI } from '@/infrastructure/api';
import { globalEventBus } from '@/infrastructure/event-bus';
import { confirmDanger } from '@/component-library';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const activeSessionRef: { current: any } = {
  current: null,
};

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'steering.statusPending': '等待触发',
        'steering.statusInjected': '已触发',
        'message.copy': '复制',
        'message.copied': '已复制',
        'message.copyFailed': '复制失败',
        'message.backgroundSubagentResult': '团队成员已返回后台任务结果',
        'message.edit': '编辑消息',
        'message.cannotRollback': '无法回滚',
        'message.rollbackTo': '回滚到此消息前',
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('../../store/modernFlowChatStore', () => ({
  useActiveSession: () => activeSessionRef.current,
  useModernFlowChatStore: {
    getState: () => ({ activeSession: activeSessionRef.current }),
  },
}));

vi.mock('./useFlowChatPresentationStore', () => ({
  usePresentationActiveSession: () => activeSessionRef.current,
  usePresentationSessionRelationship: () => {
    const session = activeSessionRef.current as {
      sessionKind?: string;
      parentSessionId?: string;
    } | null;
    const kind = session?.sessionKind;
    return {
      kind,
      isBtw: kind === 'btw',
      isSubagent: kind === 'subagent',
      isReview: kind === 'review' || kind === 'deep_review',
      isDeepReview: kind === 'deep_review',
      parentSessionId: session?.parentSessionId,
      displayAsChild: Boolean(session?.parentSessionId),
      canOpenInAuxPane: Boolean(kind && kind !== 'normal' && session?.parentSessionId),
      origin: undefined,
    };
  },
  usePresentationTurnIndex: (turnId: string) => (
    activeSessionRef.current?.dialogTurns.findIndex(turn => turn.id === turnId) ?? -1
  ),
  usePresentationTurnStatus: (turnId: string) => (
    activeSessionRef.current?.dialogTurns.find(turn => turn.id === turnId)?.status ?? null
  ),
}));

const flowChatStoreMock = vi.hoisted(() => ({
  getState: vi.fn(() => ({
    sessions: new Map(),
    activeSessionId: null,
  })),
  truncateDialogTurnsFrom: vi.fn(),
}));

vi.mock('../../store/FlowChatStore', () => ({
  FlowChatStore: {
    getInstance: () => flowChatStoreMock,
  },
  flowChatStore: flowChatStoreMock,
}));

vi.mock('@/infrastructure/api', () => ({
  snapshotAPI: {
    rollbackToTurn: vi.fn(),
  },
}));

vi.mock('@/shared/notification-system', () => ({
  notificationService: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/infrastructure/event-bus', () => ({
  globalEventBus: {
    emit: vi.fn(),
  },
}));

vi.mock('@/component-library', () => ({
  ReproductionStepsBlock: ({ steps }: { steps: string }) => <div>{steps}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  confirmDanger: vi.fn(),
}));

describe('UserMessageItem steering tag', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(),
      },
    });

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    activeSessionRef.current = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  });

  it('renders pending steering tag on the right side of the message row', () => {
    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ allowUserMessageRollback: false }}>
          <UserMessageItem
            message={{
              id: 'user-steering-1',
              content: 'Please adjust this now',
              timestamp: 1000,
            }}
            turnId="turn-1"
            steeringStatus="pending"
          />
        </FlowChatContext.Provider>,
      );
    });

    const main = container.querySelector('.user-message-item__main');
    const tag = main?.querySelector('.user-message-item__steering-tag');

    expect(tag?.textContent).toBe('等待触发');
  });

  it('does not render a steering tag after steering is triggered', () => {
    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ allowUserMessageRollback: false }}>
          <UserMessageItem
            message={{
              id: 'user-steering-1',
              content: 'Please adjust this now',
              timestamp: 1000,
            }}
            turnId="turn-1"
            steeringStatus="completed"
          />
        </FlowChatContext.Provider>,
      );
    });

    expect(container.querySelector('.user-message-item__steering-tag')).toBeNull();
  });

  it('renders a Team background delivery without exposing its internal protocol', () => {
    activeSessionRef.current = {
      sessionId: 'main-session',
      sessionKind: 'normal',
      dialogTurns: [{ id: 'turn-1', status: 'completed' }],
    };

    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'main-session' }}>
          <UserMessageItem
            message={{
              id: 'background-result-1',
              content: "Background subagent 'ScriptAI' completed successfully: <result>done</result>",
              timestamp: 1000,
              metadata: {
                kind: 'background_result',
                sourceKind: 'subagent',
              },
            }}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });

    expect(container.textContent).toContain('团队成员已返回后台任务结果');
    expect(container.textContent).not.toContain("Background subagent 'ScriptAI'");
    expect(container.querySelector('.user-message-item__edit-btn')).toBeNull();
    expect(container.querySelector('.user-message-item__rollback-btn')).toBeNull();
  });

  it('hides the rollback button for subagent sessions', () => {
    activeSessionRef.current = {
      sessionId: 'subagent-session',
      sessionKind: 'subagent',
      dialogTurns: [
        {
          id: 'turn-1',
          status: 'completed',
        },
      ],
    };

    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'subagent-session', allowUserMessageRollback: true }}>
          <UserMessageItem
            message={{
              id: 'user-subagent-1',
              content: 'subagent question',
              timestamp: 1000,
            }}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });

    expect(container.querySelector('.user-message-item__rollback-btn')).toBeNull();
  });

  it('renders the rollback button for normal sessions when rollback is allowed', () => {
    activeSessionRef.current = {
      sessionId: 'main-session',
      sessionKind: 'normal',
      dialogTurns: [
        {
          id: 'turn-1',
          status: 'completed',
        },
      ],
    };

    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'main-session', allowUserMessageRollback: true }}>
          <UserMessageItem
            message={{
              id: 'user-main-1',
              content: 'main session question',
              timestamp: 1000,
            }}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });

    expect(container.querySelector('.user-message-item__rollback-btn')).not.toBeNull();
    expect(
      container.querySelector('.user-message-item__copy-btn')?.getAttribute('title'),
    ).toBe('复制');
    expect(
      container.querySelector('.user-message-item__edit-btn')?.getAttribute('aria-label'),
    ).toBe('编辑消息');
    expect(
      container.querySelector('.user-message-item__rollback-btn')?.getAttribute('aria-label'),
    ).toBe('回滚到此消息前');
  });

  it('fills the panel composer instead of the global chat input when rollback has a scoped handler', async () => {
    vi.mocked(confirmDanger).mockResolvedValue(true);
    vi.mocked(snapshotAPI.rollbackToTurn).mockResolvedValue([]);
    const fillPanelInput = vi.fn();
    activeSessionRef.current = {
      sessionId: 'btw-session',
      sessionKind: 'btw',
      dialogTurns: [
        {
          id: 'turn-1',
          status: 'completed',
        },
      ],
    };

    await act(async () => {
      root.render(
        <FlowChatContext.Provider
          value={{
            sessionId: 'btw-session',
            allowUserMessageRollback: true,
            onFillUserMessageInput: fillPanelInput,
          }}
        >
          <UserMessageItem
            message={{
              id: 'user-btw-1',
              content: 'btw rollback question',
              timestamp: 1000,
            }}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });

    const rollbackButton = container.querySelector<HTMLButtonElement>('.user-message-item__rollback-btn');
    expect(rollbackButton).not.toBeNull();

    await act(async () => {
      rollbackButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(fillPanelInput).toHaveBeenCalledWith({
      content: 'btw rollback question',
      composerPresentation: undefined,
      targetSessionId: 'btw-session',
    });
    expect(globalEventBus.emit).not.toHaveBeenCalledWith(
      'fill-chat-input',
      expect.anything(),
    );
  });

  it('hides the edit button when the panel context disables user message editing', () => {
    activeSessionRef.current = {
      sessionId: 'btw-session',
      sessionKind: 'btw',
      dialogTurns: [
        {
          id: 'turn-1',
          status: 'completed',
        },
      ],
    };

    act(() => {
      root.render(
        <FlowChatContext.Provider
          value={{
            sessionId: 'btw-session',
            allowUserMessageRollback: true,
            allowUserMessageEdit: false,
          }}
        >
          <UserMessageItem
            message={{
              id: 'user-btw-1',
              content: 'btw session question',
              timestamp: 1000,
            }}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });

    expect(container.querySelector('.user-message-item__edit-btn')).toBeNull();
  });

  it('renders persisted file, Skill and session references as accessible pills', () => {
    activeSessionRef.current = {
      sessionId: 'main-session',
      sessionKind: 'normal',
      dialogTurns: [{ id: 'turn-1', status: 'completed' }],
    };
    const composerPresentation = {
      version: 1,
      segments: [
        { type: 'text', text: 'Review ' },
        {
          type: 'context',
          context: {
            id: 'file-1',
            timestamp: 1,
            type: 'file',
            filePath: 'D:/work/a.ts',
            fileName: 'a.ts',
          },
        },
        { type: 'text', text: ' with ' },
        { type: 'skill', name: 'audit' },
        { type: 'text', text: ' from ' },
        {
          type: 'context',
          context: {
            id: 'session-ref-1',
            timestamp: 1,
            type: 'session-reference',
            sessionId: 'research-1',
            sessionTitle: 'Research',
          },
        },
      ],
    };

    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'main-session' }}>
          <UserMessageItem
            message={{
              id: 'user-1',
              content: 'legacy fallback',
              timestamp: 1000,
              metadata: { composerPresentation },
            }}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });

    expect(container.querySelector('[aria-label="file reference: a.ts"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Skill reference: audit"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Session reference: Research"]')).not.toBeNull();
    expect(container.querySelector('.user-message-item__edit-btn')?.hasAttribute('disabled')).toBe(true);
  });

  it('returns the structured presentation when filling a failed message back into the composer', () => {
    const composerPresentation = {
      version: 1,
      segments: [{ type: 'skill', name: 'audit' }],
    };
    activeSessionRef.current = {
      sessionId: 'main-session',
      sessionKind: 'normal',
      dialogTurns: [{ id: 'turn-1', status: 'error' }],
    };

    act(() => {
      root.render(
        <FlowChatContext.Provider value={{ sessionId: 'main-session' }}>
          <UserMessageItem
            message={{
              id: 'user-1',
              content: 'failed',
              timestamp: 1000,
              metadata: { composerPresentation },
            }}
            turnId="turn-1"
          />
        </FlowChatContext.Provider>,
      );
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="message.fillToInput"]')
        ?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(globalEventBus.emit).toHaveBeenCalledWith('fill-chat-input', {
      content: 'failed',
      composerPresentation: expect.objectContaining({ version: 1 }),
      targetSessionId: 'main-session',
    });
  });
});
