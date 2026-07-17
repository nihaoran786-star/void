import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readNotificationItemStylesheet(): string {
  return readFileSync(
    fileURLToPath(new URL('./NotificationItem.scss', import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('NotificationItem theme contract', () => {
  it('uses the shared primary-button surface in every interactive state', () => {
    const stylesheet = readNotificationItemStylesheet();

    expect(stylesheet).toContain(
      "@use '../../../component-library/styles/btn-primary-tokens.scss' as btn-primary;",
    );
    expect(stylesheet).toContain('@include btn-primary.btn-primary-surface-default;');
    expect(stylesheet).toContain('@include btn-primary.btn-primary-surface-hover;');
    expect(stylesheet).toContain('@include btn-primary.btn-primary-surface-active;');
  });

  it('does not delay the shared focus ring with transition-all', () => {
    const stylesheet = readNotificationItemStylesheet();

    expect(stylesheet).not.toContain('transition: all');
    expect(stylesheet).toContain('background $motion-base $easing-standard');
    expect(stylesheet).toContain('transform $motion-base $easing-standard');
  });
});
