import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('shared control motion governance', () => {
  it('animates only explicit paint and compositor properties', () => {
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
});
