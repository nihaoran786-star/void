import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readNotificationStylesheet(): string {
  return readFileSync(
    fileURLToPath(new URL('./NotificationContainer.scss', import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('NotificationContainer responsive layout', () => {
  it('keeps notification cards within the viewport', () => {
    const stylesheet = readNotificationStylesheet();

    expect(stylesheet).toContain('width: min(320px, calc(100vw - 32px));');
    expect(stylesheet).toContain('max-width: calc(100vw - 32px);');
    expect(stylesheet).toContain('align-items: stretch;');
  });

  it('moves zoomed desktop notifications to one content edge', () => {
    const stylesheet = readNotificationStylesheet();
    const zoomedDesktopRules = stylesheet.split('@media (max-width: 1024px)')[1] ?? '';

    expect(zoomedDesktopRules).toContain('left: auto;');
    expect(zoomedDesktopRules).toContain('right: 12px;');
    expect(zoomedDesktopRules).toContain('width: min(320px, calc(100vw - 24px));');
    expect(zoomedDesktopRules).toContain('width: 100%;');
    expect(zoomedDesktopRules).toContain('min-width: 0;');
  });

  it('stacks actions on genuinely narrow viewports', () => {
    const stylesheet = readNotificationStylesheet();
    const narrowRules = stylesheet.split('@media (max-width: 480px)')[1] ?? '';

    expect(narrowRules).toContain('left: 12px;');
    expect(narrowRules).toContain('right: 12px;');
    expect(narrowRules).toContain('flex-direction: column;');
    expect(narrowRules).toContain('align-items: stretch;');
  });
});
