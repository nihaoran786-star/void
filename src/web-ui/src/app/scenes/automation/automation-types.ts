export type AutomationPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type Priority = AutomationPriority;

export type AutomationTaskStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TaskStatus = AutomationTaskStatus;

export type AutomationScheduleType = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly';
export type ScheduleType = AutomationScheduleType;

export type AutomationAgentType =
  | 'research'
  | 'writer'
  | 'analyst'
  | 'developer'
  | 'designer'
  | 'ops'
  | 'general';
export type AgentType = AutomationAgentType;

export interface AutomationAgent {
  id: string;
  name: string;
  type: AutomationAgentType;
  description?: string;
  isSubAgent?: boolean;
  parentId?: string;
}
export type Agent = AutomationAgent;

export interface AutomationArtifact {
  id: string;
  name: string;
  type: 'document' | 'image' | 'data' | 'code';
  size: string;
}
export type Artifact = AutomationArtifact;

export interface AutomationConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
}
export type ConversationMessage = AutomationConversationMessage;

export interface AutomationTask {
  id: string;
  name: string;
  description: string;
  prompt: string;
  agentId: string;
  agentName?: string;
  workspaceId?: string;
  workspacePath?: string;
  executionMode?: 'code' | 'cowork';
  scheduleType: AutomationScheduleType;
  scheduledAt: string;
  duration: number;
  priority: AutomationPriority;
  status: AutomationTaskStatus;
  runStatus?: 'queued' | 'running' | 'ok' | 'error' | 'cancelled';
  enabled: boolean;
  createdAt: string;
  completedAt?: string;
  artifacts?: AutomationArtifact[];
  conversation?: AutomationConversationMessage[];
}

export const AUTOMATION_PRIORITY_META: Record<AutomationPriority, { labelKey: string; modifier: string }> = {
  P0: { labelKey: 'priority.P0', modifier: 'p0' },
  P1: { labelKey: 'priority.P1', modifier: 'p1' },
  P2: { labelKey: 'priority.P2', modifier: 'p2' },
  P3: { labelKey: 'priority.P3', modifier: 'p3' },
};
export const PRIORITY_META = AUTOMATION_PRIORITY_META;

export const AUTOMATION_STATUS_META: Record<AutomationTaskStatus, { labelKey: string; modifier: string }> = {
  pending: { labelKey: 'status.pending', modifier: 'pending' },
  running: { labelKey: 'status.running', modifier: 'running' },
  completed: { labelKey: 'status.completed', modifier: 'completed' },
  failed: { labelKey: 'status.failed', modifier: 'failed' },
};
export const STATUS_META = AUTOMATION_STATUS_META;

export const AUTOMATION_SCHEDULE_META: Record<AutomationScheduleType, { labelKey: string }> = {
  once: { labelKey: 'schedule.once' },
  hourly: { labelKey: 'schedule.hourly' },
  daily: { labelKey: 'schedule.daily' },
  weekly: { labelKey: 'schedule.weekly' },
  monthly: { labelKey: 'schedule.monthly' },
};
export const SCHEDULE_META = AUTOMATION_SCHEDULE_META;
