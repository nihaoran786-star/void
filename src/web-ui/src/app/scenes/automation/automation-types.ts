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
  scheduleType: AutomationScheduleType;
  scheduledAt: string;
  duration: number;
  priority: AutomationPriority;
  status: AutomationTaskStatus;
  enabled: boolean;
  createdAt: string;
  completedAt?: string;
  artifacts?: AutomationArtifact[];
  conversation?: AutomationConversationMessage[];
}

export const AUTOMATION_PRIORITY_META: Record<AutomationPriority, { label: string; modifier: string }> = {
  P0: { label: '紧急', modifier: 'p0' },
  P1: { label: '高', modifier: 'p1' },
  P2: { label: '中', modifier: 'p2' },
  P3: { label: '低', modifier: 'p3' },
};
export const PRIORITY_META = AUTOMATION_PRIORITY_META;

export const AUTOMATION_STATUS_META: Record<AutomationTaskStatus, { label: string; modifier: string }> = {
  pending: { label: '待执行', modifier: 'pending' },
  running: { label: '进行中', modifier: 'running' },
  completed: { label: '已完成', modifier: 'completed' },
  failed: { label: '已失败', modifier: 'failed' },
};
export const STATUS_META = AUTOMATION_STATUS_META;

export const AUTOMATION_SCHEDULE_META: Record<AutomationScheduleType, { label: string }> = {
  once: { label: '单次' },
  hourly: { label: '每小时' },
  daily: { label: '每天' },
  weekly: { label: '每周' },
  monthly: { label: '每月' },
};
export const SCHEDULE_META = AUTOMATION_SCHEDULE_META;
