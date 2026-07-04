import { describe, expect, it } from 'vitest';
import { isSessionNavRowActive, resolveSessionNavListState } from './sessionNavSelection';

describe('isSessionNavRowActive', () => {
  it('falls back to the main active session when an aux child belongs to another parent', () => {
    expect(
      isSessionNavRowActive({
        rowSessionId: 'child-1',
        activeTabId: 'session',
        activeSessionId: 'session-2',
        activeChildSessionId: 'child-1',
        activeChildParentSessionId: 'session-1',
      }),
    ).toBe(false);

    expect(
      isSessionNavRowActive({
        rowSessionId: 'session-2',
        activeTabId: 'session',
        activeSessionId: 'session-2',
        activeChildSessionId: 'child-1',
        activeChildParentSessionId: 'session-1',
      }),
    ).toBe(true);
  });

  it('keeps the active child highlighted while its parent is the main active session', () => {
    expect(
      isSessionNavRowActive({
        rowSessionId: 'child-1',
        activeTabId: 'session',
        activeSessionId: 'session-1',
        activeChildSessionId: 'child-1',
        activeChildParentSessionId: 'session-1',
      }),
    ).toBe(true);

    expect(
      isSessionNavRowActive({
        rowSessionId: 'session-1',
        activeTabId: 'session',
        activeSessionId: 'session-1',
        activeChildSessionId: 'child-1',
        activeChildParentSessionId: 'session-1',
      }),
    ).toBe(false);
  });
});

describe('resolveSessionNavListState', () => {
  it('keeps empty local state distinct from metadata loading', () => {
    expect(resolveSessionNavListState({
      visibleTopLevelCount: 0,
      totalTopLevelCount: 0,
      hasMoreUnloaded: false,
      isLoading: false,
    })).toEqual({
      status: 'empty',
      source: 'local',
      action: 'none',
      showExpandToggle: false,
    });

    expect(resolveSessionNavListState({
      visibleTopLevelCount: 0,
      totalTopLevelCount: 0,
      hasMoreUnloaded: false,
      isLoading: true,
    })).toEqual({
      status: 'loading',
      source: 'local',
      action: 'show_loading',
      showExpandToggle: false,
    });
  });

  it('reports metadata-page source and expand affordance explicitly', () => {
    expect(resolveSessionNavListState({
      visibleTopLevelCount: 5,
      totalTopLevelCount: 12,
      hasMoreUnloaded: true,
      isLoading: false,
    })).toEqual({
      status: 'ready',
      source: 'metadata_page',
      action: 'show_rows',
      showExpandToggle: true,
    });
  });

  it('does not show expand toggle for a small fully loaded local list', () => {
    expect(resolveSessionNavListState({
      visibleTopLevelCount: 3,
      totalTopLevelCount: 3,
      hasMoreUnloaded: false,
      isLoading: false,
    })).toMatchObject({
      status: 'ready',
      source: 'local',
      action: 'show_rows',
      showExpandToggle: false,
    });
  });
});
