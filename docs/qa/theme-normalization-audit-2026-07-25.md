# Theme normalization audit — 2026-07-25

This checkpoint audits the Minimal presentation of Assistant, Automation, and
Professional Agents in the real desktop shell. It is dated evidence, not a
permanent statement of repository quality.

## Audit health score

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Accessibility | 4/4 | Interactive controls expose visible labels or accessible names and retain focus styling. Mouse-driven controls remain compact while shared gallery and Automation header controls promote to a 44px target for coarse pointers. |
| Performance | 4/4 | Agent cards use `content-visibility`, bounded intrinsic sizing, and reduced-motion fallbacks. The audited pages introduce no decorative media, blur, or unbounded animation. |
| Responsive design | 3/4 | Assistant and Automation have zero document overflow at a 719px WebView. Professional Agents originally clipped its second filter group; the remediation below makes every filter control visible with zero overflow. |
| Theming | 4/4 | Audited Minimal surfaces consume workspace color, typography, spacing, radius, focus, and status tokens. No new literal color is required by the remediation. |
| Anti-patterns | 3/4 | Hierarchy is compact and restrained. Professional Agents still relies heavily on repeated equal-weight cards, which is functional but weakens scan hierarchy for large catalogs. |
| **Total** | **18/20** | **Good — remaining debt is refinement rather than a structural redesign.** |

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

### Resolved follow-up — Compact controls lacked a touch-input policy

- **Location:** Shared gallery chips and Automation toolbar controls
- **Category:** Accessibility / responsive design
- **Impact:** The 28px controls are precise for mouse-driven desktop use but do
  not independently satisfy a 44px touch-target recommendation on hybrid
  devices.
- **Remediation:** The shared workspace theme now defines a 44px touch target.
  Minimal Gallery controls and Automation header controls promote their
  minimum height and icon width only under `(hover: none)` or
  `(pointer: coarse)`, with `touch-action: manipulation`. Mouse and trackpad
  layouts retain their compact 28px geometry.
- **Evidence:** In the maximized mouse-driven desktop shell, Automation
  navigation, filter, view, and create controls still report 28px heights and
  the document remains 1707/1707 with no horizontal overflow. Static
  presentation contracts prove that both shared Gallery and Automation
  consume the same `--workspace-touch-target` only inside the coarse-pointer
  media query. The current WebDriver endpoint does not expose pointer-media
  emulation, so no synthetic touch screenshot is claimed.

### P3 — Large agent catalogs have uniform card emphasis

- **Location:** Professional Agents gallery
- **Category:** Anti-pattern / information hierarchy
- **Impact:** Core agents, teams, and the general catalog are separated by
  headings, but repeated equal-weight cards make long scans visually uniform.
- **Partial remediation:** The existing card components are preserved. At
  720px and below, cards now present identity, role, and one primary metric in
  a 76px row; descriptions and repeated metrics remain available in the
  existing detail modal. Wide layouts retain their 112px single-description
  cards. No decorative portrait or second card implementation was added.
- **Evidence:** At a 720×498 WebView, card height falls from 112px to 76px,
  body content resolves to `display: none`, approximately 3.5 cards are visible
  in the first catalog viewport, and the document remains 720/720. Clicking
  the compact Agentic card still opens its complete detail modal and closing
  it restores the catalog. At 1707×912, cards remain 112px with descriptions
  visible and zero horizontal overflow.
- **Remaining recommendation:** If wide catalogs need stronger emphasis, solve
  it through section-level ranking or user data rather than arbitrary card
  decoration.

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
  220px, cards to 16px, and the group begins below the type switch with a
  stable gap.
- **Evidence:** At maximized width the heading and switch retain their original
  y=254 and y=292 positions; the switch ends at y=323 and examples begin at
  y=336. At a 719×498 WebView the switch ends at y=190 and examples begin at
  y=195. Both documents retain zero horizontal overflow.

### Resolved follow-up — Chat input animated unrelated properties

