// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const listeners = new Set<(state: unknown) => void>();
  return {
    state: { sessions: new Map<string, unknown>(), activeSessionId: null as string | null },
    listeners,
    renderedTitles: [] as string[],
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    beforeSubscribe: null as (() => void) | null,
  };
});

vi.mock('@/component-library', () => ({
  IconButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: harness.t }),
  i18nService: { t: harness.t },
}));
vi.mock('../../../../../flow_chat/store/FlowChatStore', () => ({
  flowChatStore: {
    getState: () => harness.state,
    subscribe: (listener: (state: unknown) => void) => {
      harness.beforeSubscribe?.();
      harness.beforeSubscribe = null;
      harness.listeners.add(listener);
      return () => harness.listeners.delete(listener);
    },
    clearSessionUnreadCompletion: vi.fn(),
    clearSessionNeedsAttention: vi.fn(),
    loadSessionMetadataPage: vi.fn(),
  },
}));
vi.mock('../../../../../flow_chat/services/FlowChatManager', () => ({
  flowChatManager: {
    switchToChatSession: vi.fn(),
    renameChatSessionTitle: vi.fn(),
    deleteChatSession: vi.fn(),
  },
}));
vi.mock('../../../../stores/sceneStore', () => ({
  useSceneStore: (selector: (state: { activeTabId: string }) => unknown) =>
    selector({ activeTabId: 'session' }),
}));
vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useWorkspaceContext: () => ({ setActiveWorkspace: vi.fn(), currentWorkspace: null }),
}));
vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/app/components/panels/content-canvas/stores', () => ({
  useAgentCanvasStore: () => null,
}));
vi.mock('@/flow_chat/services/openBtwSession', () => ({
  openBtwSessionInAuxPane: vi.fn(),
  openMainSession: vi.fn(),
  selectActiveBtwSessionTab: vi.fn(),
}));
vi.mock('@/flow_chat/utils/sessionMetadata', () => ({
  resolveSessionRelationship: () => ({
    parentSessionId: null,
    kind: 'btw',
    displayAsChild: false,
    isReview: false,
  }),
}));
vi.mock('@/flow_chat/utils/sessionOrdering', () => ({
  compareSessionsForNavStable: () => 0,
  sessionBelongsToWorkspaceNavRow: () => true,
}));
vi.mock('@/flow_chat/state-machine', () => ({
  stateMachineManager: {
    get: () => undefined,
    getCurrentState: () => undefined,
    subscribeGlobal: () => () => {},
  },
}));
vi.mock('@/flow_chat/utils/sessionTitle', () => ({
  resolveSessionTitle: (session: { title?: string }) => {
    const title = session.title ?? '';
    harness.renderedTitles.push(title);
    return title;
  },
}));
vi.mock('./sessionNavSelection', () => ({
  isSessionNavRowActive: () => false,
  resolveSessionNavListState: () => ({ status: 'ready' }),
}));
vi.mock('@/flow_chat/utils/sessionReviewActivity', () => ({
  deriveSessionReviewActivities: () => new Map(),
  isReviewActivityBlocking: () => false,
}));
vi.mock('@/shared/utils/fixedPopoverViewport', () => ({
  computeFixedPopoverPosition: () => ({ top: 0, left: 0 }),
}));
vi.mock('@/infrastructure/api/service-api/SessionAPI', () => ({
  sessionAPI: { archiveSession: vi.fn() },
}));
vi.mock('@/component-library/components/ConfirmDialog/confirmService', () => ({
  confirmWarning: vi.fn(),
}));
import SessionsSection from './SessionsSection';

function createState(title: string) {
  const session = {
    sessionId: 'session-1',
    title,
    dialogTurns: [],
    status: 'idle',
    config: {},
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    sessionKind: 'normal',
  };
  return {
    sessions: new Map([[session.sessionId, session]]),
    activeSessionId: session.sessionId,
  };
}

describe('SessionsSection presentation boundary', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    harness.state = createState('Before hidden update');
    harness.listeners.clear();
    harness.renderedTitles = [];
    harness.beforeSubscribe = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('commit-checks the latest snapshot, stays live while visible, and freezes hidden', async () => {
    await act(async () => {
      root.render(<SessionsSection isVisible={false} />);
    });
    expect(harness.listeners.size).toBe(0);

    harness.state = createState('Updated before visible render');
    harness.beforeSubscribe = () => {
      harness.state = createState('Updated during subscribe');
    };
    harness.renderedTitles = [];
    await act(async () => {
      root.render(<SessionsSection isVisible />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Updated during subscribe');
    expect(harness.listeners.size).toBe(1);

    await act(async () => {
      harness.state = createState('Updated while visible');
      harness.listeners.forEach(listener => listener(harness.state));
    });
    expect(container.textContent).toContain('Updated while visible');

    await act(async () => {
      root.render(<SessionsSection isVisible={false} />);
    });
    expect(harness.listeners.size).toBe(0);

    const hiddenRenderCount = harness.renderedTitles.length;
    harness.state = createState('Second hidden update');
    await act(async () => {
      harness.listeners.forEach(listener => listener(harness.state));
    });
    expect(harness.renderedTitles).toHaveLength(hiddenRenderCount);
    expect(container.textContent).toContain('Updated while visible');
  });
});
