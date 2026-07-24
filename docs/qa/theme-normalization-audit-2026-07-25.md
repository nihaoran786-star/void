# Theme normalization audit — 2026-07-25

This checkpoint audits the Minimal presentation of Assistant, Automation, and
Professional Agents in the real desktop shell. It is dated evidence, not a
permanent statement of repository quality.

## Audit health score

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Accessibility | 3/4 | Interactive controls expose visible labels or accessible names and retain focus styling. Compact 28px filter chips remain a desktop-first target and need a separate touch-input policy before claiming full AA target sizing. |
| Performance | 4/4 | Agent cards use `content-visibility`, bounded intrinsic sizing, and reduced-motion fallbacks. The audited pages introduce no decorative media, blur, or unbounded animation. |
| Responsive design | 3/4 | Assistant and Automation have zero document overflow at a 719px WebView. Professional Agents originally clipped its second filter group; the remediation below makes every filter control visible with zero overflow. |
| Theming | 4/4 | Audited Minimal surfaces consume workspace color, typography, spacing, radius, focus, and status tokens. No new literal color is required by the remediation. |
| Anti-patterns | 3/4 | Hierarchy is compact and restrained. Professional Agents still relies heavily on repeated equal-weight cards, which is functional but weakens scan hierarchy for large catalogs. |
| **Total** | **17/20** | **Good — remaining debt is refinement rather than a structural redesign.** |

## Anti-pattern verdict

The audited pages do not present the usual gradient, glow, glass, oversized
metric, or decorative hero-image signatures. Professional Agents does retain a
dense repeated-card catalog; this is a P3 hierarchy concern, not a reason to
replace the working gallery or add decorative imagery.

## Findings

### P1 — Narrow Professional Agents filters were clipped

- **Location:** `src/web-ui/src/app/scenes/agents/AgentsScene.minimal.scss`
- **Category:** Responsive design
- **Impact:** At a 719px WebView, the `来源` and `类型` groups each inherited
  `width: 100%` while their parent forced `flex-wrap: nowrap`. The second group
  started beyond the content viewport, hiding the `智能体` and `子智能体`
  controls without a visible overflow affordance.
- **Remediation:** At 720px and below, the Minimal projection now wraps filter
  groups and disables the conflicting horizontal overflow rule. Runtime agent
  filtering, counts, creation, and gallery data remain unchanged.
- **Evidence:** Before remediation the second group occupied x=697–1119 in a
  719px WebView and three controls were outside the viewport. After remediation
  both rows occupy x=268–689, all five filter buttons are inside the viewport,
  and document width remains 719/719.

### P2 — Compact controls do not yet define a touch-input policy

- **Location:** Shared gallery chips and Automation toolbar controls
- **Category:** Accessibility / responsive design
- **Impact:** The 28px controls are precise for mouse-driven desktop use but do
  not independently satisfy a 44px touch-target recommendation on hybrid
  devices.
- **Recommendation:** Add a pointer-coarse presentation override at the shared
  gallery and toolbar layer rather than enlarging desktop controls globally.

### P3 — Large agent catalogs have uniform card emphasis

- **Location:** Professional Agents gallery
- **Category:** Anti-pattern / information hierarchy
- **Impact:** Core agents, teams, and the general catalog are separated by
  headings, but repeated equal-weight cards make long scans visually uniform.
- **Recommendation:** Preserve the existing card component and progressively
  disclose secondary metadata on narrow views; do not introduce decorative
  portraits or another card implementation.

### Resolved follow-up — Skills search controls over-expanded on wide layouts

- **Location:** `src/web-ui/src/app/scenes/skills/SkillsScene.minimal.scss`
- **Category:** Responsive design / design-system consistency
- **Impact:** The installed Skills search inherited `flex: 1` and expanded to
  1,063px at a maximized WebView, while the Market search occupied 469px.
  Both became the dominant visual surface despite being secondary toolbar
  controls.
