import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../types/flow-chat';
import type { SessionMetadata } from '@/shared/types/session-history';

vi.mock('@/infrastructure/i18n/core/I18nService', () => ({
  i18nService: {
    t: (key: string) => key,
  },
}));

import {
  buildSessionMetadata,
  deriveIsAutomationSessionFromMetadata,
  deriveLastFinishedAtFromMetadata,
  deriveSessionPersonaStateFromMetadata,
  deriveSessionRelationshipFromMetadata,
  normalizeSessionRelationship,
  resolveSessionRelationship,
} from './sessionMetadata';

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'session-1',
    title: 'Session Title',
    titleStatus: 'generated',
    dialogTurns: [],
    status: 'idle',
    config: {
      modelName: 'gpt-test',
      agentType: 'agentic',
    },
    createdAt: 1000,
    lastActiveAt: 1000,
    error: null,
    todos: [],
    maxContextTokens: 128128,
    mode: 'agentic',
    workspacePath: '/workspace',
    parentSessionId: undefined,
    sessionKind: 'normal',
    lastFinishedAt: undefined,
    btwThreads: [],
    btwOrigin: undefined,
    ...overrides,
  };
}

describe('sessionMetadata', () => {
  it('normalizes runtime sessions to an explicit normal kind', () => {
    expect(normalizeSessionRelationship({})).toEqual({
      sessionKind: 'normal',
      parentSessionId: undefined,
      btwOrigin: undefined,
      parentToolCallId: undefined,
      subagentType: undefined,
    });
  });

  it('builds btw metadata without dropping existing fields', () => {
    const session = createSession({
      sessionId: 'child-1',
      title: 'BTW Child',
      sessionKind: 'btw',
      parentSessionId: 'parent-1',
      btwOrigin: {
        requestId: 'req-1',
        parentSessionId: 'parent-1',
        parentDialogTurnId: 'turn-9',
        parentTurnIndex: 9,
      },
      dialogTurns: [
        {
          id: 'turn-1',
          sessionId: 'child-1',
          userMessage: {
            id: 'user-1',
            content: 'question',
            timestamp: 1,
          },
          modelRounds: [
            {
              id: 'round-1',
              index: 0,
              items: [
                {
                  id: 'text-1',
                  type: 'text',
                  content: 'answer',
                  isStreaming: false,
                  timestamp: 2,
                  status: 'completed',
                },
              ],
              isStreaming: false,
              isComplete: true,
              status: 'completed',
              startTime: 1,
              endTime: 2,
            },
          ],
          status: 'completed',
          startTime: 1,
          endTime: 2,
        },
      ],
    });

    const existingMetadata: SessionMetadata = {
      sessionId: 'child-1',
      sessionName: 'Old Name',
      agentType: 'agentic',
      modelName: 'old-model',
      createdAt: 10,
      lastActiveAt: 10,
      turnCount: 99,
      messageCount: 99,
      toolCallCount: 99,
      status: 'active',
      snapshotSessionId: 'snapshot-1',
      tags: ['keep-me'],
      customMetadata: {
        unrelated: 'preserved',
      },
      todos: [],
      workspacePath: '/workspace',
    };

    const metadata = buildSessionMetadata(session, existingMetadata);

    expect(metadata.snapshotSessionId).toBe('snapshot-1');
    expect(metadata.tags).toEqual(['keep-me', 'btw']);
    expect(metadata.turnCount).toBe(99);
    expect(metadata.messageCount).toBe(99);
    expect(metadata.toolCallCount).toBe(99);
    expect(metadata.customMetadata).toEqual({
      unrelated: 'preserved',
      lastFinishedAt: null,
    });
  });

  it('writes normal metadata explicitly and removes stale btw linkage', () => {
    const session = createSession({
      sessionKind: 'normal',
      parentSessionId: undefined,
      btwOrigin: undefined,
    });

    const metadata = buildSessionMetadata(session, {
      sessionId: 'session-1',
      sessionName: 'Session Title',
      agentType: 'agentic',
      modelName: 'gpt-test',
      createdAt: 1000,
      lastActiveAt: 1000,
      turnCount: 0,
      messageCount: 0,
      toolCallCount: 0,
      status: 'active',
      tags: ['btw'],
      customMetadata: {
        unrelated: 'preserved',
        kind: 'btw',
        parentSessionId: 'stale-parent',
        parentRequestId: 'stale-request',
      },
      todos: [],
      workspacePath: '/workspace',
    });

    expect(metadata.customMetadata).toEqual({
      unrelated: 'preserved',
      lastFinishedAt: null,
      customization: {
        schemaVersion: 1,
        scenario: 'code',
        executionPolicy: 'agentic',
        activePersonaBinding: null,
      },
    });
  });

  it('persists and restores lastFinishedAt without dropping unrelated metadata', () => {
    const session = createSession({
      lastFinishedAt: 4321,
    });

    const metadata = buildSessionMetadata(session, {
      sessionId: 'session-1',
      sessionName: 'Session Title',
      agentType: 'agentic',
      modelName: 'gpt-test',
      createdAt: 1000,
      lastActiveAt: 1000,
      turnCount: 0,
      messageCount: 0,
      toolCallCount: 0,
      status: 'active',
      tags: [],
      customMetadata: {
        unrelated: 'preserved',
      },
      todos: [],
      workspacePath: '/workspace',
    });

    expect(metadata.customMetadata).toEqual({
      unrelated: 'preserved',
      lastFinishedAt: 4321,
      customization: {
        schemaVersion: 1,
        scenario: 'code',
        executionPolicy: 'agentic',
        activePersonaBinding: null,
      },
    });
    expect(deriveLastFinishedAtFromMetadata(metadata)).toBe(4321);
  });

  it('persists automation session identity without relying on the title text', () => {
    const session = createSession({
      title: '今日AI新闻',
      isAutomationSession: true,
    });

    const metadata = buildSessionMetadata(session, {
      sessionId: 'session-1',
      sessionName: '自动化 · 今日AI新闻',
      agentType: 'agentic',
      modelName: 'gpt-test',
      createdAt: 1000,
      lastActiveAt: 1000,
      turnCount: 0,
      messageCount: 0,
      toolCallCount: 0,
      status: 'active',
      tags: [],
      customMetadata: {
        unrelated: 'preserved',
      },
      todos: [],
      workspacePath: '/workspace',
    });

    expect(metadata.sessionName).toBe('今日AI新闻');
    expect(metadata.customMetadata).toMatchObject({
      unrelated: 'preserved',
      isAutomationSession: true,
      automation: { kind: 'cron_job' },
    });
    expect(deriveIsAutomationSessionFromMetadata(metadata)).toBe(true);
  });

  it('persists locale-aware default title metadata before the first message', () => {
    const session = createSession({
      title: 'flow-chat:session.newCodeWithIndex',
      titleSource: 'i18n',
      titleI18nKey: 'flow-chat:session.newCodeWithIndex',
      titleI18nParams: { count: 2 },
      titleStatus: undefined,
    });

    const metadata = buildSessionMetadata(session);

    expect(metadata.sessionName).toBe('flow-chat:session.newCodeWithIndex');
    expect(metadata.customMetadata).toEqual({
      lastFinishedAt: null,
      titleSource: 'i18n',
      titleKey: 'flow-chat:session.newCodeWithIndex',
      titleParams: { count: 2 },
      customization: {
        schemaVersion: 1,
        scenario: 'code',
        executionPolicy: 'agentic',
        activePersonaBinding: null,
      },
    });
  });

  it('treats persisted btw identity as legacy and no longer restores it', () => {
    const metadata: SessionMetadata = {
      sessionId: 'child-1',
      sessionName: 'BTW Child',
      agentType: 'agentic',
      modelName: 'gpt-test',
      createdAt: 1000,
      lastActiveAt: 1001,
      turnCount: 1,
      messageCount: 2,
      toolCallCount: 0,
      status: 'active',
      tags: ['btw'],
      customMetadata: {
        kind: 'btw',
        parentSessionId: 'parent-1',
        parentRequestId: 'req-1',
        parentDialogTurnId: 'turn-2',
        parentTurnIndex: 2,
      },
      todos: [],
      workspacePath: '/workspace',
    };

    const relationship = deriveSessionRelationshipFromMetadata(metadata);
    const resolved = resolveSessionRelationship(relationship);

    expect(relationship).toEqual({
      sessionKind: 'normal',
      parentSessionId: undefined,
      btwOrigin: undefined,
      parentToolCallId: undefined,
      subagentType: undefined,
    });
    expect(resolved).toEqual({
      kind: 'normal',
      isBtw: false,
      isSubagent: false,
      isReview: false,
      isDeepReview: false,
      parentSessionId: undefined,
      displayAsChild: false,
      canOpenInAuxPane: false,
      origin: undefined,
    });
  });

  it('round-trips review child identity without treating it as a side question', () => {
    const session = createSession({
      sessionId: 'review-child-1',
      title: 'Code review',
      sessionKind: 'review',
      parentSessionId: 'parent-1',
      btwOrigin: {
        requestId: 'review-req-1',
        parentSessionId: 'parent-1',
        parentDialogTurnId: 'turn-3',
        parentTurnIndex: 3,
      },
    });

    const metadata = buildSessionMetadata(session, {
      sessionId: 'review-child-1',
      sessionName: 'Code review',
      agentType: 'CodeReview',
      modelName: 'gpt-test',
      createdAt: 1000,
      lastActiveAt: 1001,
      turnCount: 0,
      messageCount: 0,
      toolCallCount: 0,
      status: 'active',
      tags: [],
      customMetadata: {},
      todos: [],
      workspacePath: '/workspace',
    });

    expect(metadata.tags).toEqual(['review']);
    expect(metadata.relationship).toMatchObject({
      kind: 'review',
      parentSessionId: 'parent-1',
      parentRequestId: 'review-req-1',
      parentDialogTurnId: 'turn-3',
      parentTurnIndex: 3,
    });
    expect(metadata.customMetadata).toEqual({
      lastFinishedAt: null,
    });

    const relationship = deriveSessionRelationshipFromMetadata(metadata);
    const resolved = resolveSessionRelationship(relationship);

    expect(resolved).toMatchObject({
      kind: 'review',
      isBtw: false,
      isReview: true,
      isDeepReview: false,
      parentSessionId: 'parent-1',
      displayAsChild: true,
      canOpenInAuxPane: true,
    });
  });

  it('round-trips deep review child identity as a review session', () => {
    const relationship = normalizeSessionRelationship({
      sessionKind: 'deep_review',
      parentSessionId: 'parent-1',
      btwOrigin: {
        requestId: 'deep-review-req-1',
        parentSessionId: 'parent-1',
      },
    });

    expect(relationship).toEqual({
      sessionKind: 'deep_review',
      parentSessionId: 'parent-1',
      btwOrigin: {
        requestId: 'deep-review-req-1',
        parentSessionId: 'parent-1',
        parentDialogTurnId: undefined,
        parentTurnIndex: undefined,
      },
      parentToolCallId: undefined,
      subagentType: undefined,
    });

    expect(resolveSessionRelationship(relationship)).toMatchObject({
      kind: 'deep_review',
      isBtw: false,
      isSubagent: false,
      isReview: true,
      isDeepReview: true,
      displayAsChild: true,
      canOpenInAuxPane: true,
    });
  });

  it('preserves an explicit BTW memory choice without inventing a default', () => {
    expect(normalizeSessionRelationship({
      sessionKind: 'btw',
      parentSessionId: 'parent-1',
      btwOrigin: {
        parentSessionId: 'parent-1',
        memoryEnabled: true,
      },
    }).btwOrigin).toMatchObject({
      parentSessionId: 'parent-1',
      memoryEnabled: true,
    });

    expect(normalizeSessionRelationship({
      sessionKind: 'btw',
      parentSessionId: 'parent-1',
    }).btwOrigin).not.toHaveProperty('memoryEnabled');
  });

  it('keeps MiniApp sessions independent from assistant parent sessions', () => {
    const relationship = normalizeSessionRelationship({
      sessionKind: 'miniapp',
      parentSessionId: 'assistant-session-1',
    });

    expect(relationship).toEqual({
      sessionKind: 'miniapp',
      parentSessionId: undefined,
      btwOrigin: undefined,
      parentToolCallId: undefined,
      subagentType: undefined,
    });

    expect(resolveSessionRelationship(relationship)).toMatchObject({
      kind: 'miniapp',
      isBtw: false,
      isSubagent: false,
      isReview: false,
      isDeepReview: false,
      parentSessionId: undefined,
      displayAsChild: false,
      canOpenInAuxPane: false,
    });
  });

  it('persists the Deep Review run manifest from the runtime session', () => {
    const runManifest = {
      reviewMode: 'deep',
      skippedReviewers: [
        {
          subagentId: 'ReviewFrontend',
          displayName: 'Frontend Reviewer',
          reason: 'not_applicable',
        },
      ],
    };
    const session = createSession({
      sessionKind: 'deep_review',
      deepReviewRunManifest: runManifest,
    } as Partial<Session>);

    const metadata = buildSessionMetadata(session);

    expect(metadata.deepReviewRunManifest).toBe(runManifest);
  });

  it('round-trips subagent identity with parent tool metadata', () => {
    const session = createSession({
      sessionId: 'subagent-child-1',
      title: 'Explore: task card flow',
      sessionKind: 'subagent',
      parentSessionId: 'parent-1',
      parentToolCallId: 'tool-call-7',
      subagentType: 'Explore',
      btwOrigin: {
        parentSessionId: 'parent-1',
        parentDialogTurnId: 'turn-8',
        parentTurnIndex: 8,
      },
    });

    const metadata = buildSessionMetadata(session, {
      sessionId: 'subagent-child-1',
      sessionName: 'Explore: task card flow',
      agentType: 'Explore',
      modelName: 'gpt-test',
      createdAt: 1000,
      lastActiveAt: 1001,
      turnCount: 0,
      messageCount: 0,
      toolCallCount: 0,
      status: 'active',
      tags: [],
      customMetadata: {},
      todos: [],
      workspacePath: '/workspace',
    });

    expect(metadata.tags).toEqual(['subagent']);
    expect(metadata.relationship).toMatchObject({
      kind: 'subagent',
      parentSessionId: 'parent-1',
      parentDialogTurnId: 'turn-8',
      parentTurnIndex: 8,
      parentToolCallId: 'tool-call-7',
      subagentType: 'Explore',
    });
    expect(metadata.customMetadata).toEqual({
      lastFinishedAt: null,
    });

    const relationship = deriveSessionRelationshipFromMetadata(metadata);
    expect(relationship).toEqual({
      sessionKind: 'subagent',
      parentSessionId: 'parent-1',
      btwOrigin: {
        requestId: undefined,
        parentSessionId: 'parent-1',
        parentDialogTurnId: 'turn-8',
        parentTurnIndex: 8,
      },
      parentToolCallId: 'tool-call-7',
      subagentType: 'Explore',
    });

    expect(resolveSessionRelationship(relationship)).toMatchObject({
      kind: 'subagent',
      isBtw: false,
      isSubagent: true,
      isReview: false,
      isDeepReview: false,
      parentSessionId: 'parent-1',
      displayAsChild: true,
      canOpenInAuxPane: true,
    });
  });

  it('prefers structured relationship metadata over legacy custom metadata when both exist', () => {
    const metadata: SessionMetadata = {
      sessionId: 'review-child-relationship',
      sessionName: 'Review child',
      agentType: 'CodeReview',
      modelName: 'gpt-test',
      createdAt: 1000,
      lastActiveAt: 1001,
      turnCount: 0,
      messageCount: 0,
      toolCallCount: 0,
      status: 'active',
      tags: ['review'],
      customMetadata: {
        kind: 'review',
        parentSessionId: 'legacy-parent',
        parentRequestId: 'legacy-request',
        parentDialogTurnId: 'legacy-turn',
        parentTurnIndex: 1,
      },
      relationship: {
        kind: 'review',
        parentSessionId: 'structured-parent',
        parentRequestId: 'structured-request',
        parentDialogTurnId: 'structured-turn',
        parentTurnIndex: 4,
      },
      todos: [],
      workspacePath: '/workspace',
    };

    const relationship = deriveSessionRelationshipFromMetadata(metadata);

    expect(relationship).toEqual({
      sessionKind: 'review',
      parentSessionId: 'structured-parent',
      btwOrigin: {
        requestId: 'structured-request',
        parentSessionId: 'structured-parent',
        parentDialogTurnId: 'structured-turn',
        parentTurnIndex: 4,
      },
      parentToolCallId: undefined,
      subagentType: undefined,
    });
  });

  describe('unread completion persistence', () => {
    it('persists unreadCompletion from session to metadata', () => {
      const session = createSession({
        hasUnreadCompletion: 'completed',
      });

      const metadata = buildSessionMetadata(session);

      expect(metadata.unreadCompletion).toBe('completed');
    });

    it('persists needsUserAttention from session to metadata', () => {
      const session = createSession({
        needsUserAttention: 'ask_user',
      });

      const metadata = buildSessionMetadata(session);

      expect(metadata.needsUserAttention).toBe('ask_user');
    });

    it('clears unreadCompletion when session has hasUnreadCompletion undefined', () => {
      const session = createSession({
        hasUnreadCompletion: undefined,
      });

      const existingMetadata: SessionMetadata = {
        sessionId: 'session-1',
        sessionName: 'Session Title',
        agentType: 'agentic',
        modelName: 'gpt-test',
        createdAt: 1000,
        lastActiveAt: 1000,
        turnCount: 0,
        messageCount: 0,
        toolCallCount: 0,
        status: 'active',
        tags: [],
        customMetadata: {},
        todos: [],
        workspacePath: '/workspace',
        unreadCompletion: 'completed',
      };

      const metadata = buildSessionMetadata(session, existingMetadata);

      // The cleared value (undefined) must NOT fall back to existingMetadata.unreadCompletion
      expect(metadata.unreadCompletion).toBeUndefined();
    });

    it('clears needsUserAttention when session has needsUserAttention undefined', () => {
      const session = createSession({
        needsUserAttention: undefined,
      });

      const existingMetadata: SessionMetadata = {
        sessionId: 'session-1',
        sessionName: 'Session Title',
        agentType: 'agentic',
        modelName: 'gpt-test',
        createdAt: 1000,
        lastActiveAt: 1000,
        turnCount: 0,
        messageCount: 0,
        toolCallCount: 0,
        status: 'active',
        tags: [],
        customMetadata: {},
        todos: [],
        workspacePath: '/workspace',
        needsUserAttention: 'tool_confirm',
      };

      const metadata = buildSessionMetadata(session, existingMetadata);

      expect(metadata.needsUserAttention).toBeUndefined();
    });
  });

  describe('parent persona persistence', () => {
    it('persists scenario, execution policy, and selected persona separately from mode', () => {
      const session = createSession({
        mode: 'Plan',
        config: {
          modelName: 'gpt-test',
          agentType: 'Plan',
        },
        scenario: 'code',
        executionPolicy: 'Plan',
        activePersonaBinding: {
          kind: 'agent',
          personaId: 'frontend-engineer',
          personaRevision: { status: 'known', value: '3' },
        },
      });

      const metadata = buildSessionMetadata(session);

      expect(metadata.agentType).toBe('Plan');
      expect(metadata.customMetadata?.customization).toEqual({
        schemaVersion: 1,
        scenario: 'code',
        executionPolicy: 'Plan',
        activePersonaBinding: {
          kind: 'agent',
          personaId: 'frontend-engineer',
          personaRevision: { status: 'known', value: '3' },
        },
      });
    });

    it('persists explicit null when the persona selection is cleared', () => {
      const metadata = buildSessionMetadata(
        createSession({
          scenario: 'media',
          executionPolicy: 'Media',
          activePersonaBinding: null,
          mode: 'Media',
        }),
        {
          sessionId: 'session-1',
          sessionName: 'Session Title',
          agentType: 'Media',
          modelName: 'gpt-test',
          createdAt: 1000,
          lastActiveAt: 1000,
          turnCount: 0,
          messageCount: 0,
          toolCallCount: 0,
          status: 'active',
          tags: [],
          customMetadata: {
            customization: {
              schemaVersion: 1,
              scenario: 'media',
              executionPolicy: 'Media',
              activePersonaBinding: {
                kind: 'agent',
                personaId: 'old-agent',
                personaRevision: { status: 'legacy_unversioned' },
              },
            },
          },
        }
      );

      expect(
        metadata.customMetadata?.customization?.activePersonaBinding
      ).toBeNull();
    });

    it('restores valid metadata and safely falls back for old or malformed sessions', () => {
      expect(
        deriveSessionPersonaStateFromMetadata(
          {
            sessionId: 'persisted',
            agentType: 'agentic',
            customMetadata: {
              customization: {
                schemaVersion: 1,
                scenario: 'cowork',
                executionPolicy: 'Claw',
                activePersonaBinding: {
                  kind: 'agent',
                  personaId: 'office-agent',
                  personaRevision: { status: 'legacy_unversioned' },
                },
              },
            },
          },
          'normal'
        )
      ).toEqual({
        scenario: 'cowork',
        executionPolicy: 'Claw',
        activePersonaBinding: {
          kind: 'agent',
          personaId: 'office-agent',
          personaRevision: { status: 'legacy_unversioned' },
        },
      });

      expect(
        deriveSessionPersonaStateFromMetadata(
          {
            sessionId: 'old',
            agentType: 'DeepResearch',
          },
          'normal'
        )
      ).toEqual({
        scenario: 'cowork',
        executionPolicy: 'DeepResearch',
        activePersonaBinding: null,
      });

      expect(
        deriveSessionPersonaStateFromMetadata(
          {
            sessionId: 'broken',
            agentType: 'Media',
            customMetadata: {
              customization: {
                schemaVersion: 1,
                scenario: 'media',
                executionPolicy: '',
                activePersonaBinding: null,
              },
            },
          },
          'normal'
        )
      ).toEqual({
        scenario: 'media',
        executionPolicy: 'Media',
        activePersonaBinding: null,
      });
    });

    it('does not persist or restore a parent persona on child sessions', () => {
      const metadata = buildSessionMetadata(
        createSession({
          sessionId: 'child',
          sessionKind: 'subagent',
          parentSessionId: 'parent',
          parentToolCallId: 'tool-1',
          subagentType: 'reviewer',
          scenario: 'code',
          executionPolicy: 'agentic',
          activePersonaBinding: {
            kind: 'agent',
            personaId: 'forbidden',
            personaRevision: { status: 'legacy_unversioned' },
          },
        })
      );

      expect(metadata.customMetadata?.customization).toBeUndefined();
      expect(
        deriveSessionPersonaStateFromMetadata(
          {
            sessionId: 'child',
            agentType: 'agentic',
            customMetadata: {
              customization: {
                schemaVersion: 1,
                scenario: 'media',
                executionPolicy: 'Media',
                activePersonaBinding: {
                  kind: 'agent',
                  personaId: 'forbidden',
                  personaRevision: { status: 'legacy_unversioned' },
                },
              },
            },
          },
          'subagent'
        )
      ).toEqual({
        scenario: undefined,
        executionPolicy: undefined,
        activePersonaBinding: undefined,
      });
    });
  });
});
