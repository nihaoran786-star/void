//! Enumerate running desktop applications on Windows.

#![cfg(target_os = "windows")]

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::Mutex;
use void_core::agentic::tools::computer_use_host::{AppInfo, AppSelector};
use void_core::util::errors::{VoidError, VoidResult};
use windows::Win32::Foundation::{HWND, LPARAM, TRUE};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
    IsWindowVisible,
};
use windows_core::BOOL;

type Handle = *mut c_void;

const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;

#[link(name = "kernel32")]
unsafe extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
    fn QueryFullProcessImageNameW(handle: Handle, flags: u32, buf: *mut u16, len: *mut u32) -> i32;
    fn CloseHandle(h: Handle) -> i32;
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WindowEntry {
    hwnd: HWND,
    pid: u32,
    title: String,
}

/// List running applications that own at least one visible, titled top-level
/// window. Windows does not expose a per-app hidden flag here, so
/// `include_hidden` is accepted for host parity and ignored.
pub fn list_running_apps(_include_hidden: bool) -> VoidResult<Vec<AppInfo>> {
    Ok(apps_from_window_entries(enumerate_windows(), |pid| {
        exe_path_for_pid(pid)
    }))
}

pub fn resolve_window_for_app(app: &AppSelector) -> VoidResult<HWND> {
    if app.is_empty() {
        return crate::computer_use::windows_ax_ui::foreground_window_handle();
    }
    resolve_window_from_entries(enumerate_windows(), |pid| exe_path_for_pid(pid), app).ok_or_else(
        || {
            VoidError::tool(format!(
                "[WINDOW_NOT_FOUND] no Windows top-level window matched selector {:?}",
                app
            ))
        },
    )
}

fn apps_from_window_entries<F>(entries: Vec<WindowEntry>, resolve_exe: F) -> Vec<AppInfo>
where
    F: Fn(u32) -> Option<String>,
{
    let mut by_pid: HashMap<u32, String> = HashMap::new();
    for entry in entries {
        if entry.pid == 0 || entry.title.trim().is_empty() {
            continue;
        }
        by_pid.entry(entry.pid).or_insert(entry.title);
    }

    let mut apps: Vec<AppInfo> = by_pid
        .into_iter()
        .map(|(pid, fallback_title)| {
            let name = resolve_exe(pid)
                .and_then(|path| basename_from_path(&path))
                .map(|basename| strip_exe_suffix(&basename))
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(fallback_title);

            AppInfo {
                name,
                bundle_id: None,
                pid: Some(pid as i32),
                running: true,
                last_used_ms: None,
                launch_count: 0,
            }
        })
        .collect();

    apps.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.pid.cmp(&b.pid))
    });
    apps
}

fn resolve_window_from_entries<F>(
    entries: Vec<WindowEntry>,
    resolve_exe: F,
    app: &AppSelector,
) -> Option<HWND>
where
    F: Fn(u32) -> Option<String>,
{
    if let Some(pid) = app.pid {
        if let Some(entry) = entries.iter().find(|entry| entry.pid as i32 == pid) {
            return Some(entry.hwnd);
        }
    }

    let name = app.name.as_deref().map(|value| value.to_lowercase());
    let bundle_id = app.bundle_id.as_deref().map(|value| value.to_lowercase());
    entries.into_iter().find_map(|entry| {
        let exe_path = resolve_exe(entry.pid);
        let exe_base = exe_path
            .as_deref()
            .and_then(basename_from_path)
            .map(|basename| strip_exe_suffix(&basename));
        let exe_base_lower = exe_base.as_deref().map(str::to_lowercase);
        let title_lower = entry.title.to_lowercase();
        let exe_path_lower = exe_path.as_deref().map(str::to_lowercase);

        let matches_name = name.as_deref().is_some_and(|needle| {
            title_lower == needle
                || exe_base_lower.as_deref() == Some(needle)
                || title_lower.contains(needle)
        });
        let matches_bundle = bundle_id.as_deref().is_some_and(|needle| {
            exe_path_lower.as_deref() == Some(needle)
                || exe_base_lower.as_deref() == Some(needle)
                || exe_path_lower
                    .as_deref()
                    .is_some_and(|path| path.ends_with(needle))
        });

        (matches_name || matches_bundle).then_some(entry.hwnd)
    })
}

fn enumerate_windows() -> Vec<WindowEntry> {
    let state = Mutex::new(Vec::<WindowEntry>::new());
    let state_ptr = &state as *const Mutex<Vec<WindowEntry>> as isize;
    unsafe {
        let _ = EnumWindows(Some(enum_windows_cb), LPARAM(state_ptr));
    }
    state.into_inner().unwrap_or_default()
}

