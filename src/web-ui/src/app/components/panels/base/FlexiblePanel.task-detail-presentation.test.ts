// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./FlexiblePanel.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function taskDetailCaseSource(): string {
  const start = source.indexOf("case 'task-detail':");
  const end = source.indexOf("case 'plan-viewer':", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('FlexiblePanel TaskDetail presentation boundary', () => {
  it('only forwards the existing activity signal to the mounted TaskDetailPanel', () => {
    const taskDetailCase = taskDetailCaseSource();

    expect(taskDetailCase).toContain('<TaskDetailPanel data={taskDetailData} isActive={isActive} />');
    expect(taskDetailCase).not.toContain('cancelSession');
    expect(taskDetailCase).not.toContain('FlowChatStore');
    expect(taskDetailCase).not.toContain('FlowChatPresentationActivityProvider');
    expect(taskDetailCase).not.toMatch(/isActive\s*\?/);
  });
});
