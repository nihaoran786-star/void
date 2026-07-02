# void Brand Replacement PRD

## Problem Statement

The product is a forked and extended desktop application that still contains legacy upstream branding across user-facing UI, documentation, installer text, package metadata, release automation, shortcuts, registry entries, local data paths, and internal identifiers.

Users should experience the product as `void` everywhere. The installed app, installer, window title, shortcuts, uninstall entry, documentation, release artifacts, and visible UI copy should all use the void brand. The migration must preserve existing product capabilities, including chat sessions, media workflows, media gallery, automation, compact chat floating windows, APIMart media tools, desktop integration, and installer upgrade/uninstall behavior.

The main risk is that a naive global replacement can break Cargo crate names, TypeScript package references, Tauri bundle output, installer payload discovery, Windows registry cleanup, updater workflows, local cache paths, and old user data. The migration must therefore separate user-visible branding, runtime identifiers, compatibility handling, and release packaging into reviewable stages.

## Solution

Replace the product brand with `void` through a staged migration.

From the user's perspective:

- The app is called `void`.
- The installer is branded as `void Installer` and `Install void`.
- Installed shortcuts, Start Menu entries, uninstall entries, executable display names, and package artifacts use void naming.
- Documentation and public project text describe void.
- New installs use void-branded directories and metadata.
- Existing users can still upgrade, launch, and uninstall cleanly after the migration.
- Existing sessions, media assets, settings, automation data, and local workspace behavior remain available.

Hard requirement:

- Normal tracked source, docs, generated contracts, package metadata, installer metadata, release workflows, and tracked path names must not contain old upstream brand residue by final acceptance.
- Any retained old-brand compatibility must be temporary, isolated, documented, and owned by a migration or cleanup module.
- The final deliverable is not just a visible rename. It must cover app name, installer name, package names, executable names, shortcut names, registry/uninstall names, local data paths, CI artifact names, release asset names, documentation, and audit tooling.
- The migration must preserve all existing void-specific additions, including media sessions, image/video tool calls, media library/gallery surfaces, left sidebar debugging affordances, compact chat floating window behavior, automation, APIMart integrations, and upstream-compatible core flows.

From the implementation perspective:

- Normal product surfaces must not contain legacy upstream branding.
- Legacy compatibility should be isolated to installer, migration, cleanup, or data-path compatibility modules.
- Any retained legacy reference must have a clear reason, test coverage or verification, and a removal strategy.
- Chat, media generation, media gallery, BrowserPanel, APIMart, automation, and session domain logic must not gain brand-specific branches.

## User Stories

