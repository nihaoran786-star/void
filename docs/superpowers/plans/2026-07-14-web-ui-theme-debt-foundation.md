# Web UI Theme Debt Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify six shared Web UI primitive families behind one semantic control/status token contract and migrate Review Platform to that contract without changing layout or runtime behavior.

**Architecture:** Define CSS custom-property aliases in the existing component-library token root, deriving every alias from ThemeService-owned variables. Migrate component SCSS and Review Platform SCSS only; preserve React props, markup, state, API, adapter, and backend boundaries. Protect the slice with a focused Node contract test plus existing theme and TypeScript gates.

**Tech Stack:** React 18, TypeScript 5.8, SCSS, Node `node:test`, Vitest, existing ThemeService CSS variables.

---

## File Map

- Create `scripts/shared-ui-theme-foundation.test.mjs`: source-level contract for aliases and migrated selectors.
- Modify `src/web-ui/src/component-library/styles/tokens.scss`: define semantic control/status aliases from existing variables.
- Modify `src/web-ui/src/component-library/components/Button/Button.scss`: consume control/status aliases.
- Modify `src/web-ui/src/component-library/components/IconButton/IconButton.scss`: consume size/control/status aliases.
- Modify `src/web-ui/src/component-library/components/Select/Select.scss`: consume control/status aliases for trigger, dropdown, option, tag, focus, disabled, and error states.
- Modify `src/web-ui/src/component-library/components/Badge/Badge.scss`: consume shared status aliases.
- Modify `src/web-ui/src/component-library/components/Tag/Tag.scss`: consume shared status aliases.
- Modify `src/web-ui/src/component-library/components/Card/Card.scss`: consume shared surface/control aliases.
- Modify `src/web-ui/src/app/components/panels/base/FlexiblePanel.scss`: consume shared panel surface/border aliases.
- Modify `src/web-ui/src/app/components/panels/base/PanelHeader.scss`: consume shared height/spacing/control aliases.
- Modify `src/web-ui/src/component-library/components/Alert/Alert.scss`: become the reference status consumer.
- Modify `src/web-ui/src/app/components/panels/review-platform/ReviewPlatformPanel.scss`: consume shared aliases without changing markup or layout.
- Update `scripts/theme-color-governance-baseline.json` only if the audit reports lower measured maxima after migration; never raise a maximum.

## Task 1: Add the Semantic Alias Contract

**Files:**
- Create: `scripts/shared-ui-theme-foundation.test.mjs`
- Modify: `src/web-ui/src/component-library/styles/tokens.scss`

- [ ] **Step 1: Write the failing token contract test**

Create the test with these helpers and assertions:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const read = relativePath => readFileSync(join(repoRoot, relativePath), 'utf8');
const tokens = read('src/web-ui/src/component-library/styles/tokens.scss');

test('component tokens define semantic control aliases from existing theme variables', () => {
  const expectedMappings = new Map([
    ['--control-bg', '--element-bg-base'],
    ['--control-bg-hover', '--element-bg-medium'],
    ['--control-bg-active', '--element-bg-soft'],
    ['--control-border', '--border-base'],
    ['--control-border-hover', '--border-medium'],
    ['--control-border-focus', '--color-accent-400'],
    ['--control-text', '--color-text-secondary'],
    ['--control-text-hover', '--color-text-primary'],
    ['--control-text-muted', '--color-text-muted'],
    ['--control-focus-ring', '--color-accent-400'],
  ]);

  for (const [alias, source] of expectedMappings) {
    assert.match(tokens, new RegExp(`${alias}:\\s*var\\(${source}\\)`));
  }

  for (const token of [
    '--control-disabled-opacity', '--control-radius',
    '--control-height-xs', '--control-height-sm', '--control-height-md', '--control-height-lg',
    '--control-square-xs', '--control-square-sm', '--control-square-md', '--control-square-lg',
    '--control-icon-xs', '--control-icon-sm', '--control-icon-md', '--control-icon-lg',
  ]) {
    assert.match(tokens, new RegExp(`${token}:`), `Missing ${token}`);
  }
});