unsafe extern "system" fn enum_windows_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if unsafe { IsWindowVisible(hwnd) }.0 == 0 || unsafe { IsIconic(hwnd) }.0 != 0 {
        return TRUE;
    }

    let title_len = unsafe { GetWindowTextLengthW(hwnd) };
    if title_len == 0 {
        return TRUE;
    }

    let mut buf = vec![0u16; (title_len + 1) as usize];
    let written = unsafe { GetWindowTextW(hwnd, &mut buf) };
    let title = String::from_utf16_lossy(&buf[..(written as usize).min(buf.len())]);
    if title.trim().is_empty() {
        return TRUE;
    }

    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        return TRUE;
    }

    let state = unsafe { &*(lparam.0 as *const Mutex<Vec<WindowEntry>>) };
    if let Ok(mut entries) = state.lock() {
        entries.push(WindowEntry { hwnd, pid, title });
    }
    TRUE
}

fn exe_path_for_pid(pid: u32) -> Option<String> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }

    let mut buf = [0u16; 1024];
    let mut len = buf.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut len) } != 0;
    unsafe {
        CloseHandle(handle);
    }

    if !ok || len == 0 {
        return None;
    }

    Some(String::from_utf16_lossy(&buf[..len as usize]))
}

fn basename_from_path(path: &str) -> Option<String> {
    if path.trim().is_empty() {
        None
    } else {
        let name = path
            .rsplit(|c| c == '\\' || c == '/')
            .next()
            .unwrap_or(path)
            .trim();
        if name.is_empty() {
            None
        } else {
            Some(name.to_string())
        }
    }
}

fn strip_exe_suffix(basename: &str) -> String {
    if basename.to_lowercase().ends_with(".exe") {
        basename[..basename.len() - 4].to_string()
    } else {
        basename.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_app_enumeration_strips_exe_suffix_case_insensitively() {
        assert_eq!(strip_exe_suffix("notepad.exe"), "notepad");
        assert_eq!(strip_exe_suffix("NOTEPAD.EXE"), "NOTEPAD");
        assert_eq!(strip_exe_suffix("Code.Exe"), "Code");
        assert_eq!(strip_exe_suffix("archive.exe.bak"), "archive.exe.bak");
    }

    #[test]
    fn windows_app_enumeration_extracts_basename_from_windows_or_slash_paths() {
        assert_eq!(
            basename_from_path(r"C:\Windows\System32\notepad.exe").as_deref(),
            Some("notepad.exe")
        );
        assert_eq!(
            basename_from_path("C:/Program Files/App/app.exe").as_deref(),
            Some("app.exe")
        );
        assert_eq!(basename_from_path("").as_deref(), None);
    }

    #[test]
    fn windows_app_enumeration_groups_by_pid_and_prefers_exe_name() {
        let apps = apps_from_window_entries(
            vec![
                WindowEntry {
                    hwnd: HWND(100 as *mut c_void),
                    pid: 42,
                    title: "First Window".to_string(),
                },
                WindowEntry {
                    hwnd: HWND(101 as *mut c_void),
                    pid: 42,
                    title: "Second Window".to_string(),
                },
                WindowEntry {
                    hwnd: HWND(102 as *mut c_void),
                    pid: 7,
                    title: "Fallback Window".to_string(),
                },
            ],
            |pid| {
                if pid == 42 {
                    Some(r"C:\Windows\System32\notepad.exe".to_string())
                } else {
                    None
                }
            },
        );

        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0].name, "Fallback Window");
        assert_eq!(apps[0].pid, Some(7));
        assert_eq!(apps[0].bundle_id, None);
        assert!(apps[0].running);
        assert_eq!(apps[0].last_used_ms, None);
        assert_eq!(apps[0].launch_count, 0);
        assert_eq!(apps[1].name, "notepad");
        assert_eq!(apps[1].pid, Some(42));
    }

    #[test]
    fn windows_app_enumeration_resolves_window_by_pid_or_name() {
        let entries = vec![
            WindowEntry {
                hwnd: HWND(200 as *mut c_void),
                pid: 42,
                title: "Untitled - Notepad".to_string(),
            },
            WindowEntry {
                hwnd: HWND(201 as *mut c_void),
                pid: 7,
                title: "Calculator".to_string(),
            },
        ];

        let by_pid =
            resolve_window_from_entries(entries.clone(), |_| None, &AppSelector::by_pid(7))
                .unwrap();
        assert_eq!(by_pid.0 as usize, 201);

        let by_name =
            resolve_window_from_entries(entries, |_| None, &AppSelector::by_name("notepad"))
                .unwrap();
        assert_eq!(by_name.0 as usize, 200);
    }
}