1. As a user, I want the desktop application name to be `void`, so that the product feels fully owned by the new brand.
2. As a user, I want the installer window to say `Install void`, so that installation does not expose legacy upstream branding.
3. As a user, I want the installed app shortcut to be named `void`, so that I can find the app by the new brand.
4. As a user, I want the Windows uninstall entry to be named `void`, so that system settings show the correct product name.
5. As a user, I want the default install folder to be `void`, so that the filesystem does not expose legacy branding.
6. As a user, I want the app window title and taskbar name to show `void`, so that the running app matches the brand.
7. As a user, I want installer completion copy to say `Launch void`, so that every install step is consistently branded.
8. As a user, I want documentation and README content to refer to void, so that onboarding material matches the product I installed.
9. As a user, I want release artifacts to use void names, so that downloaded installers and packages are not confused with upstream builds.
10. As a user, I want app icons and installer icons to use void assets, so that the product is visually consistent.
11. As an existing user, I want old sessions to remain available after upgrading to void, so that brand migration does not lose work.
12. As an existing user, I want old registry entries and shortcuts to be detected during upgrade, so that the installer can cleanly update them.
13. As an existing user, I want uninstall to remove both new void entries and old compatibility entries when appropriate, so that the system is left clean.
14. As an existing user, I want old local app data to be migrated or compatibly read, so that settings and history are preserved.
15. As a developer, I want user-visible brand copy to live in locale resources or branding constants, so that future brand edits do not require scattered code changes.
16. As a developer, I want legacy compatibility isolated in migration and installer modules, so that normal product logic does not depend on old names.
17. As a developer, I want package metadata and installer payload names updated deliberately, so that builds and installation do not fail due to missing executables.
18. As a developer, I want CI artifact names updated to void, so that release automation produces correct assets.
19. As a developer, I want a brand residue check, so that accidental legacy branding does not re-enter tracked files.
20. As a maintainer, I want internal crate and package renaming handled separately from visible brand replacement, so that the highest-risk workspace changes can be reviewed independently.
21. As a QA tester, I want to verify desktop launch, installer build, upgrade detection, uninstall, and existing session loading, so that the migration is safe end to end.
22. As a release manager, I want updater endpoints and release metadata reviewed, so that published builds do not point users back to upstream release assets.
23. As a contributor, I want documentation to explain which legacy references are intentionally retained for compatibility, so that future cleanup does not remove required migration behavior.
24. As a developer, I want generated artifacts reviewed after each phase, so that schema, lockfile, locale, and bundle changes are intentional.
25. As a maintainer, I want each migration stage to leave the project runnable, so that a failed later stage does not block shipping earlier safe branding fixes.
26. As a maintainer, I want all void-specific fork features to survive the rename, so that brand replacement does not regress media sessions, media generation, media library, compact chat, or debug tooling.
27. As a maintainer, I want the project to remain suitable for future upstream merges, so that local branding and product additions can be reapplied or preserved without structural drift.
28. As a release manager, I want installer, desktop, CLI, and workflow artifact names to be consistent, so that release outputs are easy to identify and distribute.
29. As a developer, I want a zero-residue audit to block completion, so that the migration is not declared done while old-brand strings or paths remain.
30. As a QA tester, I want a post-migration smoke checklist for all critical product flows, so that the rename is proven not to be a cosmetic-only change.

## Implementation Decisions

- Treat brand replacement as a staged migration, not a single global text replacement.
- Use `void` as the primary product display name.
- User-visible surfaces must become void-branded.
- Keep legacy compatibility references out of normal UI, docs, installer copy, package display names, and public release artifacts.
- Isolate old-name compatibility to installer migration, data migration, cleanup, or narrowly scoped tests.
- Do not add brand-specific decisions to chat, media generation, media gallery, APIMart, automation, BrowserPanel, compact chat, session domain, or polling code.
- Desktop window title, tray labels, menu labels, diagnostics names, and app metadata should use void naming.
- Installer product name, page title, default install path, shortcuts, registry display name, and uninstall metadata should use void naming.
- Desktop executable and packaging output should move toward `void-desktop`.
- Installer executable and packaging output should move toward `void-installer`.
- Desktop app identifiers should use void-owned identifiers.
- Installer app identifiers should use void-owned identifiers.
- New local app data should use void-branded paths.
- Old local app data must be migrated or compatibly read before old-path reads are removed.
- Installer install path logic must append or detect a void-branded install subdirectory for new installs.
- Installer upgrade and uninstall logic must still detect old installs through isolated compatibility code.
- Windows registry keys for the new product must use void naming.
- Cleanup logic may remove old shell integration, shortcuts, and uninstall keys as part of migration or uninstall.
- Locale resources should own end-user visible app and installer text.
- Generated locale contract files must be regenerated after locale updates.
- Brand assets should be generated or replaced through the existing asset pipeline where possible.
- CI and release workflows should rename artifact names and release asset references to void.
- Updater endpoints must not point to upstream release assets unless explicitly retained as a temporary internal development fallback.
- Internal Rust crate names and TypeScript package names should be renamed only in isolated phases because they touch imports, workspace metadata, lockfiles, build scripts, and installer payload discovery.
- Each stage must run a residue audit and update the issue plan with what remains.
- Treat upstream synchronization as a compatibility concern: keep local void branding and fork-specific modules isolated enough that future upstream code can be compared and merged deliberately.
- Do not solve brand residue by deleting or weakening product features.
- Do not hide residue by broad allowlists. Allowed compatibility entries must have owner, reason, and planned removal condition.
- Do not rename runtime identifiers blindly where they are cross-process contracts. Tauri command names, event names, schema keys, workspace paths, and package names must be renamed with both caller and callee updated together.
- The installer directory, package manager workspace entries, lockfiles, and build scripts must agree on the final installer path and package name.
- The desktop executable name and installer payload discovery must be changed in the same phase, because either side alone can break packaging.

