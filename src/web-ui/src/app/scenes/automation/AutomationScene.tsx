import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, Trash2 } from 'lucide-react';
import {
  Button,
  IconButton,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
  confirmDanger,
} from '@/component-library';
import {
  cronAPI,
  type CreateCronJobRequest,
  type CronJob,
  type CronSchedule,
  type UpdateCronJobRequest,
} from '@/infrastructure/api';
import { useI18n } from '@/infrastructure/i18n/hooks/useI18n';
import { i18nService } from '@/infrastructure/i18n';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { FlowChatState, Session } from '@/flow_chat/types/flow-chat';
import { compareSessionsForDisplay } from '@/flow_chat/utils/sessionOrdering';
import { resolveSessionTitle } from '@/flow_chat/utils/sessionTitle';
import { notificationService } from '@/shared/notification-system/services/NotificationService';
import { createLogger } from '@/shared/utils/logger';
import {
  buildCronScheduleFromAutomationDraft,
  filterMainSessionsForAutomation,
  getAutomationJobNextRunAtMs,
  groupAutomationJobsByNextRun,
  type AutomationScheduleDraft,
  type AutomationScheduleGroupKey,
} from './automationSchedule';
import './AutomationScene.scss';

const log = createLogger('AutomationScene');
const MINUTE_IN_MS = 60_000;

type SchedulePreset = AutomationScheduleDraft['kind'];

interface AutomationDraft {
  name: string;
  text: string;
  enabled: boolean;
  sessionId: string;
  schedulePreset: SchedulePreset;
  at: string;
  everyMinutes: string;
  dailyTime: string;
  anchorMs: string;
  expr: string;
  timezone: string;
}