- **Remediation:** The Minimal projection gives both search controls the same
  360px wide-layout axis. Installed Skills keeps `margin-right: auto` so its
  existing duplicate and add actions remain right-aligned. Existing
  container/media rules still promote both controls to the full available
  width on narrow layouts.
- **Evidence:** Maximized desktop measurements are 360px for both installed
  and Market search. At a 719px WebView they adapt to 431px and 423px
  respectively, and the document remains 719/719 with no horizontal overflow.
  Search, filtering, installation, pagination, and persistence paths are
  unchanged.

### Resolved follow-up — Gallery zone counts looked interactive

- **Location:** `src/web-ui/src/app/components/GalleryLayout/GalleryLayout.minimal.scss`
  and feature-local Gallery projections
- **Category:** Visual hierarchy / anti-pattern
- **Impact:** Passive zone totals in Assistant, Professional Agents, and Mini
  Apps used the same bordered 28px badge geometry as interactive controls.
  Assistant also inherited `margin-left: auto`, placing its count roughly
  900px away from the section title.
- **Remediation:** The shared Minimal Gallery projection now presents zone
  totals as borderless tabular metadata. Feature-local 28px overrides in
  Professional Agents and Mini Apps were removed; Assistant retains only its
  intentional title-adjacent alignment. Interactive filter counts remain
  compact badges.
- **Evidence:** At maximized width the count moves from x=1509 to x=531 beside
  the heading; at a 719px WebView it remains beside the heading at x=390. The
  Agents zone totals resolve to 6–13px text bounds without borders while its
  five filter counts retain 16–21px badge bounds. The user filter still changes
  the visible agent catalog from 10 to 5 and restores to the built-in filter.
  Full and 719px documents have zero horizontal overflow.

### Resolved follow-up — Office examples crowded the new-task heading

- **Location:** `src/web-ui/src/app/scenes/session/ChatPane.scss`
- **Category:** Onboarding hierarchy / responsive design
- **Impact:** The optional office examples started before the session-type
  switch had ended, visually crowding the fixed new-task heading even though
  the examples were already outside normal document flow.
- **Remediation:** The examples remain absolutely positioned so their content
  cannot move the heading or type switch. Their content axis is reduced to
  276px, cards to 20px, and the group begins below the type switch with a
  stable gap.
- **Evidence:** At maximized width the heading and switch retain their original
  y=254 and y=292 positions; the switch ends at y=323 and examples begin at
  y=336. At a 719×498 WebView the switch ends at y=190 and examples begin at
  y=195. Both documents retain zero horizontal overflow.

### Resolved follow-up — Mini App cards retained legacy visual effects

- **Location:** `src/web-ui/src/app/scenes/miniapps/views/MiniAppGalleryView.minimal.scss`
- **Category:** Performance / anti-pattern / theming
- **Impact:** The compact Minimal cards still inherited the classic card's
  inline purple-blue gradient, blur, bounce easing, scale-on-hover, glow dots,
  heavy font weight, and large shadow. The previous presentation contract only
  proved that the Minimal stylesheet contained no decorative literals; it did
  not prove that inherited classic effects were neutralized.
- **Remediation:** The Minimal projection now explicitly removes both gradient
  paint layers, animations, blur, scaling, glow, and shadows. Cards, tags,
  status dots, typography, hover states, and actions use shared workspace
  tokens. Classic presentation and Mini App behavior remain unchanged.
- **Evidence:** A rendered card reports `animation-name: none`,
  `transform: none`, `box-shadow: none`, and tokenized 13px/600 title type.
  Both inherited gradient pseudo-elements resolve to `display: none`, and the
  icon surface reports `backdrop-filter: none`. Full and 719px gallery views
  retain zero horizontal overflow.

### Resolved follow-up — Mini App customization looked detached and could clip

- **Location:** `src/web-ui/src/app/scenes/miniapps/MiniAppScene.minimal.scss`
- **Category:** Responsive design / accessibility / visual hierarchy
- **Impact:** The customization surface appeared as a rounded floating card
  with a 24px/70px shadow beside the running app. At a 719×498 WebView its
  existing content consumed nearly the full available height while the panel
  used `overflow: hidden`; an update notice, error, or editor session could
  make actions unreachable.
