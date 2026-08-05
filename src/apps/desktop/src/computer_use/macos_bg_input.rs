//! Codex-style background input injection for macOS.
//!
//! Wraps `CGEventCreate*` + `CGEventSourceStateID::Private` +
//! `CGEventPostToPid` so we can drive a *specific* application without
//!   * moving the user's mouse cursor,
//!   * stealing the user's keyboard focus,
//!   * or polluting the global HID event stream with our synthesized
//!     modifier presses (the `Private` source is decoupled from the user's
//!     real keyboard latch state).
//!
//! Used by the AX-first dispatch path in ControlHub: when an `app_*` action
//! cannot be satisfied by `AXUIElementPerformAction` alone (e.g. scroll,
//! free-form typing, complex chords) we fall back to PID-targeted events
//! from this module instead of the global foreground click path.
//!
//! Wired up by the next todos (`macos-ax-write` + `controlhub-actions`);
//! kept as standalone helpers here so it can be unit-tested and audited
//! independently of the dispatch glue.

#![allow(dead_code)]

use core_graphics::event::{CGEvent, CGEventFlags, CGEventType, CGMouseButton, ScrollEventUnit};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use core_graphics::geometry::CGPoint;
use foreign_types::ForeignType;
use log::{debug, info, warn};
use std::ffi::c_void;
use std::thread;
use std::time::{Duration, Instant};
use void_core::util::errors::{VoidError, VoidResult};

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGWindowListCopyWindowInfo(
        option: u32,
        relative_to_window: u32,
    ) -> core_foundation::array::CFArrayRef;
}

#[allow(non_upper_case_globals)]
const K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: u32 = 1;
#[allow(non_upper_case_globals)]
const K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: u32 = 16;
#[allow(non_upper_case_globals)]
const K_CG_NULL_WINDOW_ID: u32 = 0;

/// Logical mouse button for `bg_click`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BgMouseButton {
    Left,
    Right,
    Middle,
}

impl BgMouseButton {
    fn cg(self) -> CGMouseButton {
        match self {
            Self::Left => CGMouseButton::Left,
            Self::Right => CGMouseButton::Right,
            Self::Middle => CGMouseButton::Center,
        }
    }
    fn down(self) -> CGEventType {
        match self {
            Self::Left => CGEventType::LeftMouseDown,
            Self::Right => CGEventType::RightMouseDown,
            Self::Middle => CGEventType::OtherMouseDown,
        }
    }
    fn up(self) -> CGEventType {
        match self {
            Self::Left => CGEventType::LeftMouseUp,
            Self::Right => CGEventType::RightMouseUp,
            Self::Middle => CGEventType::OtherMouseUp,
        }
    }
}

/// Logical mouse button for PID-scoped background drag primitives.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BgDragButton {
    Left,
    Right,
    Middle,
}

impl BgDragButton {
    fn plan_button(self) -> crate::computer_use::macos_pointer_parity_plan::MacosPointerButton {
        match self {
            Self::Left => crate::computer_use::macos_pointer_parity_plan::MacosPointerButton::Left,
            Self::Right => {
                crate::computer_use::macos_pointer_parity_plan::MacosPointerButton::Right
            }
            Self::Middle => {
                crate::computer_use::macos_pointer_parity_plan::MacosPointerButton::Middle
            }
        }
    }

    fn cg(self) -> CGMouseButton {
        match self {
            Self::Left => CGMouseButton::Left,
            Self::Right => CGMouseButton::Right,
            Self::Middle => CGMouseButton::Center,
        }
    }

    fn down(self) -> CGEventType {
        match self {
            Self::Left => CGEventType::LeftMouseDown,
            Self::Right => CGEventType::RightMouseDown,
            Self::Middle => CGEventType::OtherMouseDown,
        }
    }

    fn dragged(self) -> CGEventType {
        match self {
            Self::Left => CGEventType::LeftMouseDragged,
            Self::Right => CGEventType::RightMouseDragged,
            Self::Middle => CGEventType::OtherMouseDragged,
        }
    }

    fn up(self) -> CGEventType {
        match self {
            Self::Left => CGEventType::LeftMouseUp,
            Self::Right => CGEventType::RightMouseUp,
            Self::Middle => CGEventType::OtherMouseUp,
        }
    }
}

/// Modifier keys understood by `bg_key_chord` / mouse modifiers.
///
/// Maps to the 4 standard macOS modifier flag bits. We deliberately do not
/// touch `CapsLock` here.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BgModifier {
    Command,
    Shift,
    Option, // alias: alt
    Control,
    Fn,
}

