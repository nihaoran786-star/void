import { describe, expect, it } from 'vitest';

import type { FlowChatState, Session } from '@/flow_chat/types/flow-chat';
import {
  deriveShortDramaTeamAgentStatus,
  selectShortDramaTeamStatusProjection,
} from './ShortDramaTeamStatusProjectionAdapter';
import { areShortDramaTeamStatusProjectionsEqual } from '@/flow_chat/types/short-drama-team-status';

function session(overrides: Partial<Session>): Session {
  return {
    sessionId: 'session-1',
    dialogTurns: [],
    status: 'idle',
    config: {},
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    sessionKind: 'btw',
    ...overrides,
  } as Session;
}

describe('ShortDramaTeamStatusProjectionAdapter', () => {
  it('keeps a missing or idle child session visibly waiting', () => {
    expect(deriveShortDramaTeamAgentStatus(undefined)).toEqual({ status: 'waiting' });
    expect(deriveShortDramaTeamAgentStatus(session({}))).toEqual({ status: 'waiting' });
  });

  it('projects generic live work without exposing tool names', () => {
    expect(deriveShortDramaTeamAgentStatus(session({
      dialogTurns: [{
        id: 'turn-1',
        userMessage: 'work',
        modelRounds: [{
          id: 'round-1',
          items: [{
            id: 'tool-1',
            type: 'tool',
            toolName: 'generate_image',
            toolCall: { id: 'call-1', name: 'generate_image', input: {} },
            status: 'running',
            timestamp: 1,
          }],
          status: 'streaming',
          isStreaming: true,
          isComplete: false,
          startTime: 1,
        }],
        status: 'processing',
        startTime: 1,
      }],
    }))).toEqual({
      status: 'live',
      activity: 'running_tool',
    });
  });

  it('gives terminal and attention states deterministic precedence', () => {
    expect(deriveShortDramaTeamAgentStatus(session({
      needsUserAttention: 'ask_user',
    }))).toEqual({
      status: 'attention',
      activity: 'needs_attention',
    });
    expect(deriveShortDramaTeamAgentStatus(session({
      error: 'provider failed',
      needsUserAttention: 'ask_user',
    }))).toEqual({ status: 'failed' });
    expect(deriveShortDramaTeamAgentStatus(session({
      dialogTurns: [{
        id: 'turn-cancelled',
        userMessage: 'work',
        modelRounds: [],
        status: 'cancelled',
        startTime: 1,
      }],
    }))).toEqual({ status: 'cancelled' });
    expect(deriveShortDramaTeamAgentStatus(session({
      hasUnreadCompletion: 'completed',
    }))).toEqual({ status: 'completed' });
  });

  it('selects only requested child sessions and compares semantic output', () => {
    const active = session({ sessionId: 'child-live', status: 'active' });
    const state = {
      sessions: new Map([
        ['child-live', active],
        ['unrelated', session({ sessionId: 'unrelated', status: 'error' })],
      ]),
      activeSessionId: null,
    } as FlowChatState;

    const projection = selectShortDramaTeamStatusProjection([
      { tabId: 'asset-tab', sessionId: 'child-live' },
      { tabId: 'video-tab' },
    ], state);

    expect(projection).toEqual([
      { tabId: 'asset-tab', status: 'waiting' },
      { tabId: 'video-tab', status: 'waiting' },
    ]);
    expect(areShortDramaTeamStatusProjectionsEqual(projection, [...projection])).toBe(true);
    expect(areShortDramaTeamStatusProjectionsEqual(projection, [
      projection[0],
      { tabId: 'video-tab', status: 'failed' },
    ])).toBe(false);
  });
});
