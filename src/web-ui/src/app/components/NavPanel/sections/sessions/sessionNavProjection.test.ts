import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DialogTurn, FlowChatState, Session } from '@/flow_chat/types/flow-chat';

const storeHarness = vi.hoisted(() => {
  let state: FlowChatState = { activeSessionId: null, sessions: new Map() };
  const listeners = new Set<(state: FlowChatState) => void>();

  return {
    getState: vi.fn(() => state),
    subscribe: vi.fn((listener: (state: FlowChatState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    setState(nextState: FlowChatState) {
      state = nextState;
      listeners.forEach(listener => listener(state));
    },
    reset() {
      state = { activeSessionId: null, sessions: new Map() };
      listeners.clear();
    },
    listenerCount: () => listeners.size,
  };
});

vi.mock('@/flow_chat/store/FlowChatStore', () => ({
  flowChatStore: {
    getState: storeHarness.getState,
    subscribe: storeHarness.subscribe,
  },
}));

import {
  createSessionNavProjectionSelector,
  subscribeToSessionNavProjection,
} from './sessionNavProjection';

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'session-1',
    title: 'Session 1',
    dialogTurns: [],
    status: 'idle',
    config: {},
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    sessionKind: 'normal',
    ...overrides,
  };
}

function createState(session: Session, activeSessionId = session.sessionId): FlowChatState {
  return {
    activeSessionId,
    sessions: new Map([[session.sessionId, session]]),
  };
}

describe('session nav Flow Chat projection', () => {
  beforeEach(() => {
    storeHarness.reset();
    vi.clearAllMocks();
  });

  it('keeps the snapshot stable for streamed content-only changes', () => {
    const select = createSessionNavProjectionSelector();
    const initial = select(createState(createSession()));
    const streamedTurn = {
      id: 'turn-1',
      status: 'processing',
      modelRounds: [{ items: [{ type: 'text', content: 'streamed token' }] }],
    } as DialogTurn;

    const next = select(createState(createSession({
      dialogTurns: [streamedTurn],
      lastActiveAt: 2,
      updatedAt: 2,
    })));

    expect(next).toBe(initial);
    expect(next.sessions).toBe(initial.sessions);
  });

  it('publishes title, attention and active-session changes', () => {
    const select = createSessionNavProjectionSelector();
    const initial = select(createState(createSession()));
    const renamed = select(createState(createSession({ title: 'Renamed' })));
    const attention = select(createState(createSession({
      title: 'Renamed',
      needsUserAttention: 'ask_user',
    })));
    const activatedElsewhere = select(createState(createSession({
      title: 'Renamed',
      needsUserAttention: 'ask_user',
    }), 'session-2'));

    expect(renamed).not.toBe(initial);
    expect(attention).not.toBe(renamed);
    expect(activatedElsewhere).not.toBe(attention);
  });

  it('publishes review lifecycle changes without following review text chunks', () => {
    const select = createSessionNavProjectionSelector();
    const processingTurn = { status: 'processing', modelRounds: [] } as DialogTurn;
    const initial = select(createState(createSession({
      sessionKind: 'review',
      parentSessionId: 'parent-1',
      dialogTurns: [processingTurn],
    })));
    const streamed = select(createState(createSession({
      sessionKind: 'review',
      parentSessionId: 'parent-1',
      dialogTurns: [{
        ...processingTurn,
        modelRounds: [{ items: [{ type: 'text', content: 'more text' }] }],
      } as DialogTurn],
      lastActiveAt: 3,
    })));
    const activityAdvanced = select(createState(createSession({
      sessionKind: 'review',
      parentSessionId: 'parent-1',
      dialogTurns: [{
        ...processingTurn,
        modelRounds: [{ items: [{ type: 'text', content: 'more text' }] }],
      } as DialogTurn],
      lastActiveAt: 4,
    })));
    const completed = select(createState(createSession({
      sessionKind: 'review',
      parentSessionId: 'parent-1',
      dialogTurns: [{ ...processingTurn, status: 'completed' } as DialogTurn],
    })));

    expect(streamed).toBe(initial);
    expect(activityAdvanced).toBe(streamed);
    expect(completed).not.toBe(activityAdvanced);
  });

  it('publishes only when review activity ordering can change the visible parent badge kind', () => {
    const select = createSessionNavProjectionSelector();
    const review = (
      sessionId: string,
      lastActiveAt: number,
      sessionKind: 'review' | 'deep_review' = 'review',
    ): Session => createSession({
      sessionId,
      sessionKind,
      parentSessionId: 'parent-1',
      lastActiveAt,
      dialogTurns: [{ status: 'processing' } as DialogTurn],
    });
    const stateWith = (...sessions: Session[]): FlowChatState => ({
      activeSessionId: 'parent-1',
      sessions: new Map(sessions.map(session => [session.sessionId, session])),
    });

    const initial = select(stateWith(review('review-a', 3), review('review-b', 2)));
    const sameOrder = select(stateWith(review('review-a', 4), review('review-b', 2)));
    const sameKindReordered = select(stateWith(review('review-a', 4), review('review-b', 5)));
    const secondKindAdded = select(stateWith(
      review('review-a', 4),
      review('review-b', 5),
      review('deep-review', 3, 'deep_review'),
    ));
    const visibleKindReordered = select(stateWith(
      review('review-a', 4),
      review('review-b', 5),
      review('deep-review', 6, 'deep_review'),
    ));

    expect(sameOrder).toBe(initial);
    expect(sameKindReordered).toBe(sameOrder);
    expect(secondKindAdded).not.toBe(sameKindReordered);
    expect(visibleKindReordered).not.toBe(secondKindAdded);
  });

  it('publishes when a batched timestamp update changes the selected blocking kind', () => {
    const select = createSessionNavProjectionSelector();
    const child = (
      sessionId: string,
      sessionKind: 'review' | 'deep_review',
      lastActiveAt: number,
      status: 'processing' | 'completed',
    ): Session => createSession({
      sessionId,
      sessionKind,
      parentSessionId: 'parent-1',
      lastActiveAt,
      dialogTurns: [{ status } as DialogTurn],
    });
    const stateWith = (...sessions: Session[]): FlowChatState => ({
      activeSessionId: 'parent-1',
      sessions: new Map(sessions.map(session => [session.sessionId, session])),
    });

    const reviewSelected = select(stateWith(
      child('review-running', 'review', 100, 'processing'),
      child('deep-completed', 'deep_review', 90, 'completed'),
      child('review-completed', 'review', 80, 'completed'),
      child('deep-running', 'deep_review', 70, 'processing'),
    ));
    const deepReviewSelected = select(stateWith(
      child('review-completed', 'review', 100, 'completed'),
      child('deep-running', 'deep_review', 90, 'processing'),
      child('review-running', 'review', 80, 'processing'),
      child('deep-completed', 'deep_review', 70, 'completed'),
    ));

    expect(deepReviewSelected).not.toBe(reviewSelected);
  });

  it('notifies only for navigation changes and releases the listener', () => {
    const initialState = createState(createSession({ title: 'Before' }));
    storeHarness.setState(initialState);
    const onStoreChange = vi.fn();
    const unsubscribe = subscribeToSessionNavProjection(onStoreChange);

    expect(storeHarness.listenerCount()).toBe(1);
    expect(onStoreChange).not.toHaveBeenCalled();

    storeHarness.setState(createState(createSession({
      title: 'Before',
      dialogTurns: [{ status: 'processing' } as DialogTurn],
      lastActiveAt: 2,
    })));
    expect(onStoreChange).not.toHaveBeenCalled();

    storeHarness.setState(createState(createSession({ title: 'After' })));
    expect(onStoreChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(storeHarness.listenerCount()).toBe(0);
  });

  it('keeps multiple subscribers isolated when one is released', () => {
    storeHarness.setState(createState(createSession({ title: 'Before' })));
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeToSessionNavProjection(first);
    const unsubscribeSecond = subscribeToSessionNavProjection(second);

    expect(storeHarness.listenerCount()).toBe(2);
    storeHarness.setState(createState(createSession({ title: 'After' })));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    storeHarness.setState(createState(createSession({ title: 'Final' })));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    unsubscribeSecond();
    expect(storeHarness.listenerCount()).toBe(0);
  });
});
