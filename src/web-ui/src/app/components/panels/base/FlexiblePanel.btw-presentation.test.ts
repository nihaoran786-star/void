// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./FlexiblePanel.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function btwSessionCaseSource(): string {
  const start = source.indexOf("case 'btw-session':");
  const end = source.indexOf("case 'session-usage':", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('FlexiblePanel BTW presentation boundary', () => {
  it('only forwards the existing activity signal to BtwSessionPanel', () => {
    const btwSessionCase = btwSessionCaseSource();

    expect(btwSessionCase).toContain('isActive={isActive}');
    expect(btwSessionCase).toContain('getShortDramaStageDisplayTitle');
    expect(btwSessionCase).toContain('presentationTitle={stageTitle ?? undefined}');
    expect(btwSessionCase).toContain('showKindBadge={stageTitle === null}');
    expect(btwSessionCase).not.toContain('cancelSession');
    expect(btwSessionCase).not.toContain('FlowChatStore');
    expect(btwSessionCase).not.toContain('FlowChatPresentationActivityProvider');
    expect(btwSessionCase).not.toMatch(/isActive\s*\?/);
  });
});
