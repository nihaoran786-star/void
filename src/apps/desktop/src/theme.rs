//! Theme System

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{OnceLock, RwLock};
use std::time::Instant;

use dark_light::Mode;
use log::{debug, error, warn};
use tauri::webview::PageLoadEvent;
use tauri::{Emitter, Manager, WebviewUrl};
use void_core::infrastructure::try_get_path_manager_arc;
use void_core::service::config::types::GlobalConfig;

const AGENT_COMPANION_WINDOW_LABEL: &str = "agent-companion-pet";
const AGENT_COMPANION_WINDOW_MIN_SIZE: f64 = 96.0;
const AGENT_COMPANION_WINDOW_MAX_WIDTH: f64 = 360.0;
const AGENT_COMPANION_WINDOW_MAX_HEIGHT: f64 = 240.0;
const AGENT_COMPANION_WINDOW_MARGIN: i32 = 64;
const AGENT_COMPANION_WINDOW_EDGE_MARGIN: f64 = 8.0;
const COMPACT_CHAT_WINDOW_LABEL: &str = "compact-chat-floating";
const COMPACT_CHAT_WINDOW_DEFAULT_WIDTH: f64 = 420.0;
const COMPACT_CHAT_WINDOW_DEFAULT_HEIGHT: f64 = 680.0;
const COMPACT_CHAT_WINDOW_MIN_WIDTH: f64 = 320.0;
const COMPACT_CHAT_WINDOW_MIN_HEIGHT: f64 = 420.0;
const COMPACT_CHAT_WINDOW_MAX_WIDTH: f64 = 560.0;
const COMPACT_CHAT_WINDOW_MAX_HEIGHT: f64 = 760.0;
const COMPACT_CHAT_WINDOW_MARGIN: i32 = 64;
const COMPACT_CHAT_WINDOW_EDGE_MARGIN: f64 = 8.0;
const TEAM_WORKSPACE_WINDOW_LABEL: &str = "team-workspace-window";
const TEAM_WORKSPACE_WINDOW_DEFAULT_WIDTH: f64 = 460.0;
const TEAM_WORKSPACE_WINDOW_DEFAULT_HEIGHT: f64 = 818.0;
const TEAM_WORKSPACE_WINDOW_MIN_WIDTH: f64 = 420.0;
const TEAM_WORKSPACE_WINDOW_MIN_HEIGHT: f64 = 400.0;
const TEAM_WORKSPACE_WINDOW_EDGE_MARGIN: f64 = 8.0;
/// The Team window is a portrait satellite of the main window: it keeps the
/// main window's height and takes its width from this aspect, so it always
/// reads as one tall companion column rather than a second application.
const TEAM_WORKSPACE_WINDOW_ASPECT: f64 = 9.0 / 16.0;
/// The pair does not fill the display. These fractions are measured from the
/// layout the owner accepted: the pair is centred, leaving a visible margin on
/// every side rather than sitting flush against the screen edges.
const PAIRED_LAYOUT_WIDTH_FRACTION: f64 = 0.90;
const PAIRED_LAYOUT_HEIGHT_FRACTION: f64 = 0.85;
/// Gutter between the two windows.
const PAIRED_LAYOUT_GAP: f64 = 8.0;
/// Below this the display is too small to split, so the main window keeps the
/// whole work area instead.
const PAIRED_MAIN_WINDOW_MIN_WIDTH: f64 = 880.0;
static MAIN_WINDOW_INITIAL_LAYOUT_APPLIED: AtomicBool = AtomicBool::new(false);
static AGENT_COMPANION_WINDOW_OPS: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
static AGENT_COMPANION_WINDOW_LAST_POSITION: OnceLock<RwLock<Option<tauri::LogicalPosition<f64>>>> =
    OnceLock::new();
static COMPACT_CHAT_WINDOW_OPS: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
static COMPACT_CHAT_WINDOW_LAST_POSITION: OnceLock<RwLock<Option<tauri::LogicalPosition<f64>>>> =
    OnceLock::new();
static TEAM_WORKSPACE_WINDOW_OPS: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
/// The Team window is destroyed on close and rebuilt on the next open, so its
/// remembered geometry has to carry the size as well as the corner. Keeping
/// only the corner left a rebuilt window on its build-time default size.
static TEAM_WORKSPACE_WINDOW_LAST_FRAME: OnceLock<RwLock<Option<(f64, f64, f64, f64)>>> =
    OnceLock::new();

fn agent_companion_window_ops() -> &'static tokio::sync::Mutex<()> {
    AGENT_COMPANION_WINDOW_OPS.get_or_init(|| tokio::sync::Mutex::new(()))
}

fn agent_companion_window_last_position() -> &'static RwLock<Option<tauri::LogicalPosition<f64>>> {
    AGENT_COMPANION_WINDOW_LAST_POSITION.get_or_init(|| RwLock::new(None))
}

fn compact_chat_window_ops() -> &'static tokio::sync::Mutex<()> {
    COMPACT_CHAT_WINDOW_OPS.get_or_init(|| tokio::sync::Mutex::new(()))
}

fn compact_chat_window_last_position() -> &'static RwLock<Option<tauri::LogicalPosition<f64>>> {
    COMPACT_CHAT_WINDOW_LAST_POSITION.get_or_init(|| RwLock::new(None))
}

fn team_workspace_window_ops() -> &'static tokio::sync::Mutex<()> {
    TEAM_WORKSPACE_WINDOW_OPS.get_or_init(|| tokio::sync::Mutex::new(()))
}

fn team_workspace_window_last_frame() -> &'static RwLock<Option<(f64, f64, f64, f64)>> {
    TEAM_WORKSPACE_WINDOW_LAST_FRAME.get_or_init(|| RwLock::new(None))
}

/// Keep a window frame fully inside a work area. When the frame is larger than
/// the area the frame is pinned to the area origin instead of being pushed
/// off-screen by a negative maximum.
fn clamp_frame_into_work_area(
    area: (f64, f64, f64, f64),
    frame: (f64, f64, f64, f64),
    edge_margin: f64,
) -> (f64, f64) {
    let (area_x, area_y, area_width, area_height) = area;
    let (x, y, width, height) = frame;
    let min_x = area_x + edge_margin;
    let min_y = area_y + edge_margin;
    let max_x = area_x + area_width - width - edge_margin;
    let max_y = area_y + area_height - height - edge_margin;
    (
        if max_x >= min_x {
            x.clamp(min_x, max_x)
        } else {
            area_x
        },
        if max_y >= min_y {
            y.clamp(min_y, max_y)
        } else {
            area_y
        },
    )
}

/// The main window's frame in the paired desktop layout.
///
/// The pair does not fill the display: it is inset and centred, so the margin
/// left of the main window equals the margin right of the Team window. The
/// Team window is a portrait column of a fixed aspect, and the main window
/// takes whatever is left of the pair.
///
/// Returns `None` when the display is too narrow to split usefully; the caller
/// then keeps the whole work area for the main window.
fn paired_main_window_frame(
    area: (f64, f64, f64, f64),
    width_fraction: f64,
    height_fraction: f64,
    gap: f64,
    team_aspect: f64,
    min_width: f64,
) -> Option<(f64, f64, f64, f64)> {
    let (area_x, area_y, area_width, area_height) = area;
    let pair_width = area_width * width_fraction;
    let height = area_height * height_fraction;
    let width = pair_width - gap - height * team_aspect;
    if width < min_width || height <= 0.0 {
        return None;
    }
    let x = area_x + (area_width - pair_width) / 2.0;
    let y = area_y + (area_height - height) / 2.0;
    Some((x, y, width, height))
}

/// Place the Team window beside the main window as its portrait satellite: the
/// same top and bottom edges, a width taken from the shared height and the
/// window's aspect, and a right edge as far from the screen edge as the main
/// window starts from the left one.
///
/// Mirroring the main window's own outer margin — rather than filling to a
/// fixed edge margin — is what makes the pair read as symmetric wherever the
/// user has put the main window. When the leftover space is too narrow for
/// that, the window is pushed to start one gutter past the main window rather
/// than sit on top of it.
fn mirrored_frame_beside_main_window(
    area: (f64, f64, f64, f64),
    main: (f64, f64, f64, f64),
    gap: f64,
    aspect: f64,
    min_width: f64,
) -> (f64, f64, f64, f64) {
    let (area_x, _area_y, area_width, _area_height) = area;
    let (main_x, main_y, main_width, main_height) = main;

    let outer_margin = (main_x - area_x).max(0.0);
    let right_edge = area_x + area_width - outer_margin;
    let width = (main_height * aspect).max(min_width);
    let x = (right_edge - width).max(main_x + main_width + gap);

    // The frame is already placed symmetrically, so the clamp is only a
    // last-resort guard against leaving the display; it must not impose a
    // margin of its own and pull the pair out of alignment.
    let (clamped_x, clamped_y) =
        clamp_frame_into_work_area(area, (x, main_y, width, main_height), 0.0);
    (clamped_x, clamped_y, width, main_height)
}

