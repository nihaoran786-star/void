//! Windows background input adapter foundation.

#![cfg(target_os = "windows")]
#![allow(dead_code)]

use std::ffi::c_void;
use std::sync::{Mutex, MutexGuard, TryLockError};
use std::thread::sleep;
use std::time::{Duration, Instant};

use void_core::util::errors::{VoidError, VoidResult};
use windows::Win32::Foundation::{FALSE, HWND, LPARAM, POINT, TRUE, WPARAM};
use windows::Win32::Graphics::Dwm::{DWMWA_CLOAK, DwmSetWindowAttribute};
use windows::Win32::Graphics::Gdi::{ClientToScreen, ScreenToClient};
use windows::Win32::UI::WindowsAndMessaging::{
    CWP_SKIPDISABLED, CWP_SKIPINVISIBLE, CWP_SKIPTRANSPARENT, ChildWindowFromPointEx,
    GetClassNameW, GetForegroundWindow, GetWindowThreadProcessId, IsChild, PostMessageW,
    SB_LINEDOWN, SB_LINELEFT, SB_LINERIGHT, SB_LINEUP, SetForegroundWindow, WM_CHAR, WM_HSCROLL,
    WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEMOVE,
    WM_RBUTTONDOWN, WM_RBUTTONUP, WM_VSCROLL, WindowFromPoint,
};
use windows_core::BOOL;

type Handle = *mut c_void;

const INPUT_KEYBOARD: u32 = 1;
const KEYEVENTF_UNICODE: u32 = 0x0004;
const KEYEVENTF_KEYUP: u32 = 0x0002;
const MAPVK_VK_TO_VSC: u32 = 0;

const VK_BACKSPACE: u16 = 0x08;
const VK_TAB: u16 = 0x09;
const VK_RETURN: u16 = 0x0D;
const VK_SHIFT: u16 = 0x10;
const VK_CONTROL: u16 = 0x11;
const VK_MENU: u16 = 0x12;
const VK_ESCAPE: u16 = 0x1B;
const VK_SPACE: u16 = 0x20;
const VK_PRIOR: u16 = 0x21;
const VK_NEXT: u16 = 0x22;
const VK_END: u16 = 0x23;
const VK_HOME: u16 = 0x24;
const VK_LEFT: u16 = 0x25;
const VK_UP: u16 = 0x26;
const VK_RIGHT: u16 = 0x27;
const VK_DOWN: u16 = 0x28;
const VK_INSERT: u16 = 0x2D;
const VK_DELETE: u16 = 0x2E;
const VK_LWIN: u16 = 0x5B;
const VK_CAPITAL: u16 = 0x14;
const VK_NUMLOCK: u16 = 0x90;

const WS_EX_NOREDIRECTIONBITMAP: usize = 0x0020_0000;
const GWL_EXSTYLE: i32 = -20;
const WM_USER_CUTOFF: u32 = 0x0400;

const TOKEN_QUERY: u32 = 0x0008;
const TOKEN_INTEGRITY_LEVEL_CLASS: u32 = 25;
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;

const MK_LBUTTON: u32 = 0x0001;
const MK_RBUTTON: u32 = 0x0002;
const MK_SHIFT: u32 = 0x0004;
const MK_CONTROL: u32 = 0x0008;
const MK_MBUTTON: u32 = 0x0010;

const CLICK_DELAY_MS: u64 = 35;
const MULTI_CLICK_DELAY_MS: u64 = 80;
const DRAG_ENDPOINT_DELAY_MS: u64 = 35;
const DEEPEST_CHILD_MAX_DEPTH: usize = 16;

