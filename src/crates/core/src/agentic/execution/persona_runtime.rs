use crate::agentic::agents::{
    get_agent_registry, Agent, AgentToolPolicy, AgentToolPolicyOverrides, PromptBuilderContext,
    ResolvedPersonaDefinition, UserContextPolicy,
};
use crate::agentic::core::SessionKind;
use crate::agentic::session::{SystemPromptCacheIdentity, UserContextCacheIdentity};
use crate::agentic::tools::get_readonly_registered_tool_names;
use crate::agentic::WorkspaceBinding;
use crate::util::errors::{VoidError, VoidResult};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::any::Any;
use std::collections::HashSet;
use std::sync::Arc;

const PERSONA_RUNTIME_VALIDATION_ERROR_PREFIX: &str = "persona_runtime_validation:";

pub fn wrap_persona_runtime_validation_error(error: VoidError) -> VoidError {
    VoidError::validation(format!("{PERSONA_RUNTIME_VALIDATION_ERROR_PREFIX} {error}"))
}

pub fn is_persona_runtime_validation_error_message(error: &str) -> bool {
    error.contains(PERSONA_RUNTIME_VALIDATION_ERROR_PREFIX)
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum PersonaScenario {
    Code,
    Cowork,
    Media,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersonaTurnSnapshot {
    schema_version: u8,
    kind: String,
    persona_key: String,
    persona_revision: String,
    scenario: PersonaScenario,
    execution_policy: String,
    resolved_skill_refs: Vec<String>,
}

#[derive(Clone)]
pub struct ResolvedPersonaRuntime {
    agent: Arc<dyn Agent>,
    tool_policy: AgentToolPolicy,
}

impl ResolvedPersonaRuntime {
    pub fn agent(&self) -> Arc<dyn Agent> {
        self.agent.clone()
    }

    pub fn tool_policy(&self) -> AgentToolPolicy {
        self.tool_policy.clone()
    }
}

struct PersonaOverlayAgent {
    base: Arc<dyn Agent>,
    persona_key: String,
    persona_revision: String,
    prompt_overlay: String,
    effective_tools: Vec<String>,
    exposure_overrides: AgentToolPolicyOverrides,
    tools_hash: String,
}

impl PersonaOverlayAgent {
    fn new(
        base: Arc<dyn Agent>,
        definition: ResolvedPersonaDefinition,
        tool_policy: AgentToolPolicy,
    ) -> Self {
        let tools_hash = hex::encode(Sha256::digest(tool_policy.allowed_tools.join("\n")));
        Self {
            base,
            persona_key: definition.key,
            persona_revision: definition.revision,
            prompt_overlay: definition.prompt_overlay,
            effective_tools: tool_policy.allowed_tools.clone(),
            exposure_overrides: tool_policy.exposure_overrides,
            tools_hash,
        }
    }
}

#[async_trait]
impl Agent for PersonaOverlayAgent {
    fn as_any(&self) -> &dyn Any {
        self
    }

    fn id(&self) -> &str {
        self.base.id()
    }

    fn name(&self) -> &str {
        self.base.name()
    }

    fn description(&self) -> &str {
        self.base.description()
    }

    fn prompt_template_name(&self, model_name: Option<&str>) -> &str {
        self.base.prompt_template_name(model_name)
    }

    fn system_prompt_cache_identity(&self, model_name: Option<&str>) -> SystemPromptCacheIdentity {
        let base_identity = self.base.system_prompt_cache_identity(model_name).scope_key;
        SystemPromptCacheIdentity::new(format!(
            "{base_identity}||persona:{}@{}||tools:{}",
            self.persona_key, self.persona_revision, self.tools_hash
        ))
    }

    fn user_context_cache_identity(&self) -> UserContextCacheIdentity {
        self.base.user_context_cache_identity()
    }

    fn user_context_policy(&self) -> UserContextPolicy {
        self.base.user_context_policy()
    }

    async fn build_prompt(&self, context: &PromptBuilderContext) -> VoidResult<String> {
        let base_prompt = self.base.build_prompt(context).await?;
        Ok(format!(
            "{base_prompt}\n\n<persona_overlay key=\"{}\" revision=\"{}\">\n{}\n</persona_overlay>",
            self.persona_key, self.persona_revision, self.prompt_overlay
        ))
    }

    async fn get_system_reminder(
        &self,
        previous_agent_type: Option<&str>,
        workspace: Option<&WorkspaceBinding>,
    ) -> VoidResult<String> {
        self.base
            .get_system_reminder(previous_agent_type, workspace)
            .await
    }

    fn default_tools(&self) -> Vec<String> {
        self.effective_tools.clone()
    }

    fn tool_exposure_overrides(&self) -> &AgentToolPolicyOverrides {
        &self.exposure_overrides
    }

    fn is_readonly(&self) -> bool {
        self.base.is_readonly()
    }
}

fn expected_scenario(agent_type: &str) -> PersonaScenario {
    match agent_type {
        "Cowork" | "DeepResearch" | "Claw" => PersonaScenario::Cowork,
        "Media" => PersonaScenario::Media,
        _ => PersonaScenario::Code,
    }
}

fn parse_and_validate_snapshot(
    metadata: Option<&Value>,
    agent_type: &str,
    session_kind: SessionKind,
) -> VoidResult<Option<PersonaTurnSnapshot>> {
    let Some(snapshot_value) = metadata.and_then(|value| value.get("personaTurnSnapshot")) else {
        return Ok(None);
    };
    let snapshot: PersonaTurnSnapshot =
        serde_json::from_value(snapshot_value.clone()).map_err(|error| {
            VoidError::validation(format!("Malformed personaTurnSnapshot: {error}"))
        })?;

    if snapshot.schema_version != 1 || snapshot.kind != "agent" {
        return Err(VoidError::validation(
            "Unsupported persona snapshot version or kind".to_string(),
        ));
    }
    if session_kind != SessionKind::Standard {
        return Err(VoidError::validation(
            "Persona snapshots are forbidden for child/subagent sessions".to_string(),
        ));
    }
    if metadata
        .and_then(|value| value.get("acp_transport"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Err(VoidError::validation(
            "ACP transport does not support non-default personas".to_string(),
        ));
    }
    if snapshot.scenario != expected_scenario(agent_type)
        || snapshot.execution_policy.trim() != agent_type
    {
        return Err(VoidError::validation(format!(
            "Persona snapshot scenario/executionPolicy does not match mode {agent_type}"
        )));
    }
    if !snapshot.resolved_skill_refs.is_empty() {
        return Err(VoidError::validation(
            "Persona Skill injection is not supported in snapshot v1".to_string(),
        ));
    }
    if snapshot.persona_key.trim().is_empty() || snapshot.persona_revision.trim().is_empty() {
        return Err(VoidError::validation(
            "Persona key and revision are required".to_string(),
        ));
    }
    Ok(Some(snapshot))
}

fn intersect_tool_policy(
    base: AgentToolPolicy,
    persona: &ResolvedPersonaDefinition,
    readonly_tools: &HashSet<String>,
) -> AgentToolPolicy {
    let persona_tools: HashSet<&str> = persona.tools.iter().map(String::as_str).collect();
    let allowed_tools: Vec<String> = base
        .allowed_tools
        .into_iter()
        .filter(|tool| persona_tools.contains(tool.as_str()))
        .filter(|tool| !persona.readonly || readonly_tools.contains(tool))
        .collect();
    let allowed_set: HashSet<&str> = allowed_tools.iter().map(String::as_str).collect();
    let mut exposure_overrides = base.exposure_overrides;
    exposure_overrides.retain(|tool, _| allowed_set.contains(tool.as_str()));
    AgentToolPolicy {
        allowed_tools,
        exposure_overrides,
    }
}

pub async fn resolve_persona_turn_runtime(
    metadata: Option<&Value>,
    agent_type: &str,
    session_kind: SessionKind,
    workspace: Option<&WorkspaceBinding>,
) -> VoidResult<Option<ResolvedPersonaRuntime>> {
    let Some(snapshot) = parse_and_validate_snapshot(metadata, agent_type, session_kind)? else {
        return Ok(None);
    };

    let registry = get_agent_registry();
    let workspace_root = workspace.map(WorkspaceBinding::root_path);
    let definition = registry
        .resolve_persona_definition(&snapshot.persona_key, workspace_root, agent_type)
        .await?;
    if definition.revision != snapshot.persona_revision {
        return Err(VoidError::validation(format!(
            "Persona revision mismatch for {}",
            snapshot.persona_key
        )));
    }
    let base = registry.get_mode_agent(agent_type).ok_or_else(|| {
        VoidError::validation(format!(
            "Persona base execution policy is not a mode: {agent_type}"
        ))
    })?;
    let base_policy = registry
        .get_agent_tool_policy(agent_type, workspace_root)
        .await;
    let readonly_tools: HashSet<String> = get_readonly_registered_tool_names()
        .await
        .into_iter()
        .collect();
    let tool_policy = intersect_tool_policy(base_policy, &definition, &readonly_tools);
    let agent: Arc<dyn Agent> = Arc::new(PersonaOverlayAgent::new(
        base,
        definition,
        tool_policy.clone(),
    ));

    Ok(Some(ResolvedPersonaRuntime { agent, tool_policy }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::agents::{AgenticMode, UserContextPolicy};
    use serde_json::json;

    struct ModelSensitiveAgent;

    #[async_trait]
    impl Agent for ModelSensitiveAgent {
        fn as_any(&self) -> &dyn Any {
            self
        }

        fn id(&self) -> &str {
            "model-sensitive"
        }

        fn name(&self) -> &str {
            "Model-sensitive"
        }

        fn description(&self) -> &str {
            "Test agent"
        }

        fn prompt_template_name(&self, model_name: Option<&str>) -> &str {
            if model_name == Some("model-b") {
                "template-b"
            } else {
                "template-a"
            }
        }

        fn user_context_policy(&self) -> UserContextPolicy {
            UserContextPolicy::empty()
        }

        fn default_tools(&self) -> Vec<String> {
            vec!["Read".to_string()]
        }
    }

    fn definition(revision: &str, tools: &[&str], readonly: bool) -> ResolvedPersonaDefinition {
        ResolvedPersonaDefinition {
            key: "user::void::writer".to_string(),
            revision: revision.to_string(),
            prompt_overlay: "Be precise.".to_string(),
            tools: tools.iter().map(|tool| (*tool).to_string()).collect(),
            readonly,
        }
    }

    #[test]
    fn persona_tools_only_narrow_base_order_and_readonly_narrows_again() {
        let base = AgentToolPolicy {
            allowed_tools: vec!["Write".into(), "Read".into(), "Grep".into()],
            exposure_overrides: Default::default(),
        };
        let readonly = HashSet::from(["Read".to_string(), "Grep".to_string()]);
        let policy = intersect_tool_policy(
            base,
            &definition("r1", &["Grep", "Write", "Unknown"], true),
            &readonly,
        );
        assert_eq!(policy.allowed_tools, vec!["Grep"]);
    }

    #[test]
    fn overlay_cache_identity_is_stable_and_changes_with_revision_or_tools() {
        let base: Arc<dyn Agent> = Arc::new(AgenticMode::new());
        let make = |revision: &str, tools: &[&str]| {
            let policy = AgentToolPolicy {
                allowed_tools: tools.iter().map(|tool| (*tool).to_string()).collect(),
                exposure_overrides: Default::default(),
            };
            PersonaOverlayAgent::new(base.clone(), definition(revision, tools, false), policy)
                .system_prompt_cache_identity(None)
        };
        assert_eq!(make("r1", &["Read"]), make("r1", &["Read"]));
        assert_ne!(make("r1", &["Read"]), make("r2", &["Read"]));
        assert_ne!(make("r1", &["Read"]), make("r1", &["Read", "Grep"]));
    }

    #[test]
    fn overlay_cache_identity_preserves_model_specific_base_identity() {
        let base: Arc<dyn Agent> = Arc::new(ModelSensitiveAgent);
        let policy = AgentToolPolicy {
            allowed_tools: vec!["Read".to_string()],
            exposure_overrides: Default::default(),
        };
        let overlay = PersonaOverlayAgent::new(base, definition("r1", &["Read"], false), policy);

        assert_ne!(
            overlay.system_prompt_cache_identity(Some("model-a")),
            overlay.system_prompt_cache_identity(Some("model-b"))
        );
    }

    fn snapshot_metadata() -> Value {
        json!({
            "personaTurnSnapshot": {
                "schemaVersion": 1,
                "kind": "agent",
                "personaKey": "user::void::writer",
                "personaRevision": "r1",
                "scenario": "code",
                "executionPolicy": "agentic",
                "resolvedSkillRefs": []
            }
        })
    }

    #[test]
    fn explicit_persona_gates_fail_closed_before_registry_resolution() {
        let mut team = snapshot_metadata();
        team["personaTurnSnapshot"]["kind"] = json!("team_lead");
        assert!(
            parse_and_validate_snapshot(Some(&team), "agentic", SessionKind::Standard)
                .unwrap_err()
                .to_string()
                .contains("kind")
        );

        let mut skill = snapshot_metadata();
        skill["personaTurnSnapshot"]["resolvedSkillRefs"] = json!(["audit"]);
        assert!(
            parse_and_validate_snapshot(Some(&skill), "agentic", SessionKind::Standard)
                .unwrap_err()
                .to_string()
                .contains("Skill")
        );

        assert!(parse_and_validate_snapshot(
            Some(&snapshot_metadata()),
            "agentic",
            SessionKind::Subagent
        )
        .unwrap_err()
        .to_string()
        .contains("child/subagent"));

        let mut acp = snapshot_metadata();
        acp["acp_transport"] = json!(true);
        assert!(
            parse_and_validate_snapshot(Some(&acp), "agentic", SessionKind::Standard)
                .unwrap_err()
                .to_string()
                .contains("ACP")
        );

        let mut wrong_mode = snapshot_metadata();
        wrong_mode["personaTurnSnapshot"]["executionPolicy"] = json!("Media");
        assert!(
            parse_and_validate_snapshot(Some(&wrong_mode), "agentic", SessionKind::Standard)
                .unwrap_err()
                .to_string()
                .contains("does not match")
        );
    }

    #[test]
    fn wrapped_persona_validation_errors_have_a_stable_scheduler_classification() {
        let wrapped = wrap_persona_runtime_validation_error(VoidError::validation(
            "Persona revision mismatch".to_string(),
        ));
        assert!(is_persona_runtime_validation_error_message(
            &wrapped.to_string()
        ));
        assert!(!is_persona_runtime_validation_error_message(
            "AI provider temporarily unavailable"
        ));
    }
}
