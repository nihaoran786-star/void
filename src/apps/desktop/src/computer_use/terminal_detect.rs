#![allow(dead_code)]

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerminalRoute {
    AxText,
    KeyEvent,
}

const MACOS_TERMINAL_APP_NAMES: &[&str] = &[
    "alacritty",
    "ghostty",
    "hyper",
    "iterm",
    "iterm2",
    "kitty",
    "kreyg",
    "neovide",
    "tabby",
    "warp",
    "wezterm",
];

const MACOS_TERMINAL_BUNDLE_KEYWORDS: &[&str] = &[
    "alacritty",
    "ghostty",
    "hyper",
    "iterm",
    "kitty",
    "kreyg",
    "neovide",
    "tabby",
    "warp",
    "wezterm",
];

const MACOS_TERMINAL_BUNDLE_IDS: &[&str] = &[
    "co.zeit.hyper",
    "com.apple.terminal",
    "com.github.wez.wezterm",
    "com.googlecode.iterm2",
    "com.kitty",
    "com.mitchellh.ghostty",
    "com.neovide.neovide",
    "com.todesktop.230313mzl4w4u92",
    "dev.warp.warp-stable",
    "dev.zed.zed.helper",
    "io.alacritty",
    "io.wez.wezterm",
    "net.kovidgoyal.kitty",
    "org.alacritty",
];

const TERMINAL_WINDOW_CLASS_KEYWORDS: &[&str] = &[
    "alacritty",
    "cmd.exe",
    "ghostty",
    "gnome-terminal",
    "gvim",
    "konsole",
    "kitty",
    "mintty",
    "powershell.exe",
    "pwsh.exe",
    "urxvt",
    "wezterm",
    "windows terminal",
    "wt.exe",
    "xterm",
];