/// Centre a window frame inside a work area. The result is still clamped, so a
/// frame larger than the area lands on the area origin rather than a negative
/// coordinate.
fn centered_frame_in_work_area(area: (f64, f64, f64, f64), width: f64, height: f64) -> (f64, f64) {
    let (area_x, area_y, area_width, area_height) = area;
    let x = area_x + (area_width - width) / 2.0;
    let y = area_y + (area_height - height) / 2.0;
    clamp_frame_into_work_area(
        area,
        (x, y, width, height),
        TEAM_WORKSPACE_WINDOW_EDGE_MARGIN,
    )
}

fn remember_team_workspace_window_frame(frame: (f64, f64, f64, f64)) {
    match team_workspace_window_last_frame().write() {
        Ok(mut last_frame) => {
            *last_frame = Some(frame);
        }
        Err(error) => {
            warn!("Failed to remember team workspace window frame: {}", error);
        }
    }
}

fn remembered_team_workspace_window_frame() -> Option<(f64, f64, f64, f64)> {
    team_workspace_window_last_frame()
        .read()
        .ok()
        .and_then(|frame| *frame)
}

/// The window's own logical frame, when it can be measured.
fn team_workspace_window_frame(window: &tauri::WebviewWindow) -> Option<(f64, f64, f64, f64)> {
    let scale_factor = window.scale_factor().ok()?;
    let position = window
        .outer_position()
        .ok()?
        .to_logical::<f64>(scale_factor);
    let size = window.outer_size().ok()?.to_logical::<f64>(scale_factor);
    Some((position.x, position.y, size.width, size.height))
}

fn team_workspace_window_effective_size(window: &tauri::WebviewWindow) -> tauri::LogicalSize<f64> {
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    window
        .outer_size()
        .ok()
        .map(|size| size.to_logical::<f64>(scale_factor))
        .unwrap_or_else(|| {
            tauri::LogicalSize::new(
                TEAM_WORKSPACE_WINDOW_DEFAULT_WIDTH,
                TEAM_WORKSPACE_WINDOW_DEFAULT_HEIGHT,
            )
        })
}

/// The main window's logical frame, when it exists and can be measured.
fn main_window_frame(app: &tauri::AppHandle) -> Option<(f64, f64, f64, f64)> {
    let window = app.get_webview_window("main")?;
    let scale_factor = window.scale_factor().ok()?;
    let position = window
        .outer_position()
        .ok()?
        .to_logical::<f64>(scale_factor);
    let size = window.outer_size().ok()?.to_logical::<f64>(scale_factor);
    if size.width <= 0.0 || size.height <= 0.0 {
        return None;
    }
    Some((position.x, position.y, size.width, size.height))
}

/// Restore the last user position when the window is reopened. On its first
/// placement the window mirrors the main window instead, so the pair fills the
/// display symmetrically. Dragging the window to a second display therefore
/// survives close/reopen within one application run.
fn position_team_workspace_window(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let Some((area_position, area_size)) = work_area_for_agent_companion_window(app, window) else {
        return;
    };

    let size = team_workspace_window_effective_size(window);
    let area = (
        area_position.x,
        area_position.y,
        area_size.width,
        area_size.height,
    );

    // Whatever branch runs, the size is applied explicitly: a window rebuilt
    // after a close starts at its build-time default, not at the frame the user
    // last saw.
    let (x, y, width, height) = match remembered_team_workspace_window_frame() {
        Some((last_x, last_y, last_width, last_height)) => {
            let (x, y) = clamp_frame_into_work_area(
                area,
                (last_x, last_y, last_width, last_height),
                TEAM_WORKSPACE_WINDOW_EDGE_MARGIN,
            );
            (x, y, last_width, last_height)
        }
        None => match main_window_frame(app) {
            Some(main) => mirrored_frame_beside_main_window(
                area,
                main,
                PAIRED_LAYOUT_GAP,
                TEAM_WORKSPACE_WINDOW_ASPECT,
                TEAM_WORKSPACE_WINDOW_MIN_WIDTH,
            ),
            None => {
                let (x, y) = centered_frame_in_work_area(area, size.width, size.height);
                (x, y, size.width, size.height)
            }
        },
    };

    if let Err(e) = window.set_size(tauri::LogicalSize::new(width, height)) {
        warn!("Failed to size team workspace window: {}", e);
    }
    if let Err(e) = window.set_position(tauri::LogicalPosition::new(x, y)) {
        warn!("Failed to position team workspace window: {}", e);
    } else {
        remember_team_workspace_window_frame((x, y, width, height));
    }
    debug!(
        "Team workspace window placed: x={} y={} width={} height={}",
        x, y, width, height
    );
}

fn remember_agent_companion_window_position(position: tauri::LogicalPosition<f64>) {
    match agent_companion_window_last_position().write() {
        Ok(mut last_position) => {
            *last_position = Some(position);
        }
        Err(error) => {
            warn!(
                "Failed to remember Agent companion window position: {}",
                error
            );
        }
    }
}

fn remembered_agent_companion_window_position() -> Option<tauri::LogicalPosition<f64>> {
    agent_companion_window_last_position()
        .read()
        .ok()
        .and_then(|position| *position)
}

fn remember_compact_chat_window_position(position: tauri::LogicalPosition<f64>) {
    match compact_chat_window_last_position().write() {
        Ok(mut last_position) => {
            *last_position = Some(position);
        }
        Err(error) => {
            warn!("Failed to remember compact chat window position: {}", error);
        }
    }
}

fn remembered_compact_chat_window_position() -> Option<tauri::LogicalPosition<f64>> {
    compact_chat_window_last_position()
        .read()
        .ok()
        .and_then(|position| *position)
}

fn work_area_for_agent_companion_window(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
) -> Option<(tauri::LogicalPosition<f64>, tauri::LogicalSize<f64>)> {
    let monitor: Option<tauri::Monitor> = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let monitor = monitor?;
    let scale_factor = monitor.scale_factor();
    let area = monitor.work_area();
    Some((
        area.position.to_logical::<f64>(scale_factor),
        area.size.to_logical::<f64>(scale_factor),
    ))
}

fn clamp_agent_companion_window_position(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    position: tauri::LogicalPosition<f64>,
    size: tauri::LogicalSize<f64>,
) -> tauri::LogicalPosition<f64> {
    let Some((area_position, area_size)) = work_area_for_agent_companion_window(app, window) else {
        return position;
    };

    let min_x = area_position.x + AGENT_COMPANION_WINDOW_EDGE_MARGIN;
    let min_y = area_position.y + AGENT_COMPANION_WINDOW_EDGE_MARGIN;
    let max_x = area_position.x + area_size.width - size.width - AGENT_COMPANION_WINDOW_EDGE_MARGIN;
    let max_y =
        area_position.y + area_size.height - size.height - AGENT_COMPANION_WINDOW_EDGE_MARGIN;
    tauri::LogicalPosition::new(
        if max_x >= min_x {
            position.x.clamp(min_x, max_x)
        } else {
            area_position.x
        },
        if max_y >= min_y {
            position.y.clamp(min_y, max_y)
        } else {
            area_position.y
        },
    )
}

fn clamp_compact_chat_window_position(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    position: tauri::LogicalPosition<f64>,
    size: tauri::LogicalSize<f64>,
) -> tauri::LogicalPosition<f64> {
    let Some((area_position, area_size)) = work_area_for_agent_companion_window(app, window) else {
        return position;
    };

    let min_x = area_position.x + COMPACT_CHAT_WINDOW_EDGE_MARGIN;
    let min_y = area_position.y + COMPACT_CHAT_WINDOW_EDGE_MARGIN;
    let max_x = area_position.x + area_size.width - size.width - COMPACT_CHAT_WINDOW_EDGE_MARGIN;
    let max_y = area_position.y + area_size.height - size.height - COMPACT_CHAT_WINDOW_EDGE_MARGIN;
    tauri::LogicalPosition::new(
        if max_x >= min_x {
            position.x.clamp(min_x, max_x)
        } else {
            area_position.x
        },
        if max_y >= min_y {
            position.y.clamp(min_y, max_y)
        } else {
            area_position.y
        },
    )
}

