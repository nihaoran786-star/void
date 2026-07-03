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
