use super::support::merge_dynamic_mcp_tools;
use super::AgentRegistry;
use crate::agentic::agents::definitions::custom::{CustomSubagent, CustomSubagentKind};
use crate::agentic::agents::registry::builtin::default_model_id_for_builtin_agent;
use crate::agentic::agents::registry::types::{
    AgentCategory, AgentEntry, CustomSubagentConfig, SubAgentSource, SubagentListScope,
    SubagentQueryContext,
};
use crate::agentic::agents::registry::visibility::{
    BuiltinSubagentExposure, SubagentVisibilityPolicy,
};
use crate::agentic::agents::{
    resolve_mode_config_profile_id, Agent, PromptBuilderContext, UserContextPolicy,
};
use crate::service::config::types::AgentSubagentOverrideState;
use async_trait::async_trait;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

struct TestAgent {
    id: String,
}

#[async_trait]
impl Agent for TestAgent {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn id(&self) -> &str {
        &self.id
    }

    fn name(&self) -> &str {
        &self.id
    }

    fn description(&self) -> &str {
        "Test subagent"
    }

    fn prompt_template_name(&self, _model_name: Option<&str>) -> &str {
        "test_agent"
    }

    fn user_context_policy(&self) -> UserContextPolicy {
        UserContextPolicy::empty()
    }

    fn default_tools(&self) -> Vec<String> {
        vec!["Read".to_string()]
    }
}

fn test_project_entry(id: &str, model: &str) -> AgentEntry {
    AgentEntry {
        category: AgentCategory::SubAgent,
        subagent_source: Some(SubAgentSource::Project),
        agent: Arc::new(TestAgent { id: id.to_string() }),
        visibility_policy: SubagentVisibilityPolicy::public(),
        custom_config: Some(CustomSubagentConfig {
            model: model.to_string(),
        }),
    }
}

fn insert_project_subagent(registry: &AgentRegistry, workspace: &Path, id: &str, model: &str) {
    let mut entries = HashMap::new();
    entries.insert(id.to_string(), test_project_entry(id, model));
    registry
        .write_project_subagents()
        .insert(workspace.to_path_buf(), entries);
}

fn custom_subagent(
    id: &str,
    prompt: &str,
    path: &Path,
    kind: CustomSubagentKind,
) -> CustomSubagent {
    CustomSubagent::new(
        id.to_string(),
        format!("{id} description"),
        vec!["Read".to_string()],
        prompt.to_string(),
        true,
        path.to_string_lossy().to_string(),
        kind,
    )
}

fn custom_prompt(registry: &AgentRegistry, id: &str, workspace: Option<&Path>) -> Option<String> {
    registry.get_agent(id, workspace).and_then(|agent| {
        agent
            .as_any()
            .downcast_ref::<CustomSubagent>()
            .map(|custom| custom.prompt.clone())
    })
}

fn unique_test_workspace(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "void-agent-registry-{label}-{}-{nonce}",
        std::process::id()
    ))
}

#[test]
fn top_level_modes_default_to_auto() {
    for agent_type in [
        "agentic",
        "Multitask",
        "Cowork",
        "Plan",
        "debug",
        "Claw",
        "DeepResearch",
        "Team",
        "Media",
    ] {
        assert_eq!(default_model_id_for_builtin_agent(agent_type), "auto");
    }
}

