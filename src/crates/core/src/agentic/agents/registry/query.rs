use super::availability::resolve_availability;
use super::support::{
    get_mode_configs, get_subagent_overrides, load_project_subagent_overrides_local,
    merge_dynamic_mcp_tools,
};
use super::{AgentRegistry, ResolvedPersonaDefinition};
use crate::agentic::agent_revisions::{
    AgentRevisionCatalogStore, AgentRevisionContent, AgentRevisionErrorCode, AgentRevisionScope,
    AgentRevisionService,
};
use crate::agentic::agents::definitions::custom::CustomSubagent;
use crate::agentic::agents::registry::types::{is_review_agent_entry, AgentEntry};
use crate::agentic::agents::{
    resolve_mode_config_profile_id, Agent, AgentCategory, AgentInfo, AgentToolPolicy,
    SubAgentSource, SubagentListScope, SubagentQueryContext,
};
use crate::agentic::persistence::FileAgentRevisionCatalogStore;
use crate::agentic::tools::get_all_registered_tool_names;
use crate::agentic::{WorkspaceBackend, WorkspaceBinding};
use crate::infrastructure::get_path_manager_arc;
use crate::service::config::mode_config_canonicalizer::resolve_effective_tools;
use crate::service::config::types::{AgentSubagentOverrideConfig, AgentSubagentOverrideState};
use crate::util::errors::{VoidError, VoidResult};
use std::collections::HashSet;
use std::path::Path;

fn revision_allows_parent(content: &AgentRevisionContent, parent_agent_type: &str) -> bool {
    if content.allowed_parent_agent_ids.is_empty() {
        return true;
    }
    let canonical_parent = resolve_mode_config_profile_id(parent_agent_type);
    content.allowed_parent_agent_ids.iter().any(|allowed| {
        allowed == parent_agent_type || allowed.as_str() == canonical_parent.as_ref()
    })
}

fn revision_is_readonly(content: &AgentRevisionContent) -> bool {
    content.readonly || content.review
}

fn resolve_legacy_persona_entry(
    entry: &AgentEntry,
    persona_key: &str,
    parent_agent_type: &str,
    project_overrides: Option<&AgentSubagentOverrideConfig>,
    user_overrides: &AgentSubagentOverrideConfig,
) -> VoidResult<ResolvedPersonaDefinition> {
    let availability = resolve_availability(
        entry,
        Some(parent_agent_type),
        project_overrides,
        user_overrides,
    );
    if !availability.effective_enabled {
        return Err(VoidError::validation(format!(
            "Persona is not available for execution policy {parent_agent_type}: {persona_key}"
        )));
    }

    let custom = entry
        .agent
        .as_any()
        .downcast_ref::<CustomSubagent>()
        .ok_or_else(|| {
            VoidError::validation(format!(
                "Persona is not backed by a custom subagent: {persona_key}"
            ))
        })?;
    let revision = format!(
        "{}||{}",
        entry.agent.system_prompt_cache_identity(None).scope_key,
        entry.agent.user_context_cache_identity().scope_key
    );

    Ok(ResolvedPersonaDefinition {
        key: persona_key.to_string(),
        revision,
        prompt_overlay: custom.runtime_prompt_overlay(),
        tools: entry.agent.default_tools(),
        readonly: entry.agent.is_readonly(),
    })
}

fn revision_persona_identity(
    persona_key: &str,
    workspace: Option<&WorkspaceBinding>,
) -> VoidResult<(SubAgentSource, String, AgentRevisionScope)> {
    let (source, id) = match persona_key.split("::").collect::<Vec<_>>().as_slice() {
        ["user", "void", id] if !id.trim().is_empty() => (SubAgentSource::User, (*id).to_string()),
        ["project", "void", id] if !id.trim().is_empty() => {
            (SubAgentSource::Project, (*id).to_string())
        }
        _ => {
            return Err(VoidError::validation(
                "Persona key must be a source-qualified user/project subagent key".to_string(),
            ))
        }
    };
    let scope = match source {
        SubAgentSource::User => AgentRevisionScope::user(),
        SubAgentSource::Project => {
            let workspace = workspace.ok_or_else(|| {
                VoidError::validation(
                    "Project persona revision requires trusted workspace facts".to_string(),
                )
            })?;
            if !matches!(workspace.backend, WorkspaceBackend::Local) {
                return Err(VoidError::validation(
                    "Remote project Agent revisions are not supported".to_string(),
                ));
            }
            let workspace_id = workspace
                .workspace_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| {
                    VoidError::validation(
                        "Project persona revision requires a workspace ID".to_string(),
                    )
                })?;
            AgentRevisionScope::local_project(workspace_id, workspace.root_path.clone())
        }
        SubAgentSource::Builtin => unreachable!("custom persona parser rejects builtin source"),
    };
    Ok((source, id, scope))
}

