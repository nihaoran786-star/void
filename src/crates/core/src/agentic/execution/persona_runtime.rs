use crate::agentic::agents::{
    get_agent_registry, Agent, AgentToolPolicy, AgentToolPolicyOverrides, PromptBuilderContext,
    ResolvedPersonaDefinition, UserContextPolicy,
};
use crate::agentic::core::SessionKind;
use crate::agentic::persona_skill_runtime::PersonaSkillFacts;
use crate::agentic::session::{SystemPromptCacheIdentity, UserContextCacheIdentity};
use crate::agentic::team_tool_runtime::{TeamToolFacts, TEAM_TOOL_NAME, TEAM_TOOL_POLICY_VERSION};
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

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum PersonaSnapshotKind {
    Agent,
    TeamLead,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersonaTurnSnapshot {
    schema_version: u8,
    kind: PersonaSnapshotKind,
    persona_key: String,
    persona_revision: String,
    #[serde(default)]
    team_definition_id: Option<String>,
    #[serde(default)]
    team_instance_id: Option<String>,
    scenario: PersonaScenario,
    execution_policy: String,
    resolved_skill_refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TeamLeadPersonaResolveRequest {
    pub parent_session_id: String,
    pub team_definition_id: String,
    pub team_instance_id: String,
    pub lead_persona_id: String,
    pub persona_revision: String,
    pub scenario: String,
    pub execution_policy: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedTeamLeadPersona {
    pub team_definition_id: String,
    pub team_definition_revision: String,
    pub team_instance_id: String,
    pub lead_persona_id: String,
    pub prompt_overlay: String,
    pub allowed_tool_names: Vec<String>,
    pub allowed_skill_keys: Vec<String>,
    pub readonly: bool,
}

#[async_trait]
pub trait TeamLeadPersonaResolver: Send + Sync {
    async fn resolve_team_lead_persona(
        &self,
        request: TeamLeadPersonaResolveRequest,
    ) -> VoidResult<ResolvedTeamLeadPersona>;
}

#[derive(Clone)]
pub struct ResolvedPersonaRuntime {
    agent: Arc<dyn Agent>,
    tool_policy: AgentToolPolicy,
    persona_skill_facts: Option<PersonaSkillFacts>,
    team_tool_facts: Option<TeamToolFacts>,
}

impl ResolvedPersonaRuntime {
    pub fn agent(&self) -> Arc<dyn Agent> {
        self.agent.clone()
    }

    pub fn tool_policy(&self) -> AgentToolPolicy {
        self.tool_policy.clone()
    }

    pub fn persona_skill_facts(&self) -> Option<&PersonaSkillFacts> {
        self.persona_skill_facts.as_ref()
    }

    pub fn team_tool_facts(&self) -> Option<&TeamToolFacts> {
        self.team_tool_facts.as_ref()
    }
}

struct PersonaOverlayAgent {
    base: Arc<dyn Agent>,
    persona_key: String,
    persona_revision: String,
    prompt_overlay: String,
    effective_tools: Vec<String>,
    exposure_overrides: AgentToolPolicyOverrides,
    cache_identity: String,
}

impl PersonaOverlayAgent {
    fn new(
        base: Arc<dyn Agent>,
        definition: ResolvedPersonaDefinition,
        tool_policy: AgentToolPolicy,
    ) -> Self {
        let tools_hash = hex::encode(Sha256::digest(tool_policy.allowed_tools.join("\n")));
        let cache_identity = format!(
            "agent:{}@{}||tools:{}||skills:none",
            definition.key, definition.revision, tools_hash
        );
        Self {
            base,
            persona_key: definition.key,
            persona_revision: definition.revision,
            prompt_overlay: definition.prompt_overlay,
            effective_tools: tool_policy.allowed_tools.clone(),
            exposure_overrides: tool_policy.exposure_overrides,
            cache_identity,
        }
    }

    fn new_team_lead(
        base: Arc<dyn Agent>,
        definition: ResolvedTeamLeadPersona,
        persona_revision: String,
        tool_policy: AgentToolPolicy,
        persona_skill_facts: Option<&PersonaSkillFacts>,
    ) -> Self {
        let tools_hash = hex::encode(Sha256::digest(tool_policy.allowed_tools.join("\n")));
        let skills_identity = persona_skill_facts
            .map(PersonaSkillFacts::cache_identity)
            .unwrap_or_else(|| "none".to_string());
        let cache_identity = format!(
            "team_lead:definition={}@{}||instance={}||lead={}||persona_revision={}||tools:{}||skills:{}||team_tool_policy:{}",
            definition.team_definition_id,
            definition.team_definition_revision,
            definition.team_instance_id,
            definition.lead_persona_id,
            persona_revision,
            tools_hash,
            skills_identity,
            TEAM_TOOL_POLICY_VERSION,
        );
        Self {
            base,
            persona_key: definition.lead_persona_id,
            persona_revision,
            prompt_overlay: definition.prompt_overlay,
            effective_tools: tool_policy.allowed_tools.clone(),
            exposure_overrides: tool_policy.exposure_overrides,
            cache_identity,
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
            "{base_identity}||persona_runtime:{}",
            self.cache_identity
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

    if snapshot.schema_version != 1 {
        return Err(VoidError::validation(
            "Unsupported persona snapshot version".to_string(),
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
    match snapshot.kind {
        PersonaSnapshotKind::Agent => {
            if snapshot.team_definition_id.is_some() || snapshot.team_instance_id.is_some() {
                return Err(VoidError::validation(
                    "Agent persona snapshot cannot carry Team identity".to_string(),
                ));
            }
        }
        PersonaSnapshotKind::TeamLead => {
            if snapshot
                .team_definition_id
                .as_deref()
                .is_none_or(|value| value.trim().is_empty())
                || snapshot
                    .team_instance_id
                    .as_deref()
                    .is_none_or(|value| value.trim().is_empty())
            {
                return Err(VoidError::validation(
                    "Team lead snapshot requires definition and instance identity".to_string(),
                ));
            }
        }
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

fn intersect_team_lead_tool_policy(
    base: AgentToolPolicy,
    persona: &ResolvedTeamLeadPersona,
    readonly_tools: &HashSet<String>,
) -> AgentToolPolicy {
    let declared_tools: HashSet<&str> = persona
        .allowed_tool_names
        .iter()
        .map(String::as_str)
        .collect();
    let inherit_base = declared_tools.is_empty();
    let allowed_tools: Vec<String> = base
        .allowed_tools
        .into_iter()
        .filter(|tool| inherit_base || declared_tools.contains(tool.as_str()))
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

fn enable_team_tool_for_lead(
    tool_policy: &mut AgentToolPolicy,
    definition: &ResolvedTeamLeadPersona,
) -> Option<TeamToolFacts> {
    if definition.readonly || !tool_policy.allowed_tools.iter().any(|tool| tool == "Task") {
        return None;
    }
    if !tool_policy
        .allowed_tools
        .iter()
        .any(|tool| tool == TEAM_TOOL_NAME)
    {
        tool_policy.allowed_tools.push(TEAM_TOOL_NAME.to_string());
    }
    Some(TeamToolFacts::new(
        definition.team_definition_id.clone(),
        definition.team_definition_revision.clone(),
        definition.team_instance_id.clone(),
        definition.lead_persona_id.clone(),
    ))
}

pub async fn resolve_persona_turn_runtime(
    metadata: Option<&Value>,
    parent_session_id: &str,
    agent_type: &str,
    session_kind: SessionKind,
    workspace: Option<&WorkspaceBinding>,
    team_lead_resolver: Option<&Arc<dyn TeamLeadPersonaResolver>>,
) -> VoidResult<Option<ResolvedPersonaRuntime>> {
    let Some(snapshot) = parse_and_validate_snapshot(metadata, agent_type, session_kind)? else {
        return Ok(None);
    };

    let registry = get_agent_registry();
    let workspace_root = workspace.map(WorkspaceBinding::root_path);
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
    let (agent, tool_policy, persona_skill_facts, team_tool_facts): (
        Arc<dyn Agent>,
        AgentToolPolicy,
        Option<PersonaSkillFacts>,
        Option<TeamToolFacts>,
    ) = match snapshot.kind {
        PersonaSnapshotKind::Agent => {
            let definition = registry
                .resolve_persona_definition_at_revision(
                    &snapshot.persona_key,
                    &snapshot.persona_revision,
                    workspace,
                    agent_type,
                )
                .await?;
            if definition.revision != snapshot.persona_revision {
                return Err(VoidError::validation(format!(
                    "Persona revision mismatch for {}",
                    snapshot.persona_key
                )));
            }
            let tool_policy = intersect_tool_policy(base_policy, &definition, &readonly_tools);
            let agent: Arc<dyn Agent> = Arc::new(PersonaOverlayAgent::new(
                base,
                definition,
                tool_policy.clone(),
            ));
            (agent, tool_policy, None, None)
        }
        PersonaSnapshotKind::TeamLead => {
            let resolver = team_lead_resolver.ok_or_else(|| {
                VoidError::validation("Team lead persona resolver is not installed".to_string())
            })?;
            let definition = resolver
                .resolve_team_lead_persona(TeamLeadPersonaResolveRequest {
                    parent_session_id: parent_session_id.to_string(),
                    team_definition_id: snapshot.team_definition_id.clone().unwrap_or_default(),
                    team_instance_id: snapshot.team_instance_id.clone().unwrap_or_default(),
                    lead_persona_id: snapshot.persona_key.clone(),
                    persona_revision: snapshot.persona_revision.clone(),
                    scenario: match snapshot.scenario {
                        PersonaScenario::Code => "code",
                        PersonaScenario::Cowork => "cowork",
                        PersonaScenario::Media => "media",
                    }
                    .to_string(),
                    execution_policy: snapshot.execution_policy.clone(),
                })
                .await?;
            let expected_revision = format!(
                "{}:{}",
                definition.team_definition_revision, definition.lead_persona_id
            );
            if definition.team_definition_id
                != snapshot.team_definition_id.clone().unwrap_or_default()
                || definition.team_instance_id
                    != snapshot.team_instance_id.clone().unwrap_or_default()
                || definition.lead_persona_id != snapshot.persona_key
                || snapshot.persona_revision != expected_revision
            {
                return Err(VoidError::validation(
                    "Resolved Team lead identity does not match the immutable snapshot".to_string(),
                ));
            }
            let mut tool_policy =
                intersect_team_lead_tool_policy(base_policy, &definition, &readonly_tools);
            let team_tool_facts = enable_team_tool_for_lead(&mut tool_policy, &definition);
            let persona_skill_facts =
                PersonaSkillFacts::from_allowed_skill_keys(&definition.allowed_skill_keys)?;
            let agent: Arc<dyn Agent> = Arc::new(PersonaOverlayAgent::new_team_lead(
                base,
                definition,
                snapshot.persona_revision,
                tool_policy.clone(),
                persona_skill_facts.as_ref(),
            ));
            (agent, tool_policy, persona_skill_facts, team_tool_facts)
        }
    };

    Ok(Some(ResolvedPersonaRuntime {
        agent,
        tool_policy,
        persona_skill_facts,
        team_tool_facts,
    }))
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
    fn team_lead_empty_tools_inherit_base_and_readonly_still_narrows() {
        let base = AgentToolPolicy {
            allowed_tools: vec!["Write".into(), "Read".into(), "Grep".into()],
            exposure_overrides: Default::default(),
        };
        let readonly = HashSet::from(["Read".to_string(), "Grep".to_string()]);
        let persona = ResolvedTeamLeadPersona {
            team_definition_id: "custom-team".to_string(),
            team_definition_revision: "r1".to_string(),
            team_instance_id: "instance-1".to_string(),
            lead_persona_id: "member-lead".to_string(),
            prompt_overlay: "Lead safely.".to_string(),
            allowed_tool_names: Vec::new(),
            allowed_skill_keys: Vec::new(),
            readonly: true,
        };

        let policy = intersect_team_lead_tool_policy(base, &persona, &readonly);
        assert_eq!(policy.allowed_tools, vec!["Read", "Grep"]);
    }

    #[test]
    fn team_tool_requires_writable_lead_and_task_in_effective_intersection() {
        let definition = |allowed_tool_names: &[&str], readonly: bool| ResolvedTeamLeadPersona {
            team_definition_id: "custom-team".to_string(),
            team_definition_revision: "r1".to_string(),
            team_instance_id: "instance-1".to_string(),
            lead_persona_id: "member-lead".to_string(),
            prompt_overlay: "Lead safely.".to_string(),
            allowed_tool_names: allowed_tool_names
                .iter()
                .map(|tool| (*tool).to_string())
                .collect(),
            allowed_skill_keys: Vec::new(),
            readonly,
        };
        let base = || AgentToolPolicy {
            allowed_tools: vec!["Read".into(), "Task".into()],
            exposure_overrides: Default::default(),
        };
        let readonly_tools = HashSet::from(["Read".to_string()]);

        let writable = definition(&["Read", "Task"], false);
        let mut policy = intersect_team_lead_tool_policy(base(), &writable, &readonly_tools);
        let facts = enable_team_tool_for_lead(&mut policy, &writable)
            .expect("writable Team lead with Task should receive Team authority");
        assert_eq!(policy.allowed_tools, vec!["Read", "Task", "Team"]);
        assert_eq!(facts.team_instance_id, "instance-1");

        for denied in [
            definition(&["Read", "Task"], true),
            definition(&["Read"], false),
        ] {
            let mut policy = intersect_team_lead_tool_policy(base(), &denied, &readonly_tools);
            assert!(enable_team_tool_for_lead(&mut policy, &denied).is_none());
            assert!(!policy.allowed_tools.iter().any(|tool| tool == "Team"));
        }

        let no_task_base = AgentToolPolicy {
            allowed_tools: vec!["Read".into()],
            exposure_overrides: Default::default(),
        };
        let writable = definition(&["Read", "Task"], false);
        let mut policy = intersect_team_lead_tool_policy(no_task_base, &writable, &readonly_tools);
        assert!(enable_team_tool_for_lead(&mut policy, &writable).is_none());
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

    fn team_snapshot_metadata() -> Value {
        json!({
            "personaTurnSnapshot": {
                "schemaVersion": 1,
                "kind": "team_lead",
                "personaKey": "member-lead",
                "personaRevision": "r1:member-lead",
                "teamDefinitionId": "custom-team",
                "teamInstanceId": "instance-1",
                "scenario": "code",
                "executionPolicy": "agentic",
                "resolvedSkillRefs": []
            }
        })
    }

    #[test]
    fn explicit_persona_gates_fail_closed_before_registry_resolution() {
        let mut team = team_snapshot_metadata();
        team["personaTurnSnapshot"]["teamInstanceId"] = Value::Null;
        assert!(
            parse_and_validate_snapshot(Some(&team), "agentic", SessionKind::Standard)
                .unwrap_err()
                .to_string()
                .contains("definition and instance")
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
    fn team_lead_cache_identity_separates_instances_and_includes_empty_skills() {
        let base: Arc<dyn Agent> = Arc::new(AgenticMode::new());
        let policy = AgentToolPolicy {
            allowed_tools: vec!["Read".to_string()],
            exposure_overrides: Default::default(),
        };
        let make = |instance: &str| {
            PersonaOverlayAgent::new_team_lead(
                base.clone(),
                ResolvedTeamLeadPersona {
                    team_definition_id: "custom-team".to_string(),
                    team_definition_revision: "r1".to_string(),
                    team_instance_id: instance.to_string(),
                    lead_persona_id: "member-lead".to_string(),
                    prompt_overlay: "Lead safely.".to_string(),
                    allowed_tool_names: vec!["Read".to_string()],
                    allowed_skill_keys: Vec::new(),
                    readonly: false,
                },
                "r1:member-lead".to_string(),
                policy.clone(),
                None,
            )
            .system_prompt_cache_identity(None)
        };

        assert_ne!(make("instance-1"), make("instance-2"));
        assert!(make("instance-1").scope_key.contains("skills:none"));
        assert!(make("instance-1").scope_key.contains("team_tool_policy:v1"));
    }

    #[test]
    fn team_lead_cache_identity_tracks_normalized_skill_allowlist() {
        let base: Arc<dyn Agent> = Arc::new(AgenticMode::new());
        let policy = AgentToolPolicy {
            allowed_tools: vec!["Read".to_string()],
            exposure_overrides: Default::default(),
        };
        let make = |skills: &[&str]| {
            let skill_keys = skills
                .iter()
                .map(|skill| (*skill).to_string())
                .collect::<Vec<_>>();
            let facts = PersonaSkillFacts::from_allowed_skill_keys(&skill_keys)
                .unwrap()
                .unwrap();
            PersonaOverlayAgent::new_team_lead(
                base.clone(),
                ResolvedTeamLeadPersona {
                    team_definition_id: "custom-team".to_string(),
                    team_definition_revision: "r1".to_string(),
                    team_instance_id: "instance-1".to_string(),
                    lead_persona_id: "member-lead".to_string(),
                    prompt_overlay: "Lead safely.".to_string(),
                    allowed_tool_names: vec!["Read".to_string()],
                    allowed_skill_keys: skill_keys,
                    readonly: false,
                },
                "r1:member-lead".to_string(),
                policy.clone(),
                Some(&facts),
            )
            .system_prompt_cache_identity(None)
        };

        assert_eq!(make(&["skill-a", "skill-b"]), make(&["skill-b", "skill-a"]));
        assert_ne!(make(&["skill-a"]), make(&["skill-b"]));
        assert!(!make(&["skill-a"]).scope_key.contains("skills:none"));
    }

    #[tokio::test]
    async fn team_lead_snapshot_without_platform_resolver_fails_closed() {
        let error = resolve_persona_turn_runtime(
            Some(&team_snapshot_metadata()),
            "parent",
            "agentic",
            SessionKind::Standard,
            None,
            None,
        )
        .await
        .err()
        .expect("Team snapshots cannot fall back to the scenario default");
        assert!(error.to_string().contains("resolver is not installed"));
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
