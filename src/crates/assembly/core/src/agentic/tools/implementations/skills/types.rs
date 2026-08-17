//! Skill type definitions

use crate::util::errors::{VoidError, VoidResult};
use crate::util::front_matter_markdown::FrontMatterMarkdown;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Skill location
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillLocation {
    /// User-level (global)
    User,
    /// Project-level
    Project,
}

impl SkillLocation {
    pub fn as_str(&self) -> &'static str {
        match self {
            SkillLocation::User => "user",
            SkillLocation::Project => "project",
        }
    }
}

/// Complete skill information (for API return)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    /// Runtime-unique identifier derived from source slot + directory name.
    pub key: String,
    /// Skill name (read from SKILL.md, used by the model to invoke the skill)
    pub name: String,
    /// Optional localized presentation name. Runtime identity continues to use `name`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// Description (read from SKILL.md)
    pub description: String,
    /// Parent Agent IDs allowed to expose this skill. Empty keeps legacy public behavior.
    #[serde(default)]
    pub allowed_parent_agent_ids: Vec<String>,
    /// Suggested prompts shown by customization surfaces.
    #[serde(default)]
    pub suggested_prompts: Vec<String>,
    /// Content-derived revision used by cache and authoring consistency checks.
    pub revision: String,
    /// Skill folder path
    pub path: String,
    /// Level (project-level/user-level)
    pub level: SkillLocation,
    /// Source slot that discovered this skill.
    pub source_slot: String,
    /// Directory name under the slot's `skills/` root.
    pub dir_name: String,
    /// Whether this skill is bundled with Void as a built-in skill.
    #[serde(default)]
    pub is_builtin: bool,
    /// True only for Void-authored UUID skills that support safe in-place editing.
    #[serde(default)]
    pub is_authorable: bool,
    /// Optional logical group for built-in skills.
    #[serde(default)]
    pub group_key: Option<String>,
    /// True when this skill is shadowed by a higher-priority skill with the same name.
    #[serde(default)]
    pub is_shadowed: bool,
    /// Key of the skill that shadows this one (if any).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadowed_by_key: Option<String>,
}

impl SkillInfo {
    pub fn presentation_name(&self) -> &str {
        self.display_name.as_deref().unwrap_or(&self.name)
    }

    /// Convert to XML description (for tool description)
    pub fn to_xml_desc(&self) -> String {
        format!(
            r#"<skill>
<name>
{}
</name>
<description>
{}
</description>
<location>
{}
</location>
</skill>
"#,
            self.name, self.description, self.path
        )
    }
}

/// The most specific rule that determined a skill's availability in a mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModeSkillStateReason {
    ProjectDefaultEnabled,
    DisabledByProjectOverride,
    CustomUserDefaultEnabled,
    BuiltinPolicyEnabled,
    BuiltinPolicyDisabled,
    EnabledByUserOverride,
    DisabledByUserOverride,
    EnabledByAgentAllowlist,
    DisabledByAgentAllowlist,
    EnabledBySkillAllowlist,
    DisabledBySkillAllowlist,
}

/// Skill information annotated for a specific mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeSkillInfo {
    #[serde(flatten)]
    pub skill: SkillInfo,
    /// Whether this skill is enabled by default before user/project overrides.
    pub default_enabled: bool,
    /// Whether this skill is effectively enabled after applying all overrides.
    pub effective_enabled: bool,
    /// Backward-compatible inverse of `effective_enabled`.
    pub disabled_by_mode: bool,
    /// True when this skill is the one actually selected for runtime after applying
    /// mode disables and same-name priority resolution.
    pub selected_for_runtime: bool,
    /// The rule that ultimately decided the effective state of this skill.
    pub state_reason: ModeSkillStateReason,
}

/// Skill data (contains content, for execution)
#[derive(Debug, Clone)]
pub struct SkillData {
    pub key: String,
    pub name: String,
    pub display_name: Option<String>,
    pub description: String,
    pub allowed_parent_agent_ids: Vec<String>,
    pub suggested_prompts: Vec<String>,
    pub revision: String,
    pub authoring_version: Option<u32>,
    pub content: String,
    pub location: SkillLocation,
    pub path: String,
    pub source_slot: String,
    pub dir_name: String,
}