- **Location:** `src/web-ui/src/flow_chat/components/ChatInput.scss`
- **Category:** Motion / rendering performance
- **Impact:** Five high-frequency input controls used `transition: all`, so
  unrelated style changes could be interpolated when the composer, mode menu,
  or slash-command menu updated.
- **Remediation:** The composer surface now transitions only background,
  border, and shadow feedback. Action controls transition only background,
  color, opacity, and transform where those states are rendered. Mode controls
  transition only background and color, while slash-command rows transition
  only their selection background.
- **Evidence:** In the maximized desktop shell, every non-zero composer
  transition reports an explicit property list; no rendered input descendant
  has a non-zero `transition: all`. The agent affordance, model selector, and
  slash-command menu open and close normally. Entering `/` renders all six
  available commands, each row reports only
  `background-color 0.15s`, and clearing the draft restores the disabled send
  state without sending or creating a session.

### Resolved follow-up — Draft slash commands covered the new-task heading

- **Location:** `src/web-ui/src/app/scenes/session/ChatPane.scss`
- **Category:** Responsive layout / interaction reachability
- **Impact:** The new-task composer is centered on tall views, but its slash
  command picker inherited the bottom composer’s upward placement. Opening `/`
  covered the fixed greeting and session-type switch. On short views, the full
  command menu could also reach the application bar.
- **Remediation:** Only the unpersisted new-task surface changes placement.
  Tall views open the picker below the complete composer and bound it to the
  remaining viewport. Short views keep the upward direction, remove the
  redundant keyboard-hint header, and expose a compact scrollable command
  list between the mode switch and composer. Persisted sessions retain the
  existing upward picker.
- **Evidence:** At 1707×912 the greeting remains at y=254–284, the type switch
  at y=292–323, the composer ends at y=576, and the picker occupies y=582–804.
  At a 720×498 WebView the title remains at y=120–143 while the picker occupies
  y=295–401; its 106px list has 168px of scrollable command content and the
  document remains 720/720 with no horizontal overflow. A persisted
  `日常问候` session does not match the draft selector and continues to place
  the picker immediately above its bottom composer. All test drafts were
  cleared without sending or creating a session.

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

### Resolved follow-up — Skills visual state was not exposed as interaction state

- **Location:** `SkillsScene.tsx` and the Skills Minimal presentation contract
- **Category:** Accessibility / interaction consistency / responsive
  verification
- **Severity before remediation:** P2
- **Impact:** Installed/market tabs, installed-skill category filters, the
  duplicate filter, and the add-skill dialog trigger all had clear visual
  states, but assistive technology could not determine which state was selected
  or whether the dialog trigger was expanded.
- **Remediation:** Existing buttons retain their navigation, filtering, and
  dialog behavior while exposing localized group labels, pressed state, dialog
  intent, and expansion state. No Skill discovery, scanning, filtering,
  installation, deletion, suite visibility, or persistence logic changed.
- **Evidence:** At maximized width the installed grid remains four 311px columns
  with 104px cards; at a 719×498 WebView it becomes one 421px column with no
  document or grid overflow. The marketplace uses the same geometry, and the
  360×308 add dialog stays inside the viewport with all controls named.
  Installed/market selection, all-category selection, duplicate filtering, and
  add-dialog expansion now report their visual state and return to their
  original state after interaction. The focused Skills contract passes 11
  tests.

### Resolved follow-up — Connector examples dominated the JSON editor

- **Location:** `McpToolsConfig` and its presentation contract
- **Category:** Information density / accessibility / motion / rendering cost
- **Severity before remediation:** P2
- **Impact:** The connector empty state was already compact, but opening the
  JSON editor rendered both full configuration examples unconditionally. At a
  719×498 WebView the editor measured about 1,058px and the scene scroll height
  reached 1,259px. The JSON field was named only by a code-shaped placeholder,
  and the entry action did not expose its inline expansion state.
- **Remediation:** Configuration examples remain available in a native,
  keyboard-accessible details element but start collapsed. Their maximum width,
  type scale, line height, and spacing are reduced, and scroll anchoring is
  disabled so expansion does not move the editor heading. The existing entry
  actions now identify and control the named editor, and editor entrance motion
  is disabled when reduced motion is requested. Loading, JSON parsing,
  validation, save/reload, server lifecycle, remote authentication, and OAuth
  behavior are unchanged.
