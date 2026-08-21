# Catalog and Sidebar Design System — One Directory Bar, One Icon Column

Status: current specification for the five Staff HQ surfaces (Assistants,
Employees, Teams, Skills, Connectors) and the Minimal navigation sidebar. It
supersedes the
catalog sections of
[Quiet Directory](quiet-directory-design-system.md), which now covers only the
Automation surface. It complements, and does not replace,
[Porcelain Air](porcelain-graphite-design-system.md) (theme tokens, materials)
and
[Interaction and Theme Governance](../features/interaction-theme-governance.md)
(presentation-only boundaries).

Selected: 2026-08-18, from the owner-approved mock-ups in
`design-lab/redesign-handoff/` (01–04). Colour was explicitly excluded from the
mock-ups by owner direction: the shapes come from the mock-ups, every colour
comes from Void's existing theme tokens.

Scope discipline: every rule below is presentation-only. Runtime, persistence,
Skill policy, catalog services, session lifecycle and workspace lifecycle are
untouched. Classic keeps its own projection; the rules here land in
`*.minimal.scss` overlays under `.void-ui--minimal`, except the shared
components themselves, which both presentations mount.

## 1. Principle

**A catalog is a directory, and a directory has one voice.** Three catalogs that
merely *look* alike will drift apart within a release. So the top bar is one
component, the icon column is one number, and the card is one rhythm. Anything a
page needs that the shared shape does not offer is passed in, not re-styled.

## 2. The directory top bar

One component — `app/components/DirectoryTopBar` — is mounted by the Assistant,
Employee, Team, Skill and Connector catalogs. Left to right:

1. **Page name + count.** A short noun (专业智能体 / 团队 / 技能 / 连接器) at
   body size, then the number of items currently listed in muted micro type.
   Never a technical surface name (`MCP 服务列表`) and never a nav label reused
   as a title.
2. **Filter pills.** Grouped, and only two kinds:
   - `tabs` — switches which catalog is shown. Roving tab stop, `aria-selected`.
     Selected renders as the one solid pill (primary ink on canvas).
   - `filters` — narrows the chosen catalog. Toggle buttons, `aria-pressed`.
     Selected renders quietly (active surface, primary text).
   A bar shows at most one solid pill; filters never compete with the switch.
3. **Elastic gap.**
4. **Quiet search.** A hairline underline and its icon, no filled box. The page
   owns the query state and passes the control in.
5. **Icon-only utilities.** Secondary controls (hide duplicates, import, install
   scope) stay glyphs with an accessible name; they are chrome, not verbs.
6. **One primary action.** A bare `+`. Its name lives in `aria-label` and the
   tooltip, never as a visible word.

Geometry: 40px bar, 22px pills at meta size, 26px controls, all on the shared
1280px content frame. A catalog page must not add page padding, a narrower max
width or a scrollbar gutter on top of that frame — doing so is what made the
Connector page sit a few pixels inside its siblings.

### 2.1 `mission` and `stats`

Two optional props extend the bar without a second header. Omit them and the
DOM is byte-for-byte the old bar, which is why every existing contract test
still passes.

- `mission?: string` — one muted line under the bar row
  (`.directory-topbar__mission`). It answers *why this page exists*, in the
  page's own voice, not chrome: 助理 → `scenes/agents:missions.assistant`,
  智能体 → `missions.agents`, 团队 → `missions.teams`, 技能 →
  `scenes/skills:page.mission`, 连接器 → `settings/mcp:catalog.mission`. One
  short sentence, always a locale key in all three locales, never a verb.
- `stats?: {key, label, tone?}[]` — quiet inline figures right after the count
  (`.directory-topbar__stat`), middot-separated. `tone` recolours the *text*
  only (`neutral` / `success` / `warning`); a stat never becomes a filled pill,
  because the bar already spends its one solid pill on the tab switch.

A tabbed surface swaps its mission with its tab (Employees vs Teams). The count
keeps counting the *listed* items, so mission and count never contradict.

### 2.2 One pager

`app/components/CatalogPagination` is the only pager: prev · current/total ·
next, and it renders nothing at all when `totalPages <= 1`. Pages keep their own
page-size and page-index state and hand it in. Its `pagination.previous` /
`pagination.next` accessible names are contract — several catalog tests select
on them. `app/scenes/agents/components/CatalogPagination.tsx` remains as a thin
re-export for old imports; new code imports the shared path.

## 3. The catalog card

Centred, at most three text lines, operations collected into the hovered
top-right corner:

```
        glyph (26px)
        name              — control size, medium, one line
        description       — meta size, muted, one line
        status            — meta size, state ink
   [hover: detail / edit / delete]
```