impl AgentRegistry {
    /// Resolve a custom persona by its complete source-qualified registry key.
    ///
    /// This intentionally does not accept a bare subagent id: same-id user and
    /// project definitions must never alias each other.
    pub async fn resolve_persona_definition(
        &self,
        persona_key: &str,
        workspace_root: Option<&Path>,
        parent_agent_type: &str,
    ) -> VoidResult<ResolvedPersonaDefinition> {
        let parts: Vec<&str> = persona_key.split("::").collect();
        let (source, id) = match parts.as_slice() {
            ["user", "void", id] if !id.trim().is_empty() => (SubAgentSource::User, *id),
            ["project", "void", id] if !id.trim().is_empty() => (SubAgentSource::Project, *id),
            _ => {
                return Err(VoidError::validation(
                    "Persona key must be a source-qualified user/project subagent key".to_string(),
                ))
            }
        };

        if source == SubAgentSource::Project && workspace_root.is_none() {
            return Err(VoidError::validation(
                "Project persona requires a workspace".to_string(),
            ));
        }
        if let Some(root) = workspace_root {
            self.load_custom_subagents(root).await;
        }

        let entry = match source {
            SubAgentSource::User => self.read_agents().get(id).cloned(),
            SubAgentSource::Project => workspace_root.and_then(|root| {
                self.read_project_subagents()
                    .get(root)
                    .and_then(|entries| entries.get(id))
                    .cloned()
            }),
            SubAgentSource::Builtin => None,
        }
        .ok_or_else(|| {
            VoidError::validation(format!(
                "Unknown persona for this source/workspace: {persona_key}"
            ))
        })?;

        if entry.category != AgentCategory::SubAgent
            || entry.subagent_source != Some(source)
            || entry.custom_config.is_none()
        {
            return Err(VoidError::validation(format!(
                "Persona is not a user/project custom subagent: {persona_key}"
            )));
        }

        let user_overrides = get_subagent_overrides().await;
        let project_overrides = match (source, workspace_root) {
            (SubAgentSource::Project, Some(root)) => {
                load_project_subagent_overrides_local(root).await.ok()
            }
            _ => None,
        };
        resolve_legacy_persona_entry(
            &entry,
            persona_key,
            parent_agent_type,
            project_overrides.as_ref(),
            &user_overrides,
        )
    }

    /// Resolve one immutable custom-Agent revision for a running session.
    ///
    /// Catalog-only Agents execute without a shadow legacy file. Imported
    /// definitions still require their live legacy entry so deletion remains
    /// an immediate revocation. Prompt, tools, and visibility always come from
    /// the exact published revision.
    pub async fn resolve_persona_definition_at_revision(
        &self,
        persona_key: &str,
        expected_revision: &str,
        workspace: Option<&WorkspaceBinding>,
        parent_agent_type: &str,
    ) -> VoidResult<ResolvedPersonaDefinition> {
        if expected_revision.trim().is_empty() {
            return Err(VoidError::validation(
                "Persona revision is required for frozen execution".to_string(),
            ));
        }
        let (source, _, scope) = revision_persona_identity(persona_key, workspace)?;
        let workspace_root = workspace.map(WorkspaceBinding::root_path);
        if let Some(root) = workspace_root {
            self.load_custom_subagents(root).await;
        }
        let user_overrides = get_subagent_overrides().await;
        let project_overrides = match (source, workspace_root) {
            (SubAgentSource::Project, Some(root)) => {
                load_project_subagent_overrides_local(root).await.ok()
            }
            _ => None,
        };
        let store = FileAgentRevisionCatalogStore::for_scope(get_path_manager_arc(), scope)
            .map_err(|error| VoidError::validation(error.to_string()))?;
        let service = AgentRevisionService::new(store);
        self.resolve_persona_definition_at_revision_with_service(
            persona_key,
            expected_revision,
            workspace,
            parent_agent_type,
            &service,
            &user_overrides,
            project_overrides.as_ref(),
        )
        .await
    }