- **Evidence:** The empty state remains a single 840px divider row at maximized
  width and has no document overflow at 719×498. With the editor open, collapsed
  examples occupy about 30px, reducing editor height to about 637px and scene
  scroll height to 839px. Expanding the compact 680px reference content reaches
  about 374px while the editor heading stays at the same coordinate (0px
  shift); collapsing it and returning to the list restores the original empty
  state. The trigger reports `aria-expanded` and
  `aria-controls`, while the field reports `MCP JSON 配置`. Configured-server
  and OAuth visuals remain a runtime coverage gap because the inspected
  profile currently has no MCP servers.

### Resolved follow-up — Review settings repeated every reviewer as a tall card

- **Location:** `ReviewConfig`, its feature-owned Minimal projection, locale
  resources, and presentation contract
- **Category:** Information density / responsive design / accessibility /
  theming
- **Impact:** Six locked reviewer rows each repeated the role name, lock state,
  selected model hint, and two full-width controls. At maximized width every
  row measured about 123px and the settings scene reached 1,748px, forcing a
  long scan through visually identical blocks. The viewport-level member
  breakpoint could also disagree with the actual settings panel width, and
  reviewer controls had values but no role-specific accessible names.
- **Remediation:** The Minimal projection keeps reviewer identity and both
  editable controls in one divider row, suppresses only redundant locked-state,
  duplicate-role, and model-hint text, and uses the existing `config-panel`
  container rather than the viewport. Workflow copy is line-clamped, the
  narrow strategy picker becomes a three-option segmented row, and every
  number/model/strategy field now exposes a localized accessible name. Review
  team loading, strategy values, capacity persistence, model assignment,
  candidate eligibility, add/remove behavior, and provider/runtime calls are
  unchanged.
- **Evidence:** At maximized width reviewer rows fall to about 53.5px and scene
  scroll height to 1,191px; the workflow summary is about 82px and the strategy
  block about 90px. At an exact 719×498 WebView, document width remains
  719/719, the workflow summary is about 105px, strategy selection is 56px,
  and all six reviewer rows remain visible as a continuous list at about
  53.5px each. The first strategy control reports
  `业务逻辑审核员 · 审核策略`; its dropdown opens inside the viewport and closes
  with Escape without producing horizontal overflow.

### Resolved follow-up — Editor settings underused wide layouts and exposed unnamed controls

- **Location:** `EditorConfig`, its feature-owned Minimal projection, and
  presentation contract
- **Category:** Information density / responsive design / accessibility /
  theming
- **Impact:** Appearance, behavior, display, advanced, and reset sections were
  forced into one long column even in a maximized desktop scene. Ten selects,
  three number fields, and nine switches displayed visible row labels but did
  not expose those labels as accessible names.
- **Remediation:** The Minimal projection uses a bounded 1,040px content axis
  and pairs the four primary sections in a two-column grid, while the reset
  section remains full width. Simple setting groups become flat divider lists,
  controls keep a bounded column, and container queries return the page to one
  section column at 720px and one control column at 360px. Every field now
  receives its localized visible label as its accessible name. Config loading,
  conversion, validation, debounced auto-save, reset, and
  `editor:config:changed` behavior are unchanged.
- **Evidence:** At maximized width the content resolves to two 508px columns
  and the scene scroll height is 1,082px; all four primary sections are visible
  in the first viewport. At an exact 719×498 WebView the content returns to one
  379px section column, document width remains 719/719, and a typical row keeps
  a 223px label column with a 144px control. The font list opens entirely
  inside the viewport with all four options and closes with Escape. A runtime
  DOM scan finds no unnamed editor inputs or comboboxes.

### Resolved follow-up — Permission settings remained a long card stack

- **Location:** `SessionConfig`, its feature-owned Minimal projection, and
  presentation contract
