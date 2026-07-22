import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSibling = (relativePath: string): string => readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('ToolbarMode accessibility contract', () => {
  it('names every compact icon action and text input with existing translations', () => {
    const source = readSibling('./ToolbarMode.tsx');
    const requiredNames = [
      'toolCards.toolbar.openSessionMenu',
      'toolCards.toolbar.moreMenu',
      'toolCards.toolbar.expandChat',
      'toolCards.toolbar.inputMessage',
      'session.restoreMain',
      'input.placeholder',
      'input.send',
      'input.stop',
      'input.collapseInput',
      'input.expandInput',
      'toolCards.common.confirm',
      'toolCards.common.cancel',
    ];

    for (const key of requiredNames) {
      expect(source).toContain(`aria-label={t('${key}')}`);
    }

    const buttons = source.match(/<button\b[\s\S]*?>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button).toContain('type="button"');
    }

    const icons = source.match(
      /<(?:MessageSquare|Square|Check|X|ArrowUp|Maximize2|MoreVertical|PanelTopOpen|PanelTopClose|Plus)\b[^>]*>/g,
    ) ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon).toContain('aria-hidden="true"');
    }
  });

  it('connects disclosure controls to explicit listbox and menu state', () => {
    const source = readSibling('./ToolbarMode.tsx');

    expect(source).toContain(
      "const TOOLBAR_SESSION_LIST_ID = 'void-toolbar-mode-session-listbox';",
    );
    expect(source).toContain(
      "const TOOLBAR_OVERFLOW_MENU_ID = 'void-toolbar-mode-overflow-menu';",
    );
    expect(source).toContain('aria-controls={TOOLBAR_SESSION_LIST_ID}');
    expect(source).toContain('aria-controls={TOOLBAR_OVERFLOW_MENU_ID}');
    expect(source).toContain('id={TOOLBAR_SESSION_LIST_ID}');
    expect(source).toContain('id={TOOLBAR_OVERFLOW_MENU_ID}');
    expect(source).toContain('aria-haspopup="listbox"');
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('role="option"');
    expect(source).toContain(
      'aria-selected={session.sessionId === flowChatState.activeSessionId}',
    );
  });

  it('uses the canonical focus token without broad transitions', () => {
    const styles = readSibling('./ToolbarMode.scss');
    const focusRing =
      'outline: 2px solid var(--control-focus-ring, var(--color-accent-500));';

    expect(styles).not.toMatch(/transition:\s*all\b/);
    expect(styles).toContain('@mixin toolbar-focus-ring($offset)');
    expect(styles).toContain(focusRing);
    expect(styles.match(/@include toolbar-focus-ring\(/g)).toHaveLength(5);
    expect(styles).toMatch(
      /\.void-toolbar-mode__create-btn\s*\{[\s\S]*?@include toolbar-focus-ring\(2px\);/,
    );
    expect(styles).toMatch(
      /\.void-toolbar-mode__session-item\s*\{[\s\S]*?@include toolbar-focus-ring\(-2px\);/,
    );
    expect(styles).toMatch(
      /\.void-toolbar-mode__overflow-menu-item\s*\{[\s\S]*?@include toolbar-focus-ring\(-2px\);/,
    );
    expect(styles).toMatch(
      /\.void-toolbar-mode__input-field\s*\{[\s\S]*?@include toolbar-focus-ring\(-2px\);/,
    );
    expect(styles).toMatch(
      /\.toolbar-btn\s*\{[\s\S]*?@include toolbar-focus-ring\(2px\);/,
    );
  });
});
