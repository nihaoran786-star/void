import type { CronJob, CronSchedule } from '@/infrastructure/api';
import type { AutomationAgent, AutomationTask, AutomationScheduleType, AutomationTaskStatus } from './automation-types';
import { getAutomationJobNextRunAtMs } from './automationSchedule';

export interface AutomationSessionSource {
  sessionId: string;
  title?: string;
  workspacePath?: string;
  parentSessionId?: string;
}

function cronStatusToAutomationStatus(job: CronJob): AutomationTaskStatus {
  if (!job.enabled) return 'pending';
  const status = job.state.lastRunStatus;
  if (status === 'running' || status === 'queued') return 'running';
  if (status === 'ok') return 'completed';
  if (status === 'error' || status === 'cancelled') return 'failed';
  return 'pending';
}

function cronScheduleToAutomationScheduleType(schedule: CronSchedule): AutomationScheduleType {
  if (schedule.kind === 'at') return 'once';
  if (schedule.kind === 'every') {
    if (schedule.everyMs === 60 * 60 * 1000) return 'hourly';
    if (schedule.everyMs === 24 * 60 * 60 * 1000) return 'daily';
    return 'hourly';
  }
  const parts = schedule.expr.trim().split(/\s+/);
  if (parts.length === 5) {
    const [, hour, dayOfMonth, month, dayOfWeek] = parts;
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') return 'daily';
    if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') return 'weekly';
    if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') return 'monthly';
    if (hour === '*') return 'hourly';
  }
  return 'daily';
}

function timestampToIso(timestampMs: number | null | undefined, fallbackMs: number): string {
  const value = timestampMs && Number.isFinite(timestampMs) ? timestampMs : fallbackMs;
  return new Date(value).toISOString();
}

export function cronJobToAutomationTask(
  job: CronJob,
  agentNameById: Map<string, string> = new Map(),
): AutomationTask {
  const scheduledAt = timestampToIso(getAutomationJobNextRunAtMs(job), job.createdAtMs);
  const completedAt = job.state.lastRunFinishedAtMs
    ? new Date(job.state.lastRunFinishedAtMs).toISOString()
    : undefined;

  return {
    id: job.id,
    name: job.name,
    description: job.payload.text,
    prompt: job.payload.text,
    agentId: job.sessionId,
    agentName: agentNameById.get(job.sessionId) ?? job.sessionId,
    scheduleType: cronScheduleToAutomationScheduleType(job.schedule),
    scheduledAt,
    duration: Math.max(1, Math.round((job.state.lastDurationMs ?? 30 * 60_000) / 60_000)),
    priority: 'P2',
    status: cronStatusToAutomationStatus(job),
    enabled: job.enabled,
    createdAt: new Date(job.createdAtMs).toISOString(),
    completedAt,
    artifacts: [],
    conversation: [],
  };
}

export function mainSessionToAutomationAgent(session: AutomationSessionSource): AutomationAgent {
  return {
    id: session.sessionId,
    name: session.title?.trim() || session.sessionId,
    type: 'general',
    description: session.workspacePath,
    isSubAgent: false,
  };
}
