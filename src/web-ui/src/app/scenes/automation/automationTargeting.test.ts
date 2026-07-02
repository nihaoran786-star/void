import { describe, expect, it } from 'vitest';
import {
  buildAutomationSessionTitle,
  buildAutomationTaskDraftTarget,
  buildAutomationWorkspaces,
  getDefaultAutomationWorkspaceId,
  toFlowChatSessionMode,
  type AutomationTargetSessionSource,
  type AutomationWorkspaceSource,
} from './automationTargeting';

const workspaces: AutomationWorkspaceSource[] = [
  { id: 'ws-a', name: 'Repo A', rootPath: 'C:/repo-a', workspaceKind: 'normal' },
  { id: 'ws-b', name: 'Repo B', rootPath: 'D:/repo-b', workspaceKind: 'normal' },
  { id: 'assistant', name: 'Assistant', rootPath: 'assistant://home', workspaceKind: 'assistant' },
];

function session(overrides: Partial<AutomationTargetSessionSource>): AutomationTargetSessionSource {
  return {
    sessionId: overrides.sessionId ?? 'session',
    title: overrides.title,
    mode: overrides.mode,
    workspaceId: overrides.workspaceId,
    workspacePath: overrides.workspacePath,
    parentSessionId: overrides.parentSessionId,
    sessionKind: overrides.sessionKind,
    isTransient: overrides.isTransient,
  };
}

describe('automationTargeting', () => {
  it('builds automation workspaces from non-assistant opened workspaces and defaults to current workspace', () => {
    const options = buildAutomationWorkspaces(workspaces);

    expect(options.map(workspace => workspace.id)).toEqual(['ws-a', 'ws-b']);
    expect(getDefaultAutomationWorkspaceId(options, 'ws-b')).toBe('ws-b');
    expect(getDefaultAutomationWorkspaceId(options, 'missing')).toBe('ws-a');
  });

  it('builds a workspace-first draft without a user-selected session id', () => {
    const target = buildAutomationTaskDraftTarget({
      workspace: workspaces[0],
      executionMode: 'cowork',
      prompt: '  summarize repo  ',
      scheduleType: 'daily',
      scheduledAt: '2026-05-25T01:00:00.000Z',
    });

    expect(target).toEqual({
      workspaceId: 'ws-a',
      workspacePath: 'C:/repo-a',
      executionMode: 'cowork',
      prompt: 'summarize repo',
      scheduleType: 'daily',
      scheduledAt: '2026-05-25T01:00:00.000Z',
    });
    expect(target).not.toHaveProperty('sessionId');
  });

  it('maps automation modes to FlowChat modes and titles dedicated sessions', () => {
    expect(toFlowChatSessionMode('code')).toBe('agentic');
    expect(toFlowChatSessionMode('cowork')).toBe('Cowork');
    expect(buildAutomationSessionTitle('每日总结')).toBe('自动化 · 每日总结');
    expect(buildAutomationSessionTitle('   ')).toBe('自动化 · 自动化任务');
  });
});
