# Minimal Workspace Technical Audit — 2026-07-18

## Scope

This audit covers the current `minimal` workspace presentation, with special
attention to the shell, navigation, composer, short-drama center, media
surfaces, and the short-drama team rail. It is a release-gate audit: findings
that also exist in the classic presentation still block making minimal the
default when they make an existing capability unreachable.

The initial audit was read-only. The remediation cycle that followed changed
only feature-local presentation/accessibility code and the explicit
short-drama team status projection described below. Runtime generation,
persistence, Skill policy, media tool routing, and the classic rollback path
were not replaced.

## Post-remediation release status

The initial findings are retained below as an audit trail. This section is the
authoritative current status after the 2026-07-18 remediation and verification
cycle.

- Current blockers: **P0 0, P1 0**.
- Current health: **17/20 (Good)**.
- Minimal remains opt-in while the remaining P2 inventory and the later
  default-switch/debt-cleanup slice are incomplete.
- The dedicated visual reviewer passed the latest keyboard-focus, normal
  Workspace Status, and 200% Workspace Status captures with **P0 0 / P1 0**.
- The 200% dialog keeps its title, close action, current workspace, and current
  workspace actions visible; recent workspaces correctly continue in the
  internal scroll region.

| Initial P1 gate | Remediation evidence |
|---|---|
| Historical session rows | Native keyboard activation and focused automation contract |
| Workspace Status unreachable | Lazy shell-owned dialog route plus real-desktop reachability |
| Stop controls non-semantic | Named native buttons with unchanged cancellation callbacks |
| Skills submenu pointer-only | Keyboard open, movement, Escape, and focus-return contract |
| Composer unnamed | Multiline textbox semantics and localized accessible name |
| Short-drama cards pointer-only | Feature-local keyboard activation helper and focused contract |
| Video tab model incomplete | Arrow/Home/End roving selection contract |
| Collapsed team state hidden | Explicit `ShortDramaTeamAgentStatusProjection`; Store access isolated to one adapter |
| Workspace portal focus missing | Roving menu focus, visible focus state, Escape/focus return, desktop screenshots |
| Canvas tabs pointer-only | Tab semantics and keyboard activation without removing drag/close behavior |

Current non-blocking P2 inventory:

- secondary session/workspace icon-menu semantics are not yet uniform;
- slash, MCP, and file suggestion popovers still need complete
  listbox/option/active-descendant semantics;
- workspace drag reordering has no keyboard-equivalent move command;
- the system-theme and full semantic-state contrast matrix is not yet
  exhaustively captured;
- media status filtering, the remaining long-list virtualization inventory,
  offscreen video metadata reads, and aggressive media scans require a
  separate media-owned slice;
- at 200% zoom, the Workspace Status scroll region works but could expose a
  more discoverable subtle scroll affordance.

Verification evidence:

- Web unit/component suite: **327 files, 1,819 tests passed**.
- Real-desktop minimal workspace gate: **4/4 passed**, including keyboard
  portal focus, narrow desktop, and 100%/125%/150%/200% zoom.
- TypeScript, core boundary, theme visual contract, theme color audit, and
  three-locale i18n contract/audit all passed.
- Web and desktop Vite builds each transformed **7,447 modules** successfully.
- Frozen Web entry budget passed: JavaScript raw
  **2,370,683 / 2,372,359 bytes**, CSS raw
  **661,571 / 672,720 bytes**, **47** required dynamic entries, and
  **0** unresolved static imports. JavaScript gzip is 870 bytes above its
  comparison reference but below the enforced raw release budget.
- The four protected user-owned files listed in the migration architecture
  document retained their recorded SHA-256 values and remain excluded from
  this slice.

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|---|---:|---|
| 1 | Accessibility | 3/4 | All initial P1 keyboard/name/focus blockers are closed; secondary composite controls remain P2. |
| 2 | Performance | 3/4 | Idle CPU and frozen entry budgets pass; the remaining media long-list inventory is incomplete. |
| 3 | Responsive Design | 4/4 | Real desktop checks pass at narrow width and 100%-200% zoom, including the Workspace Status dialog. |
| 4 | Theming | 3/4 | Minimal uses semantic workspace tokens and preserves classic; system-theme and full state contrast remain unverified. |
| 5 | Anti-Patterns | 4/4 | The interface remains restrained, additive, and free of decorative gradients, glow, and glass effects. |
| **Total** |  | **17/20** | **Good — no P0/P1 blocker; remaining P2 work still gates the default switch.** |

## Anti-Patterns Verdict

