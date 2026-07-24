import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readStylesheet(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

describe('top bar layout styles', () => {
  it('uses one local control size token for NavBar buttons', () => {
    const stylesheet = readStylesheet('./NavBar.scss');

    expect(stylesheet).toContain('--void-topbar-control-size: 28px;');
    expect(stylesheet).toContain('width: var(--void-topbar-control-size);');
    expect(stylesheet).toContain('height: var(--void-topbar-control-size);');
    expect(stylesheet).toContain('border-radius: var(--void-topbar-control-radius);');
  });

  it('uses the same top-bar sizing vocabulary in SceneBar controls', () => {
    const stylesheet = readStylesheet('../SceneBar/SceneBar.scss');

    expect(stylesheet).toContain('--void-topbar-control-size: 28px;');
    expect(stylesheet).toContain('min-height: var(--void-topbar-control-size);');
    expect(stylesheet).toContain('border-radius: var(--void-topbar-control-radius);');
  });

  it('removes secondary tab labels before narrow tabs clip their text', () => {
    const stylesheet = readStylesheet('../SceneBar/SceneBar.scss');

    expect(stylesheet).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?&__sep,\s*&__subtitle\s*\{\s*display: none;/,
    );
  });
});