    async fn resolve_persona_definition_at_revision_with_service<S: AgentRevisionCatalogStore>(
        &self,
        persona_key: &str,
        expected_revision: &str,
        workspace: Option<&WorkspaceBinding>,
        parent_agent_type: &str,
        service: &AgentRevisionService<S>,
        user_overrides: &AgentSubagentOverrideConfig,
        project_overrides: Option<&AgentSubagentOverrideConfig>,
    ) -> VoidResult<ResolvedPersonaDefinition> {
        if expected_revision.trim().is_empty() {
            return Err(VoidError::validation(
                "Persona revision is required for frozen execution".to_string(),
            ));
        }
        let (source, id, expected_scope) = revision_persona_identity(persona_key, workspace)?;
        if service.scope() != &expected_scope {
            return Err(VoidError::validation(
                "Agent revision catalog does not match the trusted persona workspace".to_string(),
            ));
        }
        let workspace_root = workspace.map(WorkspaceBinding::root_path);
        let entry = match source {
            SubAgentSource::User => self.read_agents().get(&id).cloned(),
            SubAgentSource::Project => workspace_root.and_then(|root| {
                self.read_project_subagents()
                    .get(root)
                    .and_then(|entries| entries.get(&id))
                    .cloned()
            }),
            SubAgentSource::Builtin => None,
        };
        if entry.as_ref().is_some_and(|entry| {
            entry.category != AgentCategory::SubAgent
                || entry.subagent_source != Some(source)
                || entry.custom_config.is_none()
        }) {
            return Err(VoidError::validation(format!(
                "Persona is not a user/project custom subagent: {persona_key}"
            )));
        }
        let explicit_override = match source {
            SubAgentSource::User => super::availability::subagent_override_for_parent(
                user_overrides,
                Some(parent_agent_type),
                persona_key,
            ),
            SubAgentSource::Project => project_overrides.and_then(|overrides| {
                super::availability::subagent_override_for_parent(
                    overrides,
                    Some(parent_agent_type),
                    persona_key,
                )
            }),
            SubAgentSource::Builtin => None,
        };
        if matches!(
            explicit_override,
            Some(AgentSubagentOverrideState::Disabled)
        ) {
            return Err(VoidError::validation(format!(
                "Persona is disabled for execution policy {parent_agent_type}: {persona_key}"
            )));
        }
        let legacy_backed = service
            .resolve_persona_legacy_backing(persona_key)
            .map_err(|error| {
                VoidError::validation(format!(
                    "Cannot inspect frozen persona definition ({:?}): {}",
                    error.code, error.message
                ))
            })?;
        let revision = match service.resolve_published_revision(persona_key, expected_revision) {
            Ok(revision) => revision,
            Err(error) if error.code == AgentRevisionErrorCode::NotFound => None,
            Err(error) => {
                return Err(VoidError::validation(format!(
                    "Cannot resolve frozen persona revision ({:?}): {}",
                    error.code, error.message
                )))
            }
        };
        let Some(revision) = revision else {
            let entry = entry.as_ref().ok_or_else(|| {
                VoidError::validation(format!(
                    "Unknown persona for this source/workspace: {persona_key}"
                ))
            })?;
            let current = resolve_legacy_persona_entry(
                entry,
                persona_key,
                parent_agent_type,
                project_overrides,
                user_overrides,
            )?;
            if current.revision == expected_revision {
                return Ok(current);
            }
            return Err(VoidError::validation(format!(
                "Unknown persona revision for {persona_key}"
            )));
        };
        if legacy_backed == Some(true) && entry.is_none() {
            return Err(VoidError::validation(format!(
                "Imported persona was revoked from its legacy source: {persona_key}"
            )));
        }

        if !revision_allows_parent(&revision.content, parent_agent_type) {
            return Err(VoidError::validation(format!(
                "Persona revision is not available for execution policy {parent_agent_type}: {persona_key}"
            )));
        }

        let kind = match source {
            SubAgentSource::User => {
                crate::agentic::agents::definitions::custom::CustomSubagentKind::User
            }
            SubAgentSource::Project => {
                crate::agentic::agents::definitions::custom::CustomSubagentKind::Project
            }
            SubAgentSource::Builtin => unreachable!(),
        };
        let readonly = revision_is_readonly(&revision.content);
        let mut historical = CustomSubagent::new(
            id,
            revision.content.description,
            revision.content.tools,
            revision.content.prompt,
            readonly,
            format!("revision://{}", revision.revision_id),
            kind,
        )
        .with_display_name(Some(revision.content.display_name))
        .with_allowed_parent_agent_ids(revision.content.allowed_parent_agent_ids);
        historical.review = revision.content.review;
        historical.model = revision.content.model;

        Ok(ResolvedPersonaDefinition {
            key: persona_key.to_string(),
            revision: expected_revision.to_string(),
            prompt_overlay: historical.runtime_prompt_overlay(),
            tools: historical.default_tools(),
            readonly: historical.is_readonly(),
        })
    }

