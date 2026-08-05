//! Trusted, read-only Team definitions shipped with Void.
//!
//! These definitions use the same validated contract and runtime as user and
//! installed Teams. They are kept in code so flagship products can bind a
//! durable Team without writing generated packages into the user's catalog.

use super::team_definitions::{
    TeamCollaborationPolicy, TeamDefinition, TeamDefinitionOrigin, TeamMemberDefinition,
    TeamMemberRole, TeamPermissionPolicy, TeamScenario, TeamWorkflowDefinition,
    TeamWorkflowPhaseDefinition, TeamWorkflowPhaseKind, TEAM_DEFINITION_SCHEMA_VERSION,
};

pub const AI_SHORT_DRAMA_TEAM_DEFINITION_ID: &str = "custom-00000000000000000000000000000001";
pub const AI_SHORT_DRAMA_LEAD_MEMBER_ID: &str = "member-00000000000000000000000000000001";
pub const AI_SHORT_DRAMA_SCRIPT_MEMBER_ID: &str = "member-00000000000000000000000000000002";
pub const AI_SHORT_DRAMA_ASSET_MEMBER_ID: &str = "member-00000000000000000000000000000003";
pub const AI_SHORT_DRAMA_STORYBOARD_MEMBER_ID: &str = "member-00000000000000000000000000000004";
pub const AI_SHORT_DRAMA_VIDEO_MEMBER_ID: &str = "member-00000000000000000000000000000005";
pub const AI_SHORT_DRAMA_EDITOR_MEMBER_ID: &str = "member-00000000000000000000000000000006";

const SCRIPT_WORKFLOW_ID: &str = "workflow-00000000000000000000000000000001";
const VISUAL_WORKFLOW_ID: &str = "workflow-00000000000000000000000000000002";
const FULL_PRODUCTION_WORKFLOW_ID: &str = "workflow-00000000000000000000000000000003";

fn member(
    member_id: &str,
    display_name: &str,
    professional_role: &str,
    role: TeamMemberRole,
    agent_id: &str,
    instructions: &str,
    output_responsibility: &str,
) -> TeamMemberDefinition {
    TeamMemberDefinition {
        member_id: member_id.to_string(),
        display_name: display_name.to_string(),
        professional_role: professional_role.to_string(),
        role,
        instructions: instructions.to_string(),
        output_responsibility: output_responsibility.to_string(),
        agent_id: Some(agent_id.to_string()),
        allowed_skill_keys: Vec::new(),
        allowed_tool_names: Vec::new(),
        permission_policy: TeamPermissionPolicy::InheritParentIntersection,
        is_readonly: false,
    }
}

fn phase(
    phase_id: &str,
    display_name: &str,
    depends_on_phase_ids: &[&str],
    assigned_member_id: &str,
    expected_outputs: &[&str],
) -> TeamWorkflowPhaseDefinition {
    TeamWorkflowPhaseDefinition {
        phase_id: phase_id.to_string(),
        display_name: display_name.to_string(),
        kind: TeamWorkflowPhaseKind::Serial,
        depends_on_phase_ids: depends_on_phase_ids
            .iter()
            .map(|id| (*id).to_string())
            .collect(),
        assigned_member_ids: vec![assigned_member_id.to_string()],
        expected_outputs: expected_outputs
            .iter()
            .map(|output| (*output).to_string())
            .collect(),
        completion_rule: "成员提交明确产物并向主理人回传，主理人不得代写。".to_string(),
    }
}