#[tokio::test]
async fn media_is_registered_as_conservative_top_level_mode() {
    let registry = AgentRegistry::new();
    let modes = registry.get_modes_info().await;
    let media = modes
        .iter()
        .find(|agent| agent.id == "Media")
        .expect("Media should be registered as a top-level mode");

    assert_eq!(media.name, "Media");
    assert!(!media.is_readonly);
    assert!(media.description.contains("media creation"));
    assert_eq!(
        media.default_tools,
        vec![
            "Task".to_string(),
            "Read".to_string(),
            "Grep".to_string(),
            "Glob".to_string(),
            "WebSearch".to_string(),
            "WebFetch".to_string(),
            "TodoWrite".to_string(),
            "Skill".to_string(),
            "AskUserQuestion".to_string(),
            "ControlHub".to_string(),
            "ShortDramaProject".to_string(),
            "GenerateImage".to_string(),
            "GenerateVideo".to_string(),
            "GetMediaTaskStatus".to_string(),
            "UploadMediaImage".to_string(),
            "GenerateSpeech".to_string(),
            "TranscribeAudio".to_string(),
            "CanvasRead".to_string(),
        ]
    );
    assert!(!media.default_tools.contains(&"Bash".to_string()));
    assert!(!media.default_tools.contains(&"Delete".to_string()));
    assert!(!media.default_tools.contains(&"Git".to_string()));
    assert!(!media.default_tools.contains(&"InitMiniApp".to_string()));

    let prompt = registry
        .get_mode_agent("Media")
        .expect("Media mode agent")
        .build_prompt(&PromptBuilderContext::new("D:/workspace/media", None, None))
        .await
        .expect("Media prompt should build");
    assert!(prompt.contains("Media Session"));
    assert!(prompt.contains("When the user asks to actually generate images"));
    assert!(prompt.contains("Use UploadMediaImage only when"));
    assert!(prompt.contains("Short Drama Center is an artifact workspace"));
    assert!(prompt
        .contains("The AI-facing source of truth is the current workspace short drama project"));
    assert!(prompt.contains("AI 短剧页面"));
    assert!(prompt.contains("创建 ai 短剧计划"));
    assert!(prompt.contains("Do not ask the user to manage imports from the right-side panel"));
    assert!(prompt.contains("ShortDramaProject"));
    assert!(prompt.contains("get_awareness"));
    assert!(prompt.contains("get_context_package"));
    assert!(prompt.contains("initialize_from_script"));
    assert!(prompt.contains("scriptContent"));
    assert!(prompt.contains("validate_integrity"));
    assert!(prompt.contains("list_media"));
    assert!(prompt.contains("request_change"));
    assert!(prompt.contains("update_artifact_prompt"));
    assert!(prompt.contains("playable media"));
    assert!(prompt.contains("empty slots"));
    assert!(prompt.contains("missing previews"));
    assert!(prompt.contains("set_focus"));
}

#[tokio::test]
async fn computer_use_is_builtin_subagent_not_mode() {
    let registry = AgentRegistry::new();
    let modes = registry.get_modes_info().await;
    assert!(
        !modes.iter().any(|agent| agent.id == "ComputerUse"),
        "ComputerUse should be delegated through Task as a built-in sub-agent, not exposed as a top-level mode"
    );

    let subagents = registry.get_subagents_info(None).await;
    let computer_use = subagents
        .iter()
        .find(|agent| agent.id == "ComputerUse")
        .expect("ComputerUse should be registered as a built-in sub-agent");
    assert!(computer_use
        .default_tools
        .contains(&"ControlHub".to_string()));
    assert!(computer_use
        .default_tools
        .contains(&"ComputerUse".to_string()));
    assert_eq!(
        computer_use.visibility.as_ref().map(|value| value.exposure),
        Some(BuiltinSubagentExposure::Restricted)
    );
}

#[test]
fn non_deep_review_builtin_subagents_default_to_primary() {
    for agent_type in ["Explore", "FileFinder", "CodeReview", "GenerateDoc"] {
        assert_eq!(
            default_model_id_for_builtin_agent(agent_type),
            "primary",
            "{agent_type} should default to the primary model slot"
        );
    }
}

#[test]
fn general_purpose_builtin_subagent_defaults_to_fast() {
    assert_eq!(default_model_id_for_builtin_agent("GeneralPurpose"), "fast");
}

#[test]
fn deep_review_family_defaults_to_fast() {
    for agent_type in [
        "DeepReview",
        "ReviewBusinessLogic",
        "ReviewPerformance",
        "ReviewSecurity",
        "ReviewArchitecture",
        "ReviewFrontend",
        "ReviewJudge",
        "ReviewFixer",
    ] {
        assert_eq!(
            default_model_id_for_builtin_agent(agent_type),
            "fast",
            "{agent_type} should stay on the fast model slot"
        );
    }
}

#[tokio::test]
async fn frontend_reviewer_is_registered_as_review_subagent() {
    let registry = AgentRegistry::new();
    let subagents = registry.get_subagents_info(None).await;
    let frontend = subagents
        .iter()
        .find(|agent| agent.id == "ReviewFrontend")
        .expect("ReviewFrontend should be registered as a subagent");

    assert!(frontend.is_review);
    assert!(frontend.is_readonly);
}

