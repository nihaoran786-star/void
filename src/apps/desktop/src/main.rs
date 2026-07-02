// Hide console window in Windows release builds
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() {
    configure_process_dpi_awareness();
    std::env::set_var("RUST_MIN_STACK", "8388608"); // 8MB
    void_desktop_lib::run().await
}

#[cfg(target_os = "windows")]
fn configure_process_dpi_awareness() {
    use windows::Win32::UI::HiDpi::{
        SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };

    // Screen capture and mouse coordinates must share the same per-monitor
    // coordinate space. Ignore failure because Windows returns an error if
    // DPI awareness was already fixed by a manifest or earlier framework init.
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
}

#[cfg(not(target_os = "windows"))]
fn configure_process_dpi_awareness() {}
