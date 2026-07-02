/// CLI slash command definitions

#[derive(Debug, Clone, Copy)]
pub struct CommandSpec {
    pub name: &'static str,
    pub description: &'static str,
}

/// All commands (available in chat mode)
pub const COMMAND_SPECS: &[CommandSpec] = &[
    CommandSpec {
        name: "/help",
        description: "Show help",
    },
    CommandSpec {
        name: "/clear",
        description: "Clear conversation",
    },
    CommandSpec {
        name: "/agents",
        description: "Switch agent mode",
    },
    CommandSpec {
        name: "/models",
        description: "Select model for all modes",
    },
    CommandSpec {
        name: "/theme",
        description: "Switch UI theme",
    },
    CommandSpec {
        name: "/connect",
        description: "Add a new AI model configuration",
    },
    CommandSpec {
        name: "/new",
        description: "New session",
    },
    CommandSpec {
        name: "/sessions",
        description: "Switch session",
    },
    CommandSpec {
        name: "/skills",
        description: "List and configure skills",
    },
    CommandSpec {
        name: "/subagents",
        description: "List and configure subagents",
    },
    CommandSpec {
        name: "/mcps",
        description: "Manage MCP servers",
    },
    CommandSpec {
        name: "/acp",
        description: "Show ACP server setup",
    },
    CommandSpec {
        name: "/init",
        description: "Explore repo and generate AGENTS.md",
    },
    CommandSpec {
        name: "/history",
        description: "Show history",
    },
    CommandSpec {
        name: "/usage",
        description: "Generate session usage report",
    },
    CommandSpec {
        name: "/exit",
        description: "Exit the app",
    },
];

/// Commands available on the startup page
pub const STARTUP_COMMAND_SPECS: &[CommandSpec] = &[
    CommandSpec {
        name: "/help",
        description: "Show keyboard shortcuts",
    },
    CommandSpec {
        name: "/sessions",
        description: "Browse and continue sessions",
    },
    CommandSpec {
        name: "/models",
        description: "Select model for all modes",
    },
    CommandSpec {
        name: "/theme",
        description: "Switch UI theme",
    },
    CommandSpec {
        name: "/connect",
        description: "Add a new AI model configuration",
    },
    CommandSpec {
        name: "/agents",
        description: "Switch agent mode",
    },
    CommandSpec {
        name: "/skills",
        description: "List and configure skills",
    },
    CommandSpec {
        name: "/subagents",
        description: "List and configure subagents",
    },
    CommandSpec {
        name: "/mcps",
        description: "Manage MCP servers",
    },
    CommandSpec {
        name: "/acp",
        description: "Show ACP server setup",
    },
    CommandSpec {
        name: "/init",
        description: "Explore repo and generate AGENTS.md",
    },
    CommandSpec {
        name: "/usage",
        description: "Generate session usage report",
    },
    CommandSpec {
        name: "/exit",
        description: "Exit the app",
    },
];

pub fn match_substring_in(
    query: &str,
    commands: &'static [CommandSpec],
) -> Vec<&'static CommandSpec> {
    if query.is_empty() {
        return Vec::new();
    }

    let query = query.strip_prefix('/').unwrap_or(query).to_lowercase();
    if query.is_empty() {
        return Vec::new();
    }

    commands
        .iter()
        .filter(|spec| {
            spec.name
                .strip_prefix('/')
                .unwrap_or(spec.name)
                .to_lowercase()
                .contains(&query)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_query_returns_empty() {
        assert!(match_substring_in("", COMMAND_SPECS).is_empty());
        assert!(match_substring_in("/", COMMAND_SPECS).is_empty());
    }

    #[test]
    fn exact_command_matches() {
        let result = match_substring_in("/help", COMMAND_SPECS);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "/help");
    }

    #[test]
    fn substring_command_matches_case_insensitively() {
        let result = match_substring_in("/USA", COMMAND_SPECS);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "/usage");
    }
}
