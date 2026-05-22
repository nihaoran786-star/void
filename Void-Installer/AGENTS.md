[中文](AGENTS-CN.md) | **English**

# AGENTS.md

## Scope

This file applies to `Void-Installer`. Use the top-level `AGENTS.md` for repository-wide rules.

## What matters here

`Void-Installer` is a separate Tauri + React app, not part of the main Cargo workspace.

Important areas called out by the module README:

- `src-tauri/src/installer/commands.rs`: Tauri IPC and uninstall execution
- `src-tauri/src/installer/registry.rs`: Windows registry integration
- `src-tauri/src/installer/shortcut.rs`: shortcut creation
- `src-tauri/src/installer/extract.rs`: archive extraction
- `src/hooks/useInstaller.ts`: frontend installer state flow

Install flow:

```text
Language Select → Options → Progress → Model Setup → Theme Setup
```

## Commands

```bash
pnpm --dir Void-Installer run installer:dev
pnpm --dir Void-Installer run tauri:dev
pnpm --dir Void-Installer run type-check
pnpm --dir Void-Installer run build
pnpm --dir Void-Installer run installer:build
```

## Verification

```bash
pnpm --dir Void-Installer run type-check && pnpm --dir Void-Installer run installer:build
```

If you modify uninstall flow, also validate the uninstall mode entry points described in `Void-Installer/README.md`.
