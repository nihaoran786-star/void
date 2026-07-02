# Upstream Targeted Migration

## Goal

Selectively migrate useful upstream changes from the legacy upstream repository without
regressing void branding, automation, media sessions, or the right-side media
preview panel.

## Candidate Slices

1. Chat input and mention polish.
2. CLI slash-command substring matching and ACP `omp` preset.
3. Startup and flow-chat performance improvements.
4. Prompt cache reuse foundation.
5. Multitask mode parallel-agent behavior.
6. Persisted thread goals and `/goal` workflow.

## Non-Goals

- No whole-repo merge from upstream.
- No legacy installer path restoration.
- No deletion or replacement of the local workspace media modules.
- No migration that weakens strict brand verification.
- No broad runtime rewrite in the same commit as UI polish.

## Migration Style

- Prefer small vertical slices with focused tests.
- Compare upstream behavior, then reimplement or adapt in void naming.
- Keep UI rendering and orchestration separate from runtime/domain decisions.
- Update this vault when a slice changes scope.
