# Agent companion window lazy entry boundary

## Goal

Remove the agent companion desktop pet and its window-only stylesheet from the
main Web UI static entry. The component is loaded only when the existing
`voidWindow=agent-companion` query parameter selects the companion window.

This is a bundle-boundary change only. Pet behavior, window detection, i18n,
error handling, logging, render ownership, and post-render application startup
remain unchanged.

## Module boundary

`src/web-ui/src/main.tsx` remains the sole window-entry router:

- Shared startup, logging, theme initialization, and the i18n provider load run
  before window selection exactly as before.
- The companion branch owns one conditional dynamic import of
  `AgentCompanionDesktopPet.tsx`.
- The companion component continues to own its Tauri event/window adapters,
  activity presentation, lifecycle, and SCSS import.
- The normal application and compact-chat branches do not import, inspect, or
  duplicate companion behavior.

No pet component, shared service, route, translation, short-drama surface,
media surface, backend adapter, generated version file, or public artifact is
changed.

## Startup and render sequence

The companion-window path preserves the existing transaction:

1. Finish the pre-render logger, log-level, and theme initialization.
2. Load the shared `I18nProvider` and read the existing window query parameter.
3. When and only when `voidWindow=agent-companion`, await the companion component
   chunk and its component-owned stylesheet.
4. Render the component inside the existing `AppErrorBoundary` and
   `I18nProvider` nesting.
5. Record the existing elapsed log and startup-trace phase, flush the summary,
   and return before normal-application initialization is scheduled.

The import is deliberately awaited inside the existing branch. This keeps the
normal window free of the companion dependency graph without introducing a
Suspense fallback, a second root, or a change to error-boundary/provider order.

## Three performance gates

`scripts/web-performance-budget.json` prevents the boundary from silently
regressing in three independent ways:

1. `requiredDynamicEntries` requires the companion component's Vite manifest
   key to exist, be dynamically reachable from `index.html`, and stay outside
   the static entry closure.
2. `staticGraph.localUnreachable` independently rejects any static source-graph
   path from `main.tsx` back to the companion component.
3. The CSS forbidden marker `.void-agent-companion-window` rejects the
   component stylesheet if it leaks into the entry CSS assets.

Together these cover the generated bundle graph, the source import graph, and
the emitted stylesheet content. The existing budget-checker unit suite validates
the generic gate behavior; no product test is changed for this import-only
boundary.

## Production measurement

The 2026-07-16 Vite 7.3.6 production manifest build transformed 7,428 modules.
The performance gate passed and confirmed the companion component is a dynamic,
reachable, non-static manifest entry; its source is absent from the static graph
and `.void-agent-companion-window` is absent from entry CSS.

- Entry JavaScript raw: `2,399,468 -> 2,385,481` bytes (`-13,987`, `-0.58%`).
- Entry JavaScript gzip: `698,817 -> 694,377` bytes (`-4,440`, `-0.64%`).
- Entry CSS raw: `703,657 -> 687,948` bytes (`-15,709`, `-2.23%`).
- Entry CSS gzip: `99,742 -> 96,942` bytes (`-2,800`, `-2.81%`).

The four committed budget values now equal the measured entry output exactly.
They must be remeasured, not relaxed speculatively, whenever this boundary or
the entry dependency graph changes.

## Risks and limits

- The companion window performs one additional chunk request before its first
  React render. It is an explicit tradeoff for keeping a specialized secondary
  window out of every normal application startup.
- A component export-shape change could break the default dynamic import. The
  TypeScript check protects the current default-export contract.
- Transitive code shared with the normal application may remain in the static
  graph. This change claims only that the companion entry component and its
  component-owned CSS are deferred; the three gates encode that exact claim.
- The production build is intentionally serialized by the integrating agent so
  concurrent Vite output cannot corrupt or invalidate the measurement.