#[derive(Debug, Clone)]
pub struct ThemeConfig {
    pub id: String,
    pub bg_primary: String,
    pub bg_secondary: String,
    pub bg_scene: String,
    pub is_light: bool,
    pub text_primary: String,
    pub text_muted: String,
    pub accent_color: String,
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self::get_builtin_theme("void-light").unwrap_or_else(|| Self {
            id: "void-light".to_string(),
            bg_primary: "#f3f3f5".to_string(),
            bg_secondary: "#ffffff".to_string(),
            bg_scene: "#ffffff".to_string(),
            is_light: true,
            text_primary: "#1e293b".to_string(),
            text_muted: "#64748b".to_string(),
            accent_color: "#64748b".to_string(),
        })
    }
}

impl ThemeConfig {
    pub fn get_builtin_theme(theme_id: &str) -> Option<Self> {
        match theme_id {
            "void-slate" => Some(Self {
                id: theme_id.to_string(),
                bg_primary: "#1a1c1e".to_string(),
                bg_secondary: "#1a1c1e".to_string(),
                bg_scene: "#1d2023".to_string(),
                is_light: false,
                text_primary: "#e4e6e8".to_string(),
                text_muted: "#8a8d92".to_string(),
                accent_color: "#6b9bd5".to_string(),
            }),
            "void-dark" => Some(Self {
                id: theme_id.to_string(),
                bg_primary: "#121214".to_string(),
                bg_secondary: "#18181a".to_string(),
                bg_scene: "#16161a".to_string(),
                is_light: false,
                text_primary: "#e8e8e8".to_string(),
                text_muted: "rgba(255, 255, 255, 0.4)".to_string(),
                accent_color: "#60a5fa".to_string(),
            }),
            "void-midnight" => Some(Self {
                id: theme_id.to_string(),
                bg_primary: "#2b2d30".to_string(),
                bg_secondary: "#1e1f22".to_string(),
                bg_scene: "#27292c".to_string(),
                is_light: false,
                text_primary: "#bcbec4".to_string(),
                text_muted: "rgba(255, 255, 255, 0.4)".to_string(),
                accent_color: "#6c9eff".to_string(),
            }),
            "void-cyber" => Some(Self {
                id: theme_id.to_string(),
                bg_primary: "#101010".to_string(),
                bg_secondary: "#151515".to_string(),
                bg_scene: "#141414".to_string(),
                is_light: false,
                text_primary: "#e0f2ff".to_string(),
                text_muted: "rgba(255, 255, 255, 0.4)".to_string(),
                accent_color: "#00e6ff".to_string(),
            }),
            "void-tokyo-night" => Some(Self {
                id: theme_id.to_string(),
                bg_primary: "#1a1b26".to_string(),
                bg_secondary: "#16161e".to_string(),
                bg_scene: "#1a1b26".to_string(),
                is_light: false,
                text_primary: "#c0caf5".to_string(),
                text_muted: "rgba(255, 255, 255, 0.4)".to_string(),
                accent_color: "#7aa2f7".to_string(),
            }),
            "void-china-night" => Some(Self {
                id: theme_id.to_string(),
                bg_primary: "#1a1814".to_string(),
                bg_secondary: "#141210".to_string(),
                bg_scene: "#1e1c17".to_string(),
                is_light: false,
                text_primary: "#e8e6e1".to_string(),
                text_muted: "rgba(255, 255, 255, 0.4)".to_string(),
                accent_color: "#c4a35a".to_string(),
            }),
            "void-light" => Some(Self {
                id: theme_id.to_string(),
                bg_primary: "#f3f3f5".to_string(),
                bg_secondary: "#ffffff".to_string(),
                bg_scene: "#ffffff".to_string(),
                is_light: true,
                text_primary: "#1e293b".to_string(),
                text_muted: "#64748b".to_string(),
                accent_color: "#64748b".to_string(),
            }),
            "void-china-style" => Some(Self {
                id: theme_id.to_string(),
                bg_primary: "#faf8f0".to_string(),
                bg_secondary: "#f5f3e8".to_string(),
                bg_scene: "#fdfcf6".to_string(),
                is_light: true,
                text_primary: "#1a1a1a".to_string(),
                text_muted: "rgba(0, 0, 0, 0.5)".to_string(),
                accent_color: "#2e5e8a".to_string(),
            }),
            _ => None,
        }
    }

    pub fn load_from_config() -> Self {
        let default = Self::default();

        let path_manager = match try_get_path_manager_arc() {
            Ok(pm) => pm,
            Err(e) => {
                debug!("Failed to create PathManager, using default theme: {}", e);
                return default;
            }
        };

        let config_file = path_manager.app_config_file();
        if !config_file.exists() {
            return default;
        }

        let config_content = match std::fs::read_to_string(&config_file) {
            Ok(content) => content,
            Err(e) => {
                debug!("Failed to read config file, using default theme: {}", e);
                return default;
            }
        };

        let global_config: GlobalConfig = match serde_json::from_str(&config_content) {
            Ok(config) => config,
            Err(e) => {
                debug!("Failed to parse config file, using default theme: {}", e);
                return default;
            }
        };

        let theme_id = global_config
            .themes
            .as_ref()
            .map(|t| t.current.as_str())
            .unwrap_or("void-light");

        let resolved_id = Self::resolve_builtin_theme_id(theme_id);

        match Self::get_builtin_theme(resolved_id) {
            Some(config) => config,
            None => {
                warn!("Unknown theme ID: {}, using default theme", theme_id);
                default
            }
        }
    }

    /// Maps config `themes.current` to a built-in id for splash / window chrome.
    /// `system` follows OS light/dark (aligned with web-ui `getSystemPreferredDefaultThemeId`).
    fn resolve_builtin_theme_id(theme_id: &str) -> &str {
        if theme_id == "system" {
            return match dark_light::detect() {
                Mode::Dark => "void-dark",
                Mode::Light | Mode::Default => "void-light",
            };
        }
        theme_id
    }

    pub fn generate_init_script(&self, startup_trace_id: &str) -> String {
        let theme_type = if self.is_light { "light" } else { "dark" };
        let startup_trace_id_json = serde_json::to_string(startup_trace_id)
            .unwrap_or_else(|_| "\"desktop-unknown\"".to_string());

        format!(
            r#"
            (function() {{
                window.__VOID_STARTUP_TRACE_ID__ = {startup_trace_id_json};
                function applyTheme() {{
                    var root = document.documentElement;
                    if (!root) return false;
                    
                    root.setAttribute('data-theme', '{id}');
                    root.setAttribute('data-theme-type', '{theme_type}');
                    
                    root.style.setProperty('--color-bg-primary', '{bg_primary}');
                    root.style.setProperty('--color-bg-secondary', '{bg_secondary}');
                    root.style.setProperty('--color-bg-tertiary', '{bg_primary}');
                    root.style.setProperty('--color-bg-workbench', '{bg_primary}');
                    root.style.setProperty('--color-bg-flowchat', '{bg_scene}');
                    root.style.setProperty('--color-bg-scene', '{bg_scene}');
                    root.style.setProperty('--color-text-primary', '{text_primary}');
                    
                    root.style.backgroundColor = '{bg_primary}';
                    
                    if (document.body) {{
                        document.body.style.backgroundColor = '{bg_primary}';
                    }}
                    
                    return true;
                }}
                
                if (document.documentElement) {{
                    applyTheme();
                }}
                
                if (document.readyState === 'loading') {{
                    document.addEventListener('DOMContentLoaded', applyTheme);
                }} else {{
                    applyTheme();
                }}
            }})();
            "#,
            id = self.id,
            theme_type = theme_type,
            bg_primary = self.bg_primary,
            bg_secondary = self.bg_secondary,
            bg_scene = self.bg_scene,
            text_primary = self.text_primary,
            startup_trace_id_json = startup_trace_id_json,
        )
    }

    pub fn to_tauri_color(&self) -> tauri::window::Color {
        let hex = self.bg_primary.trim_start_matches('#');
        let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(18);
        let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(18);
        let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(20);
        tauri::window::Color(r, g, b, 255)
    }
}

