import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Repeat, Zap, X, type LucideIcon } from 'lucide-react';
import { useAutomation } from './automation-context';
import {
  AUTOMATION_PRIORITY_META,
  type AutomationPriority,
  type ScheduleType,
  type AutomationTask,
} from './automation-types';
import type {
  AutomationExecutionMode,
  AutomationWorkspaceOption,
} from './automationTargeting';
import { buildAutomationTaskDraftTarget as buildDraftTarget } from './automationTargeting';

interface ScheduleOption {
  value: ScheduleType;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const SCHEDULE_OPTIONS: ScheduleOption[] = [
  { value: 'once', label: '单次执行', hint: '未来某一天定时运行一次', icon: Zap },
  { value: 'hourly', label: '每小时', hint: '每个整点循环执行', icon: Repeat },
  { value: 'daily', label: '每天', hint: '每天定时执行', icon: CalendarClock },
];

interface CreateTaskDialogProps {
  workspaces: AutomationWorkspaceOption[];
  currentWorkspaceId?: string;
  onOpenWorkspace?: () => Promise<void>;
}

const EXECUTION_MODE_OPTIONS: Array<{ value: AutomationExecutionMode; label: string; hint: string }> = [
  { value: 'code', label: '编码会话', hint: '适合代码、仓库、终端类任务' },
  { value: 'cowork', label: '办公会话', hint: '适合写作、整理、日常协作任务' },
];

export function CreateTaskDialog(props: CreateTaskDialogProps) {
  const { workspaces, currentWorkspaceId, onOpenWorkspace } = props;
  const { createDialogOpen, setCreateDialogOpen, addTask } = useAutomation();
  const hasNoWorkspace = workspaces.length === 0;

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [workspaceId, setWorkspaceId] = useState<string>(currentWorkspaceId || workspaces[0]?.id || '');
  const [executionMode, setExecutionMode] = useState<AutomationExecutionMode>('code');
  const [priority, setPriority] = useState<AutomationPriority>('P2');
  const workspace = useMemo(
    () => workspaces.find(item => item.id === workspaceId) ?? workspaces[0] ?? null,
    [workspaceId, workspaces],
  );
  const [scheduleType, setScheduleType] = useState<ScheduleType>('once');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState('09:00');

  useEffect(() => {
    if (!workspaceId && workspaces.length > 0) {
      setWorkspaceId(currentWorkspaceId || workspaces[0].id);
      return;
    }
    if (workspaceId && !workspaces.some(item => item.id === workspaceId)) {
      setWorkspaceId(currentWorkspaceId || workspaces[0]?.id || '');
    }
  }, [currentWorkspaceId, workspaceId, workspaces]);

  // Close on Escape.
  useEffect(() => {
    if (!createDialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCreateDialogOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createDialogOpen, setCreateDialogOpen]);

  const reset = () => {
    setName('');
    setPrompt('');
    setScheduleType('once');
    setPriority('P2');
  };

  const handleClose = () => {
    setCreateDialogOpen(false);
    reset();
  };

  const handleSubmit = () => {
    if (!name.trim() || !prompt.trim() || !workspace || hasNoWorkspace) return;
    const [hour, minute] = time.split(':').map(Number);
    const scheduledAt = new Date(date);
    scheduledAt.setHours(hour, minute, 0, 0);
    const target = buildDraftTarget({
      workspace,
      executionMode,
      prompt,
      scheduleType,
      scheduledAt: scheduledAt.toISOString(),
    });

    const newTask: AutomationTask = {
      id: `t-${Date.now()}`,
      name: name.trim(),
      description: target.prompt,
      prompt: target.prompt,
      agentId: '',
      workspaceId: target.workspaceId,
      workspacePath: target.workspacePath,
      executionMode,
      scheduleType,
      scheduledAt: target.scheduledAt,
      duration: 30,
      priority,
      status: 'pending',
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    addTask(newTask);
    reset();
    setCreateDialogOpen(false);
  };

  if (!createDialogOpen) return null;

  return (
    <div
      className="create-task-dialog__overlay"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div
        className="create-task-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="create-task-dialog__head">
          <h3 className="create-task-dialog__title">创建自动化任务</h3>
          <button
            type="button"
            className="create-task-dialog__close"
            onClick={handleClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="create-task-dialog__body">
          <div className="create-task-dialog__field">
            <label
              htmlFor="task-name"
              className="create-task-dialog__label"
            >
              任务名称
            </label>
            <input
              id="task-name"
              className="create-task-dialog__input"
              placeholder="例如：每日竞品动态汇总"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="create-task-dialog__field">
            <label className="create-task-dialog__label">工作区</label>
            <select
              className="create-task-dialog__select"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              disabled={hasNoWorkspace}
            >
              {hasNoWorkspace ? (
                <option value="">
                  暂无可用工作区
                </option>
              ) : (
                workspaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              )}
            </select>
            {hasNoWorkspace && (
              <p className="create-task-dialog__hint">
                请先打开一个项目工作区，再创建自动化任务。
              </p>
            )}
            {hasNoWorkspace && onOpenWorkspace && (
              <button
                type="button"
                className="create-task-dialog__inline-action"
                onClick={() => void onOpenWorkspace()}
              >
                打开工作区
              </button>
            )}
          </div>

          <div className="create-task-dialog__field">
            <label className="create-task-dialog__label">执行模式</label>
            <div
              className="create-task-dialog__mode-slider"
              role="tablist"
              aria-label="自动化执行模式"
            >
              {EXECUTION_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    'create-task-dialog__mode-option' +
                    (executionMode === option.value ? ' create-task-dialog__mode-option--active' : '')
                  }
                  role="tab"
                  aria-selected={executionMode === option.value}
                  onClick={() => setExecutionMode(option.value)}
                  disabled={hasNoWorkspace}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <p className="create-task-dialog__hint">
              {EXECUTION_MODE_OPTIONS.find(option => option.value === executionMode)?.hint}
            </p>
          </div>

          <div className="create-task-dialog__field">
            <label
              htmlFor="task-prompt"
              className="create-task-dialog__label"
            >
              任务 Prompt
            </label>
            <textarea
              id="task-prompt"
              className="create-task-dialog__textarea"
              placeholder="例如：每天汇总当前工作区昨天的代码变更、风险点和下一步建议。"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              maxLength={4000}
            />
          </div>

          <div className="create-task-dialog__field">
            <label className="create-task-dialog__label">执行方式</label>
            <div className="create-task-dialog__schedule-grid">
              {SCHEDULE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = scheduleType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScheduleType(opt.value)}
                    className={
                      'create-task-dialog__schedule-card' +
                      (active
                        ? ' create-task-dialog__schedule-card--active'
                        : '')
                    }
                  >
                    <div className="create-task-dialog__schedule-head">
                      <Icon size={14} />
                      <span>{opt.label}</span>
                    </div>
                    <span className="create-task-dialog__schedule-hint">
                      {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="create-task-dialog__field">
            <label className="create-task-dialog__label">紧急程度</label>
            <div className="create-task-dialog__priority-grid">
              {(Object.keys(AUTOMATION_PRIORITY_META) as AutomationPriority[]).map((value) => {
                const meta = AUTOMATION_PRIORITY_META[value];
                const active = priority === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={
                      'create-task-dialog__priority-option' +
                      ` create-task-dialog__priority-option--${meta.modifier}` +
                      (active ? ' create-task-dialog__priority-option--active' : '')
                    }
                    onClick={() => setPriority(value)}
                  >
                    <span>{value}</span>
                    <small>{meta.label}</small>
                  </button>
                );
              })}
            </div>
          </div>

          {scheduleType !== 'hourly' && (
            <div className="create-task-dialog__row">
              <div className="create-task-dialog__field create-task-dialog__field--grow2">
                <label
                  htmlFor="task-date"
                  className="create-task-dialog__label"
                >
                  {scheduleType === 'once' ? '执行日期' : '起始日期'}
                </label>
                <input
                  id="task-date"
                  type="date"
                  className="create-task-dialog__input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="create-task-dialog__field">
                <label
                  htmlFor="task-time"
                  className="create-task-dialog__label"
                >
                  时间
                </label>
                <input
                  id="task-time"
                  type="time"
                  className="create-task-dialog__input"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {scheduleType === 'hourly' && (
            <div className="create-task-dialog__field">
              <label
                htmlFor="task-time"
                className="create-task-dialog__label"
              >
                每小时第几分钟
              </label>
              <input
                id="task-time"
                type="time"
                className="create-task-dialog__input"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="create-task-dialog__foot">
          <button
            type="button"
            className="create-task-dialog__btn create-task-dialog__btn--outline"
            onClick={handleClose}
          >
            取消
          </button>
          <button
            type="button"
            className="create-task-dialog__btn create-task-dialog__btn--primary"
            onClick={handleSubmit}
            disabled={!name.trim() || !prompt.trim() || hasNoWorkspace}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