impl BgModifier {
    pub fn from_str(s: &str) -> Option<Self> {
        let kind = crate::computer_use::macos_key_parity_plan::modifier_from_alias(s)?;
        if !crate::computer_use::macos_key_parity_plan::modifier_allowed_in_default_host_parser(
            kind,
        ) {
            return None;
        }
        match kind {
            crate::computer_use::macos_key_parity_plan::MacosModifierKind::Command => {
                Some(Self::Command)
            }
            crate::computer_use::macos_key_parity_plan::MacosModifierKind::Shift => {
                Some(Self::Shift)
            }
            crate::computer_use::macos_key_parity_plan::MacosModifierKind::Option => {
                Some(Self::Option)
            }
            crate::computer_use::macos_key_parity_plan::MacosModifierKind::Control => {
                Some(Self::Control)
            }
            crate::computer_use::macos_key_parity_plan::MacosModifierKind::Fn => None,
        }
    }
    fn flag(self) -> CGEventFlags {
        let kind = match self {
            Self::Command => crate::computer_use::macos_key_parity_plan::MacosModifierKind::Command,
            Self::Shift => crate::computer_use::macos_key_parity_plan::MacosModifierKind::Shift,
            Self::Option => crate::computer_use::macos_key_parity_plan::MacosModifierKind::Option,
            Self::Control => crate::computer_use::macos_key_parity_plan::MacosModifierKind::Control,
            Self::Fn => crate::computer_use::macos_key_parity_plan::MacosModifierKind::Fn,
        };
        match crate::computer_use::macos_key_parity_plan::modifier_flag_kind(kind) {
            crate::computer_use::macos_key_parity_plan::MacosModifierFlagKind::Command => {
                CGEventFlags::CGEventFlagCommand
            }
            crate::computer_use::macos_key_parity_plan::MacosModifierFlagKind::Shift => {
                CGEventFlags::CGEventFlagShift
            }
            crate::computer_use::macos_key_parity_plan::MacosModifierFlagKind::Option => {
                CGEventFlags::CGEventFlagAlternate
            }
            crate::computer_use::macos_key_parity_plan::MacosModifierFlagKind::Control => {
                CGEventFlags::CGEventFlagControl
            }
            crate::computer_use::macos_key_parity_plan::MacosModifierFlagKind::SecondaryFn => {
                CGEventFlags::CGEventFlagSecondaryFn
            }
        }
    }
    fn keycode(self) -> u16 {
        let kind = match self {
            Self::Command => crate::computer_use::macos_key_parity_plan::MacosModifierKind::Command,
            Self::Shift => crate::computer_use::macos_key_parity_plan::MacosModifierKind::Shift,
            Self::Option => crate::computer_use::macos_key_parity_plan::MacosModifierKind::Option,
            Self::Control => crate::computer_use::macos_key_parity_plan::MacosModifierKind::Control,
            Self::Fn => crate::computer_use::macos_key_parity_plan::MacosModifierKind::Fn,
        };
        crate::computer_use::macos_key_parity_plan::modifier_keycode(kind)
    }
}

/// Whether this host can deliver background input to arbitrary pids.
///
/// Both `CGEventSourceStateID::Private` and `CGEventPostToPid` require the
/// macOS Accessibility privilege to be granted to the *host* process; if it
/// is not, the calls are silently dropped by the kernel. Callers should
/// surface `BACKGROUND_INPUT_UNAVAILABLE` upstream when this returns
/// `false`.
///
/// Result is cached after the first successful probe so we don't pay the
/// `CGEventSource` create + `CGEventPostToPid` round-trip on every call.
/// A `false` result is NOT cached so callers can re-probe after the user
/// grants Accessibility permission without restarting the host.
pub fn supports_background_input() -> bool {
    use std::sync::atomic::{AtomicBool, Ordering};
    static CACHED_OK: AtomicBool = AtomicBool::new(false);
    if CACHED_OK.load(Ordering::Relaxed) {
        return true;
    }
    if !accessibility_is_trusted() {
        return false;
    }
    // Real Codex-style probe: build a private source and post a no-op scroll
    // to *our own* pid. Posting to self never disturbs the user's foreground
    // app or real cursor, but it round-trips through the same kernel path
    // that would deliver to a third-party pid.
    let probe_ok = (|| -> bool {
        let src = match CGEventSource::new(CGEventSourceStateID::Private) {
            Ok(s) => s,
            Err(_) => return false,
        };
        let ev = match CGEvent::new_scroll_event(src, ScrollEventUnit::PIXEL, 2, 0, 0, 0) {
            Ok(e) => e,
            Err(_) => return false,
        };
        let me = std::process::id() as i32;
        ev.post_to_pid(me);
        true
    })();
    if probe_ok {
        CACHED_OK.store(true, Ordering::Relaxed);
    }
    probe_ok
}

/// Best-effort check for "host has been granted Accessibility access".
/// We re-implement it locally rather than depending on the
/// `permissions::accessibility` module so this file stays unit-testable
/// outside the broader desktop app.
fn accessibility_is_trusted() -> bool {
    // Re-declared with the same loosely-typed signature used elsewhere in
    // this crate (`desktop_host.rs`) to avoid a clashing-extern warning.
    unsafe extern "C" {
        fn AXIsProcessTrustedWithOptions(options: *const std::ffi::c_void) -> bool;
    }
    // We pass NULL options so we never auto-prompt the user — explicit
    // permission-prompting lives in the existing `permissions` module.
    unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) }
}

fn private_source(label: &str) -> VoidResult<CGEventSource> {
    CGEventSource::new(CGEventSourceStateID::Private)
        .map_err(|_| VoidError::tool(format!("CGEventSource::Private failed ({})", label)))
}

/// Compose modifier flags for a chord.
fn flags_from(mods: &[BgModifier]) -> CGEventFlags {
    mods.iter()
        .fold(CGEventFlags::CGEventFlagNull, |acc, m| acc | m.flag())
}

fn post_with_dual_fallback(
    pid: i32,
    event: &CGEvent,
    kind: crate::computer_use::macos_dual_post::MacosPostKind,
) {
    let event_ptr = event.as_ptr() as *mut c_void;
    let skylight_posted = crate::computer_use::macos_skylight::post_to_pid(
        pid,
        event_ptr,
        kind.attach_auth_message(),
    );
    if crate::computer_use::macos_dual_post::public_fallback_after_skylight(kind, skylight_posted)
        == crate::computer_use::macos_dual_post::PublicFallback::PostPublic
    {
        event.post_to_pid(pid);
    }
}

fn post_both_mouse(pid: i32, event: &CGEvent) {
    post_with_dual_fallback(
        pid,
        event,
        crate::computer_use::macos_dual_post::MacosPostKind::Mouse,
    );
}

fn post_both_keyboard(pid: i32, event: &CGEvent) {
    post_with_dual_fallback(
        pid,
        event,
        crate::computer_use::macos_dual_post::MacosPostKind::KeyboardAuth,
    );
}

fn post_both_keyboard_no_auth(pid: i32, event: &CGEvent) {
    post_with_dual_fallback(
        pid,
        event,
        crate::computer_use::macos_dual_post::MacosPostKind::KeyboardNoAuth,
    );
}

