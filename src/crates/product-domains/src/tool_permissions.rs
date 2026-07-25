//! Pure tool-permission policy contracts.
//!
//! This module owns deterministic permission decisions only. Runtime approval
//! prompts and tool execution remain in their respective adapters.

use serde::{Deserialize, Serialize};

/// User-facing execution mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ToolPermissionMode {
    /// Ask before a rule or preset permits execution.
    #[default]
    Ask,
    /// Automatically approve `Ask`, while preserving explicit `Deny`.
    Auto,
    /// Permit by default, while preserving explicit ordered rules.
    FullAccess,
}

/// Default decision used when no ordered rule matches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolPermissionPreset {
    Ask,
    FullAccess,
}

/// Runtime-neutral permission decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolPermissionDecision {
    Allow,
    Ask,
    Deny,
}

/// An ordered rule. The last matching rule wins so later layers can override
/// earlier defaults.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolPermissionRule {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Exact tool name, or `*` for every tool.
    pub tool: String,
    /// Exact intent name, `*`, or `None` for every intent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intent: Option<String>,
    pub decision: ToolPermissionDecision,
}

/// Persisted policy configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ToolPermissionConfig {
    pub mode: ToolPermissionMode,
    pub rules: Vec<ToolPermissionRule>,
}

impl ToolPermissionConfig {
    pub fn preset(&self) -> ToolPermissionPreset {
        match self.mode {
            ToolPermissionMode::Ask | ToolPermissionMode::Auto => ToolPermissionPreset::Ask,
            ToolPermissionMode::FullAccess => ToolPermissionPreset::FullAccess,
        }
    }

    /// Evaluate ordered rules, then apply the selected mode.
    pub fn resolve(&self, tool: &str, intent: Option<&str>) -> ToolPermissionResolution {
        let base = self
            .rules
            .iter()
            .enumerate()
            .rev()
            .find(|(_, rule)| rule.matches(tool, intent))
            .map(|(index, rule)| ToolPermissionResolution {
                decision: rule.decision,
                source: ToolPermissionSource::OrderedRule {
                    index,
                    rule_id: rule.id.clone(),
                },
                reason: ToolPermissionReason::RuleMatched,
            })
            .unwrap_or_else(|| {
                let preset = self.preset();
                ToolPermissionResolution {
                    decision: match preset {
                        ToolPermissionPreset::Ask => ToolPermissionDecision::Ask,
                        ToolPermissionPreset::FullAccess => ToolPermissionDecision::Allow,
                    },
                    source: ToolPermissionSource::Preset { preset },
                    reason: ToolPermissionReason::PresetDefault,
                }
            });

        if self.mode == ToolPermissionMode::Auto && base.decision == ToolPermissionDecision::Ask {
            ToolPermissionResolution {
                decision: ToolPermissionDecision::Allow,
                source: ToolPermissionSource::Mode {
                    mode: ToolPermissionMode::Auto,
                },
                reason: ToolPermissionReason::AutoApprovedAsk,
            }
        } else {
            base
        }
    }
}

impl ToolPermissionRule {
    fn matches(&self, tool: &str, intent: Option<&str>) -> bool {
        let tool_matches = self.tool == "*" || self.tool.eq_ignore_ascii_case(tool);
        let intent_matches = match self.intent.as_deref() {
            None | Some("*") => true,
            Some(expected) => intent.is_some_and(|actual| expected.eq_ignore_ascii_case(actual)),
        };
        tool_matches && intent_matches
    }
}

/// Typed origin of the effective decision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ToolPermissionSource {
    OrderedRule {
        index: usize,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        rule_id: Option<String>,
    },
    Preset {
        preset: ToolPermissionPreset,
    },
    Mode {
        mode: ToolPermissionMode,
    },
}

/// Typed explanation suitable for logging or presentation mapping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolPermissionReason {
    RuleMatched,
    PresetDefault,
    AutoApprovedAsk,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolPermissionResolution {
    pub decision: ToolPermissionDecision,
    pub source: ToolPermissionSource,
    pub reason: ToolPermissionReason,
}
