# Agent Companion Shaped Compact Chat Floating Window PRD

> Status: Draft
> Scope: Desktop-only compact chat floating window, preview-first layout, active-session presentation, Agent Companion/Pet window-shape reuse
> Non-goal: this does not introduce a new chat mode, a second active session, an independent chat runtime, BrowserPanel business logic, backend session changes, APIMart/media/task changes, or remote-control protocol changes.

## Problem Statement

The user wants preview-first work to make the preview area the main focus while keeping chat available. A DOM-based floating chat inside the main WebView cannot leave the app window, and the user does not want an in-app floating panel. The desired behavior is closer to the existing lower-left Agent Companion/Pet desktop floating mode: a small, shaped, draggable desktop-level surface that can live outside the main app window.

The critical product constraint is that this floating chat is not a new conversation and not a new chat mode. It is a desktop-level presentation of the current active session. When the user switches sessions in the main window, the floating chat follows that active session. When the floating chat sends a message, it sends through the same active session path as normal chat.

## Solution

Add a desktop-only compact chat floating window that reuses the current Agent Companion/Pet window pattern for shape and behavior. When the user enters preview-first, the main window collapses or de-emphasizes the normal chat area and opens the compact chat floating window immediately. The main preview area becomes the main workspace, while the floating chat remains available as a small desktop-level companion surface.

The floating chat should inherit the Agent Companion/Pet interaction feel:

- Shaped compact surface rather than a normal app window.
- Borderless desktop-level window.
- Transparent background where appropriate.
- Native dragging via the existing Tauri window drag pattern.
- Always-on-top behavior if aligned with the existing companion mode.
- Skip-taskbar behavior if aligned with the existing companion mode.
- Position and bounds lifecycle patterned after the existing companion window.

The chat content is not the pet component. It is a new compact chat presentation surface that borrows the same window shape/lifecycle model. The pet remains independent.

## User Stories

1. As a Void desktop user, I want preview-first to open a small desktop floating chat, so that the preview area can become the main workspace immediately.
2. As a Void desktop user, I want the floating chat to look and feel like the existing lower-left floating companion mode, so that it feels native to the app.
3. As a Void desktop user, I want the floating chat to be draggable outside the main app window, so that I can place it beside the preview or on another monitor.
4. As a Void desktop user, I want the floating chat to follow the current active session, so that I never manage two conversations by accident.
5. As a Void desktop user, I want switching sessions in the left sidebar to update the floating chat, so that sidebar navigation remains the source of truth.
6. As a Void desktop user, I want to send messages from the floating chat, so that I can keep the preview-focused layout without returning to the full chat column.
7. As a Void desktop user, I want assistant output and tool progress to stream in the floating chat, so that it behaves like normal chat.
8. As a Void desktop user, I want leaving preview-first to close or hide the floating chat, so that normal layout behavior is restored cleanly.
9. As a Void desktop user, I want triggering preview-first again to focus or reuse the existing floating chat, so that duplicate chat windows are not created.
10. As a Void desktop user, I want the floating chat's position to be remembered where reasonable, so that repeated use feels stable.
11. As a Void desktop user, I want the floating chat to use a compact shaped shell, so that it does not feel like a second full app window.
12. As a Void desktop user, I want the floating chat to keep usable minimum dimensions, so that the composer and latest messages remain readable.
13. As a Void desktop user, I want the main preview area to remain unobstructed, so that the preview becomes the primary area.
14. As a maintainer, I want the pet floating window and chat floating window to remain separate surfaces, so that chat logic does not pollute the pet feature.
15. As a maintainer, I want Tauri calls hidden behind a desktop adapter, so that shared UI does not import native APIs directly.
16. As a maintainer, I want the floating chat state to contain presentation state only, so that session identity remains owned by existing FlowChat state.
17. As a maintainer, I want desktop-only gating, so that web/server builds do not expose a floating-window action that cannot work.
18. As a maintainer, I want focused tests around active-session sync and window lifecycle, so that the feature does not regress into a second session runtime.

## Implementation Decisions

- The compact chat floating window is desktop-only.
- It reuses the Agent Companion/Pet window pattern for shape, native drag, transparency, borderless rendering, positioning, and lifecycle behavior.
- It does not reuse the pet React component for chat content. A separate compact chat presentation surface should be added.
- It should use a separate Tauri window label from the pet window, such as a compact-chat-specific label.
- It should use a separate `voidWindow` entry value from `agent-companion`, such as a compact-chat-specific entry.
- Preview-first should open the desktop floating chat immediately.
- Exiting preview-first should close or hide the compact chat floating window.
- Re-entering preview-first should focus or reuse the existing compact chat floating window instead of creating duplicates.
- The active session remains the only conversation identity.
- The floating chat must not create, own, or persist a second active session id as business state.
- Main-window session switching remains authoritative. The floating chat follows active-session changes.
- Desktop window open/focus/close/resize/bounds behavior should sit behind a desktop adapter or service.
- Shared UI should not import Tauri APIs directly.
- The floating chat may persist window position/size as UI preference data, but this persistence must not include session identity.
- If there is no active session, the floating chat should show a clear empty state instead of creating a hidden session.
- If the runtime is not desktop/Tauri, preview-first should not attempt to open the floating chat and should show or keep a supported fallback only if intentionally designed.
- BrowserPanel, preview modules, media generation, APIMart, and task polling must not know whether chat is in the main window or floating window.
- Remote workspace behavior should use existing session/runtime paths. If active-session presentation cannot be restored in a remote scenario, the floating chat should show a clear unsupported/unavailable state.

## Testing Decisions

- Tests should assert external behavior and boundaries, not implementation details of Tauri internals.
- Add adapter-level tests for open/focus/close behavior using mocked desktop APIs.
- Add presentation-state tests proving floating chat state does not contain session identity.
- Add active-session sync tests proving main-window session changes are reflected in the floating chat presentation.
- Add entry-surface tests proving the compact chat window renders only compact chat, not BrowserPanel or main app shell.
- Add preview-first behavior tests proving entering preview-first requests the floating chat and leaving preview-first closes/hides it.
- Add tests that repeated preview-first activation focuses or reuses the existing floating chat window.
- Add tests that no active session produces an empty state rather than creating a new session.
- Run frontend lint, type-check, and relevant tests.
- Run desktop checks for any Tauri command changes.
- Run manual desktop verification for: open on preview-first, native drag outside app, multi-monitor placement where available, session switching, message sending, close/hide on exit preview-first, and duplicate-window prevention.

## Out of Scope

- New chat/session mode.
- Independent floating chat sessions.
- Multiple compact chat floating windows.
- Replacing or rewriting the existing Agent Companion/Pet feature.
- Reusing the pet component as the chat UI.
- Browser/web popup fallback.
- Backend session schema changes.
- Agent runtime/tool execution changes.
- BrowserPanel or preview-module business logic.
- APIMart, media generation, media preview, or task polling changes.
- Remote-control protocol changes.
- Full custom desktop window manager.

## Further Notes

The product model should be:

> Preview-first opens the preview workspace and a companion-shaped desktop chat surface for the same active session.

The implementation should protect that model with strict boundaries:

- Main window owns workspace/session navigation.
- FlowChat/session systems own conversation state.
- Desktop adapter owns native window lifecycle.
- Compact chat floating entry renders current active-session presentation.
- Agent Companion/Pet remains a separate feature whose window lifecycle pattern is borrowed, not merged.
- Preview modules remain preview-only.

This PRD intentionally avoids reviving the in-app DOM floating chat. The user specifically wants the shape and mode of the current lower-left desktop floating companion, with chat content bound to the current active session.