**Pass.** The minimal workspace does not look like a generic AI-generated
landing page. It avoids gradients, glassmorphism, permanent glow, decorative
animation, hero metrics, and ornamental card grids. Its blue-gray palette is a
deliberate ThemeService/brand choice, not a local hard-coded AI palette.

Two minor tells remain:

- the welcome title can be repeated immediately by one randomized welcome
  message;
- the session-mode control has an outer group border, an inner divider, and an
  active pill, creating one unnecessary visual layer.

## Executive Summary

- Current audit health: **17/20 (Good)**.
- Current blockers: **P0 0, P1 0**. The ten initial P1 findings below are
  resolved and retained only as historical findings.
- No crash, data-loss, short-drama runtime, media resolver, Skill isolation, or
  classic rollback regression was found.
- Minimal remains opt-in until the outstanding P2 evidence/performance
  inventory and the final default-switch gate are complete.
- The collapsed team status now uses an explicit feature-local projection; its
  control strip imports no `FlowChatStore`, agent service, or Skill policy.

## Initial Detailed Findings (historical)

### Initial P1 — Resolved release blockers

#### [P1] Historical session rows are pointer-only

- **Location:** `src/web-ui/src/app/components/NavPanel/sections/sessions/SessionsSection.tsx:698`
- **Category:** Accessibility
- **Impact:** Keyboard users cannot focus a historical session row or activate
  it with Enter/Space, so session switching is unavailable.
- **Standard:** WCAG 2.1.1 Keyboard; 4.1.2 Name, Role, Value.
- **Recommendation:** Use a native button or an equivalent roving/list
  pattern with an accessible current-state label. Keep menu actions outside
  the primary activation control.
- **Suggested command:** `$harden`

#### [P1] Workspace Status is mounted but has no open path

- **Location:** `src/web-ui/src/app/layout/AppLayout.tsx:216`, `:766`
- **Category:** Accessibility / Functional reachability
- **Impact:** `WorkspaceManager` is permanently passed `isVisible={false}`;
  users cannot reach a capability listed in the parity gate.
- **Standard:** Product capability parity.
- **Recommendation:** Restore an existing shell/menu event as the only
  controller for this dialog. Do not add workspace-source logic to
  `AppLayout`.
- **Suggested command:** `$harden`

#### [P1] Stop-generation controls are non-semantic divs

- **Location:** `src/web-ui/src/flow_chat/components/ChatInput.tsx:2710`, `:2738`
- **Category:** Accessibility
- **Impact:** A keyboard or screen-reader user cannot discover or operate the
  primary stop action. Escape support is not an accessible-name substitute.
- **Standard:** WCAG 2.1.1 Keyboard; 4.1.2 Name, Role, Value.
- **Recommendation:** Render a native button with the existing localized stop
  label and preserve the same cancellation callback and visual state.
- **Suggested command:** `$harden`

#### [P1] The Skills submenu opens only on pointer hover

- **Location:** `src/web-ui/src/flow_chat/components/ChatInput.tsx:3128`
- **Category:** Accessibility
- **Impact:** Keyboard users cannot select allowed Skills from the Composer.
- **Standard:** WCAG 2.1.1 Keyboard; 2.4.3 Focus Order.
- **Recommendation:** Add click, Enter/Space, focus, Escape, and focus-return
  behavior to the existing submenu state. Do not change Skill policy or
  runtime filtering.
- **Suggested command:** `$harden`

#### [P1] The main Composer has no accessible name or textbox semantics

- **Location:** `src/web-ui/src/flow_chat/components/ChatInput.tsx:2867`,
  `src/web-ui/src/flow_chat/components/RichTextInput.tsx:824`
- **Category:** Accessibility
- **Impact:** Screen readers cannot reliably identify the primary message
  field or announce it as multiline input.
- **Standard:** WCAG 1.3.1 Info and Relationships; 4.1.2 Name, Role, Value.
- **Recommendation:** Pass the existing localized placeholder as an accessible
  name and expose textbox/multiline/disabled state on the contenteditable
  element.
- **Suggested command:** `$harden`

#### [P1] Short-drama artifact selection is pointer-only

- **Location:** `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx:1519`,
  `:1716`, `:1751`, `:1797`
- **Category:** Accessibility
- **Impact:** Keyboard users cannot select storyboard assets, post items, or
  the final preview, blocking central short-drama workflows.
- **Standard:** WCAG 2.1.1 Keyboard.
- **Recommendation:** Give the interactive card surface native button
  semantics or a single focusable activation target, preserving the current
  artifact-focus callback and card layout.
- **Suggested command:** `$harden`

#### [P1] The video rail has an incomplete tab keyboard model

- **Location:** `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx:1641`
- **Category:** Accessibility
- **Impact:** Inactive videos have `tabIndex={-1}`, but no arrow-key handler
  moves focus or selection, so only the active video is keyboard-reachable.
