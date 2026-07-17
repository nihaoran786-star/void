import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));

describe('SessionsSection automation marker', () => {
  it('renders a minimal automation marker from the stable session state', () => {
    const source = readFileSync(join(currentDir, 'SessionsSection.tsx'), 'utf8');

    expect(source).toContain('session.isAutomationSession');
    expect(source).toContain('void-nav-panel__inline-item-automation-badge');
    expect(source).toContain('CalendarClock');
  });

  it('keeps session activation and row actions independently keyboard reachable', () => {
    const source = readFileSync(join(currentDir, 'SessionsSection.tsx'), 'utf8');

    expect(source).toContain('void-nav-panel__inline-item-activation');
    expect(source).toContain("aria-current={isRowActive ? 'page' : undefined}");
    expect(source).toContain("aria-label={t('nav.sessions.moreActionsFor', { title: sessionTitle })}");
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('aria-expanded={openMenuSessionId === session.sessionId}');
  });
});