pub fn create_main_window(app_handle: &tauri::AppHandle, startup_trace_id: &str) {
    let total_started_at = Instant::now();
    let theme = ThemeConfig::load_from_config();
    let bg_color = theme.to_tauri_color();
    let init_script = theme.generate_init_script(startup_trace_id);
    debug!(
        "Main window creation step completed: step=prepare_theme duration_ms={}",
        total_started_at.elapsed().as_millis()
    );

    // Keep the main page an app URL in both development and production. Tauri
    // resolves app URLs against build.devUrl during development, while still
    // classifying the webview as local for command capability checks.
    let main_url = WebviewUrl::App("index.html".into());
    let main_url_kind = match &main_url {
        WebviewUrl::External(_) => "external",
        WebviewUrl::App(_) => "app",
        _ => "other",
    };

    #[allow(unused_mut)]
    let mut builder = tauri::WebviewWindowBuilder::new(app_handle, "main", main_url)
        .title("void")
        .inner_size(1200.0, 800.0)
        .resizable(true)
        .fullscreen(false)
        .visible(false)
        .background_color(bg_color)
        .accept_first_mouse(true)
        .initialization_script(&init_script)
        .on_page_load({
            let startup_trace_id = startup_trace_id.to_string();
            let total_started_at = total_started_at;
            move |_window, payload| {
                let event = match payload.event() {
                    PageLoadEvent::Started => "started",
                    PageLoadEvent::Finished => "finished",
                };
                debug!(
                    "Main window page load event: trace_id={}, event={}, url={}, since_create_start_ms={}",
                    startup_trace_id,
                    event,
                    payload.url(),
                    total_started_at.elapsed().as_millis()
                );
            }
        });

    // Keep HTML5 drag-and-drop working inside the webview for desktop UI drag targets.
    builder = builder.disable_drag_drop_handler();

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .decorations(true)
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .traffic_light_position(tauri::LogicalPosition::new(12.0, 15.0))
            .hidden_title(true);
    }

    #[cfg(target_os = "windows")]
    {
        builder = builder.decorations(false);
    }

    let build_started_at = Instant::now();
    match builder.build() {
        Ok(window) => {
            debug!(
                "Main window creation step completed: step=build url_kind={} duration_ms={} total_duration_ms={}",
                main_url_kind,
                build_started_at.elapsed().as_millis(),
                total_started_at.elapsed().as_millis()
            );
            #[cfg(any(debug_assertions, feature = "devtools"))]
            {
                if std::env::var("VOID_OPEN_DEVTOOLS")
                    .map(|v| v == "1")
                    .unwrap_or(false)
                {
                    let _ = window.open_devtools();
                }
            }

            show_main_window_for_startup(&window, total_started_at);
        }
        Err(e) => {
            error!(
                "Failed to create main window: error={} duration_ms={}",
                e,
                total_started_at.elapsed().as_millis()
            );
        }
    }
}

