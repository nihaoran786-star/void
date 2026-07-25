import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(name, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('Minimal Config page density visual contract', () => {
  it('compacts only the Minimal page header and preserves the narrow inset', () => {
    const stylesheet = readSource('./ConfigPageHeader.scss');

    for (const contract of [
      '.void-ui--minimal .void-config-page-header {',
      'position: sticky;',
      'padding: var(--workspace-space-3) var(--config-page-content-inline-padding);',
      'margin-bottom: var(--workspace-space-4);',
      'background: var(--workspace-surface-canvas);',
      'border-bottom: 1px solid var(--workspace-border-subtle);',
      'font-size: var(--workspace-font-size-title);',
      'font-size: var(--workspace-font-size-meta);',
      'line-height: var(--workspace-line-height-meta);',
    ]) {
      expect(stylesheet).toContain(contract);
    }

    expect(stylesheet).toMatch(
      /@container config-panel \(max-width: 520px\)[\s\S]*?\.void-ui--minimal \.void-config-page-header \{\s*padding:\s*var\(--workspace-space-3\)\s*var\(--config-page-content-inline-padding\);\s*margin-bottom: var\(--workspace-space-3\);/,
    );
  });

  it('uses the compact Minimal section and row rhythm without changing DOM', () => {
    const stylesheet = readSource('./ConfigPageLayout.scss');

    for (const contract of [
      '.void-ui--minimal .void-config-page-layout {',
      '--config-page-content-inline-padding: var(--workspace-space-4);',
      '--config-page-content-bottom-padding: var(--workspace-space-8);',
      '--config-page-content-max-width: 840px;',
      '--config-page-section-gap: var(--workspace-space-6);',
      'scrollbar-gutter: stable both-edges;',
      '.void-ui--minimal .void-config-page-content {',
      'padding-left: var(--config-page-content-inline-padding);',
      '.void-ui--minimal .void-config-page-section {',
      'gap: var(--workspace-space-3);',
      '.void-ui--minimal .void-config-page-row {',
      'padding: var(--workspace-space-3);',
      '.void-ui--minimal .void-config-page-section__body {',
      'background: var(--workspace-surface-panel);',
      'border-color: var(--workspace-border-subtle);',
      '--config-page-content-bottom-padding: var(--workspace-space-6);',
    ]) {
      expect(stylesheet).toContain(contract);
    }

    expect(stylesheet).toContain(
      '--config-page-section-gap: var(--size-gap-10, 40px);',
    );
    expect(stylesheet).toMatch(
      /@container config-panel \(max-width: 280px\)[\s\S]*?\.void-config-page-header,[\s\S]*?\.void-config-page-content[\s\S]*?--config-page-content-inline-padding: var\(--workspace-space-3\);[\s\S]*?--config-page-section-gap: var\(--workspace-space-4\);/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 600px\)[\s\S]*?\.void-ui--minimal \.void-config-page-layout \{[\s\S]*?scrollbar-gutter: auto;/,
    );
    expect(stylesheet).not.toContain('display: none');
  });
});
