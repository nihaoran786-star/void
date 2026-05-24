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

  it('keeps create task visible but blocked when no main agent is available', () => {
    const source = readFileSync(join(currentDir, 'CreateTaskDialog.tsx'), 'utf8');

    expect(source).toContain('mainAgents.length === 0');
    expect(source).toContain('请先创建或打开一个主会话');
  });

  it('keeps task name separate from the prompt sent to the agent', () => {
    const source = readFileSync(join(currentDir, 'CreateTaskDialog.tsx'), 'utf8');

    expect(source).toContain('id="task-prompt"');
    expect(source).toContain('prompt.trim()');
    expect(source).not.toContain('prompt: name.trim()');
  });
});