fn normalize_identifier(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub fn is_terminal_emulator(app_name: &str, bundle_id: Option<&str>) -> bool {
    let name_lc = normalize_identifier(app_name);
    let bundle_lc = bundle_id.map(normalize_identifier);

    let name_hit = MACOS_TERMINAL_APP_NAMES
        .iter()
        .any(|known| !known.is_empty() && name_lc == *known);

    let bundle_hit = bundle_lc
        .as_deref()
        .map(|bundle| {
            MACOS_TERMINAL_BUNDLE_IDS.iter().any(|id| *id == bundle)
                || MACOS_TERMINAL_BUNDLE_KEYWORDS
                    .iter()
                    .any(|kw| !kw.is_empty() && bundle.contains(kw))
        })
        .unwrap_or(false);

    name_hit || bundle_hit
}

pub fn is_terminal_window_class(class_name: &str) -> bool {
    let class_lc = normalize_identifier(class_name);
    TERMINAL_WINDOW_CLASS_KEYWORDS
        .iter()
        .any(|kw| !kw.is_empty() && class_lc.contains(kw))
}

pub fn route_for_type_text(
    app_name: &str,
    bundle_id: Option<&str>,
    platform: &str,
) -> TerminalRoute {
    let terminal_like = match normalize_identifier(platform).as_str() {
        "macos" => is_terminal_emulator(app_name, bundle_id),
        "windows" | "linux" => is_terminal_window_class(app_name),
        _ => false,
    };

    if terminal_like {
        TerminalRoute::KeyEvent
    } else {
        TerminalRoute::AxText
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MacosTerminalKey {
    pub keycode: u16,
    pub shift: bool,
}

impl MacosTerminalKey {
    const fn plain(keycode: u16) -> Self {
        Self {
            keycode,
            shift: false,
        }
    }

    const fn shifted(keycode: u16) -> Self {
        Self {
            keycode,
            shift: true,
        }
    }
}

pub fn macos_terminal_key_for_char(ch: char) -> Option<MacosTerminalKey> {
    Some(match ch {
        '\n' | '\r' => MacosTerminalKey::plain(36),
        '\t' => MacosTerminalKey::plain(48),
        ' ' => MacosTerminalKey::plain(49),
        'A'..='Z' => MacosTerminalKey::shifted(macos_keycode_for_unshifted(ch)?),
        'a'..='z' | '0'..='9' => MacosTerminalKey::plain(macos_keycode_for_unshifted(ch)?),
        '!' => MacosTerminalKey::shifted(18),
        '@' => MacosTerminalKey::shifted(19),
        '#' => MacosTerminalKey::shifted(20),
        '$' => MacosTerminalKey::shifted(21),
        '%' => MacosTerminalKey::shifted(23),
        '^' => MacosTerminalKey::shifted(22),
        '&' => MacosTerminalKey::shifted(26),
        '*' => MacosTerminalKey::shifted(28),
        '(' => MacosTerminalKey::shifted(25),
        ')' => MacosTerminalKey::shifted(29),
        '_' => MacosTerminalKey::shifted(27),
        '+' => MacosTerminalKey::shifted(24),
        '{' => MacosTerminalKey::shifted(33),
        '}' => MacosTerminalKey::shifted(30),
        '|' => MacosTerminalKey::shifted(42),
        ':' => MacosTerminalKey::shifted(41),
        '"' => MacosTerminalKey::shifted(39),
        '<' => MacosTerminalKey::shifted(43),
        '>' => MacosTerminalKey::shifted(47),
        '?' => MacosTerminalKey::shifted(44),
        '~' => MacosTerminalKey::shifted(50),
        '-' | '=' | '[' | ']' | '\\' | ';' | '\'' | ',' | '.' | '/' | '`' => {
            MacosTerminalKey::plain(macos_keycode_for_unshifted(ch)?)
        }
        _ => return None,
    })
}

fn macos_keycode_for_unshifted(ch: char) -> Option<u16> {
    let upper = ch.to_ascii_uppercase();
    Some(match upper {
        'A' => 0,
        'S' => 1,
        'D' => 2,
        'F' => 3,
        'H' => 4,
        'G' => 5,
        'Z' => 6,
        'X' => 7,
        'C' => 8,
        'V' => 9,
        'B' => 11,
        'Q' => 12,
        'W' => 13,
        'E' => 14,
        'R' => 15,
        'Y' => 16,
        'T' => 17,
        '1' => 18,
        '2' => 19,
        '3' => 20,
        '4' => 21,
        '6' => 22,
        '5' => 23,
        '=' => 24,
        '9' => 25,
        '7' => 26,
        '-' => 27,
        '8' => 28,
        '0' => 29,
        ']' => 30,
        'O' => 31,
        'U' => 32,
        '[' => 33,
        'I' => 34,
        'P' => 35,
        'L' => 37,
        'J' => 38,
        '\'' => 39,
        'K' => 40,
        ';' => 41,
        '\\' => 42,
        ',' => 43,
        '/' => 44,
        'N' => 45,
        'M' => 46,
        '.' => 47,
        '`' => 50,
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_detect_macos_routes_known_terminals_to_key_events() {
        assert_eq!(
            route_for_type_text("Ghostty", Some("com.mitchellh.ghostty"), "macos"),
            TerminalRoute::KeyEvent
        );
        assert_eq!(
            route_for_type_text("iTerm2", Some("com.googlecode.iterm2"), "macos"),
            TerminalRoute::KeyEvent
        );
        assert_eq!(
            route_for_type_text("Terminal", Some("com.apple.Terminal"), "macOS"),
            TerminalRoute::KeyEvent
        );
    }

    #[test]
    fn terminal_detect_windows_and_linux_route_terminal_classes_to_key_events() {
        assert_eq!(
            route_for_type_text("Windows Terminal", None, "windows"),
            TerminalRoute::KeyEvent
        );
        assert_eq!(
            route_for_type_text("wt.exe", None, "windows"),
            TerminalRoute::KeyEvent
        );
        assert_eq!(
            route_for_type_text("powershell.exe", None, "windows"),
            TerminalRoute::KeyEvent
        );
        assert_eq!(
            route_for_type_text("GVim", None, "Windows"),
            TerminalRoute::KeyEvent
        );
        assert_eq!(
            route_for_type_text("gnome-terminal-server", None, "linux"),
            TerminalRoute::KeyEvent
        );
    }

    #[test]
    fn terminal_detect_keeps_regular_apps_on_accessibility_text_route() {
        assert_eq!(
            route_for_type_text("Safari", Some("com.apple.Safari"), "macos"),
            TerminalRoute::AxText
        );
        assert_eq!(
            route_for_type_text("explorer.exe", None, "windows"),
            TerminalRoute::AxText
        );
        assert_eq!(
            route_for_type_text("Firefox", None, "linux"),
            TerminalRoute::AxText
        );
        assert_eq!(
            route_for_type_text("Ghostty", Some("com.mitchellh.ghostty"), "haiku"),
            TerminalRoute::AxText
        );
    }

    #[test]
    fn terminal_detect_does_not_match_generic_terminal_text() {
        for name in [
            "Terminal",
            "Terminal Services Manager",
            "Terminal Velocity",
            "Terminal App Docs",
        ] {
            assert_eq!(
                route_for_type_text(name, Some("com.example.not-terminal"), "macos"),
                TerminalRoute::AxText,
                "{name:?} should not match without a known terminal bundle"
            );
            assert_eq!(
                route_for_type_text(name, None, "windows"),
                TerminalRoute::AxText,
                "{name:?} should not match as a generic Windows class"
            );
        }
    }

    #[test]
    fn terminal_detect_trims_and_normalizes_platform_case() {
        assert_eq!(
            route_for_type_text(" Windows Terminal ", None, " Windows "),
            TerminalRoute::KeyEvent
        );
        assert_eq!(
            route_for_type_text("Ghostty", Some(" COM.MITCHELLH.GHOSTTY "), " MACOS "),
            TerminalRoute::KeyEvent
        );
    }

    #[test]
    fn terminal_detect_macos_app_name_match_is_conservative() {
        for name in ["Hyper Terminal", "Warp Drive", "Tabby Cat", "Kitty Notes"] {
            assert_eq!(
                route_for_type_text(name, Some("com.example.app"), "macos"),
                TerminalRoute::AxText,
                "{name:?} should not match from a loose app-name substring"
            );
        }
    }

    #[test]
    fn macos_terminal_key_map_covers_common_shell_text() {
        for ch in "echo \"$HOME\" && printf 'a_b|c\\n' < file > out? ~${x}!\n".chars() {
            assert!(
                macos_terminal_key_for_char(ch).is_some(),
                "expected terminal-safe key mapping for {ch:?}"
            );
        }
    }

    #[test]
    fn macos_terminal_key_map_uses_shift_for_shifted_symbols() {
        for ch in [
            '!', '@', '$', '&', '*', '(', ')', '_', '+', '{', '}', '|', ':', '"', '<', '>', '?',
            '~',
        ] {
            assert_eq!(
                macos_terminal_key_for_char(ch).map(|key| key.shift),
                Some(true),
                "{ch:?} should be typed with Shift"
            );
        }
        assert_eq!(
            macos_terminal_key_for_char('_'),
            Some(MacosTerminalKey {
                keycode: 27,
                shift: true,
            })
        );
        assert_eq!(
            macos_terminal_key_for_char('\n'),
            Some(MacosTerminalKey {
                keycode: 36,
                shift: false,
            })
        );
    }
}
