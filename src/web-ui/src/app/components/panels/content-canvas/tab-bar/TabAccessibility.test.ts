import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (name: string) => readFileSync(
  fileURLToPath(new URL(name, import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('canvas tab accessibility contract', () => {
  it('uses one named roving tab control without replacing native tab actions', () => {
    const source = readSource('./Tab.tsx');

    expect(source).toContain('className="canvas-tab__activation"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('aria-selected={isActive}');
    expect(source).toContain('tabIndex={isKeyboardTabStop ? 0 : -1}');
    expect(source).toContain('aria-label={t(\'tabs.unpin\')}');
    expect(source).toContain('aria-label={t(\'tabs.popOut\')}');
    expect(source).toContain('aria-label={t(\'tabs.close\')}');
    expect(source).toContain('onAuxClick={handleAuxClick}');
    expect(source).toContain('onDoubleClick={handleDoubleClick}');
    expect(source).toContain('draggable');
  });

  it('supports horizontal arrow, Home, and End navigation across visible tabs', () => {
    const source = readSource('./TabBar.tsx');

    expect(source).toContain('role="tablist"');
    expect(source).toContain("aria-label={t('tabs.openTabs')}");
    expect(source).toContain("'ArrowLeft', 'ArrowRight', 'Home', 'End'");
    expect(source).toContain('nextTab?.focus()');
    expect(source).toContain('nextTab?.click()');
  });
});