    fn subagent_source_rank(source: Option<crate::agentic::agents::SubAgentSource>) -> u8 {
        match source {
            Some(crate::agentic::agents::SubAgentSource::Builtin) => 0,
            Some(crate::agentic::agents::SubAgentSource::Project) => 1,
            Some(crate::agentic::agents::SubAgentSource::User) => 2,
            None => 3,
        }
    }

    fn sort_subagents_for_presentation(mut result: Vec<AgentInfo>) -> Vec<AgentInfo> {
        result.sort_by(|a, b| {
            Self::subagent_source_rank(a.subagent_source)
                .cmp(&Self::subagent_source_rank(b.subagent_source))
                .then_with(|| a.id.to_lowercase().cmp(&b.id.to_lowercase()))
                .then_with(|| a.id.cmp(&b.id))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                .then_with(|| a.name.cmp(&b.name))
        });
        result
    }

    /// Resolve the current tool policy for an agent.
    ///
    /// This returns both the allowed tool set and any per-agent exposure
    /// overrides that should be applied on top of tool defaults.
    pub async fn get_agent_tool_policy(
        &self,
        agent_type: &str,
        workspace_root: Option<&Path>,
    ) -> AgentToolPolicy {
        let entry = self.find_agent_entry(agent_type, workspace_root);
        let Some(entry) = entry else {
            return AgentToolPolicy {
                allowed_tools: Vec::new(),
                exposure_overrides: Default::default(),
            };
        };
        match entry.category {
            AgentCategory::Mode => {
                let mode_configs = get_mode_configs().await;
                let registered_tool_names = get_all_registered_tool_names().await;
                let valid_tools: HashSet<String> = registered_tool_names.iter().cloned().collect();
                let profile_id = resolve_mode_config_profile_id(agent_type);
                let resolved_tools = resolve_effective_tools(
                    &entry.agent.default_tools(),
                    mode_configs.get(profile_id.as_ref()),
                    &valid_tools,
                );
                let allowed_tools = merge_dynamic_mcp_tools(resolved_tools, &registered_tool_names);
                let allowed_tool_set: HashSet<&str> =
                    allowed_tools.iter().map(String::as_str).collect();
                let mut exposure_overrides = entry.agent.tool_exposure_overrides().clone();
                exposure_overrides
                    .retain(|tool_name, _| allowed_tool_set.contains(tool_name.as_str()));

                AgentToolPolicy {
                    allowed_tools,
                    exposure_overrides,
                }
            }
            AgentCategory::SubAgent | AgentCategory::Hidden => {
                let allowed_tools = entry.agent.default_tools();
                let allowed_tool_set: HashSet<&str> =
                    allowed_tools.iter().map(String::as_str).collect();
                let mut exposure_overrides = entry.agent.tool_exposure_overrides().clone();
                exposure_overrides
                    .retain(|tool_name, _| allowed_tool_set.contains(tool_name.as_str()));

                AgentToolPolicy {
                    allowed_tools,
                    exposure_overrides,
                }
            }
        }
    }

    /// get agent tools from config
    /// if not set, return default tools
    /// mode config canonicalization is handled separately; this only reads resolved configuration
    pub async fn get_agent_tools(
        &self,
        agent_type: &str,
        workspace_root: Option<&Path>,
    ) -> Vec<String> {
        self.get_agent_tool_policy(agent_type, workspace_root)
            .await
            .allowed_tools
    }

    /// get all mode agent information, used for frontend mode selector etc.
    pub async fn get_modes_info(&self) -> Vec<AgentInfo> {
        let map = self.read_agents();
        let mut result: Vec<AgentInfo> = map
            .values()
            .filter(|e| e.category == AgentCategory::Mode)
            .map(AgentInfo::from_agent_entry)
            .collect();
        drop(map);
        result.sort_by(|a, b| {
            let order = |id: &str| -> u8 {
                match id {
                    "agentic" => 0,
                    "Cowork" => 1,
                    "Plan" => 2,
                    "debug" => 3,
                    "Multitask" => 4,
                    "DeepResearch" => 5,
                    "Team" => 6,
                    _ => 99,
                }
            };
            order(&a.id).cmp(&order(&b.id))
        });
        result
    }

