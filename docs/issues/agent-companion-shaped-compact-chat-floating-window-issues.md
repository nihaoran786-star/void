# Agent Companion Shaped Compact Chat Floating Window Issues

## Parent

PRD: `docs/features/agent-companion-shaped-compact-chat-floating-window-prd.md`

## Risk Boundary

- Do not introduce a new chat mode, second active session, independent chat runtime, or per-window session identity.
- Keep active session selection owned by the existing main-window session navigation/state.
- Reuse the Agent Companion/Pet window shape and lifecycle pattern, but do not merge chat logic into the pet feature.
- Keep floating-chat state limited to presentation lifecycle, desktop support status, bounds, and focus/open state.
- Do not put floating-chat logic in BrowserPanel, preview modules, APIMart, media generation, task polling, backend session schemas, or agent runtime.
- Do not call Tauri APIs directly from shared UI components; use an infrastructure/desktop adapter.
- Gate floating-window controls and preview-first auto-open to desktop runtime.
- If remote workspace support is unavailable for a specific state, show a clear unavailable state instead of creating a hidden session.

## Proposed Vertical Slices

1. **Desktop lifecycle adapter for companion-shaped compact chat**
   - **Type:** AFK
   - **Blocked by:** None
   - **User stories covered:** 2, 3, 9, 10, 15, 17

2. **Compact chat floating window entry surface**
   - **Type:** AFK
   - **Blocked by:** Issue 1
   - **User stories covered:** 2, 6, 7, 11, 12, 14

3. **Active-session presentation sync**
   - **Type:** AFK
   - **Blocked by:** Issues 1-2
   - **User stories covered:** 4, 5, 6, 7, 16, 18

4. **Preview-first opens and closes the desktop floating chat**
   - **Type:** AFK
   - **Blocked by:** Issues 1-3
   - **User stories covered:** 1, 8, 9, 13, 17

5. **Agent Companion shape parity and bounds behavior**
   - **Type:** AFK
   - **Blocked by:** Issues 1-2
   - **User stories covered:** 2, 3, 10, 11, 12

6. **Lifecycle hardening for close, workspace changes, and unavailable sessions**
   - **Type:** AFK
   - **Blocked by:** Issues 1-4
   - **User stories covered:** 4, 5, 8, 9, 16, 18

7. **Desktop HITL verification for companion-shaped compact chat**
   - **Type:** HITL
   - **Blocked by:** Issues 1-6
   - **User stories covered:** 1-18

## Issue 1: Desktop lifecycle adapter for companion-shaped compact chat

**Type:** AFK
**Blocked by:** None

### What to build

Create a desktop adapter and matching native lifecycle commands for a single companion-shaped compact chat floating window. The implementation should borrow the existing Agent Companion/Pet window lifecycle pattern: create, show, focus existing, close/hide, track supported runtime, and avoid duplicate windows. UI components should call only the adapter, not Tauri APIs directly.

### Acceptance criteria

- [ ] A desktop adapter exposes open/focus/close/status behavior for the compact chat floating window.
- [ ] The native window uses a separate label from the Agent Companion/Pet window.
- [ ] Repeated open requests focus or reuse the existing compact chat floating window.
- [ ] Closing or hiding the floating window affects presentation only and does not alter active session state.
- [ ] The adapter returns an unsupported status outside desktop/Tauri runtime.
- [ ] Shared UI components do not import or call Tauri APIs directly.
- [ ] Tests cover open, focus-existing, close/hide, unsupported runtime, and duplicate-window prevention with mocked desktop APIs.
- [ ] Desktop checks cover any native command registration changes.

## Issue 2: Compact chat floating window entry surface

**Type:** AFK
**Blocked by:** Issue 1

### What to build

Add a dedicated window entry surface for the compact chat floating window. The surface should render only compact chat content inside a shaped shell inspired by the existing Agent Companion/Pet floating mode. It should not render the main app shell, BrowserPanel, preview surfaces, navigation sidebar, or pet UI.

### Acceptance criteria

- [ ] A compact-chat-specific `voidWindow` entry renders the floating chat surface.
- [ ] The surface is visually shaped and compact, borrowing the Agent Companion/Pet floating-window feel.
- [ ] The surface includes a native drag affordance using the adapter/window lifecycle pattern.
- [ ] The surface renders the active-session chat presentation when available.
- [ ] The surface shows a clear empty/unavailable state when no active session can be presented.
- [ ] The surface does not create a new session when mounted.
- [ ] The surface does not render BrowserPanel, preview modules, main navigation, or pet UI.
- [ ] Component/entry tests cover active session, empty state, and absence of main shell/BrowserPanel content.

## Issue 3: Active-session presentation sync

**Type:** AFK
**Blocked by:** Issues 1-2

### What to build

Wire the main window's active session to the compact chat floating window as presentation data. The main window remains the authority for session selection. The floating window follows active-session changes and sends messages through the existing chat path for the current active session.

### Acceptance criteria

