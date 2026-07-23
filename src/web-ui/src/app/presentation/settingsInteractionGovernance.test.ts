import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const keyboardShortcutsSource = readFileSync(
  new URL('../scenes/settings/components/KeyboardShortcutsTab.scss', import.meta.url),
  'utf8',
);

const archivedSessionsSource = readFileSync(
  new URL('../scenes/settings/components/ArchivedSessionsConfig.scss', import.meta.url),
  'utf8',
);

describe('settings interaction governance', () => {
  it('uses semantic status and control tokens for shortcut feedback', () => {
    expect(keyboardShortcutsSource).toContain('var(--status-error-bg)');
    expect(keyboardShortcutsSource).toContain('var(--status-warning-bg)');
    expect(keyboardShortcutsSource).toContain('var(--control-focus-ring)');
    expect(keyboardShortcutsSource).not.toMatch(
      /(?:#ef4444|#f59e0b|rgba\(99,\s*102,\s*241|rgba\(239,\s*68,\s*68)/,
    );
  });

  it('keeps shortcut controls keyboard-visible and motion-safe', () => {
    expect(keyboardShortcutsSource).toMatch(
      /&__keybadge\s*\{[\s\S]*?&:focus-visible\s*\{[\s\S]*?var\(--control-focus-ring\)/,
    );
    expect(keyboardShortcutsSource).toMatch(
      /&__revert-btn\s*\{[\s\S]*?&:focus-visible\s*\{[\s\S]*?var\(--control-focus-ring\)/,
    );
    expect(keyboardShortcutsSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?&__keybadge--recording\s*\{[\s\S]*?animation:\s*none/,
    );
  });

  it('reveals archived-session actions for keyboard and coarse-pointer users', () => {
    expect(archivedSessionsSource).toMatch(
      /&:focus-within\s*\{[\s\S]*?\.archived-sessions-config__row-actions\s*\{[\s\S]*?opacity:\s*1/,
    );
    expect(archivedSessionsSource).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?__row-actions\s*\{[\s\S]*?opacity:\s*1/,
    );
  });

  it('uses semantic destructive feedback and disables transitions for reduced motion', () => {
    expect(archivedSessionsSource).toContain('var(--status-error-text)');
    expect(archivedSessionsSource).toContain('var(--status-error-bg)');
    expect(archivedSessionsSource).not.toMatch(/(?:#ef4444|rgba\(239,\s*68,\s*68)/);
    expect(archivedSessionsSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?&__row-actions\s*\{[\s\S]*?transition:\s*none/,
    );
  });
});
