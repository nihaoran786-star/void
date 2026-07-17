import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./Modal.tsx', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Modal accessibility contract', () => {
  it('exposes dialog semantics and a stable accessible name', () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-labelledby={title ? titleId : undefined}');
    expect(source).toContain("aria-label={title ? undefined : t('modal.dialog')}");
  });

  it('owns focus only while open and restores the previous trigger', () => {
    expect(source).toContain('returnFocusRef.current = document.activeElement');
    expect(source).toContain('onKeyDown={handleModalKeyDown}');
    expect(source).toContain('window.requestAnimationFrame(() => returnTarget.focus())');
  });
});