/// Send a click (down + up, possibly multi-click) at the given **global**
/// pointer position to the target pid. The user's real cursor is NOT moved
/// because we never call `CGWarpMouseCursorPosition` and the synthesized
/// event's `MouseMoved` predecessor is also pid-scoped.
///
/// `point` is in Quartz global pointer coordinates (origin top-left of main
/// display, same space as the existing screenshot pipeline).
pub fn bg_click(
    pid: i32,
    point: (f64, f64),
    button: BgMouseButton,
    click_count: u32,
    modifiers: &[BgModifier],
) -> VoidResult<()> {
    if click_count == 0 {
        return Ok(());
    }
    let pt = CGPoint {
        x: point.0,
        y: point.1,
    };
    let flags = flags_from(modifiers);
    let self_pid = std::process::id() as i32;
    let frontmost = frontmost_pid_macos();
    let started = Instant::now();
    info!(
        target: "computer_use::bg_input",
        "bg_click.enter pid={} self_pid={} same_process={} frontmost_pid={:?} is_frontmost={} x={:.2} y={:.2} button={:?} click_count={} modifiers={:?}",
        pid,
        self_pid,
        pid == self_pid,
        frontmost,
        Some(pid) == frontmost,
        point.0,
        point.1,
        button,
        click_count,
        modifiers
    );
    // Codex parity: a *single* `CGEventSource` is shared across the whole
    // gesture so the kernel-side modifier latch state stays consistent
    // between MouseMoved / Down / Up. Allocating a fresh source per event
    // (the previous shape) caused some Cocoa apps (notably Chromium-based
    // webviews and SwiftUI text fields) to drop modifier flags between the
    // down and up events and either select text or miss the chord entirely.
    let src = match private_source("click") {
        Ok(s) => s,
        Err(e) => {
            warn!(target: "computer_use::bg_input", "bg_click.private_source_failed pid={} error={}", pid, e);
            return Err(e);
        }
    };

    // Pre-position the synthetic pointer inside the app's event queue so AX
    // hit-testing in the target app sees the right coordinates. Does NOT
    // move the user's real cursor because we post pid-scoped, not global.
    let mv = CGEvent::new_mouse_event(src.clone(), CGEventType::MouseMoved, pt, button.cg())
        .map_err(|_| VoidError::tool("CGEvent MouseMoved failed".to_string()))?;
    if !flags.is_empty() {
        mv.set_flags(flags);
    }
    post_both_mouse(pid, &mv);

    for i in 1..=click_count {
        let down = CGEvent::new_mouse_event(src.clone(), button.down(), pt, button.cg())
            .map_err(|_| VoidError::tool("CGEvent MouseDown failed".to_string()))?;
        // Click count field lets the target app recognise double / triple
        // clicks within its own quench-time window.
        down.set_integer_value_field(
            core_graphics::event::EventField::MOUSE_EVENT_CLICK_STATE,
            i as i64,
        );
        if !flags.is_empty() {
            down.set_flags(flags);
        }
        post_both_mouse(pid, &down);

        let up = CGEvent::new_mouse_event(src.clone(), button.up(), pt, button.cg())
            .map_err(|_| VoidError::tool("CGEvent MouseUp failed".to_string()))?;
        up.set_integer_value_field(
            core_graphics::event::EventField::MOUSE_EVENT_CLICK_STATE,
            i as i64,
        );
        if !flags.is_empty() {
            up.set_flags(flags);
        }
        post_both_mouse(pid, &up);
    }
    info!(
        target: "computer_use::bg_input",
        "bg_click.posted pid={} elapsed_ms={}",
        pid,
        started.elapsed().as_millis() as u64
    );
    Ok(())
}

/// Send a PID-scoped background drag gesture to the target app.
///
/// This is an adapter primitive only. It is deliberately not wired into the
/// host/tool drag route until a separate route contract and macOS smoke exist.
pub fn bg_drag(
    pid: i32,
    from: (f64, f64),
    to: (f64, f64),
    duration_ms: u64,
    steps: usize,
    modifiers: &[BgModifier],
    button: BgDragButton,
) -> VoidResult<()> {
    let plan = crate::computer_use::macos_pointer_parity_plan::plan_drag(
        button.plan_button(),
        steps,
        duration_ms,
    );
    let src = private_source("drag")?;
    let flags = flags_from(modifiers);
    let cg_button = button.cg();
    let step_delay_ms = plan.step_delay_ms;

    for event in plan.events {
        let point = match event.kind {
            crate::computer_use::macos_pointer_parity_plan::MacosPointerEventKind::Down => from,
            crate::computer_use::macos_pointer_parity_plan::MacosPointerEventKind::Drag
            | crate::computer_use::macos_pointer_parity_plan::MacosPointerEventKind::Up => {
                crate::computer_use::macos_pointer_parity_plan::interpolate_point(from, to, event.t)
            }
        };
        let event_type = match event.kind {
            crate::computer_use::macos_pointer_parity_plan::MacosPointerEventKind::Down => {
                button.down()
            }
            crate::computer_use::macos_pointer_parity_plan::MacosPointerEventKind::Drag => {
                button.dragged()
            }
            crate::computer_use::macos_pointer_parity_plan::MacosPointerEventKind::Up => {
                button.up()
            }
        };
        let cg_event = CGEvent::new_mouse_event(
            src.clone(),
            event_type,
            CGPoint {
                x: point.0,
                y: point.1,
            },
            cg_button,
        )
        .map_err(|_| VoidError::tool(format!("drag: {:?} event failed", event.kind)))?;
        if !flags.is_empty() {
            cg_event.set_flags(flags);
        }
        post_both_mouse(pid, &cg_event);
        if matches!(
            event.kind,
            crate::computer_use::macos_pointer_parity_plan::MacosPointerEventKind::Drag
        ) && step_delay_ms > 0
        {
            thread::sleep(Duration::from_millis(step_delay_ms));
        }
    }

    info!(
        target: "computer_use::bg_input",
        "bg_drag.posted pid={} from=({:.0},{:.0}) to=({:.0},{:.0}) button={:?}",
        pid, from.0, from.1, to.0, to.1, button
    );
    Ok(())
}

