import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useReviewActionBarStore } from '../../store/deepReviewActionBarStore';
import type { Session } from '../../types/flow-chat';
import { DeepReviewActionBar, ReviewActionBar } from './DeepReviewActionBar';

const sendMessageMock = vi.hoisted(() => vi.fn());
const eventBusEmitMock = vi.hoisted(() => vi.fn());
const confirmWarningMock = vi.hoisted(() => vi.fn());
const continueDeepReviewSessionMock = vi.hoisted(() => vi.fn());
const aggregateReviewerProgressMock = vi.hoisted(() => vi.fn(() => []));
const buildReviewerProgressSummaryMock = vi.hoisted(() => vi.fn(() => null));
const buildErrorAttributionMock = vi.hoisted(() => vi.fn(() => null));
const buildRecoveryPlanMock = vi.hoisted(() => vi.fn(() => ({
  willPreserve: ['ReviewSecurity'],
  willRerun: ['ReviewPerformance'],
  willSkip: [],
  summaryText: '1 completed reviewer will be preserved; 1 reviewer will be rerun',
})));
const controlDeepReviewQueueMock = vi.hoisted(() => vi.fn());
const flowChatSessionsMock = vi.hoisted(() => new Map<string, unknown>());
const flowChatSubscribersMock = vi.hoisted(() => new Set<() => void>());
const notificationInfoMock = vi.hoisted(() => vi.fn());
const translationHookMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => {
    translationHookMock();
    return {
      t: (_key: string, options?: Record<string, unknown> & { defaultValue?: string }) => {
        const template = options?.defaultValue ?? _key;
        return template.replace(/{{(\w+)}}/g, (_match, token: string) => String(options?.[token] ?? _match));
      },
    };
  },
}));

