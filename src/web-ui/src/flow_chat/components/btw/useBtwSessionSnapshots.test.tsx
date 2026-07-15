// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { FlowChatState, Session } from '../../types/flow-chat';

const storeHarness = vi.hoisted(() => {
  let state: FlowChatState;
  const listeners = new Set<(nextState: FlowChatState) => void>();

  return {
    getState: () => state,
    setState: (nextState: FlowChatState) => {
      state = nextState;
    },
    subscribe: vi.fn((listener: (nextState: FlowChatState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    emit: () => {
      listeners.forEach(listener => listener(state));
    },
    reset: () => {
      listeners.clear();
    },
    listenerCount: () => listeners.size,
  };
});

vi.mock('../../store/FlowChatStore', () => ({
  flowChatStore: {
    getState: storeHarness.getState,
    subscribe: storeHarness.subscribe,
  },
}));

import {
  areBtwReviewLifecycleSignalsEqual,
  deriveBtwReviewLifecycleSignal,
  readBtwPresentationSessionSnapshot,
  useBtwSessionSnapshots,
  type BtwSessionSnapshots,
} from './useBtwSessionSnapshots';

function createSession(
  content: string,
  status: 'processing' | 'completed' = 'processing',
): Session {
  const isProcessing = status === 'processing';
  return {
    sessionId: 'child',
    title: 'Child',
    dialogTurns: [{
      id: 'turn-1',
      sessionId: 'child',
      userMessage: { id: 'user-1', content: 'question', timestamp: 1 },
      modelRounds: [{
        id: 'round-1',
        index: 0,
        items: [{
          id: 'text-1',
          type: 'text',
          content,
          timestamp: 2,
          status: isProcessing ? 'streaming' : 'completed',
          isStreaming: isProcessing,
        }],
        isStreaming: isProcessing,
        isComplete: !isProcessing,
        status: isProcessing ? 'streaming' : 'completed',
        startTime: 1,
      }],
      status,
      startTime: 1,
    }],
    status: 'idle',
    config: {},
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
  } as Session;
}

function createState(childSession?: Session): FlowChatState {
  const parentSession = {
    ...createSession('', 'completed'),
    sessionId: 'parent',
    dialogTurns: [],
  } as Session;
  return {
    sessions: new Map([
      ['parent', parentSession],
      ...(childSession ? [['child', childSession] as const] : []),
    ]),
    activeSessionId: 'parent',
  };
}

let container: HTMLDivElement;
let root: Root;
let latestSnapshots: BtwSessionSnapshots | undefined;
let renderCount = 0;

function Probe({ isActive }: { isActive: boolean }) {
  renderCount += 1;
  latestSnapshots = useBtwSessionSnapshots({
    childSessionId: 'child',
    parentSessionId: 'parent',
    isActive,
  });
  return null;
}

describe('useBtwSessionSnapshots', () => {
  beforeEach(() => {
    storeHarness.reset();
    storeHarness.subscribe.mockClear();
    storeHarness.setState(createState(createSession('first token')));
    latestSnapshots = undefined;
    renderCount = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('reads the requested presentation sessions directly from the map', () => {
    const state = createState(createSession('current'));
    const getSession = vi.spyOn(state.sessions, 'get');

    const snapshot = readBtwPresentationSessionSnapshot(state, 'child', 'parent');

    expect(snapshot.childSession?.sessionId).toBe('child');
    expect(snapshot.parentSession?.sessionId).toBe('parent');
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('keeps lifecycle checks narrow and review-result fingerprints cached', () => {
    const tokenOne = deriveBtwReviewLifecycleSignal(createSession('one'), 'child');
    const tokenTwo = deriveBtwReviewLifecycleSignal(createSession('two'), 'child');
    const completed = deriveBtwReviewLifecycleSignal(
      createSession('two', 'completed'),
      'child',
    );
    const missing = deriveBtwReviewLifecycleSignal(undefined, 'child');

    expect(areBtwReviewLifecycleSignalsEqual(tokenOne, tokenTwo)).toBe(true);
    expect(areBtwReviewLifecycleSignalsEqual(tokenTwo, completed)).toBe(false);
    expect(areBtwReviewLifecycleSignalsEqual(missing, tokenOne)).toBe(false);

    const report = JSON.stringify({
      summary: { overall_assessment: 'safe' },
      issues: Array.from({ length: 400 }, (_, index) => ({
        title: `issue-${index}`,
        detail: 'x'.repeat(80),
      })),
    });
    const baseSession = createSession('', 'completed');
    const lastTurn = baseSession.dialogTurns[0];
    const lastRound = lastTurn.modelRounds[0];
    const reviewItem = {
      id: 'review-result',
      type: 'tool',
      timestamp: 3,
      status: 'completed',
      toolName: 'submit_code_review',
      toolCall: { id: 'review-call', input: {} },
      toolResult: { success: true, result: report },
    } as const;
    const reviewSession = {
      ...baseSession,
      dialogTurns: [{
        ...lastTurn,
        modelRounds: [{
          ...lastRound,
          items: [reviewItem],
        }],
      }],
    } as Session;
    const imulSpy = vi.spyOn(Math, 'imul');

    try {
      const first = deriveBtwReviewLifecycleSignal(reviewSession, 'child');
      const firstHashCallCount = imulSpy.mock.calls.length;

      expect(first.lastItemReviewResultFingerprint?.length).toBeLessThan(64);
      expect(firstHashCallCount).toBeGreaterThan(0);

      const second = deriveBtwReviewLifecycleSignal({
        ...reviewSession,
        lastActiveAt: reviewSession.lastActiveAt + 1,
      }, 'child');

      expect(second.lastItemReviewResultFingerprint)
        .toBe(first.lastItemReviewResultFingerprint);
      expect(imulSpy).toHaveBeenCalledTimes(firstHashCallCount);
    } finally {
      imulSpy.mockRestore();
    }
  });

  it('freezes presentation while hidden, keeps narrow review lifecycle live, and resumes latest', async () => {
    await act(async () => {
      root.render(<Probe isActive={false} />);
    });

    expect(storeHarness.listenerCount()).toBe(1);
    expect(latestSnapshots?.childSession?.dialogTurns[0]?.status).toBe('processing');
    const hiddenRenderCount = renderCount;

    storeHarness.setState(createState(createSession('second token')));
    await act(async () => storeHarness.emit());

    expect(renderCount).toBe(hiddenRenderCount);
    expect(latestSnapshots?.childSession?.dialogTurns[0]?.modelRounds[0]?.items[0]).toMatchObject({
      content: 'first token',
    });

    storeHarness.setState(createState(createSession('done', 'completed')));
    await act(async () => storeHarness.emit());

    expect(renderCount).toBeGreaterThan(hiddenRenderCount);
    expect(latestSnapshots?.childSession?.dialogTurns[0]?.status).toBe('processing');
    expect(latestSnapshots?.reviewSession?.dialogTurns[0]?.status).toBe('completed');

    await act(async () => {
      root.render(<Probe isActive />);
    });

    expect(storeHarness.listenerCount()).toBe(2);
    expect(latestSnapshots?.childSession?.dialogTurns[0]?.status).toBe('completed');

    await act(async () => {
      root.render(<Probe isActive={false} />);
    });
    expect(storeHarness.listenerCount()).toBe(1);
  });

  it('detects a child session that is created while the panel is hidden', async () => {
    storeHarness.setState(createState());
    await act(async () => {
      root.render(<Probe isActive={false} />);
    });
    expect(latestSnapshots?.reviewSession).toBeUndefined();

    storeHarness.setState(createState(createSession('created')));
    await act(async () => storeHarness.emit());

    expect(latestSnapshots?.reviewSession?.sessionId).toBe('child');
    expect(latestSnapshots?.childSession).toBeUndefined();
  });
});