- **Category:** Information density / responsive design / theming
- **Impact:** Workspace search, tool execution, Computer Use, browser control,
  and debug settings were forced into one 840px column. Even in a maximized
  desktop scene the page reached 1,244px, while every group retained a rounded
  card body that conflicted with the flatter Basic, Appearance, Model, and
  Editor settings.
- **Remediation:** Personalization and permissions now expose independent
  presentation scopes. Only the permissions scope uses a bounded 1,040px
  two-column grid: workspace search remains full width, related tool/Computer
  Use and browser/debug groups are paired, and section bodies become flat
  divider lists. A 720px container query returns the page to one section
  column. Settings state, tool confirmation, OS permissions, CDP lifecycle,
  debug templates, validation, and persistence are unchanged.
- **Evidence:** At maximized width the search group measures 1,040px, paired
  sections measure 508px, and the complete permissions page fits its 864px
  scene viewport without an internal scroll range. In the narrow desktop
  shell the content returns to one 354px section column with zero document
  overflow. A scoped runtime scan finds no unnamed inputs, buttons, or
  comboboxes.

### Resolved follow-up — Account activity cells collapsed below inspectable size

- **Location:** `AccountSettings` activity heatmap and its Minimal presentation
- **Category:** Responsive design / interaction precision
- **Severity before remediation:** P2
- **Impact:** The one-year activity view preserves all 370 real daily records
  and avoids document overflow, but distributes every week across the available
  width. At a 720×498 WebView each daily cell collapses to about 3.24px, so the
  native per-day hover value is technically present but impractical to target.
  The same cells measure about 11.92px in the maximized 840px content axis.
- **Remediation:** Narrow Account containers now keep the same 840px year-grid
  geometry used by the maximized page and scroll only inside the heatmap figure.
  A feature-owned observer reveals the latest dates after mount or container
  resize. The named region supports pointer/trackpad scrolling plus
  Left/Right/Home/End keyboard navigation with the shared focus token.
- **Evidence:** At 720×498, daily cells remain about 11.92px, the internal
  viewport resolves to 380/840px and initially rests at its 460px latest-date
  boundary, while the document remains 720/720 with no horizontal overflow.
  Arrow Left moves the figure to 412px and End returns it to 460px. The first
  and last real titles remain `2025-07-21 · 0亿 Token` and
  `2026-07-25 · 0.0005亿 Token`; no future cells were added.
- **Positive evidence:** The anonymous profile, five real usage metrics, login
  security rows, and 60KB WebP hero remain bounded. All visible Account controls
  have accessible names, reduced motion is respected, and neither maximized nor
  720×498 layouts produce document-level horizontal overflow.

### Resolved follow-up — Insights state and chart colors use shared contracts

- **Location:** `InsightsScene`, its Minimal projection, and Common locale
  resources
- **Category:** Accessibility / localization / theming / coarse-pointer input
- **Severity:** P2
- **Impact:** The selected 30-day range is communicated only by an active
  background class, so assistive technology cannot identify the current range.
  Generated-report copy controls expose English-only `Copy to clipboard` /
  `Copied` names in the Chinese interface. Six chart colors are also literal
  hexadecimal values in TS, bypassing theme changes. At both maximized width
  and a 720×498 WebView the list itself has zero overflow, but all five header
  actions remain 28px on coarse-pointer devices.
- **Remediation:** The range is now a named pressed-button group, copy and
  dismiss controls use the existing Common locale namespace, and all six chart
  roles resolve through feature-owned CSS variables backed by semantic theme
  tokens. The Minimal projection reuses the shared 44px target only for coarse
  pointers, without changing report generation or rendering.
- **Suggested command:** `$normalize`
- **Positive evidence:** The empty state has one generation path, the compact
  command row remains fully visible at 720×498, long report cards already use
  `content-visibility`, and the Minimal projection disables decorative motion
  under reduced-motion.
- **Verification evidence:** Targeted presentation tests pass 8/8, web type
  checking and the locale contract pass, and real desktop checks at maximized
  width and 720×498 show no document-level horizontal overflow. Switching from
  30 to 7 days and back updates both the active class and `aria-pressed` while
  preserving the compact header geometry.

