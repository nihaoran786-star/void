import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

const selectSource = readSource(
  '../../component-library/components/Select/Select.scss',
);
const switchSource = readSource(
  '../../component-library/components/Switch/Switch.scss',
);

describe('shared control motion governance', () => {
  it('preserves explicit motion contracts for existing shared controls', () => {
    const searchStyles = readSource(
      '../../component-library/components/Search/Search.scss',
    );
    const inputStyles = readSource(
      '../../component-library/components/Input/Input.scss',
    );
    const floatingChatStyles = readSource('../layout/FloatingMiniChat.scss');
    const extendedMixins = readSource(
      '../../component-library/styles/_extended-mixins.scss',
    );

    expect(searchStyles).not.toContain('transition: all');
    expect(inputStyles).not.toContain('transition: all');
    expect(floatingChatStyles).not.toContain('transition: all');
    expect(extendedMixins).not.toMatch(
      /@mixin icon-hover-bold[\s\S]*?transition:\s*all/,
    );

    expect(searchStyles).toContain(
      'border-color $motion-base $easing-standard',
    );
    expect(inputStyles).toContain(
      'background-color var(--motion-base, 0.3s)',
    );
    expect(floatingChatStyles).toContain('transform 0.15s ease');
    expect(floatingChatStyles).toContain('box-shadow 0.2s ease');
    expect(extendedMixins).toContain(
      'stroke-width 0.3s $easing-smooth',
    );
  });

  it('keeps Select and Switch transitions constrained to explicit properties', () => {
    expect(selectSource).not.toMatch(/transition\s*:\s*all\b/);
    expect(switchSource).not.toMatch(/transition\s*:\s*all\b/);
  });

  it('moves the Switch thumb with a transform instead of a layout property', () => {
    expect(switchSource).toContain('--switch-thumb-travel: 16px;');
    expect(switchSource).toContain(
      'transform: translateX(var(--switch-thumb-travel));',
    );
    expect(switchSource).not.toMatch(
      /__input:checked[\s\S]*?__thumb\s*\{[\s\S]*?left:\s*calc\(/,
    );
  });

  it('disables nonessential shared-control motion for reduced-motion users', () => {
    expect(selectSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?&__dropdown\s*\{[\s\S]*?animation:\s*none/,
    );
    expect(switchSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?&__thumb\s*\{[\s\S]*?transition:\s*none/,
    );
  });
});