    /// check if a subagent is readonly (used for TaskTool.is_concurrency_safe etc.)
    pub fn get_subagent_is_readonly(&self, id: &str) -> Option<bool> {
        if let Some(entry) = self.read_agents().get(id) {
            if entry.category == AgentCategory::SubAgent {
                return Some(entry.agent.is_readonly());
            }
        }

        for entries in self.read_project_subagents().values() {
            if let Some(entry) = entries.get(id) {
                if entry.category == AgentCategory::SubAgent {
                    return Some(entry.agent.is_readonly());
                }
            }
        }

        None
    }

    pub fn get_subagent_is_review(&self, id: &str) -> Option<bool> {
        if let Some(entry) = self.read_agents().get(id) {
            if entry.category == AgentCategory::SubAgent {
                return Some(is_review_agent_entry(entry));
            }
        }

        for entries in self.read_project_subagents().values() {
            if let Some(entry) = entries.get(id) {
                if entry.category == AgentCategory::SubAgent {
                    return Some(is_review_agent_entry(entry));
                }
            }
        }

        None
    }

    fn entry_is_visible_for_query(
        entry: &AgentEntry,
        query: &SubagentQueryContext<'_>,
        project_overrides: Option<&crate::service::config::types::AgentSubagentOverrideConfig>,
        user_overrides: &crate::service::config::types::AgentSubagentOverrideConfig,
    ) -> bool {
        if entry.category != AgentCategory::SubAgent {
            return false;
        }

        let availability = resolve_availability(
            entry,
            query.parent_agent_type,
            project_overrides,
            user_overrides,
        );
        if !query.include_disabled && !availability.effective_enabled {
            return false;
        }

        match query.list_scope {
            SubagentListScope::RegistryManagement => {
                entry.visibility_policy.show_in_global_registry
            }
            SubagentListScope::TaskVisible => entry
                .visibility_policy
                .can_access_from_parent(query.parent_agent_type),
        }
    }

    /// get all subagent information (including source and availability status, used for TaskTool and frontend subagent list etc.)
    pub async fn get_subagents_info(&self, workspace_root: Option<&Path>) -> Vec<AgentInfo> {
        self.get_subagents_for_query(&SubagentQueryContext {
            parent_agent_type: None,
            workspace_root,
            list_scope: SubagentListScope::RegistryManagement,
            include_disabled: true,
        })
        .await
    }

    pub async fn get_subagents_for_query(
        &self,
        query: &SubagentQueryContext<'_>,
    ) -> Vec<AgentInfo> {
        if let Some(workspace_root) = query.workspace_root {
            let is_project_cache_loaded =
                self.read_project_subagents().contains_key(workspace_root);
            if !is_project_cache_loaded {
                self.load_custom_subagents(workspace_root).await;
            }
        }

        let user_overrides = get_subagent_overrides().await;
        let project_overrides = match query.workspace_root {
            Some(workspace_root) => load_project_subagent_overrides_local(workspace_root)
                .await
                .ok(),
            None => None,
        };
        let map = self.read_agents();
        let mut result: Vec<AgentInfo> = map
            .values()
            .filter(|entry| {
                Self::entry_is_visible_for_query(
                    entry,
                    query,
                    project_overrides.as_ref(),
                    &user_overrides,
                )
            })
            .map(|e| {
                let mut agent_info = AgentInfo::from_agent_entry(e);
                let availability = resolve_availability(
                    e,
                    query.parent_agent_type,
                    project_overrides.as_ref(),
                    &user_overrides,
                );
                agent_info.subagent_source = e.subagent_source;
                agent_info.default_enabled = availability.default_enabled;
                agent_info.effective_enabled = availability.effective_enabled;
                agent_info.override_state = availability.override_state;
                agent_info.state_reason = availability.state_reason;
                agent_info
            })
            .collect();
        drop(map);
        if let Some(workspace_root) = query.workspace_root {
            if let Some(project_entries) = self.read_project_subagents().get(workspace_root) {
                result.extend(
                    project_entries
                        .values()
                        .filter(|entry| {
                            Self::entry_is_visible_for_query(
                                entry,
                                query,
                                project_overrides.as_ref(),
                                &user_overrides,
                            )
                        })
                        .map(|entry| {
                            let mut info = AgentInfo::from_agent_entry(entry);
                            let availability = resolve_availability(
                                entry,
                                query.parent_agent_type,
                                project_overrides.as_ref(),
                                &user_overrides,
                            );
                            info.default_enabled = availability.default_enabled;
                            info.effective_enabled = availability.effective_enabled;
                            info.override_state = availability.override_state;
                            info.state_reason = availability.state_reason;
                            info
                        }),
                );
            }
        }
        Self::sort_subagents_for_presentation(result)
    }

