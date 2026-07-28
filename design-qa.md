# Design QA: Deferred new-session home

## Scope

- Source visual truth: user-provided
  `codex-clipboard-d82158fc-8313-45b8-bd35-4e9789da597f.png`.
- Primary implementation:
  - `src/web-ui/src/app/components/NavPanel/components/SessionCreateLauncher.tsx`
  - `src/web-ui/src/flow_chat/components/WelcomePanel.tsx`
  - `src/web-ui/src/flow_chat/components/ChatInput.tsx`
  - `src/web-ui/src/flow_chat/components/ChatInputWorkspaceStrip.tsx`
- Lifecycle boundary:
  - `src/web-ui/src/flow_chat/services/NewSessionDraftService.ts`
  - `src/web-ui/src/app/stores/sessionModeStore.ts`
  - `src/web-ui/src/flow_chat/hooks/useMessageSender.ts`

The source defines the compact icon-led navigation, centered prompt hierarchy,
three-mode selector, and integrated composer with workspace metadata. Product
semantics override the source labels: the supported modes are code session,
office session, and media session. Short drama remains a capability inside a
media session.

## Capture evidence

- Theme: light minimal workspace.
- Desktop state: unpersisted new-task draft with no selected workspace.
- Full-screen capture: temporary QA artifact
  `void-new-task-independent-final-v2.png`.
- Combined source/implementation comparison: temporary QA artifact
  `void-new-task-reference-comparison-v2.png`.

The matched capture is 1479 by 1049 physical pixels. Its browser viewport is
986 by 699 CSS pixels at device pixel ratio 1.5. The narrow capture uses a
772 by 498 CSS-pixel viewport.

## Fidelity review

| Surface | Reference requirement | Implementation result |
| --- | --- | --- |
| New-task action | One compact icon and text; no sidebar mode slider | Matched using the existing icon library |
| Prompt hierarchy | Centered, low-noise title | Matched |
| Mode selector | Three compact icon-led options | Matched with code, office, and media semantics |
| Composer | Tall integrated input with internal metadata row | Matched using the existing production composer |
| Workspace | Selectable beneath the input | Preserved as an ephemeral draft selection |
| Focus | Quiet single focus treatment | Passed; no outline or double shadow |
| Responsive layout | No overlap or horizontal overflow | Passed at matched, full-screen, and narrow sizes |

## Interaction and lifecycle review

1. Clicking New Task opens an independent draft and clears only the active
   projection and active workspace/session highlight.
   It does not create, delete, or persist a session.
2. The new-task draft starts in code mode with no workspace selected. Switching
   code, office, and media changes only the draft mode.
3. The workspace picker lists already-open workspaces and exposes a separate
   New Workspace action through the existing project dialog interface.
4. The first non-empty send creates exactly one session with the selected
   workspace and mapped agent type, then sends the first message through the
   existing Flow Chat path.
5. Opening the draft collapses the auxiliary preview without closing tabs or
   deleting child sessions.
6. Browser interaction probing recorded no runtime error or unhandled promise
   rejection.
7. Opening a historical row leaves the draft page and restores its normal
   workspace-scoped conversation. Returning through New Task restores the
   unbound draft without selecting a historical row.

## Findings and corrections

1. **P0 — The first iteration created or reused a workspace session too
   early.** Creation is now deferred until the first text send.
2. **P0 — Short drama was presented as a top-level session type.** The selector
   now exposes only code, office, and media; short drama stays inside media.
3. **P1 — The draft workspace name collapsed to zero width.** The picker now
   keeps a bounded readable label and a compact menu.
4. **P1 — Draft presentation styles also affected existing empty sessions.**
   Styling is now scoped by the draft-only creation-mode control.
5. **P1 — The auxiliary preview could remain open and compete with the new
   session home.** Draft entry now uses the existing panel action to collapse
   it while preserving its state.
6. **P2 — The initial composer was too shallow compared with the reference.**
   The matched-height surface now uses distinct input, action, and workspace
   rows; short viewports fall back to the compact production layout.
7. **P0 — The sidebar mode slider implied that New Task was pre-bound to a
   session type and workspace.** Minimal navigation now has one New Task action;
   mode and workspace selection live only on the independent draft page.
8. **P1 — The mode examples shifted the title and wrapped at full-screen
   scale.** They are now a smaller absolutely positioned control, so their
   content does not participate in the title's layout and all three labels stay
   on one line.

