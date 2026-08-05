//! Skill tool implementation
//!
//! Supports loading and executing skills from user-level and project-level directories
//! Manages skill enabled/disabled status through SkillRegistry

use crate::agentic::persona_skill_runtime::{
    PersonaSkillFacts, TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY,
};
use crate::agentic::tools::framework::{
    Tool, ToolRenderOptions, ToolResult, ToolUseContext, ValidationResult,
};
use crate::util::errors::{VoidError, VoidResult};
use async_trait::async_trait;
use log::debug;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

// Use skills module
use super::skills::{get_skill_registry, SkillInfo, SkillLocation};

/// Skill tool
pub struct SkillTool;

pub(crate) struct AvailableSkillsContext {
    pub section: Option<String>,
    pub revision: String,
}

impl SkillTool {
    pub fn new() -> Self {
        Self
    }

    fn render_description(&self) -> String {
        r#"Execute a skill within the main conversation

<skills_instructions>
When users ask you to perform tasks, check whether any skills listed in the current skill listing can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke skills using this tool with the skill name only (no arguments)
- The skill's prompt will expand and provide detailed instructions on how to complete the task
- Examples:
  - `command: "pdf"` - invoke the pdf skill
  - `command: "xlsx"` - invoke the xlsx skill
  - `command: "ms-office-suite:pdf"` - invoke using fully qualified name

Important:
- Only use skills listed in the current skill listing's <available_skills> section
- Do not invoke a skill that is already running
</skills_instructions>"#
            .to_string()
    }

    fn skill_set_revision(skills: &[SkillInfo]) -> String {
        let mut identities: Vec<String> = skills
            .iter()
            .map(|skill| format!("{}@{}", skill.key, skill.revision))
            .collect();
        identities.sort();
        hex::encode(Sha256::digest(identities.join("\n").as_bytes()))
    }

    fn skill_cache_revision(
        skills: &[SkillInfo],
        context: Option<&ToolUseContext>,
    ) -> VoidResult<String> {
        let effective_revision = Self::skill_set_revision(skills);
        let Some(policy_identity) = context
            .and_then(|context| {
                context
                    .custom_data
                    .get(TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY)
            })
            .and_then(Value::as_str)
        else {
            return Ok(effective_revision);
        };
        if policy_identity.len() != 64
            || !policy_identity.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(VoidError::validation(
                "invalid Team member Skill policy cache identity".to_string(),
            ));
        }
        Ok(hex::encode(Sha256::digest(
            format!("policy:{policy_identity}\neffective:{effective_revision}").as_bytes(),
        )))
    }

    fn apply_persona_skill_policy(
        skills: Vec<SkillInfo>,
        context: Option<&ToolUseContext>,
    ) -> VoidResult<Vec<SkillInfo>> {
        let Some(context) = context else {
            return Ok(skills);
        };
        let Some(facts) = PersonaSkillFacts::from_custom_data(&context.custom_data)? else {
            return Ok(skills);
        };
        Ok(skills
            .into_iter()
            .filter(|skill| facts.allows_key(&skill.key))
            .collect())
    }

    pub(crate) async fn resolved_skills_for_context(
        context: Option<&ToolUseContext>,
    ) -> VoidResult<Vec<SkillInfo>> {
        let registry = get_skill_registry();
        let resolved = match context {
            Some(ctx) if ctx.is_remote() => {
                if let Some(fs) = ctx.ws_fs() {
                    let root = ctx
                        .workspace
                        .as_ref()
                        .map(|w| w.root_path_string())
                        .unwrap_or_default();
                    registry
                        .get_resolved_skills_for_remote_workspace(
                            fs,
                            &root,
                            ctx.agent_type.as_deref(),
                        )
                        .await
                } else {
                    registry
                        .get_resolved_skills_for_workspace(None, ctx.agent_type.as_deref())
                        .await
                }
            }
            Some(ctx) => {
                registry
                    .get_resolved_skills_for_workspace(
                        ctx.workspace_root(),
                        ctx.agent_type.as_deref(),
                    )
                    .await
            }
            None => registry.get_resolved_skills_for_workspace(None, None).await,
        };
        Self::apply_persona_skill_policy(resolved, context)
    }

    pub(crate) async fn build_available_skills_context(
        context: Option<&ToolUseContext>,
    ) -> VoidResult<AvailableSkillsContext> {
        let skills = Self::resolved_skills_for_context(context).await?;
        let revision = Self::skill_cache_revision(&skills, context)?;
        let skills_list = skills
            .iter()
            .map(SkillInfo::to_xml_desc)
            .collect::<Vec<_>>()
            .join("\n");
        let skills_list = skills_list.trim();
        if skills_list.is_empty() {
            return Ok(AvailableSkillsContext {
                section: None,
                revision,
            });
        }

        let mut section = format!("<available_skills>\n{}\n</available_skills>", skills_list);
        if context.map(|c| c.is_remote()).unwrap_or(false)
            && context.and_then(|c| c.ws_fs()).is_none()
        {
            section.push_str(
                "\n\nRemote workspace note: Project-level skills on the server could not be indexed because workspace I/O is unavailable. Only user-level skills are shown; Void will not fall back to scanning the remote path on the local filesystem.",
            );
        }
        Ok(AvailableSkillsContext {
            section: Some(section),
            revision,
        })
    }
}

