#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MacosModifierKind {
    Command,
    Shift,
    Option,
    Control,
    Fn,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MacosModifierFlagKind {
    Command,
    Shift,
    Option,
    Control,
    SecondaryFn,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MacosKeyChordPostMode {
    Authenticated,
    NoAuth,
}

pub(crate) fn modifier_from_alias(alias: &str) -> Option<MacosModifierKind> {
    match alias.to_ascii_lowercase().as_str() {
        "cmd" | "command" | "meta" | "super" => Some(MacosModifierKind::Command),
        "shift" => Some(MacosModifierKind::Shift),
        "alt" | "option" | "opt" => Some(MacosModifierKind::Option),
        "ctrl" | "control" => Some(MacosModifierKind::Control),
        "fn" => Some(MacosModifierKind::Fn),
        _ => None,
    }
}

pub(crate) fn modifier_flag_kind(kind: MacosModifierKind) -> MacosModifierFlagKind {
    match kind {
        MacosModifierKind::Command => MacosModifierFlagKind::Command,
        MacosModifierKind::Shift => MacosModifierFlagKind::Shift,
        MacosModifierKind::Option => MacosModifierFlagKind::Option,
        MacosModifierKind::Control => MacosModifierFlagKind::Control,
        MacosModifierKind::Fn => MacosModifierFlagKind::SecondaryFn,
    }
}

pub(crate) fn modifier_keycode(kind: MacosModifierKind) -> u16 {
    match kind {
        MacosModifierKind::Command => 55,
        MacosModifierKind::Shift => 56,
        MacosModifierKind::Option => 58,
        MacosModifierKind::Control => 59,
        MacosModifierKind::Fn => 63,
    }
}

pub(crate) fn modifier_allowed_in_default_host_parser(kind: MacosModifierKind) -> bool {
    !matches!(kind, MacosModifierKind::Fn)
}

pub(crate) fn post_mode_uses_auth_message(mode: MacosKeyChordPostMode) -> bool {
    matches!(mode, MacosKeyChordPostMode::Authenticated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modifier_aliases_include_fn() {
        assert_eq!(modifier_from_alias("CMD"), Some(MacosModifierKind::Command));
        assert_eq!(
            modifier_from_alias("control"),
            Some(MacosModifierKind::Control)
        );
        assert_eq!(modifier_from_alias("alt"), Some(MacosModifierKind::Option));
        assert_eq!(modifier_from_alias("fn"), Some(MacosModifierKind::Fn));
        assert_eq!(modifier_from_alias("zzz"), None);
    }

    #[test]
    fn fn_modifier_has_secondary_fn_flag_kind_and_keycode() {
        assert_eq!(
            modifier_flag_kind(MacosModifierKind::Fn),
            MacosModifierFlagKind::SecondaryFn
        );
        assert_eq!(modifier_keycode(MacosModifierKind::Fn), 63);
    }

    #[test]
    fn fn_modifier_is_not_enabled_in_default_host_parser_without_smoke() {
        assert!(modifier_allowed_in_default_host_parser(
            MacosModifierKind::Command
        ));
        assert!(!modifier_allowed_in_default_host_parser(
            MacosModifierKind::Fn
        ));
    }

    #[test]
    fn no_auth_post_mode_keeps_auth_message_detached() {
        assert!(post_mode_uses_auth_message(
            MacosKeyChordPostMode::Authenticated
        ));
        assert!(!post_mode_uses_auth_message(MacosKeyChordPostMode::NoAuth));
    }
}