mod integrity_level {
    pub const UNTRUSTED: u32 = 0x0000;
    pub const LOW: u32 = 0x1000;
    pub const MEDIUM: u32 = 0x2000;
    pub const MEDIUM_PLUS: u32 = 0x2100;
    pub const HIGH: u32 = 0x3000;
    pub const SYSTEM: u32 = 0x4000;
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InputDeliveryStatus {
    PostedUnknown,
    SentInput,
    BlockedUipi,
    ForegroundUnavailable,
    ForegroundRestoreFailed,
    UnsupportedSurface,
    Win32Error,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WindowsInputOutcome {
    pub status: InputDeliveryStatus,
    pub path: &'static str,
    pub delivery_uncertain: bool,
    pub warning: Option<String>,
}

impl WindowsInputOutcome {
    pub fn posted_unknown(path: &'static str) -> Self {
        Self {
            status: InputDeliveryStatus::PostedUnknown,
            path,
            delivery_uncertain: true,
            warning: Some(
                "PostMessage queued input; Windows may still filter or ignore it.".to_string(),
            ),
        }
    }

    pub fn sent_input(path: &'static str) -> Self {
        Self {
            status: InputDeliveryStatus::SentInput,
            path,
            delivery_uncertain: false,
            warning: None,
        }
    }

    pub fn blocked_uipi(reason: impl Into<String>) -> Self {
        Self {
            status: InputDeliveryStatus::BlockedUipi,
            path: "uipi",
            delivery_uncertain: false,
            warning: Some(reason.into()),
        }
    }

    fn foreground_restore_failed(path: &'static str) -> Self {
        Self {
            status: InputDeliveryStatus::ForegroundRestoreFailed,
            path,
            delivery_uncertain: true,
            warning: Some("Foreground restore failed after cloaked SendInput.".to_string()),
        }
    }

    fn unsupported_surface(path: &'static str, reason: impl Into<String>) -> Self {
        Self {
            status: InputDeliveryStatus::UnsupportedSurface,
            path,
            delivery_uncertain: true,
            warning: Some(reason.into()),
        }
    }

    fn win32_error(path: &'static str, error: impl Into<String>) -> Self {
        Self {
            status: InputDeliveryStatus::Win32Error,
            path,
            delivery_uncertain: true,
            warning: Some(error.into()),
        }
    }
}

fn finalize_cloaked_outcome(
    path: &'static str,
    result: WindowsInputOutcome,
    restored: bool,
) -> WindowsInputOutcome {
    if restored {
        result
    } else {
        WindowsInputOutcome::foreground_restore_failed(path)
    }
}

#[repr(C)]
#[derive(Clone, Copy)]
struct KeybdInput {
    w_vk: u16,
    w_scan: u16,
    dw_flags: u32,
    time: u32,
    dw_extra_info: usize,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct MouseInput {
    dx: i32,
    dy: i32,
    mouse_data: u32,
    dw_flags: u32,
    time: u32,
    dw_extra_info: usize,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct HardwareInput {
    u_msg: u32,
    w_param_l: u16,
    w_param_h: u16,
}

#[repr(C)]
#[derive(Clone, Copy)]
union InputUnion {
    ki: KeybdInput,
    mi: MouseInput,
    hi: HardwareInput,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct InputRecord {
    input_type: u32,
    anonymous: InputUnion,
}

#[repr(C)]
struct SidAndAttributes {
    sid: *mut c_void,
    attributes: u32,
}

#[repr(C)]
struct TokenMandatoryLabel {
    label: SidAndAttributes,
}

#[link(name = "user32")]
unsafe extern "system" {
    fn SendInput(c_inputs: u32, p_inputs: *const InputRecord, cb_size: i32) -> u32;
    fn AttachThreadInput(id_attach: u32, id_attach_to: u32, f_attach: i32) -> i32;
    fn MapVirtualKeyW(code: u32, map_type: u32) -> u32;
    fn VkKeyScanW(ch: u16) -> i16;
    fn GetWindowLongPtrW(hwnd: isize, nindex: i32) -> isize;
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetCurrentThreadId() -> u32;
    fn GetCurrentProcess() -> Handle;
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
    fn QueryFullProcessImageNameW(handle: Handle, flags: u32, buf: *mut u16, len: *mut u32) -> i32;
    fn CloseHandle(h: Handle) -> i32;
}

#[link(name = "advapi32")]
unsafe extern "system" {
    fn OpenProcessToken(handle: Handle, access: u32, token: *mut Handle) -> i32;
    fn GetTokenInformation(
        handle: Handle,
        class: u32,
        buf: *mut u8,
        len: u32,
        ret_len: *mut u32,
    ) -> i32;
    fn GetSidSubAuthorityCount(sid: *const c_void) -> *mut u8;
    fn GetSidSubAuthority(sid: *const c_void, index: u32) -> *mut u32;
}

static FG_SERIAL: Mutex<()> = Mutex::new(());

fn fg_serialize() -> Option<MutexGuard<'static, ()>> {
    let deadline = Instant::now() + Duration::from_secs(1);
    loop {
        match FG_SERIAL.try_lock() {
            Ok(guard) => return Some(guard),
            Err(TryLockError::Poisoned(poisoned)) => return Some(poisoned.into_inner()),
            Err(TryLockError::WouldBlock) => {
                if Instant::now() >= deadline {
                    return None;
                }
                sleep(Duration::from_millis(20));
            }
        }
    }
}

fn mk_flags_for_modifiers(modifier_keys: &[String]) -> (u32, Vec<String>) {
    let mut flags = 0u32;
    let mut unsupported = Vec::new();
    for modifier in modifier_keys {
        match modifier.to_ascii_lowercase().as_str() {
            "shift" => flags |= MK_SHIFT,
            "ctrl" | "control" => flags |= MK_CONTROL,
            other => unsupported.push(other.to_string()),
        }
    }
    (flags, unsupported)
}

pub fn deepest_child(root: HWND, sx: i32, sy: i32) -> HWND {
    if root.is_invalid() {
        return root;
    }
    let screen_point = POINT { x: sx, y: sy };
    let hit = unsafe { WindowFromPoint(screen_point) };
    let start = if !hit.is_invalid() && unsafe { IsChild(root, hit) }.as_bool() {
        hit
    } else {
        root
    };

    let mut current = start;
    for _ in 0..DEEPEST_CHILD_MAX_DEPTH {
        let mut client = screen_point;
        unsafe {
            let _ = ScreenToClient(current, &mut client);
        }
        let child = unsafe {
            ChildWindowFromPointEx(
                current,
                client,
                CWP_SKIPINVISIBLE | CWP_SKIPDISABLED | CWP_SKIPTRANSPARENT,
            )
        };
        if child.is_invalid() || child == current {
            break;
        }
        current = child;
    }
    current
}

pub fn post_click(
    root: HWND,
    x: i32,
    y: i32,
    button: &str,
    click_count: usize,
) -> VoidResult<WindowsInputOutcome> {
    if root.is_invalid() {
        return Err(VoidError::tool("[INVALID_HWND] post_click".to_string()));
    }
    let mut screen_point = POINT { x, y };
    unsafe {
        let _ = ClientToScreen(root, &mut screen_point);
    }
    post_click_screen(
        root,
        screen_point.x,
        screen_point.y,
        button,
        click_count,
        &[],
    )
}

pub fn post_click_screen(
    root: HWND,
    sx: i32,
    sy: i32,
    button: &str,
    click_count: usize,
    modifier_keys: &[String],
) -> VoidResult<WindowsInputOutcome> {
    if root.is_invalid() {
        return Err(VoidError::tool(
            "[INVALID_HWND] post_click_screen".to_string(),
        ));
    }
    let target = deepest_child(root, sx, sy);
    let (down_msg, up_msg, mk_flag) = match button {
        "right" => (WM_RBUTTONDOWN, WM_RBUTTONUP, MK_RBUTTON),
        "middle" => (WM_MBUTTONDOWN, WM_MBUTTONUP, MK_MBUTTON),
        _ => (WM_LBUTTONDOWN, WM_LBUTTONUP, MK_LBUTTON),
    };
    if let Some(reason) = post_message_blocked_by_uipi(target, down_msg) {
        return Ok(WindowsInputOutcome::blocked_uipi(reason));
    }
    let (modifier_flags, unsupported) = mk_flags_for_modifiers(modifier_keys);
    if !unsupported.is_empty() {
        log::warn!(
            "windows_bg_input: mouse modifiers {unsupported:?} have no Win32 MK_* flag and are ignored"
        );
    }
    let mut client = POINT { x: sx, y: sy };
    unsafe {
        let _ = ScreenToClient(target, &mut client);
    }
    let lparam = make_lparam(client.x, client.y);
    let wdown = WPARAM((mk_flag | modifier_flags) as usize);
    let wup = WPARAM(modifier_flags as usize);
    for i in 0..click_count.max(1) {
        post_msg(
            target,
            WM_MOUSEMOVE,
            WPARAM(modifier_flags as usize),
            lparam,
        )?;
        post_msg(target, down_msg, wdown, lparam)?;
        sleep(Duration::from_millis(CLICK_DELAY_MS));
        post_msg(target, up_msg, wup, lparam)?;
        if i + 1 < click_count {
            sleep(Duration::from_millis(MULTI_CLICK_DELAY_MS));
        }
    }
    Ok(WindowsInputOutcome::posted_unknown("post_click_screen"))
}

pub fn post_right_click(root: HWND, x: i32, y: i32) -> VoidResult<WindowsInputOutcome> {
    post_click(root, x, y, "right", 1)
}

pub fn post_key(hwnd: HWND, vk: u16, scan: u32, down: bool) -> VoidResult<WindowsInputOutcome> {
    if hwnd.is_invalid() {
        return Err(VoidError::tool("[INVALID_HWND] post_key".to_string()));
    }
    if let Some(reason) = post_message_blocked_by_uipi(hwnd, WM_KEYDOWN) {
        return Ok(WindowsInputOutcome::blocked_uipi(reason));
    }
    let msg = if down { WM_KEYDOWN } else { WM_KEYUP };
    post_msg(hwnd, msg, WPARAM(vk as usize), make_key_lparam(scan, down))?;
    Ok(WindowsInputOutcome::posted_unknown("post_key"))
}

pub fn post_char(hwnd: HWND, ch: char) -> VoidResult<WindowsInputOutcome> {
    if hwnd.is_invalid() {
        return Err(VoidError::tool("[INVALID_HWND] post_char".to_string()));
    }
    if let Some(reason) = post_message_blocked_by_uipi(hwnd, WM_CHAR) {
        return Ok(WindowsInputOutcome::blocked_uipi(reason));
    }
    post_msg(hwnd, WM_CHAR, WPARAM(ch as u32 as usize), LPARAM(1))?;
    Ok(WindowsInputOutcome::posted_unknown("post_char"))
}

pub fn post_scroll_screen(
    root: HWND,
    sx: i32,
    sy: i32,
    dx: i32,
    dy: i32,
) -> VoidResult<WindowsInputOutcome> {
    if root.is_invalid() {
        return Err(VoidError::tool(
            "[INVALID_HWND] post_scroll_screen".to_string(),
        ));
    }
    let target = deepest_child(root, sx, sy);
    if let Some(reason) = post_message_blocked_by_uipi(target, WM_VSCROLL) {
        return Ok(WindowsInputOutcome::blocked_uipi(reason));
    }
    if dy != 0 {
        let code = if dy > 0 { SB_LINEDOWN } else { SB_LINEUP };
        for _ in 0..delta_to_line_count(dy) {
            post_msg(target, WM_VSCROLL, WPARAM(code.0 as usize), LPARAM(0))?;
        }
    }
    if dx != 0 {
        let code = if dx > 0 { SB_LINERIGHT } else { SB_LINELEFT };
        for _ in 0..delta_to_line_count(dx) {
            post_msg(target, WM_HSCROLL, WPARAM(code.0 as usize), LPARAM(0))?;
        }
    }
    Ok(WindowsInputOutcome::posted_unknown("post_scroll_screen"))
}

#[allow(clippy::too_many_arguments)]
pub fn post_drag_screen(
    root: HWND,
    sx_from: i32,
    sy_from: i32,
    sx_to: i32,
    sy_to: i32,
    duration_ms: u64,
    steps: usize,
    button: &str,
) -> VoidResult<WindowsInputOutcome> {
    if root.is_invalid() {
        return Err(VoidError::tool(
            "[INVALID_HWND] post_drag_screen".to_string(),
        ));
    }
    let target = deepest_child(root, sx_from, sy_from);
    if let Some(reason) = post_message_blocked_by_uipi(target, WM_LBUTTONDOWN) {
        return Ok(WindowsInputOutcome::blocked_uipi(reason));
    }
    let mut from = POINT {
        x: sx_from,
        y: sy_from,
    };
    let mut to = POINT { x: sx_to, y: sy_to };
    unsafe {
        let _ = ScreenToClient(target, &mut from);
        let _ = ScreenToClient(target, &mut to);
    }
    let (down_msg, up_msg, mk_flag) = match button {
        "right" => (WM_RBUTTONDOWN, WM_RBUTTONUP, MK_RBUTTON),
        "middle" => (WM_MBUTTONDOWN, WM_MBUTTONUP, MK_MBUTTON),
        _ => (WM_LBUTTONDOWN, WM_LBUTTONUP, MK_LBUTTON),
    };
    let wdown = WPARAM(mk_flag as usize);
    let steps = steps.max(1);
    let step_delay_ms = if steps > 1 {
        duration_ms / steps as u64
    } else {
        duration_ms
    };
    post_msg(target, WM_MOUSEMOVE, WPARAM(0), make_lparam(from.x, from.y))?;
    post_msg(target, down_msg, wdown, make_lparam(from.x, from.y))?;
    sleep(Duration::from_millis(DRAG_ENDPOINT_DELAY_MS));
    for i in 1..=steps {
        let t = i as f64 / steps as f64;
        let ix = from.x + ((to.x - from.x) as f64 * t).round() as i32;
        let iy = from.y + ((to.y - from.y) as f64 * t).round() as i32;
        post_msg(target, WM_MOUSEMOVE, wdown, make_lparam(ix, iy))?;
        if step_delay_ms > 0 {
            sleep(Duration::from_millis(step_delay_ms));
        }
    }
    post_msg(target, up_msg, WPARAM(0), make_lparam(to.x, to.y))?;
    Ok(WindowsInputOutcome::posted_unknown("post_drag_screen"))
}

pub fn inject_text_cloaked(hwnd: HWND, text: &str) -> VoidResult<WindowsInputOutcome> {
    if hwnd.is_invalid() {
        return Err(VoidError::tool(
            "[INVALID_HWND] inject_text_cloaked".to_string(),
        ));
    }
    if text.is_empty() {
        return Ok(WindowsInputOutcome::sent_input("inject_text_cloaked"));
    }
    if let Some(reason) = post_message_blocked_by_uipi(hwnd, WM_CHAR) {
        return Ok(WindowsInputOutcome::blocked_uipi(reason));
    }
    let _serial = fg_serialize();
    let prev_fg = unsafe { GetForegroundWindow() };
    let cloaked = unsafe { hwnd != prev_fg && set_cloak(hwnd, true) };
    let got_fg = unsafe { force_foreground_attached(hwnd) };
    let result = if got_fg {
        match unsafe { send_unicode(text) } {
            Ok(()) => WindowsInputOutcome::sent_input("inject_text_cloaked"),
            Err(error) => WindowsInputOutcome::win32_error(
                "inject_text_cloaked",
                format!("[SEND_INPUT_FAILED] {}", error),
            ),
        }
    } else {
        let mut post_error = None;
        for ch in text.chars() {
            if let Err(error) = post_char(hwnd, ch) {
                post_error = Some(error.to_string());
                break;
            }
        }
        if let Some(error) = post_error {
            WindowsInputOutcome::win32_error(
                "inject_text_cloaked",
                format!("[POST_CHAR_FAILED] {}", error),
            )
        } else {
            WindowsInputOutcome {
                status: InputDeliveryStatus::ForegroundUnavailable,
                path: "inject_text_cloaked",
                delivery_uncertain: true,
                warning: Some("Foreground unavailable; fell back to WM_CHAR.".to_string()),
            }
        }
    };

    let restored = unsafe { restore_foreground_and_uncloak(prev_fg, hwnd, cloaked) };
    Ok(finalize_cloaked_outcome(
        "inject_text_cloaked",
        result,
        restored,
    ))
}

pub fn inject_key_cloaked(
    hwnd: HWND,
    keycode: u16,
    modifiers: &[u16],
) -> VoidResult<WindowsInputOutcome> {
    if hwnd.is_invalid() {
        return Err(VoidError::tool(
            "[INVALID_HWND] inject_key_cloaked".to_string(),
        ));
    }
    if let Some(reason) = post_message_blocked_by_uipi(hwnd, WM_KEYDOWN) {
        return Ok(WindowsInputOutcome::blocked_uipi(reason));
    }
    let _serial = fg_serialize();
    let prev_fg = unsafe { GetForegroundWindow() };
    let cloaked = unsafe { hwnd != prev_fg && set_cloak(hwnd, true) };
    let got_fg = unsafe { force_foreground_attached(hwnd) };
    let result = if got_fg {
        match unsafe { send_key_combo(keycode, modifiers) } {
            Ok(()) => WindowsInputOutcome::sent_input("inject_key_cloaked"),
            Err(error) => WindowsInputOutcome::win32_error(
                "inject_key_cloaked",
                format!("[SEND_INPUT_FAILED] {}", error),
            ),
        }
    } else {
        let mut post_error = None;
        for &modifier in modifiers {
            let scan = unsafe { MapVirtualKeyW(modifier as u32, MAPVK_VK_TO_VSC) };
            if let Err(error) = post_key(hwnd, modifier, scan, true) {
                post_error = Some(error.to_string());
                break;
            }
        }
        if post_error.is_none() {
            let scan = unsafe { MapVirtualKeyW(keycode as u32, MAPVK_VK_TO_VSC) };
            if let Err(error) = post_key(hwnd, keycode, scan, true) {
                post_error = Some(error.to_string());
            } else if let Err(error) = post_key(hwnd, keycode, scan, false) {
                post_error = Some(error.to_string());
            }
        }
        if post_error.is_none() {
            for &modifier in modifiers.iter().rev() {
                let scan = unsafe { MapVirtualKeyW(modifier as u32, MAPVK_VK_TO_VSC) };
                if let Err(error) = post_key(hwnd, modifier, scan, false) {
                    post_error = Some(error.to_string());
                    break;
                }
            }
        }
        if let Some(error) = post_error {
            WindowsInputOutcome::win32_error(
                "inject_key_cloaked",
                format!("[POST_KEY_FAILED] {}", error),
            )
        } else {
            WindowsInputOutcome {
                status: InputDeliveryStatus::ForegroundUnavailable,
                path: "inject_key_cloaked",
                delivery_uncertain: true,
                warning: Some("Foreground unavailable; fell back to WM_KEY messages.".to_string()),
            }
        }
    };
    let restored = unsafe { restore_foreground_and_uncloak(prev_fg, hwnd, cloaked) };
    Ok(finalize_cloaked_outcome(
        "inject_key_cloaked",
        result,
        restored,
    ))
}

pub fn post_message_blocked_by_uipi(hwnd: HWND, msg: u32) -> Option<String> {
    if msg >= WM_USER_CUTOFF {
        return None;
    }
    let mut pid = 0u32;
    if unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) } == 0 || pid == 0 {
        return None;
    }
    let own = unsafe { process_integrity_rid(GetCurrentProcess()) }?;
    let target_handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if target_handle.is_null() {
        return None;
    }
    let target = unsafe { process_integrity_rid(target_handle) };
    unsafe {
        CloseHandle(target_handle);
    }
    let target = target?;
    uipi_block_reason(own, target, msg).map(|_| {
        format!(
            "[UIPI_BLOCKED] target hwnd 0x{:x} pid {} is {} integrity; this process is {} integrity. PostMessage input msg 0x{:x} would be silently filtered.",
            hwnd.0 as usize,
            pid,
            integrity_name(target),
            integrity_name(own),
            msg
        )
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct UipiBlock;

fn uipi_block_reason(own_integrity: u32, target_integrity: u32, msg: u32) -> Option<UipiBlock> {
    if msg < WM_USER_CUTOFF && target_integrity > own_integrity {
        Some(UipiBlock)
    } else {
        None
    }
}

pub fn is_probably_uwp_or_directcomposition(hwnd: HWND) -> bool {
    if hwnd.is_invalid() {
        return false;
    }
    let exstyle = unsafe { GetWindowLongPtrW(hwnd.0 as isize, GWL_EXSTYLE) } as usize;
    is_probably_directcomposition_target(
        exstyle,
        class_name(hwnd).as_deref(),
        owning_exe_path(hwnd).as_deref(),
    )
}

fn is_probably_directcomposition_target(
    exstyle: usize,
    class_name: Option<&str>,
    exe_path: Option<&str>,
) -> bool {
    if exstyle & WS_EX_NOREDIRECTIONBITMAP != 0 {
        return true;
    }
    if class_name
        .map(|name| XAML_HOST_CLASSES.iter().any(|known| name == *known))
        .unwrap_or(false)
    {
        return true;
    }
    exe_path
        .and_then(basename_lower)
        .map(|exe| XAML_HOST_EXES.iter().any(|known| exe == *known))
        .unwrap_or(false)
}

const XAML_HOST_CLASSES: &[&str] = &[
    "ApplicationFrameWindow",
    "WinUIDesktopWin32WindowClass",
    "Windows.UI.Core.CoreWindow",
    "Microsoft.UI.Content.DesktopChildSiteBridge",
];

const XAML_HOST_EXES: &[&str] = &[
    "notepad.exe",
    "calculatorapp.exe",
    "calc.exe",
    "applicationframehost.exe",
    "photos.exe",
    "systemsettings.exe",
];

pub fn vk_for_modifier(name: &str) -> Option<u16> {
    match name.to_ascii_lowercase().as_str() {
        "ctrl" | "control" => Some(VK_CONTROL),
        "shift" => Some(VK_SHIFT),
        "alt" | "menu" | "option" => Some(VK_MENU),
        "win" | "meta" | "windows" | "cmd" | "command" | "super" => Some(VK_LWIN),
        _ => None,
    }
}

pub fn vk_for_key(key: &str) -> VoidResult<u16> {
    let key_lower = key.to_ascii_lowercase();
    let vk = match key_lower.as_str() {
        "enter" | "return" => VK_RETURN,
        "tab" => VK_TAB,
        "escape" | "esc" => VK_ESCAPE,
        "space" | " " => VK_SPACE,
        "backspace" => VK_BACKSPACE,
        "delete" | "del" => VK_DELETE,
        "insert" | "ins" => VK_INSERT,
        "home" => VK_HOME,
        "end" => VK_END,
        "pageup" | "pgup" => VK_PRIOR,
        "pagedown" | "pgdn" => VK_NEXT,
        "up" => VK_UP,
        "down" => VK_DOWN,
        "left" => VK_LEFT,
        "right" => VK_RIGHT,
        "f1" => 0x70,
        "f2" => 0x71,
        "f3" => 0x72,
        "f4" => 0x73,
        "f5" => 0x74,
        "f6" => 0x75,
        "f7" => 0x76,
        "f8" => 0x77,
        "f9" => 0x78,
        "f10" => 0x79,
        "f11" => 0x7A,
        "f12" => 0x7B,
        "ctrl" | "control" => VK_CONTROL,
        "shift" => VK_SHIFT,
        "alt" | "option" => VK_MENU,
        "win" | "windows" | "meta" | "command" | "cmd" | "super" => VK_LWIN,
        "capslock" => VK_CAPITAL,
        "numlock" => VK_NUMLOCK,
        _ => {
            let mut chars = key.chars();
            let ch = chars
                .next()
                .ok_or_else(|| VoidError::tool("[UNKNOWN_KEY] empty key name".to_string()))?;
            if chars.next().is_some() {
                return Err(VoidError::tool(format!("[UNKNOWN_KEY] {key}")));
            }
            let scan = unsafe { VkKeyScanW(ch as u16) };
            if scan == -1 {
                return Err(VoidError::tool(format!("[UNKNOWN_KEY] {key}")));
            }
            (scan & 0xFF) as u16
        }
    };
    Ok(vk)
}

pub fn parse_key_chord(keys: &[String]) -> VoidResult<(Vec<u16>, u16)> {
    if keys.is_empty() {
        return Err(VoidError::tool("[UNKNOWN_KEY] empty key chord".to_string()));
    }
    let mut modifiers = Vec::new();
    let mut main_key = None;
    for key in keys {
        if let Some(modifier) = vk_for_modifier(key) {
            if !modifiers.contains(&modifier) {
                modifiers.push(modifier);
            }
        } else {
            main_key = Some(vk_for_key(key)?);
        }
    }
    let keycode = match main_key {
        Some(key) => key,
        None => vk_for_key(keys.last().expect("non-empty keys"))?,
    };
    Ok((modifiers, keycode))
}

fn post_msg(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> VoidResult<()> {
    unsafe {
        match PostMessageW(Some(hwnd), msg, wparam, lparam) {
            Ok(()) => Ok(()),
            Err(e) => Err(VoidError::tool(format!(
                "[POST_MESSAGE_FAILED] {} hwnd=0x{:x}: {e}",
                message_name(msg),
                hwnd.0 as usize
            ))),
        }
    }
}

fn make_lparam(x: i32, y: i32) -> LPARAM {
    let clamp = |value: i32| value.clamp(i16::MIN as i32, i16::MAX as i32) as u16;
    let packed = ((clamp(y) as u32) << 16) | clamp(x) as u32;
    LPARAM(packed as isize)
}

fn lparam_bits(lparam: LPARAM) -> u32 {
    lparam.0 as u32
}

fn make_key_lparam(scan: u32, down: bool) -> LPARAM {
    let base = 1u32 | ((scan & 0xff) << 16);
    let bits = if down {
        base
    } else {
        base | (1u32 << 30) | (1u32 << 31)
    };
    LPARAM(bits as isize)
}

fn delta_to_line_count(delta: i32) -> usize {
    let magnitude = delta.unsigned_abs();
    if magnitude == 0 {
        return 0;
    }
    ((magnitude as usize) / 40).clamp(1, 50)
}

fn unicode_event(unit: u16, up: bool) -> InputRecord {
    let mut flags = KEYEVENTF_UNICODE;
    if up {
        flags |= KEYEVENTF_KEYUP;
    }
    InputRecord {
        input_type: INPUT_KEYBOARD,
        anonymous: InputUnion {
            ki: KeybdInput {
                w_vk: 0,
                w_scan: unit,
                dw_flags: flags,
                time: 0,
                dw_extra_info: 0,
            },
        },
    }
}

fn vk_event(vk: u16, scan: u32, up: bool) -> InputRecord {
    InputRecord {
        input_type: INPUT_KEYBOARD,
        anonymous: InputUnion {
            ki: KeybdInput {
                w_vk: vk,
                w_scan: scan as u16,
                dw_flags: if up { KEYEVENTF_KEYUP } else { 0 },
                time: 0,
                dw_extra_info: 0,
            },
        },
    }
}

unsafe fn send_unicode(text: &str) -> VoidResult<()> {
    let mut events = Vec::with_capacity(text.len() * 2);
    for unit in text.encode_utf16() {
        events.push(unicode_event(unit, false));
        events.push(unicode_event(unit, true));
    }
    if events.is_empty() {
        return Ok(());
    }
    let sent = unsafe {
        SendInput(
            events.len() as u32,
            events.as_ptr(),
            std::mem::size_of::<InputRecord>() as i32,
        )
    };
    if sent as usize != events.len() {
        return Err(VoidError::tool(format!(
            "[SEND_INPUT_FAILED] typed {sent} of {} key events",
            events.len()
        )));
    }
    Ok(())
}

unsafe fn send_key_combo(keycode: u16, modifiers: &[u16]) -> VoidResult<()> {
    let mut events = Vec::with_capacity(modifiers.len() * 2 + 2);
    for &modifier in modifiers {
        let scan = unsafe { MapVirtualKeyW(modifier as u32, MAPVK_VK_TO_VSC) };
        events.push(vk_event(modifier, scan, false));
    }
    let scan = unsafe { MapVirtualKeyW(keycode as u32, MAPVK_VK_TO_VSC) };
    events.push(vk_event(keycode, scan, false));
    events.push(vk_event(keycode, scan, true));
    for &modifier in modifiers.iter().rev() {
        let scan = unsafe { MapVirtualKeyW(modifier as u32, MAPVK_VK_TO_VSC) };
        events.push(vk_event(modifier, scan, true));
    }
    let sent = unsafe {
        SendInput(
            events.len() as u32,
            events.as_ptr(),
            std::mem::size_of::<InputRecord>() as i32,
        )
    };
    if sent as usize != events.len() {
        return Err(VoidError::tool(format!(
            "[SEND_INPUT_FAILED] sent {sent} of {} key events",
            events.len()
        )));
    }
    Ok(())
}

unsafe fn set_cloak(hwnd: HWND, on: bool) -> bool {
    let value: BOOL = if on { TRUE } else { FALSE };
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_CLOAK,
            &value as *const _ as *const c_void,
            std::mem::size_of::<BOOL>() as u32,
        )
        .is_ok()
    }
}

unsafe fn force_foreground_attached(target: HWND) -> bool {
    let current = unsafe { GetForegroundWindow() };
    if current == target {
        return true;
    }
    let my_thread = unsafe { GetCurrentThreadId() };
    let mut pid = 0u32;
    let current_thread = unsafe { GetWindowThreadProcessId(current, Some(&mut pid)) };
    let attached = current_thread != 0 && current_thread != my_thread;
    if attached {
        let _ = unsafe { AttachThreadInput(my_thread, current_thread, 1) };
    }
    let _ = unsafe { SetForegroundWindow(target) };
    if attached {
        let _ = unsafe { AttachThreadInput(my_thread, current_thread, 0) };
    }
    unsafe { GetForegroundWindow() == target }
}

unsafe fn restore_foreground_and_uncloak(prev_fg: HWND, target: HWND, cloaked: bool) -> bool {
    let mut restored = true;
    if !prev_fg.is_invalid() && prev_fg != target {
        restored = unsafe { force_foreground_attached(prev_fg) };
    }
    if cloaked {
        let _ = unsafe { set_cloak(target, false) };
    }
    restored
}

unsafe fn process_integrity_rid(process: Handle) -> Option<u32> {
    let mut token: Handle = std::ptr::null_mut();
    if unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut token) } == 0 {
        return None;
    }
    let mut needed = 0u32;
    unsafe {
        GetTokenInformation(
            token,
            TOKEN_INTEGRITY_LEVEL_CLASS,
            std::ptr::null_mut(),
            0,
            &mut needed,
        );
    }
    if needed == 0 {
        unsafe {
            CloseHandle(token);
        }
        return None;
    }
    let mut buffer = vec![0u8; needed as usize];
    let ok = unsafe {
        GetTokenInformation(
            token,
            TOKEN_INTEGRITY_LEVEL_CLASS,
            buffer.as_mut_ptr(),
            needed,
            &mut needed,
        )
    } != 0;
    unsafe {
        CloseHandle(token);
    }
    if !ok {
        return None;
    }
    let label = unsafe { &*(buffer.as_ptr() as *const TokenMandatoryLabel) };
    let sid = label.label.sid as *const c_void;
    let count_ptr = unsafe { GetSidSubAuthorityCount(sid) };
    if count_ptr.is_null() {
        return None;
    }
    let count = unsafe { *count_ptr };
    if count == 0 {
        return None;
    }
    let rid_ptr = unsafe { GetSidSubAuthority(sid, (count - 1) as u32) };
    if rid_ptr.is_null() {
        return None;
    }
    Some(unsafe { *rid_ptr })
}

fn integrity_name(rid: u32) -> &'static str {
    match rid {
        integrity_level::UNTRUSTED => "Untrusted",
        integrity_level::LOW => "Low",
        integrity_level::MEDIUM => "Medium",
        integrity_level::MEDIUM_PLUS => "Medium+",
        integrity_level::HIGH => "High",
        integrity_level::SYSTEM => "System",
        _ => "unknown",
    }
}

fn class_name(hwnd: HWND) -> Option<String> {
    let mut buffer = [0u16; 256];
    let len = unsafe { GetClassNameW(hwnd, &mut buffer) };
    if len <= 0 {
        None
    } else {
        Some(String::from_utf16_lossy(&buffer[..len as usize]))
    }
}

fn owning_exe_path(hwnd: HWND) -> Option<String> {
    let mut pid = 0u32;
    if unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) } == 0 || pid == 0 {
        return None;
    }
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let mut buffer = [0u16; 1024];
    let mut len = buffer.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut len) } != 0;
    unsafe {
        CloseHandle(handle);
    }
    if !ok || len == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buffer[..len as usize]))
}