#[async_trait]
impl Tool for SkillTool {
    fn name(&self) -> &str {
        "Skill"
    }

    async fn description(&self) -> VoidResult<String> {
        Ok(self.render_description())
    }

    fn short_description(&self) -> String {
        "Discover and load reusable skills for specialized workflows.".to_string()
    }

    async fn description_with_context(
        &self,
        _context: Option<&ToolUseContext>,
    ) -> VoidResult<String> {
        Ok(self.render_description())
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The skill name (no arguments). E.g., \"pdf\" or \"xlsx\""
                }
            },
            "required": ["command"],
            "additionalProperties": false
        })
    }

    fn is_readonly(&self) -> bool {
        true
    }

    fn is_concurrency_safe(&self, _input: Option<&Value>) -> bool {
        true
    }

    fn needs_permissions(&self, _input: Option<&Value>) -> bool {
        false
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        if input
            .get("command")
            .and_then(|v| v.as_str())
            .is_none_or(|s| s.is_empty())
        {
            return ValidationResult {
                result: false,
                message: Some("command is required and cannot be empty".to_string()),
                error_code: Some(400),
                meta: None,
            };
        }

        ValidationResult {
            result: true,
            message: None,
            error_code: None,
            meta: None,
        }
    }

    fn render_tool_use_message(&self, input: &Value, _options: &ToolRenderOptions) -> String {
        if let Some(command) = input.get("command").and_then(|v| v.as_str()) {
            format!("The \"{}\" skill is loaded.", command)
        } else {
            "Loading skill...".to_string()
        }
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        let skill_name = input
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| VoidError::tool("command is required".to_string()))?;

        debug!("Skill tool executing skill: {}", skill_name);

        if PersonaSkillFacts::from_custom_data(&context.custom_data)?.is_some() {
            let effective_skills = Self::resolved_skills_for_context(Some(context)).await?;
            if !effective_skills
                .iter()
                .any(|skill| skill.name == skill_name)
            {
                return Err(VoidError::tool(format!(
                    "Skill '{}' is outside the active persona or Team-member Skill allowlist, or is not effective in this scenario/workspace",
                    skill_name
                )));
            }
        }

        // Find and load skill through registry
        let registry = get_skill_registry();
        let skill_data = if context.is_remote() {
            if let Some(ws_fs) = context.ws_fs() {
                let root = context
                    .workspace
                    .as_ref()
                    .map(|w| w.root_path_string())
                    .unwrap_or_default();
                registry
                    .find_and_load_skill_for_remote_workspace(
                        skill_name,
                        ws_fs,
                        &root,
                        context.agent_type.as_deref(),
                    )
                    .await?
            } else {
                registry
                    .find_and_load_skill_for_workspace(
                        skill_name,
                        None,
                        context.agent_type.as_deref(),
                    )
                    .await?
            }
        } else {
            registry
                .find_and_load_skill_for_workspace(
                    skill_name,
                    context.workspace_root(),
                    context.agent_type.as_deref(),
                )
                .await?
        };

        let location_str = match skill_data.location {
            SkillLocation::User => "user",
            SkillLocation::Project => "project",
        };

        let result_for_assistant = format!(
            "Skill '{}' loaded successfully. Note: any paths mentioned in this skill are relative to {}, not the workspace.\n\n{}",
            skill_data.name, skill_data.path, skill_data.content
        );

        let result = ToolResult::Result {
            data: json!({
                "skill_name": skill_data.name,
                "description": skill_data.description,
                "location": location_str,
                "content": skill_data.content,
                "success": true
            }),
            result_for_assistant: Some(result_for_assistant),
            image_attachments: None,
        };

        Ok(vec![result])
    }
}

