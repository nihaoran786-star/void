import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = () => readFileSync(
  fileURLToPath(new URL('./ChatInput.tsx', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

const readSkillsSubmenuSource = () => readFileSync(
  fileURLToPath(new URL('./BoostSkillsSubmenu.tsx', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('ChatInput accessibility contract', () => {
  it('exposes every stop-generation action as a named native button', () => {
    const source = readSource();
    const cancelButtons = source.match(
      /<button[\s\S]*?aria-label=\{t\('input\.stopGeneration'\)\}[\s\S]*?data-testid="chat-input-cancel-btn"[\s\S]*?<\/button>/g,
    );

    expect(cancelButtons).toHaveLength(2);
  });

  it('gives the primary composer the localized accessible name', () => {
    const source = readSource();

    expect(source).toContain("aria-label={t('input.placeholder')}");
  });

  it('keeps the Skills flyout reachable and navigable from the keyboard', () => {
    const source = readSkillsSubmenuSource();

    expect(source).toContain('ref={triggerRef}');
    expect(source).toContain('aria-controls={menuId}');
    expect(source).toContain('onKeyDown={handleKeyDown}');
    expect(source).toContain('data-skills-flyout-item');
    expect(source).toContain('closeImmediately(true)');
  });
});
