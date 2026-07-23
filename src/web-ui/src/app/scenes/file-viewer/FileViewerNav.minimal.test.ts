import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8').replace(
    /\r\n/g,
    '\n',
  );

describe('File Viewer Minimal presentation contract', () => {
  const projection = readSource('./FileViewerNav.minimal.scss');

  it('loads one feature-local Minimal projection', () => {
    const owner = readSource('./FileViewerNav.scss');
    expect(
      owner.match(/@use '\.\/FileViewerNav\.minimal' as minimal;/g),
    ).toHaveLength(1);
    expect(owner.match(/@include minimal\.styles;/g)).toHaveLength(1);
    expect(projection).toContain('.void-ui--minimal .void-file-viewer-nav {');
  });

  it('keeps the file command row compact without decorative motion', () => {
    expect(projection).toMatch(/&__header \{[\s\S]*?height: 30px;/);
    expect(projection).not.toMatch(/transition\s*:\s*all/i);
    expect(projection).not.toMatch(
      /(?:linear|radial|conic)-gradient|\b(?:translate|scale)\s*\(/i,
    );
    expect(projection).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