### Resolved follow-up — Keyboard bindings expose action context without card chrome

- **Location:** `KeyboardShortcutsTab` and its Settings locale resources
- **Category:** Accessibility / responsive input / performance / anti-pattern
- **Severity:** P1 for unnamed recording actions; P2 for coarse-pointer targets
  and repeated panel treatment
- **Impact:** Editable key buttons expose only the current binding, such as
  `Alt+1–3`, so assistive technology cannot identify which action will be
  changed or whether capture mode is active. At a 720×498 WebView these buttons
  are about 25.5px high and revert controls are 22px, with no coarse-pointer
  promotion. At maximized width the search field expands to most of the 840px
  content axis, and every shortcut scope repeats a bordered panel even though
  the rows already provide the useful hierarchy.
- **Remediation:** Editable bindings now expose localized action, current
  binding, and recording state through their accessible names and
  `aria-pressed`. The Minimal projection reuses the shared 44px coarse-pointer
  target, bounds the desktop toolbar/search axis, flattens scope bodies into
  quiet separated rows, and defers offscreen scope paint without changing
  shortcut registration, conflict detection, or persistence.
- **Suggested command:** `$normalize`
- **Positive evidence:** Search is already labeled, fixed bindings are rendered
  as non-buttons, focus treatment is visible, recording animation respects
  reduced motion, and both maximized and 720×498 layouts have zero
  document-level horizontal overflow.
- **Verification evidence:** At 720×498, the first editable binding reports
  `切换场景：当前键位 Alt+1–3。点击录制新的快捷键`; entering capture changes
  it to `切换场景：正在录制新键位` with `aria-pressed=true`. Escape restores
  the original state without creating a pending Apply action. At maximized
  width the search is 560px inside a 660px toolbar rather than filling the
  840px content axis. Both viewport sizes remain overflow-free, and targeted
  interaction tests, web type checking, and locale interpolation contracts
  pass.

### Resolved follow-up — Personalization is flat with on-demand pet motion

- **Location:** `SessionConfig` personalization projection and
  `AIFeaturesConfig.scss`
- **Category:** Responsive design / performance / accessibility / anti-pattern
- **Severity:** P2
- **Impact:** At a 720×498 WebView, the session-title model row retains its
  higher-specificity 4:6 grid and stacks three model choices vertically,
  expanding the first two-row setting to about 244px. Both settings groups
  repeat rounded panel chrome, while the selected pet sprite animates
  indefinitely whenever the page is visible. Expanded pet choices are `radio`
  divs but every option has `tabIndex=0`, creating a verbose radio-group tab
  sequence without native button behavior.
- **Remediation:** The Minimal personalization section bodies are now flat,
  narrow containers restore a single-column model row with a wrapping
  horizontal selector, and pet sprite motion runs only while its trigger or
  choice is hovered or keyboard-focused. Pet choices are native pressed
  buttons inside a named group. Title generation, model selection, companion
  settings, import, delete, and package loading remain on their existing
  interfaces.
- **Suggested command:** `$normalize`
- **Positive evidence:** The page has only two clearly titled sections, every
  switch and select is named, the pet picker has an explicit expanded state,
  and both maximized and 720×498 layouts have zero document-level overflow.
- **Verification evidence:** At 720×498, the model row resolves to one
  356px column, its three choices remain in a 24.8px horizontal row, and the
  first section falls from about 244px to 209px. The selected sprite reports
  `animation-name: none` at rest. Expanding the picker exposes native
  `button[type=button]` choices with the selected Boxcat at
  `aria-pressed=true`; closing it makes no setting change. Maximized and narrow
  desktop layouts remain overflow-free, and targeted presentation tests, web
  type checking, and ESLint pass.

### Resolved follow-up — Narrow new-task drafts were clipped by the chat minimum

- **Location:** `SessionScene.scss`, `ChatPane.scss`, and the shared new-task
  welcome/composer projection
