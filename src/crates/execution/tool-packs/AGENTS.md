# tool-packs Agent Guide

Scope: this guide applies to `src/crates/tool-packs`.

`void-tool-packs` owns tool feature-group scaffold metadata and the product
tool provider group plan. It does not own concrete tool implementations yet.

## Guardrails

- Keep `default = []`; `product-full` may aggregate feature groups but must not
  silently enable new runtime behavior. Boundary checks enforce the current
  feature-group list.
- Do not depend on `void-core`, concrete service crates, app crates, Tauri,
  Git, MCP, network clients, or CLI UI dependencies unless H1 explicitly moves a
  reviewed tool runtime owner here.
- Do not own manifest/exposure contracts, concrete runtime manifest assembly,
  `GetToolSpec` execution, collapsed unlock state, snapshot decoration, or
  `ToolUseContext`. Provider group plans may list group ids and tool names only.
- Future concrete tool migration must preserve product registry order,
  expanded/collapsed exposure, prompt stubs, unlock state, cancellation, runtime
  restrictions, and Deep Review tool flow.

## Verification

```bash
cargo test -p void-tool-packs --features basic
cargo check -p void-tool-packs --features product-full
node scripts/check-core-boundaries.mjs
```
