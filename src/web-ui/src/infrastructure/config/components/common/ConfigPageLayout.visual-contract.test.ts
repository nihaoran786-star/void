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

    expect(stylesheet).toContain(
      '.void-ui--minimal .void-config-page-header {',
    );
    expect(stylesheet).toContain(
      'padding-top: var(--size-gap-6, 24px);',
    );
    expect(stylesheet).toContain(
      'margin-bottom: var(--size-gap-5, 20px);',
    );
    expect(stylesheet).toContain('font-size: var(--font-size-lg);');
    expect(stylesheet).toContain('font-size: var(--font-size-xs);');
    expect(stylesheet).toContain('line-height: var(--line-height-base);');
    expect(stylesheet).toMatch(
      /@container config-panel \(max-width: 520px\)[\s\S]*?\.void-ui--minimal \.void-config-page-header \{\s*padding-top: var\(--size-gap-5, 20px\);\s*margin-bottom: var\(--size-gap-4, 16px\);/,
    );
  });

  it('uses the compact Minimal section and row rhythm without changing DOM', () => {
    const stylesheet = readSource('./ConfigPageLayout.scss');

    for (const contract of [
      '.void-ui--minimal .void-config-page-layout {',
      '--config-page-content-bottom-padding: var(--size-gap-8, 32px);',
      '--config-page-section-gap: var(--size-gap-6, 24px);',
      '.void-ui--minimal .void-config-page-section {',
      'gap: var(--size-gap-3, 12px);',
      '.void-ui--minimal .void-config-page-row {',
      'padding: var(--size-gap-3, 12px);',
      '--config-page-content-bottom-padding: var(--size-gap-6, 24px);',
    ]) {
      expect(stylesheet).toContain(contract);
    }

    expect(stylesheet).toContain(
      '--config-page-section-gap: var(--size-gap-10, 40px);',
    );
    expect(stylesheet).not.toContain('display: none');
  });
});
