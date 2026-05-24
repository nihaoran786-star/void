import { useEffect, useRef } from 'react';
import { useAutomation } from './automation-context';
import {
  HOURS,
  formatDate,
  isSameDay,
  tasksOnDay,
} from './automation-date-utils';
import { TaskCard } from './TaskCard';

const HOUR_HEIGHT = 64;

export function DayView() {
  const { currentDate, filteredTasks } = useAutomation();
  const today = new Date();
  const isToday = isSameDay(currentDate, today);
  const dayTasks = tasksOnDay(filteredTasks, currentDate);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 80;
    }
  }, []);

  return (
    <div className="day-view">
      <div className="day-view__head">
        <div className="day-view__title-row">
          <span className="day-view__title">{formatDate(currentDate)}</span>
          {isToday && <span className="day-view__today-tag">Today</span>}
        </div>
        <span className="day-view__count">{dayTasks.length} 个任务</span>
      </div>

      <div ref={scrollRef} className="day-view__scroll">
        <div className="day-view__grid">
          <div className="day-view__hours-col">
            {HOURS.map((h) => (
              <div key={h} className="day-view__hour-row">
                <span className="day-view__hour-label">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          <div
            className={
              'day-view__col' + (isToday ? ' day-view__col--today' : '')
            }
          >
            {HOURS.map((h) => (
              <div key={h} className="day-view__cell" />
            ))}
            {isToday && <CurrentTimeLine />}
            {dayTasks.map((task) => {
              const start = new Date(task.scheduledAt);
              const top =
                start.getHours() * HOUR_HEIGHT +
                (start.getMinutes() / 60) * HOUR_HEIGHT;
              const height = Math.max(
                36,
                (task.duration / 60) * HOUR_HEIGHT - 2,
              );
              return (
                <div
                  key={task.id}
                  className="day-view__task-slot"
                  style={{ top: `${top}px`, height: `${height}px` }}
                >
                  <TaskCard task={task} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentTimeLine() {
  const now = new Date();
  const top = now.getHours() * HOUR_HEIGHT + (now.getMinutes() / 60) * HOUR_HEIGHT;
  return (
    <div className="day-view__now" style={{ top: `${top}px` }}>
      <span className="day-view__now-dot" />
      <span className="day-view__now-line" />
      <span className="day-view__now-tag">现在</span>
    </div>
  );
}
