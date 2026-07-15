// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    listJobs: vi.fn(),
    listeners,
    providerTasks: [] as unknown[],
    flowState: { sessions: new Map(), activeSessionId: null },
    t: (key: string) => key,
  };
});

vi.mock('@/infrastructure/api', () => ({
  cronAPI: {
    listJobs: harness.listJobs,
    createJob: vi.fn(),
    deleteJob: vi.fn(),
    updateJob: vi.fn(),
    runJobNow: vi.fn(),
  },
}));
vi.mock('@/infrastructure/i18n/hooks/useI18n', () => ({
  useI18n: () => ({ t: harness.t }),
}));
vi.mock('@/infrastructure/i18n', () => ({
  i18nService: { t: (key: string) => key },
}));
vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    currentWorkspace: null,
    openedWorkspacesList: [],
    openWorkspace: vi.fn(),
  }),
}));
vi.mock('@/flow_chat/store/FlowChatStore', () => ({
  flowChatStore: {
    getState: () => harness.flowState,
    subscribe: (listener: () => void) => {
      harness.listeners.add(listener);
      return () => harness.listeners.delete(listener);
    },
  },
}));
vi.mock('@/flow_chat/services/FlowChatManager', () => ({
  flowChatManager: {
    markChatSessionAutomation: vi.fn(),
    createChatSession: vi.fn(),
    renameChatSessionTitle: vi.fn(),
  },
}));
vi.mock('@/shared/notification-system/services/NotificationService', () => ({
  notificationService: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}));
vi.mock('./automationViewModel', () => ({
  cronJobToAutomationTask: (job: { id: string }) => ({ id: job.id }),
}));
vi.mock('./automationTargeting', () => ({
  buildAutomationSessionTitle: (name: string) => name,
  buildAutomationWorkspaces: () => [],
  getDefaultAutomationWorkspaceId: () => undefined,
  toFlowChatSessionMode: () => 'code',
}));
vi.mock('./automationTaskCreation', () => ({
  buildCreateCronJobRequest: () => ({}),
}));
vi.mock('./automation-context', () => ({
  AutomationProvider: ({ tasks, children }: { tasks: unknown[]; children: React.ReactNode }) => {
    harness.providerTasks = tasks;
    return <>{children}</>;
  },
  useAutomation: () => ({ view: 'week' }),
}));
vi.mock('./AutomationHeader', () => ({ AutomationHeader: () => null }));
vi.mock('./WeekView', () => ({ WeekView: () => null }));
vi.mock('./MonthView', () => ({ MonthView: () => null }));
vi.mock('./DayView', () => ({ DayView: () => null }));
vi.mock('./ListView', () => ({ ListView: () => null }));
vi.mock('./TaskDetailPanel', () => ({ TaskDetailPanel: () => null }));
vi.mock('./CreateTaskDialog', () => ({ CreateTaskDialog: () => null }));

import AutomationScene from './AutomationScene';

describe('AutomationScene activity boundary', () => {
  let container: HTMLDivElement;
  let root: Root;
  let resolveJobs!: (jobs: Array<{ id: string }>) => void;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    harness.listeners.clear();
    harness.providerTasks = [];
    harness.listJobs.mockReset();
    harness.listJobs.mockReturnValue(new Promise(resolve => {
      resolveJobs = resolve;
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('pauses only FlowChat presentation while an in-flight automation load finishes hidden', async () => {
    await act(async () => {
      root.render(<AutomationScene isActive />);
    });
    expect(harness.listJobs).toHaveBeenCalledTimes(1);
    expect(harness.listeners.size).toBe(1);

    await act(async () => {
      root.render(<AutomationScene isActive={false} />);
    });
    expect(harness.listeners.size).toBe(0);
    expect(harness.listJobs).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveJobs([{ id: 'job-finished-while-hidden' }]);
      await Promise.resolve();
    });
    expect(harness.providerTasks).toEqual([{ id: 'job-finished-while-hidden' }]);

    await act(async () => {
      root.render(<AutomationScene isActive />);
    });
    expect(harness.listeners.size).toBe(1);
    expect(harness.listJobs).toHaveBeenCalledTimes(1);
  });
});