test('component tokens define the complete shared status contract', () => {
  for (const tone of ['neutral', 'info', 'success', 'warning', 'error']) {
    for (const role of ['bg', 'border', 'text']) {
      assert.match(tokens, new RegExp(`--status-${tone}-${role}:`));
    }
  }
});
```

- [ ] **Step 2: Run the contract test and confirm the red state**

Run:

```powershell
node --test scripts/shared-ui-theme-foundation.test.mjs
```

Expected: FAIL because `--control-bg` and the status alias family do not exist.

- [ ] **Step 3: Define the semantic aliases in the existing `:root` token block**

Add this exact alias layer near the existing button/input/badge custom properties:

```scss
  // Shared interactive-control contract. Values remain owned by ThemeService.
  --control-bg: var(--element-bg-base);
  --control-bg-hover: var(--element-bg-medium);
  --control-bg-active: var(--element-bg-soft);
  --control-border: var(--border-base);
  --control-border-hover: var(--border-medium);
  --control-border-focus: var(--color-accent-400);
  --control-text: var(--color-text-secondary);
  --control-text-hover: var(--color-text-primary);
  --control-text-muted: var(--color-text-muted);
  --control-focus-ring: var(--color-accent-400);
  --control-disabled-opacity: 0.45;
  --control-radius: var(--size-radius-sm);
  --control-height-xs: 24px;
  --control-height-sm: var(--button-height-sm);
  --control-height-md: var(--button-height-base);
  --control-height-lg: var(--button-height-lg);
  --control-square-xs: 24px;
  --control-square-sm: 28px;
  --control-square-md: 32px;
  --control-square-lg: 40px;
  --control-icon-xs: 14px;
  --control-icon-sm: 16px;
  --control-icon-md: 16px;
  --control-icon-lg: 20px;

  --status-neutral-bg: var(--element-bg-base);
  --status-neutral-border: var(--border-base);
  --status-neutral-text: var(--color-text-secondary);
  --status-info-bg: var(--color-info-bg);
  --status-info-border: var(--color-info-border);
  --status-info-text: var(--color-info);
  --status-success-bg: var(--color-success-bg);
  --status-success-border: var(--color-success-border);
  --status-success-text: var(--color-success);
  --status-warning-bg: var(--color-warning-bg);
  --status-warning-border: var(--color-warning-border);
  --status-warning-text: var(--color-warning);
  --status-error-bg: var(--color-error-bg);
  --status-error-border: var(--color-error-border);
  --status-error-text: var(--color-error);
```

- [ ] **Step 4: Run the contract test and confirm green**

Run `node --test scripts/shared-ui-theme-foundation.test.mjs`.

Expected: 2 tests pass.

- [ ] **Step 5: Commit the token contract**

```powershell
git add scripts/shared-ui-theme-foundation.test.mjs src/web-ui/src/component-library/styles/tokens.scss
git commit -m "test(ui): define shared theme foundation contract"
```

## Task 2: Migrate Button and IconButton

**Files:**
- Modify: `scripts/shared-ui-theme-foundation.test.mjs`
- Modify: `src/web-ui/src/component-library/components/Button/Button.scss`
- Modify: `src/web-ui/src/component-library/components/IconButton/IconButton.scss`

- [ ] **Step 1: Extend the contract test for control consumers**

Add:

```js
const button = read('src/web-ui/src/component-library/components/Button/Button.scss');
const iconButton = read('src/web-ui/src/component-library/components/IconButton/IconButton.scss');

