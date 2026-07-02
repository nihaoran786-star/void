import { i18nService } from '@/infrastructure/i18n';

export type AutomationExecutionMode = 'code' | 'cowork';
export type AutomationFlowChatMode = 'agentic' | 'Cowork';

export interface AutomationWorkspaceSource {
  id: string;
  name: string;
  rootPath: string;
  workspaceKind?: string | null;
  connectionId?: string | null;
  sshHost?: string | null;
}

export interface AutomationWorkspaceOption {
  id: string;
  name: string;
  rootPath: string;
  remoteConnectionId?: string;
  remoteSshHost?: string;
}

export interface AutomationTargetSessionSource {
  sessionId: string;
  title?: string;
  workspaceId?: string | null;
  workspacePath?: string | null;
  parentSessionId?: string | null;
  mode?: string | null;
  sessionKind?: string | null;
  isTransient?: boolean;
}

export interface AutomationTargetSessionOption {
  sessionId: string;
  label: string;
  workspaceId?: string;
  workspacePath: string;
  mode: AutomationExecutionMode;
  isRecoveredFallback: boolean;
  isRecommended: boolean;
}

export interface AutomationTargetDraft {
  workspaceId: string;
  workspacePath: string;
  executionMode: AutomationExecutionMode;
  prompt: string;
  scheduleType: 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  scheduledAt: string;
}

export interface BuildAutomationTaskDraftTargetInput {
  workspace: AutomationWorkspaceSource | AutomationWorkspaceOption;
  executionMode: AutomationExecutionMode;
  prompt: string;
  scheduleType: AutomationTargetDraft['scheduleType'];
  scheduledAt: string;
}

export function buildAutomationWorkspaces(
  workspaces: AutomationWorkspaceSource[],
): AutomationWorkspaceOption[] {
  return workspaces
    .filter(workspace => workspace.workspaceKind?.toLowerCase() !== 'assistant')
    .filter(workspace => workspace.id.trim() && workspace.rootPath.trim())
    .map(workspace => ({
      id: workspace.id,
      name: workspace.name.trim() || workspace.rootPath,
      rootPath: workspace.rootPath,
      remoteConnectionId: workspace.connectionId?.trim() || undefined,
      remoteSshHost: workspace.sshHost?.trim() || undefined,
    }));
}

export function getDefaultAutomationWorkspaceId(
  workspaces: AutomationWorkspaceOption[],
  currentWorkspaceId?: string | null,
): string {
  if (!workspaces.length) return '';
  if (currentWorkspaceId) {
    const current = workspaces.find(workspace => workspace.id === currentWorkspaceId);
    if (current) return current.id;
  }
  return workspaces[0].id;
}

export function buildAutomationTaskDraftTarget(
  input: BuildAutomationTaskDraftTargetInput,
): AutomationTargetDraft {
  return {
    workspaceId: input.workspace.id,
    workspacePath: input.workspace.rootPath,
    executionMode: input.executionMode,
    prompt: input.prompt.trim(),
    scheduleType: input.scheduleType,
    scheduledAt: input.scheduledAt,
  };
}

export function toFlowChatSessionMode(mode: AutomationExecutionMode): AutomationFlowChatMode {
  return mode === 'cowork' ? 'Cowork' : 'agentic';
}

export function buildAutomationSessionTitle(taskName: string): string {
  const defaultTaskNameKey = 'scenes/automation:targeting.defaultTaskName';
  const sessionTitleKey = 'scenes/automation:targeting.sessionTitle';
  const defaultTaskName = i18nService.t(defaultTaskNameKey);
  const resolvedDefaultTaskName =
    defaultTaskName === 'targeting.defaultTaskName'
      ? '\u81ea\u52a8\u5316\u4efb\u52a1'
      : defaultTaskName;
  const name = taskName.trim() || resolvedDefaultTaskName;
  const sessionTitle = i18nService.t(sessionTitleKey, { name });
  return sessionTitle === 'targeting.sessionTitle'
    ? `\u81ea\u52a8\u5316 \u00b7 ${name}`
    : sessionTitle;
}

export function buildAutomationTargetSessions(
  sessions: AutomationTargetSessionSource[],
  workspace: AutomationWorkspaceOption | AutomationWorkspaceSource | null | undefined,
  mode: AutomationExecutionMode,
): AutomationTargetSessionOption[] {
  if (!workspace) return [];

  const eligible = sessions
    .filter(session => isEligibleMainSession(session))
    .filter(session => sessionMatchesWorkspace(session, workspace))
    .filter(session => normalizeExecutionMode(session.mode) === mode)
    .map(session => toTargetSessionOption(session, workspace, mode));

  const recommended = eligible.filter(session => session.isRecommended);
  return recommended.length > 0 ? recommended : eligible;
}

function isEligibleMainSession(session: AutomationTargetSessionSource): boolean {
  if (session.parentSessionId) return false;
  if (session.sessionKind?.toLowerCase() === 'subagent') return false;
  if (session.isTransient) return false;

  const normalizedMode = session.mode?.trim().toLowerCase();
  if (normalizedMode === 'claw' || normalizedMode === 'assistant') return false;
  if (!normalizedMode) return true;
  return normalizedMode === 'agentic' || normalizedMode === 'code' || normalizedMode === 'cowork';
}

function sessionMatchesWorkspace(
  session: AutomationTargetSessionSource,
  workspace: AutomationWorkspaceOption | AutomationWorkspaceSource,
): boolean {
  if (session.workspaceId && session.workspaceId === workspace.id) return true;
  return normalizePath(session.workspacePath) === normalizePath(workspace.rootPath);
}

function normalizeExecutionMode(mode: string | null | undefined): AutomationExecutionMode {
  return mode?.trim().toLowerCase() === 'cowork' ? 'cowork' : 'code';
}

function toTargetSessionOption(
  session: AutomationTargetSessionSource,
  workspace: AutomationWorkspaceOption | AutomationWorkspaceSource,
  mode: AutomationExecutionMode,
): AutomationTargetSessionOption {
  const isRecoveredFallback = isRecoveredSession(session);
  const label = session.title?.trim() || session.sessionId;
  return {
    sessionId: session.sessionId,
    label,
    workspaceId: session.workspaceId ?? workspace.id,
    workspacePath: session.workspacePath?.trim() || workspace.rootPath,
    mode,
    isRecoveredFallback,
    isRecommended: !isRecoveredFallback,
  };
}

function isRecoveredSession(session: AutomationTargetSessionSource): boolean {
  return session.title?.trim().toLowerCase() === 'recovered session';
}

function normalizePath(path: string | null | undefined): string {
  return path?.trim().replace(/\\/g, '/').toLowerCase() ?? '';
}