#[test]
fn built_in_deep_review_reviewers_are_marked_as_review_agents() {
    let registry = AgentRegistry::new();

    for agent_type in [
        "ReviewBusinessLogic",
        "ReviewPerformance",
        "ReviewSecurity",
        "ReviewArchitecture",
        "ReviewFrontend",
        "ReviewJudge",
    ] {
        assert_eq!(
            registry.get_subagent_is_review(agent_type),
            Some(true),
            "{agent_type} must pass DeepReview Task policy validation"
        );
    }
}

#[tokio::test]
async fn task_visible_subagents_are_filtered_by_parent_agent() {
    let registry = AgentRegistry::new();

    let agentic_visible = registry
        .get_subagents_for_query(&SubagentQueryContext {
            parent_agent_type: Some("agentic"),
            workspace_root: None,
            list_scope: SubagentListScope::TaskVisible,
            include_disabled: false,
        })
        .await;
    assert!(agentic_visible.iter().any(|agent| agent.id == "Explore"));
    assert!(agentic_visible
        .iter()
        .any(|agent| agent.id == "GeneralPurpose"));
    assert!(!agentic_visible
        .iter()
        .any(|agent| agent.id == "ReviewSecurity"));
    assert!(!agentic_visible
        .iter()
        .any(|agent| agent.id == "ResearchSpecialist"));

    let deep_review_visible = registry
        .get_subagents_for_query(&SubagentQueryContext {
            parent_agent_type: Some("DeepReview"),
            workspace_root: None,
            list_scope: SubagentListScope::TaskVisible,
            include_disabled: false,
        })
        .await;
    assert!(deep_review_visible
        .iter()
        .any(|agent| agent.id == "ReviewSecurity"));
    assert!(!deep_review_visible
        .iter()
        .any(|agent| agent.id == "ResearchSpecialist"));

    let deep_research_visible = registry
        .get_subagents_for_query(&SubagentQueryContext {
            parent_agent_type: Some("DeepResearch"),
            workspace_root: None,
            list_scope: SubagentListScope::TaskVisible,
            include_disabled: false,
        })
        .await;
    assert!(deep_research_visible
        .iter()
        .any(|agent| agent.id == "ResearchSpecialist"));
    assert!(!deep_research_visible
        .iter()
        .any(|agent| agent.id == "ReviewSecurity"));
}

#[test]
fn merge_dynamic_mcp_tools_appends_registered_mcp_tools_once() {
    let configured_tools = vec!["Read".to_string(), "Bash".to_string()];
    let registered_tool_names = vec![
        "Read".to_string(),
        "mcp__notion__notion-search".to_string(),
        "mcp__github__list_issues".to_string(),
        "mcp__notion__notion-search".to_string(),
    ];

    let merged = merge_dynamic_mcp_tools(configured_tools, &registered_tool_names);

    assert_eq!(
        merged,
        vec![
            "Read".to_string(),
            "Bash".to_string(),
            "mcp__notion__notion-search".to_string(),
            "mcp__github__list_issues".to_string(),
        ]
    );
}

#[test]
fn project_subagent_config_lookup_is_workspace_scoped() {
    let registry = AgentRegistry::new();
    let workspace_a = PathBuf::from("D:/workspace/project-a");
    let workspace_b = PathBuf::from("D:/workspace/project-b");
    insert_project_subagent(&registry, &workspace_a, "SharedReviewer", "fast");
    insert_project_subagent(&registry, &workspace_b, "SharedReviewer", "primary");

    assert_eq!(
        registry
            .get_custom_subagent_config("SharedReviewer", Some(&workspace_a))
            .expect("workspace A config")
            .model,
        "fast"
    );
    assert_eq!(
        registry
            .get_custom_subagent_config("SharedReviewer", Some(&workspace_b))
            .expect("workspace B config")
            .model,
        "primary"
    );
    assert!(
        registry
            .get_custom_subagent_config("SharedReviewer", None)
            .is_none(),
        "unscoped lookup must not pick an arbitrary project subagent"
    );
    assert!(registry.has_project_custom_subagent("SharedReviewer"));
}

