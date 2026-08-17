//! Reusable Team definition contracts.
//!
//! This module owns the canonical definition shape and validation rules only.
//! Live team instances and subagent orchestration remain in their existing
//! runtimes until a dedicated Team runtime is implemented.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

pub const TEAM_DEFINITION_SCHEMA_VERSION: u32 = 2;
const LEGACY_TEAM_DEFINITION_SCHEMA_VERSION: u32 = 1;
pub const DEFAULT_TEAM_MEMBER_MAX_CHILD_TASKS: u8 = 8;
pub const DEFAULT_TEAM_MEMBER_MAX_PARALLEL_TASKS: u8 = 3;
const MAX_MEMBERS: usize = 12;
const MAX_WORKFLOWS: usize = 8;
const MAX_PHASES_PER_WORKFLOW: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamDefinitionLevel {
    User,
    Project,
}

impl TeamDefinitionLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Project => "project",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamDefinitionOrigin {
    User,
    Project,
    Installed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamScenario {
    Code,
    Cowork,
    Media,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamMemberRole {
    Lead,
    Specialist,
    QualityGate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamWorkflowPhaseKind {
    Serial,
    Parallel,
    Decision,
    Review,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamCollaborationPolicy {
    LeadMediated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamPermissionPolicy {
    InheritParentIntersection,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TeamMemberDelegationPolicy {
    #[default]
    Disabled,
    Bounded {
        #[serde(rename = "maxWorkerTasks")]
        max_worker_tasks: u8,
        #[serde(rename = "maxParallelWorkers")]
        max_parallel_workers: u8,
    },
}

impl TeamMemberDelegationPolicy {
    pub const fn bounded_default() -> Self {
        Self::Bounded {
            max_worker_tasks: DEFAULT_TEAM_MEMBER_MAX_CHILD_TASKS,
            max_parallel_workers: DEFAULT_TEAM_MEMBER_MAX_PARALLEL_TASKS,
        }
    }
}

pub fn effective_member_delegation_policy(
    definition: &TeamDefinition,
    member: &TeamMemberDefinition,
) -> TeamMemberDelegationPolicy {
    if definition.schema_version == LEGACY_TEAM_DEFINITION_SCHEMA_VERSION
        && member.role != TeamMemberRole::Lead
        && member.delegation_policy == TeamMemberDelegationPolicy::Disabled
    {
        TeamMemberDelegationPolicy::bounded_default()
    } else {
        member.delegation_policy
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMemberDefinition {
    pub member_id: String,
    pub display_name: String,
    pub professional_role: String,
    pub role: TeamMemberRole,
    pub instructions: String,
    pub output_responsibility: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub allowed_skill_keys: Vec<String>,
    #[serde(default)]
    pub allowed_tool_names: Vec<String>,
    pub permission_policy: TeamPermissionPolicy,
    #[serde(default)]
    pub is_readonly: bool,
    #[serde(default)]
    pub delegation_policy: TeamMemberDelegationPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamWorkflowPhaseDefinition {
    pub phase_id: String,
    pub display_name: String,
    pub kind: TeamWorkflowPhaseKind,
    #[serde(default)]
    pub depends_on_phase_ids: Vec<String>,
    pub assigned_member_ids: Vec<String>,
    #[serde(default)]
    pub expected_outputs: Vec<String>,
    pub completion_rule: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamWorkflowDefinition {
    pub workflow_id: String,
    pub display_name: String,
    pub trigger_description: String,
    pub phases: Vec<TeamWorkflowPhaseDefinition>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDefinition {
    pub schema_version: u32,
    pub team_definition_id: String,
    pub display_name: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emblem: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent: Option<String>,
    pub category: String,
    #[serde(default)]
    pub capability_tags: Vec<String>,
    pub scenario_eligibility: Vec<TeamScenario>,
    pub lead_member_id: String,
    pub members: Vec<TeamMemberDefinition>,
    pub workflows: Vec<TeamWorkflowDefinition>,
    pub collaboration_policy: TeamCollaborationPolicy,
    pub permission_policy: TeamPermissionPolicy,
    pub origin: TeamDefinitionOrigin,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMemberDraft {
    pub client_key: String,
    pub display_name: String,
    pub professional_role: String,
    pub role: TeamMemberRole,
    pub instructions: String,
    pub output_responsibility: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub allowed_skill_keys: Vec<String>,
    #[serde(default)]
    pub allowed_tool_names: Vec<String>,
    #[serde(default)]
    pub is_readonly: bool,
    #[serde(default)]
    pub delegation_policy: Option<TeamMemberDelegationPolicy>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamWorkflowPhaseDraft {
    pub client_key: String,
    pub display_name: String,
    pub kind: TeamWorkflowPhaseKind,
    #[serde(default)]
    pub depends_on_phase_keys: Vec<String>,
    pub assigned_member_keys: Vec<String>,
    #[serde(default)]
    pub expected_outputs: Vec<String>,
    pub completion_rule: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamWorkflowDraft {
    pub client_key: String,
    pub display_name: String,
    pub trigger_description: String,
    pub phases: Vec<TeamWorkflowPhaseDraft>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDefinitionDraft {
    pub display_name: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emblem: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent: Option<String>,
    pub category: String,
    #[serde(default)]
    pub capability_tags: Vec<String>,
    pub scenario_eligibility: Vec<TeamScenario>,
    pub lead_member_key: String,
    pub members: Vec<TeamMemberDraft>,
    pub workflows: Vec<TeamWorkflowDraft>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDefinitionRecord {
    pub definition: TeamDefinition,
    pub revision: String,
    pub level: TeamDefinitionLevel,
    pub path: String,
    pub is_authorable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamDefinitionErrorCode {
    ValidationFailed,
    NotFound,
    NotAuthorable,
    RevisionConflict,
    UnsupportedRemoteProject,
    ReadFailed,
    WriteFailed,
    RollbackFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDefinitionError {
    pub code: TeamDefinitionErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery_path: Option<String>,
}

impl TeamDefinitionError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            code: TeamDefinitionErrorCode::ValidationFailed,
            message: message.into(),
            recovery_path: None,
        }
    }
}

fn generated_id(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4().simple())
}

fn normalize_text(value: String) -> String {
    value.trim().to_string()
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.map(normalize_text).filter(|value| !value.is_empty())
}

fn normalize_sequence(values: Vec<String>) -> Vec<String> {
    let mut values = values
        .into_iter()
        .map(normalize_text)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    values
}

pub fn materialize_team_definition(
    draft: TeamDefinitionDraft,
    level: TeamDefinitionLevel,
) -> Result<TeamDefinition, TeamDefinitionError> {
    let member_ids = draft
        .members
        .iter()
        .map(|member| (member.client_key.clone(), generated_id("member")))
        .collect::<HashMap<_, _>>();
    if member_ids.len() != draft.members.len() {
        return Err(TeamDefinitionError::validation(
            "Team member client keys must be unique",
        ));
    }
    let lead_member_id = member_ids
        .get(&draft.lead_member_key)
        .cloned()
        .ok_or_else(|| TeamDefinitionError::validation("Team lead must reference one member"))?;

    let members = draft
        .members
        .into_iter()
        .map(|member| TeamMemberDefinition {
            member_id: member_ids[&member.client_key].clone(),
            display_name: normalize_text(member.display_name),
            professional_role: normalize_text(member.professional_role),
            role: member.role,
            instructions: normalize_text(member.instructions),
            output_responsibility: normalize_text(member.output_responsibility),
            agent_id: normalize_optional_text(member.agent_id),
            allowed_skill_keys: normalize_sequence(member.allowed_skill_keys),
            allowed_tool_names: normalize_sequence(member.allowed_tool_names),
            permission_policy: TeamPermissionPolicy::InheritParentIntersection,
            is_readonly: member.is_readonly,
            delegation_policy: member.delegation_policy.unwrap_or_else(|| {
                if member.role == TeamMemberRole::Lead {
                    TeamMemberDelegationPolicy::Disabled
                } else {
                    TeamMemberDelegationPolicy::bounded_default()
                }
            }),
        })
        .collect::<Vec<_>>();

    let mut workflows = Vec::with_capacity(draft.workflows.len());
    let mut workflow_client_keys = HashSet::new();
    for workflow in draft.workflows {
        if !workflow_client_keys.insert(workflow.client_key.clone()) {
            return Err(TeamDefinitionError::validation(
                "Team workflow client keys must be unique",
            ));
        }
        let phase_ids = workflow
            .phases
            .iter()
            .map(|phase| (phase.client_key.clone(), generated_id("phase")))
            .collect::<HashMap<_, _>>();
        if phase_ids.len() != workflow.phases.len() {
            return Err(TeamDefinitionError::validation(
                "Workflow phase client keys must be unique",
            ));
        }
        let phases = workflow
            .phases
            .into_iter()
            .map(|phase| {
                let assigned_member_ids = phase
                    .assigned_member_keys
                    .iter()
                    .map(|key| {
                        member_ids.get(key).cloned().ok_or_else(|| {
                            TeamDefinitionError::validation(format!(
                                "Workflow phase references unknown member key '{key}'"
                            ))
                        })
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                let depends_on_phase_ids = phase
                    .depends_on_phase_keys
                    .iter()
                    .map(|key| {
                        phase_ids.get(key).cloned().ok_or_else(|| {
                            TeamDefinitionError::validation(format!(
                                "Workflow phase references unknown dependency key '{key}'"
                            ))
                        })
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(TeamWorkflowPhaseDefinition {
                    phase_id: phase_ids[&phase.client_key].clone(),
                    display_name: normalize_text(phase.display_name),
                    kind: phase.kind,
                    depends_on_phase_ids,
                    assigned_member_ids,
                    expected_outputs: normalize_sequence(phase.expected_outputs),
                    completion_rule: normalize_text(phase.completion_rule),
                })
            })
            .collect::<Result<Vec<_>, TeamDefinitionError>>()?;
        workflows.push(TeamWorkflowDefinition {
            workflow_id: generated_id("workflow"),
            display_name: normalize_text(workflow.display_name),
            trigger_description: normalize_text(workflow.trigger_description),
            phases,
        });
    }

    let mut definition = TeamDefinition {
        schema_version: TEAM_DEFINITION_SCHEMA_VERSION,
        team_definition_id: generated_id("custom"),
        display_name: normalize_text(draft.display_name),
        description: normalize_text(draft.description),
        emblem: normalize_optional_text(draft.emblem),
        accent: normalize_optional_text(draft.accent),
        category: normalize_text(draft.category),
        capability_tags: normalize_sequence(draft.capability_tags),
        scenario_eligibility: draft.scenario_eligibility,
        lead_member_id,
        members,
        workflows,
        collaboration_policy: TeamCollaborationPolicy::LeadMediated,
        permission_policy: TeamPermissionPolicy::InheritParentIntersection,
        origin: match level {
            TeamDefinitionLevel::User => TeamDefinitionOrigin::User,
            TeamDefinitionLevel::Project => TeamDefinitionOrigin::Project,
        },
    };
    definition
        .scenario_eligibility
        .sort_by_key(|scenario| match scenario {
            TeamScenario::Code => 0,
            TeamScenario::Cowork => 1,
            TeamScenario::Media => 2,
        });
    definition.scenario_eligibility.dedup();
    validate_team_definition(&definition)?;
    Ok(definition)
}

fn validate_text(label: &str, value: &str, maximum: usize) -> Result<(), TeamDefinitionError> {
    let length = value.trim().chars().count();
    if length == 0 {
        return Err(TeamDefinitionError::validation(format!(
            "{label} cannot be empty"
        )));
    }
    if length > maximum {
        return Err(TeamDefinitionError::validation(format!(
            "{label} cannot exceed {maximum} characters"
        )));
    }
    if value.chars().any(char::is_control) {
        return Err(TeamDefinitionError::validation(format!(
            "{label} cannot contain control characters"
        )));
    }
    Ok(())
}

fn has_generated_id_shape(value: &str, prefix: &str) -> bool {
    value
        .strip_prefix(&format!("{prefix}-"))
        .is_some_and(|suffix| {
            suffix.len() == 32
                && suffix.chars().all(|character| {
                    character.is_ascii_hexdigit() && !character.is_ascii_uppercase()
                })
        })
}

pub fn validate_team_definition(definition: &TeamDefinition) -> Result<(), TeamDefinitionError> {
    if !matches!(
        definition.schema_version,
        LEGACY_TEAM_DEFINITION_SCHEMA_VERSION | TEAM_DEFINITION_SCHEMA_VERSION
    ) {
        return Err(TeamDefinitionError::validation(format!(
            "Unsupported Team definition schema version {}",
            definition.schema_version
        )));
    }
    if !has_generated_id_shape(&definition.team_definition_id, "custom") {
        return Err(TeamDefinitionError::validation(
            "Team definition ID must be a generated custom UUID",
        ));
    }
    validate_text("Team display name", &definition.display_name, 80)?;
    validate_text("Team description", &definition.description, 500)?;
    validate_text("Team category", &definition.category, 80)?;
    if definition.scenario_eligibility.is_empty() {
        return Err(TeamDefinitionError::validation(
            "Team must support at least one scenario",
        ));
    }
    let unique_scenarios = definition
        .scenario_eligibility
        .iter()
        .collect::<HashSet<_>>();
    if unique_scenarios.len() != definition.scenario_eligibility.len() {
        return Err(TeamDefinitionError::validation(
            "Team scenarios must be unique",
        ));
    }
    if definition.members.len() < 2 || definition.members.len() > MAX_MEMBERS {
        return Err(TeamDefinitionError::validation(format!(
            "Team must contain 2 to {MAX_MEMBERS} members including the lead"
        )));
    }
    for member in &definition.members {
        match member.delegation_policy {
            TeamMemberDelegationPolicy::Disabled => {}
            TeamMemberDelegationPolicy::Bounded {
                max_worker_tasks,
                max_parallel_workers,
            } => {
                if definition.schema_version == LEGACY_TEAM_DEFINITION_SCHEMA_VERSION {
                    return Err(TeamDefinitionError::validation(
                        "Legacy Team definitions cannot grant member delegation",
                    ));
                }
                if !(1..=32).contains(&max_worker_tasks) {
                    return Err(TeamDefinitionError::validation(
                        "Team member max child tasks must be between 1 and 32",
                    ));
                }
                if !(1..=8).contains(&max_parallel_workers) {
                    return Err(TeamDefinitionError::validation(
                        "Team member max parallel tasks must be between 1 and 8",
                    ));
                }
                if max_parallel_workers > max_worker_tasks {
                    return Err(TeamDefinitionError::validation(
                        "Team member max parallel tasks cannot exceed max child tasks",
                    ));
                }
            }
        }
    }
    if definition.workflows.is_empty() || definition.workflows.len() > MAX_WORKFLOWS {
        return Err(TeamDefinitionError::validation(format!(
            "Team must contain 1 to {MAX_WORKFLOWS} workflows"
        )));
    }
    if definition.collaboration_policy != TeamCollaborationPolicy::LeadMediated
        || definition.permission_policy != TeamPermissionPolicy::InheritParentIntersection
    {
        return Err(TeamDefinitionError::validation(
            "Team policies cannot expand parent runtime permissions or bypass the lead",
        ));
    }

    let mut member_ids = HashSet::new();
    let mut lead_count = 0;
    for member in &definition.members {
        if !has_generated_id_shape(&member.member_id, "member")
            || !member_ids.insert(member.member_id.as_str())
        {
            return Err(TeamDefinitionError::validation(
                "Team member IDs must be unique generated UUIDs",
            ));
        }
        validate_text("Member display name", &member.display_name, 80)?;
        validate_text("Member professional role", &member.professional_role, 120)?;
        validate_text("Member instructions", &member.instructions, 20_000)?;
        validate_text(
            "Member output responsibility",
            &member.output_responsibility,
            1_000,
        )?;
        if member
            .agent_id
            .as_deref()
            .is_none_or(|agent_id| agent_id.trim().is_empty())
        {
            return Err(TeamDefinitionError::validation(
                "Every Team member must reference a non-empty Agent ID",
            ));
        }
        if member.permission_policy != TeamPermissionPolicy::InheritParentIntersection {
            return Err(TeamDefinitionError::validation(
                "Member permissions must inherit the parent intersection",
            ));
        }
        if member.role == TeamMemberRole::Lead {
            lead_count += 1;
            if member.member_id != definition.lead_member_id {
                return Err(TeamDefinitionError::validation(
                    "The lead role must match leadMemberId",
                ));
            }
        }
    }
    if lead_count != 1 || !member_ids.contains(definition.lead_member_id.as_str()) {
        return Err(TeamDefinitionError::validation(
            "Team members must include the lead exactly once",
        ));
    }

    let mut workflow_ids = HashSet::new();
    for workflow in &definition.workflows {
        if !has_generated_id_shape(&workflow.workflow_id, "workflow")
            || !workflow_ids.insert(workflow.workflow_id.as_str())
        {
            return Err(TeamDefinitionError::validation(
                "Workflow IDs must be unique generated UUIDs",
            ));
        }
        validate_text("Workflow display name", &workflow.display_name, 120)?;
        validate_text(
            "Workflow trigger description",
            &workflow.trigger_description,
            1_000,
        )?;
        if workflow.phases.is_empty() || workflow.phases.len() > MAX_PHASES_PER_WORKFLOW {
            return Err(TeamDefinitionError::validation(format!(
                "Workflow must contain 1 to {MAX_PHASES_PER_WORKFLOW} phases"
            )));
        }
        validate_workflow(workflow, &member_ids)?;
    }
    Ok(())
}

fn validate_workflow(
    workflow: &TeamWorkflowDefinition,
    member_ids: &HashSet<&str>,
) -> Result<(), TeamDefinitionError> {
    let mut phase_ids = HashSet::new();
    for phase in &workflow.phases {
        if !has_generated_id_shape(&phase.phase_id, "phase")
            || !phase_ids.insert(phase.phase_id.as_str())
        {
            return Err(TeamDefinitionError::validation(
                "Workflow phase IDs must be unique generated UUIDs",
            ));
        }
        validate_text("Workflow phase name", &phase.display_name, 120)?;
        validate_text("Workflow completion rule", &phase.completion_rule, 1_000)?;
        if phase.assigned_member_ids.is_empty()
            || phase
                .assigned_member_ids
                .iter()
                .any(|member_id| !member_ids.contains(member_id.as_str()))
        {
            return Err(TeamDefinitionError::validation(
                "Every phase must reference at least one known Team member",
            ));
        }
    }
    let phase_by_id = workflow
        .phases
        .iter()
        .map(|phase| (phase.phase_id.as_str(), phase))
        .collect::<HashMap<_, _>>();
    for phase in &workflow.phases {
        if phase.depends_on_phase_ids.iter().any(|dependency| {
            dependency == &phase.phase_id || !phase_by_id.contains_key(dependency.as_str())
        }) {
            return Err(TeamDefinitionError::validation(
                "Workflow dependencies must reference another known phase",
            ));
        }
    }

    fn visit<'a>(
        phase_id: &'a str,
        phase_by_id: &HashMap<&'a str, &'a TeamWorkflowPhaseDefinition>,
        visiting: &mut HashSet<&'a str>,
        visited: &mut HashSet<&'a str>,
    ) -> bool {
        if visited.contains(phase_id) {
            return false;
        }
        if !visiting.insert(phase_id) {
            return true;
        }
        let cycle = phase_by_id[phase_id]
            .depends_on_phase_ids
            .iter()
            .any(|dependency| visit(dependency, phase_by_id, visiting, visited));
        visiting.remove(phase_id);
        visited.insert(phase_id);
        cycle
    }

    let mut visiting = HashSet::new();
    let mut visited = HashSet::new();
    if phase_by_id
        .keys()
        .any(|phase_id| visit(phase_id, &phase_by_id, &mut visiting, &mut visited))
    {
        return Err(TeamDefinitionError::validation(
            "Workflow dependency graph cannot contain a cycle",
        ));
    }
    Ok(())
}

pub fn team_definition_revision(definition: &TeamDefinition) -> String {
    let bytes = serde_json::to_vec(definition).unwrap_or_default();
    hex::encode(Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_draft() -> TeamDefinitionDraft {
        TeamDefinitionDraft {
            display_name: "软件交付团队".to_string(),
            description: "由技术负责人协调开发与质量专家完成软件交付。".to_string(),
            emblem: None,
            accent: None,
            category: "技术工程".to_string(),
            capability_tags: vec!["软件开发".to_string(), "质量保障".to_string()],
            scenario_eligibility: vec![TeamScenario::Code],
            lead_member_key: "lead".to_string(),
            members: vec![
                TeamMemberDraft {
                    client_key: "lead".to_string(),
                    display_name: "技术负责人".to_string(),
                    professional_role: "交付负责人".to_string(),
                    role: TeamMemberRole::Lead,
                    instructions: "拆解任务并协调成员。".to_string(),
                    output_responsibility: "汇总交付结论。".to_string(),
                    agent_id: Some("agentic".to_string()),
                    allowed_skill_keys: Vec::new(),
                    allowed_tool_names: Vec::new(),
                    is_readonly: false,
                    delegation_policy: None,
                },
                TeamMemberDraft {
                    client_key: "developer".to_string(),
                    display_name: "开发工程师".to_string(),
                    professional_role: "实现专家".to_string(),
                    role: TeamMemberRole::Specialist,
                    instructions: "根据任务独立完成实现建议。".to_string(),
                    output_responsibility: "提交实现方案。".to_string(),
                    agent_id: Some("code_researcher".to_string()),
                    allowed_skill_keys: Vec::new(),
                    allowed_tool_names: Vec::new(),
                    is_readonly: false,
                    delegation_policy: None,
                },
            ],
            workflows: vec![TeamWorkflowDraft {
                client_key: "delivery".to_string(),
                display_name: "软件交付".to_string(),
                trigger_description: "需要设计和实现软件功能时使用。".to_string(),
                phases: vec![TeamWorkflowPhaseDraft {
                    client_key: "implementation".to_string(),
                    display_name: "实现".to_string(),
                    kind: TeamWorkflowPhaseKind::Serial,
                    depends_on_phase_keys: Vec::new(),
                    assigned_member_keys: vec!["developer".to_string()],
                    expected_outputs: vec!["实现方案".to_string()],
                    completion_rule: "开发工程师返回可验证方案。".to_string(),
                }],
            }],
        }
    }

    #[test]
    fn materializes_stable_ids_and_parent_narrowing_policies() {
        let definition = materialize_team_definition(valid_draft(), TeamDefinitionLevel::User)
            .expect("valid definition");

        assert!(definition.team_definition_id.starts_with("custom-"));
        assert_eq!(definition.members.len(), 2);
        assert_eq!(
            definition.collaboration_policy,
            TeamCollaborationPolicy::LeadMediated
        );
        assert_eq!(
            definition.permission_policy,
            TeamPermissionPolicy::InheritParentIntersection
        );
        assert_eq!(
            definition
                .members
                .iter()
                .filter(|member| member.role == TeamMemberRole::Lead)
                .count(),
            1
        );
        assert_eq!(
            definition.members[0].delegation_policy,
            TeamMemberDelegationPolicy::Disabled
        );
        assert_eq!(
            definition.members[1].delegation_policy,
            TeamMemberDelegationPolicy::bounded_default()
        );
        validate_team_definition(&definition).expect("materialized definition remains valid");
    }

    #[test]
    fn validates_bounded_member_delegation_limits() {
        let mut definition = materialize_team_definition(valid_draft(), TeamDefinitionLevel::User)
            .expect("valid definition");
        definition.members[1].delegation_policy = TeamMemberDelegationPolicy::Bounded {
            max_worker_tasks: 32,
            max_parallel_workers: 8,
        };
        validate_team_definition(&definition).expect("upper bounds remain valid");

        definition.members[1].delegation_policy = TeamMemberDelegationPolicy::Bounded {
            max_worker_tasks: 0,
            max_parallel_workers: 1,
        };
        assert!(validate_team_definition(&definition).is_err());
        definition.members[1].delegation_policy = TeamMemberDelegationPolicy::Bounded {
            max_worker_tasks: 4,
            max_parallel_workers: 5,
        };
        assert!(validate_team_definition(&definition).is_err());
    }

    #[test]
    fn legacy_definition_defaults_non_lead_runtime_delegation_without_mutating_definition() {
        let mut definition = materialize_team_definition(valid_draft(), TeamDefinitionLevel::User)
            .expect("valid definition");
        definition.schema_version = LEGACY_TEAM_DEFINITION_SCHEMA_VERSION;
        definition.members[1].delegation_policy = TeamMemberDelegationPolicy::Disabled;
        validate_team_definition(&definition).expect("legacy disabled policy remains loadable");
        assert_eq!(
            effective_member_delegation_policy(&definition, &definition.members[1]),
            TeamMemberDelegationPolicy::bounded_default()
        );
        assert_eq!(
            definition.members[1].delegation_policy,
            TeamMemberDelegationPolicy::Disabled
        );
    }

    #[test]
    fn rejects_unknown_member_references_and_dependency_cycles() {
        let mut unknown_member = valid_draft();
        unknown_member.workflows[0].phases[0].assigned_member_keys = vec!["missing".to_string()];
        assert!(materialize_team_definition(unknown_member, TeamDefinitionLevel::User).is_err());

        let mut definition = materialize_team_definition(valid_draft(), TeamDefinitionLevel::User)
            .expect("valid definition");
        let first = definition.workflows[0].phases[0].clone();
        definition.workflows[0]
            .phases
            .push(TeamWorkflowPhaseDefinition {
                phase_id: generated_id("phase"),
                display_name: "复核".to_string(),
                kind: TeamWorkflowPhaseKind::Review,
                depends_on_phase_ids: vec![first.phase_id.clone()],
                assigned_member_ids: vec![definition.lead_member_id.clone()],
                expected_outputs: vec!["复核结论".to_string()],
                completion_rule: "主理人确认。".to_string(),
            });
        let second_id = definition.workflows[0].phases[1].phase_id.clone();
        definition.workflows[0].phases[0].depends_on_phase_ids = vec![second_id];
        assert!(validate_team_definition(&definition).is_err());
    }

    #[test]
    fn rejects_members_without_agent_references() {
        let mut missing_agent = valid_draft();
        missing_agent.members[0].agent_id = None;
        let error = materialize_team_definition(missing_agent, TeamDefinitionLevel::User)
            .expect_err("missing Agent ID must fail closed");
        assert_eq!(error.code, TeamDefinitionErrorCode::ValidationFailed);
        assert!(error.message.contains("non-empty Agent ID"));

        let mut blank_agent = valid_draft();
        blank_agent.members[1].agent_id = Some("   ".to_string());
        let error = materialize_team_definition(blank_agent, TeamDefinitionLevel::User)
            .expect_err("blank Agent ID must fail closed");
        assert_eq!(error.code, TeamDefinitionErrorCode::ValidationFailed);
        assert!(error.message.contains("non-empty Agent ID"));
    }

    #[test]
    fn revision_changes_with_definition_content() {
        let definition = materialize_team_definition(valid_draft(), TeamDefinitionLevel::Project)
            .expect("valid definition");
        let first = team_definition_revision(&definition);
        let mut changed = definition.clone();
        changed.description.push_str(" 已更新。");
        assert_ne!(first, team_definition_revision(&changed));
    }
}
