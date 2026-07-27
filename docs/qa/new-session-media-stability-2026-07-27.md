# New-session and workspace-media stability review — 2026-07-27

## Scope

This checkpoint covers the Minimal new-session surface, draft-only canvas
controls, workspace image previews, and stability findings exposed by the
repository gates. It does not claim that every product path was manually
exercised or that no undiscovered defect exists.

## Delivered behavior

- Code, office, and media drafts use one mode-aware example component with
  deterministic rotation, readable task labels, localized structured prompts,
  keyboard focus styles, reduced-motion support, and a compact narrow-pane
  fallback.
- The outer canvas toggle stays unavailable until the draft becomes a persisted
  session. Background canvas events cannot reopen it while a new-session draft
  is active.
- Workspace image thumbnails use the workspace media preview Interface's data
  URL path instead of treating a generated Tauri asset URL as proof that the
  browser can render the file.
- Repeated image visits reuse a bounded thumbnail cache: 12 entries, 32 MiB
  total URL characters, and an 8 MiB per-entry ceiling. Video and audio data
  URLs remain uncached.
- MCP App iframe message handling rebinds when `sessionId` changes, preventing
  messages from being delivered to the previous session after a presentation
  switch.
- Recovered short-drama media classification terms live in a dedicated lexicon
  resource. The source i18n gate is back at its grandfathered baseline without
  raising the budget.

## Visual and interaction evidence

The running Tauri desktop target was exercised at the normal full-window size
and at a 1280 by 800 outer-window size.

- All three draft modes showed three mode-specific examples.
- Selecting an example populated the existing composer with the complete
  structured prompt and enabled Send.
- Refresh advanced to the next deterministic example page.
- The new-session canvas-toggle count was zero at both sizes.
- The narrow view had no document-level horizontal overflow or overlap between
  examples and the composer.
- Before the media fix, 11 existing image cards reported unavailable while the
  backing files existed. After the fix, all 11 rendered with intrinsic size
  2048 by 1152 and no unavailable state.

## Audit matrix

| Area | Result | Evidence |
| --- | --- | --- |
| Correctness | Pass | 464 Web test files / 2,592 tests, including focused draft, media-cache, MCP session-switch, and short-drama view-model coverage |
| Accessibility | Pass for scoped controls | Semantic buttons and section label, translated accessible refresh name, visible keyboard focus, reduced-motion fallback |
| Theming | Pass | Zero undefined theme variables; visual contract covers all eight registered surfaces |
| Responsive layout | Pass for scoped views | Full-window and 1280 by 800 desktop checks, no horizontal overflow, narrow example scrolling contract |
| Performance | Pass | Production Web budget passed; image caching is entry-, byte-, and item-size-bounded |
| Module boundaries | Pass | UI remains behind existing session and workspace-media Interfaces; no page-level filesystem or Tauri access was added |

## Repository hygiene

- 179 tracked collaboration documents and 531 tracked test files were
  content-hashed. No exact duplicate document or test groups were found.
- No tracked dated document was safe to delete without losing unique evidence.
- The obsolete office-only example component was removed when the three-mode
  component replaced it.
- A temporary untracked `tests/e2e/123/` workspace created during desktop
  verification was removed after path and dry-run checks. The matching temporary
  workspace entry was closed through the application UI.
- User-owned untracked `media/` content was not modified, deleted, staged, or
  committed.

## Verification

Passed:

- `pnpm run check:core-boundaries`
- `pnpm run check:theme-colors`
- `pnpm run check:theme-visual-contract`
- `pnpm run i18n:contract:test`
- `pnpm run i18n:audit` with the existing 25-line warning baseline
- `pnpm run type-check:web`
- focused new-session, workspace-media, MCP App, and short-drama tests
- `pnpm --dir src/web-ui run test:run` — 464 files / 2,592 tests
- `pnpm run build:web`
- Monaco production asset verification
- Web performance budget

`pnpm run check:repo-hygiene` is blocked only because protected untracked
workspace media manifests contain local absolute paths. The gate scans
untracked files by design; changing or deleting those user assets was outside
this review.

The production build still reports existing mixed static/dynamic import and
large-chunk warnings. The enforced performance budget passes, so these remain
measured optimization debt rather than a release blocker for this change.