fn stamp_chromium_fields(
    event: &CGEvent,
    pid: i32,
    window_id: u32,
    click_group_id: i64,
    recipe_event: crate::computer_use::macos_chromium_click_plan::ChromiumClickRecipeEvent,
    window_local: Option<(f64, f64)>,
) -> bool {
    let ptr = event.as_ptr() as *mut c_void;
    for (field, value) in
        crate::computer_use::macos_chromium_click_plan::chromium_click_event_fields(
            pid,
            window_id,
            click_group_id,
            recipe_event,
        )
    {
        if !crate::computer_use::macos_skylight::set_integer_field(ptr, field, value) {
            return false;
        }
    }
    if let Some((x, y)) = window_local {
        if !crate::computer_use::macos_skylight::set_window_location(ptr, x, y) {
            return false;
        }
    }
    true
}

pub fn bg_click_chromium(
    pid: i32,
    screen_x: f64,
    screen_y: f64,
    win_local_x: f64,
    win_local_y: f64,
    window_id: u32,
    click_count: u32,
    modifiers: &[BgModifier],
) -> VoidResult<()> {
    use std::time::{SystemTime, UNIX_EPOCH};

    if click_count == 0 {
        return Ok(());
    }

    let src = private_source("click_chromium")?;
    let target = CGPoint {
        x: screen_x,
        y: screen_y,
    };
    let offscreen = CGPoint { x: -1.0, y: -1.0 };
    let flags = flags_from(modifiers);
    let click_group_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as i64;

    for event in
        crate::computer_use::macos_chromium_click_plan::chromium_click_recipe_events(click_count)
    {
        let point = match event.target {
            crate::computer_use::macos_chromium_click_plan::ChromiumClickEventTarget::Target => {
                target
            }
            crate::computer_use::macos_chromium_click_plan::ChromiumClickEventTarget::OffscreenPrimer => {
                offscreen
            }
        };
        let event_type = match event.kind {
            crate::computer_use::macos_chromium_click_plan::ChromiumClickEventKind::Move => {
                CGEventType::MouseMoved
            }
            crate::computer_use::macos_chromium_click_plan::ChromiumClickEventKind::Down => {
                CGEventType::LeftMouseDown
            }
            crate::computer_use::macos_chromium_click_plan::ChromiumClickEventKind::Up => {
                CGEventType::LeftMouseUp
            }
        };
        let local = match event.target {
            crate::computer_use::macos_chromium_click_plan::ChromiumClickEventTarget::Target => {
                (win_local_x, win_local_y)
            }
            crate::computer_use::macos_chromium_click_plan::ChromiumClickEventTarget::OffscreenPrimer => {
                (-1.0, -1.0)
            }
        };
        let cg_event =
            CGEvent::new_mouse_event(src.clone(), event_type, point, CGMouseButton::Left).map_err(
                |_| {
                    VoidError::tool(format!(
                        "Chromium click: failed to create {:?} event",
                        event.kind
                    ))
                },
            )?;
        if !stamp_chromium_fields(
            &cg_event,
            pid,
            window_id,
            click_group_id,
            event,
            Some(local),
        ) {
            return Err(VoidError::tool(
                "[CHROMIUM_CLICK_STAMP_UNAVAILABLE] Chromium background click requires SkyLight integer field and window-local event stamping; falling back to generic click."
                    .to_string(),
            ));
        }
        if !flags.is_empty() {
            cg_event.set_flags(flags);
        }
        post_both_mouse(pid, &cg_event);

        match (event.kind, event.target) {
            (
                crate::computer_use::macos_chromium_click_plan::ChromiumClickEventKind::Move,
                crate::computer_use::macos_chromium_click_plan::ChromiumClickEventTarget::Target,
            ) => thread::sleep(Duration::from_millis(15)),
            (
                crate::computer_use::macos_chromium_click_plan::ChromiumClickEventKind::Down,
                crate::computer_use::macos_chromium_click_plan::ChromiumClickEventTarget::OffscreenPrimer,
            )
            | (
                crate::computer_use::macos_chromium_click_plan::ChromiumClickEventKind::Down,
                crate::computer_use::macos_chromium_click_plan::ChromiumClickEventTarget::Target,
            ) => thread::sleep(Duration::from_millis(1)),
            (
                crate::computer_use::macos_chromium_click_plan::ChromiumClickEventKind::Up,
                crate::computer_use::macos_chromium_click_plan::ChromiumClickEventTarget::OffscreenPrimer,
            ) => thread::sleep(Duration::from_millis(100)),
            _ => {}
        }
    }

    info!(
        target: "computer_use::bg_input",
        "bg_click_chromium.posted pid={} window_id={} x={:.2} y={:.2} click_count={}",
        pid,
        window_id,
        screen_x,
        screen_y,
        click_count.min(2)
    );
    Ok(())
}

pub fn is_chromium_electron(bundle_id: Option<&str>) -> bool {
    bundle_id
        .map(crate::computer_use::macos_chromium_click_plan::is_chromium_electron_bundle_id)
        .unwrap_or(false)
}

pub fn bundle_id_for_pid(pid: i32) -> Option<String> {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use std::ffi::CStr;
    use std::os::raw::c_char;

    unsafe {
        let cls = objc2::runtime::AnyClass::get(c"NSRunningApplication")?;
        let app: *mut AnyObject = msg_send![cls, runningApplicationWithProcessIdentifier: pid];
        if app.is_null() {
            return None;
        }
        let bundle: *mut AnyObject = msg_send![app, bundleIdentifier];
        if bundle.is_null() {
            return None;
        }
        let raw: *const c_char = msg_send![bundle, UTF8String];
        if raw.is_null() {
            return None;
        }
        CStr::from_ptr(raw).to_str().ok().map(str::to_string)
    }
}

