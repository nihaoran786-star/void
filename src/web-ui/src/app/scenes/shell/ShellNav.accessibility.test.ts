import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./ShellNav.tsx', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('ShellNav accessibility contract', () => {
  it('names both icon-only terminal creation actions', () => {
    expect(source).toContain(
      "aria-label={t('nav.shell.actions.newTerminal')}",
    );
    expect(source).toContain("aria-label={t('actions.more')}");
    expect(source).toContain('<Plus size={14} aria-hidden="true" />');
    expect(source).toContain(
      '<ChevronDown size={12} aria-hidden="true" />',
    );
  });
});
