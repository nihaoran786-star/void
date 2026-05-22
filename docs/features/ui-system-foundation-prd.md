# UI System Foundation PRD

> Status: Draft
> Scope: Desktop shell visual consistency, left navigation, top bar, shared UI primitives, low-risk spacing and styling cleanup
> Non-goal: this document does not prescribe a full visual rebrand, a global CSS skin, runtime behavior changes, or Agent capability changes.

## Problem Statement

Void's current frontend is difficult to restyle safely. A broad visual overhaul quickly becomes fragile because layout, local SCSS, component state, third-party surfaces, and product-specific flows are tightly interleaved. A previous Dark Glass direction showed the visual target, but applying it as a large CSS layer produced an unsatisfactory result and created too much risk for the application surface.

The user's goal is still to improve the UI, but the path needs to change. The immediate problem is not the absence of a stronger style. The problem is that Void does not yet have a stable UI foundation that can absorb a stronger style without breaking layout, Windows scaling behavior, chat ergonomics, Monaco, xterm, or session workflows.

## Solution

Move from a full-screen reskin to a staged UI foundation plan.

The first deliverable is a narrow, stable design-system pass for the desktop shell: left navigation and top bar only. This pass should standardize dimensions, icon buttons, row heights, typography, active/hover states, focus treatment, and spacing tokens while preserving all current behavior.

The left navigation should also remove the current "two separate new session entries" feeling. The preferred direction is one primary "new session" action, with a compact segmented slider above it for choosing the session mode. This follows the reference sidebar pattern: a small rounded mode switcher at the top, one clear creation action below it, and a quiet empty/list area. The implementation should keep Void's existing colors; the improvement should come from small details such as alignment, radius, padding, border contrast, hover feedback, selected state, and icon sizing.

After the shell foundation is stable, extract and normalize shared primitives such as `IconButton`, `SidebarItem`, `Panel`, `ToolbarButton`, and top-bar layout affordances. Only then should Void revisit a stronger black/white, dark, or subtle-glow visual language. The visual style should be applied through existing theme tokens and shared primitives, not through broad global overrides.

## User Stories

1. As a Void desktop user, I want the left navigation items to align consistently, so that the app feels stable on Windows and high-DPI screens.
2. As a Void desktop user, I want icon buttons in the sidebar and top bar to have predictable sizes and hit areas, so that common actions do not feel visually misaligned.
3. As a Void desktop user, I want hover, active, disabled, and focus states to feel consistent, so that I can understand where I am and what is clickable.
4. As a Void desktop user, I want the top bar to feel compact and intentional, so that the app behaves like a serious desktop tool rather than a web page placed in a window.
5. As a Void desktop user, I want one clear new-session action instead of two competing create entries, so that starting work feels simpler.
6. As a Void desktop user, I want to switch the new-session mode from a compact segmented control above the create action, so that mode choice is visible without duplicating creation buttons.
7. As a Void desktop user, I want the sidebar to use quiet details such as balanced padding, consistent radius, subtle borders, and stable selected states, so that it feels more polished without changing the app's color identity.
8. As a Void desktop user, I want the UI cleanup to preserve existing chat, session, Agent, terminal, editor, and file behavior, so that visual work does not reduce product capability.
9. As a Void desktop user, I want visual changes to arrive in small, reviewable pieces, so that bad design choices can be reverted without destabilizing the app.
10. As a developer, I want the shell UI to use shared primitives, so that later visual redesigns do not require repeated one-off SCSS patches.
11. As a developer, I want the design system to encode row height, icon size, padding, radius, border, and focus rules, so that contributors do not guess these values per component.
12. As a developer, I want the first phase to avoid chat, runtime, route, adapter, and external-system changes, so that the implementation is low risk.
13. As a developer, I want layout tests around sidebar actions and top-bar sizing, so that Windows-specific icon alignment bugs do not return.
14. As a designer, I want the shell to be clean before applying a high-end visual style, so that the final visual language does not rely on masking structural problems.
15. As a designer, I want the future Dark/Black Glass direction to be token-driven, so that the app can evolve without a brittle global CSS overlay.
16. As a maintainer, I want every phase to have a narrow rollback boundary, so that visual experiments do not become hard to unwind.

