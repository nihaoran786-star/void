# Void Obsidian Knowledge Base

This folder is the repository mirror/index for the project Obsidian knowledge
base. The primary vault currently opened in Obsidian is:

`D:\obsidian\ryan\ryan\void-source`

Use the primary vault for live notes. Keep this repository mirror aligned when
the migration scope or protected capabilities change.

Before any architecture-sensitive migration, read these files in the primary
vault first:

1. `00-index.md`
2. `01-current-project-state.md`
3. `02-upstream-targeted-migration.md`
4. `03-protected-capabilities.md`
5. The issue file for the current slice under `issues/` in the primary vault
   or under `docs/issues/upstream-targeted-migration/` in the repository mirror

Rules:

- Treat this vault as the source of migration context, not as scratch notes.
- Keep notes concise and update them when migration scope or risk changes.
- Do not store secrets, API keys, local-only absolute paths, or transient logs.
- Keep implementation details in issues and code comments only when they are
  still current.