    pub async fn can_parent_access_subagent(
        &self,
        subagent_id: &str,
        workspace_root: Option<&Path>,
        parent_agent_type: Option<&str>,
    ) -> bool {
        let query = SubagentQueryContext {
            parent_agent_type,
            workspace_root,
            list_scope: SubagentListScope::TaskVisible,
            include_disabled: false,
        };
        let user_overrides = get_subagent_overrides().await;
        let project_overrides = match query.workspace_root {
            Some(workspace_root) => load_project_subagent_overrides_local(workspace_root)
                .await
                .ok(),
            None => None,
        };

        if let Some(workspace_root) = query.workspace_root {
            let is_project_cache_loaded =
                self.read_project_subagents().contains_key(workspace_root);
            if !is_project_cache_loaded {
                self.load_custom_subagents(workspace_root).await;
            }
        }

        self.find_agent_entry(subagent_id, workspace_root)
            .is_some_and(|entry| {
                Self::entry_is_visible_for_query(
                    &entry,
                    &query,
                    project_overrides.as_ref(),
                    &user_overrides,
                )
            })
    }
}

#[cfg(test)]
mod revision_policy_tests {
    use super::*;
    use crate::agentic::agent_revisions::{
        AgentValidationEvidenceInput, AgentValidationStatus, LegacyAgentImport,
        OpenAgentRevisionDraftRequest, PublishAgentRevisionRequest,
        RecordAgentRevisionValidationRequest, SaveAgentRevisionDraftRequest,
    };
    use crate::agentic::agents::definitions::custom::CustomSubagentKind;
    use crate::agentic::agents::registry::types::CustomSubagentConfig;
    use crate::infrastructure::PathManager;
    use std::fs;
    use std::sync::Arc;
    use uuid::Uuid;

    fn content(allowed_parent_agent_ids: &[&str]) -> AgentRevisionContent {
        AgentRevisionContent {
            persona_key: "user::void::specialist".to_string(),
            display_name: "Specialist".to_string(),
            description: "Specialist".to_string(),
            prompt: "Work".to_string(),
            tools: vec!["Read".to_string()],
            readonly: true,
            review: false,
            model: "fast".to_string(),
            allowed_parent_agent_ids: allowed_parent_agent_ids
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
        }
    }

    #[test]
    fn each_published_revision_owns_its_parent_visibility_policy() {
        let legacy_v3 = content(&["agentic"]);
        let published_v4 = content(&["Media"]);

        assert!(revision_allows_parent(&legacy_v3, "agentic"));
        assert!(!revision_allows_parent(&legacy_v3, "Media"));
        assert!(revision_allows_parent(&published_v4, "Media"));
        assert!(!revision_allows_parent(&published_v4, "agentic"));
    }

    #[test]
    fn review_revision_is_readonly_even_if_persisted_input_is_inconsistent() {
        let mut review = content(&["agentic"]);
        review.review = true;
        review.readonly = false;

        assert!(revision_is_readonly(&review));
    }

