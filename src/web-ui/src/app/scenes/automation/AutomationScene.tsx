import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  cronAPI,
  type CronJob,
} from '@/infrastructure/api';
import { useI18n } from '@/infrastructure/i18n/hooks/useI18n';
import { i18nService } from '@/infrastructure/i18n';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import { flowChatManager } from '@/flow_chat/services/FlowChatManager';
import type { Session } from '@/flow_chat/types/flow-chat';
import { compareSessionsForDisplay } from '@/flow_chat/utils/sessionOrdering';
import { resolveSessionTitle } from '@/flow_chat/utils/sessionTitle';
import { notificationService } from '@/shared/notification-system/services/NotificationService';
import { createLogger } from '@/shared/utils/logger';
import {
  cronJobToAutomationTask,
} from './automationViewModel';
import {
  buildAutomationSessionTitle,
  buildAutomationWorkspaces,
  getDefaultAutomationWorkspaceId,
  toFlowChatSessionMode,
} from './automationTargeting';
import { buildCreateCronJobRequest } from './automationTaskCreation';
import { AutomationProvider, useAutomation } from './automation-context';
import type { AutomationTask } from './automation-types';
import { AutomationHeader } from './AutomationHeader';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import { DayView } from './DayView';
import { ListView } from './ListView';
import { TaskDetailPanel } from './TaskDetailPanel';
import { CreateTaskDialog } from './CreateTaskDialog';
import { useAutomationFlowChatState } from './useAutomationFlowChatState';
import './AutomationScene.scss';

const log = createLogger('AutomationScene');

function resolveSessionLabel(session: Session): string {
  return resolveSessionTitle(session, (key, options) => i18nService.t(key, options));
}

function backfillAutomationSessionMarkers(jobs: CronJob[]): void {
  const state = flowChatStore.getState();
  const sessionIds = new Set(
    jobs
      .map(job => job.sessionId)
      .filter((sessionId): sessionId is string => Boolean(sessionId)),
  );

  sessionIds.forEach(sessionId => {
    const session = state.sessions.get(sessionId);
    if (!session || session.isAutomationSession) return;

    void flowChatManager.markChatSessionAutomation(sessionId).catch(error => {
      log.warn('Failed to backfill automation session marker', { sessionId, error });
    });
  });
}

interface AutomationSceneProps {
  isActive?: boolean;
}

const AutomationScene: React.FC<AutomationSceneProps> = ({ isActive = true }) => {
  const { t } = useI18n('common');
  const { t: tAutomation } = useI18n('scenes/automation');
  const {
    currentWorkspace,
    openedWorkspacesList,
    openWorkspace,
  } = useWorkspaceContext();
  const flowChatState = useAutomationFlowChatState(isActive);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);

  const workspaceOptions = useMemo(
    () => buildAutomationWorkspaces(openedWorkspacesList),
    [openedWorkspacesList],
  );

  const currentAutomationWorkspaceId = useMemo(
    () => getDefaultAutomationWorkspaceId(workspaceOptions, currentWorkspace?.id),
    [currentWorkspace?.id, workspaceOptions],
  );

  const sortedSessions = useMemo(
    () => Array.from(flowChatState.sessions.values()).sort(compareSessionsForDisplay),
    [flowChatState.sessions],
  );

  const agentNameById = useMemo(() => {
    const labels = new Map<string, string>();
    sortedSessions.forEach(session => {
      if (!labels.has(session.sessionId)) {
        labels.set(session.sessionId, resolveSessionLabel(session));
      }
    });
    return labels;
  }, [sortedSessions]);

  const tasks = useMemo(
    () => jobs.map(job => cronJobToAutomationTask(job, agentNameById)),
    [agentNameById, jobs],
  );

  const agents = useMemo(() => {
    const byId = new Map<string, {
      id: string;
      name: string;
      type: 'developer' | 'ops';
      description?: string;
      isSubAgent: false;
    }>();
    tasks.forEach(task => {
      if (!task.agentId || byId.has(task.agentId)) return;
      byId.set(task.agentId, {
        id: task.agentId,
        name: task.agentName ?? task.agentId,
        type: task.executionMode === 'cowork' ? 'ops' : 'developer',
        description: task.workspacePath,
        isSubAgent: false,
      });
    });
    return Array.from(byId.values());
  }, [tasks]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await cronAPI.listJobs();
      setJobs(result);
      backfillAutomationSessionMarkers(result);
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
  }, [t]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const handleCreateTask = useCallback((task: AutomationTask) => {
    const targetWorkspacePath = task.workspacePath?.trim();
    if (!targetWorkspacePath) {
      notificationService.error(t('nav.scheduledJobs.validation.workspaceRequired'));
      return;
    }

    const workspace = workspaceOptions.find(item => item.id === task.workspaceId)
      ?? workspaceOptions.find(item => item.rootPath === targetWorkspacePath);
    if (!workspace) {
      notificationService.error(t('nav.scheduledJobs.validation.workspaceRequired'));
      return;
    }

    void flowChatManager.createChatSession(
      {
        workspacePath: workspace.rootPath,
        workspaceId: workspace.id,
        remoteConnectionId: workspace.remoteConnectionId,
        remoteSshHost: workspace.remoteSshHost,
      },
      toFlowChatSessionMode(task.executionMode ?? 'code'),
    )
      .then(async (sessionId) => {
        const sessionTitle = buildAutomationSessionTitle(task.name);
        try {
          await flowChatManager.renameChatSessionTitle(sessionId, sessionTitle);
        } catch (error) {
          log.warn('Failed to rename automation session', { sessionId, error });
        }
        try {
          await flowChatManager.markChatSessionAutomation(sessionId);
        } catch (error) {
          log.warn('Failed to persist automation session marker', { sessionId, error });
        }
        return cronAPI.createJob(buildCreateCronJobRequest(task, sessionId));
      })
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
  }, [loadJobs, t, workspaceOptions]);

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

  const handleRunTaskNow = useCallback((task: AutomationTask) => {
    void cronAPI.runJobNow(task.id)
      .then(async (job) => {
        const status = job.state.lastRunStatus;
        notificationService.success(
          status === 'running'
            ? tAutomation('runNow.started')
            : status === 'queued'
              ? tAutomation('runNow.queued')
              : tAutomation('runNow.triggered'),
        );
        await loadJobs();
      })
      .catch(error => {
        log.error('Failed to run automation job now', { jobId: task.id, error });
        notificationService.error(
          tAutomation('runNow.failed', {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        void loadJobs();
      });
  }, [loadJobs, tAutomation]);

  const handleOpenWorkspace = useCallback(async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('header.selectProjectDirectory'),
    });
    if (typeof selected !== 'string') return;
    await openWorkspace(selected);
  }, [openWorkspace, t]);

  return (
    <AutomationProvider
      tasks={tasks}
      agents={agents}
      initialView="week"
      onCreateTask={handleCreateTask}
      onDeleteTask={handleDeleteTask}
      onToggleTaskEnabled={handleToggleTaskEnabled}
      onRunTaskNow={handleRunTaskNow}
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
        <CreateTaskDialog
          workspaces={workspaceOptions}
          currentWorkspaceId={currentAutomationWorkspaceId}
          onOpenWorkspace={handleOpenWorkspace}
        />
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