#[tokio::test]
async fn prompt_stability_task_visible_subagents_are_sorted_deterministically() {
    let registry = AgentRegistry::new();
    let workspace = PathBuf::from("D:/workspace/project-c");

    registry.register_agent(
        Arc::new(TestAgent {
            id: "zBuiltin".to_string(),
        }),
        AgentCategory::SubAgent,
        Some(SubAgentSource::Builtin),
        None,
    );
    registry.register_agent(
        Arc::new(TestAgent {
            id: "ABuiltin".to_string(),
        }),
        AgentCategory::SubAgent,
        Some(SubAgentSource::Builtin),
        None,
    );

    let mut project_entries = HashMap::new();
    project_entries.insert(
        "zProject".to_string(),
        test_project_entry("zProject", "fast"),
    );
    project_entries.insert(
        "AProject".to_string(),
        test_project_entry("AProject", "fast"),
    );
    registry
        .write_project_subagents()
        .insert(workspace.clone(), project_entries);

    registry.register_agent(
        Arc::new(TestAgent {
            id: "zUser".to_string(),
        }),
        AgentCategory::SubAgent,
        Some(SubAgentSource::User),
        Some(CustomSubagentConfig {
            model: "fast".to_string(),
        }),
    );
    registry.register_agent(
        Arc::new(TestAgent {
            id: "AUser".to_string(),
        }),
        AgentCategory::SubAgent,
        Some(SubAgentSource::User),
        Some(CustomSubagentConfig {
            model: "fast".to_string(),
        }),
    );

    let visible = registry
        .get_subagents_for_query(&SubagentQueryContext {
            parent_agent_type: None,
            workspace_root: Some(&workspace),
            list_scope: SubagentListScope::RegistryManagement,
            include_disabled: false,
        })
        .await;

    let ids: Vec<&str> = visible.iter().map(|agent| agent.id.as_str()).collect();
    let expected = vec![
        "ABuiltin",
        "Explore",
        "FileFinder",
        "GeneralPurpose",
        "zBuiltin",
        "AProject",
        "zProject",
        "AUser",
        "zUser",
    ];

    assert_eq!(ids, expected);
}

#[tokio::test]
async fn parent_subagent_overrides_follow_source_scopes() {
    let registry = AgentRegistry::new();
    let workspace = PathBuf::from("__test_workspace__/project-d");

    registry.register_agent(
        Arc::new(CustomSubagent::new(
            "UserScout".to_string(),
            "User scout".to_string(),
            vec!["Read".to_string()],
            "prompt".to_string(),
            true,
            "user-scout.md".to_string(),
            CustomSubagentKind::User,
        )),
        AgentCategory::SubAgent,
        Some(SubAgentSource::User),
        Some(CustomSubagentConfig {
            model: "fast".to_string(),
        }),
    );

    let mut project_entries = HashMap::new();
    project_entries.insert(
        "ProjectScout".to_string(),
        AgentEntry {
            category: AgentCategory::SubAgent,
            subagent_source: Some(SubAgentSource::Project),
            agent: Arc::new(CustomSubagent::new(
                "ProjectScout".to_string(),
                "Project scout".to_string(),
                vec!["Read".to_string()],
                "prompt".to_string(),
                true,
                "project-scout.md".to_string(),
                CustomSubagentKind::Project,
            )),
            visibility_policy: SubagentVisibilityPolicy::public(),
            custom_config: Some(CustomSubagentConfig {
                model: "fast".to_string(),
            }),
        },
    );
    registry
        .write_project_subagents()
        .insert(workspace.clone(), project_entries);

    let builtin_query = SubagentQueryContext {
        parent_agent_type: Some("agentic"),
        workspace_root: Some(&workspace),
        list_scope: SubagentListScope::RegistryManagement,
        include_disabled: true,
    };

    let project_override_key = "project::void::ProjectScout".to_string();
    let user_override_key = "user::void::UserScout".to_string();
    let builtin_override_key = "builtin::builtin::Explore".to_string();

    let mut project_parent_map = HashMap::new();
    project_parent_map.insert(
        project_override_key.clone(),
        AgentSubagentOverrideState::Disabled,
    );
    project_parent_map.insert(
        user_override_key.clone(),
        AgentSubagentOverrideState::Disabled,
    );
    project_parent_map.insert(
        builtin_override_key.clone(),
        AgentSubagentOverrideState::Disabled,
    );
    let mut project_overrides = HashMap::new();
    project_overrides.insert(
        resolve_mode_config_profile_id("agentic").into_owned(),
        project_parent_map,
    );

    let mut user_parent_map = HashMap::new();
    user_parent_map.insert(
        project_override_key.clone(),
        AgentSubagentOverrideState::Enabled,
    );
    user_parent_map.insert(user_override_key, AgentSubagentOverrideState::Disabled);
    user_parent_map.insert(builtin_override_key, AgentSubagentOverrideState::Disabled);
    let mut user_overrides = HashMap::new();
    user_overrides.insert(
        resolve_mode_config_profile_id("agentic").into_owned(),
        user_parent_map,
    );

    let visible = {
        use crate::agentic::agents::registry::availability::resolve_availability;

        let explore = registry
            .find_agent_entry("Explore", Some(&workspace))
            .expect("builtin entry");
        let user = registry
            .find_agent_entry("UserScout", Some(&workspace))
            .expect("user entry");
        let project = registry
            .find_agent_entry("ProjectScout", Some(&workspace))
            .expect("project entry");

        (
            resolve_availability(
                &explore,
                builtin_query.parent_agent_type,
                Some(&project_overrides),
                &user_overrides,
            ),
            resolve_availability(
                &user,
                builtin_query.parent_agent_type,
                Some(&project_overrides),
                &user_overrides,
            ),
            resolve_availability(
                &project,
                builtin_query.parent_agent_type,
                Some(&project_overrides),
                &user_overrides,
            ),
        )
    };

    assert_eq!(
        visible.0.override_state,
        Some(AgentSubagentOverrideState::Disabled)
    );
    assert_eq!(
        visible.1.override_state,
        Some(AgentSubagentOverrideState::Disabled)
    );
    assert_eq!(
        visible.2.override_state,
        Some(AgentSubagentOverrideState::Disabled)
    );
}