fn basename_lower(path: &str) -> Option<String> {
    path.rsplit(|ch| ch == '\\' || ch == '/')
        .next()
        .map(str::to_ascii_lowercase)
}

fn message_name(msg: u32) -> &'static str {
    match msg {
        WM_LBUTTONDOWN => "WM_LBUTTONDOWN",
        WM_LBUTTONUP => "WM_LBUTTONUP",
        WM_RBUTTONDOWN => "WM_RBUTTONDOWN",
        WM_RBUTTONUP => "WM_RBUTTONUP",
        WM_MBUTTONDOWN => "WM_MBUTTONDOWN",
        WM_MBUTTONUP => "WM_MBUTTONUP",
        WM_MOUSEMOVE => "WM_MOUSEMOVE",
        WM_KEYDOWN => "WM_KEYDOWN",
        WM_KEYUP => "WM_KEYUP",
        WM_CHAR => "WM_CHAR",
        WM_VSCROLL => "WM_VSCROLL",
        WM_HSCROLL => "WM_HSCROLL",
        _ => "WM_UNKNOWN",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_bg_input_lparam_packs_signed_client_coordinates() {
        assert_eq!(lparam_bits(make_lparam(12, 34)), 0x0022_000c);
        assert_eq!(lparam_bits(make_lparam(-1, -2)), 0xfffe_ffff);
        assert_eq!(lparam_bits(make_lparam(i32::MAX, i32::MIN)), 0x8000_7fff);
    }

    #[test]
    fn windows_bg_input_key_lparam_marks_keyup_transition() {
        assert_eq!(lparam_bits(make_key_lparam(0x1c, true)), 0x001c_0001);
        assert_eq!(lparam_bits(make_key_lparam(0x1c, false)), 0xc01c_0001);
    }

    #[test]
    fn windows_bg_input_delta_to_line_count_clamps_scroll() {
        assert_eq!(delta_to_line_count(0), 0);
        assert_eq!(delta_to_line_count(1), 1);
        assert_eq!(delta_to_line_count(80), 2);
        assert_eq!(delta_to_line_count(-80), 2);
        assert_eq!(delta_to_line_count(10_000), 50);
    }

    #[test]
    fn windows_bg_input_modifier_flags_only_shift_control_for_mouse_messages() {
        let mods = vec![
            "shift".to_string(),
            "control".to_string(),
            "alt".to_string(),
            "meta".to_string(),
        ];
        let (flags, unsupported) = mk_flags_for_modifiers(&mods);
        assert_eq!(flags, MK_SHIFT | MK_CONTROL);
        assert_eq!(unsupported, vec!["alt".to_string(), "meta".to_string()]);
    }

    #[test]
    fn windows_bg_input_parse_key_chord_accepts_ctrl_alt_delete_named_keys() {
        let keys = vec!["ctrl".to_string(), "alt".to_string(), "delete".to_string()];
        let (mods, key) = parse_key_chord(&keys).expect("parse chord");
        assert_eq!(mods, vec![VK_CONTROL, VK_MENU]);
        assert_eq!(key, VK_DELETE);
    }

    #[test]
    fn windows_bg_input_uipi_skips_messages_at_or_above_wm_user() {
        assert_eq!(uipi_block_reason(0x2000, 0x3000, WM_USER_CUTOFF), None);
        assert_eq!(uipi_block_reason(0x2000, 0x3000, WM_CHAR), Some(UipiBlock));
    }

    #[test]
    fn windows_bg_input_directcomposition_heuristic_matches_exstyle_class_or_exe() {
        assert!(is_probably_directcomposition_target(
            WS_EX_NOREDIRECTIONBITMAP,
            None,
            None
        ));
        assert!(is_probably_directcomposition_target(
            0,
            Some("ApplicationFrameWindow"),
            None
        ));
        assert!(is_probably_directcomposition_target(
            0,
            Some("Notepad"),
            Some("C:\\Windows\\System32\\notepad.exe")
        ));
        assert!(!is_probably_directcomposition_target(
            0,
            Some("Edit"),
            Some("C:\\Windows\\System32\\classic.exe")
        ));
    }

    #[test]
    fn windows_bg_input_result_distinguishes_posted_sent_blocked_and_uncertain() {
        assert_eq!(
            WindowsInputOutcome::posted_unknown("WM_CHAR").status,
            InputDeliveryStatus::PostedUnknown
        );
        assert_eq!(
            WindowsInputOutcome::sent_input("unicode").status,
            InputDeliveryStatus::SentInput
        );
        assert_eq!(
            WindowsInputOutcome::blocked_uipi("blocked").status,
            InputDeliveryStatus::BlockedUipi
        );
        assert!(WindowsInputOutcome::posted_unknown("WM_CHAR").delivery_uncertain);
        assert!(!WindowsInputOutcome::sent_input("unicode").delivery_uncertain);
    }

    #[test]
    fn windows_bg_input_result_distinguishes_restore_unsupported_and_win32_errors() {
        let restore = WindowsInputOutcome::foreground_restore_failed("inject_key_cloaked");
        assert_eq!(restore.status, InputDeliveryStatus::ForegroundRestoreFailed);
        assert!(restore.delivery_uncertain);

        let unsupported =
            WindowsInputOutcome::unsupported_surface("inject_key_cloaked", "directcomposition");
        assert_eq!(unsupported.status, InputDeliveryStatus::UnsupportedSurface);
        assert!(unsupported.delivery_uncertain);
        assert_eq!(unsupported.warning.as_deref(), Some("directcomposition"));

        let error = WindowsInputOutcome::win32_error("inject_text_cloaked", "send failed");
        assert_eq!(error.status, InputDeliveryStatus::Win32Error);
        assert!(error.delivery_uncertain);
        assert_eq!(error.warning.as_deref(), Some("send failed"));
    }

    #[test]
    fn windows_bg_input_cloaked_result_prefers_restore_failure() {
        let sent = WindowsInputOutcome::sent_input("inject_text_cloaked");
        let restored = finalize_cloaked_outcome("inject_text_cloaked", sent.clone(), true);
        assert_eq!(restored, sent);

        let failed_restore = finalize_cloaked_outcome("inject_text_cloaked", sent, false);
        assert_eq!(
            failed_restore.status,
            InputDeliveryStatus::ForegroundRestoreFailed
        );
        assert!(failed_restore.delivery_uncertain);
    }
}