vi.mock('@/component-library', () => ({
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
  Checkbox: ({
    checked,
    disabled,
    indeterminate,
    label,
    onChange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    indeterminate?: boolean;
    label?: React.ReactNode;
    onChange?: () => void;
  }) => (
    <label>
      <input
        type="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked ? 'true' : 'false'}
        checked={checked}
        disabled={disabled}
        readOnly
        onClick={() => {
          if (!disabled) {
            onChange?.();
          }
        }}
      />
      {label}
    </label>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../services/FlowChatManager', () => ({
  flowChatManager: {
    sendMessage: sendMessageMock,
  },
}));

vi.mock('@/infrastructure/api/service-api/AgentAPI', () => ({
  agentAPI: {
    controlDeepReviewQueue: controlDeepReviewQueueMock,
  },
}));

vi.mock('@/infrastructure/event-bus', () => ({
  globalEventBus: {
    emit: eventBusEmitMock,
  },
}));

vi.mock('@/component-library/components/ConfirmDialog/confirmService', () => ({
  confirmWarning: confirmWarningMock,
}));

vi.mock('@/shared/notification-system', () => ({
  notificationService: {
    error: vi.fn(),
    info: notificationInfoMock,
    success: vi.fn(),
  },
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../store/FlowChatStore', () => ({
  flowChatStore: {
    getState: () => ({
      sessions: flowChatSessionsMock,
      activeSessionId: null,
    }),
    subscribe: (listener: () => void) => {
      flowChatSubscribersMock.add(listener);
      return () => flowChatSubscribersMock.delete(listener);
    },
  },
}));

vi.mock('../../utils/deepReviewExperience', () => ({
  aggregateReviewerProgress: aggregateReviewerProgressMock,
  buildReviewerProgressSummary: buildReviewerProgressSummaryMock,
  extractPartialReviewData: () => null,
  buildErrorAttribution: buildErrorAttributionMock,
  buildRecoveryPlan: buildRecoveryPlanMock,
  evaluateDegradationOptions: () => [],
}));

vi.mock('../../services/DeepReviewContinuationService', () => ({
  continueDeepReviewSession: continueDeepReviewSessionMock,
}));

vi.mock('@/shared/ai-errors/aiErrorPresenter', () => ({
  getAiErrorPresentation: () => ({
    category: 'network',
    titleKey: 'test',
    messageKey: 'test',
    diagnostics: 'test diagnostics',
    actions: [],
  }),
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

function createProgressSession(
  sessionId: string,
  nonLastReviewerStatus: string,
): Session {
  return {
    sessionId,
    sessionKind: 'deep_review',
    dialogTurns: [{
      id: 'review-turn',
      status: 'processing',
      modelRounds: [{
        id: 'review-round',
        items: [
          {
            id: 'reviewer-task',
            type: 'tool',
            name: 'Task',
            status: nonLastReviewerStatus,
          },
          {
            id: 'stable-last-item',
            type: 'text',
            content: 'The last item is unchanged',
            status: 'streaming',
          },
        ],
      }],
    }],
    config: {},
  } as Session;
}

describeWithJsdom('DeepReviewActionBar', () => {
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
    vi.stubGlobal('localStorage', window.localStorage);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    sendMessageMock.mockResolvedValue(undefined);
    confirmWarningMock.mockResolvedValue(true);
    eventBusEmitMock.mockReturnValue(false);
    continueDeepReviewSessionMock.mockResolvedValue(undefined);
    buildErrorAttributionMock.mockReturnValue(null);
    aggregateReviewerProgressMock.mockReturnValue([]);
    buildReviewerProgressSummaryMock.mockReturnValue(null);
    flowChatSessionsMock.clear();
    flowChatSubscribersMock.clear();
    useReviewActionBarStore.getState().reset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    flowChatSessionsMock.clear();
    flowChatSubscribersMock.clear();
    useReviewActionBarStore.getState().reset();
  });

  const setProgressSummary = (handled: number, total = 2) => {
    aggregateReviewerProgressMock.mockReturnValue([
      { reviewer: 'ReviewSecurity', status: handled >= 1 ? 'completed' : 'running' },
      { reviewer: 'ReviewFrontend', status: handled >= 2 ? 'completed' : 'running' },
    ]);
    buildReviewerProgressSummaryMock.mockReturnValue({
      completed: handled,
      failed: 0,
      timedOut: 0,
      running: Math.max(0, total - handled),
      skipped: 0,
      unknown: 0,
      handled,
      total,
      text: `${handled}/${total} handled`,
    });
  };

  const finishFakeTimerTest = () => {
    act(() => root.unmount());
    root = createRoot(container);
    useReviewActionBarStore.getState().reset();
    vi.clearAllTimers();
    vi.useRealTimers();
  };

  it('keeps one hidden business deadline without an elapsed interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00Z'));
    try {
      const session = createProgressSession('hidden-review', 'running');
      setProgressSummary(1);
      useReviewActionBarStore.getState().showRunningActionBar({
        childSessionId: 'hidden-review',
        parentSessionId: 'parent-session',
        reviewMode: 'deep',
      });
      const intervalSpy = vi.spyOn(globalThis, 'setInterval');
      const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      await act(async () => {
        root.render(
          <ReviewActionBar
            childSessionId="hidden-review"
            isActive={false}
            presentationSession={session}
          />,
        );
      });

      expect(intervalSpy).not.toHaveBeenCalled();
      expect(timeoutSpy.mock.calls.filter((call) => call[1] === 3 * 60 * 1000)).toHaveLength(1);
      expect(flowChatSubscribersMock.size).toBe(0);
    } finally {
      finishFakeTimerTest();
    }
  });

  it('fills elapsed time from the stable start when presentation resumes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00Z'));
    try {
      const session = createProgressSession('resume-review', 'running');
      setProgressSummary(1);
      useReviewActionBarStore.getState().showRunningActionBar({
        childSessionId: 'resume-review',
        parentSessionId: 'parent-session',
        reviewMode: 'deep',
      });

      await act(async () => {
        root.render(
          <ReviewActionBar
            childSessionId="resume-review"
            presentationSession={session}
          />,
        );
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(container.textContent).toContain('Running for 2s');

      await act(async () => {
        root.render(
          <ReviewActionBar
            childSessionId="resume-review"
            isActive={false}
            presentationSession={session}
          />,
        );
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8_000);
      });
      expect(container.textContent).not.toContain('Running for');

      await act(async () => {
        root.render(
          <ReviewActionBar
            childSessionId="resume-review"
            isActive
            presentationSession={session}
          />,
        );
      });
      expect(container.textContent).toContain('Running for 10s');
    } finally {
      finishFakeTimerTest();
    }
  });

  it('notifies once at three minutes and keeps elapsed time monotonic', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00Z'));
    try {
      const session = createProgressSession('long-review', 'running');
      setProgressSummary(1);
      useReviewActionBarStore.getState().showRunningActionBar({
        childSessionId: 'long-review',
        parentSessionId: 'parent-session',
        reviewMode: 'deep',
      });
      notificationInfoMock.mockClear();

      await act(async () => {
        root.render(
          <ReviewActionBar
            childSessionId="long-review"
            presentationSession={session}
          />,
        );
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
      });

      expect(notificationInfoMock).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('Running for 3m 0s');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(notificationInfoMock).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('Running for 3m 5s');
    } finally {
      finishFakeTimerTest();
    }
  });

  it('clears elapsed and deadline timers on a terminal phase', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00Z'));
    try {
      const session = createProgressSession('terminal-review', 'running');
      setProgressSummary(1);
      useReviewActionBarStore.getState().showRunningActionBar({
        childSessionId: 'terminal-review',
        parentSessionId: 'parent-session',
        reviewMode: 'deep',
      });
      notificationInfoMock.mockClear();

      await act(async () => {
        root.render(
          <ReviewActionBar
            childSessionId="terminal-review"
            presentationSession={session}
          />,
        );
      });
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      await act(async () => {
        useReviewActionBarStore.getState().updatePhase(
          'review_completed',
          undefined,
          'terminal-review',
        );
      });

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(clearTimeoutSpy).toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
      });
      expect(notificationInfoMock).not.toHaveBeenCalled();
    } finally {
      finishFakeTimerTest();
    }
  });

  it('updates explicit progress when a non-last reviewer task changes', async () => {
    const runningSession = createProgressSession('explicit-review', 'running');
    const completedSession = createProgressSession('explicit-review', 'completed');
    useReviewActionBarStore.getState().showRunningActionBar({
      childSessionId: 'explicit-review',
      parentSessionId: 'parent-session',
      reviewMode: 'deep',
    });
    setProgressSummary(1);

    await act(async () => {
      root.render(
        <ReviewActionBar
          childSessionId="explicit-review"
          presentationSession={runningSession}
        />,
      );
    });
    expect(container.textContent).toContain('1/2 handled');

    setProgressSummary(2);
    await act(async () => {
      root.render(
        <ReviewActionBar
          childSessionId="explicit-review"
          presentationSession={completedSession}
        />,
      );
    });
    expect(container.textContent).toContain('2/2 handled');
  });

  it('keeps direct callers live through an active FlowChat session subscription', async () => {
    const runningSession = createProgressSession('direct-review', 'running');
    const completedSession = createProgressSession('direct-review', 'completed');
    flowChatSessionsMock.set('direct-review', runningSession);
    useReviewActionBarStore.getState().showRunningActionBar({
      childSessionId: 'direct-review',
      parentSessionId: 'parent-session',
      reviewMode: 'deep',
    });
    setProgressSummary(1);

    await act(async () => {
      root.render(<ReviewActionBar childSessionId="direct-review" />);
    });
    expect(flowChatSubscribersMock.size).toBe(1);
    expect(container.textContent).toContain('1/2 handled');

    setProgressSummary(2);
    flowChatSessionsMock.set('direct-review', completedSession);
    await act(async () => {
      flowChatSubscribersMock.forEach((listener) => listener());
    });
    expect(container.textContent).toContain('2/2 handled');
  });

  it('keeps a scoped presentation stable when another session becomes the store root', async () => {
    const session = createProgressSession('stable-review-a', 'running');
    setProgressSummary(1);
    useReviewActionBarStore.getState().showRunningActionBar({
      childSessionId: 'stable-review-a',
      parentSessionId: 'parent-session',
      reviewMode: 'deep',
    });
    useReviewActionBarStore.getState().showRunningActionBar({
      childSessionId: 'stable-review-b',
      parentSessionId: 'parent-session',
      reviewMode: 'deep',
    });

    await act(async () => {
      root.render(
        <ReviewActionBar
          childSessionId="stable-review-a"
          presentationSession={session}
        />,
      );
    });
    const initialRenderReads = translationHookMock.mock.calls.length;

    await act(async () => {
      useReviewActionBarStore.getState().setCapacityQueueState({
        status: 'queued_for_capacity',
        queuedReviewerCount: 1,
      }, 'stable-review-a');
    });
    const ownUpdateRenderReads = translationHookMock.mock.calls.length;
    expect(ownUpdateRenderReads).toBeGreaterThan(initialRenderReads);

    await act(async () => {
      useReviewActionBarStore.getState().setCapacityQueueState({
        status: 'queued_for_capacity',
        queuedReviewerCount: 2,
      }, 'stable-review-b');
    });
    expect(translationHookMock.mock.calls.length).toBe(ownUpdateRenderReads);
  });

  it('does not borrow another session state and keeps scoped deadlines isolated', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00Z'));
    try {
      useReviewActionBarStore.getState().showRunningActionBar({
        childSessionId: 'review-a',
        parentSessionId: 'parent-session',
        reviewMode: 'deep',
      });
      useReviewActionBarStore.getState().showRunningActionBar({
        childSessionId: 'review-b',
        parentSessionId: 'parent-session',
        reviewMode: 'deep',
      });
      notificationInfoMock.mockClear();

      await act(async () => {
        root.render(
          <>
            <ReviewActionBar
              childSessionId="missing-review"
              isActive={false}
              presentationSession={null}
            />
            <ReviewActionBar
              childSessionId="review-a"
              isActive={false}
              presentationSession={createProgressSession('review-a', 'running')}
            />
            <ReviewActionBar
              childSessionId="review-b"
              isActive={false}
              presentationSession={createProgressSession('review-b', 'running')}
            />
          </>,
        );
      });
      expect(container.querySelectorAll('.deep-review-action-bar')).toHaveLength(2);

      await act(async () => {
        useReviewActionBarStore.getState().updatePhase(
          'review_completed',
          undefined,
          'review-a',
        );
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
      });
      expect(notificationInfoMock).toHaveBeenCalledTimes(1);
    } finally {
      finishFakeTimerTest();
    }
  });

  it('keeps remediation in progress after submitting a fix turn', async () => {
    flowChatSessionsMock.set('child-session', {
      sessionId: 'child-session',
      sessionKind: 'review',
      dialogTurns: [
        {
          id: 'review-turn-1',
          status: 'completed',
          modelRounds: [],
        },
      ],
    });

    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: {
          recommended_action: 'request_changes',
        },
        issues: [
          {
            severity: 'high',
            title: 'Incorrect branch',
          },
        ],
        remediation_plan: ['Fix the incorrect branch.'],
      },
      phase: 'review_completed',
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const startFixButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Start fixing'));

    expect(startFixButton).toBeTruthy();

    await act(async () => {
      startFixButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const state = useReviewActionBarStore.getState();
    expect(state.phase).toBe('fix_running');
    expect(state.minimized).toBe(true);
    expect(state.fixingBaselineTurnId).toBe('review-turn-1');
    expect(container.textContent).toContain('Fix the incorrect branch.');
    expect(container.textContent).toContain('Fixing');
    const itemCheckbox = container.querySelector<HTMLInputElement>(
      '.deep-review-action-bar__remediation-item input[type="checkbox"]',
    );
    expect(itemCheckbox?.disabled).toBe(true);
  });

  it('uses standard review mode when starting Code Review remediation', async () => {
    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'review-session',
      parentSessionId: 'parent-session',
      reviewMode: 'standard',
      reviewData: {
        summary: {
          recommended_action: 'request_changes',
        },
        remediation_plan: ['Fix the standard review finding.'],
      },
      phase: 'review_completed',
    });

    await act(async () => {
      root.render(<ReviewActionBar />);
    });

    const fixAndReviewButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Fix and re-review'));

    expect(fixAndReviewButton).toBeTruthy();

    await act(async () => {
      fixAndReviewButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const [prompt, sessionId, displayMessage, agentType] = sendMessageMock.mock.calls[0];
    expect(prompt).toContain('selected Code Review findings only');
    expect(prompt).toContain('follow-up standard code review');
    expect(sessionId).toBe('review-session');
    expect(displayMessage).toBe('Fix Code Review findings and re-review');
    expect(agentType).toBe('CodeReview');
  });

  it('asks for confirmation before replacing existing chat input text', async () => {
    eventBusEmitMock.mockImplementation((event: string, payload: { getValue?: () => string }) => {
      if (event === 'chat-input:get-state') {
        payload.getValue = () => 'existing draft';
      }
      return true;
    });
    confirmWarningMock.mockResolvedValue(false);

    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue 1'],
      },
      phase: 'review_completed',
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const fillButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Fill to input'));
    expect(fillButton).toBeTruthy();

    await act(async () => {
      fillButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(confirmWarningMock).toHaveBeenCalledTimes(1);
    expect(eventBusEmitMock).not.toHaveBeenCalledWith('fill-chat-input', expect.anything());
    expect(useReviewActionBarStore.getState().minimized).toBe(false);
  });

  it('fills chat input and minimizes the action bar when current input is empty', async () => {
    eventBusEmitMock.mockImplementation((event: string, payload: { getValue?: () => string }) => {
      if (event === 'chat-input:get-state') {
        payload.getValue = () => '  ';
      }
      return true;
    });

    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue 1'],
      },
      phase: 'review_completed',
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const fillButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Fill to input'));
    expect(fillButton).toBeTruthy();

    await act(async () => {
      fillButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(confirmWarningMock).not.toHaveBeenCalled();
    expect(eventBusEmitMock).toHaveBeenCalledWith('fill-chat-input', expect.objectContaining({
      mode: 'replace',
    }));
    expect(useReviewActionBarStore.getState().minimized).toBe(true);
  });

  it('minimizes action bar when close button is clicked', async () => {
    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue 1', 'Fix issue 2'],
      },
      phase: 'review_completed',
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const closeButton = container.querySelector('.deep-review-action-bar__controls-btn');
    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const state = useReviewActionBarStore.getState();
    expect(state.minimized).toBe(true);
  });

  it('does not show capacity queue controls when there is no queue state', async () => {
    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue 1'],
      },
      phase: 'review_completed',
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    expect(container.textContent).not.toContain('Reviewers waiting for capacity');
    expect(Array.from(container.querySelectorAll('button')).some((button) => (
      button.textContent?.includes('Pause queue')
    ))).toBe(false);
  });

  it('shows compact capacity queue controls and keeps them locally adjustable', async () => {
    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue 1'],
      },
      phase: 'review_completed',
    });
    useReviewActionBarStore.getState().setCapacityQueueState({
      status: 'queued_for_capacity',
      reason: 'provider_concurrency_limit',
      queuedReviewerCount: 2,
      activeReviewerCount: 1,
      optionalReviewerCount: 1,
      queueElapsedMs: 12_000,
      maxQueueWaitSeconds: 60,
      sessionConcurrencyHigh: true,
    }, 'child-session');

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    expect(container.textContent).toContain('Waiting for model capacity');
    expect(container.textContent).toContain('void is waiting for temporary model capacity.');
    expect(container.textContent).toContain('Reason: provider concurrency limit');
    expect(container.textContent).toContain('Waited 12s of 1m 0s');
    expect(container.textContent).toContain('Your active session is busy.');
    expect(container.textContent).not.toContain('Run slower next time');
    expect(container.textContent).toContain('Open Review settings');

    const pauseButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Pause queue'));
    expect(pauseButton).toBeTruthy();

    await act(async () => {
      pauseButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect((useReviewActionBarStore.getState() as unknown as {
      capacityQueueState: { status: string };
    }).capacityQueueState.status).toBe('paused_by_user');
    expect(container.textContent).toContain('Queue paused');

    const openSettingsButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Open Review settings'));
    expect(openSettingsButton).toBeTruthy();

    await act(async () => {
      openSettingsButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const { useSettingsStore } = await import('@/app/scenes/settings/settingsStore');
    expect(useSettingsStore.getState().activeTab).toBe('review');
  });

  it('sends backend queue control actions for event-driven capacity waits', async () => {
    controlDeepReviewQueueMock.mockResolvedValue(undefined);

    useReviewActionBarStore.getState().showCapacityQueueBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      capacityQueueState: {
        toolId: 'task-queue-1',
        subagentType: 'ReviewSecurity',
        dialogTurnId: 'turn-queue-1',
        status: 'queued_for_capacity',
        queuedReviewerCount: 2,
        activeReviewerCount: 1,
        optionalReviewerCount: 1,
        controlMode: 'backend',
        waitingReviewers: [
          {
            toolId: 'task-queue-1',
            subagentType: 'ReviewSecurity',
            displayName: 'Security reviewer',
            status: 'queued_for_capacity',
          },
          {
            toolId: 'task-queue-2',
            subagentType: 'ReviewFrontend',
            displayName: 'Frontend reviewer',
            status: 'queued_for_capacity',
          },
        ],
      },
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const pauseButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Pause queue'));
    expect(pauseButton).toBeTruthy();

    await act(async () => {
      pauseButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(controlDeepReviewQueueMock).toHaveBeenCalledTimes(2);
    expect(controlDeepReviewQueueMock).toHaveBeenCalledWith({
      sessionId: 'child-session',
      dialogTurnId: 'turn-queue-1',
      toolId: 'task-queue-1',
      action: 'pause',
    });
    expect(controlDeepReviewQueueMock).toHaveBeenCalledWith({
      sessionId: 'child-session',
      dialogTurnId: 'turn-queue-1',
      toolId: 'task-queue-2',
      action: 'pause',
    });
    expect((useReviewActionBarStore.getState() as unknown as {
      capacityQueueState: { status: string };
    }).capacityQueueState.status).toBe('paused_by_user');
  });

  it('shows the backend reason when queue control fails', async () => {
    const { notificationService } = await import('@/shared/notification-system');
    controlDeepReviewQueueMock.mockRejectedValueOnce(new Error('backend queue already closed'));

    useReviewActionBarStore.getState().showCapacityQueueBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      capacityQueueState: {
        toolId: 'task-queue-1',
        subagentType: 'ReviewSecurity',
        dialogTurnId: 'turn-queue-1',
        status: 'queued_for_capacity',
        queuedReviewerCount: 1,
        controlMode: 'backend',
      },
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const pauseButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Pause queue'));
    expect(pauseButton).toBeTruthy();

    await act(async () => {
      pauseButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(notificationService.error).toHaveBeenCalledWith(
      expect.stringContaining('backend queue already closed'),
    );
    expect(notificationService.error).toHaveBeenCalledWith(
      expect.stringContaining('use Stop to interrupt the review'),
    );
  });

  it('reports partial backend queue control failures without claiming full success', async () => {
    const { notificationService } = await import('@/shared/notification-system');
    controlDeepReviewQueueMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('tool already running'));

    useReviewActionBarStore.getState().showCapacityQueueBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      capacityQueueState: {
        toolId: 'task-queue-1',
        subagentType: 'ReviewSecurity',
        dialogTurnId: 'turn-queue-1',
        status: 'queued_for_capacity',
        queuedReviewerCount: 2,
        controlMode: 'backend',
        waitingReviewers: [
          {
            toolId: 'task-queue-1',
            subagentType: 'ReviewSecurity',
            displayName: 'Security reviewer',
            status: 'queued_for_capacity',
          },
          {
            toolId: 'task-queue-2',
            subagentType: 'ReviewFrontend',
            displayName: 'Frontend reviewer',
            status: 'queued_for_capacity',
          },
        ],
      },
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const pauseButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Pause queue'));
    expect(pauseButton).toBeTruthy();

    await act(async () => {
      pauseButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(controlDeepReviewQueueMock).toHaveBeenCalledTimes(2);
    expect(notificationService.error).toHaveBeenCalledWith(
      expect.stringContaining('1 of 2 reviewers failed'),
    );
    expect(notificationService.error).toHaveBeenCalledWith(
      expect.stringContaining('tool already running'),
    );
    expect((useReviewActionBarStore.getState() as unknown as {
      capacityQueueState: { status: string };
    }).capacityQueueState.status).toBe('queued_for_capacity');
  });

  it('starts a structured retry turn for explicit incomplete Deep Review slices', async () => {
    flowChatSessionsMock.set('deep-review-session', {
      sessionId: 'deep-review-session',
      sessionKind: 'deep_review',
      deepReviewRunManifest: {
        reviewMode: 'deep',
        workPackets: [
          {
            packetId: 'reviewer:ReviewSecurity:group-1-of-2',
            phase: 'reviewer',
            launchBatch: 0,
            subagentId: 'ReviewSecurity',
            displayName: 'Security reviewer',
            roleName: 'Security reviewer',
            assignedScope: {
              kind: 'review_target',
              targetSource: 'session_files',
              targetResolution: 'resolved',
              targetTags: ['security'],
              fileCount: 2,
              files: ['src/auth.ts', 'src/session.ts'],
              excludedFileCount: 0,
              groupIndex: 1,
              groupCount: 2,
            },
            allowedTools: ['Read', 'GetFileDiff'],
            timeoutSeconds: 300,
            requiredOutputFields: ['summary', 'findings'],
            strategyLevel: 'deep',
            strategyDirective: 'Review security-sensitive changes.',
            model: 'fast-model',
          },
        ],
      },
    });

    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'deep-review-session',
      parentSessionId: 'parent-session',
      reviewMode: 'deep',
      reviewData: {
        review_mode: 'deep',
        summary: { recommended_action: 'request_changes' },
        reviewers: [
          {
            name: 'Security reviewer',
            specialty: 'security',
            status: 'partial_timeout',
            summary: 'Timed out after completing src/session.ts.',
            packet_id: 'reviewer:ReviewSecurity:group-1-of-2',
            covered_files: ['src/session.ts'],
            retry_scope_files: ['src/auth.ts'],
          },
        ],
      },
      phase: 'review_completed',
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const retryButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Retry incomplete slices'));
    expect(retryButton).toBeTruthy();

    await act(async () => {
      retryButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const [prompt, sessionId, displayMessage, agentType] = sendMessageMock.mock.calls[0];
    expect(prompt).toContain('"retry_coverage"');
    expect(prompt).toContain('"source_packet_id": "reviewer:ReviewSecurity:group-1-of-2"');
    expect(prompt).toContain('"retry_scope_files"');
    expect(sessionId).toBe('deep-review-session');
    expect(displayMessage).toContain('Retry 1 incomplete');
    expect(agentType).toBe('DeepReview');
  });

  it('shows distinct progress text after starting fix and re-review', async () => {
    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue 1'],
      },
      phase: 'review_completed',
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const fixAndReviewButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Fix and re-review'));
    expect(fixAndReviewButton).toBeTruthy();

    await act(async () => {
      fixAndReviewButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Fixing and preparing re-review...');
  });

  it('requires explicit decision confirmation before executing selected decision remediation', async () => {
    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        review_mode: 'deep',
        summary: { recommended_action: 'request_changes' },
        report_sections: {
          remediation_groups: {
            needs_decision: [{
              question: 'Which migration strategy should we use?',
              plan: 'Choose a migration strategy before editing.',
              options: ['Fast path', 'Staged path'],
              tradeoffs: 'Fast path is risky; staged path is safer.',
              recommendation: 1,
            }],
          },
        },
      },
      phase: 'review_completed',
    });
    useReviewActionBarStore.getState().setSelectedRemediationIds(new Set(['remediation-needs_decision-0']));

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const startFixButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Start fixing'));
    expect(startFixButton).toBeTruthy();

    await act(async () => {
      startFixButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Confirm decision items before fixing');
    expect(container.textContent).toContain('Which migration strategy should we use?');
    expect(container.textContent).toContain('Fast path is risky; staged path is safer.');

    const confirmBeforeSelection = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Confirm and start')) as HTMLButtonElement | undefined;
    expect(confirmBeforeSelection?.disabled).toBe(true);

    const stagedPathButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Staged path'));
    expect(stagedPathButton).toBeTruthy();

    await act(async () => {
      stagedPathButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const confirmButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Confirm and start')) as HTMLButtonElement | undefined;
    expect(confirmButton).toBeTruthy();
    expect(confirmButton?.disabled).toBe(false);

    await act(async () => {
      confirmButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const [prompt] = sendMessageMock.mock.calls[0];
    expect(prompt).toContain('User chose option 2: Staged path');
    expect(prompt).not.toContain('Recommended option 2: Staged path');
  });

  it('marks completed remediation items when fix completes', async () => {
    const store = useReviewActionBarStore.getState();
    store.showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue 1', 'Fix issue 2'],
      },
      phase: 'review_completed',
    });

    // Select all items
    const items = store.remediationItems;
    for (const item of items) {
      store.toggleRemediation(item.id);
    }

    store.setActiveAction('fix');
    store.updatePhase('fix_running');

    // Simulate fix completion
    store.updatePhase('fix_completed');

    const state = useReviewActionBarStore.getState();
    expect(state.completedRemediationIds.size).toBe(2);
    expect(state.phase).toBe('fix_completed');
    expect(state.fixingRemediationIds.size).toBe(0);
  });

  it('shows completed items as disabled and strikethrough', async () => {
    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue 1', 'Fix issue 2'],
      },
      phase: 'review_completed',
      completedRemediationIds: new Set(['remediation-0']),
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const completedItem = container.querySelector('.deep-review-action-bar__remediation-item--completed');
    expect(completedItem).toBeTruthy();

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it('shows continue fix UI when phase is fix_interrupted', async () => {
    useReviewActionBarStore.getState().showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue 1', 'Fix issue 2'],
      },
      phase: 'fix_interrupted',
    });

    // Set remaining fix IDs directly on state
    const store = useReviewActionBarStore.getState();
    (store as unknown as { remainingFixIds: string[] }).remainingFixIds = ['remediation-0'];

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const continueButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Continue fixing'));
    expect(continueButton).toBeTruthy();

    const skipButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Skip remaining'));
    expect(skipButton).toBeTruthy();
  });

  it('skips remaining fixes and returns to review_completed', async () => {
    const store = useReviewActionBarStore.getState();
    store.showActionBar({
      childSessionId: 'child-session',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue 1', 'Fix issue 2'],
      },
      phase: 'fix_interrupted',
    });

    store.skipRemainingFixes();

    const state = useReviewActionBarStore.getState();
    expect(state.phase).toBe('review_completed');
    expect(state.remainingFixIds).toEqual([]);
    expect(state.activeAction).toBeNull();
  });

  it('keeps Deep Review interruption actions in one row without a standalone retry or recovery toggle', async () => {
    buildErrorAttributionMock.mockReturnValue({
      category: 'network',
      title: 'Network issue',
      severity: 'warning',
      description: 'Please retry later, or check your network and model service status.',
      actions: [
        { code: 'retry', labelKey: 'errors:ai.actions.retry' },
        { code: 'copy_diagnostics', labelKey: 'errors:ai.actions.copyDiagnostics' },
      ],
    });

    useReviewActionBarStore.getState().showInterruptedActionBar({
      childSessionId: 'deep-review-session',
      parentSessionId: 'parent-session',
      interruption: {
        phase: 'resume_failed',
        childSessionId: 'deep-review-session',
        parentSessionId: 'parent-session',
        originalTarget: '/DeepReview review latest commit',
        errorDetail: { category: 'network', rawMessage: 'network timeout' },
        canResume: true,
        recommendedActions: [
          { code: 'retry', labelKey: 'errors:ai.actions.retry' },
          { code: 'switch_model', labelKey: 'errors:ai.actions.switchModel' },
          { code: 'copy_diagnostics', labelKey: 'errors:ai.actions.copyDiagnostics' },
        ],
        reviewers: [
          { reviewer: 'ReviewSecurity', status: 'completed' },
          { reviewer: 'ReviewPerformance', status: 'timed_out' },
        ],
      },
      phase: 'resume_failed',
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const buttonTexts = Array.from(container.querySelectorAll('button'))
      .map((button) => button.textContent ?? '');

    expect(buttonTexts.some((text) => text.includes('Continue review'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('Switch model'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('Copy diagnostics'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('Retry'))).toBe(false);
    expect(buttonTexts.some((text) => text.includes('Show recovery plan'))).toBe(false);
    expect(container.querySelectorAll('.deep-review-action-bar__attribution button')).toHaveLength(0);
    expect(container.querySelector('.deep-review-action-bar__attribution-actions')).toBeNull();
    expect(container.textContent).toContain('1 completed reviewers will be preserved');
    expect(container.textContent).toContain('1 reviewers will be rerun');
  });

  it('minimizes and hides stale interruption controls after a resume request starts successfully', async () => {
    let resolveContinuation: (() => void) | null = null;
    continueDeepReviewSessionMock.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveContinuation = resolve;
    }));

    useReviewActionBarStore.getState().showInterruptedActionBar({
      childSessionId: 'deep-review-session',
      parentSessionId: 'parent-session',
      interruption: {
        phase: 'review_interrupted',
        childSessionId: 'deep-review-session',
        parentSessionId: 'parent-session',
        originalTarget: '/DeepReview review latest commit',
        errorDetail: { category: 'network', rawMessage: 'network timeout' },
        canResume: true,
        recommendedActions: [],
        reviewers: [],
      },
    });
    flowChatSessionsMock.set('deep-review-session', {
      sessionId: 'deep-review-session',
      sessionKind: 'deep_review',
      dialogTurns: [],
    });
    aggregateReviewerProgressMock.mockReturnValue([
      { reviewer: 'ReviewSecurity', status: 'completed', displayName: 'Security' },
      { reviewer: 'ReviewPerformance', status: 'completed', displayName: 'Performance' },
      { reviewer: 'ReviewArchitecture', status: 'completed', displayName: 'Architecture' },
      { reviewer: 'ReviewBusinessLogic', status: 'completed', displayName: 'Business Logic' },
      { reviewer: 'ReviewFrontend', status: 'cancelled', displayName: 'Frontend' },
    ]);
    buildReviewerProgressSummaryMock.mockReturnValue({
      completed: 4,
      failed: 0,
      timedOut: 0,
      running: 0,
      skipped: 1,
      unknown: 0,
      handled: 5,
      total: 5,
      text: '5/5 handled',
    });

    await act(async () => {
      root.render(<DeepReviewActionBar />);
    });

    const continueButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Continue review'));
    expect(continueButton).toBeTruthy();

    await act(async () => {
      continueButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const state = useReviewActionBarStore.getState();
    expect(continueDeepReviewSessionMock).toHaveBeenCalledTimes(1);
    expect(state.phase).toBe('resume_running');
    expect(state.minimized).toBe(true);
    expect(state.activeAction).toBe('resume');
    expect(container.textContent).toContain('Continuing review');
    expect(container.textContent).toContain('4/5 preserved, continuing remaining review');
    expect(container.textContent).not.toContain('4/5 finished');
    expect(container.textContent).not.toContain('Deep review interrupted');
    expect(Array.from(container.querySelectorAll('button'))
      .some((button) => button.textContent?.includes('Continue review'))).toBe(false);
    expect(Array.from(container.querySelectorAll('button'))
      .some((button) => button.textContent?.includes('Copy diagnostics'))).toBe(false);

    await act(async () => {
      resolveContinuation?.();
      await Promise.resolve();
    });
  });
});