fn show_main_window_for_startup(window: &tauri::WebviewWindow, total_started_at: Instant) {
    // Open as the left two thirds of the display so the main and Team windows
    // form one symmetric, top/bottom aligned pair. Falls back to the previous
    // maximized startup when the display is too narrow to split.
    let step_started_at = Instant::now();
    let paired = apply_initial_main_window_layout(&window.app_handle().clone(), window);
    debug!(
        "Main window startup show step completed: step=paired_layout applied={} duration_ms={} since_create_start_ms={}",
        paired,
        step_started_at.elapsed().as_millis(),
        total_started_at.elapsed().as_millis()
    );

    #[cfg(target_os = "windows")]
    if !paired {
        let step_started_at = Instant::now();
        if let Err(error) = window.maximize() {
            warn!("Failed to maximize main window during startup: {}", error);
        } else {
            debug!(
                "Main window startup show step completed: step=maximize duration_ms={} since_create_start_ms={}",
                step_started_at.elapsed().as_millis(),
                total_started_at.elapsed().as_millis()
            );
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }

    let show_started_at = Instant::now();
    if let Err(error) = window.show() {
        warn!("Failed to show main window during startup: {}", error);
        return;
    }
    debug!(
        "Main window startup show step completed: step=show duration_ms={} since_create_start_ms={}",
        show_started_at.elapsed().as_millis(),
        total_started_at.elapsed().as_millis()
    );

    let focus_started_at = Instant::now();
    if let Err(error) = window.set_focus() {
        warn!("Failed to focus main window during startup: {}", error);
        return;
    }
    debug!(
        "Main window startup show step completed: step=focus duration_ms={} since_create_start_ms={}",
        focus_started_at.elapsed().as_millis(),
        total_started_at.elapsed().as_millis()
    );
}

fn app_url(path: &str) -> WebviewUrl {
    let app_path = if path.starts_with('?') {
        format!("index.html{}", path)
    } else {
        path.to_string()
    };
    WebviewUrl::App(app_path.into())
}

fn agent_companion_default_position(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
) -> Option<tauri::LogicalPosition<f64>> {
    let (area_position, area_size) = work_area_for_agent_companion_window(app, window)?;

    let monitor: Option<tauri::Monitor> = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let scale_factor = monitor
        .as_ref()
        .map(|monitor| monitor.scale_factor())
        .unwrap_or(1.0);
    let window_size = window
        .outer_size()
        .ok()
        .map(|size| size.to_logical::<f64>(scale_factor));
    let window_width = window_size
        .as_ref()
        .map(|size| size.width)
        .unwrap_or(AGENT_COMPANION_WINDOW_MIN_SIZE);
    let window_height = window_size
        .as_ref()
        .map(|size| size.height)
        .unwrap_or(AGENT_COMPANION_WINDOW_MIN_SIZE);
    let x =
        area_position.x + area_size.width - window_width - f64::from(AGENT_COMPANION_WINDOW_MARGIN);
    let y = area_position.y + area_size.height
        - window_height
        - f64::from(AGENT_COMPANION_WINDOW_MARGIN);

    Some(clamp_agent_companion_window_position(
        app,
        window,
        tauri::LogicalPosition::new(x, y),
        tauri::LogicalSize::new(window_width, window_height),
    ))
}

fn agent_companion_window_effective_size(window: &tauri::WebviewWindow) -> tauri::LogicalSize<f64> {
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let size = window
        .outer_size()
        .ok()
        .map(|size| size.to_logical::<f64>(scale_factor))
        .unwrap_or_else(|| {
            tauri::LogicalSize::new(
                AGENT_COMPANION_WINDOW_MIN_SIZE,
                AGENT_COMPANION_WINDOW_MIN_SIZE,
            )
        });

    tauri::LogicalSize::new(
        size.width.clamp(
            AGENT_COMPANION_WINDOW_MIN_SIZE,
            AGENT_COMPANION_WINDOW_MAX_WIDTH,
        ),
        size.height.clamp(
            AGENT_COMPANION_WINDOW_MIN_SIZE,
            AGENT_COMPANION_WINDOW_MAX_HEIGHT,
        ),
    )
}

fn position_agent_companion_window(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let Some(position) = remembered_agent_companion_window_position()
        .or_else(|| agent_companion_default_position(app, window))
    else {
        return;
    };

    let size = agent_companion_window_effective_size(window);
    let position = clamp_agent_companion_window_position(app, window, position, size);

    if let Err(e) = window.set_position(position) {
        warn!("Failed to position Agent companion window: {}", e);
    } else {
        remember_agent_companion_window_position(position);
    }
}

fn resize_agent_companion_window(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    width: f64,
    height: f64,
) {
    if !width.is_finite() || !height.is_finite() {
        warn!(
            "Ignored invalid Agent companion window size: width={}, height={}",
            width, height
        );
        return;
    }

    let width = width.clamp(
        AGENT_COMPANION_WINDOW_MIN_SIZE,
        AGENT_COMPANION_WINDOW_MAX_WIDTH,
    );
    let height = height.clamp(
        AGENT_COMPANION_WINDOW_MIN_SIZE,
        AGENT_COMPANION_WINDOW_MAX_HEIGHT,
    );
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let size = agent_companion_window_effective_size(window);
    if (size.width - width).abs() < 0.5 && (size.height - height).abs() < 0.5 {
        return;
    }

    let old_position = window
        .outer_position()
        .ok()
        .map(|position| position.to_logical::<f64>(scale_factor));

    if let Err(e) = window.set_size(tauri::LogicalSize::new(width, height)) {
        warn!("Failed to resize Agent companion window: {}", e);
        return;
    }

    // Keep the bottom-right corner fixed when bubbles change height. If we cannot
    // read the previous geometry (e.g. transient platform errors), avoid snapping
    // back to the default corner — that would feel like the pet "jumped".
    if let Some(position) = old_position {
        let next_position = clamp_agent_companion_window_position(
            app,
            window,
            tauri::LogicalPosition::new(
                position.x + size.width - width,
                position.y + size.height - height,
            ),
            tauri::LogicalSize::new(width, height),
        );
        if let Err(e) = window.set_position(next_position) {
            warn!("Failed to position Agent companion window: {}", e);
        } else {
            remember_agent_companion_window_position(next_position);
        }
    }
}

fn compact_chat_default_position(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
) -> Option<tauri::LogicalPosition<f64>> {
    let (area_position, area_size) = work_area_for_agent_companion_window(app, window)?;
    let x = area_position.x + area_size.width
        - COMPACT_CHAT_WINDOW_DEFAULT_WIDTH
        - f64::from(COMPACT_CHAT_WINDOW_MARGIN);
    let y = area_position.y + area_size.height
        - COMPACT_CHAT_WINDOW_DEFAULT_HEIGHT
        - f64::from(COMPACT_CHAT_WINDOW_MARGIN);

    Some(clamp_compact_chat_window_position(
        app,
        window,
        tauri::LogicalPosition::new(x, y),
        tauri::LogicalSize::new(
            COMPACT_CHAT_WINDOW_DEFAULT_WIDTH,
            COMPACT_CHAT_WINDOW_DEFAULT_HEIGHT,
        ),
    ))
}

fn compact_chat_window_effective_size(window: &tauri::WebviewWindow) -> tauri::LogicalSize<f64> {
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let size = window
        .outer_size()
        .ok()
        .map(|size| size.to_logical::<f64>(scale_factor))
        .unwrap_or_else(|| {
            tauri::LogicalSize::new(
                COMPACT_CHAT_WINDOW_DEFAULT_WIDTH,
                COMPACT_CHAT_WINDOW_DEFAULT_HEIGHT,
            )
        });

    tauri::LogicalSize::new(
        size.width
            .clamp(COMPACT_CHAT_WINDOW_MIN_WIDTH, COMPACT_CHAT_WINDOW_MAX_WIDTH),
        size.height.clamp(
            COMPACT_CHAT_WINDOW_MIN_HEIGHT,
            COMPACT_CHAT_WINDOW_MAX_HEIGHT,
        ),
    )
}

fn position_compact_chat_window(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let Some(position) = remembered_compact_chat_window_position()
        .or_else(|| compact_chat_default_position(app, window))
    else {
        return;
    };

    let size = compact_chat_window_effective_size(window);
    let position = clamp_compact_chat_window_position(app, window, position, size);

    if let Err(e) = window.set_position(position) {
        warn!("Failed to position compact chat window: {}", e);
    } else {
        remember_compact_chat_window_position(position);
    }
}

fn resize_compact_chat_window(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    width: f64,
    height: f64,
) {
    if !width.is_finite() || !height.is_finite() {
        warn!(
            "Ignored invalid compact chat window size: width={}, height={}",
            width, height
        );
        return;
    }

    let width = width.clamp(COMPACT_CHAT_WINDOW_MIN_WIDTH, COMPACT_CHAT_WINDOW_MAX_WIDTH);
    let height = height.clamp(
        COMPACT_CHAT_WINDOW_MIN_HEIGHT,
        COMPACT_CHAT_WINDOW_MAX_HEIGHT,
    );
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let old_size = compact_chat_window_effective_size(window);
    if (old_size.width - width).abs() < 0.5 && (old_size.height - height).abs() < 0.5 {
        return;
    }

    let old_position = window
        .outer_position()
        .ok()
        .map(|position| position.to_logical::<f64>(scale_factor));

    if let Err(e) = window.set_size(tauri::LogicalSize::new(width, height)) {
        warn!("Failed to resize compact chat window: {}", e);
        return;
    }

    if let Some(position) = old_position {
        let next_position = clamp_compact_chat_window_position(
            app,
            window,
            tauri::LogicalPosition::new(
                position.x + old_size.width - width,
                position.y + old_size.height - height,
            ),
            tauri::LogicalSize::new(width, height),
        );
        if let Err(e) = window.set_position(next_position) {
            warn!("Failed to position compact chat window: {}", e);
        } else {
            remember_compact_chat_window_position(next_position);
        }
    }
}

#[tauri::command]
pub async fn show_agent_companion_desktop_pet(app: tauri::AppHandle) -> Result<(), String> {
    let started_at = Instant::now();
    let _guard = agent_companion_window_ops().lock().await;
    debug!("Agent companion window show requested");

    // Reuse any existing window: never destroy here. A previous implementation destroyed
    // whenever `is_visible` was false, which raced with another `show` that had built the
    // window but not called `show()` yet (or with `hide`), producing duplicate pets or
    // stuck windows.
    if let Some(window) = app.get_webview_window(AGENT_COMPANION_WINDOW_LABEL) {
        if let Err(e) = window.unminimize() {
            warn!("Failed to unminimize Agent companion window: {}", e);
        }
        position_agent_companion_window(&app, &window);
        window.show().map_err(|e| {
            error!("Failed to show Agent companion window: {}", e);
            format!("Failed to show Agent companion window: {}", e)
        })?;
        debug!(
            "Agent companion window reused: total_duration_ms={}",
            started_at.elapsed().as_millis()
        );
        return Ok(());
    }

    let url = app_url("?voidWindow=agent-companion");
    let mut builder = tauri::WebviewWindowBuilder::new(&app, AGENT_COMPANION_WINDOW_LABEL, url)
        .title("void Agent Companion")
        .inner_size(
            AGENT_COMPANION_WINDOW_MIN_SIZE,
            AGENT_COMPANION_WINDOW_MIN_SIZE,
        )
        .max_inner_size(
            AGENT_COMPANION_WINDOW_MAX_WIDTH,
            AGENT_COMPANION_WINDOW_MAX_HEIGHT,
        )
        .min_inner_size(1.0, 1.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .visible(false)
        .accept_first_mouse(true)
        .background_color(tauri::window::Color(0, 0, 0, 0))
        .on_page_load({
            let started_at = started_at;
            move |_window, payload| {
                let event = match payload.event() {
                    PageLoadEvent::Started => "started",
                    PageLoadEvent::Finished => "finished",
                };
                debug!(
                    "Agent companion window page load event: event={}, url={}, since_show_request_ms={}",
                    event,
                    payload.url(),
                    started_at.elapsed().as_millis()
                );
            }
        });

    builder = builder.disable_drag_drop_handler();

    let build_started_at = Instant::now();
    let window = builder.build().map_err(|e| {
        error!(
            "Failed to create Agent companion window: error={} duration_ms={}",
            e,
            build_started_at.elapsed().as_millis()
        );
        format!("Failed to create Agent companion window: {}", e)
    })?;
    debug!(
        "Agent companion window creation step completed: step=build duration_ms={} total_duration_ms={}",
        build_started_at.elapsed().as_millis(),
        started_at.elapsed().as_millis()
    );

    position_agent_companion_window(&app, &window);

    let show_started_at = Instant::now();
    window.show().map_err(|e| {
        error!("Failed to show Agent companion window: {}", e);
        format!("Failed to show Agent companion window: {}", e)
    })?;
    debug!(
        "Agent companion window shown: show_duration_ms={} total_duration_ms={}",
        show_started_at.elapsed().as_millis(),
        started_at.elapsed().as_millis()
    );

    Ok(())
}

#[tauri::command]
pub async fn resize_agent_companion_desktop_pet(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let _guard = agent_companion_window_ops().lock().await;
    if let Some(window) = app.get_webview_window(AGENT_COMPANION_WINDOW_LABEL) {
        let app_for_resize = app.clone();
        let window_for_resize = window.clone();
        window
            .run_on_main_thread(move || {
                resize_agent_companion_window(&app_for_resize, &window_for_resize, width, height);
            })
            .map_err(|e| {
                warn!("Failed to schedule Agent companion window resize: {}", e);
                format!("Failed to schedule Agent companion window resize: {}", e)
            })?;
    }
    Ok(())
}

#[tauri::command]
pub async fn hide_agent_companion_desktop_pet(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = agent_companion_window_ops().lock().await;
    if let Some(window) = app.get_webview_window(AGENT_COMPANION_WINDOW_LABEL) {
        if let Ok(scale_factor) = window.scale_factor() {
            if let Ok(position) = window.outer_position() {
                remember_agent_companion_window_position(position.to_logical::<f64>(scale_factor));
            }
        }
        window.destroy().map_err(|e| {
            error!("Failed to destroy Agent companion window: {}", e);
            format!("Failed to destroy Agent companion window: {}", e)
        })?;
    }
    Ok(())
}

#[tauri::command]
pub async fn show_compact_chat_desktop_window(app: tauri::AppHandle) -> Result<(), String> {
    let started_at = Instant::now();
    let _guard = compact_chat_window_ops().lock().await;
    debug!("Compact chat window show requested");

    if let Some(window) = app.get_webview_window(COMPACT_CHAT_WINDOW_LABEL) {
        if let Err(e) = window.set_skip_taskbar(false) {
            warn!("Failed to keep compact chat window in taskbar: {}", e);
        }
        if let Err(e) = window.unminimize() {
            warn!("Failed to unminimize compact chat window: {}", e);
        }
        position_compact_chat_window(&app, &window);
        window.show().map_err(|e| {
            error!("Failed to show compact chat window: {}", e);
            format!("Failed to show compact chat window: {}", e)
        })?;
        if let Err(e) = window.set_focus() {
            warn!("Failed to focus compact chat window: {}", e);
        }
        debug!(
            "Compact chat window reused: total_duration_ms={}",
            started_at.elapsed().as_millis()
        );
        return Ok(());
    }

    let url = app_url("?voidWindow=compact-chat");
    let mut builder = tauri::WebviewWindowBuilder::new(&app, COMPACT_CHAT_WINDOW_LABEL, url)
        .title("void Compact Chat")
        .inner_size(
            COMPACT_CHAT_WINDOW_DEFAULT_WIDTH,
            COMPACT_CHAT_WINDOW_DEFAULT_HEIGHT,
        )
        .min_inner_size(COMPACT_CHAT_WINDOW_MIN_WIDTH, COMPACT_CHAT_WINDOW_MIN_HEIGHT)
        .max_inner_size(COMPACT_CHAT_WINDOW_MAX_WIDTH, COMPACT_CHAT_WINDOW_MAX_HEIGHT)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(false)
        .shadow(false)
        .visible(false)
        .accept_first_mouse(true)
        .background_color(tauri::window::Color(0, 0, 0, 0))
        .on_page_load({
            let started_at = started_at;
            move |_window, payload| {
                let event = match payload.event() {
                    PageLoadEvent::Started => "started",
                    PageLoadEvent::Finished => "finished",
                };
                debug!(
                    "Compact chat window page load event: event={}, url={}, since_show_request_ms={}",
                    event,
                    payload.url(),
                    started_at.elapsed().as_millis()
                );
            }
        });

    builder = builder.disable_drag_drop_handler();

    let build_started_at = Instant::now();
    let window = builder.build().map_err(|e| {
        error!(
            "Failed to create compact chat window: error={} duration_ms={}",
            e,
            build_started_at.elapsed().as_millis()
        );
        format!("Failed to create compact chat window: {}", e)
    })?;
    debug!(
        "Compact chat window creation step completed: step=build duration_ms={} total_duration_ms={}",
        build_started_at.elapsed().as_millis(),
        started_at.elapsed().as_millis()
    );

    position_compact_chat_window(&app, &window);
    debug!(
        "Compact chat window prepared hidden: total_duration_ms={}",
        started_at.elapsed().as_millis()
    );

    Ok(())
}

#[tauri::command]
pub async fn reveal_compact_chat_desktop_window(app: tauri::AppHandle) -> Result<(), String> {
    let started_at = Instant::now();
    let _guard = compact_chat_window_ops().lock().await;

    let Some(window) = app.get_webview_window(COMPACT_CHAT_WINDOW_LABEL) else {
        warn!("Compact chat window reveal requested before window exists");
        return Ok(());
    };

    if let Err(e) = window.set_skip_taskbar(false) {
        warn!("Failed to keep compact chat window in taskbar: {}", e);
    }
    if let Err(e) = window.unminimize() {
        warn!("Failed to unminimize compact chat window: {}", e);
    }
    position_compact_chat_window(&app, &window);
    window.show().map_err(|e| {
        error!("Failed to reveal compact chat window: {}", e);
        format!("Failed to reveal compact chat window: {}", e)
    })?;
    if let Err(e) = window.set_focus() {
        warn!("Failed to focus compact chat window: {}", e);
    }
    debug!(
        "Compact chat window revealed: total_duration_ms={}",
        started_at.elapsed().as_millis()
    );

    Ok(())
}

#[tauri::command]
pub async fn resize_compact_chat_desktop_window(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let _guard = compact_chat_window_ops().lock().await;
    if let Some(window) = app.get_webview_window(COMPACT_CHAT_WINDOW_LABEL) {
        let app_for_resize = app.clone();
        let window_for_resize = window.clone();
        window
            .run_on_main_thread(move || {
                resize_compact_chat_window(&app_for_resize, &window_for_resize, width, height);
            })
            .map_err(|e| {
                warn!("Failed to schedule compact chat window resize: {}", e);
                format!("Failed to schedule compact chat window resize: {}", e)
            })?;
    }
    Ok(())
}

#[tauri::command]
pub async fn hide_compact_chat_desktop_window(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = compact_chat_window_ops().lock().await;
    if let Some(window) = app.get_webview_window(COMPACT_CHAT_WINDOW_LABEL) {
        if let Ok(scale_factor) = window.scale_factor() {
            if let Ok(position) = window.outer_position() {
                remember_compact_chat_window_position(position.to_logical::<f64>(scale_factor));
            }
        }
        window.destroy().map_err(|e| {
            error!("Failed to destroy compact chat window: {}", e);
            format!("Failed to destroy compact chat window: {}", e)
        })?;
    }
    Ok(())
}

/// Emitted to every window when the Team window disappears for any reason,
/// including the native close button. Presentation state only: the Team run,
/// its member child sessions, and the parent conversation are untouched.
pub const TEAM_WORKSPACE_WINDOW_CLOSED_EVENT: &str = "void://team-workspace-window-closed";

#[tauri::command]
pub async fn show_team_workspace_desktop_window(app: tauri::AppHandle) -> Result<(), String> {
    let started_at = Instant::now();
    let _guard = team_workspace_window_ops().lock().await;
    debug!("Team workspace window show requested");

    if let Some(window) = app.get_webview_window(TEAM_WORKSPACE_WINDOW_LABEL) {
        if let Err(e) = window.unminimize() {
            warn!("Failed to unminimize team workspace window: {}", e);
        }
        window.show().map_err(|e| {
            error!("Failed to show team workspace window: {}", e);
            format!("Failed to show team workspace window: {}", e)
        })?;
        if let Err(e) = window.set_focus() {
            warn!("Failed to focus team workspace window: {}", e);
        }
        debug!(
            "Team workspace window reused: total_duration_ms={}",
            started_at.elapsed().as_millis()
        );
        return Ok(());
    }

    let url = app_url("?voidWindow=team-workspace");
    #[allow(unused_mut)]
    let mut builder = tauri::WebviewWindowBuilder::new(&app, TEAM_WORKSPACE_WINDOW_LABEL, url)
        .title("void Team")
        .inner_size(
            TEAM_WORKSPACE_WINDOW_DEFAULT_WIDTH,
            TEAM_WORKSPACE_WINDOW_DEFAULT_HEIGHT,
        )
        .min_inner_size(
            TEAM_WORKSPACE_WINDOW_MIN_WIDTH,
            TEAM_WORKSPACE_WINDOW_MIN_HEIGHT,
        )
        .resizable(true)
        .maximizable(true)
        .always_on_top(false)
        .skip_taskbar(false)
        .visible(false)
        .on_page_load({
            let started_at = started_at;
            move |_window, payload| {
                let event = match payload.event() {
                    PageLoadEvent::Started => "started",
                    PageLoadEvent::Finished => "finished",
                };
                debug!(
                    "Team workspace window page load event: event={}, url={}, since_show_request_ms={}",
                    event,
                    payload.url(),
                    started_at.elapsed().as_millis()
                );
            }
        });

    // Same chrome as the main window: the Team window draws its own top bar, so
    // the pair reads as one application rather than two unrelated windows.
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .decorations(true)
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }

    #[cfg(target_os = "windows")]
    {
        builder = builder.decorations(false);
    }

    let build_started_at = Instant::now();
    let window = builder.build().map_err(|e| {
        error!(
            "Failed to create team workspace window: error={} duration_ms={}",
            e,
            build_started_at.elapsed().as_millis()
        );
        format!("Failed to create team workspace window: {}", e)
    })?;

    // The native close button is presentation-only: remember the position,
    // let the window go away, and tell the rest of the app it is gone.
    let app_for_event = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            if let Some(window) = app_for_event.get_webview_window(TEAM_WORKSPACE_WINDOW_LABEL) {
                if let Some(frame) = team_workspace_window_frame(&window) {
                    remember_team_workspace_window_frame(frame);
                }
            }
            if let Err(e) = app_for_event.emit(TEAM_WORKSPACE_WINDOW_CLOSED_EVENT, ()) {
                warn!("Failed to publish team workspace window close: {}", e);
            }
        }
    });

    position_team_workspace_window(&app, &window);
    debug!(
        "Team workspace window prepared hidden: total_duration_ms={}",
        started_at.elapsed().as_millis()
    );

    Ok(())
}

