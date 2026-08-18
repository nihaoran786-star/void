# Catalog and Sidebar Design System — One Directory Bar, One Icon Column

Status: current specification for the four catalog surfaces (Employees, Teams,
Skills, Connectors) and the Minimal navigation sidebar. It supersedes the
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

One component — `app/components/DirectoryTopBar` — is mounted by the Employee,
Team, Skill and Connector catalogs. Left to right:

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

- 132px for Skills and Connectors, 150px for Employees (its orb needs the room).
- Hover lifts the card 3px and darkens the border; nothing else moves.
- `prefers-reduced-motion` removes the lift.
- **Never** `content-visibility: auto` on a card this small. It let the browser
  skip painting card contents and turned the whole Skill marketplace into empty
  boxes; the performance it buys at 132px is not worth that failure mode.
- A loading placeholder must read as loading (a slow pulse), or it is
  indistinguishable from a card whose contents failed to arrive.

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

## 6. The Minimal sidebar

### 6.1 One icon column

`--void-nav-icon-centre` is declared on the nav area and consumed by everything
in it: the control bar's first button, every nav row's glyph and the footer
buttons all centre on it. When the sidebar collapses to a 48px rail the control
bar drops the inset and centres instead, because the rail's own buttons do.

### 6.2 Control bar

`⬓ 🔍 ← →` in one row. Search lives here as a glyph, not as a labelled field in
the sidebar body; its open state is `app/stores/navSearchStore` because the
trigger and the dialog sit in different subtrees. `Ctrl+K` / `Alt+F` are
unchanged. Collapsed, the rail shows the same line glyph — never a raster logo.

### 6.3 Rows

"New task" is the first row of the list, not a boxed call to action: same
height, same icon column, same flat ground as the rows under it. One accent
glyph marks it as the primary verb.

### 6.4 Sections

**One scroller, pinned heads.** `__sections` scrolls; each section head is
`position: sticky` inside it and carries the nav area's own material so rows
cannot show through as they pass underneath.

Splitting the column into a scroll box per section was tried and reverted: a
collapsed section was pushed to the bottom with a void above it, open sections
fought for height, and two scrollbars in one narrow column made it unclear what
would move.

A section head is a caption — label, then count and chevron at the far end. The
hairline that used to stretch between them read as a broken divider.

### 6.5 Fold memory

Which workspaces show their session list lives in
`app/stores/navWorkspaceFoldStore`, keyed by workspace id. As local component
state it died with the component: reordering, a list refresh or a presentation
switch silently re-expanded everything, and activating a workspace force-expanded
it over the user's choice. Activating a workspace no longer changes its fold;
only the fold control does.

## 7. Applying this to a new catalog

1. Mount `DirectoryTopBar` and pass in title, count, chip groups, search,
   utilities and the one primary action. Do not build a look-alike header.
2. Give the entity a glyph from its species table; never invent a fourth
   animated species without owner sign-off.
3. Use the three-line card, the shared content frame and the state inks above.
4. Scope page-specific rules under `.void-ui--minimal`; Classic geometry stays.
5. Delete the retired styles in the same change — the last consumer going away
   is what makes them dead.

## 8. Implementation index

| Surface | Files |
| --- | --- |
| Shared top bar | `app/components/DirectoryTopBar/` |
| Employees / Teams | `app/scenes/agents/AgentsScene*.scss`, `components/AgentCard*`, `components/CoreAgentCard*`, `components/TeamsCatalogView*` |
| Skills | `app/scenes/skills/SkillsScene*.scss`, `components/skillCatalogIcons.ts`, `components/SkillCatalogAvatar*` |
| Connectors | `infrastructure/config/components/McpToolsConfig*.scss`, `ConnectorCatalogAvatar*`, `connectorCatalogIcons.ts` |
| Sidebar | `app/components/NavBar/`, `app/components/NavPanel/`, `app/stores/navSearchStore.ts`, `app/stores/navWorkspaceFoldStore.ts` |
| Scrollbar | `app/styles/utilities/scrollbar.minimal.scss` |

Contract coverage: `SkillsScene.directory.test.tsx` (one search, one primary
action, explicit per-card state), `SkillCatalogAvatar.test.tsx` (stable and
varied glyph resolution), `navWorkspaceFoldStore.test.ts` (fold survives and is
per workspace), `AgentsScene.test.tsx` and `TeamsCatalogView.test.tsx` (top-bar
structure and paging). Per repository test policy, none of these read a
stylesheet as text.