#[tokio::test]
async fn custom_agent_info_uses_localized_name_without_changing_runtime_key() {
    let registry = AgentRegistry::new();
    let custom = CustomSubagent::new(
        "custom-stable-id".to_string(),
        "Localized custom agent".to_string(),
        vec!["Read".to_string()],
        "Prompt".to_string(),
        true,
        "custom-stable-id.md".to_string(),
        CustomSubagentKind::User,
    )
    .with_display_name(Some("产品分析师".to_string()))
    .with_allowed_parent_agent_ids(["Media", "agentic"]);
    let visibility = custom.visibility_policy();

    registry.register_agent_with_visibility(
        Arc::new(custom),
        AgentCategory::SubAgent,
        Some(SubAgentSource::User),
        visibility,
        Some(CustomSubagentConfig {
            model: "fast".to_string(),
        }),
    );

    let management = registry
        .get_subagents_for_query(&SubagentQueryContext {
            parent_agent_type: Some("agentic"),
            workspace_root: None,
            list_scope: SubagentListScope::RegistryManagement,
            include_disabled: true,
        })
        .await;
    let info = management
        .iter()
        .find(|agent| agent.id == "custom-stable-id")
        .expect("custom agent should be projected");

    assert_eq!(info.id, "custom-stable-id");
    assert_eq!(info.key, "user::void::custom-stable-id");
    assert_eq!(info.name, "产品分析师");
    assert_eq!(
        info.visibility
            .as_ref()
            .expect("visibility should be projected")
            .allowed_parent_agent_ids,
        vec!["Media".to_string(), "agentic".to_string()]
    );

    assert_eq!(
        info.visibility
            .as_ref()
            .expect("visibility should be projected")
            .exposure,
        BuiltinSubagentExposure::Restricted
    );
}

#[tokio::test]
async fn task_visibility_and_persona_resolution_enforce_custom_parent_policy() {
    let registry = AgentRegistry::new();
    let custom = CustomSubagent::new(
        "media-policy-agent".to_string(),
        "Media policy agent".to_string(),
        vec!["Read".to_string()],
        "Media-only prompt".to_string(),
        true,
        "media-policy-agent.md".to_string(),
        CustomSubagentKind::User,
    )
    .with_allowed_parent_agent_ids(["Media"]);
    let visibility = custom.visibility_policy();
    registry.register_agent_with_visibility(
        Arc::new(custom),
        AgentCategory::SubAgent,
        Some(SubAgentSource::User),
        visibility,
        Some(CustomSubagentConfig {
            model: "fast".to_string(),
        }),
    );

    let allowed = registry
        .get_subagents_for_query(&SubagentQueryContext {
            parent_agent_type: Some("Media"),
            workspace_root: None,
            list_scope: SubagentListScope::TaskVisible,
            include_disabled: true,
        })
        .await;
    assert!(allowed.iter().any(|agent| agent.id == "media-policy-agent"));

    let blocked = registry
        .get_subagents_for_query(&SubagentQueryContext {
            parent_agent_type: Some("agentic"),
            workspace_root: None,
            list_scope: SubagentListScope::TaskVisible,
            include_disabled: true,
        })
        .await;
    assert!(!blocked.iter().any(|agent| agent.id == "media-policy-agent"));

    let persona = registry
        .resolve_persona_definition("user::void::media-policy-agent", None, "Media")
        .await
        .expect("allowed parent should resolve the persona");
    assert_eq!(persona.prompt_overlay, "Media-only prompt");

    let error = match registry
        .resolve_persona_definition("user::void::media-policy-agent", None, "agentic")
        .await
    {
        Ok(_) => panic!("wrong parent must not resolve the persona"),
        Err(error) => error,
    };
    assert!(error
        .to_string()
        .contains("not available for execution policy agentic"));
}