- **Category:** Responsive design / accessibility
- **Severity:** P1
- **Impact:** In a 720×498 desktop window at 150% scale, the navigation left
  only 202 CSS pixels for the active scene. The chat pane still enforced a
  400px minimum, so its heading, creation modes, examples, composer, and
  workspace picker were rendered outside the visible scene and clipped rather
  than adapting.
- **Remediation:** Minimal chat panes retain their 400px preferred minimum but
  may shrink to the available scene width. The chat pane is now a named inline
  container: below 360px, the welcome content and three creation modes use the
  local width, nonessential mode icons disappear, and the workspace chooser
  condenses to its still-labelled folder button. Its menu is sized and offset
  against the same container. Draft state, first-send persistence, workspace
  selection, and message submission remain unchanged.
- **Suggested command:** `$normalize`
- **Positive evidence:** The existing full-screen 760px welcome composition,
  315px mode switch, 188px office examples, and 640px composer retain their
  geometry; no alternate welcome component or runtime branch was introduced.
- **Verification evidence:** At the same 720×498 desktop size, the 202px chat
  pane now contains the heading, all three modes, the 178px example strip, and
  the composer. The compact workspace chooser, model selector, and send button
  no longer overlap. Opening the chooser produces a 178px menu fully inside
  the scene and exposes new-workspace plus all three existing workspace
  options. The maximized 1707×912 desktop remains document-overflow-free and
  preserves the previous heading and example positions.

### Resolved follow-up — Agent cards support complete keyboard activation

- **Location:** `AgentCard`, `CoreAgentCard`, and `AgentTeamCard`
- **Category:** Accessibility / interaction consistency
- **Severity:** P2
- **Impact:** The three catalog cards expose `role="button"` and `tabIndex=0`,
  but their key handlers only activate on Enter. Keyboard users who use the
  standard Space interaction for button-like controls receive no response even
  though focus styling indicates that the card is actionable.
- **Remediation:** The existing card structure and detail callbacks are
  preserved. All three card components now handle Enter and Space through the
  same activation path, prevent Space from scrolling the catalog, and ignore
  repeated keydown events so a held key cannot reopen the surface.
- **Suggested command:** `$normalize`
- **Positive evidence:** Cards already have accessible names, visible focus,
  mouse activation, compact narrow layouts, and one shared details path; no
  alternate keyboard-only behavior is needed.
- **Verification evidence:** In the real 720×498 desktop shell, Space on the
  focused Agentic core card opens its 450px detail dialog, Space on the review
  team card opens the existing team page, and Space on the Plan catalog card
  opens the same detail dialog used by click. Each event reports
  `defaultPrevented=true`. Full-screen and narrow catalog geometry is unchanged.

### Resolved follow-up — Settings navigation exposes its current page

- **Location:** `SettingsNav`
- **Category:** Accessibility / interaction consistency
- **Severity:** P2
- **Impact:** Every settings tab had a clear visual selected state, but the
  shared navigation exposed the tabs only as unrelated buttons. Assistive
  technology could not identify the settings landmark or determine which page
  was current.
- **Remediation:** The existing compact navigation is now a named `nav`
  landmark, and only the active settings item exposes `aria-current="page"`.
  Search, category grouping, tab selection, and settings ownership are
  unchanged.
- **Suggested command:** `$normalize`
- **Positive evidence:** The navigation already uses native buttons, visible
  labels, focus treatment, compact search, translated copy, and a scrollable
  narrow layout.
- **Verification evidence:** At maximized 1707×912 and narrow 706×490 desktop
  sizes, the navigation remains overflow-free. Compact search still opens,
  focuses its labelled input, and leaves the active MCP page visible. The MCP
  item alone reports `aria-current="page"`; switching to Account moves that
  state to the Account item without changing page geometry.

### Resolved follow-up — Scene tabs are localized and keyboard navigable

- **Location:** `SceneBar` and `SceneTab`
- **Category:** Accessibility / localization / interaction consistency
- **Severity:** P1 for English-only names; P2 for incomplete tab interaction
- **Impact:** The shared top-level tab list exposed `Scene tabs` and dynamic
  close actions such as `Close 设置` in the Chinese interface. Focused tabs
  also ignored the standard Left, Right, Home, and End navigation keys, making
  keyboard movement depend on repeated pointer activation.
