// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { FlowChatState, Session } from '../../types/flow-chat';

let flowChatState: FlowChatState;
const flowChatListeners = new Set<(state: FlowChatState) => void>();
const mockCancelSession = vi.fn();
const mockLoadSessionHistory = vi.fn();
const reviewActionBarRenderMock = vi.hoisted(() => vi.fn());
const childComposerRenderMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('../modern/VirtualItemRenderer', async () => {
  const activity = await vi.importActual<typeof import('../modern/FlowChatPresentationActivity')>(
    '../modern/FlowChatPresentationActivity'
  );
  return {
    VirtualItemRenderer: () => (
      <div
        data-testid="virtual-presentation-activity"
        data-active={String(activity.useFlowChatPresentationActive())}
      />
    ),
  };
});

vi.mock('./DeepReviewActionBar', async () => {
  const activity = await vi.importActual<typeof import('../modern/FlowChatPresentationActivity')>(
    '../modern/FlowChatPresentationActivity'
  );
  return {
    ReviewActionBar: (props: {
      childSessionId?: string;
      isActive?: boolean;
      presentationSession?: Session | null;
    }) => {
      reviewActionBarRenderMock(props);
      return (
        <div
          data-testid="review-action-presentation-activity"
          data-active={String(activity.useFlowChatPresentationActive())}
          data-presentation-active={String(props.isActive)}
          data-session-title={props.presentationSession?.title ?? ''}
        />
      );
    },
  };
});

vi.mock('../modern/ProcessingIndicator', () => ({
  ProcessingIndicator: () => <div />,
}));

vi.mock('../modern/processingIndicatorVisibility', () => ({
  shouldReserveProcessingIndicatorSpace: () => false,
  shouldShowProcessingIndicator: () => false,
}));

vi.mock('../LazyChatInput', () => ({
  LazyChatInput: (props: {
    sessionId?: string;
    parentSessionId?: string;
    className?: string;
  }) => {
    childComposerRenderMock(props);
    return <div data-testid="mock-child-composer" />;
  },
}));

vi.mock('../modern/useExploreGroupState', () => ({
  useExploreGroupState: () => ({
    exploreGroupStates: {},
    onExploreGroupToggle: vi.fn(),
    onExpandGroup: vi.fn(),
    onExpandAllInTurn: vi.fn(),
    onCollapseGroup: vi.fn(),
  }),
}));

vi.mock('@/flow_chat', () => ({
  ScrollToBottomButton: () => <div />,
}));

