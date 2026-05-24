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