impl SkillData {
    fn normalize_optional_string(value: Option<String>) -> Option<String> {
        value
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    }

    fn normalize_string_sequence(
        metadata: &serde_yaml::Value,
        key: &str,
        sort: bool,
    ) -> Vec<String> {
        let values: Vec<String> = metadata
            .get(key)
            .and_then(|value| value.as_sequence())
            .into_iter()
            .flatten()
            .filter_map(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect();
        if sort {
            let mut values = values;
            values.sort();
            values.dedup();
            return values;
        }

        let mut seen = std::collections::HashSet::new();
        values
            .into_iter()
            .filter(|value| seen.insert(value.clone()))
            .collect()
    }

    /// Parse Skill from SKILL.md file content
    pub fn from_markdown(
        path: String,
        content: &str,
        location: SkillLocation,
        with_content: bool,
    ) -> VoidResult<Self> {
        let (metadata, body) = FrontMatterMarkdown::load_str(content)
            .map_err(|e| VoidError::tool(format!("Invalid SKILL.md format: {}", e)))?;

        let name = metadata
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| {
                VoidError::tool("Missing required field 'name' in SKILL.md".to_string())
            })?;

        let display_name = Self::normalize_optional_string(
            metadata
                .get("displayName")
                .and_then(|value| value.as_str())
                .map(str::to_string),
        );
        let description = metadata
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| {
                VoidError::tool("Missing required field 'description' in SKILL.md".to_string())
            })?;
        let allowed_parent_agent_ids =
            Self::normalize_string_sequence(&metadata, "allowedParentAgentIds", true);
        let suggested_prompts =
            Self::normalize_string_sequence(&metadata, "suggestedPrompts", false);
        let revision = hex::encode(Sha256::digest(content.as_bytes()));
        let authoring_version = metadata
            .get("authoringVersion")
            .and_then(|value| value.as_u64())
            .and_then(|value| u32::try_from(value).ok());

        let skill_content = if with_content { body } else { String::new() };
        let dir_name = std::path::Path::new(&path)
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| VoidError::tool(format!("Invalid skill path: {}", path)))?
            .to_string();

        Ok(SkillData {
            key: String::new(),
            name,
            display_name,
            description,
            allowed_parent_agent_ids,
            suggested_prompts,
            revision,
            authoring_version,
            content: skill_content,
            location,
            path,
            source_slot: String::new(),
            dir_name,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{SkillData, SkillLocation};

    #[test]
    fn parses_localized_authoring_metadata_without_changing_runtime_name() {
        let content = r#"---
name: custom-0123456789abcdef0123456789abcdef
displayName: 财务报告分析
description: 在办公场景中分析财务报告并输出风险提示。
allowedParentAgentIds:
  - Cowork
  - DeepResearch
  - Cowork
suggestedPrompts:
  - 分析这份财务报告
  - 找出主要风险
---

请先核对数据来源，再输出结论。"#;

        let data = SkillData::from_markdown(
            "/tmp/custom-0123456789abcdef0123456789abcdef".to_string(),
            content,
            SkillLocation::User,
            true,
        )
        .expect("authored skill should parse");

        assert_eq!(data.name, "custom-0123456789abcdef0123456789abcdef");
        assert_eq!(data.display_name.as_deref(), Some("财务报告分析"));
        assert_eq!(
            data.allowed_parent_agent_ids,
            vec!["Cowork".to_string(), "DeepResearch".to_string()]
        );
        assert_eq!(
            data.suggested_prompts,
            vec!["分析这份财务报告".to_string(), "找出主要风险".to_string()]
        );
        assert_eq!(data.revision.len(), 64);
        assert_eq!(data.content, "请先核对数据来源，再输出结论。");
    }

    #[test]
    fn revision_changes_when_skill_content_changes() {
        let first = SkillData::from_markdown(
            "/tmp/test".to_string(),
            "---\nname: test\ndescription: test\n---\n\nFirst",
            SkillLocation::User,
            false,
        )
        .expect("first skill should parse");
        let second = SkillData::from_markdown(
            "/tmp/test".to_string(),
            "---\nname: test\ndescription: test\n---\n\nSecond",
            SkillLocation::User,
            false,
        )
        .expect("second skill should parse");

        assert_ne!(first.revision, second.revision);
    }
}
