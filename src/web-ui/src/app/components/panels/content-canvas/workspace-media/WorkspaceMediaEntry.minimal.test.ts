import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./WorkspaceMediaEntry.minimal.scss', import.meta.url),
  'utf8',
);
const baseSource = readFileSync(
  new URL('./WorkspaceMediaEntry.scss', import.meta.url),
  'utf8',
);

describe('WorkspaceMediaEntry minimal presentation contract', () => {
  it('loads one isolated Minimal override after the Classic presentation', () => {
    expect(baseSource).toContain(
      "@use './WorkspaceMediaEntry.minimal' as minimal;",
    );
    expect(baseSource.trimEnd()).toMatch(/@include minimal\.styles;$/);
    expect(baseSource).toMatch(
      /\.workspace-media-entry \{[\s\S]*?height: 26px;/,
    );
    expect(baseSource).toMatch(
      /&__option \{[\s\S]*?height: 20px;/,
    );
  });

  it('uses the shared 28px target and a single quiet active surface', () => {
    expect(source).toMatch(
      /\.workspace-media-entry \{[\s\S]*?height: var\(--workspace-icon-target\);[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?font-size: var\(--workspace-font-size-label\);/,
    );
    expect(source).toMatch(
      /\.workspace-media-entry__option \{[\s\S]*?height: var\(--workspace-icon-target\);[\s\S]*?padding: 0 var\(--workspace-space-2\);/,
    );
    expect(source).toMatch(
      /\.workspace-media-entry__option\.is-active \{[\s\S]*?background: var\(--workspace-surface-active\);[\s\S]*?box-shadow: none;/,
    );
  });

  it('keeps the override token-only and avoids layout animation', () => {
    expect(source).not.toMatch(/font-size\s*:\s*\d+(?:\.\d+)?px/);
    expect(source).not.toMatch(/(?<![\w-])#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\brgba?\s*\(/i);
    expect(source).not.toMatch(/transition\s*:\s*all/);
    expect(source).not.toMatch(
      /transition\s*:[^;]*(?:width|height|padding|margin)/,
    );
  });
});