/// Best-effort lookup of the macOS frontmost-application pid via NSWorkspace.
/// Returns `None` when the AppKit lookup is not available (e.g. headless tests
/// or non-main-thread contexts where we don't want to assert).
fn frontmost_pid_macos() -> Option<i32> {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    unsafe {
        let cls = objc2::runtime::AnyClass::get(c"NSWorkspace")?;
        let ws: *mut AnyObject = msg_send![cls, sharedWorkspace];
        if ws.is_null() {
            return None;
        }
        let app: *mut AnyObject = msg_send![ws, frontmostApplication];
        if app.is_null() {
            return None;
        }
        let pid: i32 = msg_send![app, processIdentifier];
        if pid <= 0 {
            None
        } else {
            Some(pid)
        }
    }
}

/// Best-effort: bring `pid`'s app to the foreground so that GUI hit-testing
/// (especially WKWebView event delivery) reliably routes synthetic clicks
/// to the right window. Uses the public NSRunningApplication API.
///
/// Returns `Ok(true)` when the activation call returned success, `Ok(false)`
/// when the app could not be found, and `Err(_)` on AppKit FFI failures.
pub fn activate_pid_macos(pid: i32) -> VoidResult<bool> {
    activate_pid_macos_with_window(pid, frontmost_window_id_for_pid(pid))
}

pub fn activate_pid_macos_with_window(pid: i32, window_id: Option<u32>) -> VoidResult<bool> {
    let focus_without_raise_available =
        crate::computer_use::macos_skylight::is_focus_without_raise_available();
    let plan = crate::computer_use::macos_focus_plan::plan_focus_activation(
        window_id,
        focus_without_raise_available,
        true,
    );

    for attempt in plan.attempts {
        match attempt {
            crate::computer_use::macos_focus_plan::MacosFocusAttempt::FocusWithoutRaise {
                window_id,
            } => {
                let ok =
                    crate::computer_use::macos_skylight::activate_without_raise(pid, window_id);
                info!(
                    target: "computer_use::bg_input",
                    "activate_without_raise.done pid={} window_id={} ok={}",
                    pid,
                    window_id,
                    ok
                );
                if crate::computer_use::macos_focus_plan::public_fallback_after_focus_without_raise(
                    ok,
                ) == crate::computer_use::macos_focus_plan::MacosFocusPublicFallback::SkipPublic
                {
                    return Ok(true);
                }
            }
            crate::computer_use::macos_focus_plan::MacosFocusAttempt::PublicActivate => {
                return activate_pid_macos_public(pid);
            }
        }
    }

    Ok(false)
}

fn activate_pid_macos_public(pid: i32) -> VoidResult<bool> {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    let started = Instant::now();
    let result: bool = unsafe {
        let cls = match objc2::runtime::AnyClass::get(c"NSRunningApplication") {
            Some(c) => c,
            None => {
                debug!(target: "computer_use::bg_input", "activate.class_missing pid={}", pid);
                return Ok(false);
            }
        };
        let app: *mut AnyObject = msg_send![cls, runningApplicationWithProcessIdentifier: pid];
        if app.is_null() {
            debug!(target: "computer_use::bg_input", "activate.app_not_found pid={}", pid);
            return Ok(false);
        }
        // 1<<1 == NSApplicationActivateIgnoringOtherApps
        let ok: bool = msg_send![app, activateWithOptions: 1u64 << 1];
        ok
    };
    info!(
        target: "computer_use::bg_input",
        "activate.done pid={} ok={} elapsed_ms={}",
        pid,
        result,
        started.elapsed().as_millis() as u64
    );
    Ok(result)
}

pub fn frontmost_window_id_for_pid(pid: i32) -> Option<u32> {
    use core_foundation::array::CFArray;
    use core_foundation::base::{CFGetTypeID, CFTypeRef, TCFType};
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;

    let raw_ref = unsafe {
        CGWindowListCopyWindowInfo(
            K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY | K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS,
            K_CG_NULL_WINDOW_ID,
        )
    };
    if raw_ref.is_null() {
        return None;
    }
    let array: CFArray<CFTypeRef> = unsafe { CFArray::wrap_under_create_rule(raw_ref as _) };
    let dict_type_id = CFDictionary::<*const c_void, *const c_void>::type_id();

    for item in array.iter() {
        let item = *item;
        if unsafe { CFGetTypeID(item) } != dict_type_id {
            continue;
        }
        let dict: CFDictionary<*const c_void, *const c_void> =
            unsafe { CFDictionary::wrap_under_get_rule(item as _) };

        let get_num = |key: &str| -> i64 {
            let k = CFString::new(key);
            dict.find(k.as_concrete_TypeRef() as *const c_void)
                .and_then(|v| unsafe {
                    let v = *v;
                    if CFGetTypeID(v) == CFNumber::type_id() {
                        CFNumber::wrap_under_get_rule(v as _).to_i64()
                    } else {
                        None
                    }
                })
                .unwrap_or(0)
        };

        let owner_pid = get_num("kCGWindowOwnerPID") as i32;
        if owner_pid != pid {
            continue;
        }
        let layer = get_num("kCGWindowLayer") as i32;
        if layer != 0 {
            continue;
        }
        let window_id = get_num("kCGWindowNumber") as u32;
        if window_id != 0 {
            return Some(window_id);
        }
    }

    None
}

/// Pixel-delta scroll inside the focused scroll container of the target
/// pid's frontmost window. Positive `dy` scrolls content down (matches
/// trackpad / `wheel1>0` direction).
pub fn bg_scroll(pid: i32, dx: i32, dy: i32) -> VoidResult<()> {
    info!(
        target: "computer_use::bg_input",
        "bg_scroll.enter pid={} dx={} dy={}",
        pid, dx, dy
    );
    let src = private_source("scroll")?;
    // Two-axis pixel scroll (`wheelCount = 2`): wheel1 = dy, wheel2 = dx.
    // Sign convention matches the system trackpad (positive dy = content
    // moves down on screen, i.e. user is looking further into the document).
    let ev = CGEvent::new_scroll_event(src, ScrollEventUnit::PIXEL, 2, dy, dx, 0)
        .map_err(|_| VoidError::tool("CGEventCreateScrollWheelEvent2 failed".to_string()))?;
    post_both_mouse(pid, &ev);
    Ok(())
}

