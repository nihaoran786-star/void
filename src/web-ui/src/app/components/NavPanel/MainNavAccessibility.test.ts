import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSibling(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('MainNav workspace menu accessibility contract', () => {
  it('keeps the compact search and navigation disclosure named', () => {
    const source = readSibling('./MainNav.tsx');
    const minimalStyles = readSibling('./NavPanel.minimal.scss');

    expect(source).toContain("aria-label={t('nav.search.triggerTooltip')}");
    expect(source).toContain(
      '<span className="void-nav-panel__search-trigger__icon" aria-hidden="true">',
    );
    expect(source).toContain(
      '<span className="void-nav-panel__top-action-icon-slot" aria-hidden="true">',
    );
    expect(source).toContain(
      '<span className="void-nav-panel__top-action-expand-icons" aria-hidden="true">',
    );
    expect(source).toContain('aria-expanded={isExtensionsOpen}');
    expect(source).toContain('aria-controls="void-nav-panel-extensions"');
    expect(source).toContain('aria-label={extensionsLabel}');
    expect(source).toContain(
      "{workspacePresentation === 'minimal' ? (\n                <span className=\"void-nav-panel__top-action-icon-slot\" aria-hidden=\"true\">\n                  <NavTechExtensionsIcon size={15} />",
    );
    expect(source).toContain(
      ') : (\n                <span className="void-nav-panel__top-action-expand-icons" aria-hidden="true">\n                  <Blocks size={15} className="void-nav-panel__top-action-expand-icon-default" />',
    );
    expect(
      source.indexOf(
        '<Blocks size={15} className="void-nav-panel__top-action-expand-icon-default" />',
      ),
    ).toBeLessThan(source.indexOf('<span>{extensionsLabel}</span>'));
    expect(source).toContain('aria-pressed={isAssistantActive}');
    expect(source).toContain('aria-pressed={isAutomationActive}');
    expect(source).toContain('id="void-nav-panel-extensions"');
    expect(source).toContain('aria-hidden={!isExtensionsOpen}');
    expect(source.match(/tabIndex=\{isExtensionsOpen \? 0 : -1\}/g)).toHaveLength(3);
    expect(source).toContain('aria-label={connectorsTooltip}');
    expect(minimalStyles).toContain(
      '&__top-action-icon-slot {\n      display: inline-flex;',
    );
    expect(minimalStyles).toContain(
      '&__top-action-expand-icon-default {\n      display: none;',
    );
    expect(minimalStyles).toContain(
      '&__top-action-expand-icon-chevron {\n      opacity: 1;',
    );
  });

  it('removes collapsed session and workspace content from interaction', () => {
    const source = readSibling('./MainNav.tsx');
    const sectionHeaderSource = readSibling('./components/SectionHeader.tsx');

    expect(sectionHeaderSource).toContain(
      'aria-controls={collapsible ? controlsId : undefined}',
    );
    expect(sectionHeaderSource).toContain(
      'className="void-nav-panel__section-toggle"',
    );
    expect(sectionHeaderSource).toContain('<button');
    expect(sectionHeaderSource).not.toContain("role={isInteractive ? 'button'");
    expect(sectionHeaderSource).not.toContain(
      'onClick={e => e.stopPropagation()}',
    );
    expect(source).toContain(
      'controlsId="void-nav-panel-assistant-sessions"',
    );
    expect(source).toContain('id="void-nav-panel-assistant-sessions"');
    expect(source).toContain(
      "aria-hidden={!expandedSections.has('assistant-sessions')}",
    );
    expect(source).toContain(
      "...(!expandedSections.has('assistant-sessions') ? { inert: '' } : {})",
    );
    expect(source).toContain('controlsId="void-nav-panel-workspaces"');
    expect(source).toContain('id="void-nav-panel-workspaces"');
    expect(source).toContain(
      "aria-hidden={!expandedSections.has('workspace')}",
    );
    expect(source).toContain(
      "...(!expandedSections.has('workspace') ? { inert: '' } : {})",
    );
  });

  it('routes the connector entry to its standalone scene', () => {
    const source = readSibling('./MainNav.tsx');
    const config = readSibling('./config.ts');
    const baseStyles = readSibling('./NavPanel.scss');

    expect(source).toContain("openScene('connectors');");
    expect(source).toContain("activeTabId === 'connectors'");
    expect(source).not.toContain("setSettingsActiveTab('mcp-tools');");
    expect(source).toContain("t('nav.items.connectors')");
    expect(source).toContain('void-nav-panel__top-action-sub-dot');
    expect(config).toContain('agents / skills / connectors');
    expect(config).toContain('each item opens its own workspace scene');
    expect(baseStyles).toContain('max-height: 104px;');
  });

  it('moves focus into the portal menu and restores it on Escape', () => {
    const source = readSibling('./MainNav.tsx');

    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('aria-controls="void-workspace-menu"');
    expect(source).toContain('onKeyDown={handleWorkspaceMenuTriggerKeyDown}');
    expect(source).toContain('onKeyDown={handleWorkspaceMenuKeyDown}');
    expect(source).toContain('workspaceMenuInitialFocusRef.current');
    expect(source).toContain('closeWorkspaceMenu(true);');
    expect(source).not.toContain('workspacePresentationClassName');
    expect(source).toContain("setAttribute('data-keyboard-focus', 'true')");
    expect(source).toContain('onFocusCapture={handleWorkspaceMenuFocusCapture}');
  });

  it('keeps portal focus visible in classic and minimal presentations', () => {
    const baseStyles = readSibling('./NavPanel.scss');
    const minimalStyles = readSibling('./NavPanel.minimal.scss');

    expect(baseStyles).toMatch(
      /&__workspace-menu-item\s*\{[\s\S]*?&:focus,\s*&\[data-keyboard-focus='true'\]\s*\{[\s\S]*?outline:\s*2px solid var\(--control-focus-ring\);/,
    );
    expect(minimalStyles).toContain(
      '.void-ui--minimal .void-nav-panel__workspace-menu',
    );
    expect(minimalStyles).toMatch(
      /&:focus,\s*&\[data-keyboard-focus='true'\]\s*\{[\s\S]*?outline:\s*2px solid var\(--workspace-focus-ring\)/,
    );
    expect(minimalStyles).toContain("&[data-keyboard-focus='true']");
  });

  it('names persistent icon-only notification and canvas actions', () => {
    const notificationSource = readSibling(
      '../TitleBar/NotificationButton.tsx',
    );
    const canvasEmptyStateSource = readSibling(
      '../panels/content-canvas/empty-state/EmptyState.tsx',
    );

    expect(notificationSource).toContain(
      "aria-label={t('nav.notifications')}",
    );
    expect(notificationSource).toContain(
      '<Bell size={14} aria-hidden="true" />',
    );
    expect(canvasEmptyStateSource).toContain('type="button"');
    expect(canvasEmptyStateSource).toContain(
      "aria-label={t('tabs.close')}",
    );
    expect(canvasEmptyStateSource).toContain(
      '<X size={14} aria-hidden="true" />',
    );
  });

  it('names workspace row file and overflow actions', () => {
    const source = readSibling(
      './sections/workspaces/WorkspaceItem.tsx',
    );

    expect(source.match(/aria-label=\{t\('nav\.items\.project'\)\}/g)).toHaveLength(2);
    expect(source.match(/aria-label=\{t\('nav\.moreOptions'\)\}/g)).toHaveLength(2);
    expect(source.match(/aria-expanded=\{menuOpen\}/g)).toHaveLength(2);
  });
});