#[test]
fn project_registration_keeps_same_runtime_id_isolated_per_workspace() {
    let registry = AgentRegistry::new();
    let workspace_a = PathBuf::from("D:/workspace/scoped-a");
    let workspace_b = PathBuf::from("D:/workspace/scoped-b");

    for (workspace, prompt) in [
        (&workspace_a, "workspace A prompt"),
        (&workspace_b, "workspace B prompt"),
    ] {
        let custom = custom_subagent(
            "shared-project-agent",
            prompt,
            &workspace.join(".void/agents/shared-project-agent.md"),
            CustomSubagentKind::Project,
        );
        let visibility = custom.visibility_policy();
        registry
            .register_project_subagent_with_visibility(
                workspace,
                Arc::new(custom),
                visibility,
                Some(CustomSubagentConfig {
                    model: "fast".to_string(),
                }),
            )
            .expect("same ID should be valid in different workspaces");
    }

    assert_eq!(
        custom_prompt(
            &registry,
            "shared-project-agent",
            Some(workspace_a.as_path())
        )
        .as_deref(),
        Some("workspace A prompt")
    );
    assert_eq!(
        custom_prompt(
            &registry,
            "shared-project-agent",
            Some(workspace_b.as_path())
        )
        .as_deref(),
        Some("workspace B prompt")
    );
    assert!(custom_prompt(&registry, "shared-project-agent", None).is_none());

    let duplicate = custom_subagent(
        "shared-project-agent",
        "duplicate",
        &workspace_a.join(".void/agents/duplicate.md"),
        CustomSubagentKind::Project,
    );
    let duplicate_visibility = duplicate.visibility_policy();
    assert!(registry
        .register_project_subagent_with_visibility(
            &workspace_a,
            Arc::new(duplicate),
            duplicate_visibility,
            Some(CustomSubagentConfig {
                model: "fast".to_string(),
            }),
        )
        .is_err());
}

#[tokio::test]
async fn reloading_one_workspace_preserves_other_project_maps_and_cleans_global_pollution() {
    let registry = AgentRegistry::new();
    let workspace_a = unique_test_workspace("reload-a");
    let workspace_b = unique_test_workspace("reload-b");
    let agents_dir_a = workspace_a.join(".void").join("agents");
    std::fs::create_dir_all(&agents_dir_a).expect("test Agent directory should be created");

    let disk_path = agents_dir_a.join("reload-shared-agent.md");
    custom_subagent(
        "reload-shared-agent",
        "workspace A reloaded prompt",
        &disk_path,
        CustomSubagentKind::Project,
    )
    .save_to_file(None)
    .expect("project Agent fixture should be written");

    let workspace_b_agent = custom_subagent(
        "reload-shared-agent",
        "workspace B prompt",
        &workspace_b.join(".void/agents/reload-shared-agent.md"),
        CustomSubagentKind::Project,
    );
    let workspace_b_visibility = workspace_b_agent.visibility_policy();
    registry
        .register_project_subagent_with_visibility(
            &workspace_b,
            Arc::new(workspace_b_agent),
            workspace_b_visibility,
            Some(CustomSubagentConfig {
                model: "fast".to_string(),
            }),
        )
        .expect("workspace B Agent should register");

    let historical_global = custom_subagent(
        "historical-project-global",
        "must be removed",
        &workspace_a.join(".void/agents/historical-project-global.md"),
        CustomSubagentKind::Project,
    );
    let historical_visibility = historical_global.visibility_policy();
    registry.register_agent_with_visibility(
        Arc::new(historical_global),
        AgentCategory::SubAgent,
        Some(SubAgentSource::Project),
        historical_visibility,
        Some(CustomSubagentConfig {
            model: "fast".to_string(),
        }),
    );

    registry.load_custom_subagents(&workspace_a).await;

    assert_eq!(
        custom_prompt(
            &registry,
            "reload-shared-agent",
            Some(workspace_a.as_path())
        )
        .as_deref(),
        Some("workspace A reloaded prompt")
    );
    assert_eq!(
        custom_prompt(
            &registry,
            "reload-shared-agent",
            Some(workspace_b.as_path())
        )
        .as_deref(),
        Some("workspace B prompt")
    );
    assert!(custom_prompt(&registry, "historical-project-global", None).is_none());

    std::fs::remove_dir_all(&workspace_a).expect("workspace A fixture should be removed");
}

