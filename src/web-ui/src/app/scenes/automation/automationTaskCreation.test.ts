import { describe, expect, it } from 'vitest';
import { buildCreateCronJobRequest } from './automationTaskCreation';
import type { AutomationTask } from './automation-types';

function task(overrides: Partial<AutomationTask> = {}): AutomationTask {
  return {
    id: 'draft',
    name: '每日总结',
    description: '总结项目',
    prompt: '总结当前工作区昨天的变更',
    agentId: '',
    workspaceId: 'ws-a',
    workspacePath: 'C:/repo-a',
    executionMode: 'code',
    scheduleType: 'daily',
    scheduledAt: new Date(2026, 4, 25, 1, 30, 0, 0).toISOString(),
    duration: 30,
    priority: 'P2',
    status: 'pending',
    enabled: true,
    createdAt: '2026-05-24T01:00:00.000Z',
    ...overrides,
  };
}

describe('automation task creation', () => {
  it('builds a cron create request from a dedicated automation session id', () => {
    expect(buildCreateCronJobRequest(task(), 'session-automation')).toEqual({
      name: '每日总结',
      payload: { text: '总结当前工作区昨天的变更' },
      enabled: true,
      sessionId: 'session-automation',
      workspacePath: 'C:/repo-a',
      schedule: {
        kind: 'cron',
        expr: '30 1 * * *',
      },
    });
  });

  it('falls back to task name when prompt is empty but still requires the dedicated session id', () => {
    expect(buildCreateCronJobRequest(task({ prompt: '   ' }), 'session-automation')).toEqual(
      expect.objectContaining({
        payload: { text: '每日总结' },
        sessionId: 'session-automation',
      }),
    );
  });
});
