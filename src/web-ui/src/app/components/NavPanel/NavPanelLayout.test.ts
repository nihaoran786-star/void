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

function readMainNavSource(): string {
  return readFileSync(
    fileURLToPath(new URL('./MainNav.tsx', import.meta.url)),
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
    const rootBlock = extractBlock(stylesheet, '.bitfun-nav-panel');
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

  it('clips collapsible content so expanded rows cannot overlap following sections', () => {
    const stylesheet = readNavPanelStylesheet();
    const collapsibleBlock = extractBlock(stylesheet, '&__collapsible');
    const collapsibleInnerBlock = extractBlock(stylesheet, '&__collapsible-inner');

    expect(collapsibleBlock).toContain('display: grid;');
    expect(collapsibleBlock).toContain('grid-template-rows: 1fr;');
    expect(stylesheet).toContain('&.is-collapsed {\n      grid-template-rows: 0fr;');
    expect(collapsibleInnerBlock).toContain('overflow: hidden;');
  });

  it('uses one shared row-action size for root action buttons', () => {
    const stylesheet = readNavPanelStylesheet();
    const rootBlock = extractBlock(stylesheet, '.bitfun-nav-panel');
    const sectionActionBlock = extractBlock(stylesheet, '&__section-action');
    const itemActionBlock = extractBlock(stylesheet, '&__item-action');

    expect(rootBlock).toContain('--bitfun-nav-row-action-size: 20px;');
    expect(rootBlock).toContain('--bitfun-nav-row-action-icon-size: 13px;');
    expect(rootBlock).toContain('--bitfun-nav-row-action-offset: 4px;');
    expect(rootBlock).toContain('--bitfun-nav-row-action-gap: 4px;');
    for (const block of [sectionActionBlock, itemActionBlock]) {
      expect(block).toContain('width: var(--bitfun-nav-row-action-size);');
      expect(block).toContain('height: var(--bitfun-nav-row-action-size);');
    }
    expect(sectionActionBlock).toContain('svg {');
    expect(sectionActionBlock).toContain('width: var(--bitfun-nav-row-action-icon-size);');
    expect(sectionActionBlock).toContain('height: var(--bitfun-nav-row-action-icon-size);');
  });

  it('keeps session mode selection separate from the single create action', () => {
    const source = readMainNavSource();

    expect(source).toContain('bitfun-nav-panel__session-mode-switch');
    expect(source).toContain('role="radiogroup"');
    expect(source).toContain("onClick={() => setSessionMode('code')}");
    expect(source).toContain("onClick={() => setSessionMode('cowork')}");
    expect(source).toContain('handleCreateSelectedSession');
    expect(source).toContain('bitfun-nav-panel__session-create-action');
    expect(source).not.toContain('<Plus size={12} />\n              </span>\n              <span>{t(\'nav.sessions.newSession\')}</span>');
  });

  it('styles the session mode switcher as a compact segmented control', () => {
    const stylesheet = readNavPanelStylesheet();
    const createBlock = extractBlock(stylesheet, '.bitfun-nav-panel__session-create');
    const switchBlock = extractBlock(stylesheet, '.bitfun-nav-panel__session-mode-switch');
    const optionBlock = extractBlock(stylesheet, '.bitfun-nav-panel__session-mode-option');

    expect(createBlock).toContain('border: 1px solid var(--border-subtle);');
    expect(createBlock).toContain('overflow: hidden;');
    expect(switchBlock).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);');
    expect(switchBlock).toContain('height: 34px;');
    expect(switchBlock).toContain('border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 76%, transparent);');
    expect(switchBlock).toContain('background: transparent;');
    expect(optionBlock).toContain('height: 100%;');
    expect(optionBlock).toContain('background: transparent;');
  });
});