- **Remediation:** A Minimal-only scene projection integrates customization as
  a border-separated split panel with no decorative shadow. The panel is
  vertically scrollable, keeps its header and footer sticky, and becomes a
  complete edge-to-edge content overlay at 720px and below. The running Mini
  App, draft lifecycle, BTW editor session, permission confirmation, and apply
  flow are untouched.
- **Evidence:** At maximized width the panel occupies a bounded 520px axis,
  fills the scene height, and reports `overflow-y: auto` with no shadow. At a
  719×498 WebView it occupies the complete 455×410 content region; the 28px
  close control and sticky footer remain visible, and document width remains
  719/719. The narrow gallery title is also visible again instead of leaving
  an empty header beside its actions.

### Resolved follow-up — Agent configuration pages retained legacy decoration

- **Location:** `src/web-ui/src/app/scenes/agents/components/CreateAgentPage.minimal.scss`
  and `ReviewTeamPage.minimal.scss`
- **Category:** Theming / responsive design / action reachability
- **Impact:** New-agent configuration inherited a gradient editor bar,
  animation, a dense free-flowing tool cloud, and actions that could fall below
  a short desktop viewport. Review Team layered gradients and card shadows
  across summaries, policy metrics, members, and details; at narrow widths its
  summary cards and six-row member list dominated the first screen.
- **Remediation:** Both pages now use feature-local Minimal projections over
  shared workspace tokens. New-agent mode selection is a compact segmented
  control, tools use a bounded responsive grid, and actions remain sticky
  inside the scroll region. Review Team uses flat semantic surfaces, compact
  summary rows, divider-based metrics, a two-column narrow member selector,
  and a single-column policy panel below 960px. Runtime, model selection,
  review policy, session, and persistence paths are unchanged.
- **Evidence:** At a 719×498 WebView the new-agent action row remains visible,
  project/tool selection succeeds, and the document is 719/719 with no
  horizontal overflow. Review Team measures a 176.6px summary block and a
  single 378px policy column; member switching updates the detail view and the
  document remains 719/719. Full-width views preserve their bounded content
  axes without gradients, shadows, or entrance animation.

### Resolved follow-up — ACP settings expanded into card-like rows

- **Location:** `src/web-ui/src/infrastructure/config/components/AcpAgentsConfig.minimal.scss`
  and `AcpAgentsConfig.tsx`
- **Category:** Responsive design / theming / accessibility / localization
- **Severity before remediation:** P1 responsive density, P2 visual-system and
  localization drift
- **Impact:** The page used a viewport-level 860px breakpoint for a component
  rendered inside a much narrower settings panel. At a 719px WebView every
  agent row collapsed into four stacked blocks, leaving only one partial agent
  visible. Toolbar actions also split across multiple lines and Chinese
  surfaces retained English generic Agent labels and descriptions.
- **Remediation:** A feature-owned Minimal projection now uses the existing
  `config-panel` container contract. Wide rows remain 48px four-column records;
  narrow rows become two-level records with name/description followed by
  capability, state, and action. Secondary toolbar actions become compact
  icon controls only inside the narrow container and retain explicit accessible
  names and titles. Generic Chinese Agent wording and preset descriptions are
  localized without changing provider names, probes, installation, JSON
  editing, or persistence.
- **Focused audit score:** 13/20 before remediation; 19/20 after remediation
  (A11y 3, performance 4, responsive 4, theming 4, anti-patterns 4).
- **Evidence:** At maximized width the toolbar remains a single 840×32px row
  and each registry row measures about 48px. At a 719×498 WebView the document
  remains 719/719, search measures 379×32px, all three preset rows remain in
  one continuous list at about 84px each, and the toolbar stays within its
  379px content axis. Searching for `codex` leaves exactly one visible row;
  raw JSON opens and closes without modifying the configuration.
