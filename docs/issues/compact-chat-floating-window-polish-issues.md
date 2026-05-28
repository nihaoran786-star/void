# Compact Chat Floating Window Polish Issues

## Parent

Follow-up to `docs/features/agent-companion-shaped-compact-chat-floating-window-prd.md` and the implemented compact chat desktop floating window.

## Diagnosis

### 1. Floating window has an extra background layer outside the card

The compact chat window root currently uses a transparent Tauri window, but the web content still draws a padded full-viewport wrapper around the shaped shell.

Likely source:

- `CompactChatDesktopWindow.scss`
- `.void-compact-chat-window { width: 100vw; height: 100vh; padding: 10px; background: transparent; }`
- `.void-compact-chat-window__shell` then draws its own rounded background, blur, border, and shadow.

On a transparent desktop window this creates a visible outer strip/shadow zone that reads as an extra background layer. The target behavior is a pure shaped compact window: no visible panel outside the shell, while preserving the shell border/shadow if desired.

### 2. Floating window has no minimize affordance

The header currently exposes close only.

Likely source:

- `CompactChatDesktopWindow.tsx`
- `CompactChatWindowService.ts`
- `theme.rs`

There is no adapter method for minimizing the compact chat window and no title-bar button that calls it. This should remain presentation-only and must not affect active session state.

### 3. Window edge resize needs an explicit implementation path

The Tauri window is configured as resizable:

- `theme.rs`
- compact chat builder uses `.resizable(true)`, min/max inner size.

But the window is also borderless/decorations(false), and the web content consumes the full surface. On Windows, borderless windows do not necessarily provide obvious native resize hit targets at the visual edge. The current React surface only implements title-bar dragging via `startDragging()`, not edge resize affordances.

This needs a deliberate edge-resize design:

- Prefer native resize regions if Tauri/window manager supports them reliably for borderless windows.
- Otherwise add thin DOM resize handles and route pointer deltas through the compact chat adapter to resize the Tauri window.
- Keep bounds/persistence presentation-only; do not store size in session state.

### 4. Main app open-floating-chat button is mounted in the wrong layer

The current button is mounted at `SessionScene` root:

- `SessionScene.tsx`
- `.void-session-scene__preview-first-button`
- SCSS positions it `absolute; top: 8px; right: 8px`.

Because `SessionScene` spans chat + right preview, this places the control over the right-side preview header in preview-first mode. It can overlap the right preview close/open controls, matching the screenshot.

The control belongs in the chat header actions row:

- `FlowChatHeader.tsx`
- `.flowchat-header__actions`

This puts the button at the far right of the chat top bar, next to existing chat actions, and keeps preview controls unobstructed.

## Risk Boundary

- Do not introduce a new chat mode, new session model, or independent window session identity.
- Do not modify BrowserPanel, APIMart, media generation, media polling, backend session schemas, or agent runtime.
- Keep visual polish inside compact chat UI/styles and desktop window adapter.
- Keep preview-first/open-floating-chat button placement inside chat UI composition, not right preview modules.
- Tauri/window commands must remain behind `CompactChatWindowService`.
- Any size/minimize state is presentation/window state only.

## Proposed Vertical Slices

1. **Remove the compact chat outer background layer**
   - **Type:** AFK
   - **Blocked by:** None
   - **User stories covered:** Pure floating window, no extra background strip, visual parity with companion-shaped window

2. **Add compact chat minimize control**
   - **Type:** AFK
   - **Blocked by:** None
   - **User stories covered:** User can temporarily hide the floating chat without closing session or leaving preview-first

3. **Support borderless edge resizing**
   - **Type:** AFK
   - **Blocked by:** None
   - **User stories covered:** User can resize the floating chat from its visual edges/corners

4. **Move preview-first floating-chat button into the chat header**
   - **Type:** AFK
   - **Blocked by:** None
   - **User stories covered:** Button appears in the chat top bar and does not obstruct right preview controls

5. **Desktop HITL polish verification**
   - **Type:** HITL
   - **Blocked by:** Issues 1-4
   - **User stories covered:** Verify window visual purity, minimize, resize, and button placement in the real desktop app

## Issue 1: Remove the compact chat outer background layer

**Type:** AFK
**Blocked by:** None

### What to build

Adjust the compact chat floating window surface so the visible desktop window is the shaped chat shell only. Remove or neutralize the full-viewport outer padding/background layer that creates a second visible panel around the chat card.

