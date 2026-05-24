import { describe, expect, it } from 'vitest';
import { layoutTimedTasks } from './automationCalendarLayout';
import type { AutomationTask } from './automation-types';

function task(id: string, hour: number, minute: number, duration: number): AutomationTask {
  return {
    id,
    name: id,
    description: id,
    prompt: id,
    agentId: 'agent',
    scheduleType: 'once',
    scheduledAt: new Date(2026, 4, 25, hour, minute, 0, 0).toISOString(),
    duration,
    priority: 'P2',
    status: 'pending',
    enabled: true,
    createdAt: new Date(2026, 4, 24).toISOString(),
  };
}

describe('automation calendar layout', () => {
  it('assigns overlapping timed tasks to separate lanes', () => {
    const slots = layoutTimedTasks(
      [task('a', 9, 0, 60), task('b', 9, 30, 60)],
      { hourHeight: 64, minHeight: 36 },
    );

    expect(slots).toEqual([
      expect.objectContaining({ taskId: 'a', leftPercent: 0, widthPercent: 50 }),
      expect.objectContaining({ taskId: 'b', leftPercent: 50, widthPercent: 50 }),
    ]);
  });

  it('keeps late-day tasks reachable inside the 24-hour grid', () => {
    const [slot] = layoutTimedTasks(
      [task('late', 23, 45, 60)],
      { hourHeight: 64, minHeight: 36 },
    );

    expect(slot.top).toBeLessThanOrEqual(24 * 64 - 36);
    expect(slot.height).toBeGreaterThanOrEqual(36);
  });
});
