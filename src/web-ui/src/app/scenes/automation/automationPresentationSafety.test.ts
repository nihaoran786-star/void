import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));

describe('automation detail panel safety', () => {
  it('does not expose unsupported artifact download or continue-chat actions', () => {
    const source = readFileSync(join(currentDir, 'TaskDetailPanel.tsx'), 'utf8');

    expect(source).not.toContain('task-detail-panel__artifact-download');
    expect(source).not.toContain('继续与 Agent 对话');
  });
});

describe('automation calendar shell safety', () => {
  it('does not replace the calendar workspace when no agents are available', () => {
    const source = readFileSync(join(currentDir, 'AutomationScene.tsx'), 'utf8');

    expect(source).not.toContain('agents.length === 0 ?');
    expect(source).toContain('<AutomationSceneBody />');
  });

  it('keeps create task visible but blocked when no workspace is available', () => {
    const source = readFileSync(join(currentDir, 'CreateTaskDialog.tsx'), 'utf8');

    expect(source).toContain('workspaces.length === 0');
    expect(source).toContain("t('create.workspace.required')");
    expect(source).not.toContain('targetSession');
    expect(source).not.toContain('availableSessions');
  });

  it('uses a segmented slider for code and cowork automation modes', () => {
    const source = readFileSync(join(currentDir, 'CreateTaskDialog.tsx'), 'utf8');

    expect(source).toContain('create-task-dialog__mode-slider');
    expect(source).toContain('role="tablist"');
    expect(source).toContain('create.executionMode.code.label');
    expect(source).toContain('create.executionMode.cowork.label');
  });

  it('lets users set task priority from the create dialog', () => {
    const source = readFileSync(join(currentDir, 'CreateTaskDialog.tsx'), 'utf8');

    expect(source).toContain("t('create.fields.priority')");
    expect(source).toContain('AUTOMATION_PRIORITY_META');
    expect(source).toContain('setPriority');
    expect(source).toContain('priority,');
  });

  it('keeps task name separate from the prompt sent to the agent', () => {
    const source = readFileSync(join(currentDir, 'CreateTaskDialog.tsx'), 'utf8');

    expect(source).toContain('id="task-prompt"');
    expect(source).toContain('prompt.trim()');
    expect(source).not.toContain('prompt: name.trim()');
  });

  it('creates a dedicated session before creating the cron job', () => {
    const source = readFileSync(join(currentDir, 'AutomationScene.tsx'), 'utf8');
    const createSessionIndex = source.indexOf('flowChatManager.createChatSession');
    const createJobIndex = source.indexOf('cronAPI.createJob(buildCreateCronJobRequest');

    expect(createSessionIndex).toBeGreaterThan(-1);
    expect(createJobIndex).toBeGreaterThan(createSessionIndex);
    expect(source).toContain('buildAutomationSessionTitle(task.name)');
  });

  it('marks dedicated automation sessions before creating the cron job', () => {
    const source = readFileSync(join(currentDir, 'AutomationScene.tsx'), 'utf8');
    const markSessionIndex = source.indexOf('flowChatManager.markChatSessionAutomation(sessionId)');
    const createJobIndex = source.indexOf('cronAPI.createJob(buildCreateCronJobRequest');

    expect(markSessionIndex).toBeGreaterThan(-1);
    expect(createJobIndex).toBeGreaterThan(markSessionIndex);
  });

  it('backfills automation markers from existing cron jobs outside the sidebar', () => {
    const source = readFileSync(join(currentDir, 'AutomationScene.tsx'), 'utf8');

    expect(source).toContain('backfillAutomationSessionMarkers(result)');
    expect(source).toContain('job.sessionId');
    expect(source).toContain('markChatSessionAutomation(sessionId)');
  });

  it('shows queued run state distinctly in task detail', () => {
    const source = readFileSync(join(currentDir, 'TaskDetailPanel.tsx'), 'utf8');

    expect(source).toContain("task.runStatus === 'queued'");
    expect(source).toContain("t('status.queued')");
  });
});