## Implementation Decisions

- The UI redesign will not start with a full-app theme replacement.
- Phase 1 is limited to the desktop shell foundation: left navigation, top bar, shared button sizing, row rhythm, borders, spacing, hover/active/focus states, and Windows scaling resilience.
- Phase 1 will keep the current color palette. No new black-glass theme, glow system, accent color, or global color override should be introduced.
- The sidebar create flow should be represented as one create-session action plus a compact segmented mode switcher above it, not as two visually competing "new session" actions.
- The segmented switcher should be treated as a UI selection control, not as a second navigation system. It selects the mode used by the single create action.
- The segmented switcher should use existing iconography and theme tokens, with small polish details inspired by the reference image: rounded container, selected thumb/active segment, even icon spacing, quiet inactive icons, and stable 32-36px touch targets where the existing layout allows.
- Phase 1 must not change chat behavior, session loading, Agent execution, tool calls, file operations, terminal behavior, editor behavior, routing, adapters, or external APIs.
- Phase 1 should prefer existing theme tokens and local component styles over a broad global override file.
- Shared shell primitives should be introduced only when they remove duplicated sizing or state logic from existing sidebar/top-bar components.
- Any new primitive must have a small interface and must not know about session source, Agent runtime, dashboard fallback, portable mode, API fallback, or tool execution.
- The left navigation and top bar remain composition/rendering layers. They may render explicit state passed to them, but they must not infer lower-level business state.
- The future visual direction remains "minimal, dark-capable, black/white-first, subtle glow only where it helps hierarchy", but this is deferred until the shell foundation is stable.
- The right details panel, chat message redesign, Monaco theme, xterm theme, and full Agent progress surface are out of Phase 1.
- The PRD intentionally treats "beautiful UI" as a product outcome that depends on stable primitives, not as a single CSS pass.

## Testing Decisions

- Tests should cover external visual/layout behavior where possible, not implementation details.
- Phase 1 should extend or reuse existing NavPanel layout tests for icon action sizing, row height, and stable action placement.
- Sidebar tests should verify that the create-session surface exposes one primary create action and that mode selection is represented separately.
- The segmented mode switcher should be tested as a controlled UI state boundary where possible: selecting a mode changes the selected mode used by the create action, without changing session runtime behavior by itself.
- Top-bar tests should verify compact height, stable action containers, and absence of layout-driven text/icon overflow where the existing test setup supports it.
- Theme or token changes should be covered by existing theme service tests when they affect named tokens.
- Manual verification is still required for Windows scaling, because the original icon misalignment issue was platform-sensitive.
- No runtime, Agent, adapter, or session behavior tests should be required for Phase 1 unless the implementation accidentally touches those boundaries. If that happens, the phase should stop and be redesigned.

## Out of Scope

- Full visual rebrand.
- Dark Glass global skin.
- Any new color palette or color override.
- Brand replacement.
- Chat transcript redesign.
- AI message rendering redesign.
- Tool card redesign.
- Right-side Details or Context panel redesign.
- Monaco or xterm theme replacement.
- Agent runtime progress model.
- Session history data model changes.
- API, route, adapter, filesystem, terminal, or Agent execution changes.
- Any UI change that requires interpreting business state inside page-level composition components.

## Further Notes

The failed broad reskin is useful evidence: Void can move toward a more premium desktop UI, but only after the structure is made more systematic. The recommended next issue is intentionally small: systematize the left sidebar and top bar first, then review screenshots before expanding the scope.

Success for the first implementation phase is not "the app looks completely redesigned." Success is: the shell no longer looks visually accidental, icon placement is stable, spacing is consistent, and the diff is small enough to review and revert.
