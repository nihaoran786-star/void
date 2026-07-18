import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const read = relativePath => readFileSync(join(repoRoot, relativePath), 'utf8');
const tokens = read('src/web-ui/src/component-library/styles/tokens.scss');
const aboutDialog = read(
  'src/web-ui/src/app/components/AboutDialog/AboutDialog.scss',
);
const shortDramaMinimal = read(
  'src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.minimal.scss',
);
const workspaceMediaMinimal = read(
  'src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.minimal.scss',
);
const mediaPreviewMinimal = read(
  'src/web-ui/src/shared/services/preview/MediaPreviewOverlay.minimal.scss',
);
const cssVarContract = JSON.parse(read('scripts/theme-css-var-contract.json'));

const extractFlatBlock = (source, selector) => {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `Missing ${selector} token scope`);
  const bodyStart = source.indexOf('{', start) + 1;
  let depth = 1;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index);
  }

  assert.fail(`Unclosed ${selector} token scope`);
};

const minimalTokens = extractFlatBlock(tokens, '.void-ui--minimal');

test('minimal workspace tokens stay scoped and derive from existing theme contracts', () => {
  const expectedMappings = new Map([
    ['--workspace-surface-canvas', '--color-bg-scene'],
    ['--workspace-surface-panel', '--color-bg-secondary'],
    ['--workspace-surface-raised', '--color-bg-elevated'],
    ['--workspace-surface-hover', '--control-bg-hover'],
    ['--workspace-surface-active', '--control-bg-active'],
    ['--workspace-text-primary', '--color-text-primary'],
    ['--workspace-text-secondary', '--color-text-secondary'],
    ['--workspace-text-muted', '--color-text-muted'],
    ['--workspace-border-subtle', '--border-subtle'],
    ['--workspace-border-strong', '--border-medium'],
    ['--workspace-accent', '--color-accent-400'],
    ['--workspace-focus-ring', '--color-accent-600'],
    ['--workspace-shadow-raised', '--shadow-xs'],
  ]);

  for (const [alias, source] of expectedMappings) {
    assert.match(
      minimalTokens,
      new RegExp(`${alias}:\\s*var\\(${source}\\)`),
      `${alias} must derive from ${source}`,
    );
  }

  assert.doesNotMatch(minimalTokens, /rgba?\(|#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(minimalTokens, /--(?:glass|glow|blur|color-purple)-/);
});

test('minimal workspace typography matches the compact Codex reference scale', () => {
  const expectedTypography = new Map([
    ['--workspace-font-family', '--font-family-sans'],
    ['--workspace-font-weight-regular', '--font-weight-normal'],
    ['--workspace-font-weight-medium', '--font-weight-medium'],
    ['--workspace-font-weight-strong', '--font-weight-semibold'],
  ]);

  for (const [alias, source] of expectedTypography) {
    assert.match(minimalTokens, new RegExp(`${alias}:\\s*var\\(${source}\\)`));
  }

  for (const [token, primitive] of [
    ['--workspace-font-size-meta', 'font-size-2xs'],
    ['--workspace-font-size-label', 'font-size-xs'],
    ['--workspace-font-size-control', 'font-size-sm'],
    ['--workspace-font-size-body', 'font-size-base'],
    ['--workspace-font-size-title', 'font-size-xl'],
  ]) {
    assert.match(minimalTokens, new RegExp(`${token}:\\s*#\\{\\$${primitive}\\}`));
  }

  for (const [token, value] of [
    ['--workspace-line-height-meta', '1.35'],
    ['--workspace-line-height-control', '1.4'],
    ['--workspace-line-height-body', '1.55'],
    ['--workspace-line-height-title', '1.3'],
  ]) {
    assert.match(minimalTokens, new RegExp(`${token}:\\s*${value};`));
  }
});

test('minimal workspace exposes compact spacing, controls, motion, and status tokens', () => {
  for (const token of [
    '--workspace-space-1',
    '--workspace-space-2',
    '--workspace-space-3',
    '--workspace-space-4',
    '--workspace-space-6',
    '--workspace-space-8',
    '--workspace-radius-control',
    '--workspace-radius-panel',
    '--workspace-radius-composer',
    '--workspace-control-height',
    '--workspace-control-height-primary',
    '--workspace-icon-target',
    '--workspace-motion-fast',
    '--workspace-easing-standard',
  ]) {
    assert.match(minimalTokens, new RegExp(`${token}:\\s*var\\(`), `Missing ${token}`);
  }

  for (const tone of ['neutral', 'info', 'success', 'warning', 'error']) {
    for (const role of ['bg', 'border']) {
      assert.match(
        minimalTokens,
        new RegExp(`--workspace-status-${tone}-${role}:\\s*var\\(--status-${tone}-${role}\\)`),
      );
    }
  }

  assert.match(
    minimalTokens,
    /--workspace-status-neutral-text:\s*var\(--status-neutral-text\)/,
  );
  for (const tone of ['info', 'success', 'warning', 'error']) {
    assert.match(
      minimalTokens,
      new RegExp(
        `--workspace-status-${tone}-text:\\s*color-mix\\(\\s*in srgb,\\s*`
        + `var\\(--status-${tone}-text\\) 60%,\\s*`
        + 'var\\(--workspace-text-primary\\)\\s*\\)',
      ),
    );
  }
});

test('theme governance records the scoped minimal workspace token family', () => {
  const domain = cssVarContract.requiredTokenDomains.find(
    candidate => candidate.domain === 'minimal-workspace',
  );
  assert.ok(domain, 'Missing minimal-workspace CSS variable domain');
  assert.equal(
    domain.runtimeInjected,
    false,
    'Minimal workspace aliases must remain scoped instead of polluting every theme root',
  );

  for (const token of [
    '--workspace-surface-canvas',
    '--workspace-text-primary',
    '--workspace-font-size-control',
    '--workspace-focus-ring',
    '--workspace-status-error-text',
  ]) {
    assert.ok(domain.requiredVars.includes(token), `Missing governed token ${token}`);
  }

  assert.ok(cssVarContract.allowedDynamicPrefixes.includes('--workspace-'));
});

test('reduced-motion contracts stop indefinite and decorative workspace motion', () => {
  assert.match(
    aboutDialog,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.void-about-dialog__download-fill--indeterminate[\s\S]*?animation:\s*none;/,
  );
  assert.match(
    aboutDialog,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.void-about-dialog__download-fill\s*\{[\s\S]*?transition:\s*none;/,
  );

  for (const [name, source, rootSelector] of [
    ['short drama', shortDramaMinimal, '.void-ui--minimal .short-drama-center'],
    ['workspace media', workspaceMediaMinimal, '.void-ui--minimal .workspace-media-gallery'],
    ['media preview', mediaPreviewMinimal, '.media-preview-overlay.void-ui--minimal'],
  ]) {
    assert.match(
      source,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
      `${name} must respond to reduced motion`,
    );
    assert.ok(
      source.includes(`${rootSelector} *`),
      `${name} must scope reduced motion to the minimal surface`,
    );
    assert.match(source, /transition-duration:\s*0\.01ms\s*!important;/);
    assert.match(source, /animation-duration:\s*0\.01ms\s*!important;/);
    assert.match(source, /animation-iteration-count:\s*1\s*!important;/);
  }
});
