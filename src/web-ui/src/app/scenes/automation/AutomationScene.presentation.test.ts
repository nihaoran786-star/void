// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./AutomationScene.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function sourceBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('AutomationScene presentation boundary', () => {
  it('pauses only the FlowChat presentation snapshot, not automation business work', () => {
    expect(source).toContain('const flowChatState = useAutomationFlowChatState(isActive);');

    const businessLifecycle = sourceBetween(
      'const loadJobs = useCallback',
      '\n  return (',
    );

    expect(businessLifecycle).not.toContain('isActive');
    expect(businessLifecycle).toContain('cronAPI.listJobs()');
    expect(businessLifecycle).toContain('cronAPI.createJob(');
    expect(businessLifecycle).toContain('cronAPI.deleteJob(');
    expect(businessLifecycle).toContain('cronAPI.updateJob(');
    expect(businessLifecycle).toContain('cronAPI.runJobNow(');
  });
});
