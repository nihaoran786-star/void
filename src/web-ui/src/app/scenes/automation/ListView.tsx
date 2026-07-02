import {
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
  Repeat,
  Bot,
  Timer,
} from 'lucide-react';
import { useI18n } from '@/infrastructure/i18n';
import { useAutomation } from './automation-context';
import {
  PRIORITY_META,
  STATUS_META,
  SCHEDULE_META,
  type AutomationTask,
} from './automation-types';
import { formatMonthDay, formatTime, isSameDay } from './automation-date-utils';

const STATUS_ICON = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
} as const;

export function ListView() {
  const { t, currentLanguage } = useI18n('scenes/automation');
  const { filteredTasks, setSelectedTaskId, getAgent } = useAutomation();

  const groups = new Map<string, AutomationTask[]>();
  const sorted = [...filteredTasks].sort(
    (a, b) =>
      new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  );
  sorted.forEach((t) => {
    const d = new Date(t.scheduledAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  });

  const today = new Date();

  if (filteredTasks.length === 0) {
    return (
      <div className="list-view list-view--empty">
        <Timer size={40} className="list-view__empty-icon" />
        <p className="list-view__empty-text">{t('list.empty')}</p>
      </div>
    );
  }

  return (
    <div className="list-view">
      <div className="list-view__inner">
        {Array.from(groups.entries()).map(([key, items]) => {
          const d = new Date(items[0].scheduledAt);
          const isToday = isSameDay(d, today);
          return (
            <div key={key} className="list-view__group">
              <div className="list-view__group-head">
                <span className="list-view__group-date">
                  {formatMonthDay(d, currentLanguage)}
                </span>
                <span className="list-view__group-weekday">
                  {new Intl.DateTimeFormat(currentLanguage, { weekday: 'long' }).format(d)}
                </span>
                {isToday && <span className="list-view__today-tag">Today</span>}
                <span className="list-view__group-count">
                  {t('counts.tasks', { count: items.length })}
                </span>
              </div>

              <div className="list-view__items">
                {items.map((task) => {
                  const Icon = STATUS_ICON[task.status];
                  const priority = PRIORITY_META[task.priority];
                  const status = STATUS_META[task.status];
                  const agent = getAgent(task.agentId);
                  const agentName = agent?.name ?? task.agentName ?? t('common.unknown');
                  const isCompleted = task.status === 'completed';
                  return (
                    <button
                      type="button"
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={
                        'list-view__row' +
                        (isCompleted ? ' list-view__row--completed' : '')
                      }
                    >
                      <span
                        className={
                          'list-view__bar list-view__bar--' + priority.modifier
                        }
                      />
                      <div className="list-view__time-col">
                        <span className="list-view__time">
                          {formatTime(task.scheduledAt)}
                        </span>
                        <span className="list-view__duration">
                          {t('duration.minutes', { count: task.duration })}
                        </span>
                      </div>
                      <div className="list-view__main">
                        <div className="list-view__title-row">
                          <span className="list-view__title">{task.name}</span>
                          {task.scheduleType !== 'once' && (
                            <span className="list-view__schedule-tag">
                              <Repeat size={10} />
                              {t(SCHEDULE_META[task.scheduleType].labelKey)}
                            </span>
                          )}
                        </div>
                        <div className="list-view__sub">
                          <span className="list-view__agent">
                            <Bot size={12} />
                            {agentName}
                          </span>
                          <span className="list-view__sep">·</span>
                          <span className="list-view__desc">
                            {task.description}
                          </span>
                        </div>
                      </div>
                      <div className="list-view__tail">
                        <span
                          className={
                            'list-view__priority list-view__priority--' +
                            priority.modifier
                          }
                        >
                          {task.priority}
                        </span>
                        <span
                          className={
                            'list-view__status list-view__status--' +
                            status.modifier
                          }
                        >
                          <Icon
                            size={14}
                            className={
                              task.status === 'running'
                                ? 'list-view__status-icon--spin'
                                : ''
                            }
                          />
                          {t(status.labelKey)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
