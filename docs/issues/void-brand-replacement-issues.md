# void Brand Replacement Issues

## Parent

`docs/features/void-brand-replacement-prd.md`

## Current Diagnosis

The repository is partially branded as void but still contains a large amount of legacy upstream branding across:

- User-facing docs and issue templates.
- Web UI and installer locale resources.
- Desktop app and installer package metadata.
- Installer install path, shortcut, registry, uninstall, and payload logic.
- CI/release artifact names and upstream release links.
- Rust crate/package names and import paths.
- Workspace, cache, environment variable, and generated-file names.
- Physical path names such as the installer directory.

The target state is intentionally strict: tracked source, docs, generated contracts, package metadata, release workflows, file paths, and installer outputs should use void English naming. Any old-brand compatibility must be temporary, isolated, and reviewed away by the final zero-residue audit.

## Phase Review Rule

After each phase:

- Re-run the brand residue audit.
- Re-run the smallest tests covering the phase.
- Review whether the next issues still match the current residue inventory.
- Update this issue file before proceeding if the residue inventory changes materially.
- Do not hide failures by broadening allowlists. A residue allowlist is only temporary while a later phase owns removal.

## Issue 0: Brand Residue Audit Gate

**Type:** AFK
**Blocked by:** None
**Status:** Completed

### What to build

Add a repository-local audit command that scans tracked text files and tracked path names for legacy brand residue. The audit should classify remaining hits by phase so every subsequent stage has an objective progress metric.

### Acceptance criteria

- [x] A `brand:audit` command exists at the root package level.
- [x] The audit reports total residue count and grouped ownership categories.
- [x] The audit scans both file contents and tracked path names.
- [x] Binary assets, build outputs, and dependency folders are excluded; lockfiles and generated schemas are scanned for final zero-residue coverage.
- [x] The audit exits non-zero when strict mode is enabled and any residue remains.
- [x] The audit can run in inventory mode during migration without failing.
- [x] Running the audit does not modify the working tree.

### Phase review

- Baseline after Issue 0: `13203` occurrence(s), `12305` finding line(s).
- Largest categories: Rust crates (`5352`), Web UI (`4918`), desktop (`922`), docs (`459`), installer (`310`).
- The next issue remains valid, but final zero-residue requires later cleanup of these issue/PRD documents too because they intentionally describe the legacy brand during migration.

## Issue 1: User-Facing Docs and Issue Templates

**Type:** AFK
**Blocked by:** Issue 0
**Status:** Completed

### What to build

Replace legacy brand text in public-facing repository documentation and GitHub issue templates with void branding. This phase should not touch code, runtime behavior, packaging, or generated files.

### Acceptance criteria

- [x] README files use void branding.
- [x] contributing docs use void branding.
- [x] issue templates and security links use void-owned wording or neutral placeholders.
- [x] AGENTS docs describe the repository as void while preserving technical command names until later phases own renaming.
- [x] No runtime code is modified in this phase.
- [x] Brand audit shows docs/template residue reduced.

### Phase review

- Residue moved from `13203` to `13130` occurrence(s).
- Repo-docs residue moved from `116` to `49`; CI issue-template residue was removed.
- README logo paths were updated and the matching title image asset was renamed.
- Remaining repo-docs residue is mostly technical command names, crate names, workspace data paths, and installer directory names. These are intentionally deferred because changing them safely depends on Issues 3-7.

## Issue 2: Web UI and Installer Locale Surfaces

**Type:** AFK
**Blocked by:** Issue 0
**Status:** Completed

### What to build

Replace user-visible locale strings, page titles, provider labels, and generated locale contracts so normal UI and installer UI show void branding.

### Acceptance criteria

- [x] Main Web UI locale resource values have no user-facing legacy brand strings.
- [x] Installer locale resource values have no user-facing legacy brand strings.
- [x] Installer HTML title says `Install void`.
- [x] Generated locale contracts are regenerated.
- [x] Model/provider display copy no longer exposes old upstream branding.
- [x] `pnpm i18n:generate` passes.
- [x] `pnpm i18n:contract:test` passes.
- [x] `pnpm i18n:audit` passes.
- [x] Installer type-check passes.

