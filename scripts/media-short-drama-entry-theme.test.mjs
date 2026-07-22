import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

const entryPath =
  'src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaEntry.scss';
const minimalEntryPath =
  'src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaEntry.minimal.scss';
const legacyShortDramaEntryPath =
  'src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaEntry.scss';

test('one media-session switcher owns the media and short-drama entry theme', () => {
  const base = fs.readFileSync(path.join(root, entryPath), 'utf8');
  const minimal = fs.readFileSync(path.join(root, minimalEntryPath), 'utf8');
  const combined = `${base}\n${minimal}`;

  assert.equal(
    fs.existsSync(path.join(root, legacyShortDramaEntryPath)),
    false,
    'The removed standalone ShortDramaEntry must not return beside the unified switcher',
  );
  assert.doesNotMatch(
    combined,
    /--void-/,
    'The media-session switcher must not consume MiniApp/generated-widget tokens',
  );

  for (const token of [
    '--control-bg',
    '--control-border',
    '--control-text',
    '--control-bg-hover',
    '--control-text-hover',
  ]) {
    assert.match(base, new RegExp(`var\\(${token}\\)`), `${entryPath} must consume ${token}`);
  }

  for (const token of [
    '--workspace-icon-target',
    '--workspace-surface-hover',
    '--workspace-surface-active',
    '--workspace-text-primary',
    '--workspace-text-muted',
    '--workspace-focus-ring',
  ]) {
    assert.match(
      minimal,
      new RegExp(`var\\(${token}\\)`),
      `${minimalEntryPath} must consume ${token}`,
    );
  }

  assert.doesNotMatch(minimal, /rgba?\(|#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(minimal, /transition:\s*all/);
});
