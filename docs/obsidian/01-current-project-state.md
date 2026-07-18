# Historical Project State Snapshot

Date: 2026-06-02

> This file records the state observed on 2026-06-02. It is not the current
> branch or working-tree status. See [the repository context](../../CONTEXT.md).

## Branch

- Repository: `void-source`
- Branch at this snapshot: `codex/void-media-integration`
- Working tree was clean before this knowledge-base setup.
- Upstream reference: legacy upstream main at `09bf6d1f`.

## Local Capabilities To Preserve

- Void brand replacement and installer surface.
- Automation features and docs.
- Media sessions and media tool flows.
- Workspace media gallery / right-side media preview panel.
- Media preview management: stable pending-to-ready tiles, recent sorting,
  deletion, recently deleted, restore, purge, reference actions, and bulk
  selection.
- Installed-surface verification and strict brand audit scripts.

## Upstream Merge Status

Direct merge is not safe. A dry-run merge reported conflicts across installer,
brand files, agent runtime, chat input, flow chat, i18n, desktop APIs, mobile
web, and E2E. Targeted migration is required.

## 2026-06-02 Targeted Migration Progress

- Chat input/RichTextInput polish, CLI substring command matching, ACP `omp`
  preset, and startup trace diagnostics have been migrated as low-risk slices.
- Prompt-cache and Multitask behavior were verified as already present in the
  local void tree; no wholesale upstream merge was needed.
- `/goal` now supports persisted explicit status plus `/goal pause`, `/goal
  resume`, `/goal clear`, and multiline `/goal edit <objective>` through the
  goal domain, desktop adapter, and frontend service layers.
- Active goal cancellation now persists paused status and updates the frontend
  active flag through the goal verification event channel.
- Full upstream token-budget accounting is still not hard-migrated; it requires
  a separate runtime-accounting slice.
