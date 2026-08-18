# Quiet Directory Design System — Automation Chrome and List View

Status: current specification for the Automation surface only. The Agents,
Skills and Connectors catalogs moved to
[Catalog and Sidebar](catalog-and-sidebar-design-system.md) on 2026-08-18; the
entity-glyph table, the hairline-row language and the per-catalog application
rows that used to live here were superseded by it and have been removed rather
than left to contradict it.

It complements, and does not replace,
[Porcelain Air](porcelain-graphite-design-system.md) (theme tokens, materials)
and
[Interaction and Theme Governance](../features/interaction-theme-governance.md)
(presentation-only boundaries).

Selected: 2026-08-13. Automation-page application: 2026-08-13, calendar
structure preserved by owner direction.

Scope discipline: every rule below is presentation-only. Runtime, persistence,
Skill policy, session lifecycle and calendar/scheduling logic are untouched. The
quiet language projects through `AutomationScene.minimal.scss` under
`.void-ui--minimal` only.

## 1. Principle

**少即是多 (less is more).** The Automation page should read as a timetable, not
a pile of cards. Visual weight is spent only on the current state; filters,
counts and actions recede into hairlines, monospace meta and hover.

## 2. Layout language

Applied to the Automation chrome and its list view:

1. **Hairline section header** — small strong label + flexible 1px rule +
   right-aligned monospace count. No panel chrome.
2. **Monospace text chips** for the view switcher — no pill background; active =
   4px accent dot at the left edge (`padding-left: 9px`) + strong text.
3. **Frameless rows** — `border-top` 1px hairline between rows, transparent
   background; hover never paints a fill, it only brightens text and reveals
   operations. List rows keep their priority bar; calendar cell task cards keep
   the established quiet calendar look.
4. **Monospace meta right-aligned** — times and counts render in tabular
   monospace. Status colour semantics survive: neutral → muted, transitioning →
   accent, error → error text token.
5. **Operations collected into hover** — row actions render at opacity 0 and
   fade in on hover/focus-within; `@media (hover: none)` keeps them visible.
6. **One loud action** — create task is a quiet text button: strong text, accent
   `+` icon, accent hover, no fill.
7. **Underline search** — the search control loses its filled box; only a bottom
   hairline remains, focus ring preserved.

## 3. Theme

曜岩 (dark) and 霜白 (light) both work because rows consume workspace tokens
(`--workspace-text-*`, `--workspace-border-subtle`, `--workspace-accent`,
`--workspace-status-*`). No page owns a palette.

## 4. Motion discipline

Chips, rows and panels use opacity/colour transitions on the shared
`--workspace-motion-fast` / `--workspace-easing-standard` contract.
`prefers-reduced-motion` removes transitions.

## 5. Application status

| Page | Status | Projection |
| --- | --- | --- |
| Automation 自动化 | Applied to chrome + list view; **calendar grid, scheduling logic and detail dialog intentionally unchanged** | `app/scenes/automation/AutomationScene.minimal.scss` |

Automation specifics: the view switcher became mono chips, create-task became
the single quiet action, list groups became hairline section headers, and times
and calendar numerals render in tabular monospace. Week/Month/Day grids keep
their structure — the calendar is the product surface, not a card list.

Typography governance: all mono usages go through the canonical
`var(--font-family-mono)` token, so `literalMonoBaseline` is unchanged.