/// Type a UTF-8 string into the focused control of the target pid using the
/// `kCGEventKeyboardEventUnicodeString` field. This bypasses keymap
/// translation entirely, so it correctly handles emoji, CJK and other
/// non-Latin input without touching the system IME.
pub fn bg_type_text(pid: i32, text: &str) -> VoidResult<()> {
    if text.is_empty() {
        return Ok(());
    }
    info!(
        target: "computer_use::bg_input",
        "bg_type_text.enter pid={} char_count={} byte_count={}",
        pid,
        text.chars().count(),
        text.len()
    );
    // Single source for the whole string (Codex parity): keeps the kernel
    // keyboard state coherent and avoids the per-char allocation cost.
    let src = private_source("type_text")?;
    // We send one event per Unicode scalar to keep individual events small
    // and let the target app receive a sane stream of `keyDown` callbacks.
    // (`set_string` itself will accept a longer buffer, but some Cocoa text
    // controls truncate at ~20 UTF-16 units per event.)
    for ch in text.chars() {
        // Keycode 0 is irrelevant when the unicode string field is set.
        let ev = CGEvent::new_keyboard_event(src.clone(), 0, true)
            .map_err(|_| VoidError::tool("CGEventCreateKeyboardEvent failed".to_string()))?;
        let buf: Vec<u16> = ch.encode_utf16(&mut [0u16; 2]).to_vec();
        ev.set_string_from_utf16_unchecked(&buf);
        post_both_keyboard(pid, &ev);
        // Match keyup so the target app sees a complete keystroke.
        let ev2 = CGEvent::new_keyboard_event(src.clone(), 0, false)
            .map_err(|_| VoidError::tool("CGEventCreateKeyboardEvent (up) failed".to_string()))?;
        ev2.set_string_from_utf16_unchecked(&buf);
        post_both_keyboard(pid, &ev2);
        // 8ms inter-key gap matches Codex / native typing rates and avoids
        // dropped chars in Chromium webviews and SwiftUI multi-line fields
        // that throttle their keystroke handler. 1ms (the previous value)
        // was reliably losing ~5–10% of CJK glyphs in informal smoke tests.
        thread::sleep(Duration::from_millis(8));
    }
    Ok(())
}

fn macos_app_identity_for_pid(pid: i32) -> Option<(String, Option<String>)> {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    unsafe {
        let cls = objc2::runtime::AnyClass::get(c"NSRunningApplication")?;
        let app: *mut AnyObject = msg_send![cls, runningApplicationWithProcessIdentifier: pid];
        if app.is_null() {
            return None;
        }

        let name = {
            let value: *mut AnyObject = msg_send![app, localizedName];
            nsstring_to_string(value).unwrap_or_default()
        };
        let bundle_id = {
            let value: *mut AnyObject = msg_send![app, bundleIdentifier];
            nsstring_to_string(value)
        };

        Some((name, bundle_id))
    }
}

unsafe fn nsstring_to_string(value: *mut objc2::runtime::AnyObject) -> Option<String> {
    if value.is_null() {
        return None;
    }
    let utf8: *const std::os::raw::c_char = unsafe { objc2::msg_send![value, UTF8String] };
    if utf8.is_null() {
        return None;
    }
    Some(
        unsafe { std::ffi::CStr::from_ptr(utf8) }
            .to_string_lossy()
            .into_owned(),
    )
}

pub fn is_terminal_emulator(pid: i32) -> bool {
    let Some((name, bundle_id)) = macos_app_identity_for_pid(pid) else {
        return false;
    };
    crate::computer_use::terminal_detect::route_for_type_text(&name, bundle_id.as_deref(), "macos")
        == crate::computer_use::terminal_detect::TerminalRoute::KeyEvent
}

pub fn bg_type_text_terminal_safe(pid: i32, text: &str) -> VoidResult<()> {
    if text.is_empty() {
        return Ok(());
    }
    info!(
        target: "computer_use::bg_input",
        "bg_type_text_terminal_safe.enter pid={} char_count={}",
        pid,
        text.chars().count()
    );

    let src = private_source("type_text_terminal")?;
    for ch in text.chars() {
        let terminal_key = crate::computer_use::terminal_detect::macos_terminal_key_for_char(ch);
        let flags = if terminal_key.map(|key| key.shift).unwrap_or(false) {
            flags_from(&[BgModifier::Shift])
        } else {
            CGEventFlags::CGEventFlagNull
        };

        if let Some(terminal_key) = terminal_key {
            let down = CGEvent::new_keyboard_event(src.clone(), terminal_key.keycode, true)
                .map_err(|_| VoidError::tool("terminal type: keydown failed".to_string()))?;
            if flags != CGEventFlags::CGEventFlagNull {
                down.set_flags(flags);
            }
            down.post_to_pid(pid);
            thread::sleep(Duration::from_millis(8));

            let up = CGEvent::new_keyboard_event(src.clone(), terminal_key.keycode, false)
                .map_err(|_| VoidError::tool("terminal type: keyup failed".to_string()))?;
            if flags != CGEventFlags::CGEventFlagNull {
                up.set_flags(flags);
            }
            up.post_to_pid(pid);
            thread::sleep(Duration::from_millis(8));
        } else {
            let buf: Vec<u16> = ch.encode_utf16(&mut [0u16; 2]).to_vec();
            let down = CGEvent::new_keyboard_event(src.clone(), 0, true)
                .map_err(|_| VoidError::tool("terminal type: unicode down failed".to_string()))?;
            down.set_string_from_utf16_unchecked(&buf);
            down.post_to_pid(pid);
            thread::sleep(Duration::from_millis(8));

            let up = CGEvent::new_keyboard_event(src.clone(), 0, false)
                .map_err(|_| VoidError::tool("terminal type: unicode up failed".to_string()))?;
            up.set_string_from_utf16_unchecked(&buf);
            up.post_to_pid(pid);
            thread::sleep(Duration::from_millis(8));
        }
    }
    Ok(())
}

