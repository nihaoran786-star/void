# Windows Computer Use Smoke Matrix

Issue: `ISSUE-1130C2`

Status: `manual_pending`

## Purpose

This matrix defines the real Windows smoke evidence required before closing parent `ISSUE-1130C`.
It does not replace the automated host/unit tests and must not be treated as passed until each scenario has current evidence.

## Automated Baseline

Run these checks before manual smoke so failures are separated from hardware, display, or target-window behavior:

- `cargo test -p void-desktop windows_app_image_coordinate --lib -- --nocapture`
- `cargo test -p void-desktop windows_pointer_map_handles_negative_origin --lib -- --nocapture`
- `cargo test -p void-desktop windows_host_app_actions --lib -- --nocapture`
- `cargo test -p void-desktop windows_bg_input --lib -- --nocapture`
- `cargo test -p void-desktop windows_foreground_capture --lib -- --nocapture`
- `cargo check -p void-desktop`

### 2026-07-04 Baseline Run

Status: `passed`

- `cargo test -p void-desktop windows_app_image_coordinate --lib -- --nocapture`
  - Result: passed, 2 tests.
  - Notes: first run compiled `void-desktop` test dependencies and took about 4m35s.
- `cargo test -p void-desktop windows_pointer_map_handles_negative_origin --lib -- --nocapture`
  - Result: passed, 1 test.
- `cargo test -p void-desktop windows_host_app_actions --lib -- --nocapture`
  - Result: passed, 2 tests.
- `cargo test -p void-desktop windows_bg_input --lib -- --nocapture`
  - Result: passed, 10 tests.
  - Notes: Cargo briefly waited on the package cache because another focused test was running.
- `cargo test -p void-desktop windows_foreground_capture --lib -- --nocapture`
  - Result: passed, 5 tests.
  - Notes: Cargo briefly waited on the package cache and artifact directory because another focused test was running.
- `cargo check -p void-desktop`
  - Result: passed.
  - Notes: one existing unrelated warning remains for unused `parse_clipboard_path_segments` in `src/apps/desktop/src/api/clipboard_file_api.rs`.

Manual smoke remains `manual_pending`. This automated baseline does not prove real DPI, multi-monitor, occlusion, capture-source, or UIPI behavior.

## Environment Preflight

### 2026-07-04 Current Machine

Status: `environment_preflight_only`

```yaml
manual_smoke_status: manual_pending
product_smoke_executed: false
app_click_executed: false
app_type_text_executed: false
app_scroll_executed: false
app_key_chord_executed: false
```

Observed environment:

- OS: Microsoft Windows 11 Home Chinese edition, version `10.0.26200`, build `26200`, 64-bit.
- DPI: `AppliedDPI=144`, which is 150% scaling for the current user session.
- Displays: one detected primary display, `\\.\DISPLAY1`, logical bounds `{X=0,Y=0,Width=1707,Height=960}`, working area `{X=0,Y=0,Width=1707,Height=912}`.
- Video adapters reported by WMI:
  - `OrayIddDriver Device`, driver `17.1.58.818`, no current resolution reported.
  - `GameViewer Virtual Display Adapter`, driver `15.6.5.199`, no current resolution reported.
  - `NVIDIA GeForce RTX 4090 Laptop GPU`, driver `32.0.15.9227`, no current resolution reported.
  - `Intel(R) UHD Graphics`, resolution `2560x1440`, 32 bpp, driver `31.0.101.5445`.

Available product smoke harness:

```yaml
status: available_default_off
search_scope:
  - docs
  - scripts
  - src/apps/desktop/src/api
  - src/apps/desktop/src/computer_use
  - src/apps/desktop/src/lib.rs
product_smoke_executed: false
default_safe_check: cargo test -p void-desktop windows_computer_use_manual_harness --lib -- --nocapture
manual_run_command: $env:VOID_RUN_WINDOWS_COMPUTER_USE_SMOKE="1"; cargo test -p void-desktop windows_computer_use_manual_harness --lib -- --ignored --nocapture
notes: Desktop Tauri commands still expose Computer Use status, permission request, and settings links only. A default-ignored Rust test harness now exists in desktop_host.rs for explicit manual Notepad smoke through ComputerUseHost, but it did not execute app actions in this slice.
```

