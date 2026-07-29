// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { ChatInput } from './ChatInput';
import {
  ProcessingPhase,
  SessionExecutionState,
  type SessionStateMachine,
} from '../state-machine/types';

const mocks = vi.hoisted(() => ({
  session: {
    sessionId: 'session-1',
    title: '父会话',
    dialogTurns: [],
    status: 'active',
    config: {
      agentType: 'agentic',
      modelName: 'auto',
    },
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    mode: 'agentic',
    scenario: 'code',
    executionPolicy: 'agentic',
    workspaceId: 'workspace-1',
    workspacePath: 'D:/workspace',
    sessionKind: 'normal',
  },
  modePending: false,
  personaPending: false,
  sessionSnapshot: null as SessionStateMachine | null,
  sendMessage: vi.fn(),
  startBtwThread: vi.fn(),
  runGoalCommandSafely: vi.fn(),
  runGoalManagementCommandSafely: vi.fn(),
  cancelCurrentTask: vi.fn(),
  transition: vi.fn(),
  setQueuedInput: vi.fn(),
}));

const session = mocks.session;

const idleSnapshot = (): SessionStateMachine => ({
  sessionId: session.sessionId,
  currentState: SessionExecutionState.IDLE,
  context: {
    taskId: null,
    currentDialogTurnId: null,
    currentModelRoundId: null,
    pendingToolConfirmations: new Set(),
    errorMessage: null,
    queuedInput: null,
    processingPhase: null,
    planner: null,
    stats: {
      startTime: null,
      textCharsGenerated: 0,
      toolsExecuted: 0,
    },
    version: 1,
    lastUpdateTime: 1,
    backendSyncedAt: null,
    errorRecovery: {
      errorCount: 0,
      lastErrorTime: null,
      errorType: null,
      recoverable: true,
    },
  },
  transitionHistory: [],
});

const processingSnapshot = (): SessionStateMachine => ({
  ...idleSnapshot(),
  currentState: SessionExecutionState.PROCESSING,
  context: {
    ...idleSnapshot().context,
    taskId: 'task-1',
    currentDialogTurnId: 'turn-1',
    processingPhase: ProcessingPhase.THINKING,
    pendingToolConfirmations: new Set(),
    queuedInput: null,
  },
});

vi.mock('react-i18next', async importOriginal => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
    }),
  };
});

vi.mock('@/flow_chat/hooks', () => ({
  useActiveSessionState: () => ({ sessionId: session.sessionId }),
}));

vi.mock('../store/FlowChatStore', () => {
  const flowChatState = {
    sessions: new Map([[mocks.session.sessionId, mocks.session]]),
    activeSessionId: mocks.session.sessionId,
  };
  const flowChatStore = {
    getState: () => flowChatState,
    subscribe: () => () => undefined,
  };
  return {
    FlowChatStore: {
      getInstance: () => flowChatStore,
    },
    flowChatStore,
  };
});

vi.mock('../hooks/useSessionStateMachine', () => ({
  useSessionStateMachine: () => mocks.sessionSnapshot,
  useSessionStateMachineActions: () => ({
    transition: mocks.transition,
    setQueuedInput: mocks.setQueuedInput,
    updatePlanner: vi.fn(),
  }),
}));

vi.mock('../hooks/useComposerContexts', () => ({
  useComposerContexts: () => ({
    contexts: [],
    addContext: vi.fn(),
    removeContext: vi.fn(),
    replaceContexts: vi.fn(),
  }),
}));

vi.mock('../hooks/useMessageSender', () => ({
  useMessageSender: () => ({ sendMessage: mocks.sendMessage }),
}));

vi.mock('../hooks/useComposerModePersistence', () => ({
  useComposerModePersistence: () => ({
    modePersistencePending: mocks.modePending,
    isModePersistencePending: () => mocks.modePending,
    persistModeChange: vi.fn(),
  }),
}));

