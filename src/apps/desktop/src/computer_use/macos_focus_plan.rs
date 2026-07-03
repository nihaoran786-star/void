#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MacosFocusAttempt {
    FocusWithoutRaise { window_id: u32 },
    PublicActivate,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MacosFocusPlan {
    pub(crate) attempts: Vec<MacosFocusAttempt>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MacosFocusPublicFallback {
    PostPublic,
    SkipPublic,
}

pub(crate) fn plan_focus_activation(
    window_id: Option<u32>,
    focus_without_raise_available: bool,
    allow_raise_fallback: bool,
) -> MacosFocusPlan {
    let mut attempts = Vec::new();
    if let (Some(window_id), true) = (window_id, focus_without_raise_available) {
        attempts.push(MacosFocusAttempt::FocusWithoutRaise { window_id });
    }

    if allow_raise_fallback {
        attempts.push(MacosFocusAttempt::PublicActivate);
    }

    MacosFocusPlan { attempts }
}

pub(crate) fn public_fallback_after_focus_without_raise(
    focus_without_raise_succeeded: bool,
) -> MacosFocusPublicFallback {
    if focus_without_raise_succeeded {
        MacosFocusPublicFallback::SkipPublic
    } else {
        MacosFocusPublicFallback::PostPublic
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn macos_focus_plan_uses_public_activation_without_window_id() {
        let plan = plan_focus_activation(None, true, true);

        assert_eq!(plan.attempts, vec![MacosFocusAttempt::PublicActivate]);
    }

    #[test]
    fn macos_focus_plan_prefers_focus_without_raise_when_window_id_and_spi_available() {
        let plan = plan_focus_activation(Some(42), true, true);

        assert_eq!(
            plan.attempts,
            vec![
                MacosFocusAttempt::FocusWithoutRaise { window_id: 42 },
                MacosFocusAttempt::PublicActivate,
            ]
        );
    }

    #[test]
    fn macos_focus_plan_falls_back_public_when_spi_unavailable() {
        let plan = plan_focus_activation(Some(42), false, true);

        assert_eq!(plan.attempts, vec![MacosFocusAttempt::PublicActivate]);
    }

    #[test]
    fn macos_focus_plan_does_not_raise_without_explicit_fallback_permission() {
        let plan = plan_focus_activation(Some(42), false, false);

        assert!(plan.attempts.is_empty());
    }

    #[test]
    fn macos_focus_plan_skips_public_after_focus_without_raise_success() {
        assert_eq!(
            public_fallback_after_focus_without_raise(true),
            MacosFocusPublicFallback::SkipPublic
        );
        assert_eq!(
            public_fallback_after_focus_without_raise(false),
            MacosFocusPublicFallback::PostPublic
        );
    }
}