## Testing Decisions

- Tests should verify observable behavior and migration contracts, not implementation details.
- Add or update a brand residue audit that scans tracked text files for forbidden legacy branding.
- The residue audit should support inventory mode during migration and strict mode for final acceptance.
- Any compatibility allowlist must be explicit, narrow, and documented.
- Web UI validation should include locale generation, locale audit, and type checking.
- Desktop validation should include Tauri/Rust checks for the desktop app.
- Installer validation should include installer frontend type checking and Tauri/Rust checks.
- Packaging validation should include at least a fast desktop build and a fast installer build before release.
- Installer tests or focused checks should cover new void install path behavior.
- Installer tests or focused checks should cover detection of old install paths.
- Installer tests or focused checks should cover registry naming for new void entries and cleanup of old entries.
- Manual QA should verify the app name in taskbar/window title, desktop shortcut, Start Menu shortcut, install directory, uninstall entry, and generated installer filename.
- Manual QA should verify existing sessions, media results, media gallery, automation entries, compact chat floating window behavior, and settings survive after migration.
- Final acceptance requires strict residue audit, type checks, targeted tests, and packaging checks to pass.
- Final acceptance requires comparing important fork features before and after the migration, especially media sessions, media generation, media gallery/library, compact chat floating window, automation, APIMart, session switching, and desktop launch.
- Final acceptance requires a manual review of generated installers or package artifacts for visible void branding.
- Final acceptance requires confirming that old-brand compatibility references, if any remain, are isolated to explicit migration or cleanup paths and do not appear in normal UI, documentation, package metadata, release output, or tracked path names.

## Out of Scope

- Changing chat/session behavior.
- Changing media generation logic.
- Changing APIMart provider behavior.
- Changing automation runtime behavior.
- Changing BrowserPanel behavior.
- Changing compact chat floating window behavior.
- Reworking application architecture.
- Replacing the product domain model.
- Removing old user data without migration.
- Shipping a new updater backend unless explicitly required by release planning.
- Combining all internal crate/package renaming with user-visible branding in one oversized change.
- Changing upstream synchronization strategy beyond documenting how void branding is preserved during future upstream merges.
- Removing or simplifying fork-added features to make the rename easier.
- Replacing media, chat, automation, APIMart, or compact chat architecture as part of brand migration.
- Declaring the migration complete while strict audit still reports tracked residue.

## Further Notes

- This PRD treats the current state as a partial migration, not a completed replacement.
- Installer and packaging branding are high priority because they control install path, uninstall metadata, shortcuts, executable discovery, and release output.
- A complete brand migration has two review layers:
  - User-facing complete replacement: no legacy upstream branding appears in normal UI, docs, packaging, installer, shortcuts, or uninstall entries.
  - Internal complete replacement: crate names, package names, environment variables, cache directories, CI job names, and compatibility identifiers are also renamed or explicitly isolated.
- The recommended release path is to complete user-facing replacement first, then decide whether internal crate/package renaming is worth the migration risk.
- Each stage should be small enough to review as a separate PR and should leave the project runnable.
- The final definition of done is strict: no old-brand residue in tracked text or tracked paths, unless the residue is explicitly documented as temporary migration compatibility and approved before release.
