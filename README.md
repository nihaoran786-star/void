# Void

Void is a desktop-first AI workspace with Flow Chat, multi-agent sessions,
AI short-drama production, workspace media, editor, terminal, Git, browser,
automation, and CLI surfaces.

## Start here

- [Repository rules](AGENTS.md)
- [Current collaboration context](CONTEXT.md)
- [Documentation index](docs/README.md)
- [Web UI rules](src/web-ui/AGENTS.md)

## Common commands

```powershell
pnpm install
pnpm run dev:web
pnpm run desktop:dev
pnpm run type-check:web
pnpm run lint:web
pnpm --dir src/web-ui run test:run
pnpm run build:web
```

Run the smallest check that covers a change first. Use the broader Web UI,
Rust, desktop, or E2E gates only when the affected Module crosses those seams.

## Current product state

The `minimal` workspace presentation is the clean-profile default. `classic`
remains a supported rollback presentation. Short-drama stage agents, fixed
Skill policy, media generation and preview, historical sessions, desktop host
features, and their existing runtime Interfaces are protected capabilities.

See [CONTEXT.md](CONTEXT.md) for the current state and known debt. Dated audit,
plan, result, and migration-ledger documents are evidence for their recorded
checkpoint, not a replacement for the current collaboration context.
