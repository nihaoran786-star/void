// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { BtwSessionPanel } from './BtwSessionPanel';
import { useReviewActionBarStore } from '../../store/deepReviewActionBarStore';
import { loadPersistedReviewState } from '../../services/ReviewActionBarPersistenceService';
import type { FlowChatState, Session } from '../../types/flow-chat';
import type { ModeSkillInfo } from '@/infrastructure/config/types';

let flowChatState: FlowChatState;
const flowChatListeners = new Set<(state: FlowChatState) => void>();
const mockSendMessage = vi.fn();
const mockCancelSession = vi.fn();
const mockBtwCancel = vi.fn();
const mockGetModeSkillConfigs = vi.fn();
const mockLoadSessionHistory = vi.fn();
const mockCreateImageContextFromFile = vi.fn();
const mockBuildImageContextsForBackend = vi.fn();
let mockExecutionState = 'idle';
const translate = (_key: string, options?: Record<string, unknown> & { defaultValue?: string }) => (
  options?.defaultValue ?? _key
);

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: translate,
  }),
}));

vi.mock('../modern/VirtualItemRenderer', () => ({
  VirtualItemRenderer: () => <div />,
}));

vi.mock('../modern/ProcessingIndicator', () => ({
  ProcessingIndicator: () => <div />,
}));