vi.mock('../hooks/useComposerPersonaSelection', () => ({
  useComposerPersonaSelection: () => ({
    activeAgent: undefined,
    activePersonaBinding: null,
    agents: [],
    teams: [],
    loading: false,
    status: 'empty',
    enabled: false,
    busyId: undefined,
    personaPersistencePending: mocks.personaPending,
    isPersonaPersistencePending: () => mocks.personaPending,
    personaSessionState: {
      sessionId: session.sessionId,
      sessionKind: 'normal',
      status: 'scenario_default',
      scenario: 'code',
      executionPolicy: 'agentic',
      activePersonaBinding: null,
    },
    selectAgent: vi.fn(),
    clearAgent: vi.fn(),
    runTeamAction: vi.fn(),
  }),
}));

vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useCurrentWorkspace: () => ({
    workspace: {
      id: 'workspace-1',
      name: '代码工作区',
      rootPath: 'D:/workspace',
      workspaceKind: 'normal',
    },
    workspacePath: 'D:/workspace',
    workspaceName: '代码工作区',
  }),
  useWorkspaceContext: () => ({ openedWorkspacesList: [] }),
}));

vi.mock('../store/chatInputStateStore', () => {
  const state = {
    setActive: vi.fn(),
    setExpanded: vi.fn(),
    setInputHeight: vi.fn(),
  };
  return {
    useChatInputState: (selector: (value: typeof state) => unknown) =>
      selector(state),
  };
});

vi.mock('../store/inputHistoryStore', () => ({
  useInputHistoryStore: () => ({
    addMessage: vi.fn(),
    getSessionHistory: () => [],
  }),
}));

vi.mock('@/app/stores/sessionModeStore', () => {
  const state = {
    mode: 'code',
    draftId: null,
    draftStatus: 'idle',
    draftWorkspace: null,
    setDraftStatus: vi.fn(),
  };
  const useSessionModeStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state },
  );
  return { useSessionModeStore };
});

vi.mock('@/app/stores/sceneStore', () => {
  const state = { openScene: vi.fn() };
  return {
    useSceneStore: (selector: (value: typeof state) => unknown) =>
      selector(state),
  };
});

vi.mock('@/infrastructure/event-bus', () => ({
  globalEventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}));

vi.mock('@/infrastructure/config/services/ToolPermissionConfigService', () => {
  const config = { mode: 'ask', rules: [] };
  return {
    DEFAULT_TOOL_PERMISSION_CONFIG: config,
    toolPermissionConfigService: {
      loadConfig: vi.fn(async () => config),
      saveMode: vi.fn(async (mode: string) => ({ ...config, mode })),
    },
  };
});

vi.mock('@/infrastructure/api', () => ({
  configAPI: {
    getModeSkillConfigs: vi.fn(async () => []),
  },
  agentAPI: {
    compactSession: vi.fn(),
  },
}));

vi.mock('@/infrastructure/api/service-api/AgentAPI', () => ({
  agentAPI: {
    getAvailableModes: vi.fn(async () => [{
      id: 'agentic',
      name: 'Agentic',
      description: 'Agentic',
      isReadonly: false,
      toolCount: 0,
      promptCacheScopeKey: 'code-stable',
    }]),
    runInitAgentsMd: vi.fn(),
  },
}));

vi.mock('@/infrastructure/api/service-api/MCPAPI', () => ({
  default: {
    getServers: vi.fn(async () => []),
    listPrompts: vi.fn(async () => []),
    getPrompt: vi.fn(),
  },
}));

vi.mock('../services/BtwThreadService', () => ({
  startBtwThread: mocks.startBtwThread,
}));

vi.mock('../services/goalService', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/goalService')>();
  return {
    ...actual,
    runGoalCommandSafely: mocks.runGoalCommandSafely,
    runGoalManagementCommandSafely: mocks.runGoalManagementCommandSafely,
  };
});

vi.mock('../services/FlowChatManager', () => ({
  FlowChatManager: {
    getInstance: () => ({
      cancelCurrentTask: mocks.cancelCurrentTask,
    }),
  },
}));

