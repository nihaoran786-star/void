import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readStylesheet(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(name, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('AutomationScene minimal visual contract', () => {
  it('defines the legacy surface token consumed by the mode switcher', () => {
    const stylesheet = readStylesheet('./AutomationScene.scss');

    expect(stylesheet).toContain('--as-surface-2: var(--as-muted);');
    expect(stylesheet).toContain('background: var(--as-surface-2);');
  });

  it('projects automation surfaces and typography from workspace tokens', () => {
    const stylesheet = readStylesheet('./AutomationScene.minimal.scss');
    const themeBridge = readStylesheet('./AutomationScene.theme.scss');
    const compatibilityAliases = themeBridge.match(
      /^\s*--as-[a-z0-9-]+:/gm,
    ) ?? [];

    for (const declaration of [
      '--as-bg: var(--workspace-surface-canvas);',
      '--as-card: var(--workspace-surface-panel);',
      '--as-surface-2: var(--workspace-surface-panel);',
      '--as-fg: var(--workspace-text-primary);',
      '--as-border: var(--workspace-border-subtle);',
      '--as-ring: var(--workspace-focus-ring);',
      '--as-radius-sm: var(--workspace-radius-control);',
      '--as-shadow-md: var(--workspace-shadow-raised);',
      '--as-shadow-hairline: none;',
      '--as-font-size-meta: var(--workspace-font-size-meta);',
      '--as-font-size-label: var(--workspace-font-size-meta);',
      '--as-font-size-control: var(--workspace-font-size-label);',
      '--as-font-size-body: var(--workspace-font-size-control);',
      '--as-font-size-title: var(--workspace-font-size-body);',
      '--as-font-size-heading: var(--workspace-font-size-title);',
      '--as-font-weight-medium: var(--workspace-font-weight-medium);',
      '--as-font-weight-strong: var(--workspace-font-weight-strong);',
      '--as-p0-bg: var(--workspace-status-error-bg);',
      '--as-p1-bg: var(--workspace-status-warning-bg);',
      '--as-p2-fg-strong: var(--workspace-status-warning-text);',
      '--as-p3-bg: var(--workspace-status-neutral-bg);',
      '--as-now: var(--workspace-status-error-text);',
    ]) {
      expect(themeBridge).toContain(declaration);
    }

    expect(stylesheet).toContain(
      '@include automation-theme.workspaceTokens;',
    );
    expect(stylesheet).toContain(
      'font-family: var(--workspace-font-family);',
    );
    expect(compatibilityAliases).toHaveLength(50);
    expect(themeBridge).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(themeBridge).not.toMatch(/\brgba?\(/i);
  });

  it('centralizes the complete typography hierarchy without changing classic values', () => {
    const stylesheet = readStylesheet('./AutomationScene.scss');
    const consumerStyles = stylesheet.slice(stylesheet.indexOf('// Header'));

    for (const declaration of [
      '--as-font-size-meta: 10px;',
      '--as-font-size-micro: calc(var(--as-font-size-meta) - 1px);',
      '--as-font-size-label: 11px;',
      '--as-font-size-control: 12px;',
      '--as-font-size-body: 13px;',
      '--as-font-size-title: 14px;',
      '--as-font-size-heading: 16px;',
      '--as-font-size-lead: 17px;',
      '--as-font-size-display: 22px;',
      '--as-font-weight-medium: 500;',
      '--as-font-weight-strong: 600;',
    ]) {
      expect(stylesheet).toContain(declaration);
    }

    const expectedConsumerCounts = {
      micro: 1,
      meta: 20,
      label: 3,
      control: 23,
      body: 12,
      title: 2,
      heading: 1,
      lead: 1,
      display: 1,
    };
    for (const [role, count] of Object.entries(expectedConsumerCounts)) {
      expect(
        stylesheet.match(
          new RegExp(`font-size: var\\(--as-font-size-${role}\\);`, 'g'),
        ),
      ).toHaveLength(count);
    }
    expect(stylesheet.match(/font-weight: var\(--as-font-weight-medium\);/g))
      .toHaveLength(18);
    expect(stylesheet.match(/font-weight: var\(--as-font-weight-strong\);/g))
      .toHaveLength(9);
    expect(consumerStyles).not.toMatch(/font-size:\s*\d+(?:\.\d+)?px/);
    expect(consumerStyles).not.toMatch(/font-weight:\s*(?:500|600)\b/);
  });

  it('centralizes classic color literals before component consumers', () => {
    const stylesheet = readStylesheet('./AutomationScene.scss');
    const consumerStyles = stylesheet.slice(stylesheet.indexOf('// Header'));

    for (const declaration of [
      '--as-on-solid: var(--as-bg);',
      '--as-solid-hover: #1f2937;',
      '--as-overlay: rgba(0, 0, 0, 0.32);',
      '--as-fg-85: color-mix(in srgb, var(--as-fg) 85%, transparent);',
      '--as-muted-50: color-mix(in srgb, var(--as-muted) 50%, transparent);',
      '--as-border-60: color-mix(in srgb, var(--as-border) 60%, transparent);',
      '--as-p2-bg-soft: color-mix(in srgb, var(--as-p2-bg) 50%, transparent);',
      '--as-p2-fg-strong: #78350f;',
    ]) {
      expect(stylesheet).toContain(declaration);
    }

    expect(consumerStyles).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(consumerStyles).not.toMatch(/rgba?\(/i);
  });

  it('disables scene motion when the operating system requests less motion', () => {
    const stylesheet = readStylesheet('./AutomationScene.scss');

    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).toContain('scroll-behavior: auto !important;');
    expect(stylesheet).toContain('transition-duration: 0.01ms !important;');
    expect(stylesheet).toContain('animation-duration: 0.01ms !important;');
    expect(stylesheet).toContain('animation-iteration-count: 1 !important;');
  });

  it('keeps weekday task counts readable in the compact seven-column grid', () => {
    const stylesheet = readStylesheet('./AutomationScene.scss');
    const minimalStylesheet = readStylesheet('./AutomationScene.minimal.scss');
    const weekView = readStylesheet('./WeekView.tsx');
    const dayCountRule = stylesheet.match(
      /&__day-count\s*\{(?<body>[\s\S]*?)\n\s*\}/,
    )?.groups?.body;

    expect(dayCountRule).toBeTruthy();
    expect(dayCountRule).toContain('max-width: 100%;');
    expect(dayCountRule).toContain('overflow: hidden;');
    expect(dayCountRule).toContain('text-overflow: ellipsis;');
    expect(dayCountRule).toContain('white-space: nowrap;');
    expect(weekView).toContain('data-count={dayTasks.length}');
    expect(minimalStylesheet).toContain('@media (max-width: 1100px)');
    expect(minimalStylesheet).toContain(
      '.void-ui--minimal .week-view__day-count',
    );
    expect(minimalStylesheet).toContain('content: attr(data-count);');
    expect(minimalStylesheet).toContain(
      'font-size: var(--as-font-size-meta);',
    );
  });

  it('replaces fixed light calendar and detail colors in minimal mode', () => {
    const stylesheet = readStylesheet('./AutomationScene.minimal.scss');

    for (const declaration of [
      '.week-view__day-header--today,',
      '.month-view__cell--out {',
      '.week-view__date-num,',
      '.week-view__date-num--today,',
      '.week-view__hour-row,',
      '.task-detail-panel__prompt {',
      '.task-detail-panel__msg-bubble--tool {',
      '.create-task-dialog__mode-option--active {',
      'var(--workspace-surface-hover) 24%',
      'var(--workspace-surface-hover) 18%',
      'color: var(--workspace-text-primary);',
      'var(--workspace-border-subtle) 58%',
      'background: var(--workspace-surface-active);',
      'background: var(--workspace-surface-panel);',
      'border-left: 1px solid var(--workspace-status-warning-border);',
    ]) {
      expect(stylesheet).toContain(declaration);
    }

    expect(stylesheet).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(stylesheet).not.toMatch(/\brgba?\(/i);
  });

  it('keeps a compact wrapping header and progressively discloses filters', () => {
    const stylesheet = readStylesheet('./AutomationScene.minimal.scss');

    expect(stylesheet).toContain('min-height: 40px;');
    expect(stylesheet).toContain('height: auto;');
    expect(stylesheet).toContain('flex-wrap: wrap;');
    expect(stylesheet).toContain('outline-offset: -2px;');
    expect(stylesheet).toContain('&__view-switcher {');
    expect(stylesheet).toContain('border-color: transparent;');
    expect(stylesheet).toContain('background: transparent;');
    expect(stylesheet).toContain('&__filter-trigger {');
    expect(stylesheet).toContain('width: 28px;');
    expect(stylesheet).toContain('height: 28px;');
    expect(stylesheet).toContain('&__filters {\n      position: absolute;');
    expect(stylesheet).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(stylesheet).toContain(':where(button, input, select, summary, textarea):focus-visible');
    expect(stylesheet).not.toContain('@media (max-width: 1120px)');
    expect(stylesheet).toContain('@media (max-width: 720px)');

    const hiddenDeclarations = stylesheet.match(/\bdisplay:\s*none\b/g) ?? [];
    const openDisclosureRule =
      /&\[open\] > \.automation-header__filters\s*\{\s*display:\s*grid;\s*\}/;
    expect(stylesheet).toContain('&::-webkit-details-marker {');
    expect(stylesheet).toContain(
      '&:not([open]) > .automation-header__filters {',
    );
    expect(stylesheet).toMatch(openDisclosureRule);
    expect(stylesheet).toContain('.task-card__recurring-icon {');
    expect(stylesheet).toContain('.list-view__priority {');
    expect(stylesheet).toContain('.task-detail-panel__priority-dot {');
    expect(stylesheet).toContain('.task-detail-panel__artifact-icon {');
    expect(stylesheet).toContain('.task-detail-panel__msg-avatar {');
    expect(hiddenDeclarations).toHaveLength(9);
    expect(stylesheet).not.toMatch(/\bvisibility:\s*hidden\b/);
  });

  it('keeps the quiet grid and flattened detail sheet presentation-only', () => {
    const stylesheet = readStylesheet('./AutomationScene.minimal.scss');

    for (const declaration of [
      '.week-view__date-num {',
      'font-size: var(--workspace-font-size-control);',
      'var(--workspace-border-subtle) 72%',
      'var(--workspace-border-subtle) 68%',
      'var(--workspace-border-subtle) 58%',
      '.task-detail-panel__head {',
      'padding: var(--workspace-space-3);',
      '.task-detail-panel__close {',
      'width: 28px;',
      '.task-detail-panel__title {',
      'font-size: var(--workspace-font-size-body);',
      'overflow-wrap: anywhere;',
      '.list-view__row {',
      'border-bottom: 1px solid var(--workspace-border-subtle);',
      '.task-detail-panel__prompt {',
      'background: transparent;',
      '.task-detail-panel__artifact-list {',
      '.task-detail-panel__msg-bubble {',
      'border-left: 1px solid var(--workspace-status-warning-border);',
    ]) {
      expect(stylesheet).toContain(declaration);
    }
  });
});
