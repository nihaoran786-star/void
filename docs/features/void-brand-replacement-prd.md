# Void Brand Replacement PRD

> Status: Draft
> Scope: Full previous-brand-to-Void brand replacement across product copy, UI identity, app assets, installer, packaging metadata, generated files, build artifacts, docs, and user-data migration boundaries
> Non-goal: this document does not implement the rename, change Agent behavior, change model/runtime capabilities, or require a visual UI redesign beyond brand assets and text.

## Problem Statement

The product is currently branded as previous brand across the repository, desktop app, installer, package metadata, executable names, config paths, generated assets, docs, theme ids, logo images, and companion visuals such as the panda welcome artwork. The user wants the product to become **Void / 虚无 AI**, with all previous brand-related text and brand surfaces replaced, including new-project text, packaging dependencies, app names, logo assets, and the panda welcome imagery.

A naive search-and-replace would be risky. The repository contains user-facing strings, internal package names, Rust crate names, installer registry keys, updater names, executable paths, app data directories, file paths, theme ids, public URLs, provider ids, and compatibility-sensitive storage locations. Some can be replaced directly, while others require a migration or compatibility layer so existing installations, shortcuts, app data, sessions, and updater flows do not break.

The goal is a complete brand replacement that feels intentional to users and remains operationally safe for existing installs.

## Solution

Replace the previous brand brand with a controlled Void brand system.

The product brand becomes:

- Primary English display name: **Void**
- Formal English name where clarity is needed: **Void AI**
- Primary Chinese display name: **虚无 AI**
- Preferred combined mark: **Void / 虚无 AI**
- Product tagline: **Build from the void.**
- Chinese tagline: **从虚无中构建答案。**

The logo system replaces the current previous brand logo and panda imagery with a minimal negative-space Void mark. The symbol direction is: hollow core, broken boundary, and a small execution dot. It should communicate quiet intelligence, agency, and creation from empty space without using robot, brain, lightning, panda, or cartoon motifs.

A generated concept image exists as an initial visual reference:

- `C:\Users\17949\.codex\generated_images\019e5030-1eb4-7a30-b56b-98fb9538d431\ig_00021a6068860f3b016a10782b03b081908a1e7effe29193fe.png`
- `C:\Users\17949\.codex\generated_images\019e5030-1eb4-7a30-b56b-98fb9538d431\ig_00021a6068860f3b016a1079eef3848190a9ce6090d2dfd3e0.png`
- `C:\Users\17949\.codex\generated_images\019e5030-1eb4-7a30-b56b-98fb9538d431\ig_029cd27752e2b615016a108b4420848190b059879539cd9cef.png`

Implementation should happen through a brand inventory and a small brand manifest, not through scattered hand edits. The manifest becomes the single source for display names, executable names, app identifiers, install folder names, data folder names, logo asset names, and compatibility aliases.

## User Stories