impl Default for SkillTool {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::SkillTool;
    use crate::agentic::persona_skill_runtime::{
        append_persona_skill_context_data, trusted_team_member_skill_context_vars,
        PersonaSkillFacts, TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY,
    };
    use crate::agentic::tools::framework::{Tool, ToolResult, ToolUseContext};
    use crate::agentic::tools::implementations::skills::{
        registry::SkillRegistry, SkillInfo, SkillLocation,
    };
    use crate::agentic::workspace::{
        WorkspaceCommandOptions, WorkspaceCommandResult, WorkspaceDirEntry, WorkspaceFileSystem,
        WorkspaceServices, WorkspaceShell,
    };
    use crate::agentic::WorkspaceBinding;
    use crate::service::remote_ssh::workspace_state::workspace_session_identity;
    use async_trait::async_trait;
    use serde_json::json;
    use std::path::PathBuf;
    use std::sync::Arc;
    use void_core_types::TeamMemberSkillPolicySnapshot;

    struct FakeRemoteFs;

    #[async_trait]
    impl WorkspaceFileSystem for FakeRemoteFs {
        async fn read_file(&self, path: &str) -> anyhow::Result<Vec<u8>> {
            Ok(self.read_file_text(path).await?.into_bytes())
        }

        async fn read_file_text(&self, path: &str) -> anyhow::Result<String> {
            if path == "/remote/project/.void/skills/remote-only/SKILL.md" {
                return Ok(r#"---
name: remote-only-skill-for-test
description: Remote project skill visible only through workspace services.
---

Use the remote project skill.
"#
                .to_string());
            }
            anyhow::bail!("not found: {}", path)
        }

        async fn write_file(&self, _path: &str, _contents: &[u8]) -> anyhow::Result<()> {
            Ok(())
        }

        async fn exists(&self, path: &str) -> anyhow::Result<bool> {
            Ok(matches!(
                path,
                "/remote/project/.void/skills"
                    | "/remote/project/.void/skills/remote-only"
                    | "/remote/project/.void/skills/remote-only/SKILL.md"
            ))
        }

        async fn is_file(&self, path: &str) -> anyhow::Result<bool> {
            Ok(path == "/remote/project/.void/skills/remote-only/SKILL.md")
        }

        async fn is_dir(&self, path: &str) -> anyhow::Result<bool> {
            Ok(matches!(
                path,
                "/remote/project/.void/skills" | "/remote/project/.void/skills/remote-only"
            ))
        }

        async fn read_dir(&self, path: &str) -> anyhow::Result<Vec<WorkspaceDirEntry>> {
            if path == "/remote/project/.void/skills" {
                return Ok(vec![WorkspaceDirEntry {
                    name: "remote-only".to_string(),
                    path: "/remote/project/.void/skills/remote-only".to_string(),
                    is_dir: true,
                    is_symlink: false,
                }]);
            }
            Ok(vec![])
        }
    }

    struct FakeShell;

    #[async_trait]
    impl WorkspaceShell for FakeShell {
        async fn exec_with_options(
            &self,
            _command: &str,
            _options: WorkspaceCommandOptions,
        ) -> anyhow::Result<WorkspaceCommandResult> {
            Ok(WorkspaceCommandResult {
                stdout: String::new(),
                stderr: String::new(),
                exit_code: 0,
                interrupted: false,
                timed_out: false,
            })
        }
    }

