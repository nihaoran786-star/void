//! Tauri commands for Computer use (permissions + settings deep links).

use crate::api::app_state::AppState;
use crate::computer_use::DesktopComputerUseHost;
use serde::{Deserialize, Serialize};
use tauri::State;
use void_core::agentic::tools::computer_use_host::ComputerUseHost;
use void_core::service::config::types::AIConfig;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputerUseStatusResponse {
    pub computer_use_enabled: bool,
    pub accessibility_granted: bool,
    pub screen_capture_granted: bool,
    pub platform_note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputerUseOpenSettingsRequest {
    /// `accessibility` | `screen_capture`
    pub pane: String,
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, Clone, PartialEq, Eq)]
struct WindowsSettingsUnsupported {
    error_code: &'static str,
    pane: String,
    platform: &'static str,
    suggested_pane: Option<&'static str>,
    message: String,
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, Clone, PartialEq, Eq)]
enum WindowsSettingsPaneRoute {
    Uri(&'static str),
    Unsupported(WindowsSettingsUnsupported),
}

#[cfg(any(target_os = "windows", test))]
fn windows_settings_pane_route(pane: &str) -> WindowsSettingsPaneRoute {
    match pane {
        "screen_capture" => {
            WindowsSettingsPaneRoute::Uri("ms-settings:privacy-graphicscaptureprogrammatic")
        }
        "accessibility" => WindowsSettingsPaneRoute::Unsupported(WindowsSettingsUnsupported {
            error_code: "windows_accessibility_settings_unsupported",
            pane: pane.to_string(),
            platform: "windows",
            suggested_pane: Some("screen_capture"),
            message: "Windows does not expose a Computer Use accessibility permission pane equivalent to macOS. Use screen_capture for Windows Graphics Capture permissions.".to_string(),
        }),
        other => WindowsSettingsPaneRoute::Unsupported(WindowsSettingsUnsupported {
            error_code: "windows_settings_pane_unknown",
            pane: other.to_string(),
            platform: "windows",
            suggested_pane: None,
            message: format!("Unknown Windows Computer Use settings pane: {other}"),
        }),
    }
}

#[cfg(any(target_os = "windows", test))]
fn format_windows_settings_unsupported(unsupported: WindowsSettingsUnsupported) -> String {
    match unsupported.suggested_pane {
        Some(suggested_pane) => format!(
            "[{}] platform={} pane={} suggestedPane={}: {}",
            unsupported.error_code,
            unsupported.platform,
            unsupported.pane,
            suggested_pane,
            unsupported.message
        ),
        None => format!(
            "[{}] platform={} pane={}: {}",
            unsupported.error_code, unsupported.platform, unsupported.pane, unsupported.message
        ),
    }
}

#[tauri::command]
pub async fn computer_use_get_status(
    state: State<'_, AppState>,
) -> Result<ComputerUseStatusResponse, String> {
    let ai: AIConfig = state
        .config_service
        .get_config(Some("ai"))
        .await
        .map_err(|e| e.to_string())?;

    let host = DesktopComputerUseHost::new();
    let snap = host
        .permission_snapshot()
        .await
        .map_err(|e| e.to_string())?;

    Ok(ComputerUseStatusResponse {
        computer_use_enabled: ai.computer_use_enabled,
        accessibility_granted: snap.accessibility_granted,
        screen_capture_granted: snap.screen_capture_granted,
        platform_note: snap.platform_note,
    })
}

#[tauri::command]
pub async fn computer_use_request_permissions() -> Result<(), String> {
    let host = DesktopComputerUseHost::new();
    host.prompt_for_missing_permissions();
    Ok(())
}

#[tauri::command]
pub async fn computer_use_open_system_settings(
    request: ComputerUseOpenSettingsRequest,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let url = match request.pane.as_str() {
            "accessibility" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
            }
            "screen_capture" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
            }
            _ => return Err(format!("Unknown settings pane: {}", request.pane)),
        };
        std::process::Command::new("open")
            .arg(url)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        match windows_settings_pane_route(&request.pane) {
            WindowsSettingsPaneRoute::Uri(uri) => {
                let status = std::process::Command::new("cmd")
                    .args(["/C", "start", "", uri])
                    .status()
                    .map_err(|e| e.to_string())?;
                if status.success() {
                    Ok(())
                } else {
                    Err(format!(
                        "[windows_settings_launch_failed] pane={} uri={} status={}",
                        request.pane, uri, status
                    ))
                }
            }
            WindowsSettingsPaneRoute::Unsupported(unsupported) => {
                Err(format_windows_settings_unsupported(unsupported))
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        let _ = request;
        return Err(
            "Open system settings: use your desktop environment privacy settings.".to_string(),
        );
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = request;
        Err("Unsupported platform.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        format_windows_settings_unsupported, windows_settings_pane_route, WindowsSettingsPaneRoute,
    };

    #[test]
    fn windows_settings_route_maps_screen_capture_to_graphics_capture_privacy() {
        assert_eq!(
            windows_settings_pane_route("screen_capture"),
            WindowsSettingsPaneRoute::Uri("ms-settings:privacy-graphicscaptureprogrammatic")
        );
    }

    #[test]
    fn windows_settings_route_reports_accessibility_as_explicitly_unsupported() {
        let route = windows_settings_pane_route("accessibility");

        let WindowsSettingsPaneRoute::Unsupported(unsupported) = route else {
            panic!("accessibility should be unsupported on Windows")
        };
        assert_eq!(
            unsupported.error_code,
            "windows_accessibility_settings_unsupported"
        );
        assert_eq!(unsupported.platform, "windows");
        assert_eq!(unsupported.pane, "accessibility");
        assert_eq!(unsupported.suggested_pane, Some("screen_capture"));

        let message = format_windows_settings_unsupported(unsupported);
        assert!(message.contains("[windows_accessibility_settings_unsupported]"));
        assert!(message.contains("suggestedPane=screen_capture"));
    }

    #[test]
    fn windows_settings_route_reports_unknown_panes_with_stable_error_code() {
        let route = windows_settings_pane_route("camera");

        let WindowsSettingsPaneRoute::Unsupported(unsupported) = route else {
            panic!("unknown pane should be unsupported on Windows")
        };
        assert_eq!(unsupported.error_code, "windows_settings_pane_unknown");
        assert_eq!(unsupported.platform, "windows");
        assert_eq!(unsupported.pane, "camera");
        assert_eq!(unsupported.suggested_pane, None);
    }
}