1. As a desktop user, I want the app name to be Void instead of previous brand everywhere I see it, so that the product identity is consistent.
2. As a Chinese desktop user, I want Chinese-facing surfaces to use 虚无 AI where appropriate, so that the brand feels deliberate in Chinese.
3. As an English desktop user, I want English-facing surfaces to use Void or Void AI consistently, so that I do not see mixed previous brand/Void naming.
4. As an installer user, I want the installer title, copy, buttons, success state, uninstall state, and shortcuts to say Void, so that installation matches the product brand.
5. As a Windows user, I want the desktop shortcut, Start Menu shortcut, Add/Remove Programs entry, context menu entry, and executable display name to say Void, so that the OS-level brand is consistent.
6. As an existing previous brand user, I want my old sessions and settings to keep working after the rename, so that the brand migration does not lose data.
7. As an existing previous brand user, I want legacy previous brand install locations or app-data folders to be detected and migrated or reused safely, so that upgrading does not create a duplicate empty app.
8. As a user, I want the old panda welcome artwork to be replaced with a Void-style visual, so that the first-run experience matches the new identity.
9. As a user, I want the old previous brand logo to be replaced in the desktop app, installer, public web assets, mobile web assets, and generated icons, so that no stale mark remains.
10. As a user, I want error messages, notifications, onboarding text, menu labels, and new-project/new-session copy to reference Void where they mention the product, so that the experience does not feel partially renamed.
11. As a developer, I want a single brand manifest to define Void names and previous brand compatibility aliases, so that future brand changes do not require ad hoc string edits.
12. As a developer, I want all generated icons and package metadata to come from the brand manifest or documented asset source, so that packaged builds are reproducible.
13. As a developer, I want internal package/crate renames to happen only where safe, so that a brand rename does not break imports, cargo workspace resolution, or release automation.
14. As a release engineer, I want build scripts, CI artifact names, updater endpoints, bundle identifiers, executable names, and installer payload names to be reviewed explicitly, so that release packages remain installable.
15. As a release engineer, I want legacy artifact names and updater paths to remain supported for one migration window where required, so that current users can update into the Void build.
16. As a maintainer, I want a brand audit test to fail when user-facing previous brand text remains, so that regressions are caught before shipping.
17. As a maintainer, I want a separate allowlist for compatibility-sensitive internal previous brand names, so that audits do not force unsafe renames prematurely.
18. As a support person, I want docs and troubleshooting instructions to say Void while explaining legacy previous brand migration only where necessary, so that users are not confused.
19. As a designer, I want Void's icon system to work at tray, app icon, installer, sidebar, welcome, and splash sizes, so that the identity is robust.
20. As a designer, I want the brand replacement to avoid adding a new colorful theme, so that Void keeps the quiet, minimal AI-tool direction already discussed.
21. As a QA engineer, I want packaging validation for Windows install, uninstall, launch-after-install, and shortcut creation, so that OS integration does not regress.
22. As a QA engineer, I want app-data migration tests from `.previous brand` or previous brand directories to Void equivalents, so that existing user data remains reachable.
23. As a contributor, I want clear rules for when to use Void, Void AI, or 虚无 AI, so that new copy does not drift.
24. As a contributor, I want clear rules for whether internal technical identifiers should be renamed now or left as compatibility aliases, so that implementation decisions are reviewable.

## Implementation Decisions

- The brand replacement must be implemented as a staged engineering change, not as one uncontrolled global search-and-replace.
- The public product name is **Void**. Use **Void AI** where the context needs product-category clarity. Use **虚无 AI** in Chinese-facing product copy.
- The old brand **previous brand** must disappear from user-visible copy and assets unless the text is explicitly about legacy migration.
- A brand manifest should be introduced before broad replacement. It should define:
  - display names: `Void`, `Void AI`, `虚无 AI`
  - executable names: `void-desktop`, `void-installer`
  - install folder: `Void`
  - app data folder: `.void` or platform-appropriate `Void`
  - legacy aliases: `previous brand`, `previous brand`, `.previous brand`, `previous brand-desktop`, `previous brand-installer`
  - app identifiers and bundle metadata
  - asset source names for icon generation
- The brand manifest is a deep module candidate because it can expose a small interface while centralizing a large replacement surface.
- User-facing strings in frontend locales, installer locales, HTML titles, docs, window titles, onboarding, new-project copy, new-session copy, notifications, and error messages should be replaced with Void naming.
- Logo assets should be regenerated from a single source mark and exported to all required desktop, installer, mobile, public, tray, and store sizes.
- Panda welcome and companion imagery should be replaced by a Void-compatible mark or abstract companion visual. It should not use pandas, animals, cute mascots, robots, brains, lightning, or colorful sci-fi symbols.
- Installer identity must be replaced across UI, Tauri config, package metadata, registry display name, shortcut names, uninstall display name, install folder logic, launch-after-install copy, and payload executable naming.
- Desktop identity must be replaced across Tauri config, package metadata, executable/bundle names, app icons, updater artifact names, desktop file metadata, app title, public assets, and generated icon sizes.
- CI and release workflows must be reviewed because artifact names, updater endpoints, release asset globs, installer paths, and executable names currently include previous brand/previous brand.
- Internal Rust crate names and package names require a safety classification:
  - User-facing/distribution identifiers should move to Void.
  - Private internal crate names may remain temporarily if renaming creates high churn or breaks dependency paths.
  - Any retained internal previous brand names must be on an explicit compatibility allowlist with a removal plan.