- **Remediation:** The common locale now owns the tab-list and close-action
  names in all three bundled languages. The shared tab list implements cyclic
  Left/Right movement plus Home/End jumps, activates through the existing scene
  manager, and restores focus to the newly active tab.
- **Suggested command:** `$normalize`
- **Positive evidence:** Tabs already expose `role="tab"`, `aria-selected`, a
  roving tab index, Enter/Space activation, middle-click close, visible focus,
  compact narrow labels, and reduced-motion behavior.
- **Verification evidence:** In the real maximized desktop, the list reports
  `场景标签页` and its dynamic actions report `关闭设置` and `关闭智能体`.
  Starting from the last Settings tab, Right wraps focus and selection to
  Session, End returns both to Settings, Home moves both to Session, and Left
  wraps back to Settings. The three-tab geometry and document width remain
  unchanged at both 1707×912 and 706×490.

### Resolved follow-up — Welcome recents disclose touch deletion

- **Location:** Minimal `WelcomeScene`
- **Category:** Coarse-pointer safety / responsive interaction
- **Severity:** P1 for ambiguous destructive action; P2 for touch targets
- **Impact:** A recent workspace's date doubles as the remove-from-recents
  button. Mouse hover replaces the date with a trash icon, but touch input has
  no hover phase, so tapping apparently passive date metadata could remove the
  entry without first disclosing the destructive affordance. The same rows and
  header actions also retained compact mouse targets.
- **Remediation:** Only under `hover: none` or `pointer: coarse`, header actions,
  workspace rows, and removal controls use the shared 44px touch target and
  `touch-action: manipulation`. The date stays visible on the left while the
  trash icon is persistently disclosed on the right. Mouse-driven geometry and
  workspace switching/removal callbacks are unchanged.
- **Suggested command:** `$harden`
- **Positive evidence:** Workspace names and dates are already translated,
  long remote paths are truncated with a tooltip, removal has an accessible
  name, focus reveals the icon, and reduced motion is respected.
- **Verification evidence:** At 1707×912 the five recent rows remain 32px high;
  at 706×490 the 394px list remains fully visible with zero document or scene
  overflow. Static presentation contracts scope 44px targets and persistent
  delete disclosure to coarse pointers because the current desktop WebDriver
  endpoint does not expose pointer-media emulation.

### Resolved follow-up — Collapsed customization links leave the tab order

- **Location:** Minimal `MainNav` customization disclosure
- **Category:** Accessibility / interaction consistency
- **Severity:** P1
- **Impact:** Collapsing 定制 animated its sublist to zero height and opacity,
  but 专业智能体, 技能, and 连接器 remained focusable native buttons and
  visible to assistive technology. Keyboard users could tab into an invisible
  part of the sidebar with no apparent focus target.
- **Remediation:** The existing animated disclosure now owns its sublist through
  `aria-controls`. The sublist mirrors the open state through `aria-hidden`,
  and its three buttons leave the tab order only while collapsed. Existing
  Agent, Skill, and MCP routing callbacks are unchanged.
- **Suggested command:** `$harden`
- **Positive evidence:** The disclosure already uses a native button,
  `aria-expanded`, a translated label, visible focus, and state-driven automatic
  expansion when one of its child scenes is active.
- **Verification evidence:** In the real maximized desktop, the collapsed list
  remains 0px high, reports `aria-hidden=true`, and all three child buttons
  report `tabIndex=-1`. Activating 定制 restores the 86px list,
  `aria-hidden=false`, and `tabIndex=0` for each child. Re-collapsing restores
  the hidden state without changing document width or navigation geometry.

### Resolved follow-up — Collapsed navigation sections retained hidden focus

- **Location:** Shared `SectionHeader` and `MainNav` assistant/workspace sections
- **Category:** Accessibility / interaction consistency
- **Severity:** P1
- **Impact:** 助理会话 and 工作区 animated to zero height when collapsed, but
  their existing session and workspace controls remained programmatically
  focusable. The headers also did not identify the regions they controlled.
