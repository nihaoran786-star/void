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

  it('routes the connector entry through the existing MCP settings state', () => {
    const source = readSibling('./MainNav.tsx');
    const config = readSibling('./config.ts');
    const baseStyles = readSibling('./NavPanel.scss');

    expect(source).toContain("setSettingsActiveTab('mcp-tools');");
    expect(source).toContain("openScene('settings');");
    expect(source).toContain(
      "activeTabId === 'settings' && settingsActiveTab === 'mcp-tools'",
    );
    expect(source).toContain("t('nav.items.connectors')");
    expect(source).toContain('<Cable size={15} />');
    expect(config).toContain('agents / skills / connectors');
    expect(config).toContain('reuses the existing MCP settings surface');
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
});
