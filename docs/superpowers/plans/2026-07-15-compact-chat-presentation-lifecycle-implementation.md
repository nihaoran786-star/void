# Compact Chat Presentation Lifecycle Implementation Plan

**Goal:** Eliminate Compact Chat presentation work while its floating WebView
is unavailable or minimized, without changing chat business behavior.

### Task 1: Isolate the dynamic entry closure

- [x] Dynamically import the floating UI only in its query branch.
- [x] Lazily mount the main-window bridge only in Tauri.
- [x] Lock both modules as required dynamic performance entries.

### Task 2: Add an explicit publisher lifecycle

- [x] Default to suspended with no presentation-source subscription.
- [x] Activate on presentation request and publish the latest snapshot.
- [x] Coalesce updates in a cancelable microtask and serialize publications.
- [x] Invalidate queued/in-flight work on suspend or destroy.

### Task 3: Connect window activity

- [x] Suspend before explicit minimize and before close handling.
- [x] Resume from native focus restoration.
- [x] Intercept native close/Alt+F4 and suspend before routing layout close.
- [x] Preserve send/cancel and existing window adapter behavior.

### Task 4: Verify

- [x] Run publisher, bridge, floating-window, window-service, and layout tests.
- [x] Run Web type-check and staged diff checks.
- [x] Run the manifest production build and performance budget Gate.
- [x] Obtain independent review with no Critical/Important findings.