## Verification

- Focused new-task tests: 21 passed across 6 files.
- Deferred first-send test confirms one workspace-scoped session creation.
- Full-screen click verification: sidebar mode slider 0, draft modes 3,
  selected workspace 0, selected history row 0.
- Workspace picker verification: New Workspace action plus all three opened
  workspace choices.
- Historical-session round trip: draft modes 0 in history, then 3 after
  returning through New Task.
- Web TypeScript, repository hygiene, and i18n contract gates passed.

final result: passed

---

# Design QA: Team entry in the session capability rail

## Scope

- Source visual truth: the user-selected generated three-pane team workspace
  reference preserved in the combined comparison artifact below.
- Production surfaces:
  - `src/web-ui/src/app/scenes/session/SessionCapabilityRail.tsx`
  - `src/web-ui/src/app/scenes/session/SessionCapabilityRail.scss`
  - `src/web-ui/src/app/presentation/sessionCapabilityRailOutlet.tsx`
  - `src/web-ui/src/app/components/panels/content-canvas/editor-area/EditorArea.tsx`
  - `src/web-ui/src/app/components/panels/content-canvas/editor-area/ShortDramaTeamPanelControls.tsx`

This slice moves the existing Short Drama team projection into the persistent
session capability rail. It deliberately does not add a universal team
registry, mode eligibility, team lifecycle, or another subagent runtime.

## Capture evidence

- Compact full-window state:
  `.codex-artifacts/team-capability-rail/slice-team-team-rail-compact-full.png`.
- Pointer-hover expanded state:
  `.codex-artifacts/team-capability-rail/slice-team-team-rail-expanded-full.png`.
- Team coordination open beside Canvas:
  `.codex-artifacts/team-capability-rail/slice-team-team-coordination-open-full.png`.
- Combined source and implementation comparison:
  `.codex-artifacts/team-capability-rail/design-qa-comparison.png`.

The source is 1672 by 941 pixels. The implementation is captured from a
2582-by-1390 physical desktop window; the resulting image is 2561 by 1377
pixels from a 1707-by-918 CSS-pixel WebView at device pixel ratio 1.5. The
source contains richer illustrative task data, while the implementation uses
the isolated Short Drama fixture so the entry and three-pane composition can
be reviewed independently.

## Fidelity and interaction review

| Requirement | Result |
| --- | --- |
| Tiny idle footprint | Passed: the rail remains 36 px at rest |
| Expand only when the pointer asks for context | Passed: hover expands to 148 px; click/focus does not leave it enlarged |
| Distinguish teams from tool capabilities | Passed: a divider precedes the team entry |
| Expose team identity and state | Passed: team icon, member count, semantic dot, name, and concise status |
| Preserve the active Canvas | Passed: opening the team adds the coordination partition without replacing the Short Drama surface |
| Keep the entry available while open | Passed: the active entry remains visible and receives one restrained selected treatment |
| Preserve current runtime semantics | Passed: the entry consumes the existing Short Drama status projection and toggle path |
| Full-window stability | Passed: no document or scene horizontal overflow at the verified desktop size |
| Reduced motion and keyboard visibility | Passed: transitions are disabled under reduced motion and controls retain a visible focus outline |

## Findings and corrections

1. **P2 — Early WebDriver captures were false half-width evidence.** Windows
   display scaling caused a nominal 1280-by-800 outer size to represent only a
   partial desktop surface. The focused regression now sets a physical
   2582-by-1390 window and records the CSS viewport and device-pixel ratio.
2. **P2 — Click focus could leave the rail permanently enlarged.** Expansion
   is now pointer-hover-only; the clicked team entry retains a visible selected
   state without reserving 148 px.
3. **P2 — One fallback referenced an undefined theme token.** The count badge
   now uses the defined Minimal workspace active-surface token directly.
4. **No remaining actionable P0, P1, or P2 visual finding** was observed in the
   final compact, expanded, and three-pane captures.

## Verification

- Focused rail, team projection, recovery, scene toggle, and minimal layout
  tests: 29 passed across 7 files.
- Focused physical full-window E2E: 1 passed.
- Web TypeScript, core-boundary, theme-color, and theme visual-contract checks:
  passed.
- Production Web UI ESLint: passed.

final result: passed

---

# Design QA: Session capability rail

## Scope