- **Remediation:** Collapsible section headers now expose `aria-controls`.
  Their existing animated regions own stable IDs, mirror the open state through
  `aria-hidden`, and use the native `inert` attribute only while collapsed.
  Session projection, workspace routing, and the existing grid-row animation
  are unchanged.
- **Suggested command:** `$harden`
- **Positive evidence:** Both headers already expose `aria-expanded`, support
  Enter/Space activation, retain visible labels, and preserve reduced-motion
  behavior.
- **Verification evidence:** In the real maximized desktop, the collapsed
  regions remain 0px high, report `aria-hidden=true` and `inert=true`, and
  reject direct focus attempts across 4 assistant and 27 workspace controls.
  Reopening restores the original 60px and 330px heights, removes `inert`, and
  restores focus without changing the sidebar or new-task geometry.

### Resolved follow-up — Workspace action was nested inside a disclosure role

- **Location:** Shared `SectionHeader`
- **Category:** Accessibility / interaction structure
- **Severity:** P1
- **Impact:** The workspace disclosure used a `div[role=button]` that contained
  the native add-workspace button. The two independent actions looked separate
  but formed a nested interactive control for keyboard and assistive technology.
- **Remediation:** The shared header now renders its label/disclosure as a
  native button and keeps optional actions as siblings. Native Enter/Space
  behavior replaces the manual keyboard shim, while the existing header
  classes, sizing, hover treatment, disclosure state, and add-workspace routing
  remain intact.
- **Suggested command:** `$harden`
- **Positive evidence:** The add-workspace action already has a translated
  accessible name, menu ownership, expanded state, and dedicated focus handling.
- **Verification evidence:** The real maximized desktop reports no nested
  buttons. 助理会话 keeps a 232×24px disclosure; 工作区 keeps a 200×24px
  disclosure beside the existing 20×20px add action. Opening the workspace menu
  does not collapse its section, and the disclosure still collapses to a 0px
  inert region and restores its original content height.

### Resolved follow-up — Assistant gallery responded to the window, not its pane

- **Location:** Shared Minimal `GalleryLayout` and Nursery gallery
- **Category:** Responsive layout / information density
- **Severity:** P1
- **Impact:** With the desktop narrowed while the navigation remained open, the
  Assistant scene had only 192px of content width. Viewport media queries still
  rendered a 104px page header and 126px team card, forcing the title into a
  large multi-line block and delaying the first assistant beyond the initial
  viewport.
- **Remediation:** Minimal galleries now expose a named inline-size container.
  At a genuinely narrow Assistant pane, the page header stays on one line, its
  secondary subtitle is removed, the accessible create action becomes icon
  only, and the team card switches to a compact title/action grid. Existing
  vertical scrolling, assistant configuration, and gallery card behavior are
  unchanged.
- **Suggested command:** `$adapt`
- **Positive evidence:** The gallery already owns vertical scrolling, shrink-safe
  tracks, a one-column narrow grid, deferred card rendering, and coarse-pointer
  target policies.
- **Verification evidence:** At a 456×318 CSS viewport with a 192px Assistant
  scene, the header drops from 104px to 52px, the team card from about 126px to
  64px, and the internal scroll extent from 546px to 432px while the first
  assistant becomes visible. At maximized 1707×912, the 64px header, 96px team
  card, 1120px two-column grid, full subtitle, and labelled create action retain
  their previous geometry.

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
- Editor settings preserve every visible control at both maximized and 719px
  desktop widths while using the wide scene for parallel sections.
- Permission settings preserve all five functional groups while using the
  maximized scene in two columns and returning to one column without overflow.

## Next actions

1. Apply the shared pointer-coarse target policy only after verifying the
   desktop shell reports coarse input accurately.
2. Continue `$normalize` on remaining long Settings forms; the Connector entry
   currently and intentionally reuses the Settings/MCP interface rather than
   mounting a separate catalog.
3. Finish with `$polish` after the remaining catalog pages pass maximized and
   719px desktop checks.
