// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./FlexiblePanel.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function terminalCaseSource(): string {
  const start = source.indexOf("case 'terminal':");
  const end = source.indexOf("case 'btw-session':", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('FlexiblePanel terminal presentation boundary', () => {
  it('only forwards the existing activity signal to the mounted terminal', () => {
    const terminalCase = terminalCaseSource();

    expect(terminalCase).toContain('isActive={isActive}');
    expect(terminalCase).not.toContain('closeSession');
    expect(terminalCase).not.toContain('TerminalService');
    expect(terminalCase).not.toMatch(/isActive\s*\?/);
  });
});
