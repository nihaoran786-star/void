#[cfg(target_os = "macos")]
use std::ffi::c_void;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SkyLightStatus {
    Available,
    UnsupportedPlatform,
    FrameworkUnavailable,
    SymbolUnavailable,
    PermissionOrRuntimeDenied,
    DisabledByDefault,
}

impl SkyLightStatus {
    fn as_code(self) -> &'static str {
        match self {
            SkyLightStatus::Available => "available",
            SkyLightStatus::UnsupportedPlatform => "unsupported_platform",
            SkyLightStatus::FrameworkUnavailable => "framework_unavailable",
            SkyLightStatus::SymbolUnavailable => "symbol_unavailable",
            SkyLightStatus::PermissionOrRuntimeDenied => "permission_or_runtime_denied",
            SkyLightStatus::DisabledByDefault => "disabled_by_default",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SkyLightAvailability {
    pub(crate) available: bool,
    pub(crate) status: SkyLightStatus,
    detail: Option<String>,
}

impl SkyLightAvailability {
    pub(crate) fn available() -> Self {
        Self {
            available: true,
            status: SkyLightStatus::Available,
            detail: None,
        }
    }

    pub(crate) fn unavailable(status: SkyLightStatus, detail: impl Into<String>) -> Self {
        Self {
            available: false,
            status,
            detail: Some(detail.into()),
        }
    }

    pub(crate) fn disabled_by_default() -> Self {
        Self {
            available: false,
            status: SkyLightStatus::DisabledByDefault,
            detail: Some(
                "SkyLight bridge is available only as a foundation in ISSUE-121A and is not connected to input behavior."
                    .to_string(),
            ),
        }
    }

    pub(crate) fn is_soft_fail(&self) -> bool {
        !self.available
    }

    pub(crate) fn message(&self) -> String {
        if self.available {
            return format!("[SKYLIGHT_AVAILABLE] {}", self.status.as_code());
        }
        match &self.detail {
            Some(detail) if !detail.trim().is_empty() => {
                format!(
                    "[SKYLIGHT_UNAVAILABLE] {}: {}",
                    self.status.as_code(),
                    detail
                )
            }
            _ => format!("[SKYLIGHT_UNAVAILABLE] {}", self.status.as_code()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SkyLightPolicy {
    pub(crate) enables_behavior: bool,
}

impl Default for SkyLightPolicy {
    fn default() -> Self {
        Self {
            enables_behavior: false,
        }
    }
}

impl SkyLightPolicy {
    pub(crate) fn default_availability(&self) -> SkyLightAvailability {
        if self.enables_behavior {
            probe_runtime_availability().availability
        } else {
            SkyLightAvailability::disabled_by_default()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SkyLightDiagnostics {
    pub(crate) availability: SkyLightAvailability,
    pub(crate) framework_loaded: bool,
    pub(crate) missing_symbols: Vec<String>,
}

impl SkyLightDiagnostics {
    pub(crate) fn from_probe_parts(
        availability: SkyLightAvailability,
        framework_loaded: bool,
        missing_symbols: Vec<String>,
    ) -> Self {
        Self {
            availability,
            framework_loaded,
            missing_symbols,
        }
    }

    pub(crate) fn message(&self) -> String {
        if self.missing_symbols.is_empty() {
            self.availability.message()
        } else {
            format!(
                "{}; missing_symbols={}",
                self.availability.message(),
                self.missing_symbols.join(",")
            )
        }
    }
}

pub(crate) fn probe_runtime_availability() -> SkyLightDiagnostics {
    #[cfg(target_os = "macos")]
    {
        macos_probe_runtime_availability()
    }
    #[cfg(not(target_os = "macos"))]
    {
        SkyLightDiagnostics::from_probe_parts(
            SkyLightAvailability::unavailable(
                SkyLightStatus::UnsupportedPlatform,
                "SkyLight is a macOS-only private adapter foundation.",
            ),
            false,
            Vec::new(),
        )
    }
}

#[cfg(target_os = "macos")]
fn macos_probe_runtime_availability() -> SkyLightDiagnostics {
    use std::ffi::{CString, c_char, c_void};

    const RTLD_LAZY: i32 = 0x1;
    const SKYLIGHT_FRAMEWORK: &str =
        "/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight";
    const REQUIRED_SYMBOLS: [&str; 1] = ["SLSMainConnectionID"];

    unsafe extern "C" {
        fn dlopen(filename: *const c_char, flags: i32) -> *mut c_void;
        fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
    }

    let framework = CString::new(SKYLIGHT_FRAMEWORK).expect("static framework path has no nul");
    let handle = unsafe { dlopen(framework.as_ptr(), RTLD_LAZY) };
    if handle.is_null() {
        return SkyLightDiagnostics::from_probe_parts(
            SkyLightAvailability::unavailable(
                SkyLightStatus::FrameworkUnavailable,
                "SkyLight private framework could not be loaded at runtime.",
            ),
            false,
            Vec::new(),
        );
    }

    let mut missing = Vec::new();
    for symbol in REQUIRED_SYMBOLS {
        let symbol_c = CString::new(symbol).expect("static symbol has no nul");
        if unsafe { dlsym(handle, symbol_c.as_ptr()) }.is_null() {
            missing.push(symbol.to_string());
        }
    }

    if missing.is_empty() {
        SkyLightDiagnostics::from_probe_parts(SkyLightAvailability::available(), true, missing)
    } else {
        SkyLightDiagnostics::from_probe_parts(
            SkyLightAvailability::unavailable(
                SkyLightStatus::SymbolUnavailable,
                "SkyLight private framework loaded but required symbols were unavailable.",
            ),
            true,
            missing,
        )
    }
}

#[cfg(target_os = "macos")]
type PostToPidFn = unsafe extern "C" fn(i32, *mut c_void);

#[cfg(target_os = "macos")]
type SetAuthMsgFn = unsafe extern "C" fn(*mut c_void, *mut c_void);

#[cfg(target_os = "macos")]
type SetWindowLocationFn = unsafe extern "C" fn(*mut c_void, f64, f64);

#[cfg(target_os = "macos")]
type SetIntegerFieldFn = unsafe extern "C" fn(*mut c_void, u32, i64);

#[cfg(target_os = "macos")]
type FactoryMsgSendFn = unsafe extern "C" fn(
    *mut c_void,
    *mut c_void,
    *mut c_void,
    std::ffi::c_int,
    std::ffi::c_uint,
) -> *mut c_void;

#[cfg(target_os = "macos")]
type PostEventRecordToFn = unsafe extern "C" fn(*const c_void, *const u8) -> i32;

#[cfg(target_os = "macos")]
type GetFrontProcessFn = unsafe extern "C" fn(*mut c_void) -> i32;

#[cfg(target_os = "macos")]
type GetProcessForPidFn = unsafe extern "C" fn(i32, *mut c_void) -> i32;

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn objc_getClass(name: *const std::ffi::c_char) -> *mut c_void;
    fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
    fn class_respondsToSelector(cls: *mut c_void, sel: *mut c_void) -> bool;
    fn objc_msgSend(
        receiver: *mut c_void,
        selector: *mut c_void,
        event_record: *mut c_void,
        pid: std::ffi::c_int,
        version: std::ffi::c_uint,
    ) -> *mut c_void;
}

#[cfg(target_os = "macos")]
fn skylight_symbol<T: Copy>(name: &[u8]) -> Option<T> {
    use std::ffi::{c_char, c_void};
    use std::sync::OnceLock;

    const RTLD_LAZY: i32 = 0x1;
    const RTLD_GLOBAL: i32 = 0x8;
    const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

    unsafe extern "C" {
        fn dlopen(filename: *const c_char, flags: i32) -> *mut c_void;
        fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
    }

    static LOADED: OnceLock<()> = OnceLock::new();
    LOADED.get_or_init(|| {
        let framework = b"/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight\0";
        unsafe {
            dlopen(framework.as_ptr() as *const c_char, RTLD_LAZY | RTLD_GLOBAL);
        }
    });

    let ptr = unsafe { dlsym(RTLD_DEFAULT, name.as_ptr() as *const c_char) };
    if ptr.is_null() {
        None
    } else {
        Some(unsafe { std::mem::transmute_copy::<*mut c_void, T>(&ptr) })
    }
}

#[cfg(target_os = "macos")]
fn post_to_pid_fn() -> Option<PostToPidFn> {
    use std::sync::OnceLock;
    static SYM: OnceLock<Option<PostToPidFn>> = OnceLock::new();
    *SYM.get_or_init(|| skylight_symbol(b"SLEventPostToPid\0"))
}

#[cfg(target_os = "macos")]
fn set_auth_msg_fn() -> Option<SetAuthMsgFn> {
    use std::sync::OnceLock;
    static SYM: OnceLock<Option<SetAuthMsgFn>> = OnceLock::new();
    *SYM.get_or_init(|| skylight_symbol(b"SLEventSetAuthenticationMessage\0"))
}

#[cfg(target_os = "macos")]
fn set_window_location_fn() -> Option<SetWindowLocationFn> {
    use std::sync::OnceLock;
    static SYM: OnceLock<Option<SetWindowLocationFn>> = OnceLock::new();
    *SYM.get_or_init(|| skylight_symbol(b"CGEventSetWindowLocation\0"))
}

#[cfg(target_os = "macos")]
fn set_integer_field_fn() -> Option<SetIntegerFieldFn> {
    use std::sync::OnceLock;
    static SYM: OnceLock<Option<SetIntegerFieldFn>> = OnceLock::new();
    *SYM.get_or_init(|| skylight_symbol(b"SLEventSetIntegerValueField\0"))
}

#[cfg(target_os = "macos")]
fn post_event_record_to_fn() -> Option<PostEventRecordToFn> {
    use std::sync::OnceLock;
    static SYM: OnceLock<Option<PostEventRecordToFn>> = OnceLock::new();
    *SYM.get_or_init(|| skylight_symbol(b"SLPSPostEventRecordTo\0"))
}

#[cfg(target_os = "macos")]
fn get_front_process_fn() -> Option<GetFrontProcessFn> {
    use std::sync::OnceLock;
    static SYM: OnceLock<Option<GetFrontProcessFn>> = OnceLock::new();
    *SYM.get_or_init(|| skylight_symbol(b"_SLPSGetFrontProcess\0"))
}

#[cfg(target_os = "macos")]
fn get_process_for_pid_fn() -> Option<GetProcessForPidFn> {
    use std::sync::OnceLock;
    static SYM: OnceLock<Option<GetProcessForPidFn>> = OnceLock::new();
    *SYM.get_or_init(|| skylight_symbol(b"GetProcessForPID\0"))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FocusRecordKind {
    Focus,
    Defocus,
}

pub(crate) fn build_focus_event_record(target_wid: u32, kind: FocusRecordKind) -> [u8; 0xF8] {
    let mut buf = [0u8; 0xF8];
    buf[0x04] = 0xF8;
    buf[0x08] = 0x0D;
    buf[0x3C] = (target_wid & 0xFF) as u8;
    buf[0x3D] = ((target_wid >> 8) & 0xFF) as u8;
    buf[0x3E] = ((target_wid >> 16) & 0xFF) as u8;
    buf[0x3F] = ((target_wid >> 24) & 0xFF) as u8;
    buf[0x8A] = match kind {
        FocusRecordKind::Focus => 0x01,
        FocusRecordKind::Defocus => 0x02,
    };
    buf
}

#[cfg(target_os = "macos")]
unsafe fn extract_event_record(event_ptr: *mut c_void) -> *mut c_void {
    for &offset in &[24usize, 32, 16] {
        let slot = unsafe { (event_ptr as *const u8).add(offset).cast::<*mut c_void>() };
        let p = unsafe { std::ptr::read_unaligned(slot) };
        if !p.is_null() {
            return p;
        }
    }
    std::ptr::null_mut()
}

#[cfg(target_os = "macos")]
pub(crate) fn post_to_pid(pid: i32, event_ptr: *mut c_void, attach_auth_message: bool) -> bool {
    let Some(post_fn) = post_to_pid_fn() else {
        return false;
    };

    if attach_auth_message {
        let cls = unsafe { objc_getClass(c"SLSEventAuthenticationMessage".as_ptr()) };
        let sel = unsafe { sel_registerName(c"messageWithEventRecord:pid:version:".as_ptr()) };
        if unsafe { class_respondsToSelector(cls, sel) } {
            let record = unsafe { extract_event_record(event_ptr) };
            if !record.is_null() {
                let msg = unsafe { objc_msgSend(cls, sel, record, pid as std::ffi::c_int, 0u32) };
                if !msg.is_null() {
                    if let Some(set_auth) = set_auth_msg_fn() {
                        unsafe { set_auth(event_ptr, msg) };
                    }
                }
            }
        }
    }

    unsafe { post_fn(pid, event_ptr) };
    true
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn post_to_pid(
    _pid: i32,
    _event_ptr: *mut std::ffi::c_void,
    _attach_auth_message: bool,
) -> bool {
    false
}

#[cfg(target_os = "macos")]
pub(crate) fn set_window_location(event_ptr: *mut c_void, x: f64, y: f64) -> bool {
    let Some(set_window_location) = set_window_location_fn() else {
        return false;
    };
    unsafe { set_window_location(event_ptr, x, y) };
    true
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn set_window_location(_event_ptr: *mut std::ffi::c_void, _x: f64, _y: f64) -> bool {
    false
}

#[cfg(target_os = "macos")]
pub(crate) fn set_integer_field(event_ptr: *mut c_void, field: u32, value: i64) -> bool {
    let Some(set_integer_field) = set_integer_field_fn() else {
        return false;
    };
    unsafe { set_integer_field(event_ptr, field, value) };
    true
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn set_integer_field(
    _event_ptr: *mut std::ffi::c_void,
    _field: u32,
    _value: i64,
) -> bool {
    false
}

#[cfg(target_os = "macos")]
pub(crate) fn is_focus_without_raise_available() -> bool {
    post_event_record_to_fn().is_some()
        && get_front_process_fn().is_some()
        && get_process_for_pid_fn().is_some()
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn is_focus_without_raise_available() -> bool {
    false
}

#[cfg(target_os = "macos")]
pub(crate) fn activate_without_raise(target_pid: i32, target_wid: u32) -> bool {
    let Some(post_fn) = post_event_record_to_fn() else {
        return false;
    };
    let Some(get_front) = get_front_process_fn() else {
        return false;
    };
    let Some(get_pid_psn) = get_process_for_pid_fn() else {
        return false;
    };

    let mut prev_psn = [0u8; 8];
    let mut target_psn = [0u8; 8];
    let prev_ok = unsafe { get_front(prev_psn.as_mut_ptr() as *mut c_void) } == 0;
    let target_ok = unsafe { get_pid_psn(target_pid, target_psn.as_mut_ptr() as *mut c_void) } == 0;
    if !prev_ok || !target_ok {
        return false;
    }

    let defocus = build_focus_event_record(target_wid, FocusRecordKind::Defocus);
    let focus = build_focus_event_record(target_wid, FocusRecordKind::Focus);
    let defocus_ok = unsafe { post_fn(prev_psn.as_ptr() as *const c_void, defocus.as_ptr()) == 0 };
    let focus_ok = unsafe { post_fn(target_psn.as_ptr() as *const c_void, focus.as_ptr()) == 0 };
    defocus_ok && focus_ok
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn activate_without_raise(_target_pid: i32, _target_wid: u32) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn macos_skylight_status_messages_are_stable() {
        let unsupported =
            SkyLightAvailability::unavailable(SkyLightStatus::UnsupportedPlatform, "not macOS");
        let framework = SkyLightAvailability::unavailable(
            SkyLightStatus::FrameworkUnavailable,
            "SkyLight framework not found",
        );
        let symbol = SkyLightAvailability::unavailable(
            SkyLightStatus::SymbolUnavailable,
            "SLSMainConnectionID",
        );
        let disabled = SkyLightAvailability::disabled_by_default();
        let available = SkyLightAvailability::available();

        assert!(!unsupported.available);
        assert!(unsupported.message().contains("[SKYLIGHT_UNAVAILABLE]"));
        assert!(unsupported.message().contains("unsupported_platform"));
        assert!(!framework.available);
        assert!(framework.message().contains("framework_unavailable"));
        assert!(!symbol.available);
        assert!(symbol.message().contains("symbol_unavailable"));
        assert!(!disabled.available);
        assert!(disabled.message().contains("disabled_by_default"));
        assert!(available.available);
        assert!(available.message().contains("[SKYLIGHT_AVAILABLE]"));
        assert!(!available.message().contains("[SKYLIGHT_UNAVAILABLE]"));
    }

    #[test]
    fn macos_skylight_soft_fail_is_not_capability_success() {
        let cases = [
            SkyLightAvailability::unavailable(SkyLightStatus::UnsupportedPlatform, "windows"),
            SkyLightAvailability::unavailable(SkyLightStatus::FrameworkUnavailable, "missing"),
            SkyLightAvailability::unavailable(SkyLightStatus::SymbolUnavailable, "missing symbol"),
            SkyLightAvailability::unavailable(SkyLightStatus::PermissionOrRuntimeDenied, "denied"),
        ];

        for case in cases {
            assert!(!case.available);
            assert!(case.is_soft_fail());
        }
    }

    #[test]
    fn macos_skylight_default_policy_is_disabled() {
        let policy = SkyLightPolicy::default();

        assert!(!policy.enables_behavior);
        assert_eq!(
            policy.default_availability().status,
            SkyLightStatus::DisabledByDefault
        );
    }

    #[test]
    fn macos_skylight_private_names_are_contained_in_diagnostics() {
        let diagnostics = SkyLightDiagnostics::from_probe_parts(
            SkyLightAvailability::unavailable(SkyLightStatus::SymbolUnavailable, "missing"),
            false,
            vec!["SLSMainConnectionID".to_string()],
        );

        assert!(!diagnostics.availability.available);
        assert_eq!(diagnostics.missing_symbols, ["SLSMainConnectionID"]);
        let legacy_brand = ["Bit", "Fun"].concat();
        assert!(!diagnostics.message().contains(&legacy_brand));
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn macos_skylight_post_stub_soft_fails_off_macos() {
        assert!(!post_to_pid(1, std::ptr::null_mut(), true));
        assert!(!post_to_pid(1, std::ptr::null_mut(), false));
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn macos_skylight_event_field_stubs_soft_fail_off_macos() {
        assert!(!set_window_location(std::ptr::null_mut(), 1.0, 2.0));
        assert!(!set_integer_field(std::ptr::null_mut(), 51, 42));
    }

    #[test]
    fn macos_skylight_focus_event_record_encodes_window_and_marker() {
        let record = build_focus_event_record(0x01020304, FocusRecordKind::Focus);

        assert_eq!(record.len(), 0xF8);
        assert_eq!(record[0x04], 0xF8);
        assert_eq!(record[0x08], 0x0D);
        assert_eq!(&record[0x3C..=0x3F], &[0x04, 0x03, 0x02, 0x01]);
        assert_eq!(record[0x8A], 0x01);

        let defocus = build_focus_event_record(0, FocusRecordKind::Defocus);
        assert_eq!(defocus[0x8A], 0x02);
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn macos_skylight_focus_stub_soft_fails_off_macos() {
        assert!(!is_focus_without_raise_available());
        assert!(!activate_without_raise(123, 456));
    }
}
