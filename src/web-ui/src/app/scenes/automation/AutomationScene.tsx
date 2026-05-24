import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  cronAPI,
  type CreateCronJobRequest,
  type CronJob,
  type CronSchedule,
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
  filterMainSessionsForAutomation,
} from './automationSchedule';
import {
  cronJobToAutomationTask,
  mainSessionToAutomationAgent,
} from './automationViewModel';
import { AutomationProvider, useAutomation } from './automation-context';
import type { AutomationTask } from './automation-types';
import { AutomationHeader } from './AutomationHeader';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import { DayView } from './DayView';
import { ListView } from './ListView';
import { TaskDetailPanel } from './TaskDetailPanel';
import { CreateTaskDialog } from './CreateTaskDialog';
import './AutomationScene.scss';

const log = createLogger('AutomationScene');

function resolveSessionLabel(session: Session): string {
  return resolveSessionTitle(session, (key, options) => i18nService.t(key, options));
}

function taskToCronSchedule(task: AutomationTask): CronSchedule {
  const scheduledDate = new Date(task.scheduledAt);
  switch (task.scheduleType) {
    case 'hourly':
      return { kind: 'every', everyMs: 60 * 60 * 1000 };
    case 'daily':
      return {
        kind: 'cron',
        expr: `${scheduledDate.getMinutes()} ${scheduledDate.getHours()} * * *`,
      };
    case 'weekly':
      return {
        kind: 'cron',
        expr: `${scheduledDate.getMinutes()} ${scheduledDate.getHours()} * * ${scheduledDate.getDay()}`,
      };
    case 'monthly':
      return {
        kind: 'cron',
        expr: `${scheduledDate.getMinutes()} ${scheduledDate.getHours()} ${scheduledDate.getDate()} * *`,
      };
    case 'once':
    default:
      return { kind: 'at', at: scheduledDate.toISOString() };
  }
}

const AutomationScene: React.FC = () => {
  const { t } = useI18n('common');
  const { currentWorkspace } = useWorkspaceContext();
  const workspacePath = currentWorkspace?.rootPath ?? '';
  const [flowChatState, setFlowChatState] = useState<FlowChatState>(() => flowChatStore.getState());
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = flowChatStore.subscribe((state) => setFlowChatState(state));
    return unsubscribe;
  }, []);

  const mainSessions = useMemo(() => (
    filterMainSessionsForAutomation(Array.from(flowChatState.sessions.values()), workspacePath)
      .sort(compareSessionsForDisplay)
  ), [flowChatState.sessions, workspacePath]);

  const agentNameById = useMemo(() => {
    const labels = new Map<string, string>();
    mainSessions.forEach(session => labels.set(session.sessionId, resolveSessionLabel(session)));
    return labels;
  }, [mainSessions]);

  const tasks = useMemo(
    () => jobs.map(job => cronJobToAutomationTask(job, agentNameById)),
    [agentNameById, jobs],
  );

  const agents = useMemo(
    () => mainSessions.map(session => mainSessionToAutomationAgent({
      sessionId: session.sessionId,
      title: resolveSessionLabel(session),
      workspacePath: session.workspacePath,
    })),
    [mainSessions],
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

  const handleCreateTask = useCallback((task: AutomationTask) => {
    if (!workspacePath) {
      notificationService.error(t('nav.scheduledJobs.validation.workspaceRequired'));
      return;
    }
    if (!task.agentId) {
      notificationService.error(t('nav.scheduledJobs.validation.sessionRequired'));
      return;
    }

    const request: CreateCronJobRequest = {
      name: task.name.trim(),
      payload: { text: task.prompt.trim() || task.name.trim() },
      enabled: true,
      schedule: taskToCronSchedule(task),
      workspacePath,
      sessionId: task.agentId,
    };

    void cronAPI.createJob(request)
      .then(async () => {
        notificationService.success(t('nav.scheduledJobs.messages.createSuccess'));
        await loadJobs();
      })
      .catch(error => {
        log.error('Failed to create automation job', { error });
        notificationService.error(
          t('nav.scheduledJobs.messages.saveFailed', {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        void loadJobs();
      });
  }, [loadJobs, t, workspacePath]);

  const handleDeleteTask = useCallback((task: AutomationTask) => {
    void cronAPI.deleteJob(task.id)
      .then(async () => {
        notificationService.success(t('nav.scheduledJobs.messages.deleteSuccess'));
        await loadJobs();
      })
      .catch(error => {
        log.error('Failed to delete automation job', { jobId: task.id, error });
        notificationService.error(
          t('nav.scheduledJobs.messages.deleteFailed', {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        void loadJobs();
      });
  }, [loadJobs, t]);

  const handleToggleTaskEnabled = useCallback((task: AutomationTask, enabled: boolean) => {
    void cronAPI.updateJob(task.id, { enabled })
      .then(async () => {
        await loadJobs();
      })
      .catch(error => {
        log.error('Failed to toggle automation job', { jobId: task.id, error });
        notificationService.error(
          t('nav.scheduledJobs.messages.updateFailed', {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        void loadJobs();
      });
  }, [loadJobs, t]);

  if (!workspacePath) {
    return (
      <div className="automation-scene automation-scene--empty-host">
        <div className="automation-scene__host-empty">
          <h1>{t('automation.empty.noWorkspaceTitle')}</h1>
          <p>{t('automation.empty.noWorkspaceDescription')}</p>
        </div>
      </div>
    );
  }

  return (
    <AutomationProvider
      tasks={tasks}
      agents={agents}
      initialView="week"
      onCreateTask={handleCreateTask}
      onDeleteTask={handleDeleteTask}
      onToggleTaskEnabled={handleToggleTaskEnabled}
    >
      <div className="automation-scene">
        <AutomationHeader />
        {loading ? (
          <div className="automation-scene__host-loading" role="status" aria-busy="true">
            <RefreshCw size={16} className="automation-scene__spin" />
            <span>{t('nav.scheduledJobs.loading')}</span>
          </div>
        ) : (
          <main className="automation-scene__body">
            <AutomationSceneBody />
          </main>
        )}
        <TaskDetailPanel />
        <CreateTaskDialog />
      </div>
    </AutomationProvider>
  );
};

function AutomationSceneBody() {
  const { view } = useAutomation();
  if (view === 'week') return <WeekView />;
  if (view === 'month') return <MonthView />;
  if (view === 'day') return <DayView />;
  return <ListView />;
}

export default AutomationScene;
