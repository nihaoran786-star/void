import { useAutomation } from './automation-context';
import {
  WEEKDAY_LABELS,
  getMonthGrid,
  isSameDay,
  isSameMonth,
  tasksOnDay,
} from './automation-date-utils';
import { TaskCard } from './TaskCard';

export function MonthView() {
  const { currentDate, filteredTasks } = useAutomation();
  const grid = getMonthGrid(currentDate);
  const today = new Date();

  return (
    <div className="month-view">
      <div className="month-view__weekday-row">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="month-view__weekday">
            星期{d}
          </div>
        ))}
      </div>

      <div className="month-view__grid">
        {grid.map((day, i) => {
          const inMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, today);
          const dayTasks = tasksOnDay(filteredTasks, day);
          return (
            <div
              key={i}
              className={
                'month-view__cell' +
                (!inMonth ? ' month-view__cell--out' : '') +
                (isToday ? ' month-view__cell--today' : '')
              }
            >
              <div className="month-view__cell-head">
                <span
                  className={
                    'month-view__day-num' +
                    (!inMonth ? ' month-view__day-num--out' : '') +
                    (isToday ? ' month-view__day-num--today' : '')
                  }
                >
                  {day.getDate()}
                </span>
                {dayTasks.length > 0 && (
                  <span className="month-view__count">{dayTasks.length}</span>
                )}
              </div>
              <div className="month-view__tasks">
                {dayTasks.slice(0, 3).map((t) => (
                  <TaskCard key={t.id} task={t} variant="month" />
                ))}
                {dayTasks.length > 3 && (
                  <span className="month-view__more">
                    +{dayTasks.length - 3} 更多
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
