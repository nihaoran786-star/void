# BitFun capability upgrades — Batch 1 Web UI results

Date: 2026-07-25
Workspace: isolated Void capability-upgrade worktree
Branch: `codex/bitfun-capability-upgrades`
Reference: `GCWing/BitFun@21c0382d418424514f9a4db7ad3d232da6956886`

## Result

The first visible-reliability Web UI batch is complete on this isolated branch.
It was adapted to Void's existing Flow Chat, message metadata, context store,
pending queue, media projection, and persistence boundaries. It was not merged
into `void-source`.

Delivered commits:

- `425e315e5` — inline `ViewImage` results through the existing tool-card and
  media attachment path;
- `44a553943` — explicit failed-turn presentation and retry/recovery state;
- `9be78c53f` — session-scoped composer restore with receipt revision guards;
- `081d0dc18` — versioned composer presentation metadata for file, image,
  media, Skill, and session references, including history pills and recovery;
- `3d0ea1250` — remove one pre-existing unused import that blocked the required
  Web type-check/build gate.
- `8cbb5db91` — enable HTTP/2 negotiation in the provider Adapter with typed
  transport states and an explicit HTTP/1.1 retry fallback;
- `adfc7e313` — pass the versioned composer DTO through scoped BTW rollback
  and restore text, file, image, media, Skill, and session-reference state;
- `a7fa27737` — resolve explicitly selected session references through a
  workspace-scoped Module Interface and inject a bounded, sanitized transcript.

## Composer and reference contract

`userMessageMetadata.composerPresentation` is the versioned Web UI DTO. It
preserves the ordered presentation of text, contexts, and Skill references.
Image and generated-media metadata keeps stable path/name identity but removes
known `dataUrl`, thumbnail, and preview payloads before message persistence.

`session-reference` stores session and workspace/remote locators, renders a
history capsule, and queries the desktop persistence Adapter only after an
explicit user reference. The session-reference service rejects cross-workspace
and owner mismatches, missing/hidden sessions, recursive references, and
oversized transcripts. It injects only visible user and assistant text; tool
payloads, thinking/system content, metadata, and credentials are excluded.
Results use typed `ready`, `missing`, `denied`, `too_large`, `unsupported`, and
`failed` states. Per-reference and combined message/token budgets are enforced.

The BTW scoped fill contract now carries `ComposerPresentation` v1 instead of
reducing rollback to display text. Legacy text-only turns remain compatible.

The existing pending queue now preserves user-message metadata during normal
enqueue, persistence, failed-turn recovery, reordering, and automatic drain.
Active-turn steering is unavailable for structured-reference queue items
because the existing steering transport has no metadata field. A plain-text
queue edit explicitly removes stale composer/session-reference metadata.

## HTTP/2 follow-up

The initial Web UI batch correctly left HTTP/2 behind a dependency gate. A
separately authorized follow-up enabled only reqwest's existing `http2`
feature, without upgrading reqwest:

```toml
reqwest = { version = "0.12", default-features = false, features = [
  "native-tls",
  "rustls-tls",
  "http2",
  "json",
  "stream",
  "multipart",
] }
```

The provider Adapter uses normal ALPN negotiation, records typed states for an
HTTP/2 connection, negotiated HTTP/1.1 compatibility, forced HTTP/1.1
fallback, interruption, and final failure, and forces the next retry to
HTTP/1.1 after an initial transport/header-timeout failure. HTTP/1.1-only
providers remain supported. The lockfile change adds `h2 0.4.15`; no unrelated
network dependency was upgraded.

## Verification

Passed:

```text
pnpm run type-check:web
pnpm run check:core-boundaries
pnpm run build:web
```

The production build completed, including Monaco asset verification. Vite
reported existing dynamic/static import and large-chunk warnings; they did not
fail the build.

Focused reference-history verification passed:

```text
7 test files, 36 tests passed
independent read-only audit: 8 test files, 66 tests passed
BTW and session-reference Web tests: 4 test files, 39 tests passed
session-reference Rust policy tests: 6 passed
HTTP/2 Adapter stream tests: 13 passed
cargo check -p void-ai-adapters -p void-services-core -p void-desktop
```

The combined Batch 1 Web UI test selection produced:

```text
18 test files
204 passed, 1 failed
```

The one failure is the existing Windows checkout newline-sensitive assertion
in `performanceImportBoundaries.test.ts`: it searches for a hard-coded LF
substring while `SessionsSection.tsx` is read with CRLF. No affected Batch 1
behavioral test failed.

## Known boundaries

- The DTO parser rejects unsupported versions and malformed segment shapes,
  but optional context fields can be validated more narrowly in a later
  hardening pass.
- Session-reference injection intentionally rejects rather than truncates a
  source that exceeds its safe budget, so the user must reference a smaller
  session.
- Batch 2 multi-agent runtime and Batch 3 product expansion were not developed
  in this worktree.
