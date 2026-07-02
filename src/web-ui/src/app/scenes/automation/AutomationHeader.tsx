import { ChevronLeft, ChevronRight, Plus, Filter } from 'lucide-react';
import { useI18n } from '@/infrastructure/i18n';
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

const VIEW_OPTIONS: { key: CalendarView; labelKey: string }[] = [
  { key: 'day', labelKey: 'header.views.day' },
  { key: 'week', labelKey: 'header.views.week' },
  { key: 'month', labelKey: 'header.views.month' },
  { key: 'list', labelKey: 'header.views.list' },
];

export function AutomationHeader() {
  const { t, currentLanguage } = useI18n('scenes/automation');
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
      ? formatMonth(currentDate, currentLanguage)
      : view === 'week'
        ? formatWeekRange(currentDate, currentLanguage)
        : view === 'day'
          ? formatDate(currentDate, currentLanguage)
          : t('header.allTasks');

  const hasFilter =
    filterPriority !== 'all' ||
    filterStatus !== 'all' ||
    filterAgentId !== 'all';

  return (
    <header className="automation-header">
      <div className="automation-header__left">
        <h1 className="automation-header__title">{t('header.title')}</h1>
        <div className="automation-header__nav">
          <button
            type="button"
            className="automation-header__today-btn"
            onClick={goToday}
          >
            {t('header.today')}
          </button>
          <button
            type="button"
            className="automation-header__icon-btn"
            onClick={goPrev}
            aria-label={t('header.previous')}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="automation-header__icon-btn"
            onClick={goNext}
            aria-label={t('header.next')}
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
            aria-label={t('header.filters.priority')}
          >
            <option value="all">{t('header.filters.allPriorities')}</option>
            {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {p} · {t(PRIORITY_META[p].labelKey)}
              </option>
            ))}
          </select>
          <select
            className="automation-header__select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TaskStatus | 'all')}
            aria-label={t('header.filters.status')}
          >
            <option value="all">{t('header.filters.allStatuses')}</option>
            {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {t(STATUS_META[s].labelKey)}
              </option>
            ))}
          </select>
          <select
            className="automation-header__select"
            value={filterAgentId}
            onChange={(e) => setFilterAgentId(e.target.value)}
            aria-label={t('header.filters.agent')}
          >
            <option value="all">{t('header.filters.allAgents')}</option>
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
              {t('header.filters.clear')}
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
                {t(opt.labelKey)}
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
          <span>{t('header.createTask')}</span>
        </button>
      </div>
    </header>
  );
}