- **Gate note:** The locale contract passes. The full i18n source audit remains
  blocked by the pre-existing short-drama CJK source count (31 candidates
  against a budget of 25); none of those service files are part of this change.

### Resolved follow-up — MCP empty state had no explanatory hierarchy

- **Location:** `src/web-ui/src/infrastructure/config/components/McpToolsConfig.tsx`
  and `McpToolsConfig.scss`
- **Category:** Empty-state usability / visual hierarchy / responsive design
- **Severity before remediation:** P2
- **Impact:** With no configured MCP servers, the maximized settings page showed
  only a detached `JSON 配置` button beneath the list heading. The action was
  functional but did not explain the current state or what configuring it would
  accomplish, while the remaining 840px content axis appeared unfinished.
- **Remediation:** The existing localized empty title and hint now accompany the
  same JSON action in one flat, divider-bound row. It adds no new card, catalog,
  configuration path, or runtime behavior. The row uses the shared workspace
  typography, spacing, border, and responsive container tokens.
- **Evidence:** At maximized width the empty state fills the bounded 840px
  content axis as a single approximately 62px row. At a 719×498 WebView it
  remains one 379px-wide row with no document overflow. The JSON editor still
  opens from the only action, retains the existing loaded configuration and
  examples, and closes without writing when cancelled.

### Resolved follow-up — Quick Action state and controls were hidden

- **Location:** `src/web-ui/src/infrastructure/config/components/QuickActionsConfig.tsx`
  and `QuickActionsConfig.scss`
- **Category:** Accessibility / interaction discoverability / anti-pattern /
  responsive density
- **Severity before remediation:** P1 for hidden enabled state; P2 for the
  duplicated empty-state action
- **Impact:** Every row applied `opacity: 0` to the complete control group,
  including the enable switch. Users could not scan whether actions were
  enabled until hovering, and keyboard focus did not reveal the group. The
  empty custom section also repeated `添加动作` in its header and body, wrapped
  the second action in a centered 154px card, and used copy that pointed to a
  control “below.”
- **Remediation:** Enable switches are now always visible and carry the
  localized action name as their accessible label. Edit and delete remain
  progressively disclosed, but appear on row hover, `:focus-within`, and
  coarse-pointer devices. The custom empty state keeps the single section
  action, removes the decorative icon and duplicate button, and uses concise
  direction-neutral copy. Minimal presentation consumes workspace typography,
  surface, border, spacing, and motion tokens.
- **Focused audit score:** 14/20 before remediation; 19/20 after remediation
  (accessibility 4, performance 4, responsive 4, theming 4, anti-patterns 3).
- **Evidence:** At maximized width both 32×20px switches are visible while
  secondary actions remain quiet, the empty state is a 40px row, and only one
  `添加动作` control exists. At a 719×498 WebView the same controls remain
  inside the 378px list axis with zero document overflow. Focusing the first
  edit action raises its secondary control group to full opacity; opening and
  cancelling the add modal preserves the action list.

### Resolved follow-up — Archived-session refresh exposed an English-only name

- **Location:** `src/web-ui/src/app/scenes/settings/components/ArchivedSessionsConfig.tsx`
- **Category:** Accessibility / localization / interaction consistency
- **Severity before remediation:** P2
- **Impact:** The empty archived-session page rendered correctly in Chinese,
  but its icon-only refresh action exposed the hard-coded accessible name
  `Refresh` and no localized hover hint.
- **Remediation:** The existing shared `actions.refresh` translation now drives
  both the accessible name and native hint. Session loading, restore, deletion,
  grouping, and persistence remain unchanged.
- **Evidence:** At maximized width and a 719×498 WebView, the empty state has no
  document overflow. The focused action reports `aria-label="刷新"` and
  `title="刷新"`; activating it returns from loading to the same empty state.

### Resolved follow-up — Development shortcuts bypassed translated labels

- **Location:** `src/web-ui/src/shared/constants/shortcuts.ts`,
  `KeyboardShortcutsTab.tsx`, and the Settings locale resources
