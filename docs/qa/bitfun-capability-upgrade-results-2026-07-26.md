# BitFun capability upgrade results

Date: 2026-07-26  
Branch: `codex/bitfun-capability-upgrades`  
Baseline: `18f8f1d4f`  
Reference: read-only `GCWing/BitFun@21c0382d418424514f9a4db7ad3d232da6956886`

## Result

The three capability batches are implemented on the isolated Void upgrade
branch. Nothing in this result claims that the branch has been merged into
`void-source`.

| Capability | Delivered state |
| --- | --- |
| Unified permissions | Versioned policy DTO, runtime enforcement, composer control, typed load and failure state |
| Tool and Skill configuration | Derived Agent tool/Skill groups plus deferred tool discovery and effective-target execution |
| Local speech input | Optional desktop Adapter, explicit model availability/error state, composer integration |
| Read-only external configuration | Claude Code, Codex and OpenCode source discovery through bounded read-only Adapters |
| Subscription OAuth | In-app provider account flow, native credential vault, runtime account resolution and Web controls |
| Long-term memory | Opt-in safe extraction, editable candidates, approve/deny, compare-and-swap merge, confirmed delete |
| BTW durability | Persisted hidden child transcript and typed lineage, restart hydration, versioned structured composer rollback, optional memory flag |
| Subagent continuity | Durable task facts, explicit Web projection, delivery lease/receipt recovery, validated checkpoint continuation |

The earlier visible-reliability work remains part of the same branch: inline
image-tool previews, terminal failure/retry projection, per-session composer
restore, file/image/Skill/session-reference history, HTTP/2 streaming with
HTTP/1.1 fallback, and bounded authorized session transcript injection.

## Safety and feature gates

- Local ASR is optional. The `local-asr-engine` Rust feature is disabled by
  default; model availability is explicit and no model is silently downloaded.
- External Claude Code, Codex and OpenCode configuration sources are read-only.
  They do not become write-through configuration stores.
- Subscription OAuth stores secrets in the native credential vault rather than
  the Web store.
- Memory extraction is disabled by default and reads the server-side
  `app.ai_experience.agent_memory_extraction_enabled` setting. Extracted
  candidates are not merged without user approval.
- BTW memory is an explicit relationship option. Restoring a BTW transcript
  does not automatically resume execution.
- Subagent delivery retry is limited to idempotent results. Persisted launch
  context is revalidated and sensitive or malformed context becomes a typed
  recovery block.
- Session-reference injection requires an explicit user reference, exact
  workspace authorization, bounded history, no recursive expansion, and
  omission of hidden system/tool payloads.

## Verification evidence

Passed:

- `pnpm run check:repo-hygiene`
- `pnpm run check:core-boundaries`
- `pnpm run check:theme-colors`
- `pnpm run check:theme-visual-contract`
- `pnpm run i18n:contract:test`
- `pnpm run type-check:web`
- focused Web UI suites: 24 files, 126 tests
- focused BTW follow-up suites: 6 files, 57 tests
- `pnpm run build:web`
- `cargo check --workspace`
- `cargo check -p void-desktop`
- focused ASR, permission, tool-loading, OAuth, memory, BTW, session-reference,
  HTTP/2 and subagent recovery tests
- `cargo test --locked -p void-core`: 1208 passed, 2 ignored; all integration
  suites passed

Repository-level gates that remain non-clean:

- `pnpm --dir src/web-ui run test:run`: 442 files and 2541 tests passed; 15
  files and 16 tests failed. The failures are source-byte/line-ending and
  pre-existing presentation-governance assertions outside this capability
  diff, including Classic hashes, exact SCSS substrings, portal/import
  boundaries, and one Browser presentation contract.
- `pnpm run lint:web`: two existing tool-card declaration-order errors remain
  in `BaseToolCard.tsx` and `CompactToolCard.tsx`, plus their two Fast Refresh
  warnings. Those files are unchanged from the capability baseline. The one
  branch-introduced `ChatInput.tsx` Hook dependency error was fixed and its
  focused ESLint check passes.
- `pnpm run i18n:audit`: the existing short-drama source contains 31 CJK
  candidates against a budget of 25. The short-drama service directory has no
  changes in this branch.

These failures are recorded rather than reclassified as passing. Fixing
unrelated presentation snapshots, line-ending policies, or pre-existing
tool-card lint is outside this capability program.

## Integration handoff

Before merging, make the target worktree clean, compare its changes since
`18f8f1d4f` with this branch, and resolve overlapping files deliberately.
Do not copy generated Monaco/version output from a build. Re-run the target
branch's required gates after integration. No merge, push, dependency install,
or BitFun modification was performed as part of this result.