- Existing user data must be protected. If data currently lives under `.previous brand`, `previous brand`, or `previous brand` directories, the new app should either migrate it to Void locations or read legacy locations as fallback.
- Existing installation detection must support legacy previous brand installs so Void can upgrade or uninstall them cleanly.
- Registry/context menu cleanup must remove both new Void entries and legacy previous brand entries where appropriate.
- legacy provider provider naming requires a product decision. It may need to become `OpenVoid`, remain as a provider-specific legacy brand, or be removed if it is not part of the new brand. Do not blindly rename provider ids without checking API compatibility.
- Theme ids such as `previous brand-dark` are compatibility-sensitive. User-facing theme names should no longer show previous brand. Internal theme ids can remain only if changing them would break stored preferences; otherwise provide a migration map.
- Docs should be updated after code and packaging decisions are clear. Migration notes should explain that Void is the successor brand to previous brand without exposing unnecessary internal implementation detail.
- Generated schemas, lockfiles, and package-lock metadata must be updated through their normal generators/package manager commands, not manually edited.

## Testing Decisions

- Brand audit tests should search user-facing source for `previous brand`, `previous brand`, and `previous brand`, with an explicit allowlist for legacy migration and internal compatibility names.
- Asset tests should verify required Void icon outputs exist for desktop app, installer, web public assets, mobile web, and store/icon size variants.
- Locale tests should verify English, Simplified Chinese, and Traditional Chinese product names are present and no stale user-facing previous brand copy remains.
- Installer tests should cover install path selection, default install folder, existing legacy previous brand detection, install, launch after install, uninstall, shortcut creation, registry display name, and context menu registration.
- Desktop packaging tests should verify executable name, app title, bundle identifier, icon assets, updater metadata, release artifact names, and launch behavior.
- Migration tests should cover:
  - fresh Void install
  - Void install over legacy previous brand path
  - reading existing `.previous brand` session data
  - moving or aliasing app config and session storage
  - uninstall cleanup for both Void and legacy previous brand entries
- Theme preference tests should verify old `previous brand-*` stored theme ids still resolve or are migrated without losing user settings.
- Provider id tests should verify any legacy-provider/new-provider decision does not break model provider lookup or saved installer configuration.
- Tests should focus on observable behavior: visible product names, generated assets, install/uninstall behavior, migration results, and compatibility. They should not assert implementation-specific file traversal unless that traversal is the public migration contract.
- Manual QA is required for icon rendering, welcome visuals, installer screens, Windows Start Menu, Add/Remove Programs, desktop shortcut, and app taskbar identity.

## Out of Scope

- Changing Agent behavior, model selection behavior, tool execution, session runtime, prompt strategy, context packing, or code review behavior.
- Redesigning the entire UI visual system.
- Introducing a new color palette or Dark Glass theme as part of the rename.
- Changing product architecture unrelated to brand replacement.
- Removing all internal previous brand identifiers in one pass if doing so would break compatibility or cause avoidable churn.
- Renaming third-party URLs, provider ids, or API endpoints before compatibility is confirmed.
- Deleting legacy user data.
- Changing repository ownership or GitHub release endpoints unless release infrastructure is ready.

## Further Notes

This rename has two different meanings that must not be confused:

1. **Brand replacement**: what users see should become Void / Void AI / 虚无 AI.
2. **Technical identifier migration**: executables, app ids, package names, data directories, updater artifacts, and internal crates need explicit compatibility rules.

The safest implementation order is:

1. Create the brand manifest and audit allowlist.
2. Replace user-facing text and assets.
3. Replace desktop and installer packaging metadata.
4. Add legacy previous brand detection and data migration.
5. Update CI/release artifacts and updater metadata.
6. Update docs and final audit tests.
7. Only then decide whether remaining internal `previous brand-*` crate/package identifiers should be renamed or kept as compatibility internals.

The logo direction should remain minimal and monochrome-first. The panda welcome assets should be replaced by a Void mark or abstract system presence that feels quiet, precise, and agentic. The existing generated logo concepts are useful as a first visual direction, but production assets should be exported from a deterministic source file before implementation begins.
