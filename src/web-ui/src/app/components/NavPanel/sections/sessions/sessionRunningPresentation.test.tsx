// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/flow_chat/types/flow-chat';

const harness = vi.hoisted(() => ({
  states: new Map<string, string>(),
  listeners: new Set<(sessionId: string) => void>(),
  snapshots: [] as string[][],
  stateReads: 0,
  stateReadsById: new Map<string, number>(),
}));

vi.mock('@/flow_chat/state-machine', () => ({
  stateMachineManager: {
    getCurrentState: (sessionId: string) => {
      harness.stateReads += 1;
      harness.stateReadsById.set(
        sessionId,
        (harness.stateReadsById.get(sessionId) ?? 0) + 1,
      );
      return harness.states.get(sessionId) ?? 'idle';
    },
    subscribeGlobal: (listener: (sessionId: string) => void) => {
      harness.listeners.add(listener);
      return () => harness.listeners.delete(listener);
    },
  },
}));

import { useSessionRunningPresentation } from './sessionRunningPresentation';

const session = {
  sessionId: 'session-1',
  title: 'Session',
  dialogTurns: [],
  status: 'idle',
  config: {},
  createdAt: 1,
  lastActiveAt: 1,
  error: null,
  sessionKind: 'review',
} as Session;
const sessions = new Map([[session.sessionId, session]]);

function Probe({
  isVisible,
  presentedSessions = sessions,
}: {
  isVisible: boolean;
  presentedSessions?: ReadonlyMap<string, Session>;
}) {
  const runningSessionIds = useSessionRunningPresentation(presentedSessions, isVisible);
  const snapshot = Array.from(runningSessionIds);
  harness.snapshots.push(snapshot);
  return <div data-running={snapshot.join(',')} />;
}

describe('session running presentation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    harness.states.clear();
    harness.listeners.clear();
    harness.snapshots = [];
    harness.stateReads = 0;
    harness.stateReadsById.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('has a correct first commit, subscribes only while visible, and catches up on resume', () => {
    act(() => root.render(<Probe isVisible={false} />));
    expect(container.firstElementChild?.getAttribute('data-running')).toBe('');
    expect(harness.listeners.size).toBe(0);

    harness.states.set('session-1', 'processing');
    harness.snapshots = [];
    act(() => root.render(<Probe isVisible />));
    expect(harness.snapshots[0]).toEqual(['session-1']);
    expect(container.firstElementChild?.getAttribute('data-running')).toBe('session-1');
    expect(harness.listeners.size).toBe(1);

    const readsBeforeUnrelatedEvent = harness.stateReads;
    const rendersBeforeUnrelatedEvent = harness.snapshots.length;
    act(() => {
      harness.states.set('unrelated-session', 'processing');
      harness.listeners.forEach(listener => listener('unrelated-session'));
    });
    expect(harness.stateReads).toBe(readsBeforeUnrelatedEvent);
    expect(harness.snapshots).toHaveLength(rendersBeforeUnrelatedEvent);

    act(() => {
      harness.states.set('session-1', 'idle');
      harness.listeners.forEach(listener => listener('session-1'));
    });
    expect(container.firstElementChild?.getAttribute('data-running')).toBe('');

    const rendersBeforeReviewError = harness.snapshots.length;
    act(() => {
      harness.states.set('session-1', 'error');
      harness.listeners.forEach(listener => listener('session-1'));
    });
    expect(harness.snapshots).toHaveLength(rendersBeforeReviewError + 1);
    const rendersBeforeReviewReset = harness.snapshots.length;
    act(() => {
      harness.states.set('session-1', 'idle');
      harness.listeners.forEach(listener => listener('session-1'));
    });
    expect(harness.snapshots).toHaveLength(rendersBeforeReviewReset + 1);

    act(() => root.render(<Probe isVisible={false} />));
    expect(harness.listeners.size).toBe(0);
    const hiddenRenderCount = harness.snapshots.length;
    harness.states.set('session-1', 'finishing');
    harness.listeners.forEach(listener => listener('session-1'));
    expect(harness.snapshots).toHaveLength(hiddenRenderCount);

    harness.snapshots = [];
    act(() => root.render(<Probe isVisible />));
    expect(harness.snapshots[0]).toEqual(['session-1']);
    expect(container.firstElementChild?.getAttribute('data-running')).toBe('session-1');
    expect(harness.listeners.size).toBe(1);
  });

  it('isolates visible section scans from other workspaces', () => {
    const secondSession = { ...session, sessionId: 'session-2' };
    const secondSessions = new Map([[secondSession.sessionId, secondSession]]);
    act(() => root.render(
      <>
        <Probe isVisible presentedSessions={sessions} />
        <Probe isVisible presentedSessions={secondSessions} />
      </>,
    ));
    expect(harness.listeners.size).toBe(2);

    harness.stateReadsById.clear();
    act(() => {
      harness.states.set('session-1', 'processing');
      harness.listeners.forEach(listener => listener('session-1'));
    });

    expect(harness.stateReadsById.get('session-1')).toBeGreaterThan(0);
    expect(harness.stateReadsById.get('session-2') ?? 0).toBe(0);
  });
});
