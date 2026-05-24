import { describe, expect, it } from 'vitest';
import type { CronJob } from '@/infrastructure/api';
import {
  cronJobToAutomationTask,
  mainSessionToAutomationAgent,
  type AutomationSessionSource,
} from './automationViewModel';

function makeJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'job-1',
    name: 'Daily report',
    schedule: { kind: 'cron', expr: '30 8 * * *', tz: 'Asia/Shanghai' },
    payload: { text: 'Summarize yesterday.' },
    enabled: true,
    sessionId: 'session-1',
    workspacePath: 'C:/repo',
    createdAtMs: new Date('2026-05-20T08:00:00+08:00').getTime(),
    configUpdatedAtMs: new Date('2026-05-20T08:00:00+08:00').getTime(),
    updatedAtMs: new Date('2026-05-20T08:00:00+08:00').getTime(),
    state: {
      nextRunAtMs: new Date('2026-05-24T08:30:00+08:00').getTime(),
      lastRunStatus: 'ok',
      lastRunFinishedAtMs: new Date('2026-05-23T08:31:00+08:00').getTime(),
      consecutiveFailures: 0,
      coalescedRunCount: 0,
    },
    ...overrides,
  };
}

describe('automationViewModel', () => {
  it('maps CronJob status into the automation task status vocabulary', () => {
    expect(cronJobToAutomationTask(makeJob({ enabled: false })).status).toBe('pending');
    expect(cronJobToAutomationTask(makeJob({
      state: { ...makeJob().state, lastRunStatus: 'running' },
    })).status).toBe('running');
    expect(cronJobToAutomationTask(makeJob({
      state: { ...makeJob().state, lastRunStatus: 'ok' },
    })).status).toBe('completed');
    expect(cronJobToAutomationTask(makeJob({
      state: { ...makeJob().state, lastRunStatus: 'error' },
    })).status).toBe('failed');
  });

  it('maps schedule and next-run fields into calendar task data', () => {
    const task = cronJobToAutomationTask(makeJob());

    expect(task.id).toBe('job-1');
    expect(task.name).toBe('Daily report');
    expect(task.prompt).toBe('Summarize yesterday.');
    expect(task.agentId).toBe('session-1');
    expect(task.agentName).toBe('session-1');
    expect(task.scheduleType).toBe('daily');
    expect(task.scheduledAt).toBe(new Date('2026-05-24T08:30:00+08:00').toISOString());
    expect(task.completedAt).toBe(new Date('2026-05-23T08:31:00+08:00').toISOString());
  });

  it('maps interval schedules into hourly when they run every hour', () => {
    const task = cronJobToAutomationTask(makeJob({
      schedule: { kind: 'every', everyMs: 3_600_000 },
    }));

    expect(task.scheduleType).toBe('hourly');
  });

  it('converts main sessions into selectable automation agents', () => {
    const session: AutomationSessionSource = {
      sessionId: 'session-1',
      title: 'Research desk',
      workspacePath: 'C:/repo',
    };

    expect(mainSessionToAutomationAgent(session)).toEqual({
      id: 'session-1',
      name: 'Research desk',
      type: 'general',
      description: 'C:/repo',
      isSubAgent: false,
    });
  });
});
