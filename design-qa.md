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
