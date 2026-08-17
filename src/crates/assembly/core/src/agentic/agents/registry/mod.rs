mod availability;
mod builtin;
pub mod catalog;
mod custom;
mod custom_loader;
mod query;
mod resolution;
mod support;
#[cfg(test)]
mod tests;
pub mod types;
pub mod visibility;

use self::types::AgentEntry;
use self::types::{AgentCategory, SubAgentSource};
use super::Agent;
use crate::util::errors::{VoidError, VoidResult};
use log::{debug, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::sync::{Arc, OnceLock};

/// Full sub-agent definition for editing (user/project custom agents only)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomSubagentDetail {
    pub subagent_key: String,
    pub subagent_id: String,
    /// Immutable runtime identity retained for legacy editors and diagnostics.
    pub name: String,
    pub display_name: String,
    pub allowed_parent_agent_ids: Vec<String>,
    pub description: String,
    pub prompt: String,
    pub tools: Vec<String>,
    pub readonly: bool,
    pub review: bool,
    pub enabled: bool,
    pub model: String,
    pub path: String,
    /// `"user"` or `"project"`
    pub level: String,
}

#[derive(Clone)]
pub(crate) struct ResolvedSubagentManagementEntry {
    pub(crate) entry: AgentEntry,
    pub(crate) source: SubAgentSource,
    pub(crate) canonical_key: Option<String>,
}

#[derive(Clone)]
pub struct ResolvedPersonaDefinition {
    pub key: String,
    pub revision: String,
    pub prompt_overlay: String,
    pub tools: Vec<String>,
    pub readonly: bool,
}

/// Registry for managing all available agents
pub struct AgentRegistry {
    /// id -> agent_entry
    agents: RwLock<HashMap<String, AgentEntry>>,
    /// workspace root -> (project subagent id -> agent_entry)
    project_subagents: RwLock<HashMap<PathBuf, HashMap<String, AgentEntry>>>,
}

