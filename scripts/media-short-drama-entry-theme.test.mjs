import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

const ENTRY_SCSS = [
  {
    file: 'src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaEntry.scss',
    tokenPrefix: '--workspace-media-entry-',
  },
  {
    file: 'src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaEntry.scss',
    tokenPrefix: '--short-drama-entry-',
  },
];

test('media and short-drama entry styles use local theme tokens instead of void iframe tokens', () => {
  for (const entry of ENTRY_SCSS) {
    const text = fs.readFileSync(path.join(root, entry.file), 'utf8');

    assert.equal(
      /--void-/.test(text),
      false,
      `${entry.file} should not depend directly on MiniApp/generated-widget --void-* tokens`,
    );
    assert.match(text, new RegExp(`${entry.tokenPrefix}border\\s*:\\s*var\\(--border-`));
    assert.match(text, new RegExp(`${entry.tokenPrefix}surface\\s*:`));
    assert.match(text, new RegExp(`${entry.tokenPrefix}text\\s*:\\s*var\\(--color-text-secondary`));
    assert.match(text, new RegExp(`${entry.tokenPrefix}hover-text\\s*:\\s*var\\(--color-text-primary`));
    assert.match(text, new RegExp(`border:\\s*1px solid var\\(${entry.tokenPrefix}border\\)`));
  }
});
