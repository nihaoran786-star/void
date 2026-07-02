import type { CronJob, CronSchedule } from '@/infrastructure/api';

export type AutomationScheduleGroupKey = 'today' | 'tomorrow' | 'upcoming' | 'unscheduled';

export interface AutomationScheduleItem {
  job: CronJob;
  nextRunAtMs: number | null;
}

export type AutomationScheduleGroups = Record<AutomationScheduleGroupKey, AutomationScheduleItem[]>;

export interface AutomationSessionLike {
  sessionId: string;
  workspacePath?: string | null;
  parentSessionId?: string | null;
  mode?: string | null;
  sessionKind?: string | null;
  isTransient?: boolean;
}

export type AutomationScheduleDraft =
  | { kind: 'once'; at: string }
  | { kind: 'future'; at: string }
  | { kind: 'hourly' }
  | { kind: 'daily'; dailyTime: string; timezone?: string }
  | { kind: 'interval'; everyMinutes: string; anchorMs?: string }
  | { kind: 'cron'; expr: string; timezone?: string };

const HOUR_IN_MS = 60 * 60 * 1000;
const MINUTE_IN_MS = 60 * 1000;

export function getAutomationJobNextRunAtMs(job: Pick<CronJob, 'state'>): number | null {
  return job.state.pendingTriggerAtMs ?? job.state.retryAtMs ?? job.state.nextRunAtMs ?? null;
}

function startOfLocalDay(timestampMs: number): number {
  const date = new Date(timestampMs);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getScheduleGroupKey(nextRunAtMs: number | null, nowMs: number): AutomationScheduleGroupKey {
  if (!nextRunAtMs || !Number.isFinite(nextRunAtMs)) return 'unscheduled';

  const todayStart = startOfLocalDay(nowMs);
  const tomorrowStart = todayStart + 24 * HOUR_IN_MS;
  const afterTomorrowStart = tomorrowStart + 24 * HOUR_IN_MS;

  if (nextRunAtMs >= todayStart && nextRunAtMs < tomorrowStart) return 'today';
  if (nextRunAtMs >= tomorrowStart && nextRunAtMs < afterTomorrowStart) return 'tomorrow';
  return 'upcoming';
}

export function groupAutomationJobsByNextRun(
  jobs: CronJob[],
  nowMs: number = Date.now(),
): AutomationScheduleGroups {
  const groups: AutomationScheduleGroups = {
    today: [],
    tomorrow: [],
    upcoming: [],
    unscheduled: [],
  };

  for (const job of jobs) {
    const nextRunAtMs = getAutomationJobNextRunAtMs(job);
    groups[getScheduleGroupKey(nextRunAtMs, nowMs)].push({ job, nextRunAtMs });
  }

  for (const key of Object.keys(groups) as AutomationScheduleGroupKey[]) {
    groups[key].sort((left, right) => {
      const leftTime = left.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime || left.job.name.localeCompare(right.job.name);
    });
  }

  return groups;
}

export function filterMainSessionsForAutomation<T extends AutomationSessionLike>(
  sessions: T[],
  workspacePath?: string,
): T[] {
  const workspace = workspacePath?.trim();
  return sessions.filter(session => {
    if (session.parentSessionId) return false;
    if (session.sessionKind === 'subagent') return false;
    if (session.isTransient) return false;
    const normalizedMode = session.mode?.trim().toLowerCase();
    if (normalizedMode === 'claw') return false;
    if (normalizedMode && normalizedMode !== 'agentic' && normalizedMode !== 'code' && normalizedMode !== 'cowork') {
      return false;
    }
    if (!workspace) return true;
    return (session.workspacePath || workspace) === workspace;
  });
}

export function buildCronScheduleFromAutomationDraft(draft: AutomationScheduleDraft): CronSchedule {
  switch (draft.kind) {
    case 'once':
    case 'future':
      if (!draft.at.trim()) throw new Error('Run time is required.');
      return { kind: 'at', at: new Date(draft.at).toISOString() };
    case 'hourly':
      return { kind: 'every', everyMs: HOUR_IN_MS };
    case 'daily': {
      const [hour, minute] = draft.dailyTime.split(':').map(part => Number(part));
      if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error('Daily time must use HH:mm.');
      }
      return {
        kind: 'cron',
        expr: `${minute} ${hour} * * *`,
        tz: draft.timezone?.trim() || undefined,
      };
    }
    case 'interval': {
      const everyMinutes = Number(draft.everyMinutes);
      if (!Number.isFinite(everyMinutes) || everyMinutes <= 0) {
        throw new Error('Interval must be greater than 0 minutes.');
      }
      const anchorMs = draft.anchorMs?.trim() ? new Date(draft.anchorMs).getTime() : undefined;
      return { kind: 'every', everyMs: Math.round(everyMinutes * MINUTE_IN_MS), anchorMs };
    }
    case 'cron':
      if (!draft.expr.trim()) throw new Error('Cron expression is required.');
      return {
        kind: 'cron',
        expr: draft.expr.trim(),
        tz: draft.timezone?.trim() || undefined,
      };
    default: {
      const exhaustive: never = draft;
      return exhaustive;
    }
  }
}