- Source visual truth: user-selected
  `codex-clipboard-5dbb43d8-8dc6-4127-8626-d6fe117fa4b0.png`.
- Production surfaces:
  - `src/web-ui/src/app/scenes/session/SessionCapabilityRail.tsx`
  - `src/web-ui/src/app/scenes/session/SessionCapabilityRail.scss`
  - `src/web-ui/src/app/scenes/session/SessionScene.tsx`
  - `src/web-ui/src/app/components/panels/content-canvas/tab-bar/TabBar.tsx`
- Capability projection:
  - `src/web-ui/src/flow_chat/services/sessionCapabilities.ts`
  - `src/web-ui/src/flow_chat/hooks/useActiveSessionCapabilities.ts`

The reference establishes a small, highlighted capability capsule beside the
conversation. The implementation keeps that hierarchy while using persisted
session mode and tool activity as the source of truth. Terminal and browser
tabs remain ordinary canvas tabs and never become session capabilities.

## Capture evidence

- Full desktop capture, compact state:
  `.codex-artifacts/visual/session-capability-rail-tight-compact.png`.
- Full desktop capture, focused capsule:
  `.codex-artifacts/visual/session-capability-rail-tight-expanded.png`.
- Full desktop media-session default:
  `.codex-artifacts/visual/media-session-default-gallery-tight-rail.png`.
- Full desktop media close-and-reopen result:
  `.codex-artifacts/visual/media-capability-rail-reopen.png`.
- Combined source and implementation review:
  `.codex-artifacts/visual/media-capability-rail-reference-comparison.png`.

The source is 1701 by 925 pixels. The current desktop capture is 2561 by 1368
pixels from a 1707 by 912 CSS-pixel WebView at device pixel ratio 1.5. The
combined comparison is 2560 by 696 pixels and normalizes both sides to 1280
pixels wide. The source represents the expanded capability state; the compact
state is an intentional additional product requirement. A separate focused
crop was unnecessary because both capability labels, their status dots, and
the selected media state remain legible in the full-width comparison.

## Fidelity and interaction review

| Requirement | Result |
| --- | --- |
| Small by default | Passed: 36 px rail with 22 px icon cells on every chat width |
| Hover/focus expansion | Passed: pointer hover or keyboard focus expands to 136 px |
| Clear selected highlight | Passed: expanded state retains the blue-accent capsule |
| Per-session capability state | Passed: derived only from the active persisted transcript |
| Open or focus an existing capability | Passed through the existing short-drama and media canvas events |
| Collapse while AI output is active | Passed: toggle is outside the streamed message surface |
| No duplicate top-level media or short-drama entry | Passed: capabilities use real canvas tabs only |
| Draft new-task page remains clean | Passed: the rail is hidden before a session exists |
| Canvas state is preserved | Passed: collapse hides the pane without closing its tabs |
| Media-session default | Passed: activating a media session opens and expands the existing Media tab without waiting for library discovery |
| Persistent media reopen entry | Passed: every normal Media session projects a ready Media capability even before generating an asset |
| Close and reopen media | Passed: middle-close removes the Media tab while the capability remains; clicking it recreates and activates the existing Media surface |

## Comparison history

- Earlier P2: the compact state remained 42 px and the expanded state occupied
  150 px. The rail is now 36 px by default and 136 px while interacting.
- Earlier P1: an empty media session waited for media discovery and could show
  an empty canvas. The media-session activation path now opens the existing
  workspace Media surface on the next animation frame, after workspace canvas
  restoration has completed.
- Earlier P1: the Media capsule was derived only from media tool history, so a
  new Media session—or a session whose Media tab had been closed—could lose its
  visible reopen path. Normal Media sessions now receive a zero-asset ready
  capability from their persisted session mode; real tool activity still owns
  its later status and asset count.
- Post-fix evidence shows no persistent chat obstruction, clipped labels,
  duplicate media tabs, broken thumbnails, or missing close/reopen control.

## Verification

- Media lifecycle, capability projection, and session rail tests: 24 passed
  across 3 files.
- Web TypeScript: passed.
- Theme color contract: passed with zero undefined variables.
- Desktop interaction: compact, expanded, media-session activation, image
  loading, panel expansion, collapse, and reopen transitions passed.
- Browser-rendered console/alert check found no visible runtime error.
- Fonts, spacing, colors, existing Lucide icons, loaded media image quality,
  and localized copy passed the visible fidelity review.

final result: passed
