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
- `src/i18n/`: installer-only strings; locale metadata is generated from
  `src/shared/i18n/contract/locales.json`

Install flow:

```text
Language Select → Options → Progress → Model Setup → Theme Setup
```

## Commands

These are command references, not the default precheck list. Use Verification
below for PR scope.

```bash
pnpm --dir Void-Installer run installer:dev
pnpm --dir Void-Installer run tauri:dev
pnpm --dir Void-Installer run type-check
pnpm --dir Void-Installer run build            # React build / CI reproduction
pnpm --dir Void-Installer run installer:build  # packaging only
```

## Verification

Use the smallest matching check:

```bash
pnpm run i18n:audit                                                   # resource-only i18n
pnpm run i18n:generate && pnpm run i18n:contract:test && pnpm run i18n:audit
pnpm --dir Void-Installer run type-check                            # frontend i18n/runtime
cargo check --manifest-path Void-Installer/src-tauri/Cargo.toml      # Tauri/Rust changes
```

Run the full installer build only for packaging, payload, native bundling,
install/uninstall flow, registry, shortcut, or extraction changes:

```bash
pnpm --dir Void-Installer run type-check && pnpm --dir Void-Installer run installer:build
```

If you modify uninstall flow, also validate the uninstall mode entry points described in `Void-Installer/README.md`.

## Codex 项目标记

- 标记：`MAIN-VOID-INSTALLER`
- 路径：仓库根目录下的 `Void-Installer/`
- 类型：Node/Tauri installer 子项目。
- Git 状态：本目录由父级 Void 仓库统一管理。
- 识别依据：存在 `package.json`、`README.md`、`src-tauri\Cargo.toml`。
- 常用脚本：`dev`、`build`、`tauri:dev`、`tauri:build`、`installer:build`、`type-check`。
- 开发提醒：安装器改动应从仓库根目录检查 Git 状态，并同时遵守根 `AGENTS.md`。
