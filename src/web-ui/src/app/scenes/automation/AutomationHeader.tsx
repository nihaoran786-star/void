import { ChevronLeft, ChevronRight, Plus, Filter } from 'lucide-react';
import { useAutomation, type CalendarView } from './automation-context';
import {
  formatDate,
  formatMonth,
  formatWeekRange,
} from './automation-date-utils';
import {
  PRIORITY_META,
  STATUS_META,
  type Priority,
  type TaskStatus,
} from './automation-types';

const VIEW_OPTIONS: { key: CalendarView; label: string }[] = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'list', label: '列表' },
];

export function AutomationHeader() {
  const {
    view,
    setView,
    currentDate,
    goToday,
    goPrev,
    goNext,
    setCreateDialogOpen,
    agents,
    filterPriority,
    setFilterPriority,
    filterStatus,
    setFilterStatus,
    filterAgentId,
    setFilterAgentId,
  } = useAutomation();

  const title =
    view === 'month'
      ? formatMonth(currentDate)
      : view === 'week'
        ? formatWeekRange(currentDate)
        : view === 'day'
          ? formatDate(currentDate)
          : '全部任务';

  const hasFilter =
    filterPriority !== 'all' ||
    filterStatus !== 'all' ||
    filterAgentId !== 'all';

  return (
    <header className="automation-header">
      <div className="automation-header__left">
        <h1 className="automation-header__title">自动化</h1>
        <div className="automation-header__nav">
          <button
            type="button"
            className="automation-header__today-btn"
            onClick={goToday}
          >
            今天
          </button>
          <button
            type="button"
            className="automation-header__icon-btn"
            onClick={goPrev}
            aria-label="上一段"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="automation-header__icon-btn"
            onClick={goNext}
            aria-label="下一段"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <h2 className="automation-header__range">{title}</h2>
      </div>

      <div className="automation-header__right">
        <div className="automation-header__filters">
          <div className="automation-header__filter-icon">
            <Filter size={12} />
          </div>
          <select
            className="automation-header__select"
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as Priority | 'all')}
            aria-label="按优先级筛选"
          >
            <option value="all">全部优先级</option>
            {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {p} · {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
          <select
            className="automation-header__select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TaskStatus | 'all')}
            aria-label="按状态筛选"
          >
            <option value="all">全部状态</option>
            {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
          <select
            className="automation-header__select"
            value={filterAgentId}
            onChange={(e) => setFilterAgentId(e.target.value)}
            aria-label="按 Agent 筛选"
          >
            <option value="all">全部 Agent</option>
            {agents
              .filter((a) => !a.isSubAgent)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          {hasFilter && (
            <button
              type="button"
              className="automation-header__clear-btn"
              onClick={() => {
                setFilterPriority('all');
                setFilterStatus('all');
                setFilterAgentId('all');
              }}
            >
              清除
            </button>
          )}
        </div>

        <div className="automation-header__view-switcher">
          {VIEW_OPTIONS.map((opt) => {
            const active = view === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setView(opt.key)}
                className={
                  'automation-header__view-btn' +
                  (active ? ' automation-header__view-btn--active' : '')
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="automation-header__create-btn"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus size={14} />
          <span>创建任务</span>
        </button>
      </div>
    </header>
  );
}