- [ ] The main window publishes active-session presentation changes to the floating chat window.
- [ ] Switching sessions in the left sidebar updates the floating chat window.
- [ ] The floating chat does not persist an independent active session id as business state.
- [ ] Sending a message from the floating chat uses the current active session's existing send path.
- [ ] Assistant output and tool progress render through existing chat state paths.
- [ ] If the active session disappears or is unavailable, the floating chat shows a clear unavailable state.
- [ ] Tests cover active-session propagation, session switching, unavailable-session fallback, and message send behavior.

## Issue 4: Preview-first opens and closes the desktop floating chat

**Type:** AFK
**Blocked by:** Issues 1-3

### What to build

Integrate preview-first layout with the desktop compact chat floating window. Entering preview-first should immediately request the companion-shaped floating chat. Exiting preview-first should close or hide the floating chat and restore normal chat layout behavior.

### Acceptance criteria

- [ ] The preview-first action opens the desktop compact chat floating window immediately in supported desktop runtime.
- [ ] The main window's preview area becomes the primary workspace when preview-first is active.
- [ ] The normal chat column is not duplicated as an in-app floating panel.
- [ ] Exiting preview-first closes or hides the compact chat floating window.
- [ ] Re-triggering preview-first focuses/reuses the existing floating chat window.
- [ ] Unsupported runtimes do not attempt to open a Tauri floating window.
- [ ] Tests cover enter preview-first, exit preview-first, repeated activation, unsupported runtime, and no in-app DOM floating chat.

## Issue 5: Agent Companion shape parity and bounds behavior

**Type:** AFK
**Blocked by:** Issues 1-2

### What to build

Refine the compact chat floating window so its shape and behavior align with the existing lower-left Agent Companion/Pet floating mode. This includes borderless styling, transparent/background behavior where appropriate, native drag, sensible minimum size, default placement, and optional bounds persistence.

### Acceptance criteria

- [ ] The compact chat floating window uses a shaped compact shell rather than a normal full app window.
- [ ] The window uses borderless desktop-window behavior aligned with the Agent Companion/Pet pattern.
- [ ] The window can be dragged outside the main app window using native dragging.
- [ ] The window has sensible minimum dimensions for messages and composer.
- [ ] The window opens at a reasonable default position.
- [ ] Last valid position/size can be restored where supported.
- [ ] Invalid/off-screen bounds fall back to a safe default.
- [ ] Bounds persistence does not include session identity.
- [ ] Tests cover default bounds, restored bounds, invalid-bounds fallback, and no session identity in persisted state.

## Issue 6: Lifecycle hardening for close, workspace changes, and unavailable sessions

**Type:** AFK
**Blocked by:** Issues 1-4

### What to build

Define and implement robust lifecycle behavior for closing the floating chat, quitting the main app, changing workspaces, losing active-session availability, and remote/unavailable session states. Closing the floating chat should close only the presentation.

### Acceptance criteria

- [ ] Closing the floating chat does not cancel turns or end the active session.
- [ ] Quitting the main app closes the floating chat cleanly.
- [ ] Workspace changes clear or refresh floating chat presentation without stale session leakage.
- [ ] Remote/unavailable session states show clear unavailable UI rather than crashing.
- [ ] Preview-first state and floating-window state remain consistent after close/reopen.
- [ ] Tests cover close-only-presentation, app quit cleanup, workspace change, unavailable session, and preview-first consistency.

## Issue 7: Desktop HITL verification for companion-shaped compact chat

**Type:** HITL
**Blocked by:** Issues 1-6

### What to build

Run full desktop workflow verification and collect human UX feedback. This validates that the feature feels like the existing Agent Companion/Pet floating mode while presenting the current active session chat.

### Acceptance criteria

- [ ] Frontend lint passes.
- [ ] Frontend type-check passes.
- [ ] Relevant frontend tests pass.
- [ ] Desktop native checks pass for any Tauri command changes.
- [ ] Desktop app starts successfully.
- [ ] Manual verification confirms preview-first opens the companion-shaped compact chat floating window immediately.
- [ ] Manual verification confirms the floating chat can be dragged outside the main app window.
- [ ] Manual verification confirms multi-monitor placement where available.
- [ ] Manual verification confirms left-sidebar session switching updates the floating chat.
- [ ] Manual verification confirms sending from the floating chat uses the current active session.
- [ ] Manual verification confirms assistant/tool output streams into the floating chat.
- [ ] Manual verification confirms exiting preview-first closes or hides the floating chat.
- [ ] Manual verification confirms repeated preview-first activation does not create duplicate windows.
- [ ] Manual verification confirms BrowserPanel, APIMart, media generation, task polling, backend session schema, and agent runtime are unaffected.

## Open Review Questions

- Does this granularity feel right, or should the shape/bounds work be merged into the entry-surface issue?
- Should exiting preview-first close the floating chat or hide it while preserving bounds for faster restore?
- Should the compact chat floating window be always-on-top exactly like Agent Companion/Pet, or should it have a user-visible pin behavior later?