    fn local_context(agent_type: &str) -> ToolUseContext {
        ToolUseContext {
            tool_call_id: None,
            agent_type: Some(agent_type.to_string()),
            session_id: None,
            dialog_turn_id: None,
            workspace: None,
            unlocked_collapsed_tools: Vec::new(),
            custom_data: Default::default(),
            computer_use_host: None,
            cancellation_token: None,
            runtime_tool_restrictions: Default::default(),
            workspace_services: None,
        }
    }

    fn remote_context(agent_type: &str) -> ToolUseContext {
        let identity =
            workspace_session_identity("/remote/project", Some("conn-1"), Some("remote-host"))
                .expect("remote identity");
        let workspace = WorkspaceBinding::new_remote(
            Some("remote-workspace".to_string()),
            PathBuf::from("/remote/project"),
            "conn-1".to_string(),
            "Remote".to_string(),
            identity,
        );

        ToolUseContext {
            tool_call_id: None,
            agent_type: Some(agent_type.to_string()),
            session_id: None,
            dialog_turn_id: None,
            workspace: Some(workspace),
            unlocked_collapsed_tools: Vec::new(),
            custom_data: Default::default(),
            computer_use_host: None,
            cancellation_token: None,
            runtime_tool_restrictions: Default::default(),
            workspace_services: Some(WorkspaceServices {
                fs: Arc::new(FakeRemoteFs),
                shell: Arc::new(FakeShell),
            }),
        }
    }

    fn revision_test_skill(key: &str, revision: &str) -> SkillInfo {
        SkillInfo {
            key: format!("void:{}", key),
            name: key.to_string(),
            display_name: None,
            description: format!("{} description", key),
            allowed_parent_agent_ids: Vec::new(),
            suggested_prompts: Vec::new(),
            revision: revision.to_string(),
            path: format!("/skills/{}", key),
            level: SkillLocation::User,
            source_slot: "void".to_string(),
            dir_name: key.to_string(),
            is_builtin: false,
            is_authorable: false,
            group_key: None,
            is_shadowed: false,
            shadowed_by_key: None,
        }
    }

    #[test]
    fn skill_set_revision_is_order_independent_and_tracks_content_revision() {
        let first = revision_test_skill("first", "r1");
        let second = revision_test_skill("second", "r1");

        let forward = SkillTool::skill_set_revision(&[first.clone(), second.clone()]);
        let reversed = SkillTool::skill_set_revision(&[second.clone(), first.clone()]);
        let changed = SkillTool::skill_set_revision(&[revision_test_skill("first", "r2"), second]);

        assert_eq!(forward, reversed);
        assert_ne!(forward, changed);
    }

    #[test]
    fn member_policy_identity_partitions_effective_skill_cache_revision() {
        let skills = vec![revision_test_skill("skill-a", "r1")];
        let mut first = local_context("agentic");
        first.custom_data.insert(
            TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY.to_string(),
            json!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        );
        let mut second = first.clone();
        second.custom_data.insert(
            TEAM_MEMBER_SKILL_POLICY_IDENTITY_CONTEXT_KEY.to_string(),
            json!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
        );

        assert_ne!(
            SkillTool::skill_cache_revision(&skills, Some(&first)).unwrap(),
            SkillTool::skill_cache_revision(&skills, Some(&second)).unwrap()
        );
        assert_ne!(
            SkillTool::skill_cache_revision(&skills, Some(&first)).unwrap(),
            SkillTool::skill_set_revision(&skills)
        );
    }

