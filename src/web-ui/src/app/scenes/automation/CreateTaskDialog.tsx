import { useEffect, useState } from 'react';
import { CalendarClock, Repeat, Zap, X, type LucideIcon } from 'lucide-react';
import { useAutomation } from './automation-context';
import {
  type ScheduleType,
  type AutomationTask,
} from './automation-types';

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

export function CreateTaskDialog() {
  const { createDialogOpen, setCreateDialogOpen, agents, addTask } =
    useAutomation();

  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? '');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('once');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState('09:00');

  // Reset agent default when agents change.
  useEffect(() => {
    if (!agentId && agents.length > 0) {
      setAgentId(agents[0].id);
    }
  }, [agents, agentId]);

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
    setScheduleType('once');
  };

  const handleClose = () => {
    setCreateDialogOpen(false);
    reset();
  };

  const handleSubmit = () => {
    if (!name.trim() || !agentId) return;
    const [hour, minute] = time.split(':').map(Number);
    const scheduledAt = new Date(date);
    scheduledAt.setHours(hour, minute, 0, 0);

    const newTask: AutomationTask = {
      id: `t-${Date.now()}`,
      name: name.trim(),
      description: name.trim(),
      prompt: name.trim(),
      agentId,
      scheduleType,
      scheduledAt: scheduledAt.toISOString(),
      duration: 30,
      priority: 'P2',
      status: 'pending',
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    addTask(newTask);
    reset();
    setCreateDialogOpen(false);
  };

  if (!createDialogOpen) return null;

  // v1 only allows main agents.
  const mainAgents = agents.filter((a) => !a.isSubAgent);

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
            <label className="create-task-dialog__label">执行 Agent</label>
            <select
              className="create-task-dialog__select"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              {mainAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
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
            disabled={!name.trim()}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