#[test]
fn user_registration_remains_global_across_workspaces() {
    let registry = AgentRegistry::new();
    let workspace_a = PathBuf::from("D:/workspace/user-global-a");
    let workspace_b = PathBuf::from("D:/workspace/user-global-b");
    let custom = custom_subagent(
        "global-user-agent",
        "global user prompt",
        Path::new("global-user-agent.md"),
        CustomSubagentKind::User,
    );
    let visibility = custom.visibility_policy();
    registry.register_agent_with_visibility(
        Arc::new(custom),
        AgentCategory::SubAgent,
        Some(SubAgentSource::User),
        visibility,
        Some(CustomSubagentConfig {
            model: "fast".to_string(),
        }),
    );

    for workspace in [&workspace_a, &workspace_b] {
        assert_eq!(
            custom_prompt(&registry, "global-user-agent", Some(workspace.as_path())).as_deref(),
            Some("global user prompt")
        );
    }
}

#[tokio::test]
async fn keyed_management_keeps_same_id_sources_and_workspaces_independent() {
    let registry = AgentRegistry::new();
    let workspace_a = unique_test_workspace("keyed-management-a");
    let workspace_b = unique_test_workspace("keyed-management-b");
    let project_dir_a = workspace_a.join(".void").join("agents");
    std::fs::create_dir_all(&project_dir_a).expect("project fixture directory should exist");

    let mut project_a = custom_subagent(
        "shared-keyed-agent",
        "project A prompt",
        &project_dir_a.join("shared-keyed-agent.md"),
        CustomSubagentKind::Project,
    );
    project_a.model = "primary".to_string();
    project_a
        .save_to_file(None)
        .expect("project fixture should be written");
    registry.load_custom_subagents(&workspace_a).await;

    let project_b = custom_subagent(
        "shared-keyed-agent",
        "project B prompt",
        &workspace_b.join(".void/agents/shared-keyed-agent.md"),
        CustomSubagentKind::Project,
    );
    let project_b_visibility = project_b.visibility_policy();
    registry
        .register_project_subagent_with_visibility(
            &workspace_b,
            Arc::new(project_b),
            project_b_visibility,
            Some(CustomSubagentConfig {
                model: "primary".to_string(),
            }),
        )
        .expect("workspace B project fixture should register");

    let user_path = workspace_a.join("shared-keyed-user.md");
    let user = custom_subagent(
        "shared-keyed-agent",
        "user prompt",
        &user_path,
        CustomSubagentKind::User,
    );
    user.save_to_file(None)
        .expect("user fixture should be written");
    let user_visibility = user.visibility_policy();
    registry.register_agent_with_visibility(
        Arc::new(user),
        AgentCategory::SubAgent,
        Some(SubAgentSource::User),
        user_visibility,
        Some(CustomSubagentConfig {
            model: "fast".to_string(),
        }),
    );

    let project_detail = registry
        .get_custom_subagent_detail_keyed(
            Some("project::void::shared-keyed-agent"),
            "shared-keyed-agent",
            Some(&workspace_a),
        )
        .await
        .expect("project detail should resolve within workspace A");
    assert_eq!(
        project_detail.subagent_key,
        "project::void::shared-keyed-agent"
    );
    assert_eq!(project_detail.prompt, "project A prompt");

    // Project detail reloads the disk registry, so restore the isolated user
    // fixture before exercising user-keyed mutations.
    let user = custom_subagent(
        "shared-keyed-agent",
        "user prompt",
        &user_path,
        CustomSubagentKind::User,
    );
    let user_visibility = user.visibility_policy();
    registry.register_agent_with_visibility(
        Arc::new(user),
        AgentCategory::SubAgent,
        Some(SubAgentSource::User),
        user_visibility,
        Some(CustomSubagentConfig {
            model: "fast".to_string(),
        }),
    );

    let user_detail = registry
        .get_custom_subagent_detail_keyed(
            Some("user::void::shared-keyed-agent"),
            "shared-keyed-agent",
            None,
        )
        .await
        .expect("user detail should resolve globally");
    assert_eq!(user_detail.subagent_key, "user::void::shared-keyed-agent");
    assert_eq!(user_detail.prompt, "user prompt");

    registry
        .update_and_save_custom_subagent_config_keyed(
            Some("user::void::shared-keyed-agent"),
            "shared-keyed-agent",
            Some("primary".to_string()),
            None,
        )
        .expect("user model should update independently");
    registry
        .update_and_save_custom_subagent_config_keyed(
            Some("project::void::shared-keyed-agent"),
            "shared-keyed-agent",
            Some("fast".to_string()),
            Some(&workspace_a),
        )
        .expect("workspace A project model should update independently");

    assert_eq!(
        registry
            .get_custom_subagent_config_keyed(
                Some("user::void::shared-keyed-agent"),
                "shared-keyed-agent",
                Some(&workspace_a),
            )
            .expect("user identity should resolve")
            .expect("user custom config")
            .model,
        "primary"
    );
    assert_eq!(
        registry
            .get_custom_subagent_config_keyed(
                Some("project::void::shared-keyed-agent"),
                "shared-keyed-agent",
                Some(&workspace_a),
            )
            .expect("workspace A identity should resolve")
            .expect("workspace A custom config")
            .model,
        "fast"
    );
    assert_eq!(
        registry
            .get_custom_subagent_config_keyed(
                Some("project::void::shared-keyed-agent"),
                "shared-keyed-agent",
                Some(&workspace_b),
            )
            .expect("workspace B identity should resolve")
            .expect("workspace B custom config")
            .model,
        "primary"
    );

    let (_, removed_source) = registry
        .remove_subagent_keyed(
            Some("project::void::shared-keyed-agent"),
            "shared-keyed-agent",
            Some(&workspace_a),
        )
        .expect("only workspace A project entry should be removed");
    assert_eq!(removed_source, SubAgentSource::Project);
    assert!(registry
        .resolve_subagent_management_entry(
            Some("project::void::shared-keyed-agent"),
            "shared-keyed-agent",
            Some(&workspace_a),
        )
        .is_err());
    assert!(registry
        .resolve_subagent_management_entry(
            Some("project::void::shared-keyed-agent"),
            "shared-keyed-agent",
            Some(&workspace_b),
        )
        .is_ok());
    assert!(registry
        .resolve_subagent_management_entry(
            Some("user::void::shared-keyed-agent"),
            "shared-keyed-agent",
            None,
        )
        .is_ok());

    std::fs::remove_dir_all(&workspace_a).expect("workspace A fixture should be removed");
}