- **Standard:** WCAG 2.1.1 Keyboard; WAI-ARIA Tabs pattern.
- **Recommendation:** Implement Left/Right (or Up/Down, matching layout),
  Home, and End behavior, or use independently tabbable buttons without
  `role="tab"`.
- **Suggested command:** `$harden`

#### [P1] Collapsed team rail hides live and failure state

- **Location:** `src/web-ui/src/app/components/panels/content-canvas/editor-area/ShortDramaTeamPanelControls.tsx:7`,
  `src/web-ui/src/app/components/panels/content-canvas/editor-area/EditorArea.tsx:247`
- **Category:** Accessibility / Functional parity
- **Impact:** A failed, waiting, cancelled, or running stage can be invisible
  while the team drawer is in its default collapsed state.
- **Standard:** Minimal-workspace Slice 3 exit gate.
- **Recommendation:** Create an explicit feature-local status projection and
  pass it into the pure controls. Do not import `FlowChatStore`, agent
  services, or Skill configuration into the controls.
- **Suggested command:** `$extract`

#### [P1] New/open project portal menu does not move focus

- **Location:** `src/web-ui/src/app/components/NavPanel/MainNav.tsx:151`, `:389`
- **Category:** Accessibility
- **Impact:** Opening the portal menu leaves focus on the trigger; keyboard
  users can miss the menu and its project actions.
- **Standard:** WCAG 2.4.3 Focus Order; WAI-ARIA Menu Button pattern.
- **Recommendation:** Move focus to the first enabled item, support
  arrows/Escape, and restore focus to the trigger.
- **Suggested command:** `$harden`

#### [P1] Canvas tabs are not keyboard-operable

- **Location:** `src/web-ui/src/app/components/panels/content-canvas/tab-bar/Tab.tsx:157`
- **Category:** Accessibility
- **Impact:** Displayed canvas tabs use a clickable draggable `div` without a
  role, focus target, selected state, or keyboard activation. This affects
  short-drama, media, agent, and editor tabs.
- **Standard:** WCAG 2.1.1 Keyboard; 4.1.2 Name, Role, Value.
- **Recommendation:** Implement a complete native/ARIA tab activation model
  while preserving drag, middle-click close, double-click promotion, pin,
  pop-out, and close behavior.
- **Suggested command:** `$harden`

### P2 — Minor issues and verification risks

#### [P2] Session/workspace icon menus have incomplete menu-button semantics

- **Location:** `src/web-ui/src/app/components/NavPanel/sections/sessions/SessionsSection.tsx:828`,
  `src/web-ui/src/app/components/NavPanel/sections/workspaces/WorkspaceItem.tsx:1063`
- **Category:** Accessibility
- **Impact:** Icon-only triggers are poorly announced, and portal menus do not
  consistently implement arrow, Escape, or focus-return behavior.
- **Standard:** WCAG 4.1.2; WAI-ARIA Menu Button pattern.
- **Recommendation:** Add localized names, `aria-haspopup`, expanded state,
  managed menu focus, Escape, and focus return.
- **Suggested command:** `$harden`

#### [P2] Suggestion lists are not exposed as listbox/option

- **Location:** Composer slash, MCP prompt, and file-mention pickers.
- **Category:** Accessibility
- **Impact:** Keyboard selection works visually, but assistive technology
  cannot reliably announce the candidate list or active candidate.
- **Standard:** WCAG 4.1.2; WAI-ARIA Combobox pattern.
- **Recommendation:** Connect the textbox to listbox/option semantics with
  `aria-controls` and `aria-activedescendant`.
- **Suggested command:** `$harden`

#### [P2] Workspace reordering has no keyboard equivalent

- **Location:** Workspace navigation drag-and-drop.
- **Category:** Accessibility
- **Impact:** Keyboard users cannot perform the same reordering operation as
  pointer users.
- **Standard:** WCAG 2.1.1 Keyboard.
- **Recommendation:** Add explicit move up/down actions or a keyboard reorder
  mode with live announcements.
- **Suggested command:** `$adapt`

#### [P2] About progress animation lacks a reduced-motion override

- **Location:** `src/web-ui/src/app/components/AboutDialog/AboutDialog.scss`
- **Category:** Accessibility
- **Impact:** Users who request reduced motion can still receive an infinite
  non-essential progress animation.
- **Standard:** WCAG 2.3.3 Animation from Interactions.
- **Recommendation:** Disable the decorative animation under
  `prefers-reduced-motion: reduce` without changing update state.
- **Suggested command:** `$harden`

#### [P2] Full theme/state matrix remains unverified

