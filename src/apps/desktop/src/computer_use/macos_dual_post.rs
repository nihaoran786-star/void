use crate::computer_use::macos_skylight::SkyLightAvailability;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MacosPostKind {
    Mouse,
    KeyboardAuth,
    KeyboardNoAuth,
}

impl MacosPostKind {
    pub(crate) fn attach_auth_message(self) -> bool {
        matches!(self, Self::KeyboardAuth)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MacosPostAttempt {
    SkyLight { attach_auth_message: bool },
    PublicCgEvent,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct MacosDualPostPlan {
    pub(crate) initial_attempts: Vec<MacosPostAttempt>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PublicFallback {
    PostPublic,
    SkipPublic,
}

pub(crate) fn plan_for_availability(
    kind: MacosPostKind,
    availability: &SkyLightAvailability,
) -> MacosDualPostPlan {
    if !availability.available {
        return MacosDualPostPlan {
            initial_attempts: vec![MacosPostAttempt::PublicCgEvent],
        };
    }

    let mut initial_attempts = vec![MacosPostAttempt::SkyLight {
        attach_auth_message: kind.attach_auth_message(),
    }];
    if matches!(kind, MacosPostKind::Mouse) {
        initial_attempts.push(MacosPostAttempt::PublicCgEvent);
    }
    MacosDualPostPlan { initial_attempts }
}

pub(crate) fn public_fallback_after_skylight(
    kind: MacosPostKind,
    skylight_succeeded: bool,
) -> PublicFallback {
    match (kind, skylight_succeeded) {
        (MacosPostKind::Mouse, _) => PublicFallback::PostPublic,
        (_, false) => PublicFallback::PostPublic,
        (_, true) => PublicFallback::SkipPublic,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::computer_use::macos_skylight::{SkyLightAvailability, SkyLightStatus};

    #[test]
    fn macos_dual_post_uses_public_only_when_skylight_unavailable() {
        let availability =
            SkyLightAvailability::unavailable(SkyLightStatus::UnsupportedPlatform, "not macOS");

        assert_eq!(
            plan_for_availability(MacosPostKind::Mouse, &availability).initial_attempts,
            vec![MacosPostAttempt::PublicCgEvent]
        );
        assert_eq!(
            plan_for_availability(MacosPostKind::KeyboardAuth, &availability).initial_attempts,
            vec![MacosPostAttempt::PublicCgEvent]
        );
    }

    #[test]
    fn macos_dual_post_mouse_keeps_public_belt_and_suspenders_after_skylight() {
        let plan = plan_for_availability(MacosPostKind::Mouse, &SkyLightAvailability::available());

        assert_eq!(
            plan.initial_attempts,
            vec![
                MacosPostAttempt::SkyLight {
                    attach_auth_message: false
                },
                MacosPostAttempt::PublicCgEvent,
            ]
        );
        assert_eq!(
            public_fallback_after_skylight(MacosPostKind::Mouse, true),
            PublicFallback::PostPublic
        );
    }

    #[test]
    fn macos_dual_post_keyboard_avoids_duplicate_public_post_on_skylight_success() {
        let plan = plan_for_availability(
            MacosPostKind::KeyboardAuth,
            &SkyLightAvailability::available(),
        );

        assert_eq!(
            plan.initial_attempts,
            vec![MacosPostAttempt::SkyLight {
                attach_auth_message: true
            }]
        );
        assert_eq!(
            public_fallback_after_skylight(MacosPostKind::KeyboardAuth, true),
            PublicFallback::SkipPublic
        );
        assert_eq!(
            public_fallback_after_skylight(MacosPostKind::KeyboardAuth, false),
            PublicFallback::PostPublic
        );
    }

    #[test]
    fn macos_dual_post_keyboard_no_auth_keeps_auth_flag_false() {
        let plan = plan_for_availability(
            MacosPostKind::KeyboardNoAuth,
            &SkyLightAvailability::available(),
        );

        assert_eq!(
            plan.initial_attempts,
            vec![MacosPostAttempt::SkyLight {
                attach_auth_message: false
            }]
        );
    }
}
