import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateSessionGoalMock = vi.fn();
const setGoalModeActiveMock = vi.fn();
const successMock = vi.fn();

vi.mock('@/infrastructure/api/service-api/AgentAPI', () => ({
  agentAPI: {
    updateSessionGoal: (...args: any[]) => updateSessionGoalMock(...args),
  },
}));

vi.mock('@/shared/notification-system', () => ({
  notificationService: {
    success: (...args: any[]) => successMock(...args),
    error: vi.fn(),
  },
}));

vi.mock('../store/FlowChatStore', () => ({
  flowChatStore: {
    setGoalModeActive: (...args: any[]) => setGoalModeActiveMock(...args),
  },
}));

vi.mock('./FlowChatManager', () => ({
  FlowChatManager: {
    getInstance: () => ({
      sendMessage: vi.fn(),
    }),
  },
}));

import { runGoalManagementCommand } from './goalService';
import type { Session } from '../types/flow-chat';

describe('goalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves runtime-owned goal token accounting fields', async () => {
    updateSessionGoalMock.mockResolvedValue({
      success: true,
      status: 'usage-limited',
      active: false,
      goalText: 'Ship feature',
      tokenBudget: 1000,
      tokensUsed: 1000,
      displayMessage: 'Goal token budget reached',
    });

    const result = await runGoalManagementCommand({
      session: {
        sessionId: 'session-1',
        workspacePath: 'D:/workspace/project',
        remoteConnectionId: undefined,
        remoteSshHost: undefined,
      } as Session,
      action: 'pause',
      failedTitle: 'Goal failed',
      unknownErrorMessage: 'Unknown error',
      updatedTitle: 'Goal updated',
    });

    expect(result).toEqual({
      status: 'usage-limited',
      active: false,
      goalText: 'Ship feature',
      tokenBudget: 1000,
      tokensUsed: 1000,
      displayMessage: 'Goal token budget reached',
    });
    expect(setGoalModeActiveMock).toHaveBeenCalledWith('session-1', false);
  });
});