- Hover lifts the card 3px and darkens the border; nothing else moves.
- `prefers-reduced-motion` removes the lift.
- **Never** `content-visibility: auto` on a card this small. It let the browser
  skip painting card contents and turned the whole Skill marketplace into empty
  boxes; the performance it buys at 132px is not worth that failure mode.
- A loading placeholder must read as loading (a slow pulse), or it is
  indistinguishable from a card whose contents failed to arrive.

### 3.1 Two heights, one shell

There are exactly two card heights, published as custom properties on
`.void-ui--minimal` in `component-library/styles/tokens.scss` and consumed
through the mixins in `component-library/styles/staff-hq.scss`:

| Token | Value | Used by |
| --- | --- | --- |
| `--hq-card-height-person` | **168px** | Assistants, Employees, Teams — anything with a face |
| `--hq-card-height-utility` | **132px** | Skills, Connectors — anything that is a tool |
| `--hq-avatar-lg` | 44px | the person card's orb / avatar |

168px, not the old 150px: at 150 the employee card could not hold an orb, a
name, a role meta line, one line of duty *and* a status line without the
capability tags colliding with the status ink. A page card and a tool card
differ in height on purpose — that difference is how a directory says whether
you are looking at somebody or at something.

`staff-hq.scss` is mixin-only and emits no CSS of its own; scene overlays pull
it in with `@use '.../staff-hq' as hq;`. Do not re-implement any of it:

- `hq-card($height)` — panel surface, hairline border, panel radius, 3px lift
  and darker border on hover, visible focus ring, motion off under
  `prefers-reduced-motion`.
- `hq-card-corner-actions` — the top-right cluster of 28px icon buttons. It
  reveals itself on `:focus-within`; the pointer reveal is the card's side of
  the contract (`.your-card:hover .your-actions { opacity: 1 }`).
- `hq-status-ink` — a 6px dot plus quiet meta text, toned by `.is-success` /
  `.is-warning` / `.is-error` / `.is-muted`. Never a pill.
- `hq-tag` — a quiet hairline capability tag; at most three per card.
- `hq-member-orb-strip` — 16px overlapping member circles with a trailing
  `.is-overflow` child carrying `+N`.

## 4. Entity glyphs

| Species | Glyph | Behaviour |
| --- | --- | --- |
| Employee 智能体 | **Orb** — animated dot-field sphere | Living: animates on hover, when selected, and while dispatching |
| Skill 技能 | **Lucide mark** — chosen by what the skill does | Tool: never moves |
| Connector 连接器 | **Lucide mark** — chosen by what the connector is | Channel: never moves; its ink *is* its state |

- The orb keeps its own engine
  (`app/scenes/agents/components/orbAvatarEngine.ts`). Colour is read from
  computed style, so themes stay authoritative.
- Skill and Connector marks come from `lucide-react` — already a dependency,
  ISC licensed, so no new asset pipeline or attribution surface.
- Matching runs over the display name plus the **last** segment of the runtime
  identity. Matching the whole identity made every skill under a workspace
  folder named `codex` resolve to the code glyph; keyword patterns carry word
  boundaries for the same reason. Unmatched entities take a stable hash pick
  from a curated pool, so two unnamed entities still read as different marks.
- Keyword patterns stay ASCII: the i18n gate treats CJK literals in source as
  untranslated copy. Localized matching would belong in the locale resources.

## 5. State and colour

- Status is written as well as coloured; colour never carries a state alone.
- Connected / running → success ink. Connecting / transitioning → warning ink.
  Failed → error ink. Idle / stopped / overridden → muted, and the card drops to
  65% opacity.
- No literal colour values, no new tokens. Everything resolves through
  `--workspace-*` and `--status-*`.
- The Employee card shows only facts the runtime actually has: dispatching →
  运行中, otherwise 空闲. There is no per-employee elapsed-time source, so no
  timer is displayed.

## 6. AGENT — the single-page directory

`app/scenes/agent-hub` is the only catalogue door. The old Assistant, Employee,
Team, Skill and Connector catalogue scenes are gone; their creation and editing
pages survive, hosted full-page inside the AGENT scene. The page owns no
runtime, persistence, catalogue or Skill policy of its own — every action calls
the service that already implements it (`useWorkspaceContext`,
`useAgentsList`, `useTeamCatalog`, `useInstalledSkills`, the read-only
`useMcpServerCatalog`, `flowChatManager`, `CustomizationTaskDispatchService`).
Nothing here scans the file system, reads a market or evaluates a permission;
`useAgentHubDirectory` only projects what those owners return into one row
shape.

