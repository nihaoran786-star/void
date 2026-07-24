import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readNavPanelStylesheet(): string {
  const stylesheet = readFileSync(
    fileURLToPath(new URL('./NavPanel.scss', import.meta.url)),
    'utf8',
  );
  return stylesheet.replace(/\r\n/g, '\n');
}

function readMinimalNavPanelStylesheet(): string {
  const stylesheet = readFileSync(
    fileURLToPath(new URL('./NavPanel.minimal.scss', import.meta.url)),
    'utf8',
  );
  return stylesheet.replace(/\r\n/g, '\n');
}

function readWorkspaceTokensStylesheet(): string {
  return readFileSync(
    fileURLToPath(new URL('../../../component-library/styles/tokens.scss', import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

function readMainNavSource(): string {
  return readFileSync(
    fileURLToPath(new URL('./MainNav.tsx', import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

function readSessionCreateLauncherSource(): string {
  return readFileSync(
    fileURLToPath(
      new URL('./components/SessionCreateLauncher.tsx', import.meta.url),
    ),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

function readPersistentFooterActionsSource(): string {
  return readFileSync(
    fileURLToPath(
      new URL('./components/PersistentFooterActions.tsx', import.meta.url),
    ),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

function extractBlock(stylesheet: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\n\\s*\\}`));
  return match?.groups?.body ?? '';
}

describe('NavPanel layout styles', () => {
  it('allows navigation list wrappers to shrink instead of inheriting long item widths', () => {
    const stylesheet = readNavPanelStylesheet();
    const rootBlock = extractBlock(stylesheet, '.void-nav-panel');
    const contentBlock = extractBlock(stylesheet, '&__content');
    const mainLayerBlock = extractBlock(stylesheet, '&--main');
    const collapsibleBlock = extractBlock(stylesheet, '&__collapsible');
    const collapsibleInnerBlock = extractBlock(stylesheet, '&__collapsible-inner');
    const itemsBlock = extractBlock(stylesheet, '&__items');

    for (const block of [
      rootBlock,
      contentBlock,
      mainLayerBlock,
      collapsibleBlock,
      collapsibleInnerBlock,
      itemsBlock,
    ]) {
      expect(block).toContain('min-width: 0;');
      expect(block).toContain('max-width: 100%;');
    }
  });

  it('keeps root navigation rows close to the panel edge', () => {
    const stylesheet = readNavPanelStylesheet();
    const sectionHeaderBlock = extractBlock(stylesheet, '&__section-header');
    const itemsBlock = extractBlock(stylesheet, '&__items');

    expect(itemsBlock).toContain('padding: 2px $size-gap-1;');
    expect(sectionHeaderBlock).toContain('margin: 0 $size-gap-1;');
  });

  it('lets the sections rail shrink and scroll inside short windows', () => {
    const stylesheet = readNavPanelStylesheet();
    const sectionsBlock = extractBlock(stylesheet, '&__sections');

    expect(sectionsBlock).toContain('flex: 1 1 auto;');
    expect(sectionsBlock).toContain('min-height: 0;');
    expect(sectionsBlock).toContain('overflow-y: auto;');
  });

  it('clips collapsible content so expanded rows cannot overlap following sections', () => {
    const stylesheet = readNavPanelStylesheet();
    const collapsibleBlock = extractBlock(stylesheet, '&__collapsible');
    const collapsibleInnerBlock = extractBlock(stylesheet, '&__collapsible-inner');

    expect(collapsibleBlock).toContain('display: grid;');
    expect(collapsibleBlock).toContain('grid-template-rows: 1fr;');
    expect(stylesheet).toContain('&.is-collapsed {\n      grid-template-rows: 0fr;');
    expect(collapsibleInnerBlock).toContain('overflow: hidden;');
    expect(collapsibleInnerBlock).toContain('min-height: 0;');
  });

  it('uses one shared row-action size for root action buttons', () => {
    const stylesheet = readNavPanelStylesheet();
    const rootBlock = extractBlock(stylesheet, '.void-nav-panel');
    const sectionActionBlock = extractBlock(stylesheet, '&__section-action');
    const itemActionBlock = extractBlock(stylesheet, '&__item-action');

    expect(rootBlock).toContain('--void-nav-row-action-size: 20px;');
    expect(rootBlock).toContain('--void-nav-row-action-icon-size: 13px;');
    expect(rootBlock).toContain('--void-nav-row-action-offset: 4px;');
    expect(rootBlock).toContain('--void-nav-row-action-gap: 4px;');
    for (const block of [sectionActionBlock, itemActionBlock]) {
      expect(block).toContain('width: var(--void-nav-row-action-size);');
      expect(block).toContain('height: var(--void-nav-row-action-size);');
    }
    expect(sectionActionBlock).toContain('svg {');
    expect(sectionActionBlock).toContain('width: var(--void-nav-row-action-icon-size);');
    expect(sectionActionBlock).toContain('height: var(--void-nav-row-action-icon-size);');
  });

  it('keeps mode selection in Classic while Minimal exposes one independent task action', () => {
    const mainNavSource = readMainNavSource();
    const launcherSource = readSessionCreateLauncherSource();

    expect(mainNavSource).toContain('<SessionCreateLauncher');
    expect(mainNavSource).toContain('onSelectMode={setSessionMode}');
    expect(mainNavSource).toContain('onCreate={handleCreateTask}');
    expect(launcherSource).toContain("if (presentation === 'classic')");
    expect(launcherSource.match(/role="radiogroup"/g)).toHaveLength(1);
    expect(launcherSource.match(/void-nav-panel__session-mode-switch/g)?.length)
      .toBeGreaterThanOrEqual(1);
    expect(
      launcherSource.slice(launcherSource.indexOf("if (presentation === 'classic')")),
    ).toContain('void-nav-panel__session-mode-switch');
    expect(launcherSource).toContain('onClick={onCreate}');
    expect(launcherSource).not.toContain('void-nav-panel__session-mode-menu-trigger');
    expect(launcherSource).not.toContain("import('./SessionModeMenu')");
    expect(launcherSource).not.toContain('const SelectedIcon');
    expect(launcherSource).not.toContain(
      'void-nav-panel__session-create-action-icon',
    );
    expect(launcherSource).not.toContain('flowChatManager');
  });

  it('styles the session mode switcher as a compact three-option segmented control', () => {
    const stylesheet = readNavPanelStylesheet();
    const createBlock = extractBlock(stylesheet, '.void-nav-panel__session-create');
    const switchBlock = extractBlock(stylesheet, '.void-nav-panel__session-mode-switch');
    const indicatorBlock = extractBlock(stylesheet, '.void-nav-panel__session-mode-indicator');
    const optionBlock = extractBlock(stylesheet, '.void-nav-panel__session-mode-option');

    expect(createBlock).toContain('border: 1px solid var(--border-subtle);');
    expect(createBlock).toContain('overflow: hidden;');
    expect(switchBlock).toContain('position: relative;');
    expect(switchBlock).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(switchBlock).toContain('height: 34px;');
    expect(switchBlock).toContain('border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 76%, transparent);');
    expect(switchBlock).toContain('background: transparent;');
    expect(indicatorBlock).toContain('position: absolute;');
    expect(stylesheet).toContain('.void-nav-panel__session-mode-switch.is-mode-code .void-nav-panel__session-mode-indicator');
    expect(stylesheet).toContain('transform: translateX(0);');
    expect(stylesheet).toContain('.void-nav-panel__session-mode-switch.is-mode-cowork .void-nav-panel__session-mode-indicator');
    expect(stylesheet).toContain('transform: translateX(calc(100% + var(--session-mode-gap)));');
    expect(stylesheet).toContain('.void-nav-panel__session-mode-switch.is-mode-media .void-nav-panel__session-mode-indicator');
    expect(stylesheet).toContain('transform: translateX(calc(200% + var(--session-mode-gap) + var(--session-mode-gap)));');
    expect(indicatorBlock).toContain('transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1),');
    expect(optionBlock).toContain('height: 100%;');
    expect(optionBlock).toContain('white-space: nowrap;');
    expect(optionBlock).toContain('background: transparent;');
    expect(stylesheet).toContain('.void-nav-panel__session-mode-option span');
    expect(stylesheet).toContain('max-width: 0;');
    expect(stylesheet).toContain('&.is-active {\n    color: var(--color-text-primary);');
    expect(stylesheet).toContain('max-width: 48px;');
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('renders the minimal empty workspace message as quiet metadata, not a selected row', () => {
    const stylesheet = readMinimalNavPanelStylesheet();
    const emptyStateBlock = extractBlock(stylesheet, '&__workspace-list-empty');

    expect(emptyStateBlock).toContain('min-height: 28px;');
    expect(emptyStateBlock).toContain('background: transparent;');
    expect(emptyStateBlock).toContain('color: var(--workspace-text-muted);');
    expect(emptyStateBlock).toContain('font-size: var(--workspace-font-size-meta);');
    expect(emptyStateBlock).toContain('font-weight: var(--workspace-font-weight-regular);');
    expect(emptyStateBlock).not.toContain('var(--workspace-surface-active)');
  });

  it('projects search into a compact split launcher while preserving Classic markup', () => {
    const baseStylesheet = readNavPanelStylesheet();
    const stylesheet = readMinimalNavPanelStylesheet();
    const tokenStylesheet = readWorkspaceTokensStylesheet();
    const source = readMainNavSource();
    const launcherSource = readSessionCreateLauncherSource();
    const footerBlock = extractBlock(baseStylesheet, '.void-nav-panel__session-create-footer');
    const minimalCreateBlock = extractBlock(stylesheet, '&__session-create');
    const minimalFooterBlock = extractBlock(stylesheet, '&__session-create-footer');
    const searchSlotBlock = extractBlock(stylesheet, '&__session-search-slot');
    const searchTriggerBlock = extractBlock(stylesheet, '&__search-trigger');
    const topActionsBlock = extractBlock(stylesheet, '&__top-actions');
    const topActionButtonBlock = extractBlock(stylesheet, '&__top-action-btn');
    const inlineItemBlock = extractBlock(stylesheet, '&__inline-item');
    const topActionIconBlock = extractBlock(stylesheet, '&__top-action-icon-slot');
    const expandIconsBlock = extractBlock(stylesheet, '&__top-action-expand-icons');
    const expandDefaultIconBlock = extractBlock(
      stylesheet,
      '&__top-action-expand-icon-default',
    );
    const expandChevronBlock = extractBlock(
      stylesheet,
      '&__top-action-expand-icon-chevron',
    );

    expect(source.match(/className="void-nav-panel__search-trigger"/g)).toHaveLength(1);
    expect(source.match(/<NavSearchDialog open=\{searchOpen\}/g)).toHaveLength(1);
    expect(source).toContain(
      "const NavSearchDialog = React.lazy(() => import('./NavSearchDialog'));",
    );
    expect(source).not.toContain("import NavSearchDialog from './NavSearchDialog'");
    expect(source).toContain('<React.Suspense fallback={null}>');
    expect(source).toContain('searchOpen ? (');
    expect(source).toContain('const searchTrigger = (');
    expect(source).toContain(
      "workspacePresentation === 'classic' ? (\n        <div className=\"void-nav-panel__brand-header\">",
    );
    expect(source).toContain(
      "searchTrigger={workspacePresentation === 'minimal' ? searchTrigger : undefined}",
    );
    expect(source.lastIndexOf('<NavSearchDialog open={searchOpen}'))
      .toBeGreaterThan(source.indexOf('{workspaceMenuPortal}'));
    expect(source).toMatch(
      /<button\s+type="button"\s+className="void-nav-panel__search-trigger"/,
    );

    expect(footerBlock).toContain('display: contents;');
    expect(minimalCreateBlock).toContain('display: grid;');
    expect(minimalCreateBlock).toContain(
      'grid-template-columns: minmax(0, 1fr) 28px;',
    );
    expect(minimalCreateBlock).toContain('gap: 4px 2px;');
    expect(minimalCreateBlock).not.toContain('height: 28px;');
    expect(minimalCreateBlock).toContain('border: 0;');
    expect(minimalCreateBlock).toContain('border-radius: 0;');
    expect(minimalCreateBlock).toContain('background: transparent;');
    expect(minimalCreateBlock).toContain('overflow: visible;');
    expect(minimalFooterBlock).toContain('display: contents;');
    expect(stylesheet).toContain(
      '&__session-create-action {\n      grid-template-columns: 18px minmax(0, 1fr);\n      gap: var(--workspace-space-1);\n      width: 100%;\n      height: 36px;',
    );
    expect(stylesheet).not.toContain('&__session-mode-switch');
    expect(stylesheet).not.toContain('&__session-mode-indicator');
    expect(stylesheet).not.toContain('&__session-mode-option');
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).not.toContain('&__session-mode-menu-trigger');
    expect(stylesheet).not.toContain(
      '.void-ui--minimal .void-nav-panel__session-mode-menu',
    );
    expect(searchSlotBlock).toContain('width: 28px;');
    expect(searchSlotBlock).toContain('min-width: 28px;');
    expect(searchSlotBlock).toContain('height: 28px;');
    expect(searchSlotBlock).toContain('border-left: 0;');
    expect(searchTriggerBlock).toContain('width: var(--workspace-icon-target);');
    expect(searchTriggerBlock).toContain('height: var(--workspace-icon-target);');
    expect(searchTriggerBlock).toContain('justify-content: center;');
    expect(searchTriggerBlock).toContain('padding: 0;');
    expect(searchTriggerBlock).toContain('cursor: pointer;');
    expect(stylesheet).not.toContain('&__search-trigger__label');
    expect(source).toContain(
      "workspacePresentation === 'classic' ? (\n          <span className=\"void-nav-panel__search-trigger__label\">",
    );
    expect(source.match(/className="void-nav-panel__search-trigger__label"/g))
      .toHaveLength(1);
    expect(topActionIconBlock).toContain('display: inline-flex;');
    expect(expandIconsBlock).toContain('order: 2;');
    expect(expandIconsBlock).toContain('margin-left: auto;');
    expect(expandDefaultIconBlock).toContain('display: none;');
    expect(expandChevronBlock).toContain('opacity: 1;');
    expect(stylesheet).toContain('&__search-trigger:focus-visible');
    expect(stylesheet).not.toContain('&__brand-header');
    expect(stylesheet).not.toContain('&__brand-search');
    expect(tokenStylesheet).toContain('--control-square-sm: 28px;');
    expect(tokenStylesheet).toContain('--workspace-icon-target: var(--control-square-sm);');
    expect(source).toContain('className="void-nav-panel__search-trigger"');
    expect(source).toContain("aria-label={t('nav.search.triggerTooltip')}");
    expect(source).toContain('<NavSearchDialog open={searchOpen}');
    expect(source).toContain('onCreate={handleCreateTask}');
    expect(source).toContain('onSelectMode={setSessionMode}');
    expect(launcherSource).not.toContain('const SelectedIcon');
    expect(launcherSource).not.toContain(
      'void-nav-panel__session-create-action-icon',
    );
    expect(topActionsBlock).toContain('gap: 2px;');
    expect(topActionsBlock).toContain(
      'padding: 8px var(--workspace-space-2) 10px;',
    );
    expect(topActionButtonBlock).toContain('height: 28px;');
    expect(topActionButtonBlock).toContain('min-height: 28px;');
    expect(inlineItemBlock).toContain('background: transparent;');
    expect(stylesheet).toContain(
      '.void-nav-panel__inline-item-icon:not(.is-running) {\n    color: var(--workspace-text-muted);\n    opacity: 0.32;',
    );
    expect(stylesheet).toContain(
      '.void-nav-panel__inline-item.is-active\n    .void-nav-panel__inline-item-icon:not(.is-running) {\n    color: inherit;\n    opacity: 0.82;',
    );
    expect(stylesheet).toContain(
      '.void-nav-panel__inline-item-icon.is-running {\n    color: var(--workspace-text-secondary);\n    opacity: 1;',
    );
    expect(stylesheet).not.toContain('transition: all');
  });

  it('progressively discloses low-frequency footer actions only in Minimal', () => {
    const baseStylesheet = readNavPanelStylesheet();
    const minimalStylesheet = readMinimalNavPanelStylesheet();
    const source = readPersistentFooterActionsSource();
    const classicMenuOnlyBlock = extractBlock(
      baseStylesheet,
      '.void-nav-panel__footer-menu-item--minimal-only',
    );
    const minimalQuickActionBlock = extractBlock(
      minimalStylesheet,
      '&__footer-quick-action',
    );
    const minimalMenuOnlyBlock = extractBlock(
      minimalStylesheet,
      '&__footer-menu-item--minimal-only',
    );

    expect(classicMenuOnlyBlock).toContain('display: none;');
    expect(minimalQuickActionBlock).toContain('display: none;');
    expect(minimalMenuOnlyBlock).toContain('display: flex;');
    expect(source.match(/void-nav-panel__footer-quick-action/g)).toHaveLength(2);
    expect(source).toContain('data-testid="minimal-footer-shell-menu-item"');
    expect(source).toContain('data-testid="minimal-footer-browser-menu-item"');
    expect(source).toContain('onClick={handleOpenShellFromMenu}');
    expect(source).toContain('onClick={handleOpenBrowserFromMenu}');
    expect(source).toContain('handleOpenShell();');
    expect(source).toContain('handleOpenBrowser();');
  });
});
