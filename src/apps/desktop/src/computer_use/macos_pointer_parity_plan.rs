#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MacosPointerButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MacosPointerEventKind {
    Down,
    Drag,
    Up,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct MacosDragEvent {
    pub(crate) kind: MacosPointerEventKind,
    pub(crate) t: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct MacosDragPlan {
    pub(crate) button: MacosPointerButton,
    pub(crate) events: Vec<MacosDragEvent>,
    pub(crate) step_delay_ms: u64,
}

pub(crate) fn plan_drag(
    button: MacosPointerButton,
    requested_steps: usize,
    duration_ms: u64,
) -> MacosDragPlan {
    let steps = requested_steps.max(1);
    let step_delay_ms = if steps > 1 {
        duration_ms / steps as u64
    } else {
        duration_ms
    };
    let mut events = Vec::with_capacity(steps + 2);
    events.push(MacosDragEvent {
        kind: MacosPointerEventKind::Down,
        t: 0.0,
    });
    for i in 1..=steps {
        events.push(MacosDragEvent {
            kind: MacosPointerEventKind::Drag,
            t: i as f64 / steps as f64,
        });
    }
    events.push(MacosDragEvent {
        kind: MacosPointerEventKind::Up,
        t: 1.0,
    });
    MacosDragPlan {
        button,
        events,
        step_delay_ms,
    }
}

pub(crate) fn interpolate_point(from: (f64, f64), to: (f64, f64), t: f64) -> (f64, f64) {
    (from.0 + (to.0 - from.0) * t, from.1 + (to.1 - from.1) * t)
}

pub(crate) fn supports_click_button(button: MacosPointerButton) -> bool {
    matches!(
        button,
        MacosPointerButton::Left | MacosPointerButton::Right | MacosPointerButton::Middle
    )
}

pub(crate) fn supports_drag_button(button: MacosPointerButton) -> bool {
    supports_click_button(button)
}

pub(crate) fn should_try_ax_press_for_click(
    mouse_button: &str,
    click_count: u32,
    modifier_count: usize,
) -> bool {
    mouse_button.eq_ignore_ascii_case("left") && click_count == 1 && modifier_count == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drag_plan_clamps_steps_and_uses_down_drag_up_order() {
        let plan = plan_drag(MacosPointerButton::Left, 0, 120);

        assert_eq!(plan.button, MacosPointerButton::Left);
        assert_eq!(
            plan.events,
            vec![
                MacosDragEvent {
                    kind: MacosPointerEventKind::Down,
                    t: 0.0
                },
                MacosDragEvent {
                    kind: MacosPointerEventKind::Drag,
                    t: 1.0
                },
                MacosDragEvent {
                    kind: MacosPointerEventKind::Up,
                    t: 1.0
                },
            ]
        );
        assert_eq!(plan.step_delay_ms, 120);
    }

    #[test]
    fn drag_plan_interpolates_multiple_steps() {
        let plan = plan_drag(MacosPointerButton::Right, 4, 100);
        let drag_ts = plan
            .events
            .iter()
            .filter(|event| event.kind == MacosPointerEventKind::Drag)
            .map(|event| event.t)
            .collect::<Vec<_>>();

        assert_eq!(drag_ts, vec![0.25, 0.5, 0.75, 1.0]);
        assert_eq!(plan.step_delay_ms, 25);
    }

    #[test]
    fn interpolate_point_is_linear() {
        assert_eq!(
            interpolate_point((10.0, 20.0), (30.0, 60.0), 0.25),
            (15.0, 30.0)
        );
    }

    #[test]
    fn click_and_drag_support_same_three_buttons() {
        for button in [
            MacosPointerButton::Left,
            MacosPointerButton::Right,
            MacosPointerButton::Middle,
        ] {
            assert!(supports_click_button(button));
            assert!(supports_drag_button(button));
        }
    }

    #[test]
    fn ax_press_is_only_allowed_for_plain_left_single_click() {
        assert!(should_try_ax_press_for_click("left", 1, 0));
        assert!(should_try_ax_press_for_click("LEFT", 1, 0));

        assert!(!should_try_ax_press_for_click("right", 1, 0));
        assert!(!should_try_ax_press_for_click("middle", 1, 0));
        assert!(!should_try_ax_press_for_click("left", 0, 0));
        assert!(!should_try_ax_press_for_click("left", 2, 0));
        assert!(!should_try_ax_press_for_click("left", 1, 1));
    }
}