/// The flagship short-drama Team. Its members retain the existing Media stage
/// personas and ShortDramaProject tools; only orchestration and presentation
/// are unified with the reusable Team runtime.
pub fn ai_short_drama_team_definition() -> TeamDefinition {
    let script_phase = "phase-00000000000000000000000000000001";
    let asset_phase = "phase-00000000000000000000000000000002";
    let storyboard_phase = "phase-00000000000000000000000000000003";
    let video_phase = "phase-00000000000000000000000000000004";
    let editor_phase = "phase-00000000000000000000000000000005";

    TeamDefinition {
        schema_version: TEAM_DEFINITION_SCHEMA_VERSION,
        team_definition_id: AI_SHORT_DRAMA_TEAM_DEFINITION_ID.to_string(),
        display_name: "AI 短剧制作团队".to_string(),
        description: "由制片主理人协调剧本、资产、分镜、视频和成片成员，在短剧画布中完成全流程制作。".to_string(),
        emblem: Some("clapperboard".to_string()),
        accent: Some("violet".to_string()),
        category: "设计创意".to_string(),
        capability_tags: vec![
            "AI 短剧".to_string(),
            "影视制作".to_string(),
            "五阶段协作".to_string(),
        ],
        scenario_eligibility: vec![TeamScenario::Media],
        lead_member_id: AI_SHORT_DRAMA_LEAD_MEMBER_ID.to_string(),
        members: vec![
            member(
                AI_SHORT_DRAMA_LEAD_MEMBER_ID,
                "短剧制片人",
                "短剧制作主理人",
                TeamMemberRole::Lead,
                "Media",
                "你只负责理解需求、选择工作流、通过 Team 工具派发任务、协调进度和汇总成员结论。收到写剧本、改剧本或续写请求时，必须立即启动剧本工作流并交给剧本导演；不得自己代写任何成员的专业产物，不得用 Task 工具另建临时成员，不得轮询等待成员完成。调用 Team start 时，objective 必须直接对成员下达‘由你本人完成并交付实际产物’的执行任务；不得写成‘让剧本导演去做’‘再次派发’‘进入队列’或‘派发后立即返回’等主理人口吻，也不得把主理人的不等待规则复制给成员。短剧专用画布由宿主自动打开，你不得调用 ComputerUse、CallDeferredTool 或浏览器工具去打开、查找、点击或检查这个画布。派发后简短告知用户成员已在后台工作，并继续响应用户对画布、项目或其他任务的操作。完整制作按剧本、资产、分镜、视频、成片顺序推进，只有存在明确依赖时才等待前一阶段。",
                "确定制作目标、派发工作流、协调阶段依赖并汇总可追溯的团队结果。",
            ),
            member(
                AI_SHORT_DRAMA_SCRIPT_MEMBER_ID,
                "剧本导演",
                "短剧编剧与剧本导演",
                TeamMemberRole::Specialist,
                "ScriptAI",
                "独立完成短剧选题、人物、结构、场次、台词、改写和续写，并把结构化剧本写入短剧项目。",
                "交付可直接进入资产与分镜阶段的正式剧本。",
            ),
            member(
                AI_SHORT_DRAMA_ASSET_MEMBER_ID,
                "视觉资产导演",
                "角色与场景资产设计师",
                TeamMemberRole::Specialist,
                "AssetAI",
                "依据已确认剧本创建角色、场景、道具和视觉风格资产，保持跨镜头一致性。",
                "交付经过项目登记的角色、场景和道具资产。",
            ),
            member(
                AI_SHORT_DRAMA_STORYBOARD_MEMBER_ID,
                "分镜导演",
                "影视分镜设计师",
                TeamMemberRole::Specialist,
                "SplitAI",
                "把已确认剧本与资产拆成可拍摄的镜头、景别、机位、动作、对白和时长。",
                "交付可直接生成视频的结构化分镜表。",
            ),
            member(
                AI_SHORT_DRAMA_VIDEO_MEMBER_ID,
                "视频导演",
                "AI 视频生成导演",
                TeamMemberRole::Specialist,
                "VideoAI",
                "根据已确认分镜和视觉资产生成、检查并修订镜头视频，保持角色与场景连续性。",
                "交付与分镜一一对应的可用视频镜头。",
            ),
            member(
                AI_SHORT_DRAMA_EDITOR_MEMBER_ID,
                "成片导演",
                "剪辑与交付导演",
                TeamMemberRole::QualityGate,
                "EditorAI",
                "负责镜头编排、节奏、字幕、声音、质量检查和最终成片交付。",
                "交付通过质量检查的短剧预览与成片。",
            ),
        ],
        workflows: vec![
            TeamWorkflowDefinition {
                workflow_id: SCRIPT_WORKFLOW_ID.to_string(),
                display_name: "剧本创作与修改".to_string(),
                trigger_description: "用户要求写剧本、改剧本、续写、调整人物或对白时立即使用。".to_string(),
                phases: vec![phase(
                    "phase-00000000000000000000000000000006",
                    "剧本导演创作",
                    &[],
                    AI_SHORT_DRAMA_SCRIPT_MEMBER_ID,
                    &["结构化剧本", "人物与场次", "可执行的修订说明"],
                )],
            },
            TeamWorkflowDefinition {
                workflow_id: VISUAL_WORKFLOW_ID.to_string(),
                display_name: "视觉规划".to_string(),
                trigger_description: "用户要求生成角色资产、场景资产或分镜时使用。".to_string(),
                phases: vec![
                    phase(
                        "phase-00000000000000000000000000000007",
                        "视觉资产设计",
                        &[],
                        AI_SHORT_DRAMA_ASSET_MEMBER_ID,
                        &["角色资产", "场景资产", "视觉规范"],
                    ),
                    phase(
                        "phase-00000000000000000000000000000008",
                        "镜头分解",
                        &["phase-00000000000000000000000000000007"],
                        AI_SHORT_DRAMA_STORYBOARD_MEMBER_ID,
                        &["结构化分镜表"],
                    ),
                ],
            },
            TeamWorkflowDefinition {
                workflow_id: FULL_PRODUCTION_WORKFLOW_ID.to_string(),
                display_name: "短剧完整制作".to_string(),
                trigger_description: "用户要求从想法、故事或已有材料制作完整短剧时使用。".to_string(),
                phases: vec![
                    phase(script_phase, "剧本创作", &[], AI_SHORT_DRAMA_SCRIPT_MEMBER_ID, &["正式剧本"]),
                    phase(asset_phase, "资产设计", &[script_phase], AI_SHORT_DRAMA_ASSET_MEMBER_ID, &["视觉资产"]),
                    phase(storyboard_phase, "分镜设计", &[asset_phase], AI_SHORT_DRAMA_STORYBOARD_MEMBER_ID, &["分镜表"]),
                    phase(video_phase, "镜头生成", &[storyboard_phase], AI_SHORT_DRAMA_VIDEO_MEMBER_ID, &["视频镜头"]),
                    phase(editor_phase, "成片交付", &[video_phase], AI_SHORT_DRAMA_EDITOR_MEMBER_ID, &["短剧成片"]),
                ],
            },
        ],
        collaboration_policy: TeamCollaborationPolicy::LeadMediated,
        permission_policy: TeamPermissionPolicy::InheritParentIntersection,
        origin: TeamDefinitionOrigin::Installed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::team_definitions::{team_definition_revision, validate_team_definition};

    #[test]
    fn short_drama_team_is_valid_and_stable() {
        let definition = ai_short_drama_team_definition();
        validate_team_definition(&definition).expect("fixed Team must satisfy the public contract");
        assert_eq!(definition.members.len(), 6);
        assert_eq!(definition.workflows.len(), 3);
        let lead = definition
            .members
            .iter()
            .find(|member| member.member_id == definition.lead_member_id)
            .expect("fixed Team lead");
        assert!(lead.instructions.contains("必须立即启动剧本工作流"));
        assert!(lead.instructions.contains("不得用 Task 工具"));
        assert!(lead.instructions.contains("画布由宿主自动打开"));
        assert!(lead.instructions.contains("不得调用 ComputerUse"));
        assert!(lead.instructions.contains("继续响应用户"));
        assert!(lead.instructions.contains("由你本人完成并交付实际产物"));
        assert!(lead
            .instructions
            .contains("不得把主理人的不等待规则复制给成员"));
        assert_eq!(
            team_definition_revision(&definition),
            team_definition_revision(&ai_short_drama_team_definition())
        );
    }
}
