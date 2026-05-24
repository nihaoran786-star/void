import { describe, expect, it } from 'vitest';
import type { CronJob } from '@/infrastructure/api';
import {
  buildCronScheduleFromAutomationDraft,
  filterMainSessionsForAutomation,
  getAutomationJobNextRunAtMs,
  groupAutomationJobsByNextRun,
} from './automationSchedule';

function makeJob(id: string, nextRunState: Partial<CronJob['state']>): CronJob {
  return {
    id,
    name: id,
    schedule: { kind: 'cron', expr: '0 8 * * *' },
    payload: { text: 'run' },
    enabled: true,
    sessionId: 'session-1',
    workspacePath: 'C:/repo',
    createdAtMs: 1,
    configUpdatedAtMs: 1,
    updatedAtMs: 1,
    state: {
      consecutiveFailures: 0,
      coalescedRunCount: 0,
      ...nextRunState,
    },
  };
}

describe('automationSchedule', () => {
  it('uses pending trigger before retry before next run', () => {
    expect(getAutomationJobNextRunAtMs(makeJob('pending', {
      pendingTriggerAtMs: 30,
      retryAtMs: 20,
      nextRunAtMs: 10,
    }))).toBe(30);

    expect(getAutomationJobNextRunAtMs(makeJob('retry', {
      retryAtMs: 20,
      nextRunAtMs: 10,
    }))).toBe(20);

    expect(getAutomationJobNextRunAtMs(makeJob('next', {
      nextRunAtMs: 10,
    }))).toBe(10);
  });

  it('groups jobs by next known run window', () => {
    const now = new Date('2026-05-24T10:00:00+08:00').getTime();
    const today = new Date('2026-05-24T18:00:00+08:00').getTime();
    const tomorrow = new Date('2026-05-25T09:00:00+08:00').getTime();
    const upcoming = new Date('2026-05-27T09:00:00+08:00').getTime();

    const groups = groupAutomationJobsByNextRun([
      makeJob('unscheduled', {}),
      makeJob('upcoming', { nextRunAtMs: upcoming }),
      makeJob('today', { nextRunAtMs: today }),
      makeJob('tomorrow', { nextRunAtMs: tomorrow }),
    ], now);

    expect(groups.today.map(item => item.job.id)).toEqual(['today']);
    expect(groups.tomorrow.map(item => item.job.id)).toEqual(['tomorrow']);
    expect(groups.upcoming.map(item => item.job.id)).toEqual(['upcoming']);
    expect(groups.unscheduled.map(item => item.job.id)).toEqual(['unscheduled']);
  });

  it('filters automation targets to main sessions in the selected workspace', () => {
    const sessions = [
      { sessionId: 'main-a', workspacePath: 'C:/repo' },
      { sessionId: 'child-a', workspacePath: 'C:/repo', parentSessionId: 'main-a' },
      { sessionId: 'main-b', workspacePath: 'D:/other' },
    ];

    expect(filterMainSessionsForAutomation(sessions, 'C:/repo').map(s => s.sessionId))
      .toEqual(['main-a']);
  });

  it('converts friendly schedule presets to existing cron schedules', () => {
    expect(buildCronScheduleFromAutomationDraft({
      kind: 'hourly',
    })).toEqual({ kind: 'every', everyMs: 3_600_000 });

    expect(buildCronScheduleFromAutomationDraft({
      kind: 'daily',
      dailyTime: '08:30',
      timezone: 'Asia/Shanghai',
    })).toEqual({ kind: 'cron', expr: '30 8 * * *', tz: 'Asia/Shanghai' });

    expect(buildCronScheduleFromAutomationDraft({
      kind: 'future',
      at: '2026-05-24T09:15',
    })).toEqual({ kind: 'at', at: new Date('2026-05-24T09:15').toISOString() });
  });
});