function toLocalDateTimeInput(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const timezoneOffset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - timezoneOffset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function timestampMsToLocalDateTimeInput(timestampMs: number): string {
  return toLocalDateTimeInput(new Date(timestampMs).toISOString());
}

function getCurrentLocalDateTimeInput(): string {
  return toLocalDateTimeInput(new Date().toISOString());
}

function formatEveryMinutes(everyMs: number): string {
  const everyMinutes = everyMs / MINUTE_IN_MS;
  if (Number.isInteger(everyMinutes)) return String(everyMinutes);
  return everyMinutes.toFixed(2).replace(/\.?0+$/, '');
}

function createEmptyDraft(sessionId = ''): AutomationDraft {
  return {
    name: '',
    text: '',
    enabled: true,
    sessionId,
    schedulePreset: 'daily',
    at: getCurrentLocalDateTimeInput(),
    everyMinutes: '60',
    dailyTime: '08:00',
    anchorMs: '',
    expr: '0 8 * * *',
    timezone: '',
  };
}

function cronExprToDailyTime(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5 || parts[2] !== '*' || parts[3] !== '*' || parts[4] !== '*') return null;
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  if (!Number.isInteger(minute) || !Number.isInteger(hour) || minute < 0 || minute > 59 || hour < 0 || hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function jobToDraft(job: CronJob): AutomationDraft {
  const draft = createEmptyDraft(job.sessionId);
  draft.name = job.name;
  draft.text = job.payload.text;
  draft.enabled = job.enabled;

  if (job.schedule.kind === 'at') {
    draft.schedulePreset = 'once';
    draft.at = toLocalDateTimeInput(job.schedule.at);
    return draft;
  }

  if (job.schedule.kind === 'every') {
    if (job.schedule.everyMs === 60 * MINUTE_IN_MS) {
      draft.schedulePreset = 'hourly';
    } else {
      draft.schedulePreset = 'interval';
      draft.everyMinutes = formatEveryMinutes(job.schedule.everyMs);
      draft.anchorMs = job.schedule.anchorMs != null
        ? timestampMsToLocalDateTimeInput(job.schedule.anchorMs)
        : '';
    }
    return draft;
  }

  const dailyTime = cronExprToDailyTime(job.schedule.expr);
  if (dailyTime) {
    draft.schedulePreset = 'daily';
    draft.dailyTime = dailyTime;
  } else {
    draft.schedulePreset = 'cron';
    draft.expr = job.schedule.expr;
  }
  draft.timezone = job.schedule.tz ?? '';
  return draft;
}

function buildScheduleDraft(draft: AutomationDraft): AutomationScheduleDraft {
  switch (draft.schedulePreset) {
    case 'once':
      return { kind: 'once', at: draft.at };
    case 'future':
      return { kind: 'future', at: draft.at };
    case 'hourly':
      return { kind: 'hourly' };
    case 'daily':
      return { kind: 'daily', dailyTime: draft.dailyTime, timezone: draft.timezone };
    case 'interval':
      return { kind: 'interval', everyMinutes: draft.everyMinutes, anchorMs: draft.anchorMs };
    case 'cron':
      return { kind: 'cron', expr: draft.expr, timezone: draft.timezone };
    default: {
      const exhaustive: never = draft.schedulePreset;
      return exhaustive;
    }
  }
}

function validateDraft(
  draft: AutomationDraft,
  t: (key: string, params?: Record<string, unknown>) => string,
): string | null {
  if (!draft.name.trim()) return t('nav.scheduledJobs.validation.nameRequired');
  if (!draft.text.trim()) return t('nav.scheduledJobs.validation.promptRequired');
  if (!draft.sessionId.trim()) return t('nav.scheduledJobs.validation.sessionRequired');
  return null;
}

function formatTimestamp(
  timestampMs: number | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (!timestampMs || !Number.isFinite(timestampMs)) return t('nav.scheduledJobs.never');
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestampMs);
}

function formatScheduleSummary(
  schedule: CronSchedule,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  switch (schedule.kind) {
    case 'at':
      return `${t('nav.scheduledJobs.scheduleKinds.at')}: ${formatTimestamp(new Date(schedule.at).getTime(), t)}`;
    case 'every':
      return t('nav.scheduledJobs.scheduleSummary.every', { everyMinutes: formatEveryMinutes(schedule.everyMs) });
    case 'cron':
      return schedule.tz
        ? t('nav.scheduledJobs.scheduleSummary.cronWithTz', { expr: schedule.expr, tz: schedule.tz })
        : t('nav.scheduledJobs.scheduleSummary.cron', { expr: schedule.expr });
    default:
      return '';
  }
}

function resolveJobStatus(job: CronJob): string {
  if (!job.enabled) return 'disabled';
  return job.state.lastRunStatus ?? 'idle';
}

function resolveSessionLabel(session: Session): string {
  return resolveSessionTitle(session, (key, options) => i18nService.t(key, options));
}

const scheduleGroupOrder: AutomationScheduleGroupKey[] = ['today', 'tomorrow', 'upcoming', 'unscheduled'];

const AutomationScene: React.FC = () => {
  const { t } = useI18n('common');
  const { currentWorkspace } = useWorkspaceContext();
  const workspacePath = currentWorkspace?.rootPath ?? '';
  const [flowChatState, setFlowChatState] = useState<FlowChatState>(() => flowChatStore.getState());
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AutomationDraft>(() => createEmptyDraft());

  useEffect(() => {
    const unsubscribe = flowChatStore.subscribe((state) => setFlowChatState(state));
    return unsubscribe;
  }, []);

  const mainSessions = useMemo(() => (
    filterMainSessionsForAutomation(Array.from(flowChatState.sessions.values()), workspacePath)
      .sort(compareSessionsForDisplay)
  ), [flowChatState.sessions, workspacePath]);

  const defaultSessionId = mainSessions[0]?.sessionId ?? '';

  const sessionLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    mainSessions.forEach(session => labels.set(session.sessionId, resolveSessionLabel(session)));
    return labels;
  }, [mainSessions]);

  const sessionOptions = useMemo(
    () => mainSessions.map(session => ({
      value: session.sessionId,
      label: resolveSessionLabel(session),
      description: session.title || session.sessionId,
    })),
    [mainSessions],
  );

  const sortedJobs = useMemo(() => [...jobs].sort((a, b) => {
    const leftNext = getAutomationJobNextRunAtMs(a) ?? Number.MAX_SAFE_INTEGER;
    const rightNext = getAutomationJobNextRunAtMs(b) ?? Number.MAX_SAFE_INTEGER;
    return leftNext - rightNext || b.configUpdatedAtMs - a.configUpdatedAtMs;
  }), [jobs]);

  const scheduleGroups = useMemo(
    () => groupAutomationJobsByNextRun(sortedJobs),
    [sortedJobs],
  );

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await cronAPI.listJobs({ workspacePath: workspacePath || undefined });
      setJobs(result);
    } catch (error) {
      log.error('Failed to load automation jobs', { error });
      notificationService.error(
        t('nav.scheduledJobs.messages.loadFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [t, workspacePath]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const handleCreateNew = useCallback(() => {
    setSelectedJobId(null);
    setDraft(createEmptyDraft(defaultSessionId));
    setModalOpen(true);
  }, [defaultSessionId]);

  const handleEditJob = useCallback((job: CronJob) => {
    setSelectedJobId(job.id);
    setDraft(jobToDraft(job));
    setModalOpen(true);
  }, []);

  const handleDeleteJob = useCallback(async (job: CronJob) => {
    const confirmed = await confirmDanger(
      t('nav.scheduledJobs.deleteDialog.title', { name: job.name }),
      null,
    );
    if (!confirmed) return;
    try {
      await cronAPI.deleteJob(job.id);
      notificationService.success(t('nav.scheduledJobs.messages.deleteSuccess'));
      await loadJobs();
    } catch (error) {
      log.error('Failed to delete automation job', { jobId: job.id, error });
      notificationService.error(
        t('nav.scheduledJobs.messages.deleteFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }, [loadJobs, t]);

  const handleToggleEnabled = useCallback(async (job: CronJob, enabled: boolean) => {
    try {
      await cronAPI.updateJob(job.id, { enabled });
      await loadJobs();
    } catch (error) {
      log.error('Failed to toggle automation job', { jobId: job.id, error });
      notificationService.error(
        t('nav.scheduledJobs.messages.updateFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }, [loadJobs, t]);

  const handleSave = useCallback(async () => {
    const validationError = validateDraft(draft, t);
    if (validationError) {
      notificationService.error(validationError);
      return;
    }
    if (!workspacePath.trim()) {
      notificationService.error(t('nav.scheduledJobs.validation.workspaceRequired'));
      return;
    }

    let schedule: CronSchedule;
    try {
      schedule = buildCronScheduleFromAutomationDraft(buildScheduleDraft(draft));
    } catch (error) {
      notificationService.error(error instanceof Error ? error.message : String(error));
      return;
    }

    setSaving(true);
    try {
      if (selectedJobId) {
        const request: UpdateCronJobRequest = {
          name: draft.name.trim(),
          payload: { text: draft.text.trim() },
          enabled: draft.enabled,
          schedule,
          workspacePath: workspacePath.trim(),
          sessionId: draft.sessionId.trim(),
        };
        await cronAPI.updateJob(selectedJobId, request);
        notificationService.success(t('nav.scheduledJobs.messages.updateSuccess'));
      } else {
        const request: CreateCronJobRequest = {
          name: draft.name.trim(),
          payload: { text: draft.text.trim() },
          enabled: draft.enabled,
          schedule,
          workspacePath: workspacePath.trim(),
          sessionId: draft.sessionId.trim(),
        };
        await cronAPI.createJob(request);
        notificationService.success(t('nav.scheduledJobs.messages.createSuccess'));
      }
      setModalOpen(false);
      await loadJobs();
    } catch (error) {
      log.error('Failed to save automation job', { error });
      notificationService.error(
        t('nav.scheduledJobs.messages.saveFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSaving(false);
    }
  }, [draft, loadJobs, selectedJobId, t, workspacePath]);

  const canCreate = Boolean(workspacePath && defaultSessionId);
  const modalTitle = selectedJobId
    ? t('nav.scheduledJobs.editor.editTitle')
    : t('nav.scheduledJobs.editor.createTitle');

  return (
    <div className="automation-scene">
      <header className="automation-scene__header">
        <div>
          <div className="automation-scene__eyebrow">{t('automation.eyebrow')}</div>
          <h1>{t('automation.title')}</h1>
          <p>{t('automation.description')}</p>
        </div>
        <div className="automation-scene__header-actions">
          <IconButton
            type="button"
            size="small"
            aria-label={t('nav.scheduledJobs.actions.refresh')}
            tooltip={t('nav.scheduledJobs.actions.refresh')}
            onClick={() => void loadJobs()}
          >
            <RefreshCw size={14} />
          </IconButton>
          <Button
            type="button"
            variant="primary"
            onClick={handleCreateNew}
            disabled={!canCreate}
          >
            {t('automation.actions.create')}
          </Button>
        </div>
      </header>

      {!workspacePath ? (
        <div className="automation-scene__empty">
          <CalendarClock size={22} />
          <h2>{t('automation.empty.noWorkspaceTitle')}</h2>
          <p>{t('automation.empty.noWorkspaceDescription')}</p>
        </div>
      ) : loading ? (
        <div className="automation-scene__loading" role="status" aria-busy="true">
          <RefreshCw size={16} className="automation-scene__spin" />
          <span>{t('nav.scheduledJobs.loading')}</span>
        </div>
      ) : (
        <div className="automation-scene__content">
          <section className="automation-scene__panel automation-scene__panel--schedule">
            <div className="automation-scene__panel-head">
              <span>{t('automation.schedule.title')}</span>
              <span>{t('automation.schedule.count', { count: jobs.length })}</span>
            </div>
            <div className="automation-scene__schedule-groups">
              {scheduleGroupOrder.map(groupKey => {
                const items = scheduleGroups[groupKey];
                return (
                  <div className="automation-scene__schedule-group" key={groupKey}>
                    <div className="automation-scene__schedule-group-title">
                      {t(`automation.schedule.groups.${groupKey}`)}
                    </div>
                    {items.length === 0 ? (
                      <div className="automation-scene__schedule-empty">
                        {t('automation.schedule.emptyGroup')}
                      </div>
                    ) : items.map(item => (
                      <button
                        key={item.job.id}
                        type="button"
                        className="automation-scene__schedule-row"
                        onClick={() => handleEditJob(item.job)}
                      >
                        <span>{formatTimestamp(item.nextRunAtMs, t)}</span>
                        <strong>{item.job.name}</strong>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="automation-scene__panel automation-scene__panel--jobs">
            <div className="automation-scene__panel-head">
              <span>{t('nav.scheduledJobs.listTitle')}</span>
              <span>{currentWorkspace?.name ?? workspacePath}</span>
            </div>
            {sortedJobs.length === 0 ? (
              <div className="automation-scene__empty automation-scene__empty--inline">
                <CalendarClock size={20} />
                <h2>{t('nav.scheduledJobs.empty.title')}</h2>
                <p>{t('automation.empty.noJobsDescription')}</p>
              </div>
            ) : (
              <div className="automation-scene__job-list">
                {sortedJobs.map(job => {
                  const status = resolveJobStatus(job);
                  return (
                    <article className="automation-scene__job-card" key={job.id}>
                      <button
                        type="button"
                        className="automation-scene__job-main"
                        onClick={() => handleEditJob(job)}
                      >
                        <span className="automation-scene__job-title">{job.name}</span>
                        <span className="automation-scene__job-meta">
                          {formatScheduleSummary(job.schedule, t)}
                        </span>
                        <span className="automation-scene__job-meta">
                          {t('automation.target')}: {sessionLabelById.get(job.sessionId) ?? job.sessionId}
                        </span>
                        <span className="automation-scene__job-meta">
                          {t('nav.scheduledJobs.nextRunLabel')}: {formatTimestamp(getAutomationJobNextRunAtMs(job), t)}
                        </span>
                        {job.state.lastError ? (
                          <span className="automation-scene__job-error">{job.state.lastError}</span>
                        ) : null}
                      </button>
                      <div className="automation-scene__job-actions">
                        <span className={`automation-scene__status automation-scene__status--${status}`}>
                          {t(`nav.scheduledJobs.status.${status}`)}
                        </span>
                        <Switch
                          size="small"
                          checked={job.enabled}
                          onChange={e => void handleToggleEnabled(job, e.currentTarget.checked)}
                          aria-label={t('nav.scheduledJobs.actions.toggleEnabled')}
                        />
                        <IconButton
                          type="button"
                          size="xs"
                          variant="danger"
                          aria-label={t('nav.scheduledJobs.actions.delete')}
                          tooltip={t('nav.scheduledJobs.actions.delete')}
                          onClick={() => void handleDeleteJob(job)}
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        size="medium"
        contentInset
      >
        <div className="automation-scene__form">
          {!canCreate ? (
            <p className="automation-scene__warning">{t('nav.scheduledJobs.messages.sessionRequired')}</p>
          ) : null}

          <Input
            label={t('nav.scheduledJobs.fields.name')}
            value={draft.name}
            onChange={e => setDraft(prev => ({ ...prev, name: e.currentTarget.value }))}
            placeholder={t('nav.scheduledJobs.placeholders.name')}
          />

          <div className="automation-scene__form-grid">
            <Select
              label={t('nav.scheduledJobs.fields.scheduleKind')}
              value={draft.schedulePreset}
              options={[
                { value: 'once', label: t('automation.presets.once') },
                { value: 'future', label: t('automation.presets.future') },
                { value: 'hourly', label: t('automation.presets.hourly') },
                { value: 'daily', label: t('automation.presets.daily') },
                { value: 'interval', label: t('automation.presets.interval') },
                { value: 'cron', label: t('automation.presets.cron') },
              ]}
              onChange={value => setDraft(prev => ({ ...prev, schedulePreset: value as SchedulePreset }))}
            />
            <div className="automation-scene__switch-field">
              <span>{t('nav.scheduledJobs.fields.enabled')}</span>
              <Switch
                size="small"
                checked={draft.enabled}
                onChange={e => setDraft(prev => ({ ...prev, enabled: e.currentTarget.checked }))}
                aria-label={t('nav.scheduledJobs.fields.enabled')}
              />
            </div>
          </div>

          {(draft.schedulePreset === 'once' || draft.schedulePreset === 'future') ? (
            <Input
              type="datetime-local"
              label={t('nav.scheduledJobs.fields.at')}
              value={draft.at}
              onChange={e => setDraft(prev => ({ ...prev, at: e.currentTarget.value }))}
            />
          ) : null}

          {draft.schedulePreset === 'daily' ? (
            <div className="automation-scene__form-grid">
              <Input
                type="time"
                label={t('automation.fields.dailyTime')}
                value={draft.dailyTime}
                onChange={e => setDraft(prev => ({ ...prev, dailyTime: e.currentTarget.value }))}
              />
              <Input
                label={t('nav.scheduledJobs.fields.timezone')}
                value={draft.timezone}
                onChange={e => setDraft(prev => ({ ...prev, timezone: e.currentTarget.value }))}
                placeholder={t('nav.scheduledJobs.placeholders.timezone')}
              />
            </div>
          ) : null}

          {draft.schedulePreset === 'interval' ? (
            <div className="automation-scene__form-grid">
              <Input
                type="number"
                label={t('nav.scheduledJobs.fields.everyMs')}
                value={draft.everyMinutes}
                onChange={e => setDraft(prev => ({ ...prev, everyMinutes: e.currentTarget.value }))}
                placeholder="60"
              />
              <Input
                type="datetime-local"
                label={t('nav.scheduledJobs.fields.anchorMs')}
                value={draft.anchorMs}
                onChange={e => setDraft(prev => ({ ...prev, anchorMs: e.currentTarget.value }))}
                placeholder={t('nav.scheduledJobs.placeholders.anchorMs')}
              />
            </div>
          ) : null}

          {draft.schedulePreset === 'cron' ? (
            <div className="automation-scene__form-grid">
              <Input
                label={t('nav.scheduledJobs.fields.cronExpr')}
                value={draft.expr}
                onChange={e => setDraft(prev => ({ ...prev, expr: e.currentTarget.value }))}
                placeholder="0 8 * * *"
              />
              <Input
                label={t('nav.scheduledJobs.fields.timezone')}
                value={draft.timezone}
                onChange={e => setDraft(prev => ({ ...prev, timezone: e.currentTarget.value }))}
                placeholder={t('nav.scheduledJobs.placeholders.timezone')}
              />
            </div>
          ) : null}

          <Select
            label={t('automation.fields.target')}
            options={sessionOptions}
            value={draft.sessionId}
            searchable
            onChange={value => setDraft(prev => ({ ...prev, sessionId: String(value) }))}
            placeholder={t('nav.scheduledJobs.placeholders.session')}
          />

          <Textarea
            label={t('nav.scheduledJobs.fields.prompt')}
            value={draft.text}
            onChange={e => setDraft(prev => ({ ...prev, text: e.currentTarget.value }))}
            autoResize
            showCount
            maxLength={4000}
            placeholder={t('nav.scheduledJobs.placeholders.prompt')}
          />

          <div className="automation-scene__form-actions">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              {t('nav.scheduledJobs.actions.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              disabled={!canCreate}
              isLoading={saving}
            >
              {selectedJobId
                ? t('nav.scheduledJobs.actions.save')
                : t('nav.scheduledJobs.actions.create')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AutomationScene;
