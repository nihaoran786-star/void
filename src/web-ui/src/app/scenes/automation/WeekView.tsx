import { useEffect, useRef } from 'react';
import { useI18n } from '@/infrastructure/i18n';
import { useAutomation } from './automation-context';
import {
  HOURS,
  getWeekdayLabels,
  getWeekDays,
  isSameDay,
  tasksOnDay,
} from './automation-date-utils';
import { layoutTimedTasks } from './automationCalendarLayout';
import { TaskCard } from './TaskCard';

const HOUR_HEIGHT = 56;

export function WeekView() {
  const { t, currentLanguage } = useI18n('scenes/automation');
  const { currentDate, filteredTasks } = useAutomation();
  const days = getWeekDays(currentDate);
  const today = new Date();
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekdayLabels = getWeekdayLabels(currentLanguage);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 60;
    }
  }, []);

  return (
    <div className="week-view">
      <div className="week-view__day-headers">
        <div className="week-view__day-headers-spacer" />
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          const dayTasks = tasksOnDay(filteredTasks, d);
          return (
            <div
              key={i}
              className={
                'week-view__day-header' +
                (isToday ? ' week-view__day-header--today' : '')
              }
            >
              <div className="week-view__weekday">
                {weekdayLabels[i]}
              </div>
              <div className="week-view__date">
                <span
                  className={
                    'week-view__date-num' +
                    (isToday ? ' week-view__date-num--today' : '')
                  }
                >
                  {d.getDate()}
                </span>
              </div>
              <div
                className="week-view__day-count"
                data-count={dayTasks.length}
              >
                {t('counts.tasks', { count: dayTasks.length })}
              </div>
            </div>
          );
        })}
      </div>

      <div ref={scrollRef} className="week-view__scroll">
        <div className="week-view__grid">
          <div className="week-view__hours-col">
            {HOURS.map((h) => (
              <div key={h} className="week-view__hour-row">
                <span className="week-view__hour-label">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {days.map((d, di) => {
            const dayTasks = tasksOnDay(filteredTasks, d);
            const isToday = isSameDay(d, today);
            return (
              <div
                key={di}
                className={
                  'week-view__day-col' +
                  (isToday ? ' week-view__day-col--today' : '')
                }
              >
                {HOURS.map((h) => (
                  <div key={h} className="week-view__cell" />
                ))}
                {isToday && <CurrentTimeLine />}
                {layoutTimedTasks(dayTasks, { hourHeight: HOUR_HEIGHT, minHeight: 28 }).map((slot) => {
                  return (
                    <div
                      key={slot.taskId}
                      className="week-view__task-slot"
                      style={{
                        top: `${slot.top}px`,
                        height: `${slot.height}px`,
                        left: `calc(4px + ${slot.leftPercent}%)`,
                        width: `calc(${slot.widthPercent}% - 8px)`,
                      }}
                    >
                      <TaskCard task={slot.task} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CurrentTimeLine() {
  const now = new Date();
  const top = now.getHours() * HOUR_HEIGHT + (now.getMinutes() / 60) * HOUR_HEIGHT;
  return (
    <div className="week-view__now" style={{ top: `${top}px` }}>
      <span className="week-view__now-dot" />
      <span className="week-view__now-line" />
    </div>
  );
}
