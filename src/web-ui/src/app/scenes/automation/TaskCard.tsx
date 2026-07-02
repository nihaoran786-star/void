import {
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
  Repeat,
} from 'lucide-react';
import { useI18n } from '@/infrastructure/i18n';
import { useAutomation } from './automation-context';
import {
  PRIORITY_META,
  STATUS_META,
  SCHEDULE_META,
  type AutomationTask,
} from './automation-types';
import { formatTime } from './automation-date-utils';

const STATUS_ICON = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
} as const;

export type TaskCardVariant = 'default' | 'compact' | 'month';

export interface TaskCardProps {
  task: AutomationTask;
  variant?: TaskCardVariant;
  onClick?: () => void;
}

function cls(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function TaskCard(props: TaskCardProps) {
  const { t } = useI18n('scenes/automation');
  const { task, variant = 'default', onClick } = props;
  const { setSelectedTaskId, getAgent } = useAutomation();

  const priority = PRIORITY_META[task.priority];
  const status = STATUS_META[task.status];
  const Icon = STATUS_ICON[task.status];
  const agent = getAgent(task.agentId);
  const agentName = agent?.name ?? task.agentName ?? t('common.unknown');
  const isRecurring = task.scheduleType !== 'once';
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';

  const handleClick = () => {
    if (onClick) onClick();
    else setSelectedTaskId(task.id);
  };

  if (variant === 'month') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cls(
          'task-card',
          'task-card--month',
          `task-card--${priority.modifier}`,
          isCompleted && 'task-card--is-completed',
        )}
      >
        <span className="task-card__dot" />
        <span className="task-card__month-text">
          {formatTime(task.scheduledAt)} {task.name}
        </span>
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cls(
          'task-card',
          'task-card--compact',
          `task-card--${priority.modifier}`,
          isCompleted && 'task-card--is-completed',
        )}
      >
        <span className="task-card__bar" />
        <div className="task-card__body">
          <div className="task-card__title-row">
            <Icon
              size={12}
              className={cls(
                'task-card__status-icon',
                `task-card__status-icon--${status.modifier}`,
                task.status === 'running' && 'task-card__status-icon--spin',
              )}
            />
            <span className="task-card__title">{task.name}</span>
          </div>
          <div className="task-card__meta">
            <span className="task-card__time">{formatTime(task.scheduledAt)}</span>
            <span className="task-card__sep">·</span>
            <span className="task-card__agent">{agentName}</span>
          </div>
        </div>
      </button>
    );
  }

  // default — calendar grid block
  return (
    <button
      type="button"
      onClick={handleClick}
      className={cls(
        'task-card',
        'task-card--default',
        `task-card--${priority.modifier}`,
        isCompleted && 'task-card--is-completed',
        isFailed && 'task-card--is-failed',
      )}
    >
      <span className="task-card__bar" />
      <div className="task-card__head">
        <div className="task-card__title-row">
          <Icon
            size={12}
            className={cls(
              'task-card__status-icon',
              `task-card__status-icon--${status.modifier}`,
              task.status === 'running' && 'task-card__status-icon--spin',
            )}
          />
          <span className="task-card__title">{task.name}</span>
        </div>
        {isRecurring && (
          <Repeat size={10} className="task-card__recurring-icon" />
        )}
      </div>
      <div className="task-card__meta">
        <span className="task-card__time">{formatTime(task.scheduledAt)}</span>
        <span className="task-card__sep">·</span>
        <span className="task-card__agent">{agentName}</span>
      </div>
      {isRecurring && (
        <div className="task-card__schedule">
          {t(SCHEDULE_META[task.scheduleType].labelKey)}
        </div>
      )}
    </button>
  );
}
