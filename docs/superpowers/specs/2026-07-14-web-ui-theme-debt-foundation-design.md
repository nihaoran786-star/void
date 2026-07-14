# Web UI Theme Debt Foundation Design

## Status

Approved direction: token-first vertical slice, conservative visual treatment.

## Goal

Reduce the first tranche of Web UI theme debt by giving six shared primitive families one semantic control contract and making Review Platform the first product surface to consume it. Preserve the current dark/blue visual identity and all existing product behavior.

## Scope

### In scope

- Shared control aliases derived from existing theme variables for:
  - surface, border, text, focus ring, disabled opacity;
  - control heights, icon sizes, radius, and spacing;
  - success, warning, error, info, and neutral status surfaces.
- Shared primitives:
  - `Button`;
  - `IconButton`;
  - `Select`;
  - `Badge` and `Tag`;
  - `Card`, `FlexiblePanel`, and `PanelHeader`;
  - `Alert` and status feedback styles reused by Review Platform.
- Review Platform style migration to the shared aliases where the values represent the same semantics.
- Small visual normalization of height, padding, radius, icon size, hover, active, focus-visible, loading, error, and disabled states.
- Focused contract tests that prevent the migrated selectors from reintroducing raw visual colors or private fallback values.

### Out of scope

- Layout reordering or information-architecture changes.
- New component props or changes to existing prop meanings.
- Agent, review-team, session, chat, route, store, API, adapter, Tauri, filesystem, or backend behavior.
- Theme preset schema changes or new themes.
- Full application reskin, gradients, glass effects, glow effects, or a new color palette.
- Media, short-drama, editor, terminal, navigation, and general Flow Chat migration in this slice.

## Architecture

The dependency direction is:

```text
Review Platform markup
  -> existing shared primitive APIs and Review Platform CSS classes
  -> semantic control/status CSS variables
  -> existing element, border, text, accent, semantic, radius, spacing, and motion variables
  -> ThemeService and theme presets
```

No primitive may import Review Platform code or understand review states. Review Platform maps its already-existing presentation classes such as success, warning, error, pending, and neutral to shared status variables. ThemeService remains the only runtime theme injection layer.

## Token Contract

The component-library root token block will expose a compact alias layer. Aliases must reference existing CSS variables rather than copy raw colors.

### Controls

- `--control-bg`, `--control-bg-hover`, `--control-bg-active`
- `--control-border`, `--control-border-hover`, `--control-border-focus`
- `--control-text`, `--control-text-hover`, `--control-text-muted`
- `--control-focus-ring`, `--control-disabled-opacity`
- `--control-radius`
- `--control-height-xs`, `--control-height-sm`, `--control-height-md`, `--control-height-lg`
- `--control-square-xs`, `--control-square-sm`, `--control-square-md`, `--control-square-lg`
- `--control-icon-xs`, `--control-icon-sm`, `--control-icon-md`, `--control-icon-lg`

The aliases preserve the current effective sizes unless an existing primitive disagrees with the established 24/28/32/40 icon-button scale or 32/40/48 text-control scale. Normalization may change local duplicate values but may not change page layout.

### Status feedback

For each of `neutral`, `info`, `success`, `warning`, and `error`, define a `bg`, `border`, and `text` variable, producing the concrete families `--status-neutral-*`, `--status-info-*`, `--status-success-*`, `--status-warning-*`, and `--status-error-*`.

These aliases derive from the existing element, accent, and semantic theme variables. Components must not add a second status palette.

## Component Migration

### Button and IconButton

- Preserve all variants, sizes, loading behavior, tooltips, and disabled semantics.
- Replace repeated raw hover, active, focus, danger, success, warning, and AI colors with control/status aliases or existing accent variables.
- Use explicit transition properties; do not use `transition: all` for the migrated base states.
- Preserve current class names so downstream consumers do not change.

### Select

- Preserve controlled/uncontrolled behavior, search, multiselect, placement, keyboard navigation, errors, and custom values.
- Normalize trigger heights, radius, border, focus ring, option hover/selected states, tags, and error feedback through shared aliases.
- Do not change TypeScript behavior or selection state logic.

### Badge and Tag

- Preserve variants and markup.
- Map semantic variants to the shared status aliases.
- Keep compact sizing; do not inflate badges to button dimensions.

### Card and Panel

- `Card` uses shared surface, border, radius, focus, and interaction aliases.
- `FlexiblePanel` and `PanelHeader` consume compatible surface/border/spacing aliases without changing split, resize, header action, or layout behavior.
- No new generic Panel React abstraction is introduced.

### Status feedback

- `Alert` becomes the reference consumer for the five status tones.
- Review Platform error, empty, loading, CI status, thread tag, and summary chips reuse the same status aliases while retaining their existing selectors and markup.

## Review Platform Integration

Only `ReviewPlatformPanel.scss` is changed in the product surface unless a focused contract test requires a test file. `ReviewPlatformPanel.tsx` remains behaviorally unchanged.

Migration priority inside the stylesheet:

1. panel and card surfaces;
2. panel buttons and icon buttons;
3. CI/review/file status chips;
4. loading, empty, and error feedback;
5. focus-visible and disabled states.

Review-specific layout variables may remain local. Raw colors that encode third-party content, syntax/diff semantics, or provider branding remain untouched unless an existing theme semantic variable is an exact match.

## Error and State Handling

This slice introduces no new runtime state and no new error paths. Existing UI status classes remain the source of presentation tone. Missing custom properties remain safe because the alias layer is defined at the component-library root and ultimately resolves to existing ThemeService variables. Migrated component selectors should not carry raw-color fallback values.

## Testing and Verification

### Automated contract coverage

- Add a focused Node test for the shared control/status alias definitions and migrated component selectors.
- Add or extend a Review Platform theme contract test to assert that migrated selectors use the shared aliases and do not reintroduce raw colors for the covered states.
- Run existing component tests for Button, IconButton, Select, Badge, Tag, Card, Alert, FlexiblePanel, and Review Platform where such tests exist.

### Required commands

```powershell
node --test scripts/shared-ui-theme-foundation.test.mjs
pnpm run check:theme-colors
pnpm run check:theme-visual-contract
pnpm run type-check:web
pnpm --dir src/web-ui run test:run <focused test paths>
```

### Manual review

- Build the component preview and inspect every variant/state of the six primitive families.
- Inspect Review Platform at its current layout width in default dark and light themes.
- Confirm no clipping, row-height shift, focus loss, or status ambiguity.

## Acceptance Criteria

- The six primitive families consume one semantic control/status alias layer.
- Review Platform consumes the shared aliases for the covered surfaces and states.
- Existing component props, class names, layout, business behavior, and runtime boundaries remain unchanged.
- Raw visual color and fallback counts do not increase; the touched component and Review Platform files show a measurable decrease.
- Focus-visible, hover, active, loading, error, and disabled states remain distinguishable.
- Focused tests, theme color audit, visual contract, and Web UI type-check pass.
- The implementation is committed and pushed to `nihaoran786-star/void` on `baseline/void-source-20260702`.