#[tauri::command]
pub async fn reveal_team_workspace_desktop_window(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = team_workspace_window_ops().lock().await;

    let Some(window) = app.get_webview_window(TEAM_WORKSPACE_WINDOW_LABEL) else {
        warn!("Team workspace window reveal requested before window exists");
        return Ok(());
    };

    if let Err(e) = window.unminimize() {
        warn!("Failed to unminimize team workspace window: {}", e);
    }
    position_team_workspace_window(&app, &window);
    window.show().map_err(|e| {
        error!("Failed to reveal team workspace window: {}", e);
        format!("Failed to reveal team workspace window: {}", e)
    })?;
    if let Err(e) = window.set_focus() {
        warn!("Failed to focus team workspace window: {}", e);
    }

    Ok(())
}

#[tauri::command]
pub async fn hide_team_workspace_desktop_window(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = team_workspace_window_ops().lock().await;
    if let Some(window) = app.get_webview_window(TEAM_WORKSPACE_WINDOW_LABEL) {
        if let Some(frame) = team_workspace_window_frame(&window) {
            remember_team_workspace_window_frame(frame);
        }
        window.destroy().map_err(|e| {
            error!("Failed to destroy team workspace window: {}", e);
            format!("Failed to destroy team workspace window: {}", e)
        })?;
        if let Err(e) = app.emit(TEAM_WORKSPACE_WINDOW_CLOSED_EVENT, ()) {
            warn!("Failed to publish team workspace window close: {}", e);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn is_team_workspace_desktop_window_open(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(app
        .get_webview_window(TEAM_WORKSPACE_WINDOW_LABEL)
        .is_some())
}

/// Lay the main window out as the left two thirds of the display on its first
/// show, so it and the Team window form one symmetric, top/bottom aligned pair.
/// Applied once per run: a window the user has since moved or resized keeps its
/// own geometry when it is shown again.
fn apply_initial_main_window_layout(
    app: &tauri::AppHandle,
    main_window: &tauri::WebviewWindow,
) -> bool {
    if MAIN_WINDOW_INITIAL_LAYOUT_APPLIED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return false;
    }

    let Some((area_position, area_size)) = work_area_for_agent_companion_window(app, main_window)
    else {
        return false;
    };
    let Some((x, y, width, height)) = paired_main_window_frame(
        (
            area_position.x,
            area_position.y,
            area_size.width,
            area_size.height,
        ),
        PAIRED_LAYOUT_WIDTH_FRACTION,
        PAIRED_LAYOUT_HEIGHT_FRACTION,
        PAIRED_LAYOUT_GAP,
        TEAM_WORKSPACE_WINDOW_ASPECT,
        PAIRED_MAIN_WINDOW_MIN_WIDTH,
    ) else {
        return false;
    };

    if let Err(e) = main_window.set_size(tauri::LogicalSize::new(width, height)) {
        warn!("Failed to size main window for the paired layout: {}", e);
        return false;
    }
    if let Err(e) = main_window.set_position(tauri::LogicalPosition::new(x, y)) {
        warn!(
            "Failed to position main window for the paired layout: {}",
            e
        );
        return false;
    }
    debug!(
        "Main window paired layout applied: x={} y={} width={} height={}",
        x, y, width, height
    );
    true
}

#[tauri::command]
pub async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let total_started_at = Instant::now();
    if let Some(main_window) = app.get_webview_window("main") {
        let step_started_at = Instant::now();
        let paired = apply_initial_main_window_layout(&app, &main_window);
        debug!(
            "Main window show step completed: step=paired_layout applied={} duration_ms={}",
            paired,
            step_started_at.elapsed().as_millis()
        );

        #[cfg(target_os = "windows")]
        if !paired {
            // Work around Windows startup flicker: avoid creating the native window
            // in maximized mode, and maximize it right before showing instead.
            let step_started_at = Instant::now();
            main_window.maximize().map_err(|e| {
                error!("Failed to maximize main window: {}", e);
                format!("Failed to maximize main window: {}", e)
            })?;
            debug!(
                "Main window show step completed: step=maximize duration_ms={}",
                step_started_at.elapsed().as_millis()
            );

            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        }

        let step_started_at = Instant::now();
        main_window.show().map_err(|e| {
            error!("Failed to show main window: {}", e);
            format!("Failed to show main window: {}", e)
        })?;
        debug!(
            "Main window show step completed: step=show duration_ms={}",
            step_started_at.elapsed().as_millis()
        );

        #[cfg(target_os = "macos")]
        {
            crate::cancel_main_window_close_request_on_macos();
            crate::mark_main_window_hidden_on_macos(false);
        }

        let step_started_at = Instant::now();
        main_window.set_focus().map_err(|e| {
            error!("Failed to focus main window: {}", e);
            format!("Failed to focus main window: {}", e)
        })?;
        debug!(
            "Main window show step completed: step=focus duration_ms={}",
            step_started_at.elapsed().as_millis()
        );
    } else {
        error!("Main window not found");
        return Err("Main window not found".to_string());
    }

    debug!(
        "Main window shown: total_duration_ms={}",
        total_started_at.elapsed().as_millis()
    );
    Ok(())
}

#[cfg(test)]
mod team_workspace_window_geometry_tests {
    use super::{
        centered_frame_in_work_area, clamp_frame_into_work_area, mirrored_frame_beside_main_window,
        paired_main_window_frame, PAIRED_LAYOUT_GAP, PAIRED_LAYOUT_HEIGHT_FRACTION,
        PAIRED_LAYOUT_WIDTH_FRACTION, PAIRED_MAIN_WINDOW_MIN_WIDTH, TEAM_WORKSPACE_WINDOW_ASPECT,
        TEAM_WORKSPACE_WINDOW_DEFAULT_HEIGHT, TEAM_WORKSPACE_WINDOW_DEFAULT_WIDTH,
        TEAM_WORKSPACE_WINDOW_EDGE_MARGIN, TEAM_WORKSPACE_WINDOW_MIN_WIDTH,
    };

    fn paired_pair(area: (f64, f64, f64, f64)) -> ((f64, f64, f64, f64), (f64, f64, f64, f64)) {
        let main = paired_main_window_frame(
            area,
            PAIRED_LAYOUT_WIDTH_FRACTION,
            PAIRED_LAYOUT_HEIGHT_FRACTION,
            PAIRED_LAYOUT_GAP,
            TEAM_WORKSPACE_WINDOW_ASPECT,
            PAIRED_MAIN_WINDOW_MIN_WIDTH,
        )
        .expect("this display splits");
        let team = mirrored_frame_beside_main_window(
            area,
            main,
            PAIRED_LAYOUT_GAP,
            TEAM_WORKSPACE_WINDOW_ASPECT,
            TEAM_WORKSPACE_WINDOW_MIN_WIDTH,
        );
        (main, team)
    }

    const PRIMARY: (f64, f64, f64, f64) = (0.0, 0.0, 1920.0, 1040.0);
    // A second display placed to the right of the primary one.
    const SECONDARY: (f64, f64, f64, f64) = (1920.0, 0.0, 1280.0, 800.0);

    /// The pair is the contract the owner accepted from their screenshot: equal
    /// outer margins, the same top and bottom edges, a 2:1 width split, and
    /// visible breathing room around the whole pair rather than a flush fill.
    #[test]
    fn lays_the_two_windows_out_as_one_symmetric_aligned_pair() {
        let (main, team) = paired_pair(PRIMARY);

        // Top and bottom aligned.
        assert_eq!(main.1, team.1);
        assert_eq!(main.3, team.3);
        // Symmetric outer margins, and the same gutter between them.
        let left_margin = main.0 - PRIMARY.0;
        let right_margin = (PRIMARY.0 + PRIMARY.2) - (team.0 + team.2);
        assert!((right_margin - left_margin).abs() < 0.001);
        assert!((team.0 - (main.0 + main.2) - PAIRED_LAYOUT_GAP).abs() < 0.001);
        // The Team window is a portrait column of the shared height.
        assert!((team.2 / team.3 - TEAM_WORKSPACE_WINDOW_ASPECT).abs() < 0.001);
        assert!(team.3 > team.2);
        // The main window keeps the rest of the pair.
        assert!(main.2 > team.2);
    }

    #[test]
    fn leaves_the_pair_short_of_the_screen_edges() {
        let (main, team) = paired_pair(PRIMARY);

        // The pair is inset, not flush: the owner's screenshot shows desktop
        // on all four sides.
        assert!((main.0 - PRIMARY.0) > PAIRED_LAYOUT_GAP * 4.0);
        assert!((main.1 - PRIMARY.1) > PAIRED_LAYOUT_GAP * 4.0);
        assert!((team.0 + team.2) < PRIMARY.0 + PRIMARY.2 - PAIRED_LAYOUT_GAP * 4.0);
        assert!((main.1 + main.3) < PRIMARY.1 + PRIMARY.3 - PAIRED_LAYOUT_GAP * 4.0);
        // The pair still covers most of the display.
        let pair_width = (team.0 + team.2) - main.0;
        assert!((pair_width / PRIMARY.2 - PAIRED_LAYOUT_WIDTH_FRACTION).abs() < 0.001);
        assert!((main.3 / PRIMARY.3 - PAIRED_LAYOUT_HEIGHT_FRACTION).abs() < 0.001);
    }

    #[test]
    fn keeps_the_whole_work_area_when_the_display_is_too_narrow_to_split() {
        let narrow = (0.0, 0.0, 1000.0, 700.0);
        assert!(paired_main_window_frame(
            narrow,
            PAIRED_LAYOUT_WIDTH_FRACTION,
            PAIRED_LAYOUT_HEIGHT_FRACTION,
            PAIRED_LAYOUT_GAP,
            TEAM_WORKSPACE_WINDOW_ASPECT,
            PAIRED_MAIN_WINDOW_MIN_WIDTH,
        )
        .is_none());
    }

    #[test]
    fn mirrors_the_main_windows_own_outer_margin_onto_the_right_edge() {
        // Main window inset 8px from the left and narrow enough to leave room:
        // the Team window must end 8px from the right.
        let main = (8.0, 40.0, 940.0, 800.0);
        let (x, y, width, height) = mirrored_frame_beside_main_window(
            PRIMARY,
            main,
            PAIRED_LAYOUT_GAP,
            TEAM_WORKSPACE_WINDOW_ASPECT,
            TEAM_WORKSPACE_WINDOW_MIN_WIDTH,
        );

        assert_eq!(y, main.1);
        assert_eq!(height, main.3);
        assert!((width / height - TEAM_WORKSPACE_WINDOW_ASPECT).abs() < 0.001);
        assert_eq!(x + width, 1920.0 - (main.0 - PRIMARY.0));
        assert!(x >= main.0 + main.2 + PAIRED_LAYOUT_GAP);
    }

    #[test]
    fn keeps_the_portrait_aspect_and_stays_beside_a_wide_main_window() {
        // 1100 + gap + 585 exceeds the display, so the frame gives up its
        // mirrored right margin before it gives up standing beside the main
        // window.
        let main = (0.0, 0.0, 1100.0, 1040.0);
        let (x, _y, width, height) = mirrored_frame_beside_main_window(
            PRIMARY,
            main,
            PAIRED_LAYOUT_GAP,
            TEAM_WORKSPACE_WINDOW_ASPECT,
            TEAM_WORKSPACE_WINDOW_MIN_WIDTH,
        );

        assert!((width / height - TEAM_WORKSPACE_WINDOW_ASPECT).abs() < 0.001);
        assert!(x >= main.0 + main.2);
        assert!(x + width <= 1920.0);
    }

    #[test]
    fn stays_on_screen_when_the_main_window_leaves_no_room() {
        // A maximized main window cannot be avoided. Remaining visible beats
        // remaining beside it, so the frame is pulled back onto the display.
        let main = (0.0, 0.0, 1920.0, 1040.0);
        let (x, _y, width, _height) = mirrored_frame_beside_main_window(
            PRIMARY,
            main,
            PAIRED_LAYOUT_GAP,
            TEAM_WORKSPACE_WINDOW_ASPECT,
            TEAM_WORKSPACE_WINDOW_MIN_WIDTH,
        );

        // A maximized main window is 1040 tall, so the portrait width stays
        // well above the floor; only its position has to give.
        assert!((width / 1040.0 - TEAM_WORKSPACE_WINDOW_ASPECT).abs() < 0.001);
        assert!(x >= 0.0);
        assert!(x + width <= 1920.0);
    }

    #[test]
    fn mirrors_using_the_display_that_hosts_the_main_window() {
        // Tall enough that the portrait width clears the window's minimum.
        let main = (1928.0, 10.0, 600.0, 780.0);
        let (x, y, width, height) = mirrored_frame_beside_main_window(
            SECONDARY,
            main,
            PAIRED_LAYOUT_GAP,
            TEAM_WORKSPACE_WINDOW_ASPECT,
            TEAM_WORKSPACE_WINDOW_MIN_WIDTH,
        );

        assert_eq!(y, main.1);
        assert_eq!(height, main.3);
        assert!((width / height - TEAM_WORKSPACE_WINDOW_ASPECT).abs() < 0.001);
        // 8px from this display's right edge, mirroring its 8px left inset.
        assert_eq!(x + width, 1920.0 + 1280.0 - 8.0);
        assert!(x >= main.0 + main.2 + PAIRED_LAYOUT_GAP);
    }

    #[test]
    fn centres_the_default_frame_on_its_own_display() {
        let (x, y) = centered_frame_in_work_area(
            PRIMARY,
            TEAM_WORKSPACE_WINDOW_DEFAULT_WIDTH,
            TEAM_WORKSPACE_WINDOW_DEFAULT_HEIGHT,
        );
        assert_eq!(x, (1920.0 - TEAM_WORKSPACE_WINDOW_DEFAULT_WIDTH) / 2.0);
        assert_eq!(y, (1040.0 - TEAM_WORKSPACE_WINDOW_DEFAULT_HEIGHT) / 2.0);
        // The fallback frame is a portrait column too, never a landscape box.
        assert!(TEAM_WORKSPACE_WINDOW_DEFAULT_HEIGHT > TEAM_WORKSPACE_WINDOW_DEFAULT_WIDTH);
    }

    #[test]
    fn centres_on_a_secondary_display_using_its_own_origin() {
        let (x, y) = centered_frame_in_work_area(SECONDARY, 460.0, 600.0);
        assert_eq!(x, 1920.0 + (1280.0 - 460.0) / 2.0);
        assert_eq!(y, (800.0 - 600.0) / 2.0);
    }

    #[test]
    fn pins_a_default_taller_than_the_display_to_its_origin() {
        // SECONDARY is shorter than the portrait default, so centring would put
        // the frame above the display. Staying visible wins.
        let (_x, y) = centered_frame_in_work_area(
            SECONDARY,
            TEAM_WORKSPACE_WINDOW_DEFAULT_WIDTH,
            TEAM_WORKSPACE_WINDOW_DEFAULT_HEIGHT,
        );
        assert_eq!(y, SECONDARY.1);
    }

    #[test]
    fn keeps_a_remembered_secondary_display_position() {
        let remembered = (2000.0, 90.0);
        let (x, y) = clamp_frame_into_work_area(
            SECONDARY,
            (remembered.0, remembered.1, 900.0, 620.0),
            TEAM_WORKSPACE_WINDOW_EDGE_MARGIN,
        );
        assert_eq!((x, y), remembered);
    }

    #[test]
    fn pulls_an_off_screen_frame_back_inside_the_work_area() {
        let (x, y) = clamp_frame_into_work_area(
            PRIMARY,
            (5000.0, -400.0, 900.0, 620.0),
            TEAM_WORKSPACE_WINDOW_EDGE_MARGIN,
        );
        assert_eq!(x, 1920.0 - 900.0 - TEAM_WORKSPACE_WINDOW_EDGE_MARGIN);
        assert_eq!(y, TEAM_WORKSPACE_WINDOW_EDGE_MARGIN);
    }

    #[test]
    fn pins_a_frame_larger_than_the_display_to_the_display_origin() {
        let (x, y) = clamp_frame_into_work_area(
            SECONDARY,
            (2400.0, 300.0, 1600.0, 1200.0),
            TEAM_WORKSPACE_WINDOW_EDGE_MARGIN,
        );
        assert_eq!((x, y), (SECONDARY.0, SECONDARY.1));
    }
}