    #[test]
    fn persona_policy_only_narrows_effective_skills_and_keeps_revision_tracking() {
        let facts = PersonaSkillFacts::from_allowed_skill_keys(&["void:skill-a".to_string()])
            .unwrap()
            .unwrap();
        let mut context_vars = Default::default();
        facts.write_context_vars(&mut context_vars);
        let mut context = local_context("agentic");
        append_persona_skill_context_data(&context_vars, &mut context.custom_data);

        let first = SkillTool::apply_persona_skill_policy(
            vec![
                revision_test_skill("skill-a", "r1"),
                revision_test_skill("skill-b", "r1"),
            ],
            Some(&context),
        )
        .unwrap();
        let changed = SkillTool::apply_persona_skill_policy(
            vec![
                revision_test_skill("skill-a", "r2"),
                revision_test_skill("skill-b", "r1"),
            ],
            Some(&context),
        )
        .unwrap();

        assert_eq!(
            first
                .iter()
                .map(|skill| skill.key.as_str())
                .collect::<Vec<_>>(),
            vec!["void:skill-a"]
        );
        assert_ne!(
            SkillTool::skill_set_revision(&first),
            SkillTool::skill_set_revision(&changed)
        );
    }

    async fn assert_explicit_skill_denied(context: &ToolUseContext, skill_name: &str) {
        let error = match SkillTool::new()
            .call_impl(&json!({ "command": skill_name }), context)
            .await
        {
            Ok(_) => {
                panic!("skill '{skill_name}' must not bypass the agent's fixed skill allowlist")
            }
            Err(error) => error,
        };
        let message = error.to_string();
        assert!(
            message.contains("fixed skill allowlist"),
            "denial must identify the fixed skill allowlist boundary: {message}"
        );
    }