- **Category:** Localization / accessibility / interaction consistency
- **Severity before remediation:** P2
- **Impact:** Runtime-only development shortcuts bypassed the static shortcut
  catalog, so the Chinese settings page displayed `Toggle element inspector`
  and `Open native DevTools`. Revert controls also exposed only a visual arrow.
- **Remediation:** The runtime ids now resolve through the existing Settings
  translation lookup, and every revert control carries the localized accessible
  name already used by its tooltip. Shortcut registration, capture, conflict
  detection, persistence, and reset behavior are unchanged.
- **Evidence:** At maximized width and a 719×498 WebView the list has no document
  overflow. Searching `开发者` leaves the one translated developer-tools row.
  Recording a temporary `F6` binding exposes `aria-label="撤销此更改"`; invoking
  it removes the pending change and the Apply action without persisting.

### Resolved follow-up — Shared Settings controls lost their accessible names

- **Location:** Shared `IconButton`, `Input`, `NumberInput`, `Select`, and
  `Textarea` components plus `SessionConfig.tsx`
- **Category:** Accessibility / localization / shared-component consistency
- **Severity before remediation:** P1 for unnamed permission controls; P2 for
  the untranslated default-browser option
- **Impact:** Personalization and Permissions looked stable at narrow and
  maximized desktop widths, but multiple icon buttons, switches, compact
  numeric inputs, selects, and debug-template fields exposed no useful
  accessible name. Visible `Input` and `Textarea` labels were also not bound to
  their fields. The system browser option remained `Default browser` in the
  Chinese UI.
- **Remediation:** Shared controls now preserve explicit accessible names,
  derive safe fallbacks from string tooltips or visible labels, and associate
  native form labels through stable generated ids. Permissions supplies
  contextual labels for switches and compact fields, while the existing locale
  chain owns the default-browser name. Runtime settings, persistence, browser
  control, Computer Use, and debug-template behavior remain unchanged.
- **Evidence:** At a 719×498 WebView the Permissions document remains 719/719
  with no horizontal overflow. Workspace search, auto execute, timeouts,
  Computer Use, browser, log path, ingest port, all five language-template
  switches, and region fields report localized names. The expanded template
  textarea reports the visible label `插桩代码模板` through a matching
  `htmlFor`/`id` pair, and the browser select displays `默认浏览器`. Five
  focused component suites pass 10 tests.

### Resolved follow-up — Basic Settings expanded simple controls into cards

- **Location:** `src/web-ui/src/infrastructure/config/components/BasicsConfig.tsx`
  and `BasicsConfig.scss`
- **Category:** Accessibility / responsive density / visual hierarchy /
  theme consistency
- **Severity before remediation:** P1 for unnamed controls; P2 for narrow
  card-like rows
- **Impact:** Launch, update, window, logging, terminal, and notification
  controls visually rendered, but nine compact controls exposed no accessible
  name. At a 719×498 WebView each simple switch row also stacked into a bordered
  card roughly 150px tall, making the long form slow to scan.
- **Remediation:** Every compact switch, select, and icon-only folder action now
  derives its accessible name from the existing visible translation. The
  Minimal projection reuses the current section and row markup as a flat
  divider list; simple controls remain inline at narrow widths while genuinely
  multiline rows retain their stacked layout. Config loading, optimistic save,
  rollback, terminal discovery, logging, notifications, and system adapters
  are unchanged.
- **Evidence:** At maximized width the content axis remains bounded to 840px
  and simple rows measure about 67px. At a 719×498 WebView the first switch row
  drops to about 86px, all controls stay within the 379px content axis, and the
  document remains 719/719. The nine audited controls report Chinese names,
  including `开机自动启动`, `关闭按钮行为`, `日志级别`, `默认终端`, and
  `在文件管理器中打开日志文件夹`.

### Resolved follow-up — Appearance Settings mixed cards and unnamed controls

- **Location:** `AppearanceConfig`, `FontPreferencePanel`, and the Basics locale
  resources