#[test]
fn keyed_management_rejects_noncanonical_mismatched_and_unscoped_project_keys() {
    let registry = AgentRegistry::new();
    let workspace = PathBuf::from("D:/workspace/key-validation");
    let project = custom_subagent(
        "validated-agent",
        "prompt",
        Path::new("validated-agent.md"),
        CustomSubagentKind::Project,
    );
    let visibility = project.visibility_policy();
    registry
        .register_project_subagent_with_visibility(
            &workspace,
            Arc::new(project),
            visibility,
            Some(CustomSubagentConfig {
                model: "fast".to_string(),
            }),
        )
        .expect("project fixture should register");

    assert!(registry
        .resolve_subagent_management_entry(
            Some("project::void::other-agent"),
            "validated-agent",
            Some(&workspace),
        )
        .is_err());
    assert!(registry
        .resolve_subagent_management_entry(
            Some("project::custom::validated-agent"),
            "validated-agent",
            Some(&workspace),
        )
        .is_err());
    assert!(registry
        .resolve_subagent_management_entry(
            Some("project::void::validated-agent"),
            "validated-agent",
            None,
        )
        .is_err());
    assert!(registry
        .resolve_subagent_management_entry(
            Some("user::void::validated-agent"),
            "validated-agent",
            Some(&workspace),
        )
        .is_err());
}