vi.mock('../modern/processingIndicatorVisibility', () => ({
  shouldReserveProcessingIndicatorSpace: () => false,
  shouldShowProcessingIndicator: () => false,
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

vi.mock('./DeepReviewActionBar', () => ({
  ReviewActionBar: () => <div data-testid="review-action-bar" />,
}));

vi.mock('@/component-library', () => ({
  IconButton: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/services/FileTabManager', () => ({
  fileTabManager: {
    openFile: vi.fn(),
  },
}));

vi.mock('@/shared/utils/tabUtils', () => ({
  createTab: vi.fn(),
}));

vi.mock('@/infrastructure/api', () => ({
  agentAPI: {
    cancelSession: (...args: unknown[]) => mockCancelSession(...args),
  },
  btwAPI: {
    cancel: (...args: unknown[]) => mockBtwCancel(...args),
  },
  configAPI: {
    getModeSkillConfigs: (...args: unknown[]) => mockGetModeSkillConfigs(...args),
  },
}));

vi.mock('../../services/FlowChatManager', () => ({
  FlowChatManager: {
    getInstance: () => ({
      sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    }),
  },
}));

vi.mock('../../utils/imageUtils', () => ({
  createImageContextFromFile: (...args: unknown[]) => mockCreateImageContextFromFile(...args),
}));

vi.mock('../../utils/imageContextForBackend', () => ({
  buildImageContextsForBackend: (...args: unknown[]) => mockBuildImageContextsForBackend(...args),
}));

vi.mock('../../state-machine', () => ({
  SessionExecutionState: {
    IDLE: 'idle',
    PROCESSING: 'processing',
    FINISHING: 'finishing',
    ERROR: 'error',
  },
  stateMachineManager: {
    getCurrentState: () => mockExecutionState,
    subscribeGlobal: () => () => {},
  },
}));

vi.mock('@/infrastructure/event-bus', () => ({
  globalEventBus: {
    emit: vi.fn(),
  },
}));

vi.mock('@/shared/notification-system', () => ({
  notificationService: {
    error: vi.fn(),
  },
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
  FlowChatStore: {
    getInstance: () => ({
      getState: () => flowChatState,
      subscribe: (listener: (state: FlowChatState) => void) => {
        flowChatListeners.add(listener);
        return () => flowChatListeners.delete(listener);
      },
      loadSessionHistory: (...args: unknown[]) => mockLoadSessionHistory(...args),
    }),
  },
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
  sessionToVirtualItems: () => [],
}));

vi.mock('../../utils/reviewSessionStop', () => ({
  settleStoppedReviewSessionState: vi.fn(),
}));

vi.mock('../../services/ReviewActionBarPersistenceService', () => ({
  loadPersistedReviewState: vi.fn(() => Promise.resolve(null)),
}));

function createReviewSession(): Session {
  return {
    sessionId: 'deep-review-child',
    title: 'Deep review',
    dialogTurns: [{
      id: 'turn-1',
      sessionId: 'deep-review-child',
      userMessage: { id: 'user-1', content: 'review', timestamp: 1 },
      modelRounds: [{
        id: 'round-1',
        index: 0,
        isStreaming: false,
        isComplete: true,
        status: 'completed',
        startTime: 1,
        items: [{
          id: 'review-result',
          type: 'tool',
          timestamp: 2,
          status: 'completed',
          toolName: 'submit_code_review',
          toolCall: { id: 'tool-1', input: {} },
          toolResult: {
            success: true,
            result: JSON.stringify({
              summary: {
                overall_assessment: 'Looks safe.',
                risk_level: 'low',
                recommended_action: 'approve',
              },
              issues: [],
              positive_points: ['No risky changes found.'],
              review_mode: 'deep',
              remediation_plan: [],
            }),
          },
        }],
      }],
      status: 'completed',
      startTime: 1,
    }],
    status: 'idle',
    config: {},
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    sessionKind: 'deep_review',
    parentSessionId: 'parent-session',
    workspacePath: 'D:/workspace/project',
  } as Session;
}

function createCompletedDeepReviewWithoutResult(): Session {
  const childSession = createReviewSession();
  return {
    ...childSession,
    dialogTurns: childSession.dialogTurns.map((turn) => ({
      ...turn,
      modelRounds: turn.modelRounds.map((round) => ({
        ...round,
        items: [{
          id: 'reviewer-task',
          type: 'tool',
          timestamp: 2,
          status: 'completed',
          toolName: 'Task',
          toolCall: {
            id: 'task-security',
            input: { subagent_type: 'ReviewSecurity' },
          },
          toolResult: {
            success: true,
            result: {
              summary: {
                overall_assessment: 'Security reviewer found no blockers.',
              },
            },
          },
        }],
      })),
    })),
  } as Session;
}

function createInterruptedDeepReviewWithoutResult(): Session {
  const childSession = createCompletedDeepReviewWithoutResult();
  return {
    ...childSession,
    status: 'error',
    error: 'previous execution failed',
    dialogTurns: childSession.dialogTurns.map((turn) => ({
      ...turn,
      status: 'error',
      error: 'previous execution failed',
    })),
  } as Session;
}

function createRunningDeepReviewSession(): Session {
  const childSession = createCompletedDeepReviewWithoutResult();
  return {
    ...childSession,
    status: 'running',
    dialogTurns: childSession.dialogTurns.map((turn) => ({
      ...turn,
      status: 'processing',
      modelRounds: turn.modelRounds.map((round) => ({
        ...round,
        isStreaming: true,
        isComplete: false,
        status: 'streaming',
      })),
    })),
  } as Session;
}

function createPendingDeepReviewSession(): Session {
  const childSession = createRunningDeepReviewSession();
  return {
    ...childSession,
    dialogTurns: childSession.dialogTurns.map((turn) => ({
      ...turn,
      status: 'pending',
    })),
  } as Session;
}

function createParentSessionWithId(sessionId: string): Session {
  return {
    sessionId,
    title: sessionId,
    dialogTurns: [],
    status: 'idle',
    config: {},
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
  } as Session;
}

function createBtwSessionWithId(sessionId: string, parentSessionId: string): Session {
  return {
    sessionId,
    title: 'Side question',
    dialogTurns: [],
    status: 'idle',
    config: { modelName: 'fast' },
    mode: 'agentic',
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    sessionKind: 'btw',
    parentSessionId,
    workspacePath: 'D:/workspace/project',
    isTransient: true,
  } as Session;
}

function createSubagentSessionWithId(sessionId: string, parentSessionId: string): Session {
  return {
    sessionId,
    title: 'Researcher',
    dialogTurns: [],
    status: 'idle',
    config: { agentType: 'Researcher' },
    mode: 'Researcher',
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    sessionKind: 'subagent',
    parentSessionId,
    parentToolCallId: 'task-call-1',
    subagentType: 'Researcher',
    workspacePath: 'D:/workspace/project',
  } as Session;
}

function createModeSkill(
  name: string,
  overrides: Partial<ModeSkillInfo> = {},
): ModeSkillInfo {
  return {
    key: `user:${name}`,
    name,
    description: `${name} description`,
    path: `D:/skills/${name}`,
    level: 'user',
    sourceSlot: 'user',
    dirName: name,
    isBuiltin: false,
    defaultEnabled: true,
    effectiveEnabled: true,
    disabledByMode: false,
    selectedForRuntime: true,
    stateReason: 'custom_user_default_enabled',
    ...overrides,
  };
}

function cloneReviewSessionWithId(
  session: Session,
  sessionId: string,
  parentSessionId: string,
): Session {
  return {
    ...session,
    sessionId,
    parentSessionId,
    title: sessionId,
    dialogTurns: session.dialogTurns.map((turn, turnIndex) => ({
      ...turn,
      id: `${sessionId}-turn-${turnIndex + 1}`,
      sessionId,
      userMessage: turn.userMessage
        ? {
            ...turn.userMessage,
            id: `${sessionId}-user-${turnIndex + 1}`,
          }
        : undefined,
      modelRounds: turn.modelRounds.map((round, roundIndex) => ({
        ...round,
        id: `${sessionId}-round-${turnIndex + 1}-${roundIndex + 1}`,
        items: round.items.map((item, itemIndex) => ({
          ...item,
          id: `${sessionId}-item-${turnIndex + 1}-${roundIndex + 1}-${itemIndex + 1}`,
        })),
      })),
    })),
  } as Session;
}

function createCancelledResumeDeepReview(): Session {
  const childSession = createInterruptedDeepReviewWithoutResult();
  return {
    ...childSession,
    status: 'idle',
    error: null,
    dialogTurns: [
      ...childSession.dialogTurns,
      {
        id: 'turn-2',
        sessionId: 'deep-review-child',
        userMessage: {
          id: 'user-2',
          content: 'Continue interrupted Deep Review',
          timestamp: 2,
        },
        modelRounds: [],
        status: 'cancelled',
        startTime: 2,
        timestamp: 2,
      },
    ],
  } as Session;
}

function createCompletedResumeDeepReview(): Session {
  const childSession = createReviewSession();
  return {
    ...childSession,
    dialogTurns: [
      createInterruptedDeepReviewWithoutResult().dialogTurns[0],
      {
        ...childSession.dialogTurns[0],
        id: 'turn-2',
        userMessage: {
          id: 'user-2',
          content: 'Continue interrupted Deep Review',
          timestamp: 2,
        },
        startTime: 2,
        timestamp: 2,
      },
    ],
  } as Session;
}

function createCancelledFixDeepReview(): Session {
  const childSession = createReviewSession();
  return {
    ...childSession,
    status: 'idle',
    error: null,
    dialogTurns: [
      ...childSession.dialogTurns,
      {
        id: 'fix-turn-1',
        sessionId: 'deep-review-child',
        userMessage: {
          id: 'fix-user-1',
          content: 'Fix review findings',
          timestamp: 3,
        },
        modelRounds: [],
        status: 'cancelled',
        startTime: 3,
        timestamp: 3,
      },
    ],
  } as Session;
}

function setTextareaValue(input: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('BtwSessionPanel review action bar integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    flowChatListeners.clear();
    mockGetModeSkillConfigs.mockResolvedValue([]);
    mockExecutionState = 'idle';
    mockCreateImageContextFromFile.mockResolvedValue({
      id: 'image-context-1',
      type: 'image',
      imageName: 'reference.png',
      imagePath: 'D:/workspace/project/reference.png',
      dataUrl: 'data:image/png;base64,abc',
      fileSize: 10,
      mimeType: 'image/png',
      source: 'file',
      isLocal: true,
    });
    mockBuildImageContextsForBackend.mockReturnValue({
      imageContexts: [{
        id: 'image-context-1',
        source: 'data_url',
        dataUrl: 'data:image/png;base64,abc',
        mimeType: 'image/png',
        name: 'reference.png',
      }],
    });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useReviewActionBarStore.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const childSession = createReviewSession();
    flowChatState = {
      sessions: new Map([
        ['deep-review-child', childSession],
        ['parent-session', {
          sessionId: 'parent-session',
          title: 'Parent',
          dialogTurns: [],
          status: 'idle',
          config: {},
          createdAt: 1,
          lastActiveAt: 1,
          error: null,
        } as Session],
      ]),
      activeSessionId: 'deep-review-child',
    } as FlowChatState;

    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    flowChatListeners.clear();
    useReviewActionBarStore.getState().reset();
  });

  it('keeps terminal Review lifecycle coordination active while presentation is hidden', async () => {
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createRunningDeepReviewSession()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
          isActive={false}
        />,
      );
    });

    expect(useReviewActionBarStore.getState().phase).toBe('review_running');
    expect(flowChatListeners.size).toBe(1);

    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createReviewSession()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;
    await act(async () => {
      flowChatListeners.forEach(listener => listener(flowChatState));
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'review_completed',
    });
    expect(mockCancelSession).not.toHaveBeenCalled();
    expect(mockBtwCancel).not.toHaveBeenCalled();
  });

  it('shows the completed Deep Review action bar even when the report has no remediation items', async () => {
    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
        />,
      );
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'review_completed',
    });
    expect(useReviewActionBarStore.getState().remediationItems).toEqual([]);
  });

  it('sends follow-up messages to the active BTW child session only', async () => {
    mockSendMessage.mockResolvedValue(undefined);
    const parentSession = createParentSessionWithId('parent-session');
    const btwSession = createBtwSessionWithId('btw-child', parentSession.sessionId);
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        [parentSession.sessionId, parentSession],
        [btwSession.sessionId, btwSession],
      ]),
      activeSessionId: parentSession.sessionId,
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId={btwSession.sessionId}
          parentSessionId={parentSession.sessionId}
          workspacePath="D:/workspace/project"
        />,
      );
    });

    const input = container.querySelector<HTMLTextAreaElement>('.btw-session-panel__composer-input');
    expect(input).toBeTruthy();

    await act(async () => {
      setTextareaValue(input!, 'Can you explain the current result?');
    });

    const sendButton = container.querySelector<HTMLButtonElement>('.btw-session-panel__composer-button');
    expect(sendButton?.disabled).toBe(false);

    await act(async () => {
      sendButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      'Can you explain the current result?',
      'btw-child',
      undefined,
      'agentic',
    );
    expect(flowChatState.activeSessionId).toBe(parentSession.sessionId);
  });

  it('sends follow-up messages to the active subagent child session only', async () => {
    mockSendMessage.mockResolvedValue(undefined);
    const parentSession = createParentSessionWithId('parent-session');
    const subagentSession = createSubagentSessionWithId('subagent-child', parentSession.sessionId);
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        [parentSession.sessionId, parentSession],
        [subagentSession.sessionId, subagentSession],
      ]),
      activeSessionId: parentSession.sessionId,
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId={subagentSession.sessionId}
          parentSessionId={parentSession.sessionId}
          workspacePath="D:/workspace/project"
        />,
      );
    });

    const input = container.querySelector<HTMLTextAreaElement>('.btw-session-panel__composer-input');
    expect(input).toBeTruthy();

    await act(async () => {
      setTextareaValue(input!, 'Continue from your last finding.');
    });

    const sendButton = container.querySelector<HTMLButtonElement>('.btw-session-panel__composer-button');

    await act(async () => {
      sendButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      'Continue from your last finding.',
      'subagent-child',
      undefined,
      'Researcher',
    );
    expect(flowChatState.activeSessionId).toBe(parentSession.sessionId);
  });

  it('converts subagent /skill commands into normal child session messages', async () => {
    mockSendMessage.mockResolvedValue(undefined);
    mockGetModeSkillConfigs.mockResolvedValue([
      createModeSkill('剧本猫咪拯救法'),
      createModeSkill('禁用技能', { effectiveEnabled: false }),
    ]);
    const parentSession = createParentSessionWithId('parent-session');
    const subagentSession = createSubagentSessionWithId('subagent-child', parentSession.sessionId);
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        [parentSession.sessionId, parentSession],
        [subagentSession.sessionId, subagentSession],
      ]),
      activeSessionId: parentSession.sessionId,
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId={subagentSession.sessionId}
          parentSessionId={parentSession.sessionId}
          workspacePath="D:/workspace/project"
        />,
      );
      await Promise.resolve();
    });

    expect(mockGetModeSkillConfigs).toHaveBeenCalledWith({
      modeId: 'Researcher',
      workspacePath: 'D:/workspace/project',
    });

    const input = container.querySelector<HTMLTextAreaElement>('.btw-session-panel__composer-input');
    expect(input).toBeTruthy();

    await act(async () => {
      setTextareaValue(input!, '/skill 剧本猫咪拯救法 帮我重写第一场对白');
    });

    const sendButton = container.querySelector<HTMLButtonElement>('.btw-session-panel__composer-button');
    await act(async () => {
      sendButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      'Use the "剧本猫咪拯救法" skill. 帮我重写第一场对白',
      'subagent-child',
      undefined,
      'Researcher',
    );
  });

  it('shows only runtime-enabled subagent skills in the child composer picker', async () => {
    mockGetModeSkillConfigs.mockResolvedValue([
      createModeSkill('剧本猫咪拯救法'),
      createModeSkill('禁用技能', { effectiveEnabled: false }),
      createModeSkill('覆盖技能', { selectedForRuntime: false }),
    ]);
    const parentSession = createParentSessionWithId('parent-session');
    const subagentSession = createSubagentSessionWithId('subagent-child', parentSession.sessionId);
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        [parentSession.sessionId, parentSession],
        [subagentSession.sessionId, subagentSession],
      ]),
      activeSessionId: parentSession.sessionId,
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId={subagentSession.sessionId}
          parentSessionId={parentSession.sessionId}
          workspacePath="D:/workspace/project"
        />,
      );
      await Promise.resolve();
    });

    const input = container.querySelector<HTMLTextAreaElement>('.btw-session-panel__composer-input');
    expect(input).toBeTruthy();

    await act(async () => {
      setTextareaValue(input!, '/skill 剧');
      await Promise.resolve();
    });

    expect(container.textContent).toContain('剧本猫咪拯救法');
    expect(container.textContent).not.toContain('禁用技能');
    expect(container.textContent).not.toContain('覆盖技能');

    const skillButton = container.querySelector<HTMLButtonElement>('.btw-session-panel__composer-skill-item');
    await act(async () => {
      skillButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(input!.value).toBe('/skill 剧本猫咪拯救法 ');
  });

  it('renders the child composer as a single input box with slash skill discovery', async () => {
    mockGetModeSkillConfigs.mockResolvedValue([
      createModeSkill('剧本猫咪拯救法'),
    ]);
    const parentSession = createParentSessionWithId('parent-session');
    const subagentSession = createSubagentSessionWithId('subagent-child', parentSession.sessionId);
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        [parentSession.sessionId, parentSession],
        [subagentSession.sessionId, subagentSession],
      ]),
      activeSessionId: parentSession.sessionId,
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId={subagentSession.sessionId}
          parentSessionId={parentSession.sessionId}
          workspacePath="D:/workspace/project"
        />,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('.btw-session-panel__composer-box')).toBeTruthy();

    const input = container.querySelector<HTMLTextAreaElement>('.btw-session-panel__composer-input');
    expect(input).toBeTruthy();

    await act(async () => {
      setTextareaValue(input!, '/');
      await Promise.resolve();
    });

    const skillCommand = container.querySelector<HTMLButtonElement>('[data-testid="btw-session-panel-skill-command"]');
    expect(skillCommand).toBeTruthy();
    expect(skillCommand?.textContent).toContain('/skill');

    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      }));
    });

    expect(input!.value).toBe('/skill ');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('sends selected image attachments to the active subagent child session', async () => {
    mockSendMessage.mockResolvedValue(undefined);
    const parentSession = createParentSessionWithId('parent-session');
    const subagentSession = createSubagentSessionWithId('subagent-child', parentSession.sessionId);
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        [parentSession.sessionId, parentSession],
        [subagentSession.sessionId, subagentSession],
      ]),
      activeSessionId: parentSession.sessionId,
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId={subagentSession.sessionId}
          parentSessionId={parentSession.sessionId}
          workspacePath="D:/workspace/project"
        />,
      );
    });

    const attachInput = container.querySelector<HTMLInputElement>('[data-testid="btw-session-panel-image-input"]');
    expect(attachInput).toBeTruthy();

    const file = new File(['fake image'], 'reference.png', { type: 'image/png' });
    await act(async () => {
      Object.defineProperty(attachInput!, 'files', {
        configurable: true,
        value: [file],
      });
      attachInput!.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    const input = container.querySelector<HTMLTextAreaElement>('.btw-session-panel__composer-input');
    expect(input).toBeTruthy();
    await act(async () => {
      setTextareaValue(input!, 'Use this as the character reference.');
    });

    const sendButton = container.querySelector<HTMLButtonElement>('.btw-session-panel__composer-button');
    await act(async () => {
      sendButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockCreateImageContextFromFile).toHaveBeenCalledWith(
      file,
      { workspacePath: 'D:/workspace/project' },
    );
    expect(mockBuildImageContextsForBackend).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'image-context-1',
        type: 'image',
      }),
    ]);
    expect(mockSendMessage).toHaveBeenCalledWith(
      'Use this as the character reference.',
      'subagent-child',
      undefined,
      'Researcher',
      undefined,
      {
        imageContexts: [{
          id: 'image-context-1',
          source: 'data_url',
          dataUrl: 'data:image/png;base64,abc',
          mimeType: 'image/png',
          name: 'reference.png',
        }],
      },
    );
    expect(flowChatState.activeSessionId).toBe(parentSession.sessionId);
  });

  it('sends selected text attachments as child session context without changing the active parent session', async () => {
    mockSendMessage.mockResolvedValue(undefined);
    const parentSession = createParentSessionWithId('parent-session');
    const subagentSession = createSubagentSessionWithId('subagent-child', parentSession.sessionId);
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        [parentSession.sessionId, parentSession],
        [subagentSession.sessionId, subagentSession],
      ]),
      activeSessionId: parentSession.sessionId,
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId={subagentSession.sessionId}
          parentSessionId={parentSession.sessionId}
          workspacePath="D:/workspace/project"
        />,
      );
    });

    const attachInput = container.querySelector<HTMLInputElement>('[data-testid="btw-session-panel-file-input"]');
    expect(attachInput).toBeTruthy();

    const file = new File(['# 第一集\n雨夜重逢'], 'script.md', { type: 'text/markdown' });
    await act(async () => {
      Object.defineProperty(attachInput!, 'files', {
        configurable: true,
        value: [file],
      });
      attachInput!.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    const input = container.querySelector<HTMLTextAreaElement>('.btw-session-panel__composer-input');
    expect(input).toBeTruthy();
    await act(async () => {
      setTextareaValue(input!, '请根据这个剧本继续扩写。');
    });

    const sendButton = container.querySelector<HTMLButtonElement>('.btw-session-panel__composer-button');
    await act(async () => {
      sendButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const [message, sessionId, displayMessage, agentType] = mockSendMessage.mock.calls[0];
    expect(sessionId).toBe('subagent-child');
    expect(displayMessage).toBe('请根据这个剧本继续扩写。');
    expect(agentType).toBe('Researcher');
    expect(String(message)).toContain('script.md');
    expect(String(message)).toContain('# 第一集');
    expect(String(message)).toContain('请根据这个剧本继续扩写。');
    expect(flowChatState.activeSessionId).toBe(parentSession.sessionId);
  });

  it('hydrates historical subagent sessions with internal turns included', async () => {
    mockLoadSessionHistory.mockResolvedValue(undefined);
    const parentSession = createParentSessionWithId('parent-session');
    const subagentSession = {
      ...createSubagentSessionWithId('subagent-child', parentSession.sessionId),
      isHistorical: true,
      historyState: 'metadata-only',
      workspacePath: 'D:/workspace/project',
    } as Session;
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        [parentSession.sessionId, parentSession],
        [subagentSession.sessionId, subagentSession],
      ]),
      activeSessionId: parentSession.sessionId,
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId={subagentSession.sessionId}
          parentSessionId={parentSession.sessionId}
          workspacePath="D:/workspace/project"
        />,
      );
    });

    expect(mockLoadSessionHistory).toHaveBeenCalledWith(
      'subagent-child',
      'D:/workspace/project',
      undefined,
      undefined,
      undefined,
      { includeInternal: true },
    );
  });

  it('stops the active BTW turn instead of a stale origin request', async () => {
    mockBtwCancel.mockResolvedValue(undefined);
    const parentSession = createParentSessionWithId('parent-session');
    const btwSession = {
      ...createBtwSessionWithId('btw-child', parentSession.sessionId),
      btwOrigin: {
        requestId: 'old-request',
        parentSessionId: parentSession.sessionId,
      },
      dialogTurns: [{
        id: 'btw-turn-new-request',
        sessionId: 'btw-child',
        userMessage: { id: 'user-1', content: 'follow up', timestamp: 1 },
        modelRounds: [],
        status: 'processing',
        startTime: 1,
      }],
    } as Session;
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        [parentSession.sessionId, parentSession],
        [btwSession.sessionId, btwSession],
      ]),
      activeSessionId: parentSession.sessionId,
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId={btwSession.sessionId}
          parentSessionId={parentSession.sessionId}
          workspacePath="D:/workspace/project"
        />,
      );
    });

    const stopButton = container.querySelector<HTMLButtonElement>('.btw-session-panel__composer-button');
    expect(stopButton?.disabled).toBe(false);

    await act(async () => {
      stopButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockBtwCancel).toHaveBeenCalledWith({ requestId: 'new-request' });
    expect(mockCancelSession).not.toHaveBeenCalled();
  });

  it('shows the running review action as minimized while Deep Review is still processing', async () => {
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createRunningDeepReviewSession()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
        />,
      );
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'review_running',
      minimized: true,
    });
  });

  it('shows the running review action as minimized while Deep Review is pending', async () => {
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createPendingDeepReviewSession()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
        />,
      );
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'review_running',
      minimized: true,
    });
  });

  it('keeps minimized running review action bars isolated across simultaneous reviews', async () => {
    const firstParent = createParentSessionWithId('parent-session-1');
    const secondParent = createParentSessionWithId('parent-session-2');
    const firstChild = cloneReviewSessionWithId(
      createRunningDeepReviewSession(),
      'deep-review-child-1',
      firstParent.sessionId,
    );
    const secondChild = cloneReviewSessionWithId(
      createRunningDeepReviewSession(),
      'deep-review-child-2',
      secondParent.sessionId,
    );

    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        [firstParent.sessionId, firstParent],
        [secondParent.sessionId, secondParent],
        [firstChild.sessionId, firstChild],
        [secondChild.sessionId, secondChild],
      ]),
      activeSessionId: firstChild.sessionId,
    } as FlowChatState;

    await act(async () => {
      root.render(
        <>
          <BtwSessionPanel
            childSessionId={firstChild.sessionId}
            parentSessionId={firstParent.sessionId}
            workspacePath="D:/workspace/project"
          />
          <BtwSessionPanel
            childSessionId={secondChild.sessionId}
            parentSessionId={secondParent.sessionId}
            workspacePath="D:/workspace/project"
          />
        </>,
      );
    });

    expect(container.querySelectorAll('.btw-session-panel__minimized-button')).toHaveLength(2);
  });

  it('keeps bottom breathing room when the review action is minimized', async () => {
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createRunningDeepReviewSession()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
        />,
      );
    });

    const body = container.querySelector<HTMLElement>('.btw-session-panel__body');
    expect(body?.style.paddingBottom).toBe('96px');
  });

  it('restores the minimized running action when capacity waiting ends before the review finishes', async () => {
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createRunningDeepReviewSession()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
        />,
      );
    });

    await act(async () => {
      useReviewActionBarStore.getState().showCapacityQueueBar({
        childSessionId: 'deep-review-child',
        parentSessionId: 'parent-session',
        capacityQueueState: {
          toolId: 'task-security',
          subagentType: 'ReviewSecurity',
          status: 'queued_for_capacity',
          queuedReviewerCount: 1,
          waitingReviewers: [{
            toolId: 'task-security',
            subagentType: 'ReviewSecurity',
            status: 'queued_for_capacity',
          }],
        },
      });
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'review_waiting_capacity',
      minimized: false,
    });

    await act(async () => {
      useReviewActionBarStore.getState().applyCapacityQueueState({
        toolId: 'task-security',
        subagentType: 'ReviewSecurity',
        status: 'running',
        queuedReviewerCount: 0,
        waitingReviewers: [],
      });
      await Promise.resolve();
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'review_running',
      minimized: true,
    });
    expect(container.querySelector('.btw-session-panel__minimized-button')).toBeTruthy();
  });

  it('lets persisted action state replace the running review placeholder', async () => {
    vi.mocked(loadPersistedReviewState).mockResolvedValueOnce({
      version: 1,
      phase: 'fix_running',
      completedRemediationIds: [],
      minimized: true,
      customInstructions: 'Keep the fix focused.',
      persistedAt: 2,
    });
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createRunningDeepReviewSession()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
        />,
      );
      await Promise.resolve();
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'fix_running',
      minimized: true,
      customInstructions: 'Keep the fix focused.',
    });
  });

  it('shows a resumable Deep Review action bar when the run completed without a structured report', async () => {
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createCompletedDeepReviewWithoutResult()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
        />,
      );
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'review_interrupted',
      interruption: expect.objectContaining({
        canResume: true,
        resultRecoveryReason: 'missing_submit_code_review',
      }),
    });
  });

  it('does not restore a stale interruption while a resume request is starting', async () => {
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createInterruptedDeepReviewWithoutResult()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;

    const store = useReviewActionBarStore.getState();
    store.showInterruptedActionBar({
      childSessionId: 'deep-review-child',
      parentSessionId: 'parent-session',
      interruption: {
        phase: 'review_interrupted',
        childSessionId: 'deep-review-child',
        parentSessionId: 'parent-session',
        originalTarget: '/DeepReview review latest commit',
        errorDetail: { category: 'unknown', rawMessage: 'previous execution failed' },
        canResume: true,
        recommendedActions: [],
        reviewers: [],
      },
    });
    store.setActiveAction('resume', { baselineTurnId: 'turn-1' });
    store.updatePhase('resume_running');
    store.minimize();

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
        />,
      );
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'resume_running',
      minimized: true,
    });
  });

  it('expands the action bar when a resumed Deep Review completes successfully', async () => {
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createCompletedResumeDeepReview()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;

    const store = useReviewActionBarStore.getState();
    store.showInterruptedActionBar({
      childSessionId: 'deep-review-child',
      parentSessionId: 'parent-session',
      interruption: {
        phase: 'review_interrupted',
        childSessionId: 'deep-review-child',
        parentSessionId: 'parent-session',
        originalTarget: '/DeepReview review latest commit',
        errorDetail: { category: 'unknown', rawMessage: 'previous execution failed' },
        canResume: true,
        recommendedActions: [],
        reviewers: [],
      },
    });
    store.setActiveAction('resume', { baselineTurnId: 'turn-1' });
    store.updatePhase('resume_running');
    store.minimize();

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
        />,
      );
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'review_completed',
      minimized: false,
    });
  });

  it('marks a stopped fix run as interrupted and restores the action bar state', async () => {
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createCancelledFixDeepReview()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;

    const store = useReviewActionBarStore.getState();
    store.showActionBar({
      childSessionId: 'deep-review-child',
      parentSessionId: 'parent-session',
      reviewData: {
        summary: { recommended_action: 'request_changes' },
        remediation_plan: ['Fix issue 1'],
      },
      reviewMode: 'deep',
      phase: 'review_completed',
    });
    const itemId = useReviewActionBarStore.getState().remediationItems[0]?.id;
    expect(itemId).toBeTruthy();
    store.setSelectedRemediationIds(new Set([itemId!]));
    store.setActiveAction('fix', { baselineTurnId: 'turn-1' });
    store.updatePhase('fix_running');
    store.minimize();

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
        />,
      );
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'fix_interrupted',
      minimized: false,
      remainingFixIds: [itemId],
    });
  });

  it('restores the interrupted action bar when a resumed Deep Review is cancelled by the user', async () => {
    flowChatState = {
      ...flowChatState,
      sessions: new Map([
        ['deep-review-child', createCancelledResumeDeepReview()],
        ['parent-session', flowChatState.sessions.get('parent-session')!],
      ]),
    } as FlowChatState;

    const store = useReviewActionBarStore.getState();
    store.showInterruptedActionBar({
      childSessionId: 'deep-review-child',
      parentSessionId: 'parent-session',
      interruption: {
        phase: 'review_interrupted',
        childSessionId: 'deep-review-child',
        parentSessionId: 'parent-session',
        originalTarget: '/DeepReview review latest commit',
        errorDetail: { category: 'unknown', rawMessage: 'previous execution failed' },
        canResume: true,
        recommendedActions: [],
        reviewers: [],
      },
    });
    store.setActiveAction('resume', { baselineTurnId: 'turn-1' });
    store.updatePhase('resume_running');
    store.minimize();

    await act(async () => {
      root.render(
        <BtwSessionPanel
          childSessionId="deep-review-child"
          parentSessionId="parent-session"
          workspacePath="D:/workspace/project"
        />,
      );
    });

    expect(useReviewActionBarStore.getState()).toMatchObject({
      childSessionId: 'deep-review-child',
      phase: 'review_interrupted',
      minimized: false,
      interruption: expect.objectContaining({
        interruptionReason: 'manual_cancelled',
      }),
    });
  });
});