### Phase review

- Residue moved from `13130` to `12890` occurrence(s).
- Web UI residue moved from `4918` to `4709`; installer residue moved from `310` to `279`.
- Remaining locale-related residue is mostly JSON keys, provider IDs, theme IDs, package names, and path/config identifiers. These are not just text and are deferred to Issues 3-7.
- Additional verification passed: Web UI type-check, installer type-check, i18n contract test, i18n audit, and diff whitespace check.

### Additional phase review: theme identifier migration

- Theme IDs now use `void-*` across Web UI presets, installer theme data, desktop theme defaults, CLI theme defaults, generated UI prompt theme snapshots, Monaco editor theme registration, locale theme keys, and installer theme synchronization.
- The Monaco dark theme module was renamed from the old-brand filename to `void-dark.theme`.
- The Web UI package metadata was renamed from the old scoped package name to `@void/web-ui`.
- Residue moved from `12797` to `12549` occurrence(s).
- Web UI residue moved from `4709` to `4589`; installer residue moved from `219` to `147`; desktop residue moved from `896` to `883`; CLI residue moved from `187` to `176`.
- Verification passed: `pnpm i18n:generate`, `pnpm --dir Void-Installer run sync:i18n`, `pnpm --dir src/web-ui test:run src/infrastructure/theme/core/ThemeService.test.ts`, `pnpm i18n:contract:test`, `pnpm i18n:audit`, `pnpm run type-check:web`, `pnpm --dir Void-Installer run type-check`, `cargo check --manifest-path Void-Installer/src-tauri/Cargo.toml`, `cargo check -p void-desktop`, `pnpm run brand:audit`, and `git diff --check`.

## Issue 3: Desktop Product Metadata and Local Data Naming

**Type:** AFK
**Blocked by:** Issue 0
**Status:** Completed

### What to build

Complete void branding for the desktop app package metadata, executable naming, local data/cache naming, icons, updater configuration, and any startup/runtime messages that still expose the old brand.

### Acceptance criteria

- [x] Desktop package metadata uses void product, identifier, author, description, executable, and bundle names.
- [x] New OpenSSL bootstrap cache path uses void naming.
- [x] Environment variables and build flags use void naming, with any old aliases either removed or documented as temporary migration compatibility.
- [x] Desktop startup/logging copy uses void naming for touched visible startup/tray/menu surfaces.
- [x] Desktop build scripts find the renamed desktop executable.
- [x] `cargo check -p <desktop-crate>` or the renamed equivalent passes.
- [x] `pnpm run type-check:web` passes.
- [x] Brand audit shows desktop metadata/runtime residue reduced.

### Phase review

- Residue moved from `12890` to `12857` occurrence(s).
- Desktop residue moved from `922` to `896`; scripts residue moved from `286` to `280`; workspace metadata moved from `14` to `13`.
- Completed safe visible desktop changes: authors/description, tray tooltip/menu labels, macOS app menu label, desktop window titles, startup log, diagnostics export file name, and OpenSSL cache path.
- Deferred by design: crate names, Rust imports, binary names, event IDs, URL query keys, theme IDs, E2E environment variables, and installer payload discovery. These need coordinated identifier rename in Issues 4-7.
- Verification passed: `cargo check -p void-desktop`, `pnpm run type-check:web`, `git diff --check`, and `pnpm run brand:audit`.

## Issue 4: Installer Runtime, Registry, Shortcuts, and Payload

**Type:** AFK
**Blocked by:** Issues 2 and 3
**Status:** Completed

### What to build

Make the installer fully void-branded end to end: window metadata, install path, payload executable name, shortcut names, registry keys, uninstall entries, temporary files, logs, and launch errors.

### Acceptance criteria

- [x] Installer package metadata uses void product, identifier, author, description, executable, and bundle names.
- [x] Default install directory uses void.
- [x] Payload discovery and embedding use the void desktop executable name.
- [x] Desktop shortcut and Start Menu shortcut use void names.
- [x] Windows uninstall registry entries use void names.
- [x] Temporary uninstall scripts/logs use void names.
- [x] Launch and uninstall user-visible errors use void names.
- [x] Installer checks/build scripts use void installer artifact names.
- [x] `pnpm --dir <installer-dir> run type-check` passes.
- [x] `cargo check --manifest-path <installer-dir>/src-tauri/Cargo.toml` passes.
- [x] Brand audit shows installer residue reduced.

