import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(name, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('SceneBar accessibility contract', () => {
  it('uses localized labels for the tab list and close actions', () => {
    const barSource = readSource('./SceneBar.tsx');
    const tabSource = readSource('./SceneTab.tsx');

    expect(barSource).toContain("aria-label={t('sceneTabs.label')}");
    expect(barSource).toContain(
      "closeTitle={t('sceneTabs.close', { label: translatedLabel })}",
    );
    expect(tabSource).toContain('closeTitle: string;');
    expect(tabSource).toContain('aria-label={closeTitle}');
    expect(tabSource).not.toContain('aria-label={`Close ${label}`}');
  });

  it('supports cyclic arrow navigation plus Home and End', () => {
    const source = readSource('./SceneBar.tsx');

    for (const contract of [
      "'ArrowLeft', 'ArrowRight', 'Home', 'End'",
      'e.preventDefault();',
      '(currentIndex - 1 + openTabs.length) % openTabs.length',
      '(currentIndex + 1) % openTabs.length',
      'activateScene(nextTab.id);',
      "querySelectorAll<HTMLElement>('[role=\"tab\"]')[nextIndex]?.focus();",
      'onKeyDown={handleTabsKeyDown}',
    ]) {
      expect(source).toContain(contract);
    }
  });
});
