import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./WorkspaceItem.tsx', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('WorkspaceItem scene navigation contract', () => {
  it('opens the file-viewer scene instead of changing only the left navigation', () => {
    expect(source).toContain("useSceneStore(s => s.openScene)");
    expect(source).toMatch(
      /const handleOpenFiles = useCallback[\s\S]*?switchLeftPanelTab\('files'\);[\s\S]*?openScene\('file-viewer'\);/,
    );
    expect(source).not.toContain("openNavScene('file-viewer')");
  });
});