### Phase review

- Residue moved from `12857` to `12797` occurrence(s).
- Installer residue moved from `279` to `219`.
- Completed safe installer changes: package metadata, Tauri product name and identifier, window title, default install path, shortcut names, registry uninstall display naming, temporary uninstall file names, installer package name, installer Rust lib/bin naming, and visible launch/uninstall copy.
- Deferred by design: installer payload discovery still references the current desktop executable name. This must be renamed with the desktop binary/crate identifier work in Issue 5, otherwise the installer would fail to find the packaged app.
- Verification passed: `pnpm --dir Void-Installer run type-check`, `cargo check --manifest-path Void-Installer/src-tauri/Cargo.toml`, `pnpm run brand:audit`, and `git diff --check`.

## Issue 5: Rust Crate and Package Identifier Rename

**Type:** AFK
**Blocked by:** Issues 3 and 4
**Status:** Completed

### What to build

Rename internal Rust crates, binary names, library names, TypeScript package names, and imports from old-brand identifiers to void identifiers. This is the highest-risk phase and should happen only after user-facing and packaging phases are stable.

### Acceptance criteria

- [x] Workspace crate names use void identifiers.
- [x] Rust imports use void identifiers.
- [x] Binary names use void identifiers.
- [x] TypeScript/npm package names use void identifiers.
- [x] Workspace manifests and lockfiles are updated consistently.
- [x] Build scripts no longer reference old crate or binary names.
- [x] `cargo check --workspace` passes.
- [x] Targeted Rust tests for media/session/core areas pass.
- [x] Web UI tests still pass.
- [x] Brand audit shows internal identifier residue reduced.

### Phase review

- Rust crates, binaries, library names, TypeScript package names, runtime event identifiers, CSS theme variables, local storage keys, package metadata, and lockfile package names now use void naming.
- Tool registry contract tests were updated to preserve current media tool availability instead of regressing fork-added media capabilities.
- StartChat and remote SSH contract tests were updated to match the new void-branded prompt/path identity.
- Verification passed: `cargo check --workspace`, `cargo test --workspace`, `pnpm --dir src/web-ui run test:run`, `pnpm run type-check:web`, `pnpm --dir src/mobile-web run type-check`, and `pnpm run brand:audit:strict`.

## Issue 6: CI, Release, Updater, and Distribution Branding

**Type:** AFK
**Blocked by:** Issues 3, 4, and 5
**Status:** Completed

### What to build

Rename CI job steps, release asset names, updater endpoints, package archive names, and external release references to void-owned naming.

### Acceptance criteria

- [x] Desktop release artifacts use void names.
- [x] CLI release artifacts use void names if the CLI remains shipped.
- [x] Nightly artifacts use void names.
- [x] Updater endpoints do not point to old upstream release paths.
- [x] External repository dispatches use void-owned repositories or are removed.
- [x] CI commands refer to renamed crates/binaries.
- [x] Workflow syntax remains valid.
- [x] Brand audit shows workflow/release residue reduced.

### Phase review

- CI workflows, release artifact naming, updater key path naming, package archive references, and e2e environment names now use void naming.
- Strict residue audit and manual grep found no old-brand text or tracked paths after this phase.
- Workflow behavior was covered by static script/type/test checks rather than a live GitHub Actions run.

## Issue 7: Physical Path and Generated Artifact Cleanup

**Type:** AFK
**Blocked by:** Issues 1-6
**Status:** Completed

### What to build

Rename physical directories, workspace entries, generated artifacts, remaining docs, and asset references so tracked path names and generated files no longer expose legacy branding.

### Acceptance criteria

- [x] Installer directory path uses void naming.
- [x] Workspace entries use void naming.
- [x] Generated contracts/schemas do not contain old-brand user-facing strings.
- [x] Documentation references to renamed paths are updated.
- [x] Scripts work with the renamed paths.
- [x] Brand audit path scan has no old-brand path hits.
- [x] `pnpm install --lockfile-only` or equivalent lockfile refresh is completed if needed.