test('buttons consume the shared control contract', () => {
  for (const style of [button, iconButton]) {
    for (const token of ['--control-bg', '--control-bg-hover', '--control-text', '--control-focus-ring']) {
      assert.match(style, new RegExp(`var\\(${token}\\)`), `Missing ${token}`);
    }
    assert.equal(style.includes('transition: all'), false);
  }
  for (const tone of ['success', 'error']) {
    assert.match(button + iconButton, new RegExp(`var\\(--status-${tone}-bg\\)`));
    assert.match(button + iconButton, new RegExp(`var\\(--status-${tone}-text\\)`));
  }
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run `node --test scripts/shared-ui-theme-foundation.test.mjs`.

Expected: FAIL because the button styles still use component-local raw values.

- [ ] **Step 3: Replace base state values with shared aliases**

Use these declarations in both base selectors, retaining existing variant selectors and class names:

```scss
background: var(--control-bg);
color: var(--control-text);
border-radius: var(--control-radius);
transition:
  background var(--motion-fast) var(--easing-standard),
  color var(--motion-fast) var(--easing-standard),
  border-color var(--motion-fast) var(--easing-standard),
  transform var(--motion-fast) var(--easing-standard);

&:hover:not(:disabled) {
  background: var(--control-bg-hover);
  color: var(--control-text-hover);
}

&:active:not(:disabled) {
  background: var(--control-bg-active);
}

&:focus-visible {
  outline: 2px solid var(--control-focus-ring);
  outline-offset: 1px;
}

&:disabled {
  opacity: var(--control-disabled-opacity);
}
```

Map `danger` to `--status-error-*`, `success` to `--status-success-*`, warning to `--status-warning-*`, and AI to existing purple accent variables. Map IconButton container dimensions to `--control-square-*` and SVG dimensions to `--control-icon-*` without changing the 24/28/32/40 effective scale.

- [ ] **Step 4: Run the focused contract**

Run `node --test scripts/shared-ui-theme-foundation.test.mjs`.

Expected: all tests pass.

- [ ] **Step 5: Commit the control migration**

```powershell
git add scripts/shared-ui-theme-foundation.test.mjs src/web-ui/src/component-library/components/Button/Button.scss src/web-ui/src/component-library/components/IconButton/IconButton.scss
git commit -m "refactor(ui): unify button theme states"
```

## Task 3: Migrate Select, Badge, and Tag

**Files:**
- Modify: `scripts/shared-ui-theme-foundation.test.mjs`
- Modify: `src/web-ui/src/component-library/components/Select/Select.scss`
- Modify: `src/web-ui/src/component-library/components/Badge/Badge.scss`
- Modify: `src/web-ui/src/component-library/components/Tag/Tag.scss`

- [ ] **Step 1: Extend the contract test**

Add file reads and this assertion:

```js
test('selection and label primitives consume control and status aliases', () => {
  const select = read('src/web-ui/src/component-library/components/Select/Select.scss');
  const labels = [
    read('src/web-ui/src/component-library/components/Badge/Badge.scss'),
    read('src/web-ui/src/component-library/components/Tag/Tag.scss'),
  ].join('\n');

  for (const token of [
    '--control-bg', '--control-bg-hover', '--control-border', '--control-border-focus',
    '--control-text', '--control-text-muted', '--control-focus-ring', '--control-disabled-opacity',
  ]) {
    assert.match(select, new RegExp(`var\\(${token}\\)`));
  }

  for (const tone of ['neutral', 'info', 'success', 'warning', 'error']) {
    assert.match(labels, new RegExp(`var\\(--status-${tone}-bg\\)`));
    assert.match(labels, new RegExp(`var\\(--status-${tone}-text\\)`));
  }
});
```

- [ ] **Step 2: Confirm red**

Run `node --test scripts/shared-ui-theme-foundation.test.mjs`.

Expected: FAIL on missing shared aliases in Select/Badge/Tag.

- [ ] **Step 3: Migrate SCSS without changing React behavior**

Apply this mapping consistently:

```scss
// Select trigger/dropdown/option states
background: var(--control-bg);
border-color: var(--control-border);
color: var(--control-text);

// Hover and selection
background: var(--control-bg-hover);
border-color: var(--control-border-hover);

// Focus and error
outline-color: var(--control-focus-ring);
border-color: var(--control-border-focus);
// Error selectors use --status-error-border/text/bg.

// Disabled
opacity: var(--control-disabled-opacity);
```

Badge and Tag variants use the matching neutral, info, success, warning, or error `--status-*-bg`, `--status-*-border`, and `--status-*-text` family. Preserve compact padding and existing variant/class names.

- [ ] **Step 4: Confirm green**

Run `node --test scripts/shared-ui-theme-foundation.test.mjs`.

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add scripts/shared-ui-theme-foundation.test.mjs src/web-ui/src/component-library/components/Select/Select.scss src/web-ui/src/component-library/components/Badge/Badge.scss src/web-ui/src/component-library/components/Tag/Tag.scss
git commit -m "refactor(ui): unify selection and label theme states"
```

## Task 4: Migrate Card, Panel, and Alert Feedback

**Files:**
- Modify: `scripts/shared-ui-theme-foundation.test.mjs`
- Modify: `src/web-ui/src/component-library/components/Card/Card.scss`
- Modify: `src/web-ui/src/app/components/panels/base/FlexiblePanel.scss`
- Modify: `src/web-ui/src/app/components/panels/base/PanelHeader.scss`
- Modify: `src/web-ui/src/component-library/components/Alert/Alert.scss`

- [ ] **Step 1: Add panel/status contract assertions**

```js
test('cards, panels, and alerts consume shared aliases', () => {
  const surfaces = [
    read('src/web-ui/src/component-library/components/Card/Card.scss'),
    read('src/web-ui/src/app/components/panels/base/FlexiblePanel.scss'),
    read('src/web-ui/src/app/components/panels/base/PanelHeader.scss'),
  ].join('\n');
  const alert = read('src/web-ui/src/component-library/components/Alert/Alert.scss');

  for (const token of ['--control-bg', '--control-border', '--control-radius']) {
    assert.match(surfaces, new RegExp(`var\\(${token}\\)`));
  }
  for (const tone of ['info', 'success', 'warning', 'error']) {
    for (const role of ['bg', 'border', 'text']) {
      assert.match(alert, new RegExp(`var\\(--status-${tone}-${role}\\)`));
    }
  }
});
```

- [ ] **Step 2: Confirm red**

Run the focused Node test; expect missing alias failures.

- [ ] **Step 3: Apply the shared surface and status mappings**

Card/FlexiblePanel/PanelHeader retain their display, flex, resize, and header-layout declarations. Replace only semantically matching surface, border, radius, text, hover, and focus values:

```scss
background: var(--control-bg);
border-color: var(--control-border);
border-radius: var(--control-radius);
color: var(--control-text);
```

Alert variants use concrete declarations for each selector:

```scss
.alert--info { background: var(--status-info-bg); border-color: var(--status-info-border); color: var(--status-info-text); }
.alert--success { background: var(--status-success-bg); border-color: var(--status-success-border); color: var(--status-success-text); }
.alert--warning { background: var(--status-warning-bg); border-color: var(--status-warning-border); color: var(--status-warning-text); }
.alert--error { background: var(--status-error-bg); border-color: var(--status-error-border); color: var(--status-error-text); }
```

- [ ] **Step 4: Confirm green and type safety**

```powershell
node --test scripts/shared-ui-theme-foundation.test.mjs
pnpm run type-check:web
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add scripts/shared-ui-theme-foundation.test.mjs src/web-ui/src/component-library/components/Card/Card.scss src/web-ui/src/app/components/panels/base/FlexiblePanel.scss src/web-ui/src/app/components/panels/base/PanelHeader.scss src/web-ui/src/component-library/components/Alert/Alert.scss
git commit -m "refactor(ui): unify panel and feedback theme states"
```

## Task 5: Integrate Review Platform

**Files:**
- Modify: `scripts/shared-ui-theme-foundation.test.mjs`
- Modify: `src/web-ui/src/app/components/panels/review-platform/ReviewPlatformPanel.scss`
- Do not modify: `src/web-ui/src/app/components/panels/review-platform/ReviewPlatformPanel.tsx`

- [ ] **Step 1: Add a Review Platform contract test**

```js
test('Review Platform consumes shared control and status aliases', () => {
  const review = read('src/web-ui/src/app/components/panels/review-platform/ReviewPlatformPanel.scss');
  for (const token of [
    '--control-bg', '--control-bg-hover', '--control-border', '--control-text',
    '--control-text-muted', '--control-focus-ring', '--control-disabled-opacity',
    '--status-neutral-bg', '--status-info-bg', '--status-success-bg',
    '--status-warning-bg', '--status-error-bg',
  ]) {
    assert.match(review, new RegExp(`var\\(${token}\\)`), `Review Platform must consume ${token}`);
  }
});
```

- [ ] **Step 2: Confirm red**

Run `node --test scripts/shared-ui-theme-foundation.test.mjs`.

Expected: FAIL because Review Platform still uses its local color/fallback layer.

- [ ] **Step 3: Migrate Review Platform selectors in priority order**

Use the following exact semantic mapping while preserving all selectors and layout declarations:

```scss
// Panels, rows, cards, dropdowns
background: var(--control-bg);
border-color: var(--control-border);
color: var(--control-text);

// Hover/focus/disabled
background: var(--control-bg-hover);
outline-color: var(--control-focus-ring);
opacity: var(--control-disabled-opacity);

// Status chips, error/loading/empty surfaces use the concrete families:
// --status-neutral-*, --status-info-*, --status-success-*,
// --status-warning-*, and --status-error-*.
```

Map each existing tone class to its same-named status family. Keep diff additions/deletions, provider brand colors, and syntax content unchanged unless they already match an existing semantic token exactly.

- [ ] **Step 4: Verify the product boundary stayed intact**

```powershell
git diff --exit-code -- src/web-ui/src/app/components/panels/review-platform/ReviewPlatformPanel.tsx
node --test scripts/shared-ui-theme-foundation.test.mjs
pnpm run type-check:web
```

Expected: TSX diff is empty, the contract passes, and TypeScript exits 0.

- [ ] **Step 5: Commit**

```powershell
git add scripts/shared-ui-theme-foundation.test.mjs src/web-ui/src/app/components/panels/review-platform/ReviewPlatformPanel.scss
git commit -m "refactor(ui): align Review Platform theme states"
```

## Task 6: Full Verification, Baseline Update, and Push

**Files:**
- Possibly modify: `scripts/theme-color-governance-baseline.json` only when measured values decrease.

- [ ] **Step 1: Run the complete verification set**

```powershell
node --test scripts/shared-ui-theme-foundation.test.mjs
pnpm run check:theme-colors
pnpm run check:theme-visual-contract
pnpm run type-check:web
$env:TZ='Asia/Shanghai'; pnpm --dir src/web-ui run test:run
```

Expected: every command exits 0; the fixed timezone avoids the pre-existing timezone-dependent automation test failure.

- [ ] **Step 2: Update the governance baseline only when the audit asks for a lower maximum**

If `check:theme-colors` fails only because a metric improved below its stored maximum, lower exactly that numeric maximum to the reported value in `scripts/theme-color-governance-baseline.json`, then rerun:

```powershell
node --test scripts/audit-theme-colors.test.mjs
pnpm run check:theme-colors
```

Never raise a threshold or add an allowlist entry.

- [ ] **Step 3: Build the isolated component preview**

```powershell
pnpm run build-components
```

Expected: Vite preview build exits 0 and writes `dist-preview`.

- [ ] **Step 4: Review the final diff and boundary constraints**

```powershell
git diff --check
git status --short
git diff --name-only 06ab57d32..HEAD
```

Expected: no whitespace errors; changed product files are limited to the planned SCSS/token paths, the contract test, optional lowered baseline, spec, and plan. No backend, API, adapter, store, session, Agent, or Review Platform TSX files appear.

- [ ] **Step 5: Commit the lowered baseline if needed**

```powershell
git add scripts/theme-color-governance-baseline.json
git commit -m "chore(theme): lower color debt baseline"
```

Skip this commit when the baseline file did not change.

- [ ] **Step 6: Push and verify the remote head**

```powershell
git push origin baseline/void-source-20260702
$local = git rev-parse HEAD
$remote = (git ls-remote origin refs/heads/baseline/void-source-20260702).Split("`t")[0]
if ($local -ne $remote) { throw "Remote head mismatch" }
```

Expected: push succeeds and local/remote commit hashes match.
