# BitFun capability upgrades — Batch 1 Web UI results

Date: 2026-07-25  
Workspace: `D:\codex\void-bitfun-upgrades`  
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

## Composer and reference contract

`userMessageMetadata.composerPresentation` is the versioned Web UI DTO. It
preserves the ordered presentation of text, contexts, and Skill references.
Image and generated-media metadata keeps stable path/name identity but removes
known `dataUrl`, thumbnail, and preview payloads before message persistence.

`session-reference` is deliberately a Web UI/context DTO in this batch. It
stores session and workspace/remote locators, renders a history capsule, and
emits a safe prompt marker. It does not read or inject another session's
transcript; that runtime capability remains an integration handoff.

The existing pending queue now preserves user-message metadata during normal
enqueue, persistence, failed-turn recovery, reordering, and automatic drain.
Active-turn steering is unavailable for structured-reference queue items
because the existing steering transport has no metadata field. A plain-text
queue edit explicitly removes stale composer/session-reference metadata.

## HTTP/2 gate

No HTTP/2 or Rust dependency change was made during the remaining Web UI work.
The workspace dependency is currently:

```toml
reqwest = { version = "0.12", default-features = false, features = [
  "native-tls",
  "rustls-tls",
  "json",
  "stream",
  "multipart",
] }
```

There is no `http2` feature or explicit HTTP/2 client builder policy in the
provider client path. Therefore the proposed HTTP/2 capability is not already
implemented by Void. Enabling it changes the Rust feature/dependency graph and
remains behind the separately requested dependency/lockfile approval gate.
This branch does not pretend that the transport capability is complete.

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

- The BTW panel's scoped rollback callback still accepts only plain text, so a
  structured reference cannot be fully reconstructed inside that separate
  child composer.
- The DTO parser rejects unsupported versions and malformed segment shapes,
  but optional context fields can be validated more narrowly in a later
  hardening pass.
- Session-reference transcript injection is intentionally absent.
- Batch 2 multi-agent runtime and Batch 3 product expansion were not developed
  in this worktree.