    #[tokio::test]
    async fn exact_runtime_keeps_v3_policy_and_uses_v4_policy_instead_of_legacy_entry_policy() {
        let root = std::env::temp_dir().join(format!(
            "void-agent-runtime-revision-policy-{}",
            Uuid::new_v4()
        ));
        fs::create_dir_all(&root).unwrap();
        let legacy_path = root.join("specialist.md");
        fs::write(&legacy_path, "legacy v3").unwrap();
        let store = FileAgentRevisionCatalogStore::for_scope(
            Arc::new(PathManager::with_user_root_for_tests(
                root.join("user-root"),
            )),
            AgentRevisionScope::user(),
        )
        .unwrap();
        let service = AgentRevisionService::new(store);
        let legacy_v3 = content(&["agentic"]);
        let opened = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some(legacy_v3.persona_key.clone()),
                initial_content: None,
                legacy_import: Some(LegacyAgentImport {
                    source_path: legacy_path,
                    raw_document: "legacy v3".to_string(),
                    runtime_revision_alias: "runtime-v3".to_string(),
                    content: legacy_v3.clone(),
                }),
                idempotency_key: "open-runtime-policy".to_string(),
            })
            .unwrap();
        let published_v4 = content(&["Media"]);
        let saved = service
            .save_draft(SaveAgentRevisionDraftRequest {
                definition_id: opened.definition_id.clone(),
                draft_id: opened.draft_id.clone(),
                expected_draft_revision_id: opened.draft_revision_id,
                content: published_v4,
                idempotency_key: "save-runtime-policy-v4".to_string(),
            })
            .unwrap();
        service
            .record_validation(RecordAgentRevisionValidationRequest {
                definition_id: saved.definition_id.clone(),
                draft_id: saved.draft_id.clone(),
                draft_revision_id: saved.draft_revision_id.clone(),
                evidence: AgentValidationEvidenceInput {
                    status: AgentValidationStatus::Passed,
                    debug_session_id: Some("debug-runtime-policy-v4".to_string()),
                    test_case_id: None,
                    capability_snapshot: vec!["Read".to_string()],
                    message: None,
                },
                idempotency_key: "validate-runtime-policy-v4".to_string(),
            })
            .unwrap();
        let published = service
            .publish(PublishAgentRevisionRequest {
                definition_id: saved.definition_id,
                draft_id: saved.draft_id,
                expected_base_revision_id: saved.base_revision_id,
                expected_draft_revision_id: saved.draft_revision_id,
                idempotency_key: "publish-runtime-policy-v4".to_string(),
            })
            .unwrap();

        let registry = AgentRegistry::new();
        let legacy_agent = CustomSubagent::new(
            "specialist".to_string(),
            "Specialist".to_string(),
            vec!["Read".to_string()],
            "Work".to_string(),
            true,
            "legacy://specialist".to_string(),
            CustomSubagentKind::User,
        )
        .with_allowed_parent_agent_ids(["agentic"]);
        let legacy_policy = legacy_agent.visibility_policy();
        registry.register_agent_with_visibility(
            Arc::new(legacy_agent),
            AgentCategory::SubAgent,
            Some(SubAgentSource::User),
            legacy_policy,
            Some(CustomSubagentConfig {
                model: "fast".to_string(),
            }),
        );
        let no_overrides = AgentSubagentOverrideConfig::new();

        let v3_agentic = registry
            .resolve_persona_definition_at_revision_with_service(
                "user::void::specialist",
                "runtime-v3",
                None,
                "agentic",
                &service,
                &no_overrides,
                None,
            )
            .await
            .unwrap();
        assert_eq!(v3_agentic.revision, "runtime-v3");
        assert!(registry
            .resolve_persona_definition_at_revision_with_service(
                "user::void::specialist",
                "runtime-v3",
                None,
                "Media",
                &service,
                &no_overrides,
                None,
            )
            .await
            .is_err());

        let v4_media = registry
            .resolve_persona_definition_at_revision_with_service(
                "user::void::specialist",
                &published.revision.revision_id,
                None,
                "Media",
                &service,
                &no_overrides,
                None,
            )
            .await
            .unwrap();
        assert_eq!(v4_media.revision, published.revision.revision_id);
        assert!(registry
            .resolve_persona_definition_at_revision_with_service(
                "user::void::specialist",
                &v4_media.revision,
                None,
                "agentic",
                &service,
                &no_overrides,
                None,
            )
            .await
            .is_err());

        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn catalog_only_published_agent_runs_without_a_legacy_registry_entry() {
        let root =
            std::env::temp_dir().join(format!("void-catalog-only-runtime-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let service = AgentRevisionService::new(
            FileAgentRevisionCatalogStore::for_scope(
                Arc::new(PathManager::with_user_root_for_tests(
                    root.join("user-root"),
                )),
                AgentRevisionScope::user(),
            )
            .unwrap(),
        );
        let mut initial = content(&["Media"]);
        initial.persona_key = "user::void::catalog-only".to_string();
        let opened = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some(initial.persona_key.clone()),
                initial_content: Some(initial),
                legacy_import: None,
                idempotency_key: "open-catalog-only".to_string(),
            })
            .unwrap();
        service
            .record_validation(RecordAgentRevisionValidationRequest {
                definition_id: opened.definition_id.clone(),
                draft_id: opened.draft_id.clone(),
                draft_revision_id: opened.draft_revision_id.clone(),
                evidence: AgentValidationEvidenceInput {
                    status: AgentValidationStatus::Passed,
                    debug_session_id: Some("debug-catalog-only".to_string()),
                    test_case_id: None,
                    capability_snapshot: vec!["Read".to_string()],
                    message: None,
                },
                idempotency_key: "validate-catalog-only".to_string(),
            })
            .unwrap();
        let published = service
            .publish(PublishAgentRevisionRequest {
                definition_id: opened.definition_id,
                draft_id: opened.draft_id,
                expected_base_revision_id: None,
                expected_draft_revision_id: opened.draft_revision_id,
                idempotency_key: "publish-catalog-only".to_string(),
            })
            .unwrap();

        let registry = AgentRegistry::new();
        let no_overrides = AgentSubagentOverrideConfig::new();
        let resolved = registry
            .resolve_persona_definition_at_revision_with_service(
                "user::void::catalog-only",
                &published.revision.revision_id,
                None,
                "Media",
                &service,
                &no_overrides,
                None,
            )
            .await
            .unwrap();
        assert_eq!(resolved.revision, published.revision.revision_id);

        let mut disabled = AgentSubagentOverrideConfig::new();
        super::super::availability::set_override_state(
            &mut disabled,
            "Media",
            "user::void::catalog-only",
            AgentSubagentOverrideState::Disabled,
        );
        assert!(registry
            .resolve_persona_definition_at_revision_with_service(
                "user::void::catalog-only",
                &resolved.revision,
                None,
                "Media",
                &service,
                &disabled,
                None,
            )
            .await
            .is_err());

        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn imported_catalog_falls_back_only_to_the_exact_current_legacy_revision() {
        let root =
            std::env::temp_dir().join(format!("void-current-legacy-runtime-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let legacy_path = root.join("specialist.md");
        fs::write(&legacy_path, "legacy v3").unwrap();
        let service = AgentRevisionService::new(
            FileAgentRevisionCatalogStore::for_scope(
                Arc::new(PathManager::with_user_root_for_tests(
                    root.join("user-root"),
                )),
                AgentRevisionScope::user(),
            )
            .unwrap(),
        );
        service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some("user::void::specialist".to_string()),
                initial_content: None,
                legacy_import: Some(LegacyAgentImport {
                    source_path: legacy_path,
                    raw_document: "legacy v3".to_string(),
                    runtime_revision_alias: "runtime-v3".to_string(),
                    content: content(&["agentic"]),
                }),
                idempotency_key: "open-current-legacy".to_string(),
            })
            .unwrap();

        let registry = AgentRegistry::new();
        let no_overrides = AgentSubagentOverrideConfig::new();
        assert!(registry
            .resolve_persona_definition_at_revision_with_service(
                "user::void::specialist",
                "runtime-v3",
                None,
                "agentic",
                &service,
                &no_overrides,
                None,
            )
            .await
            .is_err());
        let current_agent = CustomSubagent::new(
            "specialist".to_string(),
            "Specialist current".to_string(),
            vec!["Read".to_string()],
            "Current legacy prompt".to_string(),
            true,
            "legacy://specialist-current".to_string(),
            CustomSubagentKind::User,
        )
        .with_allowed_parent_agent_ids(["agentic"]);
        let current_revision = format!(
            "{}||{}",
            current_agent.system_prompt_cache_identity(None).scope_key,
            current_agent.user_context_cache_identity().scope_key
        );
        let current_policy = current_agent.visibility_policy();
        registry.register_agent_with_visibility(
            Arc::new(current_agent),
            AgentCategory::SubAgent,
            Some(SubAgentSource::User),
            current_policy,
            Some(CustomSubagentConfig {
                model: "fast".to_string(),
            }),
        );

        let current = registry
            .resolve_persona_definition_at_revision_with_service(
                "user::void::specialist",
                &current_revision,
                None,
                "agentic",
                &service,
                &no_overrides,
                None,
            )
            .await
            .unwrap();
        assert_eq!(current.revision, current_revision);
        assert!(registry
            .resolve_persona_definition_at_revision_with_service(
                "user::void::specialist",
                "unknown-legacy-revision",
                None,
                "agentic",
                &service,
                &no_overrides,
                None,
            )
            .await
            .is_err());

        fs::remove_dir_all(root).unwrap();
    }
}