vi.mock('../services/NewSessionDraftService', () => ({
  completeNewSessionDraft: vi.fn(),
  selectNewSessionDraftWorkspace: vi.fn(),
}));

vi.mock('@/shared/notification-system', () => ({
  notificationService: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../shared/context-system', () => ({
  ContextDropZone: ({ children, className }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock('./FileMentionPicker', () => ({
  FileMentionPicker: () => null,
}));

vi.mock('./ModelSelector', () => ({
  ModelSelector: () => null,
}));

vi.mock('./smart-recommendations', () => ({
  SmartRecommendations: () => null,
}));

vi.mock('./PendingQueuePanel', () => ({
  PendingQueuePanel: () => null,
}));

vi.mock('./ChatInputWorkspaceStrip', () => ({
  ChatInputWorkspaceStrip: () => null,
}));

vi.mock('./ComposerPersonaPicker', () => ({
  ComposerPersonaPicker: () => null,
}));

vi.mock('./ComposerActionButton', () => ({
  ComposerActionButton: () => null,
}));

vi.mock('./DeepReviewConsentDialog', () => ({
  useDeepReviewConsent: () => ({
    confirmDeepReviewLaunch: vi.fn(),
    deepReviewConsentDialog: null,
  }),
}));

vi.mock('../hooks/useSessionReviewActivity', () => ({
  useSessionReviewActivity: () => undefined,
}));

vi.mock('./voice/ComposerVoiceInputButton', () => ({
  ComposerVoiceInputButton: () => null,
}));

vi.mock('./voice/useComposerVoiceInput', () => ({
  useComposerVoiceInput: () => ({ phase: 'idle' }),
}));

vi.mock('@/component-library', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  IconButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  confirmWarning: vi.fn(async () => true),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ChatInput customization persistence keyboard contract', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.modePending = false;
    mocks.personaPending = false;
    mocks.sessionSnapshot = idleSnapshot();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    let frameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now());
      frameId += 1;
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  const renderChatInput = async () => {
    await act(async () => {
      root.render(<ChatInput />);
    });
    const editor = container.querySelector<HTMLElement>(
      '[data-testid="chat-input-textarea"][contenteditable="true"]',
    );
    expect(editor).not.toBeNull();
    return editor!;
  };

  const setEditorText = async (editor: HTMLElement, value: string) => {
    editor.textContent = value;
    await act(async () => {
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: value,
      }));
      await Promise.resolve();
    });
  };

  const pressKey = async (editor: HTMLElement, key: string) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      editor.dispatchEvent(event);
      await Promise.resolve();
      await Promise.resolve();
    });
    return event;
  };

  it.each([
    ['模式持久化', 'mode'],
    ['人格持久化', 'persona'],
  ] as const)('%s pending 时阻止所有 Enter 提交入口', async (_label, pendingKind) => {
    mocks.modePending = pendingKind === 'mode';
    mocks.personaPending = pendingKind === 'persona';
    const editor = await renderChatInput();

    for (const value of ['普通问题', '/btw 请解释', '/goal pause']) {
      await setEditorText(editor, value);
      const event = await pressKey(editor, 'Enter');

      expect(event.defaultPrevented).toBe(true);
      expect(mocks.sendMessage).not.toHaveBeenCalled();
      expect(mocks.startBtwThread).not.toHaveBeenCalled();
      expect(mocks.runGoalCommandSafely).not.toHaveBeenCalled();
      expect(mocks.runGoalManagementCommandSafely).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['模式持久化', 'mode'],
    ['人格持久化', 'persona'],
  ] as const)('%s pending 时 Escape 仍取消运行中的父会话', async (_label, pendingKind) => {
    mocks.modePending = pendingKind === 'mode';
    mocks.personaPending = pendingKind === 'persona';
    mocks.sessionSnapshot = processingSnapshot();
    const editor = await renderChatInput();

    const event = await pressKey(editor, 'Escape');

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => {
      expect(mocks.cancelCurrentTask).toHaveBeenCalledTimes(1);
    });
  });
});
