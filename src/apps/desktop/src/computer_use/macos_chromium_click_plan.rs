#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct MacosPoint {
    pub(crate) x: f64,
    pub(crate) y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct MacosRect {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ChromiumClickDefaultReason {
    NonLeftButton,
    MissingBundleId,
    UnsupportedBundleId,
    MissingWindowId,
    MissingWindowBounds,
    InvalidWindowBounds,
    PointOutsideWindow,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum ChromiumClickRoute {
    Default(ChromiumClickDefaultReason),
    ChromiumElectron {
        window_id: u32,
        global_point: MacosPoint,
        window_local_point: MacosPoint,
        click_count: u32,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ChromiumClickEventKind {
    Move,
    Down,
    Up,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ChromiumClickEventTarget {
    Target,
    OffscreenPrimer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ChromiumClickRecipeEvent {
    pub(crate) kind: ChromiumClickEventKind,
    pub(crate) target: ChromiumClickEventTarget,
    pub(crate) click_state: i64,
    pub(crate) phase: i64,
}

pub(crate) fn chromium_click_route(
    bundle_id: Option<&str>,
    is_left_button: bool,
    window_id: Option<u32>,
    window_bounds: Option<MacosRect>,
    global_point: MacosPoint,
    click_count: u32,
) -> ChromiumClickRoute {
    if !is_left_button {
        return ChromiumClickRoute::Default(ChromiumClickDefaultReason::NonLeftButton);
    }

    let Some(bundle_id) = bundle_id else {
        return ChromiumClickRoute::Default(ChromiumClickDefaultReason::MissingBundleId);
    };
    if !is_chromium_electron_bundle_id(bundle_id) {
        return ChromiumClickRoute::Default(ChromiumClickDefaultReason::UnsupportedBundleId);
    }

    let Some(window_id) = window_id.filter(|id| *id != 0) else {
        return ChromiumClickRoute::Default(ChromiumClickDefaultReason::MissingWindowId);
    };
    let Some(bounds) = window_bounds else {
        return ChromiumClickRoute::Default(ChromiumClickDefaultReason::MissingWindowBounds);
    };
    if bounds.width <= 0.0 || bounds.height <= 0.0 {
        return ChromiumClickRoute::Default(ChromiumClickDefaultReason::InvalidWindowBounds);
    }

    let local = MacosPoint {
        x: global_point.x - bounds.x,
        y: global_point.y - bounds.y,
    };
    if local.x < 0.0 || local.y < 0.0 || local.x > bounds.width || local.y > bounds.height {
        return ChromiumClickRoute::Default(ChromiumClickDefaultReason::PointOutsideWindow);
    }

    ChromiumClickRoute::ChromiumElectron {
        window_id,
        global_point,
        window_local_point: local,
        click_count: click_count.max(1),
    }
}

pub(crate) fn is_chromium_electron_bundle_id(bundle_id: &str) -> bool {
    let bundle_id = bundle_id.to_ascii_lowercase();
    const KNOWN_SUBSTRINGS: [&str; 11] = [
        "chrome",
        "chromium",
        "electron",
        "brave",
        "microsoft.edge",
        "microsoft-edge",
        "arc.",
        "vivaldi",
        "operamini",
        "com.operasoftware.operaprofiles",
        "com.operasoftware.opera",
    ];
    KNOWN_SUBSTRINGS
        .iter()
        .any(|needle| bundle_id.contains(needle))
}

pub(crate) fn chromium_click_recipe_events(click_count: u32) -> Vec<ChromiumClickRecipeEvent> {
    let click_pairs = click_count.max(1).min(2) as i64;
    let mut events = vec![
        ChromiumClickRecipeEvent {
            kind: ChromiumClickEventKind::Move,
            target: ChromiumClickEventTarget::Target,
            click_state: 0,
            phase: 2,
        },
        ChromiumClickRecipeEvent {
            kind: ChromiumClickEventKind::Down,
            target: ChromiumClickEventTarget::OffscreenPrimer,
            click_state: 1,
            phase: 1,
        },
        ChromiumClickRecipeEvent {
            kind: ChromiumClickEventKind::Up,
            target: ChromiumClickEventTarget::OffscreenPrimer,
            click_state: 1,
            phase: 2,
        },
    ];

    for click_state in 1..=click_pairs {
        events.push(ChromiumClickRecipeEvent {
            kind: ChromiumClickEventKind::Down,
            target: ChromiumClickEventTarget::Target,
            click_state,
            phase: 3,
        });
        events.push(ChromiumClickRecipeEvent {
            kind: ChromiumClickEventKind::Up,
            target: ChromiumClickEventTarget::Target,
            click_state,
            phase: 3,
        });
    }

    events
}

pub(crate) fn chromium_click_event_fields(
    pid: i32,
    window_id: u32,
    click_group_id: i64,
    event: ChromiumClickRecipeEvent,
) -> Vec<(u32, i64)> {
    vec![
        (0, event.phase),
        (1, event.click_state),
        (3, 0),
        (7, 3),
        (40, pid as i64),
        (51, window_id as i64),
        (58, click_group_id),
        (91, window_id as i64),
        (92, window_id as i64),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn point(x: f64, y: f64) -> MacosPoint {
        MacosPoint { x, y }
    }

    fn rect(x: f64, y: f64, width: f64, height: f64) -> MacosRect {
        MacosRect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn macos_chromium_click_plan_routes_known_stable_bundle_ids() {
        for bundle_id in [
            "com.google.Chrome",
            "org.chromium.Chromium",
            "com.microsoft.Edge",
            "com.brave.Browser",
            "company.product.electron",
        ] {
            let route = chromium_click_route(
                Some(bundle_id),
                true,
                Some(42),
                Some(rect(10.0, 20.0, 300.0, 200.0)),
                point(25.0, 45.0),
                1,
            );
            assert!(matches!(route, ChromiumClickRoute::ChromiumElectron { .. }));
        }
    }

    #[test]
    fn macos_chromium_click_plan_keeps_regular_apps_on_default_path() {
        for bundle_id in [
            Some("com.apple.TextEdit"),
            Some("com.apple.Terminal"),
            Some("org.vim.MacVim"),
            Some("com.apple.finder"),
            None,
        ] {
            let route = chromium_click_route(
                bundle_id,
                true,
                Some(42),
                Some(rect(10.0, 20.0, 300.0, 200.0)),
                point(25.0, 45.0),
                1,
            );
            assert!(matches!(route, ChromiumClickRoute::Default(_)));
        }
    }

    #[test]
    fn macos_chromium_click_plan_requires_left_button_window_id_and_bounds() {
        let bounds = Some(rect(10.0, 20.0, 300.0, 200.0));
        let target = point(25.0, 45.0);
        assert_eq!(
            chromium_click_route(
                Some("com.google.Chrome"),
                false,
                Some(42),
                bounds,
                target,
                1
            ),
            ChromiumClickRoute::Default(ChromiumClickDefaultReason::NonLeftButton)
        );
        assert_eq!(
            chromium_click_route(Some("com.google.Chrome"), true, None, bounds, target, 1),
            ChromiumClickRoute::Default(ChromiumClickDefaultReason::MissingWindowId)
        );
        assert_eq!(
            chromium_click_route(Some("com.google.Chrome"), true, Some(42), None, target, 1),
            ChromiumClickRoute::Default(ChromiumClickDefaultReason::MissingWindowBounds)
        );
    }

    #[test]
    fn macos_chromium_click_plan_computes_window_local_point_without_clamping() {
        let route = chromium_click_route(
            Some("com.google.Chrome"),
            true,
            Some(42),
            Some(rect(100.0, 200.0, 300.0, 200.0)),
            point(125.0, 260.0),
            0,
        );
        assert_eq!(
            route,
            ChromiumClickRoute::ChromiumElectron {
                window_id: 42,
                global_point: point(125.0, 260.0),
                window_local_point: point(25.0, 60.0),
                click_count: 1,
            }
        );
        assert_eq!(
            chromium_click_route(
                Some("com.google.Chrome"),
                true,
                Some(42),
                Some(rect(100.0, 200.0, 300.0, 200.0)),
                point(99.0, 260.0),
                1,
            ),
            ChromiumClickRoute::Default(ChromiumClickDefaultReason::PointOutsideWindow)
        );
    }

    #[test]
    fn macos_chromium_click_plan_recipe_event_order_is_stable_and_clamped() {
        let events = chromium_click_recipe_events(3);
        assert_eq!(events.len(), 7);
        assert_eq!(
            events
                .iter()
                .map(|event| (event.kind, event.target, event.click_state, event.phase))
                .collect::<Vec<_>>(),
            vec![
                (
                    ChromiumClickEventKind::Move,
                    ChromiumClickEventTarget::Target,
                    0,
                    2
                ),
                (
                    ChromiumClickEventKind::Down,
                    ChromiumClickEventTarget::OffscreenPrimer,
                    1,
                    1
                ),
                (
                    ChromiumClickEventKind::Up,
                    ChromiumClickEventTarget::OffscreenPrimer,
                    1,
                    2
                ),
                (
                    ChromiumClickEventKind::Down,
                    ChromiumClickEventTarget::Target,
                    1,
                    3
                ),
                (
                    ChromiumClickEventKind::Up,
                    ChromiumClickEventTarget::Target,
                    1,
                    3
                ),
                (
                    ChromiumClickEventKind::Down,
                    ChromiumClickEventTarget::Target,
                    2,
                    3
                ),
                (
                    ChromiumClickEventKind::Up,
                    ChromiumClickEventTarget::Target,
                    2,
                    3
                ),
            ]
        );
    }

    #[test]
    fn macos_chromium_click_plan_required_fields_match_event_values() {
        let event = ChromiumClickRecipeEvent {
            kind: ChromiumClickEventKind::Down,
            target: ChromiumClickEventTarget::Target,
            click_state: 2,
            phase: 3,
        };
        let fields = chromium_click_event_fields(1234, 42, 99, event);
        assert_eq!(
            fields,
            vec![
                (0, 3),
                (1, 2),
                (3, 0),
                (7, 3),
                (40, 1234),
                (51, 42),
                (58, 99),
                (91, 42),
                (92, 42),
            ]
        );
    }
}