pub fn bg_type_text_auto(pid: i32, text: &str) -> VoidResult<()> {
    if is_terminal_emulator(pid) {
        debug!(
            target: "computer_use::bg_input",
            "bg_type_text_auto: pid={} detected as terminal-like target, using key-event typing",
            pid
        );
        bg_type_text_terminal_safe(pid, text)
    } else {
        bg_type_text(pid, text)
    }
}

/// Send a key chord (modifier+key combo) to the target pid using the
/// private event source. `key` is the AX / Carbon virtual keycode; callers
/// can use `keycode_for_char` for ASCII letters or pass a literal keycode.
pub fn bg_key_chord(pid: i32, modifiers: &[BgModifier], key: u16) -> VoidResult<()> {
    info!(
        target: "computer_use::bg_input",
        "bg_key_chord.enter pid={} keycode={} modifiers={:?}",
        pid, key, modifiers
    );
    let flags = flags_from(modifiers);
    // Single source across the whole chord — required for the modifier
    // latch state to survive between mod_down → key_down → key_up → mod_up.
    let src = private_source("key_chord")?;

    // Press modifiers.
    for m in modifiers {
        let ev = CGEvent::new_keyboard_event(src.clone(), m.keycode(), true)
            .map_err(|_| VoidError::tool("CGEvent ModDown failed".to_string()))?;
        ev.set_flags(flags);
        post_both_keyboard(pid, &ev);
    }
    // Press main key.
    {
        let ev = CGEvent::new_keyboard_event(src.clone(), key, true)
            .map_err(|_| VoidError::tool("CGEvent KeyDown failed".to_string()))?;
        ev.set_flags(flags);
        post_both_keyboard(pid, &ev);
    }
    {
        let ev = CGEvent::new_keyboard_event(src.clone(), key, false)
            .map_err(|_| VoidError::tool("CGEvent KeyUp failed".to_string()))?;
        ev.set_flags(flags);
        post_both_keyboard(pid, &ev);
    }
    // Release modifiers in reverse press order.
    for m in modifiers.iter().rev() {
        let ev = CGEvent::new_keyboard_event(src.clone(), m.keycode(), false)
            .map_err(|_| VoidError::tool("CGEvent ModUp failed".to_string()))?;
        // Drop this modifier from the flag set as we release it.
        let remaining = modifiers
            .iter()
            .copied()
            .filter(|x| x != m)
            .collect::<Vec<_>>();
        ev.set_flags(flags_from(&remaining));
        post_both_keyboard(pid, &ev);
    }
    Ok(())
}

/// Send a key chord to `pid` without the SkyLight auth-message envelope.
///
/// This is a distinct adapter primitive for AppKit menu-equivalent smoke and
/// future route policy. The default host `app_key_chord` path intentionally
/// continues to use `bg_key_chord`.
pub fn bg_key_chord_no_auth(pid: i32, modifiers: &[BgModifier], key: u16) -> VoidResult<()> {
    debug_assert!(
        !crate::computer_use::macos_key_parity_plan::post_mode_uses_auth_message(
            crate::computer_use::macos_key_parity_plan::MacosKeyChordPostMode::NoAuth,
        )
    );
    info!(
        target: "computer_use::bg_input",
        "bg_key_chord_no_auth.enter pid={} keycode={} modifiers={:?}",
        pid, key, modifiers
    );
    let flags = flags_from(modifiers);
    let src = private_source("key_chord_no_auth")?;

    for m in modifiers {
        let ev = CGEvent::new_keyboard_event(src.clone(), m.keycode(), true)
            .map_err(|_| VoidError::tool("CGEvent ModDown (no_auth) failed".to_string()))?;
        ev.set_flags(flags);
        post_both_keyboard_no_auth(pid, &ev);
    }
    {
        let ev = CGEvent::new_keyboard_event(src.clone(), key, true)
            .map_err(|_| VoidError::tool("CGEvent KeyDown (no_auth) failed".to_string()))?;
        ev.set_flags(flags);
        post_both_keyboard_no_auth(pid, &ev);
    }
    {
        let ev = CGEvent::new_keyboard_event(src.clone(), key, false)
            .map_err(|_| VoidError::tool("CGEvent KeyUp (no_auth) failed".to_string()))?;
        ev.set_flags(flags);
        post_both_keyboard_no_auth(pid, &ev);
    }
    for m in modifiers.iter().rev() {
        let ev = CGEvent::new_keyboard_event(src.clone(), m.keycode(), false)
            .map_err(|_| VoidError::tool("CGEvent ModUp (no_auth) failed".to_string()))?;
        let remaining = modifiers
            .iter()
            .copied()
            .filter(|x| x != m)
            .collect::<Vec<_>>();
        ev.set_flags(flags_from(&remaining));
        post_both_keyboard_no_auth(pid, &ev);
    }
    Ok(())
}

/// Parse a key spec the dispatch layer might pass us, of the form
/// `"command+shift+p"` / `"return"` / `"escape"` / `"a"`. Returns the
/// modifier list and the resolved keycode.
pub fn parse_key_spec(spec: &str) -> VoidResult<(Vec<BgModifier>, u16)> {
    let mut mods = Vec::new();
    let parts: Vec<&str> = spec.split('+').map(str::trim).collect();
    if parts.is_empty() {
        return Err(VoidError::tool("empty key spec".to_string()));
    }
    let (last, head) = parts.split_last().unwrap();
    for p in head {
        let m = BgModifier::from_str(p)
            .ok_or_else(|| VoidError::tool(format!("unknown modifier in key spec: {}", p)))?;
        mods.push(m);
    }
    let kc = keycode_for_named(last)
        .or_else(|| {
            // Single-char ASCII fallback.
            let mut chars = last.chars();
            let c = chars.next()?;
            if chars.next().is_some() {
                return None;
            }
            keycode_for_char(c)
        })
        .ok_or_else(|| VoidError::tool(format!("unknown key in key spec: {}", last)))?;
    Ok((mods, kc))
}

