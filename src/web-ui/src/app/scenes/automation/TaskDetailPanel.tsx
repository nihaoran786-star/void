import { useEffect, useState } from 'react';
import {
  Bot,
  Calendar,
  Clock,
  FileText,
  Image as ImageIcon,
  Code as CodeIcon,
  Database,
  Repeat,
  CheckCircle2,
  XCircle,
  Loader2,
  User,
  Wrench,
  Sparkles,
  X,
  Trash2,
  Power,
  Play,
  type LucideIcon,
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

const ARTIFACT_ICON = {
  document: FileText,
  image: ImageIcon,
  code: CodeIcon,
  data: Database,
} as const;

const STATUS_ICON = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
} as const;

const ROLE_META = {
  user: { labelKey: 'detail.roles.user', icon: User, modifier: 'user' },
  assistant: { labelKey: 'detail.roles.assistant', icon: Sparkles, modifier: 'assistant' },
  tool: { labelKey: 'detail.roles.tool', icon: Wrench, modifier: 'tool' },
} as const;

type DetailTab = 'prompt' | 'artifacts' | 'conversation';

export function TaskDetailPanel() {
  const { t } = useI18n('scenes/automation');
  const { selectedTask, setSelectedTaskId, getAgent, deleteTask, toggleTaskEnabled, runTaskNow } = useAutomation();
  const open = !!selectedTask;

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedTaskId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setSelectedTaskId]);

  if (!open || !selectedTask) return null;

  return (
    <div
      className="task-detail-panel__overlay"
      role="dialog"
      aria-modal="true"
      onClick={() => setSelectedTaskId(null)}
    >
      <div
        className="task-detail-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <TaskDetailContent
          task={selectedTask}
          agentName={
            getAgent(selectedTask.agentId)?.name ??
            selectedTask.agentName ??
            t('common.unknown')
          }
          onClose={() => setSelectedTaskId(null)}
          onDelete={() => deleteTask(selectedTask)}
          onToggleEnabled={(enabled) => toggleTaskEnabled(selectedTask, enabled)}
          onRunNow={() => runTaskNow(selectedTask)}
        />
      </div>
    </div>
  );
}

interface TaskDetailContentProps {
  task: AutomationTask;
  agentName: string;
  onClose: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRunNow: () => void;
}

