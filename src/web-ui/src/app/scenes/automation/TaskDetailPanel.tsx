import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
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

const DETAIL_TABS: DetailTab[] = ['prompt', 'artifacts', 'conversation'];
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function TaskDetailPanel() {
  const { t } = useI18n('scenes/automation');
  const { selectedTask, setSelectedTaskId, getAgent, deleteTask, toggleTaskEnabled, runTaskNow } = useAutomation();
  const open = !!selectedTask;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      returnFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      const frame = requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      const returnTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      const frame = requestAnimationFrame(() => {
        if (returnTarget?.isConnected) {
          returnTarget.focus();
        }
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [open]);

  const closePanel = useCallback(() => {
    setSelectedTaskId(null);
  }, [setSelectedTaskId]);

  const handlePanelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
        return;
      }

      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closePanel],
  );

  if (!open || !selectedTask) return null;

  return (
    <div
      className="task-detail-panel__overlay"
      onClick={closePanel}
    >
      <div
        ref={panelRef}
        className="task-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handlePanelKeyDown}
      >
        <TaskDetailContent
          key={selectedTask.id}
          task={selectedTask}
          titleId={titleId}
          descriptionId={descriptionId}
          closeButtonRef={closeButtonRef}
          agentName={
            getAgent(selectedTask.agentId)?.name ??
            selectedTask.agentName ??
            t('common.unknown')
          }
          onClose={closePanel}
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
  titleId: string;
  descriptionId: string;
  closeButtonRef: RefObject<HTMLButtonElement>;
  agentName: string;
  onClose: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRunNow: () => void;
}

function TaskDetailContent(props: TaskDetailContentProps) {
  const { t } = useI18n('scenes/automation');
  const {
    task,
    titleId,
    descriptionId,
    closeButtonRef,
    agentName,
    onClose,
    onDelete,
    onToggleEnabled,
    onRunNow,
  } = props;
  const [tab, setTab] = useState<DetailTab>('prompt');
  const tabRefs = useRef<Record<DetailTab, HTMLButtonElement | null>>({
    prompt: null,
    artifacts: null,
    conversation: null,
  });
  const tabListId = useId();

  const selectTab = useCallback((nextTab: DetailTab, focus = false) => {
    setTab(nextTab);
    if (focus) {
      tabRefs.current[nextTab]?.focus();
    }
  }, []);

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentTab: DetailTab) => {
      const currentIndex = DETAIL_TABS.indexOf(currentTab);
      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % DETAIL_TABS.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex =
          (currentIndex - 1 + DETAIL_TABS.length) % DETAIL_TABS.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = DETAIL_TABS.length - 1;
      }

      if (nextIndex === null) return;
      event.preventDefault();
      selectTab(DETAIL_TABS[nextIndex], true);
    },
    [selectTab],
  );

  const priority = PRIORITY_META[task.priority];
  const status = STATUS_META[task.status];
  const statusLabel = task.runStatus === 'queued' ? t('status.queued') : t(status.labelKey);
  const StatusIcon = STATUS_ICON[task.status];
  const scheduledDate = new Date(task.scheduledAt);

  return (
    <div className="task-detail-panel__inner">
      <div className="task-detail-panel__head">
        <button
          ref={closeButtonRef}
          type="button"
          className="task-detail-panel__close"
          onClick={onClose}
          aria-label={t('actions.close')}
        >
          <X size={16} aria-hidden="true" />
        </button>

        <div className="task-detail-panel__title-row">
          <span
            className={
              'task-detail-panel__priority-dot task-detail-panel__priority-dot--' +
              priority.modifier
            }
            aria-hidden="true"
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
                role="status"
              >
                <StatusIcon
                  size={12}
                  className={
                    task.status === 'running'
                      ? 'task-detail-panel__badge-icon--spin'
                      : ''
                  }
                  aria-hidden="true"
                />
                {statusLabel}
              </span>
              {task.scheduleType !== 'once' && (
                <span className="task-detail-panel__badge task-detail-panel__badge--schedule">
                  <Repeat size={10} aria-hidden="true" />
                  {t(SCHEDULE_META[task.scheduleType].labelKey)}
                </span>
              )}
            </div>
            <h2 id={titleId} className="task-detail-panel__title">
              {task.name}
            </h2>
            <p id={descriptionId} className="task-detail-panel__desc">
              {task.description}
            </p>
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

      <div
        id={tabListId}
        className="task-detail-panel__tabs"
        role="tablist"
        aria-labelledby={titleId}
      >
        {DETAIL_TABS.map((detailTab) => {
          const active = tab === detailTab;
          const tabId = `${tabListId}-${detailTab}-tab`;
          const panelId = `${tabListId}-${detailTab}-panel`;
          return (
            <button
              key={detailTab}
              ref={(element) => {
                tabRefs.current[detailTab] = element;
              }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              className={
                'task-detail-panel__tab' +
                (active ? ' task-detail-panel__tab--active' : '')
              }
              onClick={() => selectTab(detailTab)}
              onKeyDown={(event) => handleTabKeyDown(event, detailTab)}
            >
              {t(`detail.tabs.${detailTab}`)}
              {detailTab === 'artifacts' &&
                task.artifacts &&
                task.artifacts.length > 0 && (
                  <span className="task-detail-panel__tab-count">
                    {task.artifacts.length}
                  </span>
                )}
            </button>
          );
        })}
      </div>

      <div
        id={`${tabListId}-${tab}-panel`}
        className="task-detail-panel__body"
        role="tabpanel"
        aria-labelledby={`${tabListId}-${tab}-tab`}
        tabIndex={0}
      >
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