/// Parse the ControlHub/Codex chord shape: `["command", "shift", "p"]`,
/// `["command+shift+p"]`, or `["return"]`.
pub fn parse_key_sequence(keys: &[String]) -> VoidResult<(Vec<BgModifier>, u16)> {
    if keys.is_empty() {
        return Err(VoidError::tool("empty key sequence".to_string()));
    }
    if keys.len() == 1 {
        return parse_key_spec(&keys[0]);
    }

    let (last, head) = keys.split_last().unwrap();
    let mut mods = Vec::with_capacity(head.len());
    for p in head {
        let m = BgModifier::from_str(p)
            .ok_or_else(|| VoidError::tool(format!("unknown modifier in key sequence: {}", p)))?;
        mods.push(m);
    }
    let kc = keycode_for_named(last)
        .or_else(|| {
            let mut chars = last.chars();
            let c = chars.next()?;
            if chars.next().is_some() {
                return None;
            }
            keycode_for_char(c)
        })
        .ok_or_else(|| VoidError::tool(format!("unknown key in key sequence: {}", last)))?;
    Ok((mods, kc))
}

/// Map common named keys (Codex parity) to AX / Carbon keycodes.
pub fn keycode_for_named(name: &str) -> Option<u16> {
    Some(match name.to_ascii_lowercase().as_str() {
        "return" | "enter" => 36,
        "tab" => 48,
        "space" => 49,
        "delete" | "backspace" => 51,
        "escape" | "esc" => 53,
        "left" => 123,
        "right" => 124,
        "down" => 125,
        "up" => 126,
        "home" => 115,
        "end" => 119,
        "pageup" | "page_up" => 116,
        "pagedown" | "page_down" => 121,
        "f1" => 122,
        "f2" => 120,
        "f3" => 99,
        "f4" => 118,
        "f5" => 96,
        "f6" => 97,
        "f7" => 98,
        "f8" => 100,
        "f9" => 101,
        "f10" => 109,
        "f11" => 103,
        "f12" => 111,
        _ => return None,
    })
}

/// Map a single ASCII character to the **US-keyboard** keycode. This is the
/// same table Codex / enigo use; the user's actual keymap is irrelevant for
/// our chord injection because we set explicit modifier flags ourselves.
pub fn keycode_for_char(c: char) -> Option<u16> {
    let upper = c.to_ascii_uppercase();
    Some(match upper {
        'A' => 0,
        'S' => 1,
        'D' => 2,
        'F' => 3,
        'H' => 4,
        'G' => 5,
        'Z' => 6,
        'X' => 7,
        'C' => 8,
        'V' => 9,
        'B' => 11,
        'Q' => 12,
        'W' => 13,
        'E' => 14,
        'R' => 15,
        'Y' => 16,
        'T' => 17,
        '1' => 18,
        '2' => 19,
        '3' => 20,
        '4' => 21,
        '6' => 22,
        '5' => 23,
        '=' => 24,
        '9' => 25,
        '7' => 26,
        '-' => 27,
        '8' => 28,
        '0' => 29,
        ']' => 30,
        'O' => 31,
        'U' => 32,
        '[' => 33,
        'I' => 34,
        'P' => 35,
        'L' => 37,
        'J' => 38,
        '\'' => 39,
        'K' => 40,
        ';' => 41,
        '\\' => 42,
        ',' => 43,
        '/' => 44,
        'N' => 45,
        'M' => 46,
        '.' => 47,
        '`' => 50,
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_key_spec_command_shift_p() {
        let (mods, key) = parse_key_spec("command+shift+p").unwrap();
        assert_eq!(mods, vec![BgModifier::Command, BgModifier::Shift]);
        assert_eq!(key, 35);
    }

    #[test]
    fn parse_key_spec_named_return() {
        let (mods, key) = parse_key_spec("return").unwrap();
        assert!(mods.is_empty());
        assert_eq!(key, 36);
    }

    #[test]
    fn parse_key_spec_aliases() {
        let (mods, _) = parse_key_spec("cmd+opt+a").unwrap();
        assert_eq!(mods, vec![BgModifier::Command, BgModifier::Option]);
    }

    #[test]
    fn parse_key_sequence_array_chord() {
        let keys = vec!["command".to_string(), "shift".to_string(), "p".to_string()];
        let (mods, key) = parse_key_sequence(&keys).unwrap();
        assert_eq!(mods, vec![BgModifier::Command, BgModifier::Shift]);
        assert_eq!(key, 35);
    }

    #[test]
    fn parse_key_sequence_single_plus_spec() {
        let keys = vec!["command+f".to_string()];
        let (mods, key) = parse_key_sequence(&keys).unwrap();
        assert_eq!(mods, vec![BgModifier::Command]);
        assert_eq!(key, 3);
    }

    #[test]
    fn modifier_from_str_aliases() {
        assert_eq!(BgModifier::from_str("CMD"), Some(BgModifier::Command));
        assert_eq!(BgModifier::from_str("control"), Some(BgModifier::Control));
        assert_eq!(BgModifier::from_str("alt"), Some(BgModifier::Option));
        assert_eq!(BgModifier::from_str("fn"), None);
        assert_eq!(BgModifier::from_str("zzz"), None);
    }

    #[test]
    fn flags_from_combines() {
        let f = flags_from(&[BgModifier::Command, BgModifier::Shift]);
        assert!(f.contains(CGEventFlags::CGEventFlagCommand));
        assert!(f.contains(CGEventFlags::CGEventFlagShift));
        assert!(!f.contains(CGEventFlags::CGEventFlagControl));
    }

    #[test]
    fn fn_modifier_flag_and_keycode() {
        assert_eq!(BgModifier::Fn.flag(), CGEventFlags::CGEventFlagSecondaryFn);
        assert_eq!(BgModifier::Fn.keycode(), 63);
    }
}
