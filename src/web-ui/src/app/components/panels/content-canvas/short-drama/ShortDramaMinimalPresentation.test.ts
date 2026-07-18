import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./ShortDramaCenterPanel.minimal.scss', import.meta.url),
  'utf8',
);

describe('ShortDramaCenter minimal presentation contract', () => {
  it('keeps keyboard focus visible inside clipped tab and rail containers', () => {
    expect(source).toMatch(
      /\.short-drama-center__tab:focus-visible,[\s\S]*?outline: 2px solid var\(--workspace-focus-ring\);[\s\S]*?box-shadow: inset 0 0 0 2px var\(--workspace-focus-ring\);/,
    );
  });

  it('recovers script line length at compact panel widths', () => {
    expect(source).toMatch(
      /@container short-drama-panel \(max-width: 620px\)[\s\S]*?\.short-drama-center__body \{[\s\S]*?gap: var\(--workspace-space-1\);[\s\S]*?padding: var\(--workspace-space-3\) var\(--workspace-space-2\);/,
    );
    expect(source).toMatch(
      /@container short-drama-panel \(max-width: 620px\)[\s\S]*?\.short-drama-center__script-editor \.ProseMirror \{[\s\S]*?padding: var\(--workspace-space-6\) var\(--workspace-space-3\);/,
    );
  });
});