- **Location:** Minimal workspace release gate.
- **Category:** Theming
- **Impact:** Light screenshots and token contracts pass, but system theme and
  all hover/selected/disabled/loading/success/warning/error combinations do
  not yet have complete evidence.
- **Standard:** WCAG 1.4.3 Contrast; theme contract.
- **Recommendation:** Add deterministic system-theme captures and automated
  state contrast/semantic checks before the default switch.
- **Suggested command:** `$normalize`

#### [P2] Status filtering and long-list preservation remain incomplete gates

- **Location:** Workspace media gallery and the remaining long-list inventory.
- **Category:** Performance / Functional parity
- **Impact:** Media type filtering and lazy thumbnail behavior are covered,
  but status filtering and preservation of every formerly virtualized list
  are not yet proven.
- **Standard:** Minimal-workspace parity and performance gates.
- **Recommendation:** Inventory prior virtualized lists and add a
  no-provider, fixture-driven media status-filter check.
- **Suggested command:** `$optimize`

### P3 — Polish

#### [P3] One welcome message repeats the page title

- **Location:** `src/web-ui/src/locales/en-US/common.json`,
  `src/web-ui/src/locales/zh-CN/common.json`,
  `src/web-ui/src/locales/zh-TW/common.json`, `welcomeScene.messages.message4`
- **Category:** Anti-Pattern
- **Impact:** The welcome surface can read as “Welcome to void / Welcome to
  void…”, weakening hierarchy without adding information.
- **Recommendation:** Keep only the action-oriented second sentence in all
  three locales. Preserve the scene label and semantic `h1`.
- **Suggested command:** `$clarify`

#### [P3] Session-mode selector has one unnecessary visual divider

- **Location:** `src/web-ui/src/app/components/NavPanel/NavPanel.minimal.scss:63`
- **Category:** Anti-Pattern
- **Impact:** Outer border, inner divider, and active pill create a slightly
  nested-card appearance.
- **Recommendation:** Make only the minimal-presentation inner divider
  transparent; preserve its box-model space, outer group boundary, active
  indicator, DOM, and radiogroup semantics.
- **Suggested command:** `$distill`

#### [P3] One short-drama ARIA label is hard-coded English

- **Location:** `src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx:1566`
- **Category:** Accessibility / Theming consistency
- **Impact:** Non-English screen-reader users receive inconsistent language.
- **Recommendation:** Move the label to the existing short-drama i18n
  namespace.
- **Suggested command:** `$clarify`

## Patterns and Systemic Issues

1. Several complex controls are visually complete but rely on `div + onClick`.
   Native semantics and a shared keyboard pattern should be preferred before
   adding more local key handlers.
2. Portal menus are implemented independently, so focus entry, arrow
   navigation, Escape, and focus return are inconsistent.
3. The collapsed team rail correctly avoids owning runtime state, but its
   feature-local status projection has not been implemented yet. This is an
   intentional architecture boundary, not permission to read global stores
   directly from the control.
4. Automated parity evidence is strong at L0, visual, performance, and focused
   module levels, but provider-free restart/history and several Composer
   interaction paths still need real-desktop coverage.

## Positive Findings

- Classic and minimal presentations use the same controller/runtime tree;
  classic remains a tested rollback path.
- Minimal styling is dynamically loaded, scoped, and token-based.
- Real-desktop tests pass at narrow width and 100%, 125%, 150%, and 200% zoom
  without document-level horizontal overflow.
- Entry JS/CSS raw budgets pass, all required dynamic entries remain dynamic,
  and stabilized Vite idle CPU is effectively zero.
- Media stays lazy-loaded and conversations keep bounded progressive history
  rendering.
- The short-drama team rail uses native named buttons, preserves the real
  session panel, and pauses hidden presentation work without unmounting it.
- Composer IME handling and attachment selection, drag/drop, paste, and removal
  paths are present.
- Short-drama Skill isolation and stage-scoped media tool availability have
  focused policy tests.
- The latest desktop screenshots show no clipping, overflow, unreadable
  typography, or P0-P2 visual defect.

## Recommended Next Actions

1. **[P2] `$adapt`** — finish keyboard-equivalent reorder and composite
   control navigation.
2. **[P2] `$normalize`** — close system-theme and semantic state evidence.
3. **[P2] `$optimize`** — inventory retained virtualization, verify media
   status filtering, and stop offscreen video metadata work.
4. **[P3] `$clarify`** — remove redundant welcome copy and localize the
   remaining ARIA text.
5. **[P3] `$polish`** — perform the final visual pass after functional gates
   are green.

Re-run `$audit` after each isolated P2 slice before making minimal the default.