    async fn assert_explicit_skill_loaded(context: &ToolUseContext, skill_name: &str) {
        let results = SkillTool::new()
            .call_impl(&json!({ "command": skill_name }), context)
            .await
            .unwrap_or_else(|error| panic!("skill '{skill_name}' should load: {error}"));

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected result payload for skill '{skill_name}'");
        };
        assert_eq!(data["skill_name"], skill_name);
        assert_eq!(data["success"], true);
    }

    async fn assert_unknown_skill_not_found(context: &ToolUseContext) {
        let skill_name = "unknown-short-drama-skill-for-test";
        let error = match SkillTool::new()
            .call_impl(&json!({ "command": skill_name }), context)
            .await
        {
            Ok(_) => panic!("unknown skill '{skill_name}' must not load"),
            Err(error) => error,
        };
        let message = error.to_string();
        assert!(
            message.contains("not found"),
            "unknown skill must preserve the not-found result: {message}"
        );
        assert!(
            !message.contains("fixed skill allowlist"),
            "unknown skill must not be misreported as an allowlist denial: {message}"
        );
    }

    async fn assert_fixed_short_drama_allowlists(context_for: impl Fn(&str) -> ToolUseContext) {
        for agent_type in ["AssetAI", "SplitAI", "ScriptAI", "VideoAI", "EditorAI"] {
            assert_explicit_skill_denied(&context_for(agent_type), "cso").await;
        }

        let asset = context_for("AssetAI");
        assert_explicit_skill_loaded(&asset, "short-drama-character-board").await;
        assert_explicit_skill_loaded(&asset, "cinematic-style-repair").await;

        let split = context_for("SplitAI");
        assert_explicit_skill_loaded(&split, "cinematic-style-repair").await;
        assert_explicit_skill_denied(&split, "short-drama-character-board").await;

        for agent_type in ["ScriptAI", "VideoAI", "EditorAI"] {
            assert_explicit_skill_denied(&context_for(agent_type), "cinematic-style-repair").await;
        }

        assert_unknown_skill_not_found(&context_for("AssetAI")).await;
    }

    #[tokio::test]
    async fn local_explicit_skill_invocation_enforces_fixed_short_drama_allowlists() {
        assert_fixed_short_drama_allowlists(local_context).await;
    }

    #[tokio::test]
    async fn remote_explicit_skill_invocation_enforces_fixed_short_drama_allowlists() {
        assert_fixed_short_drama_allowlists(remote_context).await;
    }

    #[tokio::test]
    async fn local_explicit_skill_invocation_keeps_default_hidden_gstack_available_for_agentic() {
        assert_explicit_skill_loaded(&local_context("agentic"), "cso").await;
    }

    #[tokio::test]
    async fn restricted_team_member_listing_and_direct_invocation_share_one_intersection() {
        let mut context = local_context("agentic");
        let effective = SkillTool::resolved_skills_for_context(Some(&context))
            .await
            .unwrap();
        let allowed = effective
            .first()
            .expect("agentic must expose at least one effective Skill")
            .clone();
        let denied = effective
            .iter()
            .find(|skill| skill.key != allowed.key)
            .expect("test requires another effective Skill")
            .clone();
        let policy = TeamMemberSkillPolicySnapshot::new(
            "definition".into(),
            "revision".into(),
            "instance".into(),
            "member".into(),
            "agent".into(),
            vec![allowed.key.clone()],
        )
        .unwrap();
        let projected =
            trusted_team_member_skill_context_vars(&Default::default(), Some(&policy)).unwrap();
        append_persona_skill_context_data(&projected, &mut context.custom_data);

        let listed = SkillTool::resolved_skills_for_context(Some(&context))
            .await
            .unwrap();
        assert_eq!(
            listed
                .iter()
                .map(|skill| skill.key.as_str())
                .collect::<Vec<_>>(),
            vec![allowed.key.as_str()]
        );
        assert_explicit_skill_loaded(&context, &allowed.name).await;
        let error = SkillTool::new()
            .call_impl(&json!({ "command": denied.name }), &context)
            .await
            .expect_err("Skill outside the member intersection must be denied");
        assert!(error.to_string().contains("Team-member Skill allowlist"));
    }

    #[tokio::test]
    async fn remote_description_indexes_project_skills_through_workspace_services() {
        let identity =
            workspace_session_identity("/remote/project", Some("conn-1"), Some("remote-host"))
                .expect("remote identity");
        let workspace = WorkspaceBinding::new_remote(
            Some("remote-workspace".to_string()),
            PathBuf::from("/remote/project"),
            "conn-1".to_string(),
            "Remote".to_string(),
            identity,
        );
        let context = crate::agentic::tools::framework::ToolUseContext {
            tool_call_id: None,
            agent_type: None,
            session_id: None,
            dialog_turn_id: None,
            workspace: Some(workspace),
            unlocked_collapsed_tools: Vec::new(),
            custom_data: Default::default(),
            computer_use_host: None,
            cancellation_token: None,
            runtime_tool_restrictions: Default::default(),
            workspace_services: Some(WorkspaceServices {
                fs: Arc::new(FakeRemoteFs),
                shell: Arc::new(FakeShell),
            }),
        };

        let description = SkillTool::build_available_skills_context(Some(&context))
            .await
            .expect("Skill listing should resolve")
            .section
            .expect("available skills section");

        assert!(description.contains("remote-only-skill-for-test"));
        assert!(
            description.contains("Remote project skill visible only through workspace services.")
        );
    }

    #[tokio::test]
    async fn remote_call_loads_default_hidden_builtin_team_skill_when_explicitly_invoked() {
        let identity =
            workspace_session_identity("/remote/project", Some("conn-1"), Some("remote-host"))
                .expect("remote identity");
        let workspace = WorkspaceBinding::new_remote(
            Some("remote-workspace".to_string()),
            PathBuf::from("/remote/project"),
            "conn-1".to_string(),
            "Remote".to_string(),
            identity,
        );
        let context = crate::agentic::tools::framework::ToolUseContext {
            tool_call_id: None,
            agent_type: Some("agentic".to_string()),
            session_id: None,
            dialog_turn_id: None,
            workspace: Some(workspace),
            unlocked_collapsed_tools: Vec::new(),
            custom_data: Default::default(),
            computer_use_host: None,
            cancellation_token: None,
            runtime_tool_restrictions: Default::default(),
            workspace_services: Some(WorkspaceServices {
                fs: Arc::new(FakeRemoteFs),
                shell: Arc::new(FakeShell),
            }),
        };

        let results = SkillTool::new()
            .call_impl(&json!({ "command": "cso" }), &context)
            .await
            .expect("explicit cso invocation should load the local built-in skill");

        let ToolResult::Result { data, .. } = &results[0] else {
            panic!("expected result payload");
        };
        assert_eq!(data["skill_name"], "cso");
        assert_eq!(data["location"], "user");
        assert!(data["content"]
            .as_str()
            .unwrap_or_default()
            .contains("# /cso"));
    }

    struct OrderingRemoteFs;

    #[async_trait]
    impl WorkspaceFileSystem for OrderingRemoteFs {
        async fn read_file(&self, path: &str) -> anyhow::Result<Vec<u8>> {
            Ok(self.read_file_text(path).await?.into_bytes())
        }

        async fn read_file_text(&self, path: &str) -> anyhow::Result<String> {
            match path {
                "/remote/project/.void/skills/z-last/SKILL.md" => {
                    Ok("---\nname: z-last\ndescription: last\n---\n\nz\n".to_string())
                }
                "/remote/project/.void/skills/a-first/SKILL.md" => {
                    Ok("---\nname: A-First\ndescription: first\n---\n\na\n".to_string())
                }
                "/remote/project/.void/skills/dup-one/SKILL.md" => {
                    Ok("---\nname: dup\ndescription: dup one\n---\n\none\n".to_string())
                }
                "/remote/project/.void/skills/dup-two/SKILL.md" => {
                    Ok("---\nname: dup\ndescription: dup two\n---\n\ntwo\n".to_string())
                }
                _ => anyhow::bail!("not found: {}", path),
            }
        }

        async fn write_file(&self, _path: &str, _contents: &[u8]) -> anyhow::Result<()> {
            Ok(())
        }

        async fn exists(&self, path: &str) -> anyhow::Result<bool> {
            Ok(self.is_dir(path).await? || self.is_file(path).await?)
        }

        async fn is_file(&self, path: &str) -> anyhow::Result<bool> {
            Ok(matches!(
                path,
                "/remote/project/.void/skills/z-last/SKILL.md"
                    | "/remote/project/.void/skills/a-first/SKILL.md"
                    | "/remote/project/.void/skills/dup-one/SKILL.md"
                    | "/remote/project/.void/skills/dup-two/SKILL.md"
            ))
        }

        async fn is_dir(&self, path: &str) -> anyhow::Result<bool> {
            Ok(matches!(
                path,
                "/remote/project/.void/skills"
                    | "/remote/project/.void/skills/z-last"
                    | "/remote/project/.void/skills/a-first"
                    | "/remote/project/.void/skills/dup-one"
                    | "/remote/project/.void/skills/dup-two"
            ))
        }

        async fn read_dir(&self, path: &str) -> anyhow::Result<Vec<WorkspaceDirEntry>> {
            match path {
                "/remote/project/.void/skills" => Ok(vec![
                    WorkspaceDirEntry {
                        name: "z-last".to_string(),
                        path: "/remote/project/.void/skills/z-last".to_string(),
                        is_dir: true,
                        is_symlink: false,
                    },
                    WorkspaceDirEntry {
                        name: "a-first".to_string(),
                        path: "/remote/project/.void/skills/a-first".to_string(),
                        is_dir: true,
                        is_symlink: false,
                    },
                    WorkspaceDirEntry {
                        name: "dup-two".to_string(),
                        path: "/remote/project/.void/skills/dup-two".to_string(),
                        is_dir: true,
                        is_symlink: false,
                    },
                    WorkspaceDirEntry {
                        name: "dup-one".to_string(),
                        path: "/remote/project/.void/skills/dup-one".to_string(),
                        is_dir: true,
                        is_symlink: false,
                    },
                ]),
                _ => Ok(vec![]),
            }
        }
    }

    #[tokio::test]
    async fn prompt_stability_remote_skill_resolution_is_sorted_and_deterministic() {
        let skills = SkillRegistry::global()
            .get_resolved_skills_for_remote_workspace(&OrderingRemoteFs, "/remote/project", None)
            .await;

        assert_eq!(
            skills
                .iter()
                .filter(|skill| skill.level == SkillLocation::Project)
                .map(|skill| skill.name.as_str())
                .collect::<Vec<_>>(),
            vec!["A-First", "dup", "z-last"]
        );
        assert_eq!(
            skills
                .iter()
                .find(|skill| skill.name == "dup")
                .map(|skill| skill.description.as_str()),
            Some("dup one")
        );
    }
}
