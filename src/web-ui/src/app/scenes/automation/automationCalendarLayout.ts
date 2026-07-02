import type { AutomationTask } from './automation-types';

export interface TimedTaskLayoutOptions {
  hourHeight: number;
  minHeight: number;
}

export interface TimedTaskLayoutSlot {
  task: AutomationTask;
  taskId: string;
  top: number;
  height: number;
  leftPercent: number;
  widthPercent: number;
}

interface TimedTaskWorkItem {
  task: AutomationTask;
  start: number;
  end: number;
  lane: number;
}

export function layoutTimedTasks(
  tasks: AutomationTask[],
  options: TimedTaskLayoutOptions,
): TimedTaskLayoutSlot[] {
  const dayHeight = 24 * options.hourHeight;
  const items = tasks
    .map(task => {
      const startDate = new Date(task.scheduledAt);
      const start =
        startDate.getHours() * options.hourHeight +
        (startDate.getMinutes() / 60) * options.hourHeight;
      const height = Math.max(
        options.minHeight,
        (task.duration / 60) * options.hourHeight - 2,
      );
      return {
        task,
        start,
        end: start + height,
        lane: 0,
      };
    })
    .sort((left, right) => left.start - right.start || left.task.id.localeCompare(right.task.id));

  const groups: TimedTaskWorkItem[][] = [];
  let currentGroup: TimedTaskWorkItem[] = [];
  let currentGroupEnd = -1;

  items.forEach(item => {
    if (currentGroup.length === 0 || item.start < currentGroupEnd) {
      currentGroup.push(item);
      currentGroupEnd = Math.max(currentGroupEnd, item.end);
      return;
    }
    groups.push(currentGroup);
    currentGroup = [item];
    currentGroupEnd = item.end;
  });
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups.flatMap(group => {
    const laneEnds: number[] = [];
    group.forEach(item => {
      const availableLane = laneEnds.findIndex(end => end <= item.start);
      const lane = availableLane === -1 ? laneEnds.length : availableLane;
      item.lane = lane;
      laneEnds[lane] = item.end;
    });

    const laneCount = Math.max(1, laneEnds.length);
    const widthPercent = 100 / laneCount;
    return group.map(item => {
      const rawHeight = Math.max(options.minHeight, item.end - item.start);
      const height = Math.min(rawHeight, dayHeight);
      const top = Math.min(Math.max(0, item.start), Math.max(0, dayHeight - height));
      return {
        task: item.task,
        taskId: item.task.id,
        top,
        height,
        leftPercent: item.lane * widthPercent,
        widthPercent,
      };
    });
  });
}
