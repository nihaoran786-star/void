# Quiet Directory Design System — Entity Glyphs and Hairline Catalogs

Status: current specification for the entity iconography and directory-layout
language used by the Minimal presentation. It complements, and does not
replace, [Porcelain Air](porcelain-graphite-design-system.md) (theme tokens,
materials) and
[Interaction and Theme Governance](../features/interaction-theme-governance.md)
(presentation-only boundaries).

Selected: 2026-08-12 (orb), 2026-08-13 (sigil / link / directory rows).
Automation-page application: 2026-08-13, calendar structure preserved by
owner direction.

Scope discipline: every rule below is presentation-only. Runtime,
persistence, Skill policy, session lifecycle, and calendar/scheduling logic
are untouched. Classic keeps its card-grid geometry; the quiet language
projects through `*.minimal.scss` under `.void-ui--minimal` only, except the
entity glyphs themselves, which are shared components in both presentations.

## 1. Principle

**少即是多 (less is more).** A page should read as a timetable, not a pile of
cards. Visual weight is spent only on two things: the entity's own glyph and
its current state. Everything else — filters, counts, actions — recedes into
hairlines, monospace meta, and hover.

Three entity species, three glyph behaviors:

| Species | Glyph | Behavior |
| --- | --- | --- |
| Agent 智能体 | **Orb** — animated dot-field sphere | Living: animates when selected or running, static when idle, dimmed when off |
| Skill 技能 | **Sigil** — 4×4 mirrored dot rune | Tool: never moves; disabled dims to 28% |
| Connector 连接器 | **Link** — two endpoints + a route | Channel: state *is* the visual — solid / broken / pulse / error dash |

Glyphs are deterministic: an FNV-1a hash of the entity identity selects the
form (orb motion pattern, sigil cells, link route), so every entity owns a
permanent mark with no hand-maintained icon mapping. Ink always comes from
`currentColor` / theme tokens — no hex, `rgba()`, or gradient literals in
Minimal projections.

## 2. Entity glyph specifications

### 2.1 Agent Orb

- Canvas-rendered point cloud; one of nine motion patterns chosen by identity
  hash. Color is read from `getComputedStyle(canvas).color`, so themes stay
  authoritative.
- States: `idle` (enabled, static), `off` (disabled, dimmed), `active`
  (selected — animates), `running` (executing — animates, with elapsed time
  rendered next to it).
- Implementation: `src/web-ui/src/app/scenes/agents/components/orbAvatarEngine.ts`,
  `AgentAvatar.tsx`.

### 2.2 Skill Sigil

- `resolveSigilCells(identity)` returns 8 cells (4 rows × 2 left columns);
  the right half mirrors at render time. Never all-empty or all-full.
- Pure SVG, `fill="currentColor"`, sizes `card` = 20px / `detail` = 30px.
  Disabled = 28% opacity. No animation, ever.
- Implementation: `src/web-ui/src/app/scenes/skills/components/skillSigil.ts`,
  `SkillCatalogAvatar.tsx`, `SkillCatalogAvatar.scss`.

### 2.3 Connector Link

- `resolveLinkPath(identity)` picks one of four routes: straight
  (`M3,10 L17,10`), arc up (`Q10,2`), arc down (`Q10,18`), polyline
  (`L7,6 L13,14`). Endpoints are fixed dots at (3,10) and (17,10), r=2.
- States: `connected` = solid route; `idle` = dashed route at reduced opacity
  (default); `connecting` = faint route plus one pulse traveling the path via
  SMIL `animateMotion` — the only connector animation, because a channel is
  literally alive only while connecting; `error` = tight dash in the error
  ink.
- Installed-catalog mapping: connected → `connected`, transitioning/busy →
  `connecting`, stopped → `idle`, attention → `error`. Marketplace mapping:
  installed → `connected`, installing → `connecting`, install error →
  `error`, otherwise `idle`.
