//! Desktop Computer use host (screenshots + enigo).

mod desktop_host;
mod interactive_filter;
#[cfg(target_os = "linux")]
mod linux_ax_ui;
#[cfg(target_os = "macos")]
mod macos_ax_dump;
#[cfg(any(test, target_os = "macos"))]
mod macos_ax_snapshot_plan;
#[cfg(target_os = "macos")]
mod macos_ax_ui;
#[cfg(target_os = "macos")]
mod macos_ax_write;
#[cfg(target_os = "macos")]
mod macos_bg_input;
#[cfg(any(test, target_os = "macos"))]
mod macos_chromium_click_plan;
#[cfg(any(test, target_os = "macos"))]
mod macos_dual_post;
#[cfg(any(test, target_os = "macos"))]
mod macos_focus_plan;
#[cfg(any(test, target_os = "macos"))]
mod macos_key_parity_plan;
#[cfg(target_os = "macos")]
mod macos_list_apps;
#[cfg(any(test, target_os = "macos"))]
mod macos_pointer_parity_plan;
#[cfg(any(test, target_os = "macos"))]
mod macos_skylight;
mod screen_ocr;
mod som_overlay;
mod terminal_detect;
mod ui_locate_common;
#[cfg(target_os = "windows")]
mod windows_ax_ui;
#[cfg(target_os = "windows")]
mod windows_bg_input;
#[cfg(target_os = "windows")]
mod windows_capture;
#[cfg(target_os = "windows")]
mod windows_list_apps;
#[cfg(target_os = "windows")]
mod windows_msaa;
#[cfg(target_os = "windows")]
mod windows_wgc_capture;

pub use desktop_host::DesktopComputerUseHost;