AGENT shows exactly two screens: the **roster** (the directory) and a
**creation/editing page**. It is a grouped list, not a card grid: zero cards,
zero borders, zero shadows. Type and one hairline under the tab row carry the
whole hierarchy; colour is only ever a second channel.

### 6.1 Page head

One line, baseline-aligned: the noun `AGENT` (26px, weight 500, 0.08em
tracking), the total count in muted 12px tabular figures, then the tool group
at the far end of the line (`__tools`, flex-fills and right-aligned). Tools
are icon-only 26px buttons: a quiet search that opens a hairline-underlined
inline input (the page owns the query state), and the one primary `+` action.
The `+` opens a small right-anchored menu of the creation entries — assistant,
agent, team, skill, connector — each entering the existing creation flow, never
a new one. One muted 12px mission line sits under the row: the answer to *why
this page exists*, in the page's own voice. The inner column is a shared
720px content frame; the page must not add page padding or a scrollbar gutter
on top of it.

### 6.2 Tabs

Text tabs with a hairline underline. `all` plus one tab per row type, in roster
order: `all · 助理 · 智能体 · 团队 · 技能 · 连接器`. The active tab is primary
ink, weight 500, with a 1.5px current-colour underline sitting on the 0.5px
row underline; inactive tabs are muted, weight 400. Roving tabstop with
`aria-selected`; arrow keys move focus and the page owns the active-tab state.
`all` shows every group; a single-type tab shows only that group, paged with
the shared `CatalogPagination`.

### 6.3 Groups and rows

A group is a caption plus its rows, no card shell: a muted 11px letter-spaced
eyebrow (`助理 · 15`) and, only when the group exceeds five rows on `all`, a
quiet `查看全部 >` that jumps to the type tab. Section state is explicit —
`loading` / `error` / `empty` / `ready` — and an empty array never stands in
for "still loading" or "failed".

A row is 50px, one rhythm: avatar → name → one muted line → status word.
Avatars come from the species tables: a 28px orb for assistants and agents, a
28px glyph tile for skills and connectors, a lead orb plus the 16px
member-orb strip for teams. The name is 14px / 500, at most 40% width and
ellipsized. The line is 13px muted, flex-fills and ellipsizes: one role or
purpose, never a second sentence. The status is the `hq-status-ink` dot plus
a 12px word (`connected` / `running` = success, `needs attention` = warning,
`idle` / `disabled` = muted), never colour alone. Hover and keyboard focus
swap the status word for the row's two quiet 22px actions; Enter / Space opens
the row.

### 6.4 Row behaviour

The row's primary open action and its two hover actions come from the owning
service:

- **Assistant** — opens that assistant's configuration page in the `profile`
  scene: `setSelectedAssistantWorkspaceId` first, then `openScene('profile')`;
  hover actions are `new session` (`flowChatManager.createChatSession` +
  `openMainSession`) and `configure`.
- **Agent / Team** — opens the assembly detail; hover actions are `dispatch`
  (`CustomizationTaskDispatchService`, with the preferred scenario) and
  `details`.
- **Skill** — opens the skill detail; hover actions are `details` and `edit`
  (the skill authoring page, hosted).
- **Connector** — the row opens the connector management view full-page inside
  AGENT (`hubPage = 'connectors'`); its detail action is the same view. MCP has
  exactly one door and it is here, not in Settings.

### 6.5 Assembly panel — three sections

The agent detail is `GalleryDetailModal` hosting `AgentEquipmentPanel`, the
assembly surface, and keeps its three sections: **tools**, **skills** and
**subagents** — each a section head with title, count and quiet actions, read
and written through the single `useAgentsList` call the directory already
makes, with no second fetch. `dispatch` runs the row through
`CustomizationTaskDispatchService` with the preferred scenario.

### 6.6 hubPage — the whole-page hosting mechanism

`AgentHubScene` owns a local `hubPage` state. `'home'` renders the roster;
every other value replaces the directory with a hosted creation/editing page.
The hosted shell is a bounded flex column (the AGENT page stays the scroll
owner and the hosted page scrolls inside itself), a slim head with one
back-to-directory entry and the page title from `HOSTED_PAGE_TITLES`, and the
page body. Adding a hosted page is one union member (`AgentHubPage`) plus one
`renderHostedPage()` branch — nothing else changes:

| hubPage | renders |
| --- | --- |
| `'home'` | roster: page head + tabs + grouped rows |
| `'connectors'` | `McpToolsConfig` (settings projection, unchanged) |
| `'skillAuthoring'` | `SkillAuthoringPage` |
| `'createAgent'` / `'teamAuthoring'` / `'reviewTeam'` | driven by `agentsStore.page` |

## 7. The Minimal sidebar

### 7.1 One icon column