Preflight gaps:

- Current machine covers only a 150% single-display session; it does not cover 100%, 125%, mixed-scale multi-monitor, or negative-origin display scenarios.
- No real app input action was executed, so foreground, occluded, UIPI, and capture-source behavior remain unverified.
- Parent `ISSUE-1130C` remains open.

## Manual Harness

### 2026-07-04 Harness Gate

Status: `manual_harness_available`

The harness is intentionally default-off:

- Test filter: `windows_computer_use_manual_harness`.
- Default-safe command: `cargo test -p void-desktop windows_computer_use_manual_harness --lib -- --nocapture`.
- Manual smoke command: `$env:VOID_RUN_WINDOWS_COMPUTER_USE_SMOKE="1"; cargo test -p void-desktop windows_computer_use_manual_harness --lib -- --ignored --nocapture`.
- First gate: `#[ignore]`, so normal tests do not run the harness.
- Second gate: `VOID_RUN_WINDOWS_COMPUTER_USE_SMOKE=1`, so even `--ignored` skips without the explicit environment variable.

2026-07-04 verification:

- Default-safe command result: passed; the harness was discovered as ignored and no app action executed.
- `--ignored` without `VOID_RUN_WINDOWS_COMPUTER_USE_SMOKE=1`: passed; printed a skip message and did not launch Notepad or run app actions.
- Real manual smoke with `VOID_RUN_WINDOWS_COMPUTER_USE_SMOKE=1`: passed after the harness was changed to open a unique temporary file and target that file title instead of the initial Notepad child pid.

Covered current-machine smoke:

- Current environment: single display, 150% scale (`AppliedDPI=144`).
- Target: Notepad opened on a unique temporary `void-cu-smoke-*.txt` file.
- Actions: `get_app_state`, `app_type_text` with `VOID-CU-SMOKE-{pid}`, and screenshot-basis `app_click`.
- Result: passed.

### 2026-07-04 Stale Screenshot Map Evidence

Status: `partially_passed`

The harness now also verifies stale explicit screenshot ids:

- Current environment: single display, 150% scale (`AppliedDPI=144`).
- Target: Notepad opened on a unique temporary `void-cu-smoke-*.txt` file.
- Action: `app_click` with `ImageXy` and stale `screenshot_id: stale-manual-smoke-shot`.
- Expected result: fail before input dispatch with an explicit `screenshot_id` error.
- Result: passed.

Covered scenario:

```yaml
scenario_id: WIN-CU-STALE-MAP
status: passed
date: 2026-07-04
operator: Codex manual harness
commit: pending current slice commit
windows: Microsoft Windows 11 Home Chinese edition, version 10.0.26200, build 26200, 64-bit
display_topology: one primary display, logical bounds {X=0,Y=0,Width=1707,Height=960}, AppliedDPI=144 / 150%
target: Notepad unique temporary void-cu-smoke-*.txt
target_integrity: current user session, not elevated
hwnd: resolved by DesktopComputerUseHost during get_app_state
pid: resolved from get_app_state result
screenshot_id: stale-manual-smoke-shot
capture_source: existing get_app_state app screenshot path
action: app_click ImageXy x=1 y=1 with stale explicit screenshot_id
result_status: failed closed through VoidResult error
result_source: DesktopComputerUseHost image-coordinate mapping
result_path: app_click target resolution before Windows input dispatch
result_error_code: explicit screenshot_id coordinate map missing
result_warning:
evidence: env-enabled windows_computer_use_manual_harness passed
notes: This covers stale/missing explicit screenshot-id behavior only. It does not prove DPI 100/125, multi-monitor, occlusion, UIPI, or capture-source consistency.
```

Still pending:

- 100% and 125% DPI.
- Mixed-scale multi-monitor and negative-origin displays.
- Occluded or covered target windows.
- UIPI/high-integrity denial.
- Capture-source consistency across WGC/DWM/PrintWindow/BitBlt.

