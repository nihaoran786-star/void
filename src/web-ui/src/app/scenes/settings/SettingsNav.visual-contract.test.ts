import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(name, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('SettingsNav compact search visual contract', () => {
  it('keeps the compact launcher local, labelled, and focus-restoring', () => {
    const source = readSource('./SettingsNav.tsx');

    for (const contract of [
      "import { Search as SearchIcon, X } from 'lucide-react';",
      'const searchTriggerRef = useRef<HTMLButtonElement>(null);',
      'const [isCompactSearchOpen, setIsCompactSearchOpen] = useState(false);',
      'aria-label={searchLabel}',
      'title={searchLabel}',
      'aria-expanded={isCompactSearchOpen}',
      'aria-controls="settings-nav-search"',
      'id="settings-nav-search"',
      'onClick={handleCompactSearchToggle}',
      'searchTriggerRef.current?.focus();',
      'isCompactSearchOpen\n            ? <X size={14} aria-hidden="true" />',
      ': <SearchIcon size={14} aria-hidden="true" />',
    ]) {
      expect(source).toContain(contract);
    }
  });

  it('uses a two-step Escape path without changing settings search ownership', () => {
    const source = readSource('./SettingsNav.tsx');

    expect(source).toContain('if (draftQuery.length > 0) {');
    expect(source).toContain('resetAndRefocusVisibleSearch();');
    expect(source).toContain('} else if (isCompactSearchOpen) {');
    expect(source).toContain('closeCompactSearch();');
    expect(source).toContain(
      "useSettingsStore((s) => s.setSearchQuery)",
    );
    expect(source).not.toContain('document.querySelector');
    expect(source).not.toContain("closest('.void-ui--minimal')");
  });

  it('exposes the settings navigation landmark and current page', () => {
    const source = readSource('./SettingsNav.tsx');

    expect(source).toContain('<nav');
    expect(source).toContain('aria-label={navigationLabel}');
    expect(source).toContain(
      "aria-current={activeTab === tabDef.id ? 'page' : undefined}",
    );
    expect(source).toContain('</nav>');
  });

  it('collapses only Minimal search and uses compact workspace-token controls', () => {
    const stylesheet = readSource('./SettingsNav.scss');

    for (const contract of [
      '&__search-trigger {\n    display: none;',
      'flex: 0 0 28px;',
      'width: 28px;',
      'height: 28px;',
      '.void-ui--minimal .void-settings-nav {',
      '&__search-trigger {\n    display: inline-flex;',
      '&.is-compact-search-open {',
      'background: var(--workspace-surface-hover);',
      'outline: 2px solid var(--workspace-focus-ring);',
      'box-shadow: inset 0 0 0 2px var(--workspace-focus-ring);',
      '.void-settings-nav__search-field.search .search__prefix {',
      'display: none;',
    ]) {
      expect(stylesheet).toContain(contract);
    }

    expect(stylesheet).not.toMatch(/transition:[^;]*(?:height|max-height)/);
  });

  it('compresses only Minimal navigation while preserving the Classic rhythm', () => {
    const stylesheet = readSource('./SettingsNav.scss');
    const minimalStart = stylesheet.indexOf(
      '.void-ui--minimal .void-settings-nav {',
    );
    const reducedMotionStart = stylesheet.indexOf(
      '@media (prefers-reduced-motion: reduce)',
      minimalStart,
    );
    const minimalStyles = stylesheet.slice(minimalStart, reducedMotionStart);
    const classicStyles = stylesheet.slice(0, minimalStart);

    for (const contract of [
      '&__sections {\n    padding: $size-gap-1 0 $size-gap-3;',
      '&__category:not(:last-child) {\n    margin-bottom: $size-gap-4;',
      '&__category-header {\n    height: 20px;',
      '&__item {\n    height: 28px;',
    ]) {
      expect(minimalStyles).toContain(contract);
    }

    expect(classicStyles).toContain('padding: $size-gap-2 0;');
    expect(classicStyles).toContain('margin-bottom: $size-gap-6;');
    expect(classicStyles).toContain('height: 24px;');
    expect(classicStyles).toContain('height: 32px;');
    expect(minimalStyles).not.toMatch(/position:\s*(?:absolute|fixed)/);
  });

  it('gives narrow Settings content priority without changing navigation state', () => {
    const workspaceStyles = readSource('../../layout/WorkspaceBody.scss');

    expect(workspaceStyles).toContain(
      '--workspace-nav-effective-width: var(--nav-width, #{$_nav-width});',
    );
    expect(workspaceStyles).toContain(
      'width: var(--workspace-nav-effective-width);',
    );
    expect(workspaceStyles).toContain(
      'left: calc(#{$size-gap-2} + var(--workspace-nav-effective-width));',
    );
    expect(workspaceStyles).toMatch(
      /@media \(max-width: 720px\) \{[\s\S]*?\.void-ui--minimal \.void-workspace-body:has\(\.void-settings-nav\) \{[\s\S]*?--workspace-nav-effective-width: clamp\(136px, 34vw, 176px\);/,
    );
    expect(workspaceStyles).toMatch(
      /\.void-workspace-body:has\(\.void-settings-nav\)[\s\S]*?\.void-workspace-body__nav-area \{[\s\S]*?transition: none;/,
    );
    expect(workspaceStyles).not.toContain('useSettingsStore');
  });
});