vi.mock('@/component-library', () => ({
  IconButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('@/shared/services/FileTabManager', () => ({
  fileTabManager: { openFile: vi.fn() },
}));

vi.mock('@/shared/utils/tabUtils', () => ({ createTab: vi.fn() }));

vi.mock('@/infrastructure/api', () => ({
  agentAPI: { cancelSession: (...args: unknown[]) => mockCancelSession(...args) },
}));

vi.mock('@/infrastructure/api/service-api/BtwAPI', () => ({
  btwAPI: { updateMemoryEnabled: vi.fn() },
}));

vi.mock('@/infrastructure/event-bus', () => ({
  globalEventBus: { emit: vi.fn() },
}));

vi.mock('@/shared/notification-system', () => ({
  notificationService: { error: vi.fn() },
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../store/FlowChatStore', () => ({
  flowChatStore: {
    getState: () => flowChatState,
    subscribe: (listener: (state: FlowChatState) => void) => {
      flowChatListeners.add(listener);
      return () => flowChatListeners.delete(listener);
    },
    loadSessionHistory: (...args: unknown[]) => mockLoadSessionHistory(...args),
  },
}));

vi.mock('../../store/modernFlowChatStore', () => ({
  sessionToVirtualItems: () => [{ turnId: 'turn-1', type: 'model-round' }],
}));

vi.mock('../../utils/reviewSessionStop', () => ({
  settleStoppedReviewSessionState: vi.fn(),
}));

vi.mock('../../services/ReviewActionBarPersistenceService', () => ({
  loadPersistedReviewState: vi.fn(() => Promise.resolve(null)),
}));

import { BtwSessionPanel } from './BtwSessionPanel';
import { useReviewActionBarStore } from '../../store/deepReviewActionBarStore';

function createDeepReviewSession(): Session {
  return {
    sessionId: 'review-child',
    title: 'Review child',
    dialogTurns: [{
      id: 'turn-1',
      sessionId: 'review-child',
      userMessage: { id: 'user-1', content: 'review', timestamp: 1 },
      modelRounds: [{
        id: 'round-1',
        index: 0,
        items: [{
          id: 'text-1',
          type: 'text',
          content: 'streaming',
          isStreaming: true,
          timestamp: 2,
          status: 'streaming',
        }],
        isStreaming: true,
        isComplete: false,
        status: 'streaming',
        startTime: 1,
      }],
      status: 'processing',
      startTime: 1,
    }],
    status: 'idle',
    config: {},
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    sessionKind: 'deep_review',
    parentSessionId: 'parent',
    workspacePath: 'D:/workspace/project',
  } as Session;
}

function createParentSession(): Session {
  return {
    ...createDeepReviewSession(),
    sessionId: 'parent',
    dialogTurns: [],
    sessionKind: undefined,
    parentSessionId: undefined,
  } as Session;
}

function createComposableChildSession(
  sessionKind: 'btw' | 'subagent',
): Session {
  return {
    ...createDeepReviewSession(),
    sessionId: `${sessionKind}-child`,
    title: `${sessionKind} child`,
    dialogTurns: [],
    sessionKind,
    parentSessionId: 'parent',
    parentToolCallId: sessionKind === 'subagent' ? 'task-1' : undefined,
    subagentType: sessionKind === 'subagent' ? 'Researcher' : undefined,
  } as Session;
}

describe('BtwSessionPanel presentation lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;
  let resizeObserverCount: number;
  let resizeObserverDisconnect: ReturnType<typeof vi.fn>;
  let requestFrame: ReturnType<typeof vi.fn>;
  let cancelFrame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    flowChatListeners.clear();
    useReviewActionBarStore.getState().reset();
    mockLoadSessionHistory.mockResolvedValue(undefined);
    flowChatState = {
      sessions: new Map([
        ['review-child', createDeepReviewSession()],
        ['parent', createParentSession()],
      ]),
      activeSessionId: 'parent',
    };

    requestFrame = vi.fn(() => 41);
    cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    resizeObserverCount = 0;
    resizeObserverDisconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor() {
        resizeObserverCount += 1;
      }
      observe() {}
      disconnect() {
        resizeObserverDisconnect();
      }
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    flowChatListeners.clear();
    useReviewActionBarStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it('uses a short-drama presentation title without mutating the child session', async () => {
    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="review-child"
          parentSessionId="parent"
          workspacePath="D:/workspace/project"
          presentationTitle="剧本 AI"
          showKindBadge={false}
          isActive={false}
        />,
      );
    });

    expect(container.querySelector('.btw-session-panel__title')?.textContent)
      .toBe('剧本 AI');
    expect(container.querySelector('.btw-session-panel__badge')).toBeNull();
    expect(flowChatState.sessions.get('review-child')?.title).toBe('Review child');
  });

  it.each(['btw', 'subagent'] as const)(
    'mounts a full independent composer for a %s child session',
    async (sessionKind) => {
      const childSession = createComposableChildSession(sessionKind);
      flowChatState = {
        sessions: new Map([
          [childSession.sessionId, childSession],
          ['parent', createParentSession()],
        ]),
        activeSessionId: 'parent',
      };

      await act(async () => {
        root.render(
          <BtwSessionPanel
            childSessionId={childSession.sessionId}
            parentSessionId="parent"
            workspacePath="D:/workspace/project"
            isActive
          />,
        );
      });

      expect(container.querySelector('[data-testid="mock-child-composer"]'))
        .not.toBeNull();
      expect(childComposerRenderMock).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: childSession.sessionId,
        parentSessionId: 'parent',
        className: 'void-chat-input--embedded',
      }));
    },
  );

  it('does not mount a composer for review-only child sessions', async () => {
    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="review-child"
          parentSessionId="parent"
          workspacePath="D:/workspace/project"
          isActive
        />,
      );
    });

    expect(container.querySelector('[data-testid="mock-child-composer"]')).toBeNull();
    expect(childComposerRenderMock).not.toHaveBeenCalled();
  });

  it('pauses the message presentation subtree while ReviewActionBar stays live', async () => {
    useReviewActionBarStore.getState().showRunningActionBar({
      childSessionId: 'review-child',
      parentSessionId: 'parent',
      reviewMode: 'deep',
    });
    useReviewActionBarStore.getState().restore('review-child');
    const scheduleTimeout = vi.spyOn(globalThis, 'setTimeout');

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="review-child"
          parentSessionId="parent"
          workspacePath="D:/workspace/project"
          isActive={false}
        />,
      );
    });

    expect(flowChatListeners.size).toBe(1);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(scheduleTimeout).not.toHaveBeenCalled();
    expect(resizeObserverCount).toBe(0);
    expect(container.querySelector('[data-testid="virtual-presentation-activity"]')?.getAttribute('data-active'))
      .toBe('false');
    expect(container.querySelector('[data-testid="review-action-presentation-activity"]')?.getAttribute('data-active'))
      .toBe('true');

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="review-child"
          parentSessionId="parent"
          workspacePath="D:/workspace/project"
          isActive
        />,
      );
    });

    expect(flowChatListeners.size).toBe(2);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 500);
    expect(resizeObserverCount).toBe(1);
    expect(container.querySelector('[data-testid="virtual-presentation-activity"]')?.getAttribute('data-active'))
      .toBe('true');

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="review-child"
          parentSessionId="parent"
          workspacePath="D:/workspace/project"
          isActive={false}
        />,
      );
    });

    expect(flowChatListeners.size).toBe(1);
    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(resizeObserverDisconnect).toHaveBeenCalled();

    act(() => root.unmount());
    root = createRoot(container);
    expect(mockCancelSession).not.toHaveBeenCalled();
  });

  it('starts history hydration when a hidden child session appears without cancelling it', async () => {
    flowChatState = {
      sessions: new Map([['parent', createParentSession()]]),
      activeSessionId: 'parent',
    };

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="historical-child"
          parentSessionId="parent"
          workspacePath="D:/workspace/project"
          isActive={false}
        />,
      );
    });
    expect(mockLoadSessionHistory).not.toHaveBeenCalled();

    const historicalSession = {
      ...createDeepReviewSession(),
      sessionId: 'historical-child',
      title: 'Historical subagent',
      dialogTurns: [],
      sessionKind: 'subagent',
      parentSessionId: 'parent',
      parentToolCallId: 'task-1',
      subagentType: 'Researcher',
      isHistorical: true,
    } as Session;
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['parent', createParentSession()],
        ['historical-child', historicalSession],
      ]),
    };

    await act(async () => {
      flowChatListeners.forEach(listener => listener(flowChatState));
      await Promise.resolve();
    });

    expect(mockLoadSessionHistory).toHaveBeenCalledWith(
      'historical-child',
      'D:/workspace/project',
      undefined,
      undefined,
      undefined,
      { includeInternal: true },
    );
    expect(mockCancelSession).not.toHaveBeenCalled();
  });

  it('hydrates a newly selected historical child while another hydration remains in flight', async () => {
    const historicalChildA = {
      ...createComposableChildSession('subagent'),
      sessionId: 'historical-child-a',
      isHistorical: true,
    } as Session;
    const historicalChildB = {
      ...createComposableChildSession('subagent'),
      sessionId: 'historical-child-b',
      isHistorical: true,
    } as Session;
    flowChatState = {
      sessions: new Map([
        ['parent', createParentSession()],
        [historicalChildA.sessionId, historicalChildA],
        [historicalChildB.sessionId, historicalChildB],
      ]),
      activeSessionId: 'parent',
    };

    let resolveFirstHydration!: () => void;
    const firstHydration = new Promise<void>((resolve) => {
      resolveFirstHydration = resolve;
    });
    mockLoadSessionHistory
      .mockImplementationOnce(() => firstHydration)
      .mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId={historicalChildA.sessionId}
          parentSessionId="parent"
          workspacePath="D:/workspace/project"
          isActive
        />,
      );
    });
    expect(mockLoadSessionHistory).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId={historicalChildB.sessionId}
          parentSessionId="parent"
          workspacePath="D:/workspace/project"
          isActive
        />,
      );
    });

    expect(mockLoadSessionHistory).toHaveBeenCalledTimes(2);
    expect(mockLoadSessionHistory).toHaveBeenLastCalledWith(
      historicalChildB.sessionId,
      'D:/workspace/project',
      undefined,
      undefined,
      undefined,
      { includeInternal: true },
    );

    await act(async () => {
      resolveFirstHydration();
      await firstHydration;
    });
  });

  it('keeps hidden queue updates shallow and restores the latest presentation session', async () => {
    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'review-child',
      parentSessionId: 'parent',
      reviewMode: 'deep',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue'],
      },
      phase: 'review_completed',
    });
    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'review-other',
      parentSessionId: 'parent',
      reviewMode: 'deep',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix other issue'],
      },
      phase: 'review_completed',
    });

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="review-child"
          parentSessionId="parent"
          workspacePath="D:/workspace/project"
          isActive={false}
        />,
      );
    });
    expect(reviewActionBarRenderMock).toHaveBeenCalledTimes(1);
    expect(reviewActionBarRenderMock.mock.lastCall?.[0]).toMatchObject({
      isActive: false,
      presentationSession: expect.objectContaining({ title: 'Review child' }),
    });

    await act(async () => {
      useReviewActionBarStore.getState().setCapacityQueueState({
        status: 'queued_for_capacity',
        queuedReviewerCount: 1,
      }, 'review-child');
      useReviewActionBarStore.getState().setCapacityQueueState({
        status: 'queued_for_capacity',
        queuedReviewerCount: 2,
      }, 'review-other');
    });
    expect(reviewActionBarRenderMock).toHaveBeenCalledTimes(1);

    const latestSession = {
      ...createDeepReviewSession(),
      title: 'Latest review child',
    } as Session;
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['review-child', latestSession],
        ['parent', createParentSession()],
      ]),
    };
    await act(async () => {
      flowChatListeners.forEach(listener => listener(flowChatState));
    });
    expect(reviewActionBarRenderMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="review-child"
          parentSessionId="parent"
          workspacePath="D:/workspace/project"
          isActive
        />,
      );
    });
    expect(reviewActionBarRenderMock).toHaveBeenCalledTimes(2);
    expect(reviewActionBarRenderMock.mock.lastCall?.[0]).toMatchObject({
      isActive: true,
      presentationSession: expect.objectContaining({ title: 'Latest review child' }),
    });
  });

  it('retains a minimized action lifecycle without forwarding presentation churn', async () => {
    useReviewActionBarStore.getState().showRunningActionBar({
      childSessionId: 'review-child',
      parentSessionId: 'parent',
      reviewMode: 'deep',
    });
    useReviewActionBarStore.getState().restore('review-child');

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="review-child"
          parentSessionId="parent"
          workspacePath="D:/workspace/project"
          isActive
        />,
      );
    });
    expect(reviewActionBarRenderMock).toHaveBeenCalledTimes(1);
    expect(reviewActionBarRenderMock.mock.lastCall?.[0]).toMatchObject({ isActive: true });

    await act(async () => {
      useReviewActionBarStore.getState().minimize('review-child');
    });
    expect(container.querySelector('.btw-session-panel__action-bar-wrapper')?.hasAttribute('hidden'))
      .toBe(true);
    expect(reviewActionBarRenderMock).toHaveBeenCalledTimes(2);
    const minimizedPresentationSession = reviewActionBarRenderMock.mock.lastCall?.[0]
      ?.presentationSession;
    expect(reviewActionBarRenderMock.mock.lastCall?.[0]).toMatchObject({ isActive: false });

    const latestSession = {
      ...createDeepReviewSession(),
      title: 'Updated while minimized',
    } as Session;
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['review-child', latestSession],
        ['parent', createParentSession()],
      ]),
    };
    await act(async () => {
      flowChatListeners.forEach(listener => listener(flowChatState));
    });
    expect(reviewActionBarRenderMock).toHaveBeenCalledTimes(2);
    expect(reviewActionBarRenderMock.mock.lastCall?.[0]?.presentationSession)
      .toBe(minimizedPresentationSession);

    await act(async () => {
      useReviewActionBarStore.getState().restore('review-child');
    });
    expect(reviewActionBarRenderMock).toHaveBeenCalledTimes(3);
    expect(reviewActionBarRenderMock.mock.lastCall?.[0]).toMatchObject({
      isActive: true,
      presentationSession: expect.objectContaining({ title: 'Updated while minimized' }),
    });
  });
});