Manual smoke remains partially complete; parent `ISSUE-1130C` remains open.

## Required Environment Fields

Record these fields for every smoke run:

- Date and operator.
- Void commit SHA and build type.
- Windows version, build number, SKU, and architecture.
- Display topology, including each monitor origin, resolution, and scale factor.
- Target app name, version, process id, hwnd, window bounds, and integrity level.
- Capture source used by the action path, such as WGC, DWM, PrintWindow, or BitBlt.
- `screenshot_id` when an image-coordinate action depends on a captured pointer map.
- Returned `status`, `source`, `path`, `error_code`, and `warning` fields.
- Evidence path for screenshot, short recording, log excerpt, or observable UI state.

## Scenario Matrix

| ID | Scenario | Required setup | Action | Expected contract | Evidence |
| --- | --- | --- | --- | --- | --- |
| WIN-CU-DPI-100 | Single-monitor DPI hit test | One display at 100% scale, foreground Notepad/Edit target | Click, type, scroll through app image coordinates | Pointer lands on the intended control; result keeps explicit `status/source/path/warning` | Screenshot or recording plus action result |
| WIN-CU-DPI-125 | Single-monitor DPI hit test | One display at 125% scale, foreground Notepad/Edit target | Click, type, scroll through app image coordinates | Same coordinate contract as 100%; no integer rounding drift visible | Screenshot or recording plus action result |
| WIN-CU-DPI-150 | Single-monitor DPI hit test | One display at 150% scale, foreground Notepad/Edit target | Click, type, scroll through app image coordinates | Same coordinate contract as 100%; no integer rounding drift visible | Screenshot or recording plus action result |
| WIN-CU-MULTI-NEG | Mixed-scale multi-monitor | Secondary display has negative origin; monitors use different scale factors | Capture target on negative-origin display, then click via explicit `screenshot_id` | Explicit pointer map wins over pid fallback and maps to the intended physical point | Display settings screenshot, action result, and target-state evidence |
| WIN-CU-FOREGROUND | Foreground input delivery | Foreground classic Win32 edit control | Click, type, key chord, scroll | Delivery reports a non-error status and mutates the intended target only | Before/after target state and result payload |
| WIN-CU-OCCLUDED | Occluded or covered target | Target window partly covered or not foreground | Click/type/scroll using app target path | Result remains explicit: delivered, uncertain, unsupported, or blocked; no silent success | Window arrangement screenshot and result payload |
| WIN-CU-UIPI | High-integrity denial | Elevated target from non-elevated Void process | Click/type/key attempt | Result fails closed or warns with an explicit UIPI/high-integrity status path | Elevated target proof and result payload |
| WIN-CU-CAPTURE | Capture-source consistency | Same target captured through available WGC/DWM/PrintWindow/BitBlt paths | Compare image-coordinate hit point and capture metadata | Crop origin, bounds, and pointer map remain internally consistent or return explicit unsupported/uncertain status | Capture metadata, screenshot, and comparison notes |
| WIN-CU-STALE-MAP | Missing or stale pointer map | Use missing/stale `screenshot_id` for an app-image action | Attempt image-coordinate click | Action fails explicitly instead of using empty or unrelated pointer state | Result payload showing status/source/error |

## Result Record Template

Copy one block per scenario. Do not prefill `passed` without evidence.

```yaml
scenario_id:
status: manual_pending # manual_pending | passed | failed | deferred
date:
operator:
commit:
windows:
display_topology:
target:
target_integrity:
hwnd:
pid:
screenshot_id:
capture_source:
action:
result_status:
result_source:
result_path:
result_error_code:
result_warning:
evidence:
notes:
```

## Closure Rule

Parent `ISSUE-1130C` can be closed only when every required scenario is either:

- `passed` with current evidence, or
- explicitly `deferred` with rationale recorded in `docs/DECISIONS.md`.

Until then, `ISSUE-1130C` remains open even if all automated tests pass.