- **Category:** Accessibility / localization / responsive density / visual
  hierarchy
- **Severity before remediation:** P1 for unnamed language/theme controls; P2
  for card-like section density
- **Impact:** Language and theme selects exposed no accessible name, the font
  preview announced an English-only literal, and the custom stepper/input and
  optional chat-size select lacked contextual names. At a 719×498 WebView the
  interface and font section bodies occupied about 231px and 391px as rounded
  cards, forcing simple language and theme choices into stacked rows.
- **Remediation:** Existing translations now name every affected control and
  preview. The Minimal projection reuses the same flat divider-list treatment
  as Basic Settings, keeps language and theme controls inline on narrow
  layouts, retains the real font preview boundary, and removes the empty reset
  metadata column. Theme, locale, and font preference services are unchanged.
- **Evidence:** At maximized width both sections retain the bounded 840px
  content axis. At a 719×498 WebView the interface section drops to about
  135px, both selects remain 159px wide inside the 379px axis, and the document
  remains 719/719. Opening the language list shows all three localized options
  without clipping and closes without changing the locale. The controls report
  `语言`, `主题`, `界面字体`, `界面字号预览`, and `自定义对话字号`.

### Resolved follow-up — Model Settings stacked simple controls into long cards

- **Location:** `AIModelConfig`, `DefaultModelConfig`, and their presentation
  styles
- **Category:** Accessibility / localization / responsive density / visual
  hierarchy
- **Severity before remediation:** P1 for unnamed model, media, timeout, and
  proxy controls; P2 for the 2,100px narrow form
- **Impact:** The page had no horizontal overflow, but default-model, media,
  timeout, and proxy controls stacked into rounded cards at a 719×498 WebView.
  The primary and fast model selects, model switch, media fields, timeout
  fields, and proxy controls exposed no contextual accessible name. Media
  secret visibility also requested missing root-level component translations,
  leaving an English `show` fallback in the Chinese interface.
- **Remediation:** The Minimal projection now uses the same flat divider-list
  treatment as Basic and Appearance Settings. Only simple rows remain inline
  at narrow widths; CLI account actions and the model collection retain their
  existing complex layouts. Visible translations name every audited control,
  and both API-key visibility paths reuse the component library's localized
  input labels. Provider discovery, model state, secrets, timeout persistence,
  proxy persistence, and network adapters are unchanged.
- **Evidence:** At maximized width the content remains bounded to 840px and the
  document stays within its viewport. At a 719×498 WebView the document remains
  719/719, compact controls use a 200px/167px split, and the page scroll height
  drops from roughly 2,100px to 1,775px. The default, media, stream-timeout, and
  proxy sections measure about 225px, 308px, 240px, and 333px respectively.
  Opening the localized `主力模型` list stays inside the viewport. Media secret
  show/hide returns to password state, and toggling the proxy disables its
  dependent fields before returning to the original enabled state. No visible
  control is unnamed.

## Positive findings

- Assistant reflows its two cards to one column at 719px without horizontal
  overflow or duplicated controls.
- Automation preserves all day/week/month/list actions at 719px and keeps its
  calendar grid within the scene container.
- Professional Agents uses a bounded content axis, semantic workspace tokens,
  visible focus treatment, reduced-motion rules, and deferred card rendering.
- Mini Apps preserve detail, launch, delete, running-state, customization, and
  draft-preview entry points while their Minimal presentation avoids decorative
  paint and remains complete at both maximized and 719px desktop widths.
- Review preserves its overview, strategy, capacity, reviewer, and optional
  Sub-Agent controls at both maximized and 719px desktop widths; the narrow
  overview stacks without document overflow.

## Next actions

1. Apply the shared pointer-coarse target policy only after verifying the
   desktop shell reports coarse input accurately.
2. Continue `$normalize` on remaining long Settings forms; the Connector entry
   currently and intentionally reuses the Settings/MCP interface rather than
   mounting a separate catalog.
3. Finish with `$polish` after the remaining catalog pages pass maximized and
   719px desktop checks.