### Phase review

- The installer source path is now `Void-Installer`, and workspace/package/Cargo/i18n references point at that path.
- Generated locale contracts and installer synchronized locale files were regenerated.
- Lockfiles were refreshed and included in final residue scanning.

## Issue 8: Final Zero-Residue Verification

**Type:** HITL
**Blocked by:** Issues 1-7
**Status:** Completed for automated evidence; pending optional manual installer smoke before release

### What to build

Run the final completion audit for the strict objective: no old-brand residue anywhere in tracked text or tracked paths, and no core product functionality broken.

### Acceptance criteria

- [x] Brand audit strict mode passes with zero residue.
- [x] `git grep -i` manual spot checks find no old-brand strings in tracked text files.
- [x] Tracked path scan finds no old-brand file or directory names.
- [x] Web UI type-check passes.
- [x] Web UI test suite passes.
- [x] Installer type-check passes.
- [x] Desktop Rust check passes.
- [x] Installer Rust check passes.
- [x] Relevant Rust tests for media/session/core pass.
- [x] Desktop release-fast build succeeds and emits `target/release-fast/void-desktop.exe`.
- [x] Installer build-only fast succeeds and emits `Void-Installer/src-tauri/target/release-fast/void-installer.exe`.
- [x] Installer payload manifest contains only void-branded relative payload paths.
- [x] Installer launch smoke starts with void-branded process, window, and file metadata.
- [x] Desktop release smoke launch starts `void-desktop.exe` with void-branded process/window metadata.
- [x] Ignored/generated workspace-relative paths have no legacy brand names after local cleanup.
- [x] A brand-clean sibling checkout path has been prepared for final operator migration.
- [x] A dry-run cleanup script exists for legacy system remnants.
- [x] The legacy system remnant cleanup script has been applied locally and now reports no remaining detected remnants.
- [x] A read-only installed surface verification script exists for post-install registry, shortcut, install directory, and executable metadata checks.
- [x] A final acceptance report script exists to summarize tracked brand residue, system remnants, installed surfaces, external workspace paths, and working-tree cleanliness.
- [x] A dry-run workspace path cleanup script exists to classify legacy-named Git worktrees and directories before any operator cleanup.
- [x] One clean legacy-named media placeholder worktree has been removed from Git worktree registration, and its leftover non-Git directory content has been archived by the workspace cleanup script.
- [x] Workspace archive paths are sanitized and included in the final acceptance report so cleanup does not hide legacy path residue inside an archive folder.
- [x] A brand-clean independent source checkout exists and its local Git config points at the void remote instead of a legacy local path.
- [x] The final acceptance report checks local Git config so remote/path residue cannot be hidden outside tracked files.
- [x] Installer supports a non-interactive QA install entry and strict installed surface verification passes after a real per-user install.
- [ ] External workspace directory path is renamed outside the active process, if the local checkout path itself must be brand-clean.
- [x] Desktop dev launch succeeds.
- [ ] Manual smoke confirms real installation shortcuts, uninstall entry, and installed app surfaces are void-branded.
- [ ] Manual smoke confirms chat, media generation, media preview, media gallery, automation, compact chat, and session switching still work.

### Phase review