- Implementation: `src/web-ui/src/infrastructure/config/components/linkGlyph.ts`,
  `ConnectorCatalogAvatar.tsx`, `ConnectorCatalogAvatar.scss`. The legacy
  keyword→icon mapping (`connectorCatalogIcons.ts`) is retained but no longer
  drives the avatar.

## 3. Directory layout language

Applied identically to Agents, Skills, Connectors (installed + marketplace),
and the Automation list view:

1. **Hairline section header** — small strong label + flexible 1px rule +
   right-aligned monospace count. No panel chrome.
2. **Monospace text chips** for filters/tabs — no pill background; active =
   4px accent dot at the left edge (`padding-left: 9px`) + strong text.
3. **Frameless rows** — `border-top` 1px hairline between rows, transparent
   background; hover never paints a fill, it only brightens text and reveals
   operations. (Automation list rows keep their priority bar; calendar cell
   task cards keep the established quiet calendar look.)
4. **Monospace meta right-aligned** — status badges, ids, transport types,
   times and counts become plain `var(--font-family-mono)` text; badge pills,
   icons, and tinted backgrounds are removed in Minimal. Status color
   semantics survive: connected/neutral → muted, transitioning → accent,
   error → error text token.
5. **Operations collected into hover** — row actions render at opacity 0 and
   fade in on hover/focus-within; `@media (hover: none)` keeps them visible.
6. **One loud action** — the single primary verb (add skill, add connector,
   create task) is a quiet text button: strong text, accent `+` icon, accent
   hover, no fill.
7. **Underline search** — the search control loses its filled box; only a
   bottom hairline remains, focus ring preserved.

## 4. Theme

曜岩 (dark) and 霜白 (light) both work because glyphs and rows consume
workspace tokens (`--workspace-text-*`, `--workspace-border-subtle`,
`--workspace-accent`, `--workspace-status-*`). No page owns a palette.

## 5. Motion discipline

Only alive things move: orb `active`/`running`, link `connecting`. Chips,
rows, and panels use opacity/color transitions on the shared
`--workspace-motion-fast` / `--workspace-easing-standard` contract.
`prefers-reduced-motion` removes transitions and hides the link pulse.

## 6. Application status and implementation index

| Page | Status | Projection |
| --- | --- | --- |
| Agents 智能体 | Applied (orbs + rows) | `app/scenes/agents/AgentsScene.minimal.scss` |
| Skills 技能 | Applied (sigils + rows) | `app/scenes/skills/SkillsScene.minimal.scss` |
| Connectors 连接器 | Applied (links + rows, installed + marketplace) | `infrastructure/config/components/McpToolsConfig.minimal.scss`, `ConnectorMarketplacePanel.scss` (minimal block) |
| Automation 自动化 | Applied to chrome + list view; **calendar grid, scheduling logic and detail dialog intentionally unchanged** | `app/scenes/automation/AutomationScene.minimal.scss` |

Automation specifics: view switcher became mono chips, create-task became the
single quiet action, list groups became hairline section headers, times and
calendar numerals render in tabular monospace. Week/Month/Day grids keep
their structure — the calendar is the product surface, not a card list.

Contract coverage: `MinimalClassicIsolation.test.ts`,
`CustomizationMarketPresentation.test.ts`,
`AutomationScene.visual-contract.test.ts`, `linkGlyph.test.ts`,
`SkillCatalogAvatar.test.tsx`. Typography governance: all mono usages go
through the canonical `var(--font-family-mono)` token, so
`literalMonoBaseline` is unchanged.

## 7. Applying the language to a new page

1. Give each entity a glyph from its species table; never invent a fourth
   animated species without owner sign-off.
2. Restructure lists as hairline rows; collect secondary actions into hover.
3. Convert filters/tabs to mono chips; keep exactly one quiet primary action.
4. Scope every rule under `.void-ui--minimal`; Classic geometry stays.
5. Add or update the presentation contract test in the same change.
