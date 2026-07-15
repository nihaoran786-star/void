# Idle Singleton Lifecycle Performance Implementation Plan

**Goal:** Remove idle singleton timers and make desktop event-listener teardown race-safe without changing callers or backend semantics.

**Architecture:** Keep lifecycle ownership inside the two existing services. Processing status uses status-count-driven timer ownership; tool execution uses a listener generation plus local rollback.

**Tech Stack:** TypeScript, Vitest, Vite/Tauri event API.

### Task 1: Make processing cleanup demand-driven

- [x] Start cleanup on the first `registerStatus`, never on module import.
- [x] Stop after the final immediate/delayed remove, session clear, clear-all, or old-status cleanup.
- [x] Preserve notification, minimum-display, completed-history, and public API behavior.
- [x] Stop the existing timer during HMR disposal.

### Task 2: Make tool event listeners lifecycle-safe

- [x] Remove the cleanup interval and cap processed keys at insertion time with FIFO 1000.
- [x] Skip the Tauri dynamic import in Web runtime.
- [x] Register four listeners under a generation and locally roll back partial/stale setup.
- [x] Ignore callbacks after destroy; make destroy idempotent and singleton identity-safe.
- [x] Make HMR destroy only an already-created instance.

### Task 3: Verify the service contracts

- [x] Add timer lifecycle tests for every last-status deletion path.
- [x] Add Web/Tauri, four-unlisten, partial failure, pending import/listen destroy, FIFO, idempotency, stale callback, and HMR-helper tests.
- [x] Run the two focused Vitest files.
- [x] Run Web type-check and `git diff --check`.
- [x] Run the production performance Gate in the parent task.