function TaskDetailContent(props: TaskDetailContentProps) {
  const { t } = useI18n('scenes/automation');
  const { task, agentName, onClose, onDelete, onToggleEnabled, onRunNow } = props;
  const [tab, setTab] = useState<DetailTab>('prompt');

  const priority = PRIORITY_META[task.priority];
  const status = STATUS_META[task.status];
  const statusLabel = task.runStatus === 'queued' ? t('status.queued') : t(status.labelKey);
  const StatusIcon = STATUS_ICON[task.status];
  const scheduledDate = new Date(task.scheduledAt);

  return (
    <div className="task-detail-panel__inner">
      <div className="task-detail-panel__head">
        <button
          type="button"
          className="task-detail-panel__close"
          onClick={onClose}
          aria-label={t('actions.close')}
        >
          <X size={16} />
        </button>

        <div className="task-detail-panel__title-row">
          <span
            className={
              'task-detail-panel__priority-dot task-detail-panel__priority-dot--' +
              priority.modifier
            }
          />
          <div className="task-detail-panel__title-col">
            <div className="task-detail-panel__badges">
              <span
                className={
                  'task-detail-panel__badge task-detail-panel__badge--priority task-detail-panel__badge--' +
                  priority.modifier
                }
              >
                {task.priority} · {t(priority.labelKey)}
              </span>
              <span
                className={
                  'task-detail-panel__badge task-detail-panel__badge--status task-detail-panel__badge--' +
                  status.modifier
                }
              >
                <StatusIcon
                  size={12}
                  className={
                    task.status === 'running'
                      ? 'task-detail-panel__badge-icon--spin'
                      : ''
                  }
                />
                {statusLabel}
              </span>
              {task.scheduleType !== 'once' && (
                <span className="task-detail-panel__badge task-detail-panel__badge--schedule">
                  <Repeat size={10} />
                  {t(SCHEDULE_META[task.scheduleType].labelKey)}
                </span>
              )}
            </div>
            <h2 className="task-detail-panel__title">{task.name}</h2>
            <p className="task-detail-panel__desc">{task.description}</p>
          </div>
        </div>

        <div className="task-detail-panel__meta-grid">
          <DetailRow icon={Bot} label={t('detail.agent')} value={agentName} />
          <DetailRow
            icon={Calendar}
            label={t('detail.scheduledTime')}
            value={`${scheduledDate.getMonth() + 1}/${scheduledDate.getDate()} ${formatTime(task.scheduledAt)}`}
          />
          <DetailRow
            icon={Clock}
            label={t('detail.duration')}
            value={t('duration.minutes', { count: task.duration })}
          />
          {task.completedAt && (
            <DetailRow
              icon={CheckCircle2}
              label={t('detail.completedTime')}
              value={formatTime(task.completedAt)}
            />
          )}
        </div>

        <div className="task-detail-panel__actions">
          <button
            type="button"
            className="task-detail-panel__btn task-detail-panel__btn--primary"
            onClick={onRunNow}
          >
            <Play size={14} />
            {t('detail.runNow')}
          </button>
          <button
            type="button"
            className="task-detail-panel__btn task-detail-panel__btn--outline"
            onClick={() => onToggleEnabled(!task.enabled)}
          >
            <Power size={14} />
            {task.enabled ? t('detail.disable') : t('detail.enable')}
          </button>
          <button
            type="button"
            className="task-detail-panel__btn task-detail-panel__btn--ghost"
            onClick={onDelete}
          >
            <Trash2 size={14} />
            {t('detail.delete')}
          </button>
        </div>
      </div>

      <div className="task-detail-panel__tabs">
        <button
          type="button"
          className={
            'task-detail-panel__tab' +
            (tab === 'prompt' ? ' task-detail-panel__tab--active' : '')
          }
          onClick={() => setTab('prompt')}
        >
          {t('detail.tabs.prompt')}
        </button>
        <button
          type="button"
          className={
            'task-detail-panel__tab' +
            (tab === 'artifacts' ? ' task-detail-panel__tab--active' : '')
          }
          onClick={() => setTab('artifacts')}
        >
          {t('detail.tabs.artifacts')}
          {task.artifacts && task.artifacts.length > 0 && (
            <span className="task-detail-panel__tab-count">
              {task.artifacts.length}
            </span>
          )}
        </button>
        <button
          type="button"
          className={
            'task-detail-panel__tab' +
            (tab === 'conversation' ? ' task-detail-panel__tab--active' : '')
          }
          onClick={() => setTab('conversation')}
        >
          {t('detail.tabs.conversation')}
        </button>
      </div>

      <div className="task-detail-panel__body">
        {tab === 'prompt' && (
          <div className="task-detail-panel__prompt">
            <p>{task.prompt}</p>
          </div>
        )}

        {tab === 'artifacts' && (
          <>
            {!task.artifacts?.length ? (
              <EmptyState
                icon={FileText}
                text={
                  task.status === 'completed'
                    ? t('detail.empty.noArtifacts')
                    : t('detail.empty.artifactsPending')
                }
              />
            ) : (
              <div className="task-detail-panel__artifact-list">
                {task.artifacts.map((art) => {
                  const Icon = ARTIFACT_ICON[art.type];
                  return (
                    <div key={art.id} className="task-detail-panel__artifact">
                      <div className="task-detail-panel__artifact-icon">
                        <Icon size={16} />
                      </div>
                      <div className="task-detail-panel__artifact-info">
                        <div className="task-detail-panel__artifact-name">
                          {art.name}
                        </div>
                        <div className="task-detail-panel__artifact-size">
                          {art.size}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'conversation' && (
          <>
            {!task.conversation?.length ? (
              <EmptyState
                icon={Sparkles}
                text={t('detail.empty.conversation')}
              />
            ) : (
              <div className="task-detail-panel__conv">
                {task.conversation.map((m) => {
                  const meta = ROLE_META[m.role];
                  const RoleIcon = meta.icon;
                  return (
                    <div key={m.id} className="task-detail-panel__msg">
                      <div
                        className={
                          'task-detail-panel__msg-avatar task-detail-panel__msg-avatar--' +
                          meta.modifier
                        }
                      >
                        <RoleIcon size={14} />
                      </div>
                      <div className="task-detail-panel__msg-body">
                        <div className="task-detail-panel__msg-head">
                          <span
                            className={
                              'task-detail-panel__msg-role task-detail-panel__msg-role--' +
                              meta.modifier
                            }
                          >
                            {t(meta.labelKey)}
                          </span>
                          <span className="task-detail-panel__msg-time">
                            {formatTime(m.timestamp)}
                          </span>
                        </div>
                        <div
                          className={
                            'task-detail-panel__msg-bubble task-detail-panel__msg-bubble--' +
                            meta.modifier
                          }
                        >
                          {m.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow(props: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  const { icon: Icon, label, value } = props;
  return (
    <div className="task-detail-panel__detail-row">
      <Icon size={14} />
      <div className="task-detail-panel__detail-text">
        <span className="task-detail-panel__detail-label">{label}</span>
        <span className="task-detail-panel__detail-value">{value}</span>
      </div>
    </div>
  );
}

function EmptyState(props: {
  icon: LucideIcon;
  text: string;
}) {
  const { icon: Icon, text } = props;
  return (
    <div className="task-detail-panel__empty">
      <Icon size={32} />
      <p>{text}</p>
    </div>
  );
}
