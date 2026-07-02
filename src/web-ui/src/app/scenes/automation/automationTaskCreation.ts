import type { CreateCronJobRequest, CronSchedule } from '@/infrastructure/api';
import type { AutomationTask } from './automation-types';

export function taskToCronSchedule(task: AutomationTask): CronSchedule {
  const scheduledDate = new Date(task.scheduledAt);
  switch (task.scheduleType) {
    case 'hourly':
      return { kind: 'every', everyMs: 60 * 60 * 1000 };
    case 'daily':
      return {
        kind: 'cron',
        expr: `${scheduledDate.getMinutes()} ${scheduledDate.getHours()} * * *`,
      };
    case 'weekly':
      return {
        kind: 'cron',
        expr: `${scheduledDate.getMinutes()} ${scheduledDate.getHours()} * * ${scheduledDate.getDay()}`,
      };
    case 'monthly':
      return {
        kind: 'cron',
        expr: `${scheduledDate.getMinutes()} ${scheduledDate.getHours()} ${scheduledDate.getDate()} * *`,
      };
    case 'once':
    default:
      return { kind: 'at', at: scheduledDate.toISOString() };
  }
}

export function buildCreateCronJobRequest(
  task: AutomationTask,
  sessionId: string,
): CreateCronJobRequest {
  return {
    name: task.name.trim(),
    payload: { text: task.prompt.trim() || task.name.trim() },
    enabled: true,
    schedule: taskToCronSchedule(task),
    workspacePath: task.workspacePath?.trim() ?? '',
    sessionId,
  };
}