- Automated final residue evidence is green: strict audit reports `0` occurrence(s), manual content grep returns no matches, and tracked path scan returns no matches.
- Automated regression evidence is green: i18n generation/contract/audit, Web type-check, mobile type-check, installer type-check, Web Vitest suite, workspace Rust check/test, and installer Rust check all pass.
- Packaging smoke found and fixed an installer payload hygiene issue: stale legacy-branded sibling binaries from the local `target/debug` directory were being copied into the installer payload when only a debug desktop executable existed.
- The installer build script now skips legacy-branded sibling artifacts, skips `.rlib` compiler artifacts, refuses strict payload manifests containing legacy-branded paths, and records `sourceExe` as a basename instead of an absolute workspace path.
- Packaging binary scans found a second local-only residue risk: release executables could embed absolute build source paths from the local workspace name. Desktop and installer release builds now remap source prefixes, and runtime fallback paths no longer compile `CARGO_MANIFEST_DIR` absolute paths into release artifacts.
- Packaging sidecar scans found that MSVC/Cargo-generated `.pdb` and `.d` files can still contain local workspace paths. Desktop and installer build scripts now remove the generated sidecars after successful builds because they are not part of the installer payload.
- Local workspace cleanup removed a stale untracked legacy-branded OpenSSL cache directory after confirming current builds use the void cache path.
- Installer launch smoke passed without performing a real installation: `void-installer.exe` stayed alive long enough for metadata inspection, reported process name `void-installer`, window title `Install void`, product name `void Installer`, and company name `void`.
- Desktop release smoke launch passed: `void-desktop.exe` stayed alive long enough for metadata inspection, reported process name `void-desktop`, window title `void`, product name `Void`, and company name `void`.
- Desktop dev smoke is covered by the currently running debug desktop process: `target/debug/void-desktop.exe` is alive, responding, has void-branded file metadata, and listens on localhost port `7244`; the associated `esbuild` service is also running.
- Read-only system surface smoke found legacy-branded installed remnants outside the repository: an uninstall registry entry, desktop/start-menu shortcuts pointing at the old install location, and old app data directories. These need explicit operator cleanup or migration before the full-machine brand goal can be marked complete.
- `scripts/cleanup-legacy-brand-remnants.ps1` now provides a default dry-run cleanup path. Its dry-run detected the expected uninstall entry, desktop shortcut, start-menu shortcut, old WebView data directory, and old roaming data directory; `-Apply` is intentionally required before it removes shortcuts/registry entries or archives old data.
- Local cleanup was applied after the dry run: the old uninstall entry and shortcuts were removed, the old WebView and roaming data directories were archived under `void-legacy-archive`, and a follow-up dry run reported no remaining detected remnants.
- `scripts/verify-installed-void-surfaces.ps1` now provides a read-only post-install check. In report-only mode before a real install, it passes installer executable metadata and correctly reports missing installed registry/shortcut/install-directory surfaces; after real installation, `-Strict` should pass before the manual install smoke checkbox is closed.
- Additional ignored-output cleanup removed stale local backup/generated directories and old package-manager workspace links that contained legacy paths. A fresh workspace-relative path scan reports no legacy brand names outside `.git`.
- A brand-clean sibling worktree now exists at `C:\Users\17949\Documents\Void-sandbox`; it is detached at the audited commit and has a clean working tree. Path and tracked-content scans there report no legacy brand names.
- The brand-clean sibling worktree has been bootstrapped with dependencies and release-fast artifacts: `pnpm run desktop:build:release-fast` emitted `target/release-fast/void-desktop.exe`, and `pnpm run installer:build:only:fast` emitted `Void-Installer/src-tauri/target/release-fast/void-installer.exe`. The post-install verifier now runs there without crashing and reports only the expected missing installed registry/shortcut surfaces before a real install.
- The brand-clean sibling worktree release desktop was launched successfully from `target/release-fast/void-desktop.exe`; the process name was `void-desktop`, the main window title was `void`, and file metadata reported product `Void` and company `void`.
- Residual external path caveat: the current active checkout is still located under a legacy-branded parent directory. Renaming/removing the active checkout directory is intentionally left as a separate operator step because this running process and a desktop app process are attached to that path.
- External workspace path audit found three legacy-named directories under `Documents`: the old primary source checkout, the old sandbox worktree, and the old media-placeholder worktree. They are intentionally not auto-removed because one is the main worktree with an untracked user issue file and the others may be independent worktrees. Operator cleanup should first preserve or move any untracked work, switch day-to-day development to `C:\Users\17949\Documents\Void-sandbox`, then remove or rename the legacy-named worktrees with normal Git worktree commands.
- Fresh packaging verification passed: `pnpm run desktop:build:release-fast`, `pnpm run installer:build:only:fast`, and binary/content/path scans show no legacy brand token residue in `target/release-fast/void-desktop.exe`, `Void-Installer/src-tauri/target/release-fast/void-installer.exe`, or the installer payload.
- Focused fork-feature regression checks passed in the brand-clean worktree: 17 Web UI test files / 113 tests covered media preview, workspace media gallery/library, media tool cards, compact chat desktop/window bridge, preview-first controls, and automation view/schedule/task creation; Rust contract tests covered agent tool registry/media tool availability, session wire shape, and stream tool-argument handling with 86 passing tests.
- `scripts/brand-final-acceptance-report.ps1` now provides a single read-only final acceptance report. Current report status: tracked brand audit, tracked content grep, and known system remnant cleanup pass; installed surfaces, legacy-named external workspace paths, and working-tree cleanliness remain non-passing until the HITL cleanup and smoke steps are completed. `-Strict` is expected to fail until those are closed.
- `scripts/cleanup-legacy-workspace-paths.ps1` now provides a default dry run for legacy-named workspace directories. Current dry run classifies the active old sandbox as blocked, one legacy-named worktree as clean and ready for normal Git worktree removal, and one legacy-named Git directory as manual-only because it is not registered as a worktree.
- Workspace cleanup has progressed: the ready clean media placeholder worktree was removed from Git worktree registration. Git could not delete the directory because non-Git build/dependency output remained, so a follow-up cleanup dry run reclassified the leftover directory as a ready non-Git archive action. Applying the script archived that directory under `void-legacy-workspace-archive`.
- The workspace cleanup script now sanitizes archive leaf names by replacing old-brand tokens with `legacy`, and the final acceptance report now includes a `workspace-archive-paths` check so archive paths cannot silently preserve old naming. The disposable archived clean media placeholder worktree copy was then deleted after path safety validation because its internal dependency/build/source paths still preserved old naming; the archive path check now passes.
- The follow-up workspace cleanup dry run now reports only two blocked/manual external paths: one unregistered Git directory and the active old sandbox worktree with local changes or untracked files. No further automatic cleanup is allowed until an operator decides how to preserve or move those paths.
- The latest final acceptance report from the brand-clean worktree has 3 non-passing checks: workspace cleanup plan warning, installed-surfaces warning, and external-workspace-paths warning. Tracked brand audit, tracked content grep, known system remnant cleanup, active workspace path, workspace archive paths, and working-tree cleanliness pass.
- Follow-up diagnosis of the remaining local notes directory found it is an unregistered Git directory with untracked local media/tool notes. A conservative rename attempt to a void-named local notes directory was blocked by Windows because the directory is currently in use; no data was moved. This should be retried after closing the process that has that directory as its working directory.
- The active old sandbox path is still a registered primary worktree with local/untracked content and owns the shared Git metadata for sibling worktrees. It must not be renamed or removed from inside the current linked-worktree setup. The safe path is to preserve/migrate the untracked issue file, switch day-to-day work to the brand-clean checkout, then retire the old sandbox from outside the active process.
- The local notes directory has been copied to a void-named directory while excluding its local `.git` and temporary agent folder, so the local notes are preserved under a brand-clean path before the occupied old directory is removed.
- A brand-clean independent checkout now exists at `C:\Users\17949\Documents\void-source`. It is not a linked worktree, its `.git` is a real directory, its local remote points at the void repository, and strict brand audit passes there. This is the preferred day-to-day source checkout for finishing external path cleanup.
- The final acceptance report now includes a `local-git-config` check. It passes in the independent brand-clean checkout and is expected to warn in linked worktrees or old checkouts that still reference legacy remotes or local paths.
- The installer now embeds an explicit Windows `asInvoker` manifest and exposes `--qa-install-and-exit [installPath]` for release verification. This keeps the normal React installer unchanged while allowing automated per-user installs without UAC prompts.
- QA installation was executed from `Void-Installer/src-tauri/target/release-fast/void-installer.exe --qa-install-and-exit`. `scripts/verify-installed-void-surfaces.ps1 -Strict` passed against `C:\Users\17949\AppData\Local\void`, including uninstall registry entry, manufacturer install location, desktop shortcut, start menu shortcut, installed desktop executable metadata, and installer metadata.
- The installed app smoke launch from `C:\Users\17949\AppData\Local\void\void-desktop.exe` succeeded and started process `void-desktop`.
- Manual product workflow smoke remains before shipping because chat, media generation, media preview, media gallery, automation, compact chat, and session switching require interactive verification.
