import { useEffect, useState } from 'react';
import {
  Bot,
  Calendar,
  Clock,
  Download,
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
  type LucideIcon,
} from 'lucide-react';
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
  user: { label: '你', icon: User, modifier: 'user' },
  assistant: { label: 'Agent', icon: Sparkles, modifier: 'assistant' },
  tool: { label: '工具', icon: Wrench, modifier: 'tool' },
} as const;

type DetailTab = 'prompt' | 'artifacts' | 'conversation';

export function TaskDetailPanel() {
  const { selectedTask, setSelectedTaskId, getAgent, deleteTask, toggleTaskEnabled } = useAutomation();
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
            '未知'
          }
          onClose={() => setSelectedTaskId(null)}
          onDelete={() => deleteTask(selectedTask)}
          onToggleEnabled={(enabled) => toggleTaskEnabled(selectedTask, enabled)}
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
}

function TaskDetailContent(props: TaskDetailContentProps) {
  const { task, agentName, onClose, onDelete, onToggleEnabled } = props;
  const [tab, setTab] = useState<DetailTab>('prompt');

  const priority = PRIORITY_META[task.priority];
  const status = STATUS_META[task.status];
  const StatusIcon = STATUS_ICON[task.status];
  const scheduledDate = new Date(task.scheduledAt);

  return (
    <div className="task-detail-panel__inner">
      <div className="task-detail-panel__head">
        <button
          type="button"
          className="task-detail-panel__close"
          onClick={onClose}
          aria-label="关闭"
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
                {task.priority} · {priority.label}
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
                {status.label}
              </span>
              {task.scheduleType !== 'once' && (
                <span className="task-detail-panel__badge task-detail-panel__badge--schedule">
                  <Repeat size={10} />
                  {SCHEDULE_META[task.scheduleType].label}
                </span>
              )}
            </div>
            <h2 className="task-detail-panel__title">{task.name}</h2>
            <p className="task-detail-panel__desc">{task.description}</p>
          </div>
        </div>

        <div className="task-detail-panel__meta-grid">
          <DetailRow icon={Bot} label="执行 Agent" value={agentName} />
          <DetailRow
            icon={Calendar}
            label="计划时间"
            value={`${scheduledDate.getMonth() + 1}/${scheduledDate.getDate()} ${formatTime(task.scheduledAt)}`}
          />
          <DetailRow
            icon={Clock}
            label="预计耗时"
            value={`${task.duration} 分钟`}
          />
          {task.completedAt && (
            <DetailRow
              icon={CheckCircle2}
              label="完成时间"
              value={formatTime(task.completedAt)}
            />
          )}
        </div>

        <div className="task-detail-panel__actions">
          <button
            type="button"
            className="task-detail-panel__btn task-detail-panel__btn--outline"
            onClick={() => onToggleEnabled(!task.enabled)}
          >
            <Power size={14} />
            {task.enabled ? '停用' : '启用'}
          </button>
          <button
            type="button"
            className="task-detail-panel__btn task-detail-panel__btn--ghost"
            onClick={onDelete}
          >
            <Trash2 size={14} />
            删除
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
          提示词
        </button>
        <button
          type="button"
          className={
            'task-detail-panel__tab' +
            (tab === 'artifacts' ? ' task-detail-panel__tab--active' : '')
          }
          onClick={() => setTab('artifacts')}
        >
          产物
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
          会话记录
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
                    ? '无产物'
                    : '任务完成后产物将显示在这里'
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
                      <button
                        type="button"
                        className="task-detail-panel__artifact-download"
                        aria-label="下载产物"
                      >
                        <Download size={14} />
                      </button>
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
                text="任务尚未执行，暂无会话记录"
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
                            {meta.label}
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
                {task.status === 'completed' && (
                  <button
                    type="button"
                    className="task-detail-panel__btn task-detail-panel__btn--outline task-detail-panel__continue"
                  >
                    <Sparkles size={14} />
                    继续与 Agent 对话
                  </button>
                )}
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
