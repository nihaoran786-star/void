import { describe, expect, it } from 'vitest';
import { getShortcutDescriptionI18nKey } from './shortcuts';

describe('shortcut description translations', () => {
  it('maps development-only shortcuts to settings translation keys', () => {
    expect(getShortcutDescriptionI18nKey('debug.toggleInspector')).toBe(
      'keyboard.shortcuts.debug.toggleInspector',
    );
    expect(getShortcutDescriptionI18nKey('debug.openDevTools')).toBe(
      'keyboard.shortcuts.debug.openDevTools',
    );
  });
});
