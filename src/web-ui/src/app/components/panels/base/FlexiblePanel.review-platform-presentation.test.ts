// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./FlexiblePanel.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function reviewPlatformCasesSource(): string {
  const start = source.indexOf("case 'review-platform':");
  const end = source.indexOf("case 'browser':", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('FlexiblePanel Review Platform presentation boundary', () => {
  it('only forwards the existing activity signal to both retained panel variants', () => {
    const reviewPlatformCases = reviewPlatformCasesSource();

    expect(reviewPlatformCases.match(/isActive=\{isActive\}/g)).toHaveLength(2);
    expect(reviewPlatformCases).not.toContain('cancelSession');
    expect(reviewPlatformCases).not.toContain('FlowChatStore');
    expect(reviewPlatformCases).not.toContain('reviewPlatformAPI');
    expect(reviewPlatformCases).not.toMatch(/isActive\s*\?/);
  });
});
