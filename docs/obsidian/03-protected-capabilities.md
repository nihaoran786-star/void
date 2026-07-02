# Protected Capabilities

Any upstream migration must preserve these capabilities.

## Brand And Installer

- Product remains void.
- Installer path remains `Void-Installer`.
- Legacy upstream installer paths, icons, app ids, and updater names must not
  be restored.
- Strict installed-surface and brand acceptance checks remain valid.

## Automation

- Automation center, workspace targeting, and first-session behavior must not
  be removed or bypassed.
- If upstream deletes or renames automation resources, keep local behavior and
  re-run focused checks.

## Media Sessions And Right Panel

- Keep workspace media service modules.
- Keep right-side media preview entry points and layout.
- Keep stable tile identity for generated media.
- Keep active/recently-deleted gallery views, delete/restore/purge, bulk
  selection, media reference actions, and pending placeholders.

## Agent Runtime

- Subagent execution, background result delivery, and Task/fork behavior must
  remain compatible with existing sessions.
- Runtime migration should improve boundaries without removing local
  multi-agent behavior.
