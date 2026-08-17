use void_product_domains::tool_permissions::{
    ToolPermissionConfig, ToolPermissionDecision, ToolPermissionMode, ToolPermissionPreset,
    ToolPermissionReason, ToolPermissionRule, ToolPermissionSource,
};

fn rule(id: &str, tool: &str, decision: ToolPermissionDecision) -> ToolPermissionRule {
    ToolPermissionRule {
        id: Some(id.to_string()),
        tool: tool.to_string(),
        intent: None,
        decision,
    }
}

#[test]
fn ask_and_full_access_presets_are_explicit() {
    let ask = ToolPermissionConfig::default().resolve("Read", None);
    assert_eq!(ask.decision, ToolPermissionDecision::Ask);
    assert_eq!(
        ask.source,
        ToolPermissionSource::Preset {
            preset: ToolPermissionPreset::Ask
        }
    );

    let full_access = ToolPermissionConfig {
        mode: ToolPermissionMode::FullAccess,
        rules: vec![],
    }
    .resolve("Bash", Some("execute"));
    assert_eq!(full_access.decision, ToolPermissionDecision::Allow);
    assert_eq!(full_access.reason, ToolPermissionReason::PresetDefault);
}

#[test]
fn ordered_rules_use_the_last_matching_allow_ask_or_deny() {
    let config = ToolPermissionConfig {
        mode: ToolPermissionMode::FullAccess,
        rules: vec![
            rule("allow-all", "*", ToolPermissionDecision::Allow),
            rule("ask-bash", "Bash", ToolPermissionDecision::Ask),
            rule("deny-bash", "Bash", ToolPermissionDecision::Deny),
        ],
    };

    let bash = config.resolve("bash", Some("execute"));
    assert_eq!(bash.decision, ToolPermissionDecision::Deny);
    assert_eq!(
        bash.source,
        ToolPermissionSource::OrderedRule {
            index: 2,
            rule_id: Some("deny-bash".to_string())
        }
    );

    let read = config.resolve("Read", None);
    assert_eq!(read.decision, ToolPermissionDecision::Allow);
}

#[test]
fn auto_only_approves_ask_and_never_overrides_deny() {
    let config = ToolPermissionConfig {
        mode: ToolPermissionMode::Auto,
        rules: vec![
            rule("deny-bash", "Bash", ToolPermissionDecision::Deny),
            rule("ask-write", "Write", ToolPermissionDecision::Ask),
        ],
    };

    let denied = config.resolve("Bash", None);
    assert_eq!(denied.decision, ToolPermissionDecision::Deny);
    assert_eq!(denied.reason, ToolPermissionReason::RuleMatched);

    let approved = config.resolve("Write", None);
    assert_eq!(approved.decision, ToolPermissionDecision::Allow);
    assert_eq!(approved.reason, ToolPermissionReason::AutoApprovedAsk);
    assert_eq!(
        approved.source,
        ToolPermissionSource::Mode {
            mode: ToolPermissionMode::Auto
        }
    );
}

#[test]
fn contracts_serialize_with_stable_snake_case_values() {
    let value = serde_json::to_value(ToolPermissionConfig {
        mode: ToolPermissionMode::FullAccess,
        rules: vec![rule("deny-shell", "Bash", ToolPermissionDecision::Deny)],
    })
    .expect("serialize permission config");

    assert_eq!(value["mode"], "full_access");
    assert_eq!(value["rules"][0]["decision"], "deny");
}

#[test]
fn runtime_without_trusted_intent_fails_closed_for_scoped_rules() {
    let config = ToolPermissionConfig {
        mode: ToolPermissionMode::FullAccess,
        rules: vec![ToolPermissionRule {
            id: Some("deny-shell-execute".to_string()),
            tool: "Bash".to_string(),
            intent: Some("execute".to_string()),
            decision: ToolPermissionDecision::Deny,
        }],
    };

    let resolution = config.resolve_without_intent("bash");
    assert_eq!(resolution.decision, ToolPermissionDecision::Deny);
    assert_eq!(resolution.reason, ToolPermissionReason::IntentUnavailable);
}
