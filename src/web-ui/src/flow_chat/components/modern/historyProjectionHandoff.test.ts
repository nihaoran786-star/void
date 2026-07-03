import { describe, expect, it } from 'vitest';
import {
  activeSessionHistoryProjectionHandoff,
  selectSessionOpenHistoryProjectionHandoff,
  type HistoryProjectionHandoffSnapshot,
} from './historyProjectionHandoff';
import type { VirtualItem } from '../../store/modernFlowChatStore';

function createItem(index: number): VirtualItem {
  return {
    type: 'user-message',
    turnId: `turn-${index}`,
    data: {
      id: `user-turn-${index}`,
      content: `turn ${index}`,
      timestamp: index,
    },
  } as VirtualItem;
}

function createSnapshot(sessionId: string): HistoryProjectionHandoffSnapshot {
  return {
    sessionId,
    reason: 'session-open',
    createdAtMs: 100,
    items: [createItem(1)],
    mode: 'bottom-tail',
    targetTurnId: 'turn-1',
    footerHeightPx: 120,
  };
}

describe('activeSessionHistoryProjectionHandoff', () => {
  it('returns the snapshot only for the active session', () => {
    const snapshot = createSnapshot('session-a');

    expect(activeSessionHistoryProjectionHandoff(snapshot, 'session-a')).toBe(snapshot);
    expect(activeSessionHistoryProjectionHandoff(snapshot, 'session-b')).toBeNull();
    expect(activeSessionHistoryProjectionHandoff(snapshot, null)).toBeNull();
    expect(activeSessionHistoryProjectionHandoff(null, 'session-a')).toBeNull();
  });
});

describe('selectSessionOpenHistoryProjectionHandoff', () => {
  it('creates a bottom-tail handoff snapshot after switching into a ready full historical session', () => {
    const items = Array.from({ length: 30 }, (_, index) => createItem(index));

    const snapshot = selectSessionOpenHistoryProjectionHandoff({
      activeSessionId: 'session-b',
      previousActiveSessionId: 'session-a',
      historyState: 'ready',
      isPartial: false,
      useStaticInitialHistoryWindow: false,
      latestTurnId: 'turn-29',
      latestUserMessageIndex: 29,
      virtualItems: items,
      footerHeightPx: 144,
      nowMs: 500,
      alreadyActivatedSessionId: null,
      activeHandoffSessionId: null,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.sessionId).toBe('session-b');
    expect(snapshot?.reason).toBe('session-open');
    expect(snapshot?.createdAtMs).toBe(500);
    expect(snapshot?.mode).toBe('bottom-tail');
    expect(snapshot?.targetTurnId).toBe('turn-29');
    expect(snapshot?.footerHeightPx).toBe(144);
    expect(snapshot?.items).toHaveLength(24);
    expect(snapshot?.items[0]?.turnId).toBe('turn-6');
    expect(snapshot?.items.at(-1)?.turnId).toBe('turn-29');
  });

  it('starts at the latest user message when it is older than the tail budget', () => {
    const items = Array.from({ length: 30 }, (_, index) => createItem(index));

    const snapshot = selectSessionOpenHistoryProjectionHandoff({
      activeSessionId: 'session-b',
      previousActiveSessionId: 'session-a',
      historyState: 'ready',
      isPartial: false,
      useStaticInitialHistoryWindow: false,
      latestTurnId: 'turn-4',
      latestUserMessageIndex: 4,
      virtualItems: items,
      footerHeightPx: 144,
      nowMs: 500,
      alreadyActivatedSessionId: null,
      activeHandoffSessionId: null,
    });

    expect(snapshot?.items[0]?.turnId).toBe('turn-4');
    expect(snapshot?.items.at(-1)?.turnId).toBe('turn-29');
  });

  it('does not create a handoff for unsupported or duplicate session-open states', () => {
    const items = Array.from({ length: 30 }, (_, index) => createItem(index));
    const base = {
      activeSessionId: 'session-b',
      previousActiveSessionId: 'session-a',
      historyState: 'ready' as const,
      isPartial: false,
      useStaticInitialHistoryWindow: false,
      latestTurnId: 'turn-29',
      latestUserMessageIndex: 29,
      virtualItems: items,
      footerHeightPx: 144,
      nowMs: 500,
      alreadyActivatedSessionId: null,
      activeHandoffSessionId: null,
    };

    expect(selectSessionOpenHistoryProjectionHandoff({
      ...base,
      previousActiveSessionId: undefined,
    })).toBeNull();
    expect(selectSessionOpenHistoryProjectionHandoff({
      ...base,
      previousActiveSessionId: 'session-b',
    })).toBeNull();
    expect(selectSessionOpenHistoryProjectionHandoff({
      ...base,
      historyState: 'loading',
    })).toBeNull();
    expect(selectSessionOpenHistoryProjectionHandoff({
      ...base,
      isPartial: true,
    })).toBeNull();
    expect(selectSessionOpenHistoryProjectionHandoff({
      ...base,
      useStaticInitialHistoryWindow: true,
    })).toBeNull();
    expect(selectSessionOpenHistoryProjectionHandoff({
      ...base,
      latestTurnId: null,
    })).toBeNull();
    expect(selectSessionOpenHistoryProjectionHandoff({
      ...base,
      virtualItems: items.slice(0, 23),
    })).toBeNull();
    expect(selectSessionOpenHistoryProjectionHandoff({
      ...base,
      alreadyActivatedSessionId: 'session-b',
    })).toBeNull();
    expect(selectSessionOpenHistoryProjectionHandoff({
      ...base,
      activeHandoffSessionId: 'session-b',
    })).toBeNull();
  });
});