`--void-nav-icon-centre` is declared on the nav area and consumed by everything
in it: the control bar's first button, every nav row's glyph and the footer
buttons all centre on it. When the sidebar collapses to a 48px rail the control
bar drops the inset and centres instead, because the rail's own buttons do.

### 7.2 Control bar

`⬓ 🔍 ← →` in one row. Search lives here as a glyph, not as a labelled field in
the sidebar body; its open state is `app/stores/navSearchStore` because the
trigger and the dialog sit in different subtrees. `Ctrl+K` / `Alt+F` are
unchanged. Collapsed, the rail shows the same line glyph — never a raster logo.

### 7.3 Rows

"New task" is the first row of the list, not a boxed call to action: same
height, same icon column, same flat ground as the rows under it. One accent
glyph marks it as the primary verb.

### 7.4 Sections

**One scroller, pinned heads.** `__sections` scrolls; each section head is
`position: sticky` inside it and carries the nav area's own material so rows
cannot show through as they pass underneath.

Splitting the column into a scroll box per section was tried and reverted: a
collapsed section was pushed to the bottom with a void above it, open sections
fought for height, and two scrollbars in one narrow column made it unclear what
would move.

A section head is a caption — label, then count and chevron at the far end. The
hairline that used to stretch between them read as a broken divider.

### 7.5 Fold memory

Which workspaces show their session list lives in
`app/stores/navWorkspaceFoldStore`, keyed by workspace id. As local component
state it died with the component: reordering, a list refresh or a presentation
switch silently re-expanded everything, and activating a workspace force-expanded
it over the user's choice. Activating a workspace no longer changes its fold;
only the fold control does.

## 8. Applying this to a new catalog

1. Mount `DirectoryTopBar` and pass in title, count, `mission`, optional
   `stats`, chip groups, search, utilities and the one primary action. Do not
   build a look-alike header.
2. Give the entity a glyph from its species table; never invent a fourth
   animated species without owner sign-off.
3. Use the three-line card, the shared content frame and the state inks above.
   Pick 168px if the entity has a face, 132px if it is a tool; build the shell
   with the `hq-*` mixins rather than a fresh copy.
4. Page it with the shared `CatalogPagination`; keep its aria names.
5. Scope page-specific rules under `.void-ui--minimal`; Classic geometry stays.
6. Delete the retired styles in the same change — the last consumer going away
   is what makes them dead.

## 9. Implementation index

| Surface | Files |
| --- | --- |
| Shared top bar | `app/components/DirectoryTopBar/` |
| Shared pager | `app/components/CatalogPagination/` |
| Card mixins / geometry | `component-library/styles/staff-hq.scss`, `component-library/styles/tokens.scss` (`--hq-*`) |
| Assistants | `app/scenes/profile/views/AssistantHq.scss` + `.minimal.scss`, `NurseryGallery.tsx`, `AssistantCard.tsx`, `AssistantConfigPage.tsx`, `TemplateConfigPage.tsx` |
| Employees / Teams | `app/scenes/agents/AgentsScene*.scss`, `components/AgentCard*`, `components/CoreAgentCard*`, `components/TeamsCatalogView*` |
| Skills | `app/scenes/skills/SkillsScene*.scss`, `components/skillCatalogIcons.ts`, `components/SkillCatalogAvatar*` |
| Connectors | `infrastructure/config/components/McpToolsConfig*.scss`, `ConnectorCatalogAvatar*`, `connectorCatalogIcons.ts` |
| AGENT single page | `app/scenes/agent-hub/` (`AgentHubScene.tsx`, `AgentHubScene.scss` + `.minimal.scss`, `AgentHubRowItem.tsx`, `useAgentHubDirectory.ts`), row glyphs via `AgentAvatar` / `SkillCatalogAvatar` / `ConnectorCatalogAvatar` |
| Sidebar | `app/components/NavBar/`, `app/components/NavPanel/`, `app/stores/navSearchStore.ts`, `app/stores/navWorkspaceFoldStore.ts` |
| Scrollbar | `app/styles/utilities/scrollbar.minimal.scss` |

Contract coverage: `AgentHubScene.test.tsx` (five creation entries, explicit
loading/empty/error states, connector hosted-page round-trip, skill authoring
hosted page, assembly panel), `SkillsScene.directory.test.tsx` (one search, one
primary action, explicit per-card state), `SkillCatalogAvatar.test.tsx` (stable
and varied glyph resolution), `navWorkspaceFoldStore.test.ts` (fold survives
and is per workspace), `AgentsScene.test.tsx` and `TeamsCatalogView.test.tsx`
(top-bar structure and paging). Per repository test policy, none of these read
a stylesheet as text.
