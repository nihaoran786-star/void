import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const readSource = (file: string) =>
  fs.readFileSync(new URL(file, import.meta.url), 'utf8');

describe('ArchivedSessionsConfig empty presentation', () => {
  it('keeps the empty state compact without duplicating the page hierarchy', () => {
    const source = readSource('./ArchivedSessionsConfig.tsx');
    const styles = readSource('./ArchivedSessionsConfig.scss');

    expect(source).not.toContain('Inbox');
    expect(source).toContain(
      '<div className="archived-sessions-config__empty">',
    );
    expect(source).toContain(
      "<span>{t('nav.sessions.noArchivedSessions')}</span>",
    );
    expect(source).toContain('{headerExtra}');
    expect(source).toContain("aria-label={t('actions.refresh')}");
    expect(source).toContain("title={t('actions.refresh')}");
    expect(source).not.toContain('aria-label="Refresh"');
    expect(styles).toMatch(
      /&__empty\s*\{[\s\S]*?justify-content:\s*flex-start;/,
    );
  });
});