impl Default for AgentRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentRegistry {
    fn read_agents(&self) -> std::sync::RwLockReadGuard<'_, HashMap<String, AgentEntry>> {
        match self.agents.read() {
            Ok(guard) => guard,
            Err(poisoned) => {
                warn!("Agent registry read lock poisoned, recovering");
                poisoned.into_inner()
            }
        }
    }

    fn write_agents(&self) -> std::sync::RwLockWriteGuard<'_, HashMap<String, AgentEntry>> {
        match self.agents.write() {
            Ok(guard) => guard,
            Err(poisoned) => {
                warn!("Agent registry write lock poisoned, recovering");
                poisoned.into_inner()
            }
        }
    }

    fn read_project_subagents(
        &self,
    ) -> std::sync::RwLockReadGuard<'_, HashMap<PathBuf, HashMap<String, AgentEntry>>> {
        match self.project_subagents.read() {
            Ok(guard) => guard,
            Err(poisoned) => {
                warn!("Agent project registry read lock poisoned, recovering");
                poisoned.into_inner()
            }
        }
    }

    fn write_project_subagents(
        &self,
    ) -> std::sync::RwLockWriteGuard<'_, HashMap<PathBuf, HashMap<String, AgentEntry>>> {
        match self.project_subagents.write() {
            Ok(guard) => guard,
            Err(poisoned) => {
                warn!("Agent project registry write lock poisoned, recovering");
                poisoned.into_inner()
            }
        }
    }

    fn find_agent_entry(
        &self,
        agent_type: &str,
        workspace_root: Option<&Path>,
    ) -> Option<AgentEntry> {
        if let Some(entry) = self.read_agents().get(agent_type).cloned() {
            return Some(entry);
        }

        let workspace_root = workspace_root?;
        self.read_project_subagents()
            .get(workspace_root)
            .and_then(|entries| entries.get(agent_type).cloned())
    }

    fn parse_subagent_management_key(
        subagent_key: &str,
        agent_id: &str,
    ) -> VoidResult<SubAgentSource> {
        let parts: Vec<&str> = subagent_key.split("::").collect();
        let (source, key_id) = match parts.as_slice() {
            ["builtin", "builtin", id] if !id.is_empty() => (SubAgentSource::Builtin, *id),
            ["user", "void", id] if !id.is_empty() => (SubAgentSource::User, *id),
            ["project", "void", id] if !id.is_empty() => (SubAgentSource::Project, *id),
            _ => {
                return Err(VoidError::validation(format!(
                    "Invalid canonical subagent key: {subagent_key}"
                )))
            }
        };
        if key_id != agent_id {
            return Err(VoidError::validation(format!(
                "Subagent key/id mismatch: key identifies '{key_id}', request identifies '{agent_id}'"
            )));
        }
        Ok(source)
    }

    pub(crate) fn resolve_subagent_management_entry(
        &self,
        subagent_key: Option<&str>,
        agent_id: &str,
        workspace_root: Option<&Path>,
    ) -> VoidResult<ResolvedSubagentManagementEntry> {
        let Some(subagent_key) = subagent_key else {
            let entry = self
                .find_agent_entry(agent_id, workspace_root)
                .ok_or_else(|| VoidError::agent(format!("Subagent not found: {agent_id}")))?;
            if entry.category != AgentCategory::SubAgent {
                return Err(VoidError::agent(format!(
                    "Agent '{agent_id}' is not a subagent"
                )));
            }
            let source = entry.subagent_source.ok_or_else(|| {
                VoidError::agent(format!("Agent '{agent_id}' has no subagent source"))
            })?;
            return Ok(ResolvedSubagentManagementEntry {
                canonical_key: types::subagent_key_for(Some(source), entry.agent.as_ref()),
                entry,
                source,
            });
        };

        let source = Self::parse_subagent_management_key(subagent_key, agent_id)?;
        let entry = match source {
            SubAgentSource::Builtin | SubAgentSource::User => {
                self.read_agents().get(agent_id).cloned()
            }
            SubAgentSource::Project => {
                let workspace_root = workspace_root.ok_or_else(|| {
                    VoidError::validation(format!(
                        "workspace_path is required for project subagent '{subagent_key}'"
                    ))
                })?;
                self.read_project_subagents()
                    .get(workspace_root)
                    .and_then(|entries| entries.get(agent_id))
                    .cloned()
            }
        }
        .ok_or_else(|| {
            VoidError::agent(format!(
                "Subagent not found for source/workspace: {subagent_key}"
            ))
        })?;

        if entry.category != AgentCategory::SubAgent || entry.subagent_source != Some(source) {
            return Err(VoidError::validation(format!(
                "Subagent source does not match canonical key: {subagent_key}"
            )));
        }
        let canonical_key = types::subagent_key_for(entry.subagent_source, entry.agent.as_ref())
            .ok_or_else(|| {
                VoidError::validation(format!(
                    "Subagent source/kind does not match canonical key: {subagent_key}"
                ))
            })?;
        if canonical_key != subagent_key {
            return Err(VoidError::validation(format!(
                "Subagent identity does not match canonical key: {subagent_key}"
            )));
        }

        Ok(ResolvedSubagentManagementEntry {
            entry,
            source,
            canonical_key: Some(canonical_key),
        })
    }

    /// Get a agent by ID (searches all categories including hidden)
    pub fn get_agent(
        &self,
        agent_type: &str,
        workspace_root: Option<&Path>,
    ) -> Option<Arc<dyn Agent>> {
        self.find_agent_entry(agent_type, workspace_root)
            .map(|entry| entry.agent)
    }

    /// Check if an agent exists
    pub fn check_agent_exists(&self, agent_type: &str) -> bool {
        self.read_agents().contains_key(agent_type)
            || self
                .read_project_subagents()
                .values()
                .any(|entries| entries.contains_key(agent_type))
    }

    /// Get a mode by ID
    pub fn get_mode_agent(&self, agent_type: &str) -> Option<Arc<dyn Agent>> {
        self.read_agents().get(agent_type).and_then(|e| {
            if e.category == AgentCategory::Mode {
                Some(e.agent.clone())
            } else {
                None
            }
        })
    }

    /// check if a subagent exists with specified source (used for duplicate check before adding)
    pub fn has_subagent(&self, agent_id: &str, source: SubAgentSource) -> bool {
        if self.read_agents().get(agent_id).is_some_and(|e| {
            e.category == AgentCategory::SubAgent && e.subagent_source == Some(source)
        }) {
            return true;
        }

        self.read_project_subagents().values().any(|entries| {
            entries.get(agent_id).is_some_and(|entry| {
                entry.category == AgentCategory::SubAgent && entry.subagent_source == Some(source)
            })
        })
    }

    /// Register an agent while preserving an explicit visibility definition.
    ///
    /// The legacy `register_agent` entry point remains public-by-default for
    /// existing callers. New custom-agent creation uses this method so scenario
    /// restrictions survive immediate registration without changing built-ins.
    pub fn register_agent_with_visibility(
        &self,
        agent: Arc<dyn Agent>,
        category: AgentCategory,
        subagent_source: Option<SubAgentSource>,
        visibility_policy: visibility::SubagentVisibilityPolicy,
        custom_config: Option<types::CustomSubagentConfig>,
    ) {
        let id = agent.id().to_string();
        let mut map = self.write_agents();
        if map.contains_key(&id) {
            warn!("Agent {} already registered, skip registration", id);
            return;
        }
        map.insert(
            id,
            AgentEntry {
                category,
                subagent_source,
                agent,
                visibility_policy,
                custom_config,
            },
        );
    }

    /// Register a project custom subagent inside one workspace only.
    ///
    /// Project definitions must never enter the global registry: the same
    /// immutable runtime ID may intentionally resolve to different definitions
    /// in different workspaces.
    pub fn register_project_subagent_with_visibility(
        &self,
        workspace_root: &Path,
        agent: Arc<dyn Agent>,
        visibility_policy: visibility::SubagentVisibilityPolicy,
        custom_config: Option<types::CustomSubagentConfig>,
    ) -> VoidResult<()> {
        let id = agent.id().to_string();
        let mut project_subagents = self.write_project_subagents();
        let workspace_entries = project_subagents
            .entry(workspace_root.to_path_buf())
            .or_default();
        if workspace_entries.contains_key(&id) {
            return Err(VoidError::agent(format!(
                "Project subagent '{}' is already registered for workspace '{}'",
                id,
                workspace_root.display()
            )));
        }
        workspace_entries.insert(
            id,
            AgentEntry {
                category: AgentCategory::SubAgent,
                subagent_source: Some(SubAgentSource::Project),
                agent,
                visibility_policy,
                custom_config,
            },
        );
        Ok(())
    }
}

// Global agent registry singleton
static GLOBAL_AGENT_REGISTRY: OnceLock<Arc<AgentRegistry>> = OnceLock::new();

/// Get the global agent registry
pub fn get_agent_registry() -> Arc<AgentRegistry> {
    GLOBAL_AGENT_REGISTRY
        .get_or_init(|| {
            debug!("Initializing global agent registry");
            Arc::new(AgentRegistry::new())
        })
        .clone()
}