### Acceptance criteria

- [ ] The compact chat window no longer shows a visible background rectangle outside the rounded shell.
- [ ] The shell remains readable with its intended border/shadow.
- [ ] The transparent Tauri window remains transparent outside the shaped shell.
- [ ] Message list, composer, drag bar, close button, and streaming stop button remain usable.
- [ ] No BrowserPanel, preview, session, or backend code is touched.
- [ ] Component/style verification covers that the root wrapper is transparent and does not add visual padding/background.
- [ ] Manual desktop verification confirms the screenshot's outer background layer is gone.

## Issue 2: Add compact chat minimize control

**Type:** AFK
**Blocked by:** None

### What to build

Add a small minimize button to the compact chat header next to the close button. The button should call a compact-chat window adapter method that minimizes or hides the desktop floating window without changing the active session or preview-first state.

### Acceptance criteria

- [ ] The compact chat header includes a small minimize button with accessible label and tooltip.
- [ ] The minimize button does not trigger native drag.
- [ ] The action routes through `CompactChatWindowService`; UI does not import Tauri APIs directly.
- [ ] The native command/window API minimizes or hides only the compact chat presentation.
- [ ] Reopening preview-first or clicking the main chat-header button restores/focuses the existing compact chat flow.
- [ ] Active session, current turn, and pending task state are not changed by minimize.
- [ ] Tests cover adapter minimize behavior and UI button click behavior.

## Issue 3: Support borderless edge resizing

**Type:** AFK
**Blocked by:** None

### What to build

Make the borderless compact chat floating window resizable from its visual edges/corners. The implementation should either use supported native resize regions or add narrow DOM resize handles that call the compact chat window adapter to update Tauri window bounds.

### Acceptance criteria

- [ ] The user can resize the floating chat by dragging left, right, top, bottom, and corner edges.
- [ ] Resizing respects existing min/max dimensions.
- [ ] Resize does not start when dragging the title bar, close button, minimize button, message content, or composer.
- [ ] Resizing does not select text or break input focus after the drag ends.
- [ ] Window position is updated correctly when resizing from top/left edges.
- [ ] Bounds persistence remains presentation-only and does not include session identity.
- [ ] Tests cover resize-handle pointer behavior and adapter resize calls.
- [ ] Desktop verification confirms borderless edge resizing works on Windows.

## Issue 4: Move preview-first floating-chat button into the chat header

**Type:** AFK
**Blocked by:** None

### What to build

Move the manual open/toggle compact chat button out of `SessionScene` root overlay and into the chat header action row. The button should live with existing chat header controls so it appears at the far right of the chat top bar, matching the user's screenshot target, and never overlaps right preview controls.

### Acceptance criteria

- [ ] The floating-chat button is removed from the `SessionScene` absolute overlay.
- [ ] The button appears in `FlowChatHeader` right-side actions, visually aligned with existing header icons.
- [ ] The button is only shown when the chat header is visible and desktop/runtime support allows the compact floating chat.
- [ ] Clicking the button still dispatches the existing preview-first/open-floating-chat action path.
- [ ] The button does not overlap the right preview close/open controls in preview-first mode.
- [ ] Existing header actions such as background subagents, pull requests, search, turn list, previous, and next remain usable.
- [ ] Tests cover button placement in chat header and absence from `SessionScene`.

## Issue 5: Desktop HITL polish verification

**Type:** HITL
**Blocked by:** Issues 1-4

### What to build

Run a real desktop verification pass for the compact chat floating window polish work.

### Acceptance criteria

- [ ] Frontend compact chat tests pass.
- [ ] Preview-first/controller tests pass.
- [ ] Frontend type-check passes.
- [ ] Frontend lint passes or only reports unrelated pre-existing warnings.
- [ ] Desktop native check passes for Tauri command changes.
- [ ] Manual verification confirms the floating window has no extra outer background layer.
- [ ] Manual verification confirms minimize hides/minimizes only the floating presentation.
- [ ] Manual verification confirms reopening restores/focuses compact chat without changing the active session.
- [ ] Manual verification confirms all edges/corners can resize the borderless floating window.
- [ ] Manual verification confirms the main app button is in the chat header far-right area.
- [ ] Manual verification confirms the button does not cover right preview close/open controls.
- [ ] Manual verification confirms BrowserPanel, APIMart, media generation, polling, backend, and session model remain unaffected.
