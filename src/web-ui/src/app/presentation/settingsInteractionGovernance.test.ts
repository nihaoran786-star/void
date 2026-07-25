import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const keyboardShortcutsSource = readFileSync(
  new URL('../scenes/settings/components/KeyboardShortcutsTab.scss', import.meta.url),
  'utf8',
);

const keyboardShortcutsComponent = readFileSync(
  new URL('../scenes/settings/components/KeyboardShortcutsTab.tsx', import.meta.url),
  'utf8',
);

const archivedSessionsSource = readFileSync(
  new URL('../scenes/settings/components/ArchivedSessionsConfig.scss', import.meta.url),
  'utf8',
);

const configComponentStyles = readdirSync(
  new URL('../../infrastructure/config/components/', import.meta.url),
  { withFileTypes: true },
)
  .filter(entry => entry.isFile() && entry.name.endsWith('.scss'))
  .map(entry => ({
    name: entry.name,
    source: readFileSync(
      new URL(`../../infrastructure/config/components/${entry.name}`, import.meta.url),
      'utf8',
    ),
  }));

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

  it('names shortcut recording controls and exposes their capture state', () => {
    expect(keyboardShortcutsComponent).toContain(
      "t('keyboard.editBindingAria', { action, binding })",
    );
    expect(keyboardShortcutsComponent).toContain(
      "t('keyboard.recordingBindingAria', { action })",
    );
    expect(keyboardShortcutsComponent.match(/aria-pressed=/g)).toHaveLength(3);
  });

  it('flattens repeated shortcut panels and promotes coarse targets', () => {
    expect(keyboardShortcutsSource).toMatch(
      /\.void-ui--minimal \.kb-shortcuts[\s\S]*?\.void-config-page-section__body\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/,
    );
    expect(keyboardShortcutsSource).toContain('content-visibility: auto;');
    expect(keyboardShortcutsSource).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?min-height: var\(--workspace-touch-target\);[\s\S]*?touch-action: manipulation;/,
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

  it('keeps config component motion constrained to explicit properties', () => {
    const unrestrictedTransitions = configComponentStyles.flatMap(({ name, source }) =>
      [...source.matchAll(/transition\s*:\s*all\b/g)].map(() => name),
    );

    expect(unrestrictedTransitions).toEqual([]);
  });
});
