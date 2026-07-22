//! Short drama project runtime tool.
//!
//! Bridge for AI agents to inspect and update workspace-level
//! `.void/short-drama` project facts without depending on the Web UI service.

use crate::agentic::tools::framework::{
    Tool, ToolExposure, ToolResult, ToolUseContext, ValidationResult,
};
use crate::util::errors::{VoidError, VoidResult};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::fs;
use tokio::io::AsyncWriteExt;

const TOOL_NAME: &str = "ShortDramaProject";
const SOURCE: &str = "short-drama-runtime-tool";
const SHORT_DRAMA_DIR: &str = ".void/short-drama";
const MAX_DEFAULT_CHARS: usize = 12_000;
const MAX_LIMIT_CHARS: usize = 40_000;
const UNRESOLVED_REFERENCE_FIELDS: [(&str, &str); 3] = [
    ("unresolvedCharacterNames", "character"),
    ("unresolvedLocationNames", "location"),
    ("unresolvedPropNames", "prop"),
];

pub struct ShortDramaProjectTool;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShortDramaProjectToolInput {
    action: ShortDramaProjectAction,
    id_or_handle: Option<String>,
    index_name: Option<String>,
    query: Option<String>,
    max_chars: Option<usize>,
    stage: Option<String>,
    episode_id: Option<String>,
    artifact_type: Option<String>,
    artifact_id: Option<String>,
    artifact_handle: Option<String>,
    media_item_id: Option<String>,
    media_kind: Option<String>,
    media_status: Option<String>,
    selection_source: Option<String>,
    reference_kind: Option<String>,
    reference_plan_id: Option<String>,
    asset_id_or_handle: Option<String>,
    target_stage: Option<String>,
    reason: Option<String>,
    suggestion: Option<String>,
    resolution: Option<String>,
    user_instruction: Option<String>,
    source_actor: Option<String>,
    source_session_id: Option<String>,
    agent_role: Option<String>,
    reference_issue: Option<Value>,
    patch: Option<Value>,
    title: Option<String>,
    summary: Option<String>,
    script_content: Option<String>,
    overwrite_policy: Option<String>,
    status: Option<String>,
    run_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum ShortDramaProjectAction {
    GetAwareness,
    ListArtifacts,
    ListMedia,
    ValidateIntegrity,
    ReadArtifact,
    ReadScript,
    ReadScriptSegment,
    ReadIndex,
    Search,
    SetFocus,
    RequestChange,
    ListChangeRequests,
    UpdateChangeRequestStatus,
    BindStoryboardReferenceAsset,
    UpsertStoryboardReferencePlan,
    LinkStoryboardReferencePlan,
    CreateAttempt,
    UpdateArtifactPrompt,
    UpsertAssetArtifact,
    UpsertStageArtifact,
    GetContextPackage,
    InitializeFromScript,
}

impl Default for ShortDramaProjectTool {
    fn default() -> Self {
        Self::new()
    }
}

impl ShortDramaProjectTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for ShortDramaProjectTool {
    fn name(&self) -> &str {
        TOOL_NAME
    }

    async fn description(&self) -> VoidResult<String> {
        Ok(r#"Inspect and update the current workspace's AI short drama project through the stable `.void/short-drama` project facts.

Use this before answering or editing short-drama work when the user refers to the AI short drama panel, script, assets, storyboards, videos, post-production outputs, or artifact handles.

Actions:
- get_awareness: summarize whether the workspace has a short drama project and which fact/index files exist.
- list_artifacts: list artifacts from `.void/short-drama/artifacts/*.json`.
- list_media: list low-context media summaries derived from artifact and asset metadata.
- validate_integrity: report project metadata integrity issues such as artifacts referencing missing assets.
- read_artifact: read one artifact by `id_or_handle`.
- read_script: read `.void/short-drama/script.md`.
- read_script_segment: read low-context script segments from `indexes/script-segment-index.json` by id/handle, episode, or query.
- read_index: read one derived index by `index_name`, e.g. `artifact-index.json`.
- search: low-context text search across manifest, script, artifact files, and index files.
- set_focus: persist the current right-panel focus to `.void/short-drama/focus.json`.
- request_change: append a cross-stage change request to `.void/short-drama/change-requests.jsonl`.
- list_change_requests: read queued cross-stage change requests, optionally filtered by target stage, status, or source actor.
- update_change_request_status: update one queued cross-stage change request status by request id or target artifact handle.
- bind_storyboard_reference_asset: bind a StoryboardReferencePlan character/location/prop placeholder to a real asset anchor.
- upsert_storyboard_reference_plan: let ScriptAI or MainAI create/update a shot-level StoryboardReferencePlan in manifest.
- link_storyboard_reference_plan: project a StoryboardReferencePlan's script/assets into a storyboard artifact's references.
- create_attempt: append an artifact generation attempt sidecar and project it into the artifact JSON.
- update_artifact_prompt: merge a prompt patch into an artifact, create a revision sidecar, and increment revisionCount.
- upsert_asset_artifact: let AssetAI or MainAI create/update a character/location/prop asset anchor, including prompt and mediaReference metadata for the right-side assets page.
- upsert_stage_artifact: let SplitAI, VideoAI, EditorAI, or MainAI create/update a stage-owned storyboard/video/post artifact with prompt, references, status, and mediaReference metadata.
- get_context_package: build an explainable low-context package for a stage specialist agent from focus, references, assets, script segments, and storyboard plans.
- initialize_from_script: create the workspace short drama project from script content, write the project facts, focus, and bootstrap indexes.

Write actions are intentionally narrow: they only update project metadata, sidecars, prompts, attempts, revisions, and focus state. They never write media files or bypass artifact id/handle lookup."#.to_string())
    }

    fn short_description(&self) -> String {
        "Access to workspace AI short drama project facts, focus, change requests, attempts, and prompt revisions.".to_string()
    }

    fn default_exposure(&self) -> ToolExposure {
        ToolExposure::Collapsed
    }

    fn is_readonly(&self) -> bool {
        false
    }

    fn needs_permissions(&self, input: Option<&Value>) -> bool {
        short_drama_input_is_write_action(input)
    }

    fn is_concurrency_safe(&self, input: Option<&Value>) -> bool {
        !short_drama_input_is_write_action(input)
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "get_awareness",
                        "list_artifacts",
                        "list_media",
                        "validate_integrity",
                        "read_artifact",
                        "read_script",
                        "read_script_segment",
                        "read_index",
                        "search",
                        "set_focus",
                        "request_change",
                        "list_change_requests",
                        "update_change_request_status",
                        "bind_storyboard_reference_asset",
                        "upsert_storyboard_reference_plan",
                        "link_storyboard_reference_plan",
                        "create_attempt",
                        "update_artifact_prompt",
                        "upsert_asset_artifact",
                        "upsert_stage_artifact",
                        "get_context_package",
                        "initialize_from_script"
                    ],
                    "description": "Short drama project operation to perform."
                },
                "idOrHandle": {
                    "type": "string",
                    "description": "Artifact id/handle/display name for read_artifact, script segment id/handle for read_script_segment, or change request id/target artifact handle."
                },
                "indexName": {
                    "type": "string",
                    "description": "Index file under .void/short-drama/indexes, for example artifact-index.json."
                },
                "query": {
                    "type": "string",
                    "description": "Text query for search or read_script_segment."
                },
                "maxChars": {
                    "type": "integer",
                    "description": "Maximum characters to return for content-heavy actions."
                },
                "stage": {
                    "type": "string",
                    "description": "Current short drama stage for set_focus, stage filter for list_artifacts/search, or target stage for upsert_stage_artifact."
                },
                "episodeId": {
                    "type": "string",
                    "description": "Current episode id for set_focus/write context, an episode filter for list_artifacts/search, or a script segment filter for read_script_segment."
                },
                "artifactType": {
                    "type": "string",
                    "description": "Artifact type filter for list_artifacts/search, for example character, location, prop, storyboard, video, final."
                },
                "artifactId": {
                    "type": "string",
                    "description": "Current artifact id for set_focus."
                },
                "artifactHandle": {
                    "type": "string",
                    "description": "Current artifact handle for set_focus."
                },
                "mediaItemId": {
                    "type": "string",
                    "description": "Current media item id for set_focus."
                },
                "mediaKind": {
                    "type": "string",
                    "description": "Media kind filter for list_media, for example image or video."
                },
                "mediaStatus": {
                    "type": "string",
                    "description": "Media status filter for list_media, for example ready, missing, generating, or error."
                },
                "selectionSource": {
                    "type": "string",
                    "description": "Where the focus selection came from, for example right-panel."
                },
                "referenceKind": {
                    "type": "string",
                    "enum": ["character", "location", "prop"],
                    "description": "Storyboard reference placeholder kind for bind_storyboard_reference_asset."
                },
                "referencePlanId": {
                    "type": "string",
                    "description": "StoryboardReferencePlan id for upsert_storyboard_reference_plan or link_storyboard_reference_plan."
                },
                "assetIdOrHandle": {
                    "type": "string",
                    "description": "Asset id/handle/display name to bind to a storyboard reference plan."
                },
                "targetStage": {
                    "type": "string",
                    "description": "Target stage for request_change."
                },
                "reason": {
                    "type": "string",
                    "description": "Reason for request_change or update_artifact_prompt."
                },
                "suggestion": {
                    "type": "string",
                    "description": "Suggested fix for request_change."
                },
                "resolution": {
                    "type": "string",
                    "description": "Resolution note for update_change_request_status."
                },
                "userInstruction": {
                    "type": "string",
                    "description": "User instruction that caused the attempt or prompt revision."
                },
                "sourceActor": {
                    "type": "string",
                    "description": "Agent or actor creating the write, or a source actor filter for list_change_requests."
                },
                "agentRole": {
                    "type": "string",
                    "description": "Specialist agent role for get_context_package, for example SplitAI or VideoAI."
                },
                "patch": {
                    "type": "object",
                    "description": "Prompt/artifact patch for update_artifact_prompt, upsert_asset_artifact, upsert_stage_artifact, or StoryboardReferencePlan fields for upsert_storyboard_reference_plan."
                },
                "title": {
                    "type": "string",
                    "description": "Project title for initialize_from_script, asset title for upsert_asset_artifact, or artifact title for upsert_stage_artifact."
                },
                "summary": {
                    "type": "string",
                    "description": "Asset or stage artifact summary for upsert_asset_artifact/upsert_stage_artifact."
                },
                "scriptContent": {
                    "type": "string",
                    "description": "Markdown or plain text script content for initialize_from_script."
                },
                "overwritePolicy": {
                    "type": "string",
                    "enum": ["deny", "require_confirmation", "create_revision"],
                    "description": "How initialize_from_script handles an existing project. The default is deny."
                },
                "status": {
                    "type": "string",
                    "description": "Attempt status for create_attempt, artifact status filter for list_artifacts/search, or target request status for update_change_request_status."
                },
                "runId": {
                    "type": "string",
                    "description": "External generation run id for create_attempt."
                },
                "sourceSessionId": {
                    "type": "string",
                    "description": "Persistent subagent session id that owns a create_attempt long-running task."
                }
            },
            "required": ["action"],
            "additionalProperties": false
        })
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        match serde_json::from_value::<ShortDramaProjectToolInput>(input.clone()) {
            Ok(parsed) => {
                if parsed.action == ShortDramaProjectAction::ReadArtifact
                    && parsed
                        .id_or_handle
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some("idOrHandle is required for read_artifact.".to_string()),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::ReadIndex
                    && parsed
                        .index_name
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some("indexName is required for read_index.".to_string()),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::Search
                    && parsed
                        .query
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some("query is required for search.".to_string()),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::ReadScriptSegment
                    && parsed
                        .id_or_handle
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                    && parsed
                        .episode_id
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                    && parsed
                        .query
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "idOrHandle, episodeId, or query is required for read_script_segment."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::SetFocus
                    && parsed
                        .stage
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some("stage is required for set_focus.".to_string()),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::RequestChange
                    && parsed
                        .target_stage
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some("targetStage is required for request_change.".to_string()),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::RequestChange
                    && parsed
                        .reason
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some("reason is required for request_change.".to_string()),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::RequestChange
                    && parsed
                        .suggestion
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some("suggestion is required for request_change.".to_string()),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpdateChangeRequestStatus
                    && parsed
                        .id_or_handle
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "idOrHandle is required for update_change_request_status.".to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpdateChangeRequestStatus
                    && parsed
                        .status
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "status is required for update_change_request_status.".to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::BindStoryboardReferenceAsset
                    && parsed
                        .id_or_handle
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "idOrHandle is required for bind_storyboard_reference_asset."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::BindStoryboardReferenceAsset
                    && parsed
                        .reference_kind
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "referenceKind is required for bind_storyboard_reference_asset."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::BindStoryboardReferenceAsset
                    && parsed
                        .asset_id_or_handle
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "assetIdOrHandle is required for bind_storyboard_reference_asset."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpsertStoryboardReferencePlan
                    && parsed
                        .reference_plan_id
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "referencePlanId is required for upsert_storyboard_reference_plan."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpsertStoryboardReferencePlan
                    && !parsed.patch.as_ref().is_some_and(Value::is_object)
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "object patch is required for upsert_storyboard_reference_plan."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::LinkStoryboardReferencePlan
                    && parsed
                        .id_or_handle
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "idOrHandle is required for link_storyboard_reference_plan."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::LinkStoryboardReferencePlan
                    && parsed
                        .reference_plan_id
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "referencePlanId is required for link_storyboard_reference_plan."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::CreateAttempt
                    && parsed
                        .id_or_handle
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some("idOrHandle is required for create_attempt.".to_string()),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::CreateAttempt
                    && parsed
                        .user_instruction
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "userInstruction is required for create_attempt.".to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpdateArtifactPrompt
                    && parsed
                        .id_or_handle
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "idOrHandle is required for update_artifact_prompt.".to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpdateArtifactPrompt
                    && !parsed.patch.as_ref().is_some_and(Value::is_object)
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "object patch is required for update_artifact_prompt.".to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpdateArtifactPrompt
                    && parsed
                        .reason
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some("reason is required for update_artifact_prompt.".to_string()),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpdateArtifactPrompt
                    && parsed
                        .user_instruction
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "userInstruction is required for update_artifact_prompt.".to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpsertAssetArtifact
                    && normalize_asset_artifact_type(parsed.artifact_type.as_deref()).is_none()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "artifactType must be character, location, or prop for upsert_asset_artifact."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpsertAssetArtifact
                    && parsed
                        .title
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                    && parsed
                        .artifact_handle
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                    && parsed
                        .artifact_id
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "title, artifactHandle, or artifactId is required for upsert_asset_artifact."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpsertStageArtifact
                    && normalize_stage_artifact_type(
                        parsed.stage.as_deref(),
                        parsed.artifact_type.as_deref(),
                    )
                    .is_none()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "stage must be storyboards, video, or post with a compatible artifactType for upsert_stage_artifact."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::UpsertStageArtifact
                    && parsed
                        .title
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                    && parsed
                        .artifact_handle
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                    && parsed
                        .artifact_id
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "title, artifactHandle, or artifactId is required for upsert_stage_artifact."
                                .to_string(),
                        ),
                        error_code: None,
                        meta: None,
                    };
                }
                if parsed.action == ShortDramaProjectAction::InitializeFromScript
                    && parsed
                        .script_content
                        .as_deref()
                        .unwrap_or_default()
                        .trim()
                        .is_empty()
                {
                    return ValidationResult {
                        result: false,
                        message: Some(
                            "scriptContent is required for initialize_from_script.".to_string(),
                        ),
                        error_code: None,
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
            Err(error) => ValidationResult {
                result: false,
                message: Some(format!("Invalid ShortDramaProject input: {error}")),
                error_code: None,
                meta: None,
            },
        }
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        let input = serde_json::from_value::<ShortDramaProjectToolInput>(input.clone()).map_err(
            |error| VoidError::validation(format!("Invalid ShortDramaProject input: {error}")),
        )?;

        let data = call_short_drama_project_tool(input, context).await?;
        let result_for_assistant = render_short_drama_result(&data);

        Ok(vec![ToolResult::Result {
            data,
            result_for_assistant: Some(result_for_assistant),
            image_attachments: None,
        }])
    }
}

async fn call_short_drama_project_tool(
    input: ShortDramaProjectToolInput,
    context: &ToolUseContext,
) -> VoidResult<Value> {
    let action = input.action;
    let Some(workspace_root) = context.workspace_root() else {
        return Ok(json!({
            "status": "no_workspace",
            "source": SOURCE,
            "error": {
                "code": "missing_workspace",
                "message": "Short drama project inspection requires a workspace."
            }
        }));
    };

    if context.is_remote() {
        return Ok(json!({
            "status": "unsupported",
            "source": SOURCE,
            "workspaceRoot": workspace_root,
            "error": {
                "code": "remote_workspace",
                "message": "Short drama runtime tool does not support remote workspaces yet."
            }
        }));
    }

    let project_dir = workspace_root.join(SHORT_DRAMA_DIR);
    if !path_exists(&project_dir).await {
        if input.action == ShortDramaProjectAction::InitializeFromScript {
            let data = initialize_from_script(&project_dir, input).await?;
            return Ok(with_workspace_metadata(
                data,
                workspace_root,
                &project_dir,
                action,
                None,
            ));
        }
        return Ok(with_workspace_metadata(
            json!({
                "status": "no_project",
                "source": SOURCE,
                "projectState": "no_project",
                "projectPath": project_dir,
                "schemaKind": "missing",
                "manifestVersion": Value::Null,
                "missing": [
                    "manifest.json",
                    "script.md",
                    "indexes/script-segment-index.json",
                    "indexes/artifact-index.json",
                    "indexes/media-index.json",
                    "indexes/search-index.json"
                ],
                "recommendedNextAction": "initialize_from_script",
                "stageAgentBindings": stage_agent_bindings_state_unbound(&project_dir)
            }),
            workspace_root,
            &project_dir,
            action,
            None,
        ));
    }

    let schema_metadata = detect_manifest_schema_metadata(&project_dir.join("manifest.json")).await;
    let data = match input.action {
        ShortDramaProjectAction::GetAwareness => get_awareness(&project_dir).await,
        ShortDramaProjectAction::InitializeFromScript => {
            initialize_from_script(&project_dir, input).await
        }
        ShortDramaProjectAction::ListArtifacts => list_artifacts(&project_dir, input).await,
        ShortDramaProjectAction::ListMedia => list_media(&project_dir, input).await,
        ShortDramaProjectAction::ValidateIntegrity => validate_integrity(&project_dir).await,
        ShortDramaProjectAction::ReadArtifact => {
            read_artifact(
                &project_dir,
                input.id_or_handle.unwrap_or_default(),
                input.max_chars,
            )
            .await
        }
        ShortDramaProjectAction::ReadScript => {
            if let Some(denied) = deny_full_script_read_actor(&input) {
                Ok(denied)
            } else {
                read_script(&project_dir, input.max_chars).await
            }
        }
        ShortDramaProjectAction::ReadScriptSegment => {
            read_script_segment(&project_dir, input).await
        }
        ShortDramaProjectAction::ReadIndex => {
            read_index(
                &project_dir,
                input.index_name.unwrap_or_default(),
                input.max_chars,
            )
            .await
        }
        ShortDramaProjectAction::Search => search_project(&project_dir, input).await,
        ShortDramaProjectAction::SetFocus => set_focus(&project_dir, input).await,
        ShortDramaProjectAction::RequestChange => request_change(&project_dir, input).await,
        ShortDramaProjectAction::ListChangeRequests => {
            list_change_requests(&project_dir, input).await
        }
        ShortDramaProjectAction::UpdateChangeRequestStatus => {
            update_change_request_status(&project_dir, input).await
        }
        ShortDramaProjectAction::BindStoryboardReferenceAsset => {
            bind_storyboard_reference_asset(&project_dir, input).await
        }
        ShortDramaProjectAction::UpsertStoryboardReferencePlan => {
            upsert_storyboard_reference_plan(&project_dir, input).await
        }
        ShortDramaProjectAction::LinkStoryboardReferencePlan => {
            link_storyboard_reference_plan(&project_dir, input).await
        }
        ShortDramaProjectAction::CreateAttempt => create_attempt(&project_dir, input).await,
        ShortDramaProjectAction::UpdateArtifactPrompt => {
            update_artifact_prompt(&project_dir, input).await
        }
        ShortDramaProjectAction::UpsertAssetArtifact => {
            upsert_asset_artifact(&project_dir, input).await
        }
        ShortDramaProjectAction::UpsertStageArtifact => {
            upsert_stage_artifact(&project_dir, input).await
        }
        ShortDramaProjectAction::GetContextPackage => {
            get_context_package(&project_dir, input).await
        }
    }?;

    Ok(with_workspace_metadata(
        data,
        workspace_root,
        &project_dir,
        action,
        Some(schema_metadata),
    ))
}

fn with_workspace_metadata(
    mut data: Value,
    workspace_root: &Path,
    project_dir: &Path,
    action: ShortDramaProjectAction,
    schema_metadata: Option<ManifestSchemaMetadata>,
) -> Value {
    if let Value::Object(map) = &mut data {
        map.entry("workspaceRoot".to_string())
            .or_insert_with(|| json!(workspace_root));
        map.entry("projectPath".to_string())
            .or_insert_with(|| json!(project_dir));
        if let Some(metadata) = schema_metadata {
            map.entry("schemaKind".to_string())
                .or_insert_with(|| json!(metadata.schema_kind));
            map.entry("manifestVersion".to_string())
                .or_insert(metadata.manifest_version);
        }

        if let Some(event_action) = short_drama_project_changed_action(action, map) {
            let project_state = short_drama_project_changed_state(map);
            let schema_kind = map
                .get("schemaKind")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            map.entry("shortDramaProjectChanged".to_string())
                .or_insert_with(|| {
                    json!({
                        "workspaceRoot": workspace_root,
                        "projectPath": project_dir,
                        "action": event_action,
                        "projectState": project_state,
                        "schemaKind": schema_kind,
                        "source": "ShortDramaProject"
                    })
                });
        }
    }

    data
}

fn short_drama_project_changed_action(
    action: ShortDramaProjectAction,
    map: &Map<String, Value>,
) -> Option<&'static str> {
    let status = map
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !matches!(status, "ready" | "indexed") {
        return None;
    }

    match action {
        ShortDramaProjectAction::InitializeFromScript => Some("initialize_from_script"),
        ShortDramaProjectAction::SetFocus => Some("set_focus"),
        ShortDramaProjectAction::UpdateArtifactPrompt
        | ShortDramaProjectAction::CreateAttempt
        | ShortDramaProjectAction::UpsertAssetArtifact
        | ShortDramaProjectAction::UpsertStageArtifact
        | ShortDramaProjectAction::BindStoryboardReferenceAsset
        | ShortDramaProjectAction::UpsertStoryboardReferencePlan
        | ShortDramaProjectAction::LinkStoryboardReferencePlan => Some("update_artifact"),
        ShortDramaProjectAction::RequestChange
        | ShortDramaProjectAction::UpdateChangeRequestStatus => Some("change_request"),
        _ => None,
    }
}

fn short_drama_project_changed_state(map: &Map<String, Value>) -> &'static str {
    if let Some(project_state) = map.get("projectState").and_then(Value::as_str) {
        return match project_state {
            "no_project" => "no_project",
            "empty" => "empty",
            "script_ready" => "script_ready",
            "indexed" => "indexed",
            "ready" => "ready",
            "error" => "error",
            _ => "ready",
        };
    }

    match map
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default()
    {
        "indexed" => "indexed",
        "error" => "error",
        _ => "ready",
    }
}

struct ManifestSchemaMetadata {
    schema_kind: &'static str,
    manifest_version: Value,
}

async fn detect_manifest_schema_metadata(manifest_path: &Path) -> ManifestSchemaMetadata {
    if !path_exists(manifest_path).await {
        return ManifestSchemaMetadata {
            schema_kind: "missing",
            manifest_version: Value::Null,
        };
    }

    let Ok(content) = fs::read_to_string(manifest_path).await else {
        return ManifestSchemaMetadata {
            schema_kind: "unreadable",
            manifest_version: Value::Null,
        };
    };
    let Ok(manifest) = serde_json::from_str::<Value>(&content) else {
        return ManifestSchemaMetadata {
            schema_kind: "manifest-corrupt",
            manifest_version: Value::Null,
        };
    };
    let manifest_version = manifest
        .get("manifestVersion")
        .cloned()
        .unwrap_or(Value::Null);
    let schema_kind = if manifest.get("project").is_some()
        && manifest.get("indexVersions").is_some()
        && manifest.get("manifestVersion").is_some()
    {
        "ui-envelope-v1"
    } else if manifest.get("episodes").is_some()
        && manifest.get("stages").is_some()
        && manifest.get("manifestVersion").is_some()
    {
        "runtime-flat-v1"
    } else {
        "unknown"
    };

    ManifestSchemaMetadata {
        schema_kind,
        manifest_version,
    }
}

async fn get_awareness(project_dir: &Path) -> VoidResult<Value> {
    let manifest_path = project_dir.join("manifest.json");
    let script_path = project_dir.join("script.md");
    let artifacts_dir = project_dir.join("artifacts");
    let assets_dir = project_dir.join("assets");
    let indexes_dir = project_dir.join("indexes");
    let manifest_exists = path_exists(&manifest_path).await;
    let script_exists = path_exists(&script_path).await;
    let script_index_exists = path_exists(&indexes_dir.join("script-segment-index.json")).await;
    let schema_metadata = detect_manifest_schema_metadata(&manifest_path).await;
    let stage_agent_bindings = read_stage_agent_bindings_state(project_dir).await;
    let project_state = if !manifest_exists && !script_exists {
        "empty"
    } else if manifest_exists && script_exists && script_index_exists {
        "indexed"
    } else if manifest_exists && script_exists {
        "script_ready"
    } else {
        "empty"
    };
    let recommended_next_action = match project_state {
        "empty" => "initialize_from_script",
        "script_ready" => "rebuild_indexes",
        _ => "get_context_package",
    };
    let mut missing = Vec::new();
    if !manifest_exists {
        missing.push("manifest.json");
    }
    if !script_exists {
        missing.push("script.md");
    }
    for index_name in [
        "script-segment-index.json",
        "artifact-index.json",
        "media-index.json",
        "search-index.json",
    ] {
        if !path_exists(&indexes_dir.join(index_name)).await {
            missing.push(match index_name {
                "script-segment-index.json" => "indexes/script-segment-index.json",
                "artifact-index.json" => "indexes/artifact-index.json",
                "media-index.json" => "indexes/media-index.json",
                _ => "indexes/search-index.json",
            });
        }
    }

    Ok(json!({
        "status": if manifest_exists { "ready" } else { project_state },
        "source": SOURCE,
        "projectState": project_state,
        "projectPath": project_dir,
        "schemaKind": schema_metadata.schema_kind,
        "manifestVersion": schema_metadata.manifest_version,
        "missing": missing,
        "recommendedNextAction": recommended_next_action,
        "manifest": file_state(&manifest_path).await?,
        "script": file_state(&script_path).await?,
        "artifacts": {
            "path": artifacts_dir,
            "count": count_json_files(&artifacts_dir).await?
        },
        "assets": {
            "path": assets_dir,
            "count": count_json_files(&assets_dir).await?
        },
        "indexes": {
            "path": indexes_dir,
            "files": list_file_names(&indexes_dir).await?
        },
        "stageAgentBindings": stage_agent_bindings
    }))
}

async fn read_stage_agent_bindings_state(project_dir: &Path) -> Value {
    let path = project_dir.join("sessions").join("stage-agents.json");
    if !path_exists(&path).await {
        return stage_agent_bindings_state_unbound(project_dir);
    }

    let raw = match fs::read_to_string(&path).await {
        Ok(raw) => raw,
        Err(error) => {
            return json!({
                "status": "error",
                "path": path,
                "error": {
                    "code": "binding_read_failed",
                    "message": error.to_string()
                }
            });
        }
    };
    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(parsed) => parsed,
        Err(error) => {
            return json!({
                "status": "error",
                "path": path,
                "error": {
                    "code": "binding_invalid",
                    "message": error.to_string()
                }
            });
        }
    };
    let bindings = short_drama_stage_agent_defaults()
        .iter()
        .map(|(stage, agent_name)| {
            let binding = parsed
                .get("bindings")
                .and_then(|bindings| bindings.get(*stage));
            let status = binding
                .and_then(|item| item.get("status"))
                .cloned()
                .unwrap_or_else(|| json!("unbound"));
            json!({
                "stage": stage,
                "agentName": binding
                    .and_then(|item| item.get("agentName"))
                    .cloned()
                    .unwrap_or_else(|| json!(agent_name)),
                "status": status,
                "childSessionId": binding
                    .and_then(|item| item.get("childSessionId"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "parentSessionId": binding
                    .and_then(|item| item.get("parentSessionId"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "workspaceRoot": binding
                    .and_then(|item| item.get("workspaceRoot"))
                    .cloned()
                    .unwrap_or(Value::Null),
                "error": binding
                    .and_then(|item| item.get("error"))
                    .cloned()
                    .unwrap_or(Value::Null)
            })
        })
        .collect::<Vec<_>>();

    json!({
        "status": "ready",
        "path": path,
        "schemaVersion": parsed.get("schemaVersion").cloned().unwrap_or(Value::Null),
        "workspaceRoot": parsed.get("workspaceRoot").cloned().unwrap_or(Value::Null),
        "bindings": bindings
    })
}

fn stage_agent_bindings_state_unbound(project_dir: &Path) -> Value {
    let path = project_dir.join("sessions").join("stage-agents.json");
    json!({
        "status": "unbound",
        "path": path,
        "bindings": short_drama_stage_agent_defaults()
            .iter()
            .map(|(stage, agent_name)| {
                json!({
                    "stage": stage,
                    "agentName": agent_name,
                    "status": "unbound",
                    "childSessionId": Value::Null,
                    "parentSessionId": Value::Null,
                    "workspaceRoot": Value::Null,
                    "error": Value::Null
                })
            })
            .collect::<Vec<_>>()
    })
}

fn short_drama_stage_agent_defaults() -> [(&'static str, &'static str); 5] {
    [
        ("script", "ScriptAI"),
        ("assets", "AssetAI"),
        ("storyboards", "SplitAI"),
        ("video", "VideoAI"),
        ("post", "EditorAI"),
    ]
}

async fn initialize_from_script(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    if let Some(denied) = deny_non_initialization_actor(&input) {
        return Ok(denied);
    }

    let manifest_path = project_dir.join("manifest.json");
    let script_path = project_dir.join("script.md");
    let overwrite_policy =
        trimmed_value(input.overwrite_policy.clone()).unwrap_or_else(|| "deny".to_string());
    if path_exists(&manifest_path).await || path_exists(&script_path).await {
        return Ok(json!({
            "status": "denied",
            "source": SOURCE,
            "error": {
                "code": "project_exists",
                "message": "A short drama project already exists. initialize_from_script only creates new projects; use a script revision or ChangeRequest flow before replacing the script."
            },
            "policy": {
                "action": "initialize_from_script",
                "overwritePolicy": overwrite_policy,
                "allowedAction": "update_artifact_prompt_or_request_change"
            }
        }));
    }

    let script_content = input.script_content.unwrap_or_default();
    let title = trimmed_value(input.title).unwrap_or_else(|| "AI Short Drama".to_string());
    let source_actor = trimmed_value(input.source_actor)
        .or_else(|| trimmed_value(input.agent_role))
        .unwrap_or_else(|| "MainAI".to_string());
    let user_instruction = trimmed_value(input.user_instruction)
        .unwrap_or_else(|| "Initialize short drama project from script.".to_string());
    let now = now_millis();
    let project_id = "short-drama-project";
    let episodes = parse_script_episodes(&script_content);
    let script_segments = create_script_segment_index(&script_content, &episodes);
    let script_artifacts =
        create_initialized_script_artifacts(project_id, &episodes, &source_actor, now);
    let manifest = create_initialized_manifest(
        project_id,
        &title,
        &episodes,
        &script_artifacts,
        &script_content,
        &source_actor,
        &user_instruction,
        now,
    );

    for dir in [
        "artifacts",
        "assets",
        "indexes",
        "media",
        "attempts",
        "revisions",
    ] {
        fs::create_dir_all(project_dir.join(dir))
            .await
            .map_err(|error| {
                VoidError::io(format!(
                    "Failed to create short drama initialization directory: {error}"
                ))
            })?;
    }
    fs::write(&script_path, &script_content)
        .await
        .map_err(|error| VoidError::io(format!("Failed to write short drama script: {error}")))?;
    write_json_pretty(&manifest_path, &manifest).await?;
    write_json_pretty(
        &project_dir.join("focus.json"),
        &json!({
            "status": "ready",
            "source": SOURCE,
            "activeStage": "script",
            "activeEpisodeId": episodes.first().map(|episode| episode.id.as_str()),
            "selectionSource": "initialize_from_script",
            "updatedAt": now
        }),
    )
    .await?;
    write_json_pretty(
        &project_dir
            .join("indexes")
            .join("script-segment-index.json"),
        &Value::Array(script_segments.clone()),
    )
    .await?;
    write_json_pretty(
        &project_dir.join("indexes").join("artifact-index.json"),
        &Value::Array(script_artifacts.clone()),
    )
    .await?;
    write_json_pretty(
        &project_dir.join("indexes").join("media-index.json"),
        &Value::Array(Vec::<Value>::new()),
    )
    .await?;
    write_json_pretty(
        &project_dir.join("indexes").join("search-index.json"),
        &create_bootstrap_search_index(&manifest, &script_content, &script_segments),
    )
    .await?;
    for artifact in &script_artifacts {
        let id = artifact
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("script-artifact");
        write_json_pretty(
            &project_dir
                .join("artifacts")
                .join(format!("{}.json", sanitize_file_stem(id))),
            artifact,
        )
        .await?;
    }
    append_json_line(
        &project_dir.join("audit-log.jsonl"),
        &json!({
            "id": format!("audit-initialize-{now}"),
            "action": "initialize_from_script",
            "sourceActor": source_actor,
            "userInstruction": user_instruction,
            "createdAt": now,
            "filesWritten": [
                "manifest.json",
                "script.md",
                "focus.json",
                "indexes/script-segment-index.json",
                "indexes/artifact-index.json",
                "indexes/media-index.json",
                "indexes/search-index.json"
            ]
        }),
    )
    .await?;
    if !path_exists(&project_dir.join("change-requests.jsonl")).await {
        fs::write(project_dir.join("change-requests.jsonl"), "")
            .await
            .map_err(|error| {
                VoidError::io(format!(
                    "Failed to initialize short drama change request log: {error}"
                ))
            })?;
    }

    Ok(json!({
        "status": "indexed",
        "source": SOURCE,
        "projectId": project_id,
        "schemaKind": "ui-envelope-v1",
        "manifestVersion": 1,
        "projectPath": project_dir,
        "scriptPath": script_path,
        "episodesDetected": episodes.len(),
        "filesWritten": [
            "manifest.json",
            "script.md",
            "focus.json",
            "indexes/script-segment-index.json",
            "indexes/artifact-index.json",
            "indexes/media-index.json",
            "indexes/search-index.json"
        ],
        "nextActions": [
            "read_script_segment",
            "get_context_package",
            "upsert_storyboard_reference_plan"
        ]
    }))
}

async fn list_artifacts(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    let filters = ArtifactFilters::from_input(&input);
    let artifacts = read_project_artifact_files(project_dir).await?;
    let summaries = artifacts
        .into_iter()
        .filter(|artifact| filters.matches(&artifact.value))
        .map(|artifact| {
            let value = artifact.value;
            json!({
                "fileName": artifact.file_name,
                "id": value.get("id").cloned().unwrap_or(Value::Null),
                "handle": value.get("handle").cloned().unwrap_or(Value::Null),
                "displayName": value.get("displayName").cloned().unwrap_or(Value::Null),
                "stage": value.get("stage").cloned().unwrap_or(Value::Null),
                "type": value.get("type").cloned().unwrap_or(Value::Null),
                "episodeId": value.get("episodeId").cloned().unwrap_or(Value::Null),
                "status": value.get("status").cloned().unwrap_or(Value::Null),
                "references": value.get("references").cloned().unwrap_or(Value::Null)
            })
        })
        .collect::<Vec<_>>();

    limited_json(
        json!({
            "status": "ready",
            "source": SOURCE,
            "filters": filters.to_json(),
            "artifacts": summaries
        }),
        input.max_chars,
    )
}

async fn list_media(project_dir: &Path, input: ShortDramaProjectToolInput) -> VoidResult<Value> {
    let filters = MediaFilters::from_input(&input);
    let artifacts = read_project_artifact_files(project_dir).await?;
    let media_items = artifacts
        .into_iter()
        .filter(|artifact| filters.artifact_matches(&artifact.value))
        .flat_map(|artifact| summarize_media_items_from_artifact(&artifact.value))
        .filter(|media_item| filters.media_matches(media_item))
        .collect::<Vec<_>>();

    limited_json(
        json!({
            "status": "ready",
            "source": SOURCE,
            "filters": filters.to_json(),
            "mediaItems": media_items
        }),
        input.max_chars,
    )
}

async fn validate_integrity(project_dir: &Path) -> VoidResult<Value> {
    let assets = read_artifact_files(&project_dir.join("assets")).await?;
    let asset_ids = assets
        .iter()
        .filter_map(|asset| asset.value.get("id").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<Vec<_>>();
    let script_segment_ids = read_script_segment_ids(project_dir).await?;
    let artifacts = read_artifact_files(&project_dir.join("artifacts")).await?;
    let mut issues = Vec::new();
    let manifest = read_json_file(&project_dir.join("manifest.json"))
        .await?
        .unwrap_or_else(|| json!({}));
    collect_storyboard_reference_plan_issues(&mut issues, &manifest);
    for artifact in artifacts {
        collect_missing_asset_reference_issues(&mut issues, &artifact.value, &asset_ids);
        collect_missing_script_segment_reference_issues(
            &mut issues,
            &artifact.value,
            &script_segment_ids,
        );
        collect_media_reference_issues(&mut issues, &artifact.value);
    }
    let integrity_status = if issues.is_empty() {
        "ok"
    } else {
        "issues_found"
    };

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "integrity": {
            "status": integrity_status,
            "issueCount": issues.len(),
            "issues": issues
        }
    }))
}

async fn read_artifact(
    project_dir: &Path,
    id_or_handle: String,
    max_chars: Option<usize>,
) -> VoidResult<Value> {
    let target = id_or_handle.trim().to_lowercase();
    let artifacts = read_project_artifact_files(project_dir).await?;
    for artifact in artifacts {
        if artifact_matches(&artifact.value, &target) {
            return limited_json(
                json!({
                    "status": "ready",
                    "source": SOURCE,
                    "fileName": artifact.file_name,
                    "artifact": artifact.value
                }),
                max_chars,
            );
        }
    }

    Ok(json!({
        "status": "error",
        "source": SOURCE,
        "error": {
            "code": "artifact_not_found",
            "message": "No short drama artifact matched idOrHandle."
        },
        "idOrHandle": id_or_handle
    }))
}

async fn read_script(project_dir: &Path, max_chars: Option<usize>) -> VoidResult<Value> {
    let script_path = project_dir.join("script.md");
    if !path_exists(&script_path).await {
        return Ok(json!({
            "status": "empty",
            "source": SOURCE,
            "reason": "script_missing",
            "path": script_path
        }));
    }

    let content = fs::read_to_string(&script_path)
        .await
        .map_err(|error| VoidError::io(format!("Failed to read short drama script: {error}")))?;
    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": script_path,
        "content": limit_string(&content, max_chars)
    }))
}

async fn read_script_segment(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    let index_path = project_dir
        .join("indexes")
        .join("script-segment-index.json");
    if !path_exists(&index_path).await {
        return Ok(json!({
            "status": "empty",
            "source": SOURCE,
            "reason": "script_segment_index_missing",
            "path": index_path,
            "filters": ScriptSegmentFilters::from_input(&input).to_json(),
            "scriptSegments": []
        }));
    }

    let Some(index) = read_json_file(&index_path).await? else {
        return Ok(json!({
            "status": "empty",
            "source": SOURCE,
            "reason": "script_segment_index_empty",
            "path": index_path,
            "filters": ScriptSegmentFilters::from_input(&input).to_json(),
            "scriptSegments": []
        }));
    };
    let filters = ScriptSegmentFilters::from_input(&input);
    let script_segments = index
        .as_array()
        .into_iter()
        .flatten()
        .filter(|segment| filters.matches(segment))
        .cloned()
        .collect::<Vec<_>>();

    limited_json(
        json!({
            "status": "ready",
            "source": SOURCE,
            "path": index_path,
            "filters": filters.to_json(),
            "scriptSegments": script_segments
        }),
        input.max_chars,
    )
}

async fn read_index(
    project_dir: &Path,
    index_name: String,
    max_chars: Option<usize>,
) -> VoidResult<Value> {
    let safe_name = index_name
        .trim()
        .trim_start_matches('/')
        .trim_start_matches('\\');
    if safe_name.contains("..") || safe_name.contains('/') || safe_name.contains('\\') {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "invalid_index_name",
                "message": "indexName must be a file name under .void/short-drama/indexes."
            }
        }));
    }

    let path = project_dir.join("indexes").join(safe_name);
    if !path_exists(&path).await {
        return Ok(json!({
            "status": "empty",
            "source": SOURCE,
            "reason": "index_missing",
            "path": path
        }));
    }

    let content = fs::read_to_string(&path)
        .await
        .map_err(|error| VoidError::io(format!("Failed to read short drama index: {error}")))?;
    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": path,
        "content": limit_string(&content, max_chars)
    }))
}

async fn search_project(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    let query = input
        .query
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let filters = ArtifactFilters::from_input(&input);
    let mut results = Vec::new();
    for (label, path) in searchable_files(project_dir).await? {
        let Ok(content) = fs::read_to_string(&path).await else {
            continue;
        };
        if !filters.is_empty() {
            if !(label.starts_with("artifacts/") || label.starts_with("assets/")) {
                continue;
            }
            if !serde_json::from_str::<Value>(&content)
                .map(|value| filters.matches(&value))
                .unwrap_or(false)
            {
                continue;
            }
        }
        let lower = content.to_lowercase();
        if let Some(position) = lower.find(&query) {
            results.push(json!({
                "label": label,
                "path": path,
                "snippet": snippet_around_match(&content, position, query.len())
            }));
        }
    }

    limited_json(
        json!({
            "status": "ready",
            "source": SOURCE,
            "query": query,
            "filters": filters.to_json(),
            "results": results
        }),
        input.max_chars,
    )
}

async fn set_focus(project_dir: &Path, input: ShortDramaProjectToolInput) -> VoidResult<Value> {
    fs::create_dir_all(project_dir).await.map_err(|error| {
        VoidError::io(format!(
            "Failed to create short drama project directory: {error}"
        ))
    })?;

    let focus = json!({
        "status": "ready",
        "source": SOURCE,
        "activeStage": trimmed_value(input.stage),
        "activeEpisodeId": trimmed_value(input.episode_id),
        "activeArtifactId": trimmed_value(input.artifact_id),
        "activeArtifactHandle": trimmed_value(input.artifact_handle),
        "activeMediaItemId": trimmed_value(input.media_item_id),
        "selectionSource": trimmed_value(input.selection_source).or_else(|| Some("runtimeTool".to_string())),
        "updatedAt": now_millis()
    });
    let path = project_dir.join("focus.json");
    write_json_pretty(&path, &focus).await?;

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": path,
        "focus": focus
    }))
}

async fn request_change(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    let focus = read_json_file(&project_dir.join("focus.json"))
        .await?
        .unwrap_or_else(|| json!({}));
    let target_artifact = match input.id_or_handle.as_deref() {
        Some(value) if !value.trim().is_empty() => find_artifact_file(project_dir, value).await?,
        _ => None,
    };
    let target_artifact_id = target_artifact
        .as_ref()
        .and_then(|artifact| artifact.value.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let target_artifact_handle = target_artifact
        .as_ref()
        .and_then(|artifact| artifact.value.get("handle"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let source_agent = trimmed_value(input.source_actor).unwrap_or_else(|| "unknown".to_string());
    let request = json!({
        "id": format!("change-request-{}", now_millis()),
        "status": "open",
        "source": SOURCE,
        "sourceActor": source_agent,
        "sourceAgent": source_agent,
        "targetStage": trimmed_value(input.target_stage).unwrap_or_default(),
        "targetArtifactId": target_artifact_id,
        "targetArtifactHandle": target_artifact_handle,
        "targetReferencePlan": trimmed_value(input.reference_plan_id),
        "reason": trimmed_value(input.reason).unwrap_or_default(),
        "suggestion": trimmed_value(input.suggestion).unwrap_or_default(),
        "referenceIssue": input.reference_issue.unwrap_or(Value::Null),
        "focus": focus,
        "createdAt": now_millis()
    });
    let path = project_dir.join("change-requests.jsonl");
    append_json_line(&path, &request).await?;

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": path,
        "changeRequest": request
    }))
}

async fn list_change_requests(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    let path = project_dir.join("change-requests.jsonl");
    if !path_exists(&path).await {
        return Ok(json!({
            "status": "empty",
            "source": SOURCE,
            "reason": "change_requests_missing",
            "path": path,
            "filters": ChangeRequestFilters::from_input(&input).to_json(),
            "changeRequests": []
        }));
    }

    let filters = ChangeRequestFilters::from_input(&input);
    let content = fs::read_to_string(&path).await.map_err(|error| {
        VoidError::io(format!(
            "Failed to read short drama change requests: {error}"
        ))
    })?;
    let mut skipped_invalid_lines = 0usize;
    let change_requests = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| match serde_json::from_str::<Value>(line) {
            Ok(value) => Some(value),
            Err(_) => {
                skipped_invalid_lines += 1;
                None
            }
        })
        .filter(|request| filters.matches(request))
        .collect::<Vec<_>>();

    limited_json(
        json!({
            "status": "ready",
            "source": SOURCE,
            "path": path,
            "filters": filters.to_json(),
            "skippedInvalidLines": skipped_invalid_lines,
            "changeRequests": change_requests
        }),
        input.max_chars,
    )
}

async fn update_change_request_status(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    let path = project_dir.join("change-requests.jsonl");
    if !path_exists(&path).await {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "change_requests_missing",
                "message": "No short drama change request queue exists."
            },
            "path": path
        }));
    }

    let target = input.id_or_handle.clone().unwrap_or_default();
    let target_normalized = target.trim().to_lowercase();
    let next_status = trimmed_value(input.status.clone()).unwrap_or_default();
    let updated_by =
        trimmed_value(input.source_actor.clone()).unwrap_or_else(|| "unknown".to_string());
    let resolution = trimmed_value(input.resolution.clone());
    let content = fs::read_to_string(&path).await.map_err(|error| {
        VoidError::io(format!(
            "Failed to read short drama change requests: {error}"
        ))
    })?;
    let mut updated_request = None;
    let mut lines = Vec::new();

    for raw_line in content.lines() {
        if raw_line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(raw_line) {
            Ok(mut request) => {
                if updated_request.is_none()
                    && change_request_matches_target(&request, &target_normalized)
                {
                    set_object_value(&mut request, "status", json!(next_status));
                    set_object_value(&mut request, "updatedAt", json!(now_millis()));
                    set_object_value(&mut request, "updatedBy", json!(updated_by));
                    if let Some(resolution) = &resolution {
                        set_object_value(&mut request, "resolution", json!(resolution));
                    }
                    updated_request = Some(request.clone());
                }
                lines.push(serde_json::to_string(&request).map_err(|error| {
                    VoidError::tool(format!(
                        "Failed to render short drama change request: {error}"
                    ))
                })?);
            }
            Err(_) => lines.push(raw_line.to_string()),
        }
    }

    let Some(updated_request) = updated_request else {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "change_request_not_found",
                "message": "No short drama change request matched idOrHandle."
            },
            "idOrHandle": target
        }));
    };

    fs::write(&path, format!("{}\n", lines.join("\n")))
        .await
        .map_err(|error| {
            VoidError::io(format!(
                "Failed to write short drama change requests: {error}"
            ))
        })?;

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": path,
        "changeRequest": updated_request
    }))
}

async fn bind_storyboard_reference_asset(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    if let Some(denied) = deny_non_asset_actor(
        &input,
        "bind_storyboard_reference_asset",
        "Only AssetAI or MainAI can bind storyboard reference placeholders to asset anchors. Use request_change instead.",
    ) {
        return Ok(denied);
    }

    let plan_id = input.id_or_handle.clone().unwrap_or_default();
    let Some(reference_fields) =
        StoryboardReferenceFields::from_kind(input.reference_kind.as_deref().unwrap_or_default())
    else {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "invalid_reference_kind",
                "message": "referenceKind must be character, location, or prop."
            }
        }));
    };
    let asset_id_or_handle = input.asset_id_or_handle.clone().unwrap_or_default();
    let Some(mut asset) = find_artifact_file(project_dir, &asset_id_or_handle).await? else {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "asset_not_found",
                "message": "No short drama asset matched assetIdOrHandle."
            },
            "assetIdOrHandle": asset_id_or_handle
        }));
    };
    if !asset
        .value
        .get("stage")
        .and_then(Value::as_str)
        .is_some_and(|stage| stage == "assets")
    {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "asset_not_found",
                "message": "assetIdOrHandle must resolve to an assets-stage artifact."
            },
            "assetIdOrHandle": asset_id_or_handle
        }));
    }
    let Some(asset_id) = artifact_id(&asset.value) else {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "asset_missing_id",
                "message": "Resolved asset is missing an id."
            },
            "assetIdOrHandle": asset_id_or_handle
        }));
    };

    let manifest_path = project_dir.join("manifest.json");
    let Some(mut manifest) = read_json_file(&manifest_path).await? else {
        return Ok(json!({
            "status": "empty",
            "source": SOURCE,
            "reason": "manifest_missing",
            "path": manifest_path
        }));
    };

    let match_terms = asset_reference_match_terms(&asset.value);
    let Some(plan) = manifest
        .get_mut("storyboardReferencePlans")
        .and_then(Value::as_array_mut)
        .and_then(|plans| {
            plans
                .iter_mut()
                .find(|plan| plan.get("id").and_then(Value::as_str) == Some(plan_id.trim()))
        })
    else {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "storyboard_reference_plan_not_found",
                "message": "No StoryboardReferencePlan matched idOrHandle."
            },
            "idOrHandle": plan_id
        }));
    };

    add_unique_string_to_array(plan, reference_fields.asset_ids_field, &asset_id);
    remove_matching_strings_from_array(plan, reference_fields.unresolved_names_field, &match_terms);
    set_object_value(
        plan,
        "updatedBy",
        json!(trimmed_value(input.source_actor).unwrap_or_else(|| "unknown".to_string())),
    );
    set_object_value(plan, "updatedAt", json!(now_millis()));
    let updated_plan = plan.clone();

    write_json_pretty(&manifest_path, &manifest).await?;
    upsert_asset_used_by(&mut asset.value, &updated_plan, reference_fields.kind);
    write_json_pretty(&asset.path, &asset.value).await?;

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": manifest_path,
        "binding": {
            "planId": plan_id.trim(),
            "referenceKind": reference_fields.kind,
            "assetId": asset_id,
            "assetHandle": asset.value.get("handle").cloned().unwrap_or(Value::Null)
        },
        "storyboardReferencePlan": updated_plan,
        "asset": summarize_context_artifact(&asset.value)
    }))
}

async fn upsert_storyboard_reference_plan(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    if let Some(denied) = deny_non_script_plan_actor(&input) {
        return Ok(denied);
    }

    let reference_plan_id = input.reference_plan_id.clone().unwrap_or_default();
    let patch = input.patch.clone().unwrap_or_else(|| json!({}));
    let manifest_path = project_dir.join("manifest.json");
    let mut manifest = read_json_file(&manifest_path)
        .await?
        .unwrap_or_else(|| json!({}));
    if !manifest.is_object() {
        manifest = json!({});
    }
    if !manifest
        .get("storyboardReferencePlans")
        .is_some_and(Value::is_array)
    {
        set_object_value(&mut manifest, "storyboardReferencePlans", json!([]));
    }

    let Some(plans) = manifest
        .get_mut("storyboardReferencePlans")
        .and_then(Value::as_array_mut)
    else {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "invalid_manifest",
                "message": "manifest.storyboardReferencePlans must be an array."
            },
            "path": manifest_path
        }));
    };

    let source_actor = trimmed_value(input.source_actor).unwrap_or_else(|| "unknown".to_string());
    let reason = trimmed_value(input.reason).unwrap_or_else(|| {
        "StoryboardReferencePlan updated through ShortDramaProject.".to_string()
    });
    let updated_at = now_millis();
    let mut next_plan = plans
        .iter()
        .find(|plan| plan.get("id").and_then(Value::as_str) == Some(reference_plan_id.trim()))
        .cloned()
        .unwrap_or_else(|| json!({ "id": reference_plan_id.trim() }));
    merge_artifact_patch(&mut next_plan, &patch);
    set_object_value(&mut next_plan, "id", json!(reference_plan_id.trim()));
    set_object_value(&mut next_plan, "updatedBy", json!(source_actor.clone()));
    set_object_value(&mut next_plan, "updatedAt", json!(updated_at));
    sync_storyboard_reference_unresolved_placeholders(&mut next_plan);
    push_object_array(
        &mut next_plan,
        "audit",
        json!({
            "type": "storyboardReferencePlanUpserted",
            "sourceActor": source_actor,
            "reason": reason,
            "createdAt": updated_at
        }),
    );

    if let Some(existing) = plans
        .iter_mut()
        .find(|plan| plan.get("id").and_then(Value::as_str) == Some(reference_plan_id.trim()))
    {
        *existing = next_plan.clone();
    } else {
        plans.push(next_plan.clone());
    }
    write_json_pretty(&manifest_path, &manifest).await?;

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": manifest_path,
        "storyboardReferencePlan": next_plan
    }))
}

async fn link_storyboard_reference_plan(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    let id_or_handle = input.id_or_handle.clone().unwrap_or_default();
    let Some(mut artifact) = find_artifact_file(project_dir, &id_or_handle).await? else {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "artifact_not_found",
                "message": "No short drama storyboard artifact matched idOrHandle."
            },
            "idOrHandle": id_or_handle
        }));
    };
    if let Some(denied) =
        deny_cross_stage_direct_write(&input, &artifact.value, "link_storyboard_reference_plan")
    {
        return Ok(denied);
    }

    let reference_plan_id = input.reference_plan_id.clone().unwrap_or_default();
    let manifest_path = project_dir.join("manifest.json");
    let Some(manifest) = read_json_file(&manifest_path).await? else {
        return Ok(json!({
            "status": "empty",
            "source": SOURCE,
            "reason": "manifest_missing",
            "path": manifest_path
        }));
    };
    let Some(plan) = find_storyboard_reference_plan(&manifest, &reference_plan_id) else {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "storyboard_reference_plan_not_found",
                "message": "No StoryboardReferencePlan matched referencePlanId."
            },
            "referencePlanId": reference_plan_id
        }));
    };

    ensure_references_object(&mut artifact.value);
    if let Some(references) = artifact
        .value
        .get_mut("references")
        .and_then(Value::as_object_mut)
    {
        add_unique_string_to_object_array(
            references,
            "storyboardReferencePlanIds",
            plan.get("id").and_then(Value::as_str).unwrap_or_default(),
        );
        add_unique_string_to_object_array(
            references,
            "scriptSegmentIds",
            plan.get("scriptSegmentId")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        );
        copy_plan_reference_array(references, "characterAssetIds", &plan);
        copy_plan_reference_array(references, "locationAssetIds", &plan);
        copy_plan_reference_array(references, "propAssetIds", &plan);
        upsert_storyboard_reference_snapshot(references, &plan);
    }
    set_object_value(
        &mut artifact.value,
        "updatedBy",
        json!(trimmed_value(input.source_actor).unwrap_or_else(|| "unknown".to_string())),
    );
    set_object_value(&mut artifact.value, "updatedAt", json!(now_millis()));
    write_json_pretty(&artifact.path, &artifact.value).await?;

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": artifact.path,
        "artifact": summarize_context_artifact(&artifact.value),
        "storyboardReferencePlan": plan
    }))
}

async fn create_attempt(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    let id_or_handle = input.id_or_handle.clone().unwrap_or_default();
    let Some(mut artifact) = find_artifact_file(project_dir, &id_or_handle).await? else {
        return artifact_not_found(id_or_handle);
    };
    if let Some(denied) = deny_cross_stage_direct_write(&input, &artifact.value, "create_attempt") {
        return Ok(denied);
    }
    let artifact_id =
        artifact_id(&artifact.value).unwrap_or_else(|| sanitize_file_stem(&artifact.file_name));
    let attempt_count = artifact
        .value
        .get("attemptCount")
        .and_then(Value::as_u64)
        .unwrap_or(0)
        + 1;
    let source_session_id = trimmed_value(input.source_session_id);
    let attempt = json!({
        "id": format!("attempt-{artifact_id}-{attempt_count}"),
        "runId": trimmed_value(input.run_id),
        "status": trimmed_value(input.status).unwrap_or_else(|| "created".to_string()),
        "createdAt": now_millis(),
        "userInstruction": trimmed_value(input.user_instruction).unwrap_or_default(),
        "sourceSessionId": source_session_id,
        "sourceActor": trimmed_value(input.source_actor).unwrap_or_else(|| "unknown".to_string())
    });

    push_object_array(&mut artifact.value, "attempts", attempt.clone());
    set_object_value(&mut artifact.value, "attemptCount", json!(attempt_count));
    if let Some(status) = attempt.get("status").and_then(Value::as_str) {
        if matches!(status, "created" | "running" | "generating") {
            set_object_value(&mut artifact.value, "status", json!("generating"));
        }
    }
    write_json_pretty(&artifact.path, &artifact.value).await?;

    let sidecar_path = project_dir
        .join("attempts")
        .join(format!("{}.jsonl", sanitize_file_stem(&artifact_id)));
    append_json_line(&sidecar_path, &attempt).await?;

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": artifact.path,
        "sidecarPath": sidecar_path,
        "artifactId": artifact_id,
        "attempt": attempt
    }))
}

async fn update_artifact_prompt(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    let id_or_handle = input.id_or_handle.clone().unwrap_or_default();
    let Some(mut artifact) = find_artifact_file(project_dir, &id_or_handle).await? else {
        return artifact_not_found(id_or_handle);
    };
    if let Some(denied) =
        deny_cross_stage_direct_write(&input, &artifact.value, "update_artifact_prompt")
    {
        return Ok(denied);
    }
    let patch = input.patch.clone().unwrap_or_else(|| json!({}));
    let artifact_id =
        artifact_id(&artifact.value).unwrap_or_else(|| sanitize_file_stem(&artifact.file_name));
    let previous_revision_id = artifact
        .value
        .get("revisions")
        .and_then(Value::as_array)
        .and_then(|items| items.last())
        .and_then(|revision| revision.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let revision_count = artifact
        .value
        .get("revisionCount")
        .and_then(Value::as_u64)
        .unwrap_or(0)
        + 1;
    let changed_fields = merge_artifact_patch(&mut artifact.value, &patch);
    let revision = json!({
        "id": format!("revision-{artifact_id}-{revision_count}"),
        "version": revision_count,
        "createdAt": now_millis(),
        "summary": trimmed_value(input.reason.clone()).unwrap_or_default(),
        "reason": trimmed_value(input.reason).unwrap_or_default(),
        "userInstruction": trimmed_value(input.user_instruction).unwrap_or_default(),
        "sourceActor": trimmed_value(input.source_actor).unwrap_or_else(|| "unknown".to_string()),
        "previousRevisionId": previous_revision_id,
        "changedFields": changed_fields
    });

    push_object_array(&mut artifact.value, "revisions", revision.clone());
    set_object_value(&mut artifact.value, "revisionCount", json!(revision_count));
    write_json_pretty(&artifact.path, &artifact.value).await?;

    let sidecar_path = project_dir
        .join("revisions")
        .join(format!("{}.jsonl", sanitize_file_stem(&artifact_id)));
    append_json_line(&sidecar_path, &revision).await?;

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": artifact.path,
        "sidecarPath": sidecar_path,
        "artifactId": artifact_id,
        "revision": revision,
        "artifact": artifact.value
    }))
}

fn infer_asset_artifact_type(text: &str) -> Option<String> {
    const LOCATION_CJK: &[&str] = &[
        "场景", "内景", "外景", "地点", "环境", "背景", "城市", "街道", "街景", "房间", "室内",
        "指挥舱", "船舱", "空间站", "基地", "星球", "海面", "沙漠", "森林", "山脉", "天空", "太空", "夜景",
    ];
    const PROP_CJK: &[&str] = &[
        "道具", "物件", "器物", "手持", "武器", "怀表", "手表", "箱子", "手提箱", "盒子", "信件",
        "书信", "装置", "装备",
    ];
    const CHARACTER_CJK: &[&str] = &[
        "角色", "人物", "肖像", "女主", "男主", "主角", "配角", "反派", "女孩", "男孩", "男人",
        "女人", "少女", "少年", "老人", "队长", "士兵", "警官",
    ];
    const LOCATION_LATIN: &[&str] = &[
        "location", "scenery", "interior", "exterior", "environment", "landscape", "cityscape",
    ];
    const PROP_LATIN: &[&str] = &["prop", "object", "item", "device", "gadget", "weapon", "suitcase"];
    const CHARACTER_LATIN: &[&str] = &[
        "character", "portrait", "girl", "boy", "man", "woman", "captain", "soldier",
    ];

    let lower = text.to_lowercase();
    let has_cjk = |hints: &[&str]| hints.iter().any(|hint| lower.contains(hint));
    let has_latin = |hints: &[&str]| {
        lower
            .split(|c: char| !c.is_ascii_alphanumeric())
            .any(|token| hints.contains(&token))
    };

    if has_cjk(LOCATION_CJK) || has_latin(LOCATION_LATIN) {
        return Some("location".to_string());
    }
    if has_cjk(PROP_CJK) || has_latin(PROP_LATIN) {
        return Some("prop".to_string());
    }
    if has_cjk(CHARACTER_CJK) || has_latin(CHARACTER_LATIN) {
        return Some("character".to_string());
    }
    None
}

async fn upsert_asset_artifact(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    if let Some(denied) = deny_non_asset_binding_actor(&input) {
        return Ok(denied);
    }

    let title = trimmed_value(input.title.clone())
        .or_else(|| trimmed_value(input.artifact_handle.clone()))
        .or_else(|| trimmed_value(input.artifact_id.clone()))
        .unwrap_or_else(|| "Untitled asset".to_string());
    let summary = trimmed_value(input.summary.clone()).unwrap_or_default();
    let user_instruction = trimmed_value(input.user_instruction.clone())
        .unwrap_or_else(|| "Upsert short drama asset artifact.".to_string());
    let artifact_type = normalize_asset_artifact_type(input.artifact_type.as_deref())
        .or_else(|| infer_asset_artifact_type(&format!("{title} {summary} {user_instruction}")))
        .unwrap_or_else(|| "character".to_string());
    let handle = trimmed_value(input.artifact_handle.clone())
        .or_else(|| trimmed_value(input.id_or_handle.clone()))
        .unwrap_or_else(|| next_asset_handle(project_dir, &artifact_type));
    let artifact_id = trimmed_value(input.artifact_id.clone()).unwrap_or_else(|| handle.clone());
    let status = trimmed_value(input.status.clone()).unwrap_or_else(|| "ready".to_string());
    let source_actor = trimmed_value(input.source_actor.clone())
        .or_else(|| trimmed_value(input.agent_role.clone()))
        .unwrap_or_else(|| "AssetAI".to_string());
    let now = now_millis();
    let path = project_dir
        .join("assets")
        .join(format!("{}.json", sanitize_file_stem(&artifact_id)));
    let existing = read_json_file(&path).await?;
    let revision_count = existing
        .as_ref()
        .and_then(|value| value.get("revisionCount"))
        .and_then(Value::as_u64)
        .unwrap_or(0)
        + 1;

    let mut artifact = existing.unwrap_or_else(|| {
        json!({
            "id": artifact_id,
            "handle": handle,
            "displayName": title,
            "episodeId": trimmed_value(input.episode_id.clone()).unwrap_or_else(|| "episode-01".to_string()),
            "stage": "assets",
            "type": artifact_type,
            "title": title,
            "summary": summary,
            "agentRole": "image",
            "status": status,
            "revisionCount": 0,
            "attemptCount": 0,
            "revisions": [],
            "attempts": [],
            "createdAt": now
        })
    });

    let patch = input.patch.clone().unwrap_or_else(|| json!({}));
    let mut changed_fields = merge_artifact_patch(&mut artifact, &patch);
    set_object_value(&mut artifact, "id", json!(artifact_id));
    set_object_value(&mut artifact, "handle", json!(handle));
    set_object_value(&mut artifact, "displayName", json!(title));
    set_object_value(&mut artifact, "stage", json!("assets"));
    set_object_value(&mut artifact, "type", json!(artifact_type));
    set_object_value(&mut artifact, "title", json!(title));
    set_object_value(&mut artifact, "status", json!(status));
    if !summary.is_empty() {
        set_object_value(&mut artifact, "summary", json!(summary));
    }
    if let Some(episode_id) = trimmed_value(input.episode_id.clone()) {
        set_object_value(&mut artifact, "episodeId", json!(episode_id));
    }
    for field in [
        "id",
        "handle",
        "displayName",
        "stage",
        "type",
        "title",
        "status",
    ] {
        if !changed_fields.iter().any(|item| item == field) {
            changed_fields.push(field.to_string());
        }
    }

    let revision = json!({
        "id": format!("revision-{}-{revision_count}", sanitize_file_stem(&artifact_id)),
        "version": revision_count,
        "createdAt": now,
        "summary": trimmed_value(input.reason.clone()).unwrap_or_else(|| "Asset artifact upserted.".to_string()),
        "reason": trimmed_value(input.reason).unwrap_or_else(|| "Asset artifact upserted.".to_string()),
        "userInstruction": user_instruction,
        "sourceActor": source_actor,
        "changedFields": changed_fields
    });
    push_object_array(&mut artifact, "revisions", revision.clone());
    set_object_value(&mut artifact, "revisionCount", json!(revision_count));
    write_json_pretty(&path, &artifact).await?;
    sync_short_drama_artifact_indexes(project_dir, &artifact).await?;

    let sidecar_path = project_dir
        .join("revisions")
        .join(format!("{}.jsonl", sanitize_file_stem(&artifact_id)));
    append_json_line(&sidecar_path, &revision).await?;
    append_json_line(
        &project_dir.join("audit-log.jsonl"),
        &json!({
            "id": format!("audit-upsert-asset-{now}"),
            "action": "upsert_asset_artifact",
            "sourceActor": source_actor,
            "artifactId": artifact_id,
            "artifactHandle": artifact.get("handle").cloned().unwrap_or(Value::Null),
            "artifactType": artifact.get("type").cloned().unwrap_or(Value::Null),
            "userInstruction": user_instruction,
            "createdAt": now
        }),
    )
    .await?;

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": path,
        "sidecarPath": sidecar_path,
        "artifactId": artifact_id,
        "artifact": artifact,
        "revision": revision
    }))
}

async fn upsert_stage_artifact(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    let Some((stage, artifact_type)) =
        normalize_stage_artifact_type(input.stage.as_deref(), input.artifact_type.as_deref())
    else {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "invalid_stage_artifact_type",
                "message": "stage must be storyboards, video, or post with a compatible artifactType."
            }
        }));
    };
    if let Some(denied) = deny_stage_artifact_actor(&input, &stage, "upsert_stage_artifact") {
        return Ok(denied);
    }

    let title = trimmed_value(input.title.clone())
        .or_else(|| trimmed_value(input.artifact_handle.clone()))
        .or_else(|| trimmed_value(input.artifact_id.clone()))
        .unwrap_or_else(|| "Untitled artifact".to_string());
    let handle = trimmed_value(input.artifact_handle.clone())
        .or_else(|| trimmed_value(input.id_or_handle.clone()))
        .unwrap_or_else(|| {
            next_stage_handle(
                project_dir,
                &stage,
                &artifact_type,
                input.episode_id.as_deref(),
            )
        });
    let artifact_id = trimmed_value(input.artifact_id.clone()).unwrap_or_else(|| handle.clone());
    let status = trimmed_value(input.status.clone()).unwrap_or_else(|| "ready".to_string());
    let summary = trimmed_value(input.summary.clone()).unwrap_or_default();
    let source_actor = trimmed_value(input.source_actor.clone())
        .or_else(|| trimmed_value(input.agent_role.clone()))
        .unwrap_or_else(|| stage_to_default_agent_role(&stage));
    let user_instruction = trimmed_value(input.user_instruction.clone())
        .unwrap_or_else(|| format!("Upsert short drama {stage} artifact."));
    let now = now_millis();
    let path = project_dir
        .join("artifacts")
        .join(format!("{}.json", sanitize_file_stem(&artifact_id)));
    let existing = read_json_file(&path).await?;
    let revision_count = existing
        .as_ref()
        .and_then(|value| value.get("revisionCount"))
        .and_then(Value::as_u64)
        .unwrap_or(0)
        + 1;

    let mut artifact = existing.unwrap_or_else(|| {
        json!({
            "id": artifact_id,
            "handle": handle,
            "displayName": title,
            "episodeId": trimmed_value(input.episode_id.clone()).unwrap_or_else(|| "episode-01".to_string()),
            "stage": stage,
            "type": artifact_type,
            "title": title,
            "summary": summary,
            "agentRole": stage_to_default_agent_role(&stage),
            "status": status,
            "revisionCount": 0,
            "attemptCount": 0,
            "revisions": [],
            "attempts": [],
            "createdAt": now
        })
    });

    let patch = input.patch.clone().unwrap_or_else(|| json!({}));
    let mut changed_fields = merge_artifact_patch(&mut artifact, &patch);
    set_object_value(&mut artifact, "id", json!(artifact_id));
    set_object_value(&mut artifact, "handle", json!(handle));
    set_object_value(&mut artifact, "displayName", json!(title));
    set_object_value(&mut artifact, "stage", json!(stage));
    set_object_value(&mut artifact, "type", json!(artifact_type));
    set_object_value(&mut artifact, "title", json!(title));
    set_object_value(&mut artifact, "status", json!(status));
    if !summary.is_empty() {
        set_object_value(&mut artifact, "summary", json!(summary));
    }
    if let Some(episode_id) = trimmed_value(input.episode_id.clone()) {
        set_object_value(&mut artifact, "episodeId", json!(episode_id));
    }
    for field in [
        "id",
        "handle",
        "displayName",
        "stage",
        "type",
        "title",
        "status",
    ] {
        if !changed_fields.iter().any(|item| item == field) {
            changed_fields.push(field.to_string());
        }
    }

    let revision = json!({
        "id": format!("revision-{}-{revision_count}", sanitize_file_stem(&artifact_id)),
        "version": revision_count,
        "createdAt": now,
        "summary": trimmed_value(input.reason.clone()).unwrap_or_else(|| format!("{stage} artifact upserted.")),
        "reason": trimmed_value(input.reason).unwrap_or_else(|| format!("{stage} artifact upserted.")),
        "userInstruction": user_instruction,
        "sourceActor": source_actor,
        "changedFields": changed_fields
    });
    push_object_array(&mut artifact, "revisions", revision.clone());
    set_object_value(&mut artifact, "revisionCount", json!(revision_count));
    write_json_pretty(&path, &artifact).await?;
    sync_short_drama_artifact_indexes(project_dir, &artifact).await?;

    let sidecar_path = project_dir
        .join("revisions")
        .join(format!("{}.jsonl", sanitize_file_stem(&artifact_id)));
    append_json_line(&sidecar_path, &revision).await?;
    append_json_line(
        &project_dir.join("audit-log.jsonl"),
        &json!({
            "id": format!("audit-upsert-stage-{now}"),
            "action": "upsert_stage_artifact",
            "sourceActor": source_actor,
            "artifactId": artifact_id,
            "artifactHandle": artifact.get("handle").cloned().unwrap_or(Value::Null),
            "artifactStage": artifact.get("stage").cloned().unwrap_or(Value::Null),
            "artifactType": artifact.get("type").cloned().unwrap_or(Value::Null),
            "userInstruction": user_instruction,
            "createdAt": now
        }),
    )
    .await?;

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "path": path,
        "sidecarPath": sidecar_path,
        "artifactId": artifact_id,
        "artifact": artifact,
        "revision": revision
    }))
}

async fn get_context_package(
    project_dir: &Path,
    input: ShortDramaProjectToolInput,
) -> VoidResult<Value> {
    let focus_path = project_dir.join("focus.json");
    let focus = read_json_file(&focus_path)
        .await?
        .unwrap_or_else(|| json!({}));
    let id_or_handle = input
        .id_or_handle
        .clone()
        .or_else(|| {
            focus
                .get("activeArtifactId")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            focus
                .get("activeArtifactHandle")
                .and_then(Value::as_str)
                .map(str::to_string)
        });

    let Some(id_or_handle) = id_or_handle else {
        return Ok(json!({
            "status": "error",
            "source": SOURCE,
            "error": {
                "code": "focus_missing",
                "message": "get_context_package requires idOrHandle or focus.json with activeArtifactId/activeArtifactHandle."
            }
        }));
    };

    let Some(target_artifact) = find_artifact_file(project_dir, &id_or_handle).await? else {
        return artifact_not_found(id_or_handle);
    };
    let target_artifact_id = artifact_id(&target_artifact.value)
        .unwrap_or_else(|| sanitize_file_stem(&target_artifact.file_name));
    let agent_role = trimmed_value(input.agent_role).unwrap_or_else(|| {
        stage_to_default_agent_role(
            target_artifact
                .value
                .get("stage")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        )
    });
    let references = target_artifact
        .value
        .get("references")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let mut reference_asset_ids = collect_reference_ids(
        &references,
        &["characterAssetIds", "locationAssetIds", "propAssetIds"],
    );
    let mut script_segment_ids = collect_reference_ids(&references, &["scriptSegmentIds"]);
    let storyboard_reference_ids = collect_reference_ids(
        &references,
        &[
            "storyboardArtifactIds",
            "storyboardIds",
            "storyboardHandles",
        ],
    );
    let referenced_storyboards =
        read_referenced_storyboard_artifacts(project_dir, &storyboard_reference_ids).await?;
    for storyboard in &referenced_storyboards {
        let storyboard_references = storyboard
            .get("references")
            .cloned()
            .unwrap_or_else(|| json!({}));
        extend_unique_strings(
            &mut script_segment_ids,
            collect_reference_ids(&storyboard_references, &["scriptSegmentIds"]),
        );
        extend_unique_strings(
            &mut reference_asset_ids,
            collect_reference_ids(
                &storyboard_references,
                &["characterAssetIds", "locationAssetIds", "propAssetIds"],
            ),
        );
    }
    let script_segments = read_referenced_script_segments(project_dir, &script_segment_ids).await?;
    let manifest = read_json_file(&project_dir.join("manifest.json"))
        .await?
        .unwrap_or_else(|| json!({}));
    let storyboard_reference_plans =
        select_storyboard_reference_plans(&manifest, &target_artifact.value, &script_segment_ids);
    merge_plan_asset_ids(&mut reference_asset_ids, &storyboard_reference_plans);
    let referenced_assets = read_referenced_assets(project_dir, &reference_asset_ids).await?;
    let related_change_requests =
        read_related_change_requests(project_dir, &target_artifact.value, &target_artifact_id)
            .await?;
    let unresolved_references =
        collect_unresolved_storyboard_reference_plan_refs(&storyboard_reference_plans);
    let context_issues =
        collect_context_storyboard_reference_plan_issues(&storyboard_reference_plans);
    let context_status = if context_issues.is_empty() {
        "ready"
    } else {
        "needs_attention"
    };
    let included_context = build_included_context(
        &target_artifact_id,
        &script_segment_ids,
        &reference_asset_ids,
        &referenced_storyboards,
        &storyboard_reference_plans,
        &related_change_requests,
    );
    let omitted_context = vec![
        json!({
            "type": "full_chat_history",
            "reason": "Runtime context package includes project facts, not parent chat transcript."
        }),
        json!({
            "type": "raw_media_payloads",
            "reason": "Media is exposed through ids, metadata, previews, or file references only."
        }),
        json!({
            "type": "unreferenced_assets",
            "reason": "Assets are limited to ids referenced by the focused artifact or storyboard plan."
        }),
        json!({
            "type": "provider_secrets",
            "reason": "Provider credentials and runtime secrets are never included."
        }),
        json!({
            "type": "full_script_document",
            "reason": "Use script segment indexes for low-context retrieval."
        }),
    ];

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "contextPackage": {
            "source": SOURCE,
            "agentRole": agent_role,
            "focus": focus,
            "targetArtifact": summarize_context_artifact(&target_artifact.value),
            "scriptSegments": script_segments,
            "referencedStoryboards": referenced_storyboards,
            "referencedAssets": referenced_assets,
            "storyboardReferencePlans": storyboard_reference_plans,
            "unresolvedReferences": unresolved_references,
            "contextStatus": context_status,
            "contextIssues": context_issues,
            "changeRequests": related_change_requests,
            "includedContext": included_context,
            "omittedContext": omitted_context,
            "reason": "Build focused short-drama runtime context from focus, artifact references, script segment index, asset facts, StoryboardReferencePlan, and related change requests.",
            "policyApplied": format_runtime_policy_applied(&agent_role, &target_artifact.value)
        }
    }))
}

struct ArtifactFile {
    file_name: String,
    path: PathBuf,
    value: Value,
}

async fn read_artifact_files(artifacts_dir: &Path) -> VoidResult<Vec<ArtifactFile>> {
    if !path_exists(artifacts_dir).await {
        return Ok(Vec::new());
    }

    let mut entries = fs::read_dir(artifacts_dir)
        .await
        .map_err(|error| VoidError::io(format!("Failed to read short drama artifacts: {error}")))?;
    let mut artifacts = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|error| {
        VoidError::io(format!(
            "Failed to read short drama artifact entry: {error}"
        ))
    })? {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let content = fs::read_to_string(&path).await.map_err(|error| {
            VoidError::io(format!("Failed to read short drama artifact file: {error}"))
        })?;
        if let Ok(value) = serde_json::from_str::<Value>(&content) {
            artifacts.push(ArtifactFile {
                file_name: entry.file_name().to_string_lossy().to_string(),
                path,
                value,
            });
        }
    }
    Ok(artifacts)
}

async fn read_project_artifact_files(project_dir: &Path) -> VoidResult<Vec<ArtifactFile>> {
    let mut files = read_artifact_files(&project_dir.join("artifacts")).await?;
    files.extend(read_artifact_files(&project_dir.join("assets")).await?);
    Ok(files)
}

async fn searchable_files(project_dir: &Path) -> VoidResult<Vec<(String, PathBuf)>> {
    let mut files = Vec::new();
    for name in ["manifest.json", "script.md"] {
        let path = project_dir.join(name);
        if path_exists(&path).await {
            files.push((name.to_string(), path));
        }
    }
    for dir_name in ["artifacts", "assets", "indexes"] {
        let dir = project_dir.join(dir_name);
        if !path_exists(&dir).await {
            continue;
        }
        let mut entries = fs::read_dir(&dir).await.map_err(|error| {
            VoidError::io(format!(
                "Failed to read short drama search directory: {error}"
            ))
        })?;
        while let Some(entry) = entries.next_entry().await.map_err(|error| {
            VoidError::io(format!("Failed to read short drama search entry: {error}"))
        })? {
            let path = entry.path();
            if path.is_file() {
                files.push((
                    format!("{dir_name}/{}", entry.file_name().to_string_lossy()),
                    path,
                ));
            }
        }
    }
    Ok(files)
}

async fn find_artifact_file(
    project_dir: &Path,
    id_or_handle: &str,
) -> VoidResult<Option<ArtifactFile>> {
    let target = id_or_handle.trim().to_lowercase();
    let artifacts = read_project_artifact_files(project_dir).await?;
    Ok(artifacts
        .into_iter()
        .find(|artifact| artifact_matches(&artifact.value, &target)))
}

async fn read_json_file(path: &Path) -> VoidResult<Option<Value>> {
    if !path_exists(path).await {
        return Ok(None);
    }
    let content = fs::read_to_string(path)
        .await
        .map_err(|error| VoidError::io(format!("Failed to read short drama JSON file: {error}")))?;
    let value = serde_json::from_str::<Value>(&content).map_err(|error| {
        VoidError::tool(format!("Failed to parse short drama JSON file: {error}"))
    })?;
    Ok(Some(value))
}

async fn read_referenced_assets(
    project_dir: &Path,
    reference_asset_ids: &[String],
) -> VoidResult<Vec<Value>> {
    if reference_asset_ids.is_empty() {
        return Ok(Vec::new());
    }
    let assets = read_artifact_files(&project_dir.join("assets")).await?;
    Ok(assets
        .into_iter()
        .filter(|asset| {
            asset
                .value
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| reference_asset_ids.iter().any(|reference| reference == id))
        })
        .map(|asset| summarize_context_artifact(&asset.value))
        .collect())
}

async fn read_referenced_storyboard_artifacts(
    project_dir: &Path,
    storyboard_reference_ids: &[String],
) -> VoidResult<Vec<Value>> {
    if storyboard_reference_ids.is_empty() {
        return Ok(Vec::new());
    }
    let artifacts = read_project_artifact_files(project_dir).await?;
    Ok(artifacts
        .into_iter()
        .filter(|artifact| {
            artifact
                .value
                .get("stage")
                .and_then(Value::as_str)
                .is_some_and(|stage| stage == "storyboards")
                && storyboard_reference_ids.iter().any(|reference| {
                    artifact
                        .value
                        .get("id")
                        .and_then(Value::as_str)
                        .is_some_and(|id| id == reference)
                        || artifact
                            .value
                            .get("handle")
                            .and_then(Value::as_str)
                            .is_some_and(|handle| handle == reference)
                })
        })
        .map(|artifact| summarize_context_artifact(&artifact.value))
        .collect())
}

async fn read_related_change_requests(
    project_dir: &Path,
    target_artifact: &Value,
    target_artifact_id: &str,
) -> VoidResult<Vec<Value>> {
    let path = project_dir.join("change-requests.jsonl");
    if !path_exists(&path).await {
        return Ok(Vec::new());
    }

    let target_handle = target_artifact.get("handle").and_then(Value::as_str);
    let content = fs::read_to_string(&path).await.map_err(|error| {
        VoidError::io(format!(
            "Failed to read short drama change requests: {error}"
        ))
    })?;
    let mut requests = Vec::new();
    for line in content.lines().filter(|line| !line.trim().is_empty()) {
        let Ok(request) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let status = request
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !matches!(status, "open" | "accepted") {
            continue;
        }
        let matches_id = request
            .get("targetArtifactId")
            .and_then(Value::as_str)
            .is_some_and(|id| id == target_artifact_id);
        let matches_handle = target_handle.is_some_and(|handle| {
            request
                .get("targetArtifactHandle")
                .and_then(Value::as_str)
                .is_some_and(|request_handle| request_handle == handle)
        });
        if matches_id || matches_handle {
            requests.push(request);
        }
    }
    Ok(requests)
}

async fn read_script_segment_ids(project_dir: &Path) -> VoidResult<Vec<String>> {
    let index_path = project_dir
        .join("indexes")
        .join("script-segment-index.json");
    let Some(index) = read_json_file(&index_path).await? else {
        return Ok(Vec::new());
    };
    Ok(index
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|segment| segment.get("id").and_then(Value::as_str))
        .map(str::to_string)
        .collect())
}

async fn read_referenced_script_segments(
    project_dir: &Path,
    script_segment_ids: &[String],
) -> VoidResult<Vec<Value>> {
    if script_segment_ids.is_empty() {
        return Ok(Vec::new());
    }
    let index_path = project_dir
        .join("indexes")
        .join("script-segment-index.json");
    let Some(index) = read_json_file(&index_path).await? else {
        return Ok(Vec::new());
    };
    let segments = index
        .as_array()
        .into_iter()
        .flatten()
        .filter(|segment| {
            segment
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| script_segment_ids.iter().any(|reference| reference == id))
        })
        .cloned()
        .collect::<Vec<_>>();
    Ok(segments)
}

fn select_storyboard_reference_plans(
    manifest: &Value,
    target_artifact: &Value,
    script_segment_ids: &[String],
) -> Vec<Value> {
    let episode_id = target_artifact.get("episodeId").and_then(Value::as_str);
    manifest
        .get("storyboardReferencePlans")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|plan| {
            let plan_episode_matches = episode_id.is_some_and(|episode_id| {
                plan.get("episodeId")
                    .and_then(Value::as_str)
                    .is_some_and(|plan_episode_id| plan_episode_id == episode_id)
            });
            let plan_segment_matches = plan
                .get("scriptSegmentId")
                .and_then(Value::as_str)
                .is_some_and(|plan_segment_id| {
                    script_segment_ids
                        .iter()
                        .any(|segment_id| segment_id == plan_segment_id)
                });
            plan_episode_matches || plan_segment_matches
        })
        .cloned()
        .collect()
}

fn build_included_context(
    target_artifact_id: &str,
    script_segment_ids: &[String],
    reference_asset_ids: &[String],
    referenced_storyboards: &[Value],
    storyboard_reference_plans: &[Value],
    change_requests: &[Value],
) -> Vec<Value> {
    let mut entries = vec![
        json!({
            "type": "focus",
            "id": target_artifact_id,
            "reason": "Current right-panel focus or explicit idOrHandle target."
        }),
        json!({
            "type": "artifact",
            "id": target_artifact_id,
            "reason": "Focused artifact being inspected or edited."
        }),
    ];
    entries.extend(script_segment_ids.iter().map(|id| {
        json!({
            "type": "scriptSegment",
            "id": id,
            "reason": "Referenced by the focused artifact."
        })
    }));
    entries.extend(reference_asset_ids.iter().map(|id| {
        json!({
            "type": "asset",
            "id": id,
            "reason": "Referenced by the focused artifact or storyboard plan."
        })
    }));
    entries.extend(referenced_storyboards.iter().filter_map(|storyboard| {
        storyboard.get("id").and_then(Value::as_str).map(|id| {
            json!({
                "type": "storyboard",
                "id": id,
                "reason": "Referenced by the focused video artifact."
            })
        })
    }));
    entries.extend(storyboard_reference_plans.iter().filter_map(|plan| {
        plan.get("id").and_then(Value::as_str).map(|id| {
            json!({
                "type": "storyboardReferencePlan",
                "id": id,
                "reason": "ScriptAI structured shot plan for SplitAI/VideoAI context."
            })
        })
    }));
    entries.extend(change_requests.iter().filter_map(|request| {
        request.get("id").and_then(Value::as_str).map(|id| {
            json!({
                "type": "changeRequest",
                "id": id,
                "reason": "Open or accepted cross-stage request targeting the focused artifact."
            })
        })
    }));
    entries
}

fn collect_reference_ids(references: &Value, keys: &[&str]) -> Vec<String> {
    let mut ids = Vec::new();
    for key in keys {
        if let Some(values) = references.get(*key).and_then(Value::as_array) {
            for value in values {
                if let Some(id) = value.as_str() {
                    if !ids.iter().any(|existing| existing == id) {
                        ids.push(id.to_string());
                    }
                }
            }
        }
    }
    ids
}

fn extend_unique_strings(target: &mut Vec<String>, values: Vec<String>) {
    for value in values {
        if !target.iter().any(|existing| existing == &value) {
            target.push(value);
        }
    }
}

fn merge_plan_asset_ids(
    reference_asset_ids: &mut Vec<String>,
    storyboard_reference_plans: &[Value],
) {
    for plan in storyboard_reference_plans {
        for id in collect_reference_ids(
            plan,
            &["characterAssetIds", "locationAssetIds", "propAssetIds"],
        ) {
            if !reference_asset_ids.iter().any(|existing| existing == &id) {
                reference_asset_ids.push(id);
            }
        }
    }
}

fn summarize_context_artifact(value: &Value) -> Value {
    json!({
        "id": value.get("id").cloned().unwrap_or(Value::Null),
        "handle": value.get("handle").cloned().unwrap_or(Value::Null),
        "displayName": value.get("displayName").cloned().unwrap_or(Value::Null),
        "title": value.get("title").cloned().unwrap_or(Value::Null),
        "summary": value.get("summary").cloned().unwrap_or(Value::Null),
        "stage": value.get("stage").cloned().unwrap_or(Value::Null),
        "type": value.get("type").cloned().unwrap_or(Value::Null),
        "episodeId": value.get("episodeId").cloned().unwrap_or(Value::Null),
        "status": value.get("status").cloned().unwrap_or(Value::Null),
        "references": value.get("references").cloned().unwrap_or(Value::Null),
        "mediaReference": summarize_context_media_reference(value.get("mediaReference"))
    })
}

fn summarize_context_media_reference(media_reference: Option<&Value>) -> Value {
    let Some(media_reference) = media_reference else {
        return Value::Null;
    };

    json!({
        "id": media_reference.get("id").cloned().unwrap_or(Value::Null),
        "kind": media_reference.get("kind").cloned().unwrap_or(Value::Null),
        "status": media_reference.get("status").cloned().unwrap_or(Value::Null),
        "path": media_reference.get("path").cloned().unwrap_or(Value::Null),
        "thumbnailPath": media_reference.get("thumbnailPath").cloned().unwrap_or(Value::Null),
        "previewPath": media_reference.get("previewPath").cloned().unwrap_or(Value::Null),
        "durationSeconds": media_reference.get("durationSeconds").cloned().unwrap_or(Value::Null),
    })
}

fn stage_to_default_agent_role(stage: &str) -> String {
    match stage {
        "script" => "ScriptAI",
        "assets" => "AssetAI",
        "storyboards" => "SplitAI",
        "video" => "VideoAI",
        "post" => "EditorAI",
        _ => "MainAI",
    }
    .to_string()
}

struct StoryboardReferenceFields {
    kind: &'static str,
    asset_ids_field: &'static str,
    unresolved_names_field: &'static str,
}

impl StoryboardReferenceFields {
    fn from_kind(kind: &str) -> Option<Self> {
        match kind.trim() {
            "character" => Some(Self {
                kind: "character",
                asset_ids_field: "characterAssetIds",
                unresolved_names_field: "unresolvedCharacterNames",
            }),
            "location" => Some(Self {
                kind: "location",
                asset_ids_field: "locationAssetIds",
                unresolved_names_field: "unresolvedLocationNames",
            }),
            "prop" => Some(Self {
                kind: "prop",
                asset_ids_field: "propAssetIds",
                unresolved_names_field: "unresolvedPropNames",
            }),
            _ => None,
        }
    }
}

fn add_unique_string_to_array(value: &mut Value, key: &str, item: &str) {
    if !value.is_object() {
        *value = json!({});
    }
    let Some(object) = value.as_object_mut() else {
        return;
    };
    object
        .entry(key.to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(items) = object.get_mut(key).and_then(Value::as_array_mut) else {
        return;
    };
    if !items.iter().any(|existing| existing.as_str() == Some(item)) {
        items.push(json!(item));
    }
}

fn add_unique_string_to_object_array(object: &mut Map<String, Value>, key: &str, item: &str) {
    if item.trim().is_empty() {
        return;
    }
    object
        .entry(key.to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(items) = object.get_mut(key).and_then(Value::as_array_mut) else {
        return;
    };
    if !items.iter().any(|existing| existing.as_str() == Some(item)) {
        items.push(json!(item));
    }
}

fn ensure_references_object(artifact: &mut Value) {
    if !artifact.is_object() {
        *artifact = json!({});
    }
    let Some(object) = artifact.as_object_mut() else {
        return;
    };
    if !object.get("references").is_some_and(Value::is_object) {
        object.insert("references".to_string(), Value::Object(Map::new()));
    }
}

fn copy_plan_reference_array(references: &mut Map<String, Value>, key: &str, plan: &Value) {
    let Some(values) = plan.get(key).and_then(Value::as_array) else {
        return;
    };
    for value in values {
        if let Some(id) = value.as_str() {
            add_unique_string_to_object_array(references, key, id);
        }
    }
}

fn upsert_storyboard_reference_snapshot(references: &mut Map<String, Value>, plan: &Value) {
    let plan_id = plan
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if plan_id.is_empty() {
        return;
    }

    let snapshot = json!({
        "storyboardReferencePlanId": plan_id,
        "scriptSegmentId": plan.get("scriptSegmentId").cloned().unwrap_or(Value::Null),
        "episodeId": plan.get("episodeId").cloned().unwrap_or(Value::Null),
        "sceneId": plan.get("sceneId").cloned().unwrap_or(Value::Null),
        "shotId": plan.get("shotId").cloned().unwrap_or(Value::Null),
        "characterNames": clone_array_value(plan, "characterNames"),
        "locationNames": clone_array_value(plan, "locationNames"),
        "propNames": clone_array_value(plan, "propNames"),
        "characterAssetIds": clone_array_value(plan, "characterAssetIds"),
        "locationAssetIds": clone_array_value(plan, "locationAssetIds"),
        "propAssetIds": clone_array_value(plan, "propAssetIds"),
        "unresolvedCharacterNames": clone_array_value(plan, "unresolvedCharacterNames"),
        "unresolvedLocationNames": clone_array_value(plan, "unresolvedLocationNames"),
        "unresolvedPropNames": clone_array_value(plan, "unresolvedPropNames"),
        "requiredBeats": clone_array_value(plan, "requiredBeats"),
        "visualNotes": clone_array_value(plan, "visualNotes"),
        "actionNotes": clone_array_value(plan, "actionNotes"),
        "emotionNotes": clone_array_value(plan, "emotionNotes"),
        "cameraIntent": clone_array_value(plan, "cameraIntent")
    });

    references
        .entry("referenceSnapshots".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(items) = references
        .get_mut("referenceSnapshots")
        .and_then(Value::as_array_mut)
    else {
        return;
    };

    if let Some(existing) = items.iter_mut().find(|item| {
        item.get("storyboardReferencePlanId")
            .and_then(Value::as_str)
            == Some(plan_id)
    }) {
        *existing = snapshot;
    } else {
        items.push(snapshot);
    }
}

fn clone_array_value(source: &Value, key: &str) -> Value {
    source
        .get(key)
        .filter(|value| value.is_array())
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()))
}

fn find_storyboard_reference_plan(manifest: &Value, reference_plan_id: &str) -> Option<Value> {
    manifest
        .get("storyboardReferencePlans")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|plan| plan.get("id").and_then(Value::as_str) == Some(reference_plan_id.trim()))
        .cloned()
}

fn remove_matching_strings_from_array(value: &mut Value, key: &str, match_terms: &[String]) {
    let Some(items) = value.get_mut(key).and_then(Value::as_array_mut) else {
        return;
    };
    items.retain(|item| {
        let Some(text) = item.as_str() else {
            return true;
        };
        let lower = text.to_lowercase();
        !match_terms.iter().any(|term| term == &lower)
    });
}

fn asset_reference_match_terms(asset: &Value) -> Vec<String> {
    ["id", "handle", "displayName", "title", "name"]
        .into_iter()
        .filter_map(|key| asset.get(key).and_then(Value::as_str))
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .collect()
}

fn upsert_asset_used_by(asset: &mut Value, plan: &Value, reference_kind: &str) {
    if !asset.is_object() {
        *asset = json!({});
    }
    let Some(object) = asset.as_object_mut() else {
        return;
    };
    object
        .entry("usedBy".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(used_by) = object.get_mut("usedBy").and_then(Value::as_array_mut) else {
        return;
    };
    let plan_id = plan
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if used_by.iter().any(|entry| {
        entry
            .get("storyboardReferencePlanId")
            .and_then(Value::as_str)
            == Some(plan_id.as_str())
            && entry.get("referenceKind").and_then(Value::as_str) == Some(reference_kind)
    }) {
        return;
    }
    used_by.push(json!({
        "type": "storyboardReferencePlan",
        "storyboardReferencePlanId": plan_id,
        "referenceKind": reference_kind,
        "episodeId": plan.get("episodeId").cloned().unwrap_or(Value::Null),
        "sceneId": plan.get("sceneId").cloned().unwrap_or(Value::Null),
        "shotId": plan.get("shotId").cloned().unwrap_or(Value::Null),
        "scriptSegmentId": plan.get("scriptSegmentId").cloned().unwrap_or(Value::Null)
    }));
}

fn format_runtime_policy_applied(agent_role: &str, target_artifact: &Value) -> String {
    let stage = target_artifact
        .get("stage")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    match agent_role {
        "SplitAI" => format!(
            "{agent_role}/{stage} read(script:segment, assets:referenced, storyboards:referenced) write(storyboards:prompt|artifact) omitted(full_chat_history, raw_media_payloads, unreferenced_assets)"
        ),
        "VideoAI" => format!(
            "{agent_role}/{stage} read(script:segment, assets:referenced, storyboards:referenced, video:referenced) write(video:prompt|attempt) omitted(full_chat_history, raw_media_payloads, unreferenced_assets)"
        ),
        "AssetAI" => format!(
            "{agent_role}/{stage} read(script:episode, assets:allSummary) write(assets:prompt|artifact) omitted(full_chat_history, raw_media_payloads)"
        ),
        "ScriptAI" => format!(
            "{agent_role}/{stage} read(script:full, assets:statusSummary, storyboards:statusSummary) write(script:segment|breakdown) omitted(raw_media_payloads, provider_secrets)"
        ),
        "EditorAI" => format!(
            "{agent_role}/{stage} read(script:segment, video:referenced, post:statusSummary) write(post:prompt|artifact) omitted(full_chat_history, raw_media_payloads)"
        ),
        _ => format!(
            "{agent_role}/{stage} read(focusedProjectFacts) write(none) omitted(full_chat_history, raw_media_payloads, provider_secrets)"
        ),
    }
}

fn deny_non_asset_binding_actor(input: &ShortDramaProjectToolInput) -> Option<Value> {
    deny_non_asset_actor(
        input,
        "bind_storyboard_reference_asset",
        "Only AssetAI or MainAI can bind storyboard reference placeholders to asset anchors. Use request_change instead.",
    )
}

fn deny_non_asset_actor(
    input: &ShortDramaProjectToolInput,
    action: &str,
    message: &str,
) -> Option<Value> {
    let source_actor = input
        .source_actor
        .as_deref()
        .or(input.agent_role.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    if matches!(source_actor, "AssetAI" | "MainAI") {
        return None;
    }

    Some(json!({
        "status": "denied",
        "source": SOURCE,
        "error": {
            "code": "write_policy_denied",
            "message": message
        },
        "policy": {
            "action": action,
            "sourceActor": source_actor,
            "targetStage": "assets",
            "requiredActor": "AssetAI",
            "allowedAction": "request_change"
        }
    }))
}

fn deny_stage_artifact_actor(
    input: &ShortDramaProjectToolInput,
    target_stage: &str,
    action: &str,
) -> Option<Value> {
    let source_actor = input
        .source_actor
        .as_deref()
        .or(input.agent_role.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    if source_actor == "MainAI" {
        return None;
    }

    let required_actor = stage_to_default_agent_role(target_stage);
    if source_actor == required_actor {
        return None;
    }

    Some(json!({
        "status": "denied",
        "source": SOURCE,
        "error": {
            "code": "write_policy_denied",
            "message": "Specialist agents cannot directly upsert artifacts owned by another short-drama stage. Use request_change instead."
        },
        "policy": {
            "action": action,
            "sourceActor": source_actor,
            "targetStage": target_stage,
            "requiredActor": required_actor,
            "allowedAction": "request_change"
        }
    }))
}

fn deny_non_script_plan_actor(input: &ShortDramaProjectToolInput) -> Option<Value> {
    let source_actor = input
        .source_actor
        .as_deref()
        .or(input.agent_role.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    if matches!(source_actor, "ScriptAI" | "MainAI") {
        return None;
    }

    Some(json!({
        "status": "denied",
        "source": SOURCE,
        "error": {
            "code": "write_policy_denied",
            "message": "Only ScriptAI or MainAI can create or update StoryboardReferencePlan records. Use request_change instead."
        },
        "policy": {
            "action": "upsert_storyboard_reference_plan",
            "sourceActor": source_actor,
            "targetStage": "script",
            "requiredActor": "ScriptAI",
            "allowedAction": "request_change"
        }
    }))
}

fn deny_non_initialization_actor(input: &ShortDramaProjectToolInput) -> Option<Value> {
    let source_actor = input
        .source_actor
        .as_deref()
        .or(input.agent_role.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("MainAI");
    if matches!(source_actor, "MainAI" | "ScriptAI") {
        return None;
    }

    Some(json!({
        "status": "denied",
        "source": SOURCE,
        "error": {
            "code": "initialize_policy_denied",
            "message": "Only MainAI or ScriptAI can initialize a short drama project from script content."
        },
        "policy": {
            "action": "initialize_from_script",
            "sourceActor": source_actor,
            "targetStage": "script",
            "allowedActors": ["MainAI", "ScriptAI"],
            "allowedAction": "request_change"
        }
    }))
}

fn deny_full_script_read_actor(input: &ShortDramaProjectToolInput) -> Option<Value> {
    let source_actor = input
        .source_actor
        .as_deref()
        .or(input.agent_role.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    if matches!(source_actor, "ScriptAI" | "MainAI") {
        return None;
    }

    Some(json!({
        "status": "denied",
        "source": SOURCE,
        "error": {
            "code": "read_policy_denied",
            "message": "Specialist agents cannot read the full short drama script through read_script. Use read_script_segment with episode/query/id scope instead."
        },
        "policy": {
            "action": "read_script",
            "sourceActor": source_actor,
            "requiredScope": "script:full",
            "allowedAction": "read_script_segment"
        }
    }))
}

fn deny_cross_stage_direct_write(
    input: &ShortDramaProjectToolInput,
    target_artifact: &Value,
    action: &str,
) -> Option<Value> {
    let source_actor = input
        .source_actor
        .as_deref()
        .or(input.agent_role.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    if source_actor == "MainAI" {
        return None;
    }

    let target_stage = target_artifact
        .get("stage")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let required_actor = stage_to_default_agent_role(target_stage);
    if source_actor == required_actor {
        return None;
    }

    Some(json!({
        "status": "denied",
        "source": SOURCE,
        "error": {
            "code": "write_policy_denied",
            "message": "Specialist agents cannot directly write artifacts owned by another short-drama stage. Use request_change instead."
        },
        "policy": {
            "action": action,
            "sourceActor": source_actor,
            "targetStage": target_stage,
            "requiredActor": required_actor,
            "allowedAction": "request_change"
        }
    }))
}

#[derive(Debug, Default)]
struct ChangeRequestFilters {
    target_stage: Option<String>,
    status: Option<String>,
    source_actor: Option<String>,
    id_or_handle: Option<String>,
}

impl ChangeRequestFilters {
    fn from_input(input: &ShortDramaProjectToolInput) -> Self {
        Self {
            target_stage: trimmed_value(input.target_stage.clone()),
            status: trimmed_value(input.status.clone()),
            source_actor: trimmed_value(input.source_actor.clone()),
            id_or_handle: trimmed_value(input.id_or_handle.clone()),
        }
    }

    fn matches(&self, request: &Value) -> bool {
        field_matches(&self.target_stage, request, "targetStage")
            && field_matches(&self.status, request, "status")
            && field_matches(&self.source_actor, request, "sourceActor")
            && self.id_or_handle_matches(request)
    }

    fn id_or_handle_matches(&self, request: &Value) -> bool {
        let Some(id_or_handle) = &self.id_or_handle else {
            return true;
        };
        ["targetArtifactId", "targetArtifactHandle"]
            .into_iter()
            .filter_map(|key| request.get(key).and_then(Value::as_str))
            .any(|value| value.eq_ignore_ascii_case(id_or_handle))
    }

    fn to_json(&self) -> Value {
        let mut filters = Map::new();
        if let Some(target_stage) = &self.target_stage {
            filters.insert("targetStage".to_string(), json!(target_stage));
        }
        if let Some(status) = &self.status {
            filters.insert("status".to_string(), json!(status));
        }
        if let Some(source_actor) = &self.source_actor {
            filters.insert("sourceActor".to_string(), json!(source_actor));
        }
        if let Some(id_or_handle) = &self.id_or_handle {
            filters.insert("idOrHandle".to_string(), json!(id_or_handle));
        }
        Value::Object(filters)
    }
}

fn change_request_matches_target(request: &Value, target: &str) -> bool {
    ["id", "targetArtifactId", "targetArtifactHandle"]
        .into_iter()
        .filter_map(|key| request.get(key).and_then(Value::as_str))
        .any(|value| value.to_lowercase() == target)
}

fn next_asset_handle(project_dir: &Path, artifact_type: &str) -> String {
    let prefix = match artifact_type {
        "location" => "LOC",
        "prop" => "PROP",
        _ => "CHAR",
    };
    let count = std::fs::read_dir(project_dir.join("assets"))
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some("json"))
        .count()
        + 1;
    format!("{prefix}-{count:03}")
}

fn next_stage_handle(
    project_dir: &Path,
    stage: &str,
    artifact_type: &str,
    episode_id: Option<&str>,
) -> String {
    let prefix = match stage {
        "storyboards" => "SB",
        "video" => "VID",
        "post" => match artifact_type {
            "subtitle" => "SUB",
            "audio" => "AUD",
            "final" => "POST",
            _ => "POST",
        },
        _ => "ART",
    };
    let episode_prefix = episode_id
        .and_then(parse_episode_number_from_id)
        .map(|number| format!("EP{number:02}-"))
        .unwrap_or_default();
    let count = std::fs::read_dir(project_dir.join("artifacts"))
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some("json"))
        .count()
        + 1;
    format!("{episode_prefix}{prefix}{count:03}")
}

fn parse_episode_number_from_id(value: &str) -> Option<usize> {
    let digits = value
        .chars()
        .filter(|character| character.is_ascii_digit())
        .collect::<String>();
    digits.parse::<usize>().ok().filter(|number| *number > 0)
}

async fn sync_short_drama_artifact_indexes(project_dir: &Path, artifact: &Value) -> VoidResult<()> {
    let manifest_path = project_dir.join("manifest.json");
    if let Some(mut manifest) = read_json_file(&manifest_path).await? {
        upsert_artifact_projection(&mut manifest, artifact);
        write_json_pretty(&manifest_path, &manifest).await?;
    }

    let index_path = project_dir.join("indexes").join("artifact-index.json");
    let mut index = read_json_file(&index_path)
        .await?
        .unwrap_or_else(|| Value::Array(Vec::new()));
    upsert_artifact_projection(&mut index, artifact);
    write_json_pretty(&index_path, &index).await?;

    let media_index_path = project_dir.join("indexes").join("media-index.json");
    if let Some(media_reference) = artifact
        .get("mediaReference")
        .filter(|value| value.is_object())
    {
        let mut media_index = read_json_file(&media_index_path)
            .await?
            .unwrap_or_else(|| Value::Array(Vec::new()));
        upsert_media_projection(&mut media_index, artifact, media_reference);
        write_json_pretty(&media_index_path, &media_index).await?;
    }

    Ok(())
}

fn upsert_artifact_projection(container: &mut Value, artifact: &Value) {
    if container.is_object() && !container.get("project").is_some_and(Value::is_object) {
        set_object_value(container, "project", json!({ "artifacts": [] }));
    }
    if let Some(project) = container.get_mut("project") {
        if !project.get("artifacts").is_some_and(Value::is_array) {
            set_object_value(project, "artifacts", Value::Array(Vec::new()));
        }
        if let Some(project_artifacts) = project.get_mut("artifacts") {
            upsert_value_by_id(project_artifacts, artifact);
        }
    }
    if let Some(items) = container.get_mut("artifacts") {
        upsert_value_by_id(items, artifact);
    } else if container.is_array() {
        upsert_value_by_id(container, artifact);
    }
    if let Some(stages) = container.get_mut("stages").and_then(Value::as_object_mut) {
        let stage = artifact
            .get("stage")
            .and_then(Value::as_str)
            .unwrap_or("assets");
        stages.insert(stage.to_string(), json!({ "status": "ready" }));
    }
}

fn upsert_media_projection(container: &mut Value, artifact: &Value, media_reference: &Value) {
    let media_item = summarize_media_item(artifact, media_reference);
    if let Some(items) = container.get_mut("mediaItems") {
        upsert_value_by_id(items, &media_item);
    } else if container.is_array() {
        upsert_value_by_id(container, &media_item);
    } else {
        *container = Value::Array(vec![media_item]);
    }
}

fn upsert_value_by_id(values: &mut Value, item: &Value) {
    if !values.is_array() {
        *values = Value::Array(Vec::new());
    }
    let Some(items) = values.as_array_mut() else {
        return;
    };
    let item_id = item.get("id").and_then(Value::as_str);
    let item_handle = item.get("handle").and_then(Value::as_str);
    if let Some(existing) = items.iter_mut().find(|existing| {
        item_id.is_some() && existing.get("id").and_then(Value::as_str) == item_id
            || item_handle.is_some()
                && existing.get("handle").and_then(Value::as_str) == item_handle
    }) {
        *existing = item.clone();
        return;
    }
    items.push(item.clone());
}

#[derive(Debug, Default)]
struct MediaFilters {
    artifact_filters: ArtifactFilters,
    media_kind: Option<String>,
    media_status: Option<String>,
}

impl MediaFilters {
    fn from_input(input: &ShortDramaProjectToolInput) -> Self {
        Self {
            artifact_filters: ArtifactFilters::from_input(input),
            media_kind: trimmed_value(input.media_kind.clone()),
            media_status: trimmed_value(input.media_status.clone()),
        }
    }

    fn artifact_matches(&self, artifact: &Value) -> bool {
        self.artifact_filters.matches(artifact)
    }

    fn media_matches(&self, media_item: &Value) -> bool {
        field_matches(&self.media_kind, media_item, "kind")
            && field_matches(&self.media_status, media_item, "status")
    }

    fn to_json(&self) -> Value {
        let mut filters = self
            .artifact_filters
            .to_json()
            .as_object()
            .cloned()
            .unwrap_or_default();
        if let Some(media_kind) = &self.media_kind {
            filters.insert("mediaKind".to_string(), json!(media_kind));
        }
        if let Some(media_status) = &self.media_status {
            filters.insert("mediaStatus".to_string(), json!(media_status));
        }
        Value::Object(filters)
    }
}

fn summarize_media_items_from_artifact(artifact: &Value) -> Vec<Value> {
    let mut media_items = Vec::new();
    if let Some(media_reference) = artifact
        .get("mediaReference")
        .filter(|value| value.is_object())
    {
        media_items.push(summarize_media_item(artifact, media_reference));
    }
    for key in ["mediaReferences", "mediaItems"] {
        if let Some(items) = artifact.get(key).and_then(Value::as_array) {
            media_items.extend(
                items
                    .iter()
                    .filter(|item| item.is_object())
                    .map(|item| summarize_media_item(artifact, item)),
            );
        }
    }
    media_items
}

fn summarize_media_item(artifact: &Value, media_item: &Value) -> Value {
    json!({
        "id": media_item.get("id").cloned().unwrap_or(Value::Null),
        "kind": media_item.get("kind").or_else(|| media_item.get("mediaKind")).cloned().unwrap_or(Value::Null),
        "status": media_item.get("status").or_else(|| media_item.get("mediaStatus")).cloned().unwrap_or(Value::Null),
        "path": media_item.get("path").or_else(|| media_item.get("filePath")).cloned().unwrap_or(Value::Null),
        "thumbnailPath": media_item.get("thumbnailPath").cloned().unwrap_or(Value::Null),
        "previewPath": media_item.get("previewPath").cloned().unwrap_or(Value::Null),
        "durationSeconds": media_item.get("durationSeconds").cloned().unwrap_or(Value::Null),
        "artifactId": artifact.get("id").cloned().unwrap_or(Value::Null),
        "artifactHandle": artifact.get("handle").cloned().unwrap_or(Value::Null),
        "artifactStage": artifact.get("stage").cloned().unwrap_or(Value::Null),
        "artifactType": artifact.get("type").cloned().unwrap_or(Value::Null),
        "episodeId": artifact.get("episodeId").cloned().unwrap_or(Value::Null)
    })
}

fn collect_missing_asset_reference_issues(
    issues: &mut Vec<Value>,
    artifact: &Value,
    asset_ids: &[String],
) {
    let Some(references) = artifact.get("references") else {
        return;
    };
    for field in ["characterAssetIds", "locationAssetIds", "propAssetIds"] {
        let Some(reference_ids) = references.get(field).and_then(Value::as_array) else {
            continue;
        };
        for reference_id in reference_ids.iter().filter_map(Value::as_str) {
            if asset_ids.iter().any(|asset_id| asset_id == reference_id) {
                continue;
            }
            issues.push(json!({
                "code": "missing_referenced_asset",
                "severity": "error",
                "artifactId": artifact.get("id").cloned().unwrap_or(Value::Null),
                "artifactHandle": artifact.get("handle").cloned().unwrap_or(Value::Null),
                "artifactStage": artifact.get("stage").cloned().unwrap_or(Value::Null),
                "episodeId": artifact.get("episodeId").cloned().unwrap_or(Value::Null),
                "referenceField": field,
                "missingId": reference_id,
                "message": "Artifact references an asset id that does not exist in .void/short-drama/assets."
            }));
        }
    }
}

fn collect_missing_script_segment_reference_issues(
    issues: &mut Vec<Value>,
    artifact: &Value,
    script_segment_ids: &[String],
) {
    let Some(references) = artifact.get("references") else {
        return;
    };
    let Some(reference_ids) = references.get("scriptSegmentIds").and_then(Value::as_array) else {
        return;
    };
    if script_segment_ids.is_empty() {
        return;
    }
    for reference_id in reference_ids.iter().filter_map(Value::as_str) {
        if script_segment_ids
            .iter()
            .any(|segment_id| segment_id == reference_id)
        {
            continue;
        }
        issues.push(json!({
            "code": "missing_referenced_script_segment",
            "severity": "error",
            "artifactId": artifact.get("id").cloned().unwrap_or(Value::Null),
            "artifactHandle": artifact.get("handle").cloned().unwrap_or(Value::Null),
            "artifactStage": artifact.get("stage").cloned().unwrap_or(Value::Null),
            "episodeId": artifact.get("episodeId").cloned().unwrap_or(Value::Null),
            "referenceField": "scriptSegmentIds",
            "missingId": reference_id,
            "message": "Artifact references a script segment id that does not exist in script-segment-index.json."
        }));
    }
}

fn collect_storyboard_reference_plan_issues(issues: &mut Vec<Value>, manifest: &Value) {
    let Some(plans) = manifest
        .get("storyboardReferencePlans")
        .and_then(Value::as_array)
    else {
        return;
    };
    for plan in plans {
        issues.extend(collect_plan_unresolved_issues(plan));
    }
}

fn collect_context_storyboard_reference_plan_issues(plans: &[Value]) -> Vec<Value> {
    plans
        .iter()
        .flat_map(collect_plan_unresolved_issues)
        .collect()
}

fn collect_unresolved_storyboard_reference_plan_refs(plans: &[Value]) -> Vec<Value> {
    plans
        .iter()
        .flat_map(|plan| {
            unresolved_reference_fields()
                .iter()
                .flat_map(move |(field, kind)| {
                    plan.get(*field)
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .filter_map(Value::as_str)
                        .map(move |name| {
                            json!({
                                "kind": kind,
                                "name": name,
                                "planId": plan.get("id").cloned().unwrap_or(Value::Null),
                                "episodeId": plan.get("episodeId").cloned().unwrap_or(Value::Null),
                                "sceneId": plan.get("sceneId").cloned().unwrap_or(Value::Null),
                                "shotId": plan.get("shotId").cloned().unwrap_or(Value::Null),
                                "scriptSegmentId": plan.get("scriptSegmentId").cloned().unwrap_or(Value::Null)
                            })
                        })
                })
        })
        .collect()
}

fn collect_plan_unresolved_issues(plan: &Value) -> Vec<Value> {
    unresolved_reference_fields()
        .iter()
        .flat_map(|(field, kind)| {
            plan.get(*field)
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(move |name| {
                    json!({
                        "code": "unresolved_storyboard_reference_plan",
                        "severity": "warning",
                        "kind": kind,
                        "planId": plan.get("id").cloned().unwrap_or(Value::Null),
                        "episodeId": plan.get("episodeId").cloned().unwrap_or(Value::Null),
                        "sceneId": plan.get("sceneId").cloned().unwrap_or(Value::Null),
                        "shotId": plan.get("shotId").cloned().unwrap_or(Value::Null),
                        "scriptSegmentId": plan.get("scriptSegmentId").cloned().unwrap_or(Value::Null),
                        "referenceField": field,
                        "unresolvedName": name,
                        "message": "StoryboardReferencePlan still has an unresolved character, location, or prop name that is not bound to an asset id."
                    })
                })
        })
        .collect()
}

fn unresolved_reference_fields() -> &'static [(&'static str, &'static str)] {
    &UNRESOLVED_REFERENCE_FIELDS
}

fn collect_media_reference_issues(issues: &mut Vec<Value>, artifact: &Value) {
    for media_item in summarize_media_items_from_artifact(artifact) {
        let status = media_item
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !matches!(status, "missing" | "error" | "failed") {
            continue;
        }
        issues.push(json!({
            "code": "media_reference_not_ready",
            "severity": "error",
            "artifactId": media_item.get("artifactId").cloned().unwrap_or(Value::Null),
            "artifactHandle": media_item.get("artifactHandle").cloned().unwrap_or(Value::Null),
            "artifactStage": media_item.get("artifactStage").cloned().unwrap_or(Value::Null),
            "artifactType": media_item.get("artifactType").cloned().unwrap_or(Value::Null),
            "episodeId": media_item.get("episodeId").cloned().unwrap_or(Value::Null),
            "mediaId": media_item.get("id").cloned().unwrap_or(Value::Null),
            "mediaKind": media_item.get("kind").cloned().unwrap_or(Value::Null),
            "mediaStatus": media_item.get("status").cloned().unwrap_or(Value::Null),
            "mediaPath": media_item.get("path").cloned().unwrap_or(Value::Null),
            "message": "Artifact media metadata reports a missing or failed media reference."
        }));
    }
}

#[derive(Debug, Default)]
struct ScriptSegmentFilters {
    id_or_handle: Option<String>,
    episode_id: Option<String>,
    query: Option<String>,
}

impl ScriptSegmentFilters {
    fn from_input(input: &ShortDramaProjectToolInput) -> Self {
        Self {
            id_or_handle: trimmed_value(input.id_or_handle.clone()),
            episode_id: trimmed_value(input.episode_id.clone()),
            query: trimmed_value(input.query.clone()),
        }
    }

    fn matches(&self, segment: &Value) -> bool {
        self.id_or_handle_matches(segment)
            && field_matches(&self.episode_id, segment, "episodeId")
            && self.query_matches(segment)
    }

    fn id_or_handle_matches(&self, segment: &Value) -> bool {
        let Some(id_or_handle) = &self.id_or_handle else {
            return true;
        };
        let target = id_or_handle.to_lowercase();
        ["id", "handle", "title"]
            .into_iter()
            .filter_map(|key| segment.get(key).and_then(Value::as_str))
            .any(|value| value.to_lowercase() == target || value.to_lowercase().contains(&target))
    }

    fn query_matches(&self, segment: &Value) -> bool {
        let Some(query) = &self.query else {
            return true;
        };
        let query = query.to_lowercase();
        ["title", "summary", "text"]
            .into_iter()
            .filter_map(|key| segment.get(key).and_then(Value::as_str))
            .any(|value| value.to_lowercase().contains(&query))
    }

    fn to_json(&self) -> Value {
        let mut filters = Map::new();
        if let Some(id_or_handle) = &self.id_or_handle {
            filters.insert("idOrHandle".to_string(), json!(id_or_handle));
        }
        if let Some(episode_id) = &self.episode_id {
            filters.insert("episodeId".to_string(), json!(episode_id));
        }
        if let Some(query) = &self.query {
            filters.insert("query".to_string(), json!(query));
        }
        Value::Object(filters)
    }
}

#[derive(Debug, Default)]
struct ArtifactFilters {
    stage: Option<String>,
    episode_id: Option<String>,
    artifact_type: Option<String>,
    status: Option<String>,
}

impl ArtifactFilters {
    fn from_input(input: &ShortDramaProjectToolInput) -> Self {
        Self {
            stage: trimmed_value(input.stage.clone()),
            episode_id: trimmed_value(input.episode_id.clone()),
            artifact_type: trimmed_value(input.artifact_type.clone()),
            status: trimmed_value(input.status.clone()),
        }
    }

    fn is_empty(&self) -> bool {
        self.stage.is_none()
            && self.episode_id.is_none()
            && self.artifact_type.is_none()
            && self.status.is_none()
    }

    fn matches(&self, value: &Value) -> bool {
        field_matches(&self.stage, value, "stage")
            && field_matches(&self.episode_id, value, "episodeId")
            && field_matches(&self.artifact_type, value, "type")
            && field_matches(&self.status, value, "status")
    }

    fn to_json(&self) -> Value {
        let mut filters = Map::new();
        if let Some(stage) = &self.stage {
            filters.insert("stage".to_string(), json!(stage));
        }
        if let Some(episode_id) = &self.episode_id {
            filters.insert("episodeId".to_string(), json!(episode_id));
        }
        if let Some(artifact_type) = &self.artifact_type {
            filters.insert("artifactType".to_string(), json!(artifact_type));
        }
        if let Some(status) = &self.status {
            filters.insert("status".to_string(), json!(status));
        }
        Value::Object(filters)
    }
}

fn field_matches(expected: &Option<String>, value: &Value, key: &str) -> bool {
    let Some(expected) = expected else {
        return true;
    };
    value
        .get(key)
        .and_then(Value::as_str)
        .is_some_and(|actual| actual.eq_ignore_ascii_case(expected))
}

fn snippet_around_match(content: &str, match_start: usize, match_len: usize) -> String {
    let start = previous_char_boundary(content, match_start.saturating_sub(160));
    let end = next_char_boundary(
        content,
        usize::min(match_start + match_len + 240, content.len()),
    );
    content[start..end].replace('\n', " ")
}

fn previous_char_boundary(content: &str, index: usize) -> usize {
    let mut boundary = 0;
    for (position, _) in content.char_indices() {
        if position > index {
            break;
        }
        boundary = position;
    }
    boundary
}

fn next_char_boundary(content: &str, index: usize) -> usize {
    if index >= content.len() {
        return content.len();
    }
    for (position, _) in content.char_indices() {
        if position >= index {
            return position;
        }
    }
    content.len()
}

fn artifact_matches(value: &Value, target: &str) -> bool {
    ["id", "handle", "displayName", "title"]
        .into_iter()
        .filter_map(|key| value.get(key).and_then(|item| item.as_str()))
        .any(|value| value.to_lowercase() == target || value.to_lowercase().contains(target))
}

fn artifact_id(value: &Value) -> Option<String> {
    value
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn artifact_not_found(id_or_handle: String) -> VoidResult<Value> {
    Ok(json!({
        "status": "error",
        "source": SOURCE,
        "error": {
            "code": "artifact_not_found",
            "message": "No short drama artifact matched idOrHandle."
        },
        "idOrHandle": id_or_handle
    }))
}

fn trimmed_value(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_asset_artifact_type(value: Option<&str>) -> Option<String> {
    let raw = value?.trim();
    let normalized = raw.to_ascii_lowercase();
    match normalized.as_str() {
        "character" | "char" => Some("character".to_string()),
        "location" | "loc" | "scene" => Some("location".to_string()),
        "prop" => Some("prop".to_string()),
        _ if raw == "角色" => Some("character".to_string()),
        _ if raw == "场景" || raw == "地点" => Some("location".to_string()),
        _ if raw == "道具" => Some("prop".to_string()),
        _ => None,
    }
}

fn normalize_stage_artifact_type(
    stage: Option<&str>,
    artifact_type: Option<&str>,
) -> Option<(String, String)> {
    let stage = match stage?.trim() {
        "storyboards" | "storyboard" | "split" | "分镜" => "storyboards",
        "video" | "videos" | "视频" => "video",
        "post" | "editor" | "editing" | "后期" => "post",
        _ => return None,
    }
    .to_string();
    let raw = artifact_type.unwrap_or_default().trim();
    let normalized = raw.to_ascii_lowercase();
    let artifact_type = match stage.as_str() {
        "storyboards" => match normalized.as_str() {
            "" | "storyboard" | "storyboard_image" | "image" | "keyframe" | "shot" => "storyboard",
            _ if raw == "分镜" || raw == "分镜图" => "storyboard",
            _ => return None,
        },
        "video" => match normalized.as_str() {
            "" | "video" | "clip" | "generated_video" | "media" | "shot_video" => "video",
            _ if raw == "视频" || raw == "镜头视频" => "video",
            _ => return None,
        },
        "post" => match normalized.as_str() {
            "" | "post" | "edit" | "editing" => "post",
            "final" | "final_video" | "video" | "master" | "movie" => "final",
            "subtitle" | "subtitles" | "captions" => "subtitle",
            "audio" | "sound" | "sfx" | "music" => "audio",
            _ if raw == "成片" || raw == "最终视频" => "final",
            _ if raw == "字幕" => "subtitle",
            _ if raw == "音频" || raw == "音效" => "audio",
            _ => return None,
        },
        _ => return None,
    }
    .to_string();
    Some((stage, artifact_type))
}

fn sync_storyboard_reference_unresolved_placeholders(plan: &mut Value) {
    sync_unresolved_reference_names(
        plan,
        "characterNames",
        "characterAssetIds",
        "unresolvedCharacterNames",
    );
    sync_unresolved_reference_names(
        plan,
        "locationNames",
        "locationAssetIds",
        "unresolvedLocationNames",
    );
    sync_unresolved_reference_names(plan, "propNames", "propAssetIds", "unresolvedPropNames");
}

fn sync_unresolved_reference_names(
    plan: &mut Value,
    names_field: &str,
    asset_ids_field: &str,
    unresolved_names_field: &str,
) {
    let has_bound_assets = plan
        .get(asset_ids_field)
        .and_then(Value::as_array)
        .is_some_and(|items| !items.is_empty());
    if has_bound_assets {
        return;
    }
    let names: Vec<String> = plan
        .get(names_field)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect();
    if names.is_empty() {
        return;
    }
    set_object_value(plan, unresolved_names_field, json!(names));
}

fn set_object_value(value: &mut Value, key: &str, field_value: Value) {
    if !value.is_object() {
        *value = json!({});
    }
    if let Some(object) = value.as_object_mut() {
        object.insert(key.to_string(), field_value);
    }
}

fn push_object_array(value: &mut Value, key: &str, item: Value) {
    if !value.is_object() {
        *value = json!({});
    }
    if let Some(object) = value.as_object_mut() {
        object
            .entry(key.to_string())
            .or_insert_with(|| Value::Array(Vec::new()));
        if let Some(items) = object.get_mut(key).and_then(Value::as_array_mut) {
            items.push(item);
        }
    }
}

fn merge_artifact_patch(artifact: &mut Value, patch: &Value) -> Vec<String> {
    let mut changed_fields = Vec::new();
    let Some(patch_object) = patch.as_object() else {
        return changed_fields;
    };

    for (key, value) in patch_object {
        if key == "prompt" {
            merge_prompt_patch(artifact, value);
            changed_fields.push(key.clone());
            continue;
        }
        set_object_value(artifact, key, value.clone());
        changed_fields.push(key.clone());
    }
    changed_fields
}

fn merge_prompt_patch(artifact: &mut Value, prompt_patch: &Value) {
    let Some(prompt_patch_object) = prompt_patch.as_object() else {
        return;
    };
    if !artifact.is_object() {
        *artifact = json!({});
    }
    let Some(artifact_object) = artifact.as_object_mut() else {
        return;
    };
    if !artifact_object.get("prompt").is_some_and(Value::is_object) {
        artifact_object.insert("prompt".to_string(), Value::Object(Map::new()));
    }
    let Some(prompt) = artifact_object
        .get_mut("prompt")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    for (key, value) in prompt_patch_object {
        prompt.insert(key.clone(), value.clone());
    }
}

#[derive(Debug, Clone)]
struct ScriptEpisode {
    id: String,
    number: usize,
    title: String,
    heading: String,
    start_offset: usize,
    end_offset: usize,
}

fn parse_script_episodes(script_content: &str) -> Vec<ScriptEpisode> {
    let mut headings = Vec::new();
    let mut offset = 0usize;
    for line in script_content.split_inclusive('\n') {
        let line_without_newline = line.trim_end_matches(['\r', '\n']);
        if let Some(number) = parse_script_episode_number(line_without_newline) {
            headings.push((number, line_without_newline.trim().to_string(), offset));
        }
        offset += line.len();
    }
    if headings.is_empty() {
        return vec![ScriptEpisode {
            id: "episode-01".to_string(),
            number: 1,
            title: "Episode 01".to_string(),
            heading: "Episode 01".to_string(),
            start_offset: 0,
            end_offset: script_content.len(),
        }];
    }

    headings
        .iter()
        .enumerate()
        .map(|(index, (number, heading, start_offset))| {
            let end_offset = headings
                .get(index + 1)
                .map(|(_, _, next_start)| *next_start)
                .unwrap_or(script_content.len());
            ScriptEpisode {
                id: format!("episode-{}", format_episode_number(*number)),
                number: *number,
                title: format!("Episode {}", format_episode_number(*number)),
                heading: heading.clone(),
                start_offset: *start_offset,
                end_offset,
            }
        })
        .collect()
}

fn parse_script_episode_number(line: &str) -> Option<usize> {
    let trimmed = line.trim().trim_start_matches('#').trim();
    if let Some(after_prefix) = trimmed.strip_prefix('第') {
        if let Some((digits, _)) = after_prefix.split_once('集') {
            let compact_digits = digits
                .chars()
                .filter(|character| character.is_ascii_digit())
                .collect::<String>();
            if !compact_digits.is_empty() {
                return compact_digits
                    .parse::<usize>()
                    .ok()
                    .filter(|number| *number > 0);
            }
        }
    }

    let lower = trimmed.to_ascii_lowercase();
    for prefix in ["episode", "ep"] {
        if let Some(rest) = lower.strip_prefix(prefix) {
            let digits = rest
                .chars()
                .skip_while(|character| character.is_ascii_whitespace())
                .take_while(|character| character.is_ascii_digit())
                .collect::<String>();
            if !digits.is_empty() {
                return digits.parse::<usize>().ok().filter(|number| *number > 0);
            }
        }
    }
    None
}

fn create_initialized_manifest(
    project_id: &str,
    title: &str,
    episodes: &[ScriptEpisode],
    script_artifacts: &[Value],
    script_content: &str,
    source_actor: &str,
    user_instruction: &str,
    timestamp: u128,
) -> Value {
    let episode_values = episodes
        .iter()
        .map(|episode| {
            json!({
                "id": episode.id,
                "number": episode.number,
                "title": episode.title,
                "summary": format!("Initialized from {}.", episode.heading)
            })
        })
        .collect::<Vec<_>>();
    let active_episode_id = episodes.first().map(|episode| episode.id.as_str());

    json!({
        "manifestVersion": 1,
        "projectId": project_id,
        "title": title,
        "status": "draft",
        "activeStage": "script",
        "activeEpisodeId": active_episode_id,
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "indexVersions": {
            "artifact": 1,
            "media": 1,
            "scriptSegment": 1,
            "search": 1
        },
        "source": {
            "kind": "script",
            "sourceActor": source_actor,
            "userInstruction": user_instruction
        },
        "episodes": episode_values.clone(),
        "stages": {
            "script": { "status": "ready" },
            "assets": { "status": "empty" },
            "storyboards": { "status": "empty" },
            "video": { "status": "empty" },
            "post": { "status": "empty" }
        },
        "storyboardReferencePlans": [],
        "project": {
            "projectId": project_id,
            "title": title,
            "status": "draft",
            "activeStage": "script",
            "activeEpisodeId": active_episode_id,
            "episodes": episode_values,
            "artifacts": script_artifacts,
            "productionPlan": {
                "status": "pending",
                "mode": "semiAutomatic",
                "goal": user_instruction,
                "episodeRange": if episodes.is_empty() {
                    "Episode 00-00".to_string()
                } else {
                    format!(
                        "Episode {}-{}",
                        format_episode_number(episodes.first().map(|episode| episode.number).unwrap_or(1)),
                        format_episode_number(episodes.last().map(|episode| episode.number).unwrap_or(1))
                    )
                },
                "steps": []
            },
            "scriptDocument": {
                "kind": "markdown",
                "content": script_content
            },
            "storyboardReferencePlans": [],
            "changeRequests": []
        }
    })
}

fn create_script_segment_index(script_content: &str, episodes: &[ScriptEpisode]) -> Vec<Value> {
    episodes
        .iter()
        .map(|episode| {
            let text = script_content
                .get(episode.start_offset..episode.end_offset)
                .unwrap_or_default()
                .trim()
                .to_string();
            let episode_label = format_episode_number(episode.number);
            json!({
                "id": format!("script-segment-episode-{episode_label}"),
                "handle": format!("EP{episode_label}-SCRIPT"),
                "episodeId": episode.id,
                "episodeNumber": episode.number,
                "title": episode.title,
                "headingText": episode.heading,
                "summary": summarize_script_segment_text(&text),
                "text": text,
                "startOffset": episode.start_offset,
                "endOffset": episode.end_offset
            })
        })
        .collect()
}

fn create_initialized_script_artifacts(
    project_id: &str,
    episodes: &[ScriptEpisode],
    source_actor: &str,
    timestamp: u128,
) -> Vec<Value> {
    episodes
        .iter()
        .map(|episode| {
            let episode_label = format_episode_number(episode.number);
            json!({
                "id": format!("{}-script", episode.id),
                "handle": format!("EP{episode_label}-SCRIPT01"),
                "displayName": format!("第{}集 剧本", episode.number),
                "episodeId": episode.id,
                "stage": "script",
                "type": "script",
                "title": format!("Episode {episode_label} script"),
                "summary": format!("Initialized from {}.", episode.heading),
                "agentRole": "director",
                "status": "ready",
                "revisionCount": 1,
                "attemptCount": 0,
                "references": {
                    "scriptSegmentIds": [format!("script-segment-episode-{episode_label}")]
                },
                "revisions": [{
                    "id": format!("revision-{project_id}-{}-init", episode.id),
                    "version": 1,
                    "createdAt": timestamp,
                    "summary": "Initialized short drama project from script.",
                    "changedFields": ["project", "scriptDocument"],
                    "reason": "initialize_from_script",
                    "source": if source_actor == "ScriptAI" { "stageAgent" } else { "mainAI" }
                }],
                "attempts": []
            })
        })
        .collect()
}

fn create_bootstrap_search_index(
    manifest: &Value,
    script_content: &str,
    script_segments: &[Value],
) -> Value {
    let mut entries = vec![
        json!({
            "id": "manifest",
            "label": "manifest.json",
            "kind": "manifest",
            "text": manifest.get("title").and_then(Value::as_str).unwrap_or_default()
        }),
        json!({
            "id": "script",
            "label": "script.md",
            "kind": "script",
            "text": summarize_script_segment_text(script_content)
        }),
    ];
    entries.extend(script_segments.iter().map(|segment| {
        json!({
            "id": segment.get("id").cloned().unwrap_or(Value::Null),
            "label": segment.get("handle").cloned().unwrap_or(Value::Null),
            "kind": "scriptSegment",
            "text": segment.get("summary").cloned().unwrap_or(Value::Null)
        })
    }));

    json!({
        "version": 1,
        "source": SOURCE,
        "entries": entries
    })
}

fn summarize_script_segment_text(text: &str) -> String {
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    limit_string(&collapsed, Some(220))
}

fn format_episode_number(number: usize) -> String {
    format!("{number:02}")
}

async fn write_json_pretty(path: &Path, value: &Value) -> VoidResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.map_err(|error| {
            VoidError::io(format!("Failed to create short drama directory: {error}"))
        })?;
    }
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| VoidError::tool(format!("Failed to render short drama JSON: {error}")))?;
    fs::write(path, content)
        .await
        .map_err(|error| VoidError::io(format!("Failed to write short drama JSON: {error}")))
}

async fn append_json_line(path: &Path, value: &Value) -> VoidResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.map_err(|error| {
            VoidError::io(format!(
                "Failed to create short drama sidecar directory: {error}"
            ))
        })?;
    }
    let line = serde_json::to_string(value)
        .map_err(|error| VoidError::tool(format!("Failed to render short drama JSONL: {error}")))?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
        .map_err(|error| VoidError::io(format!("Failed to open short drama JSONL: {error}")))?;
    file.write_all(line.as_bytes())
        .await
        .map_err(|error| VoidError::io(format!("Failed to append short drama JSONL: {error}")))?;
    file.write_all(b"\n").await.map_err(|error| {
        VoidError::io(format!(
            "Failed to append short drama JSONL newline: {error}"
        ))
    })
}

fn sanitize_file_stem(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if sanitized.is_empty() {
        "artifact".to_string()
    } else {
        sanitized
    }
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

async fn file_state(path: &Path) -> VoidResult<Value> {
    match fs::metadata(path).await {
        Ok(metadata) => Ok(json!({
            "path": path,
            "exists": true,
            "bytes": metadata.len()
        })),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(json!({
            "path": path,
            "exists": false
        })),
        Err(error) => Err(VoidError::io(format!(
            "Failed to inspect short drama file: {error}"
        ))),
    }
}

async fn count_json_files(path: &Path) -> VoidResult<usize> {
    Ok(list_file_names(path)
        .await?
        .into_iter()
        .filter(|name| name.ends_with(".json"))
        .count())
}

async fn list_file_names(path: &Path) -> VoidResult<Vec<String>> {
    if !path_exists(path).await {
        return Ok(Vec::new());
    }

    let mut entries = fs::read_dir(path)
        .await
        .map_err(|error| VoidError::io(format!("Failed to list short drama directory: {error}")))?;
    let mut names = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|error| {
        VoidError::io(format!(
            "Failed to read short drama directory entry: {error}"
        ))
    })? {
        names.push(entry.file_name().to_string_lossy().to_string());
    }
    names.sort();
    Ok(names)
}

async fn path_exists(path: &Path) -> bool {
    fs::metadata(path).await.is_ok()
}

fn limited_json(data: Value, max_chars: Option<usize>) -> VoidResult<Value> {
    let rendered = serde_json::to_string(&data).map_err(|error| {
        VoidError::tool(format!("Failed to render short drama result: {error}"))
    })?;
    let max_chars = normalize_max_chars(max_chars);
    if rendered.chars().count() <= max_chars {
        return Ok(data);
    }

    Ok(json!({
        "status": "ready",
        "source": SOURCE,
        "truncated": true,
        "content": limit_string(&rendered, Some(max_chars))
    }))
}

fn limit_string(content: &str, max_chars: Option<usize>) -> String {
    let max_chars = normalize_max_chars(max_chars);
    if content.chars().count() <= max_chars {
        return content.to_string();
    }
    content.chars().take(max_chars).collect::<String>()
}

fn normalize_max_chars(max_chars: Option<usize>) -> usize {
    max_chars
        .unwrap_or(MAX_DEFAULT_CHARS)
        .clamp(1, MAX_LIMIT_CHARS)
}

fn short_drama_input_is_write_action(input: Option<&Value>) -> bool {
    let Some(input) = input else {
        return true;
    };
    matches!(
        input.get("action").and_then(Value::as_str),
        Some(
            "set_focus"
                | "request_change"
                | "update_change_request_status"
                | "bind_storyboard_reference_asset"
                | "upsert_storyboard_reference_plan"
                | "link_storyboard_reference_plan"
                | "create_attempt"
                | "update_artifact_prompt"
                | "upsert_asset_artifact"
                | "upsert_stage_artifact"
                | "initialize_from_script",
        )
    )
}

fn render_short_drama_result(data: &Value) -> String {
    match data.get("status").and_then(|value| value.as_str()) {
        Some("ready") => render_ready_short_drama_result(data),
        Some("indexed") => "Short drama project was initialized and indexed.".to_string(),
        Some("script_ready") => "Short drama script is saved and ready for indexing.".to_string(),
        Some("no_project") => "No AI short drama project exists in this workspace yet.".to_string(),
        Some("denied") => data
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(|message| message.as_str())
            .unwrap_or("Short drama project action was denied by policy.")
            .to_string(),
        Some("empty") => "No AI short drama project was found in this workspace.".to_string(),
        Some("unsupported") => {
            "AI short drama project inspection is unsupported in this workspace.".to_string()
        }
        Some("error") => data
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(|message| message.as_str())
            .unwrap_or("Short drama project inspection failed.")
            .to_string(),
        _ => "Short drama project tool completed.".to_string(),
    }
}

fn render_ready_short_drama_result(data: &Value) -> String {
    if let Some(content) = data.get("content").and_then(Value::as_str) {
        let path = data
            .get("path")
            .and_then(Value::as_str)
            .unwrap_or("short-drama project content");
        return format!("Short drama project content from {path}:\n\n{content}");
    }

    for key in [
        "scriptSegments",
        "artifacts",
        "mediaItems",
        "artifact",
        "results",
        "integrity",
        "focus",
        "changeRequests",
        "storyboardReferencePlan",
        "revision",
    ] {
        if let Some(value) = data.get(key) {
            let rendered =
                serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string());
            return format!("Short drama project {key}:\n\n{rendered}");
        }
    }

    "Short drama project data is ready.".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::tools::framework::Tool;
    use crate::agentic::tools::ToolRuntimeRestrictions;
    use crate::agentic::WorkspaceBinding;
    use std::collections::HashMap;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn infer_asset_artifact_type_prefers_location_then_prop_then_character() {
        assert_eq!(
            infer_asset_artifact_type("空间站指挥舱内景 红色警示灯"),
            Some("location".to_string())
        );
        assert_eq!(
            infer_asset_artifact_type("金属手提箱 装满信件的旧道具"),
            Some("prop".to_string())
        );
        assert_eq!(
            infer_asset_artifact_type("队长肖像 宇航服半身像"),
            Some("character".to_string())
        );
        assert_eq!(infer_asset_artifact_type("远帆号·夜航"), None);
        // Latin hints match whole words only, so "command deck" must not read as "man".
        assert_eq!(infer_asset_artifact_type("command deck wide shot"), None);
        assert_eq!(
            infer_asset_artifact_type("character sheet portrait"),
            Some("character".to_string())
        );
    }

    #[test]
    fn render_ready_result_includes_script_content_for_assistant() {
        let rendered = render_short_drama_result(&json!({
            "status": "ready",
            "source": SOURCE,
            "path": "C:/workspace/.void/short-drama/script.md",
            "content": "# 雨夜测试短剧\n\n## 第一集：雨夜重逢\n\n废弃车站。"
        }));

        assert!(rendered.contains("script.md"));
        assert!(rendered.contains("# 雨夜测试短剧"));
        assert!(rendered.contains("废弃车站"));
        assert_ne!(rendered, "Short drama project data is ready.");
    }

    #[test]
    fn render_ready_result_includes_structured_script_segments_for_assistant() {
        let rendered = render_short_drama_result(&json!({
            "status": "ready",
            "source": SOURCE,
            "scriptSegments": [
                {
                    "id": "script-ep01",
                    "episodeId": "episode-01",
                    "text": "第1集 雨夜重逢"
                }
            ]
        }));

        assert!(rendered.contains("scriptSegments"));
        assert!(rendered.contains("script-ep01"));
        assert!(rendered.contains("雨夜重逢"));
        assert_ne!(rendered, "Short drama project data is ready.");
    }

    #[tokio::test]
    async fn returns_no_project_when_workspace_has_no_short_drama_project() {
        let root = make_temp_workspace("empty");
        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result =
            call_single_result(&tool, json!({ "action": "get_awareness" }), &context).await;

        assert_eq!(result["status"], "no_project");
        assert_eq!(result["projectState"], "no_project");
        assert_eq!(result["recommendedNextAction"], "initialize_from_script");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn reads_awareness_and_artifact_from_workspace_project() {
        let root = make_temp_workspace("ready");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"manifestVersion":1,"projectId":"short-drama-1","indexVersions":{"artifact":1},"project":{"projectId":"short-drama-1"}}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("script.md"),
            "# 第1集\nChai Yong sees the letter.",
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{"id":"storyboard-1","handle":"EP01-SB01","stage":"storyboards","type":"storyboard","status":"ready","references":{"characterAssetIds":["char-1"]}}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("indexes").join("artifact-index.json"),
            r#"[]"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let awareness =
            call_single_result(&tool, json!({ "action": "get_awareness" }), &context).await;
        let artifact = call_single_result(
            &tool,
            json!({ "action": "read_artifact", "idOrHandle": "EP01-SB01" }),
            &context,
        )
        .await;

        assert_eq!(awareness["status"], "ready");
        assert_eq!(awareness["schemaKind"], "ui-envelope-v1");
        assert_eq!(awareness["manifestVersion"], 1);
        assert_eq!(awareness["artifacts"]["count"], 1);
        assert_eq!(artifact["status"], "ready");
        assert_eq!(artifact["artifact"]["id"], "storyboard-1");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn awareness_reports_persistent_stage_agent_bindings() {
        let root = make_temp_workspace("stage-agent-bindings");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("sessions")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"manifestVersion":1,"projectId":"short-drama-1","indexVersions":{"artifact":1},"project":{"projectId":"short-drama-1"}}"#,
        )
        .unwrap();
        std::fs::write(project_dir.join("script.md"), "# Episode 01").unwrap();
        std::fs::write(
            project_dir.join("sessions").join("stage-agents.json"),
            json!({
                "schemaVersion": 1,
                "workspaceRoot": root,
                "updatedAt": 1,
                "bindings": {
                    "script": {
                        "stage": "script",
                        "agentName": "ScriptAI",
                        "childSessionId": "script-live",
                        "parentSessionId": "main-live",
                        "workspaceRoot": root,
                        "status": "ready",
                        "source": "main_ai_wake"
                    }
                }
            })
            .to_string(),
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());
        let awareness =
            call_single_result(&tool, json!({ "action": "get_awareness" }), &context).await;

        assert_eq!(awareness["stageAgentBindings"]["status"], "ready");
        let stage_agent_bindings = awareness["stageAgentBindings"]["bindings"]
            .as_array()
            .unwrap();
        assert_eq!(stage_agent_bindings.len(), 5);
        assert_eq!(
            awareness["stageAgentBindings"]["bindings"][0]["childSessionId"],
            "script-live"
        );
        assert_eq!(
            awareness["stageAgentBindings"]["bindings"][0]["status"],
            "ready"
        );
        assert_eq!(
            awareness["stageAgentBindings"]["bindings"][1]["stage"],
            "assets"
        );
        assert_eq!(
            awareness["stageAgentBindings"]["bindings"][1]["agentName"],
            "AssetAI"
        );
        assert_eq!(
            awareness["stageAgentBindings"]["bindings"][1]["status"],
            "unbound"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn writes_focus_and_change_request_sidecars() {
        let root = make_temp_workspace("write-focus");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{"id":"storyboard-1","handle":"EP01-SB01","stage":"storyboards","type":"storyboard","status":"ready"}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let focus = call_single_result(
            &tool,
            json!({
                "action": "set_focus",
                "stage": "storyboards",
                "episodeId": "episode-01",
                "artifactHandle": "EP01-SB01",
                "mediaItemId": "media-1",
                "selectionSource": "right-panel"
            }),
            &context,
        )
        .await;
        let request = call_single_result(
            &tool,
            json!({
                "action": "request_change",
                "idOrHandle": "EP01-SB01",
                "targetStage": "assets",
                "referencePlanId": "plan-episode-01-sc01-sh01",
                "reason": "Storyboard references an unbound character asset.",
                "suggestion": "Bind the palace guard character image before regenerating this storyboard.",
                "sourceActor": "SplitAI",
                "referenceIssue": {
                    "kind": "missingReference",
                    "referenceKind": "character",
                    "unresolvedName": "palace guard"
                }
            }),
            &context,
        )
        .await;

        assert_eq!(focus["status"], "ready");
        assert_eq!(request["status"], "ready");
        let focus_file = std::fs::read_to_string(project_dir.join("focus.json")).unwrap();
        let focus_json: Value = serde_json::from_str(&focus_file).unwrap();
        assert_eq!(focus_json["activeStage"], "storyboards");
        assert_eq!(focus_json["activeEpisodeId"], "episode-01");
        assert_eq!(focus_json["activeArtifactHandle"], "EP01-SB01");

        let requests_file =
            std::fs::read_to_string(project_dir.join("change-requests.jsonl")).unwrap();
        assert!(requests_file.contains("\"targetStage\":\"assets\""));
        assert!(requests_file.contains("\"sourceActor\":\"SplitAI\""));
        assert!(requests_file.contains("\"sourceAgent\":\"SplitAI\""));
        assert!(requests_file.contains("\"targetArtifactId\":\"storyboard-1\""));
        assert!(requests_file.contains("\"targetReferencePlan\":\"plan-episode-01-sc01-sh01\""));
        assert!(requests_file.contains("\"referenceIssue\":{\"kind\":\"missingReference\""));
        assert!(requests_file.contains("\"focus\":{\"activeArtifactHandle\":\"EP01-SB01\""));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn writes_attempt_and_prompt_revision_projection() {
        let root = make_temp_workspace("write-artifact");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("video.json"),
            r#"{"id":"video-1","handle":"EP01-VID01","stage":"video","type":"video","status":"ready","prompt":{"positive":"old prompt"},"revisionCount":0,"attemptCount":0}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let attempt = call_single_result(
            &tool,
            json!({
                "action": "create_attempt",
                "idOrHandle": "EP01-VID01",
                "runId": "run-1",
                "status": "running",
                "userInstruction": "Regenerate with stronger palace rain atmosphere.",
                "sourceActor": "VideoAI",
                "sourceSessionId": "video-agent-session-01"
            }),
            &context,
        )
        .await;
        let revision = call_single_result(
            &tool,
            json!({
                "action": "update_artifact_prompt",
                "idOrHandle": "EP01-VID01",
                "patch": {
                    "prompt": {
                        "positive": "new prompt",
                        "motion": "slow push in"
                    }
                },
                "reason": "User asked for stronger atmosphere.",
                "userInstruction": "Make the palace rain more cinematic.",
                "sourceActor": "VideoAI"
            }),
            &context,
        )
        .await;

        assert_eq!(attempt["status"], "ready");
        assert_eq!(revision["status"], "ready");
        let artifact_file =
            std::fs::read_to_string(project_dir.join("artifacts").join("video.json")).unwrap();
        let artifact_json: Value = serde_json::from_str(&artifact_file).unwrap();
        assert_eq!(artifact_json["attemptCount"], 1);
        assert_eq!(artifact_json["revisionCount"], 1);
        assert_eq!(artifact_json["prompt"]["positive"], "new prompt");
        assert_eq!(artifact_json["prompt"]["motion"], "slow push in");
        assert_eq!(artifact_json["attempts"][0]["runId"], "run-1");
        assert_eq!(
            artifact_json["attempts"][0]["sourceSessionId"],
            "video-agent-session-01"
        );
        assert_eq!(artifact_json["revisions"][0]["version"], 1);

        let attempts_file =
            std::fs::read_to_string(project_dir.join("attempts").join("video-1.jsonl")).unwrap();
        let revisions_file =
            std::fs::read_to_string(project_dir.join("revisions").join("video-1.jsonl")).unwrap();
        assert!(attempts_file.contains("\"sourceActor\":\"VideoAI\""));
        assert!(attempts_file.contains("\"sourceSessionId\":\"video-agent-session-01\""));
        assert!(revisions_file.contains("\"changedFields\":[\"prompt\"]"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn assetai_can_upsert_asset_artifact_for_generated_image_binding() {
        let root = make_temp_workspace("upsert-asset-artifact");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let upserted = call_single_result(
            &tool,
            json!({
                "action": "upsert_asset_artifact",
                "artifactType": "角色",
                "artifactHandle": "CHAR-001",
                "title": "林晚 / 第一集雨夜造型",
                "summary": "雨夜回到废弃车站，衣角被雨水浸透。",
                "status": "ready",
                "patch": {
                    "prompt": {
                        "positive": "cinematic rainy night character reference"
                    },
                    "mediaReference": {
                        "mediaItemId": "media-linwan-ep01-rain",
                        "kind": "image",
                        "status": "ready",
                        "previewUrl": "void-media://media-linwan-ep01-rain",
                        "label": "林晚 / 第一集雨夜造型"
                    }
                },
                "userInstruction": "从剧本提取资产并生成第一张角色图。",
                "sourceActor": "AssetAI"
            }),
            &context,
        )
        .await;
        let listed = call_single_result(
            &tool,
            json!({
                "action": "list_artifacts",
                "stage": "assets",
                "artifactType": "character"
            }),
            &context,
        )
        .await;

        assert_eq!(upserted["status"], "ready");
        assert_eq!(upserted["artifact"]["stage"], "assets");
        assert_eq!(upserted["artifact"]["type"], "character");
        assert_eq!(upserted["artifact"]["handle"], "CHAR-001");
        assert_eq!(
            upserted["artifact"]["mediaReference"]["mediaItemId"],
            "media-linwan-ep01-rain"
        );
        assert_eq!(listed["artifacts"].as_array().unwrap().len(), 1);

        let asset_file =
            std::fs::read_to_string(project_dir.join("assets").join("CHAR-001.json")).unwrap();
        let asset_json: Value = serde_json::from_str(&asset_file).unwrap();
        assert_eq!(asset_json["title"], "林晚 / 第一集雨夜造型");
        assert_eq!(
            asset_json["prompt"]["positive"],
            "cinematic rainy night character reference"
        );
        assert_eq!(asset_json["revisionCount"], 1);
        assert_eq!(asset_json["revisions"][0]["sourceActor"], "AssetAI");
        let artifact_index_file =
            std::fs::read_to_string(project_dir.join("indexes").join("artifact-index.json"))
                .unwrap();
        let artifact_index: Value = serde_json::from_str(&artifact_index_file).unwrap();
        assert!(artifact_index
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["handle"] == "CHAR-001" && item["stage"] == "assets"));
        let manifest_file = std::fs::read_to_string(project_dir.join("manifest.json")).unwrap();
        let manifest_json: Value = serde_json::from_str(&manifest_file).unwrap();
        assert!(manifest_json["project"]["artifacts"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["handle"] == "CHAR-001" && item["stage"] == "assets"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn stage_agents_can_upsert_owned_artifacts_with_media_references() {
        let root = make_temp_workspace("upsert-stage-artifacts");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1","project":{"artifacts":[]}}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let storyboard = call_single_result(
            &tool,
            json!({
                "action": "upsert_stage_artifact",
                "stage": "storyboards",
                "artifactType": "image",
                "artifactHandle": "EP01-SB01",
                "episodeId": "episode-01",
                "title": "雨夜重逢分镜",
                "summary": "林晚在废弃车站回头。",
                "status": "ready",
                "patch": {
                    "prompt": { "positive": "cinematic rainy station storyboard" },
                    "references": {
                        "scriptSegmentIds": ["script-episode-01-scene-01"],
                        "characterAssetIds": ["CHAR-001"],
                        "locationAssetIds": ["LOC-001"]
                    },
                    "mediaReference": {
                        "mediaItemId": "media-storyboard-01",
                        "kind": "image",
                        "status": "ready",
                        "previewUrl": "void-media://media-storyboard-01"
                    }
                },
                "sourceActor": "SplitAI",
                "userInstruction": "登记第一集第一张分镜图。"
            }),
            &context,
        )
        .await;
        let video = call_single_result(
            &tool,
            json!({
                "action": "upsert_stage_artifact",
                "stage": "video",
                "artifactType": "clip",
                "artifactHandle": "EP01-VID01",
                "episodeId": "episode-01",
                "title": "雨夜车站镜头",
                "summary": "慢推到林晚手中的戒指。",
                "status": "ready",
                "patch": {
                    "references": {
                        "storyboardArtifactIds": ["EP01-SB01"],
                        "characterAssetIds": ["CHAR-001"]
                    },
                    "mediaReference": {
                        "mediaItemId": "media-video-01",
                        "kind": "video",
                        "status": "ready",
                        "path": "media/video/ep01-vid01.mp4"
                    }
                },
                "sourceActor": "VideoAI",
                "userInstruction": "登记第一集视频镜头。"
            }),
            &context,
        )
        .await;
        let post = call_single_result(
            &tool,
            json!({
                "action": "upsert_stage_artifact",
                "stage": "post",
                "artifactType": "final_video",
                "artifactHandle": "EP01-POST01",
                "episodeId": "episode-01",
                "title": "第一集成片",
                "summary": "含字幕和音效的第一集成片。",
                "status": "ready",
                "patch": {
                    "references": {
                        "videoArtifactIds": ["EP01-VID01"]
                    },
                    "mediaReference": {
                        "mediaItemId": "media-final-01",
                        "kind": "video",
                        "status": "ready",
                        "path": "media/post/ep01-final.mp4"
                    }
                },
                "sourceActor": "EditorAI",
                "userInstruction": "登记第一集后期成片。"
            }),
            &context,
        )
        .await;
        let denied = call_single_result(
            &tool,
            json!({
                "action": "upsert_stage_artifact",
                "stage": "video",
                "artifactHandle": "EP01-VID02",
                "title": "越权视频",
                "sourceActor": "AssetAI"
            }),
            &context,
        )
        .await;

        assert_eq!(storyboard["status"], "ready");
        assert_eq!(storyboard["artifact"]["stage"], "storyboards");
        assert_eq!(storyboard["artifact"]["type"], "storyboard");
        assert_eq!(
            storyboard["artifact"]["mediaReference"]["mediaItemId"],
            "media-storyboard-01"
        );
        assert_eq!(video["artifact"]["type"], "video");
        assert_eq!(post["artifact"]["type"], "final");
        assert_eq!(denied["status"], "denied");
        assert_eq!(denied["policy"]["targetStage"], "video");
        assert_eq!(denied["policy"]["requiredActor"], "VideoAI");

        let artifact_index_file =
            std::fs::read_to_string(project_dir.join("indexes").join("artifact-index.json"))
                .unwrap();
        let artifact_index: Value = serde_json::from_str(&artifact_index_file).unwrap();
        assert!(artifact_index
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["handle"] == "EP01-SB01" && item["type"] == "storyboard"));
        assert!(artifact_index
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["handle"] == "EP01-VID01" && item["type"] == "video"));
        assert!(artifact_index
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["handle"] == "EP01-POST01" && item["type"] == "final"));

        let media_index_file =
            std::fs::read_to_string(project_dir.join("indexes").join("media-index.json")).unwrap();
        let media_index: Value = serde_json::from_str(&media_index_file).unwrap();
        assert_eq!(media_index.as_array().unwrap().len(), 3);

        let audit_file = std::fs::read_to_string(project_dir.join("audit-log.jsonl")).unwrap();
        assert!(audit_file.contains("\"action\":\"upsert_stage_artifact\""));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn builds_explainable_context_package_from_focus_and_references() {
        let root = make_temp_workspace("context-package");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{
                "projectId": "short-drama-1",
                "storyboardReferencePlans": [{
                    "id": "plan-episode-01-sc01-sh01",
                    "episodeId": "episode-01",
                    "sceneId": "SC01",
                    "shotId": "SH01",
                    "scriptSegmentId": "script-segment-episode-01",
                    "characterAssetIds": ["asset-character-1"],
                    "locationAssetIds": [],
                    "propAssetIds": ["asset-prop-1"],
                    "unresolvedLocationNames": ["banquet hall"],
                    "requiredBeats": ["guard discovers the sealed letter"],
                    "visualNotes": ["wide lantern composition"]
                }]
            }"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("focus.json"),
            r#"{"activeStage":"storyboards","activeEpisodeId":"episode-01","activeArtifactHandle":"EP01-SB01","selectionSource":"right-panel"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{
                "id":"storyboard-1",
                "handle":"EP01-SB01",
                "stage":"storyboards",
                "type":"storyboard",
                "episodeId":"episode-01",
                "title":"Shot 01 storyboard",
                "summary":"Guard discovers the sealed letter.",
                "references":{
                    "scriptSegmentIds":["script-segment-episode-01"],
                    "characterAssetIds":["asset-character-1"],
                    "propAssetIds":["asset-prop-1"]
                }
            }"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("character.json"),
            r#"{"id":"asset-character-1","handle":"CHAR-001","stage":"assets","type":"character","title":"Chai Yong","summary":"Main guard face reference."}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("prop.json"),
            r#"{"id":"asset-prop-1","handle":"PROP-001","stage":"assets","type":"prop","title":"Half-hidden letter","summary":"Red sealed letter prop."}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("indexes").join("script-segment-index.json"),
            r#"[{"id":"script-segment-episode-01","episodeId":"episode-01","title":"第1集","summary":"Chai Yong discovers a sealed letter.","text":"Chai Yong discovers a sealed letter during the banquet."}]"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({
                "action": "get_context_package",
                "agentRole": "SplitAI"
            }),
            &context,
        )
        .await;

        assert_eq!(result["status"], "ready");
        assert_eq!(
            result["contextPackage"]["focus"]["activeArtifactHandle"],
            "EP01-SB01"
        );
        assert_eq!(
            result["contextPackage"]["targetArtifact"]["id"],
            "storyboard-1"
        );
        assert_eq!(
            result["contextPackage"]["referencedAssets"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            result["contextPackage"]["storyboardReferencePlans"][0]["unresolvedLocationNames"][0],
            "banquet hall"
        );
        assert_eq!(result["contextPackage"]["contextStatus"], "needs_attention");
        assert_eq!(
            result["contextPackage"]["unresolvedReferences"][0]["kind"],
            "location"
        );
        assert_eq!(
            result["contextPackage"]["unresolvedReferences"][0]["name"],
            "banquet hall"
        );
        assert_eq!(
            result["contextPackage"]["contextIssues"][0]["code"],
            "unresolved_storyboard_reference_plan"
        );
        assert_eq!(
            result["contextPackage"]["contextIssues"][0]["referenceField"],
            "unresolvedLocationNames"
        );
        assert_eq!(
            result["contextPackage"]["scriptSegments"][0]["id"],
            "script-segment-episode-01"
        );
        assert!(result["contextPackage"]["includedContext"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["type"] == "storyboardReferencePlan"));
        assert!(result["contextPackage"]["omittedContext"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["type"] == "raw_media_payloads"));
        assert!(result["contextPackage"]["policyApplied"]
            .as_str()
            .unwrap()
            .contains("SplitAI"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn context_package_includes_assets_from_storyboard_plan_when_artifact_refs_are_empty() {
        let root = make_temp_workspace("context-package-plan-assets");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{
                "projectId": "short-drama-1",
                "storyboardReferencePlans": [{
                    "id": "plan-episode-01-sc02-sh03",
                    "episodeId": "episode-01",
                    "sceneId": "SC02",
                    "shotId": "SH03",
                    "scriptSegmentId": "script-segment-episode-01",
                    "characterAssetIds": ["asset-character-2"],
                    "locationAssetIds": ["asset-location-1"],
                    "propAssetIds": ["asset-prop-2"],
                    "requiredBeats": ["maid enters the rainy corridor"],
                    "visualNotes": ["hold the same corridor palette"]
                }]
            }"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("focus.json"),
            r#"{"activeStage":"storyboards","activeEpisodeId":"episode-01","activeArtifactHandle":"EP01-SB03","selectionSource":"right-panel"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{
                "id":"storyboard-3",
                "handle":"EP01-SB03",
                "stage":"storyboards",
                "type":"storyboard",
                "episodeId":"episode-01",
                "title":"Shot 03 storyboard",
                "summary":"Maid enters the rainy corridor.",
                "references":{
                    "scriptSegmentIds":["script-segment-episode-01"]
                }
            }"#,
        )
        .unwrap();
        for (file_name, id, handle, title, artifact_type) in [
            (
                "character.json",
                "asset-character-2",
                "CHAR-002",
                "Maid Lin",
                "character",
            ),
            (
                "location.json",
                "asset-location-1",
                "LOC-001",
                "Rain corridor",
                "location",
            ),
            (
                "prop.json",
                "asset-prop-2",
                "PROP-002",
                "Blue lantern",
                "prop",
            ),
        ] {
            std::fs::write(
                project_dir.join("assets").join(file_name),
                format!(
                    r#"{{"id":"{id}","handle":"{handle}","stage":"assets","type":"{artifact_type}","title":"{title}","summary":"Referenced by plan only."}}"#
                ),
            )
            .unwrap();
        }
        std::fs::write(
            project_dir.join("indexes").join("script-segment-index.json"),
            r#"[{"id":"script-segment-episode-01","episodeId":"episode-01","title":"第1集","summary":"Rain corridor beat.","text":"Maid Lin enters the rainy corridor holding a blue lantern."}]"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({
                "action": "get_context_package",
                "agentRole": "SplitAI"
            }),
            &context,
        )
        .await;

        let referenced_assets = result["contextPackage"]["referencedAssets"]
            .as_array()
            .unwrap();
        let referenced_asset_ids = referenced_assets
            .iter()
            .filter_map(|asset| asset["id"].as_str())
            .collect::<Vec<_>>();
        assert_eq!(result["status"], "ready");
        assert!(referenced_asset_ids.contains(&"asset-character-2"));
        assert!(referenced_asset_ids.contains(&"asset-location-1"));
        assert!(referenced_asset_ids.contains(&"asset-prop-2"));
        assert!(result["contextPackage"]["includedContext"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["id"] == "asset-location-1"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn context_package_omits_raw_media_payloads_and_unreferenced_context() {
        let root = make_temp_workspace("context-package-omits-raw-media");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("focus.json"),
            r#"{"activeStage":"video","activeEpisodeId":"episode-01","activeArtifactHandle":"EP01-VID01","selectionSource":"right-panel"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("video.json"),
            r#"{
                "id":"video-1",
                "handle":"EP01-VID01",
                "stage":"video",
                "type":"video",
                "episodeId":"episode-01",
                "title":"Shot 01 video",
                "references":{
                    "scriptSegmentIds":["script-segment-episode-01"],
                    "storyboardArtifactIds":["storyboard-1"],
                    "characterAssetIds":["asset-character-1"]
                },
                "mediaReference":{
                    "id":"media-video-1",
                    "kind":"video",
                    "status":"ready",
                    "path":"media/video/ep01.mp4",
                    "thumbnailPath":"media/thumbs/ep01.jpg",
                    "durationSeconds":6,
                    "rawMediaPayload":"RAW_VIDEO_BYTES_SHOULD_NOT_LEAK",
                    "base64":"BASE64_VIDEO_SHOULD_NOT_LEAK",
                    "providerSecret":"SECRET_SHOULD_NOT_LEAK"
                }
            }"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("character.json"),
            r#"{
                "id":"asset-character-1",
                "handle":"CHAR-001",
                "stage":"assets",
                "type":"character",
                "title":"Hero",
                "mediaReference":{
                    "id":"media-char-1",
                    "kind":"image",
                    "status":"ready",
                    "thumbnailPath":"media/thumbs/char.jpg",
                    "rawMediaPayload":"RAW_IMAGE_BYTES_SHOULD_NOT_LEAK"
                }
            }"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("unused-character.json"),
            r#"{"id":"asset-unused","handle":"CHAR-UNUSED","stage":"assets","type":"character","title":"Unused should not appear"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir
                .join("indexes")
                .join("script-segment-index.json"),
            r#"[{"id":"script-segment-episode-01","episodeId":"episode-01","text":"Video beat."}]"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({
                "action": "get_context_package",
                "agentRole": "VideoAI"
            }),
            &context,
        )
        .await;

        let context_package = &result["contextPackage"];
        let serialized = serde_json::to_string(context_package).unwrap();
        assert_eq!(result["status"], "ready");
        assert!(context_package["includedContext"].is_array());
        assert!(context_package["omittedContext"].is_array());
        assert!(context_package["reason"]
            .as_str()
            .unwrap()
            .contains("focused"));
        assert!(context_package["policyApplied"]
            .as_str()
            .unwrap()
            .contains("VideoAI"));
        assert!(context_package["omittedContext"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["type"] == "raw_media_payloads"));
        assert!(context_package["omittedContext"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["type"] == "unreferenced_assets"));
        assert!(serialized.contains("media-video-1"));
        assert!(serialized.contains("media-char-1"));
        assert!(!serialized.contains("RAW_VIDEO_BYTES_SHOULD_NOT_LEAK"));
        assert!(!serialized.contains("BASE64_VIDEO_SHOULD_NOT_LEAK"));
        assert!(!serialized.contains("SECRET_SHOULD_NOT_LEAK"));
        assert!(!serialized.contains("RAW_IMAGE_BYTES_SHOULD_NOT_LEAK"));
        assert!(!serialized.contains("asset-unused"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn video_context_package_traces_referenced_storyboard_and_assets() {
        let root = make_temp_workspace("video-context-trace");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("focus.json"),
            r#"{"activeStage":"video","activeEpisodeId":"episode-01","activeArtifactHandle":"EP01-VID01","selectionSource":"right-panel"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("video.json"),
            r#"{
                "id":"video-1",
                "handle":"EP01-VID01",
                "stage":"video",
                "type":"video",
                "episodeId":"episode-01",
                "title":"Shot 01 video",
                "references":{"storyboardArtifactIds":["storyboard-1"]}
            }"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{
                "id":"storyboard-1",
                "handle":"EP01-SB01",
                "stage":"storyboards",
                "type":"storyboard",
                "episodeId":"episode-01",
                "title":"Shot 01 storyboard",
                "references":{
                    "scriptSegmentIds":["script-segment-episode-01"],
                    "characterAssetIds":["asset-character-1"],
                    "locationAssetIds":["asset-location-1"],
                    "propAssetIds":["asset-prop-1"]
                }
            }"#,
        )
        .unwrap();
        for (file_name, id, artifact_type, title) in [
            (
                "character.json",
                "asset-character-1",
                "character",
                "Hero reference",
            ),
            (
                "location.json",
                "asset-location-1",
                "location",
                "Palace gate",
            ),
            ("prop.json", "asset-prop-1", "prop", "Sealed letter"),
        ] {
            std::fs::write(
                project_dir.join("assets").join(file_name),
                format!(
                    r#"{{"id":"{id}","stage":"assets","type":"{artifact_type}","title":"{title}"}}"#
                ),
            )
            .unwrap();
        }
        std::fs::write(
            project_dir
                .join("indexes")
                .join("script-segment-index.json"),
            r#"[{"id":"script-segment-episode-01","episodeId":"episode-01","text":"Hero crosses the palace gate with the sealed letter."}]"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({
                "action": "get_context_package",
                "agentRole": "VideoAI"
            }),
            &context,
        )
        .await;

        let context_package = &result["contextPackage"];
        let referenced_storyboards = context_package["referencedStoryboards"].as_array().unwrap();
        let referenced_asset_ids = context_package["referencedAssets"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|asset| asset["id"].as_str())
            .collect::<Vec<_>>();
        let script_segment_ids = context_package["scriptSegments"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|segment| segment["id"].as_str())
            .collect::<Vec<_>>();

        assert_eq!(result["status"], "ready");
        assert_eq!(referenced_storyboards.len(), 1);
        assert_eq!(referenced_storyboards[0]["id"], "storyboard-1");
        assert!(referenced_asset_ids.contains(&"asset-character-1"));
        assert!(referenced_asset_ids.contains(&"asset-location-1"));
        assert!(referenced_asset_ids.contains(&"asset-prop-1"));
        assert!(script_segment_ids.contains(&"script-segment-episode-01"));
        assert!(context_package["includedContext"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["type"] == "storyboard" && entry["id"] == "storyboard-1"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn context_package_includes_related_open_change_requests() {
        let root = make_temp_workspace("context-package-change-requests");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("focus.json"),
            r#"{"activeStage":"storyboards","activeEpisodeId":"episode-01","activeArtifactHandle":"EP01-SB01","selectionSource":"right-panel"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{
                "id":"storyboard-1",
                "handle":"EP01-SB01",
                "stage":"storyboards",
                "type":"storyboard",
                "episodeId":"episode-01",
                "title":"Shot 01 storyboard",
                "references":{"scriptSegmentIds":["script-segment-episode-01"]}
            }"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("indexes").join("script-segment-index.json"),
            r#"[{"id":"script-segment-episode-01","episodeId":"episode-01","title":"第1集","summary":"Storyboard beat.","text":"A guard moves through palace rain."}]"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("change-requests.jsonl"),
            [
                r#"{"id":"cr-1","status":"open","sourceActor":"VideoAI","targetStage":"storyboards","targetArtifactId":"storyboard-1","targetArtifactHandle":"EP01-SB01","reason":"Video generation needs clearer camera motion.","suggestion":"Add dolly-in direction.","createdAt":1}"#,
                r#"{"id":"cr-2","status":"open","sourceActor":"SplitAI","targetStage":"assets","targetArtifactHandle":"CHAR-001","reason":"Need costume variant.","suggestion":"Generate a cloak.","createdAt":2}"#,
                r#"{"id":"cr-3","status":"resolved","sourceActor":"VideoAI","targetStage":"storyboards","targetArtifactHandle":"EP01-SB01","reason":"Old issue.","suggestion":"Already fixed.","createdAt":3}"#,
            ]
            .join("\n"),
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({
                "action": "get_context_package",
                "agentRole": "SplitAI"
            }),
            &context,
        )
        .await;

        let change_requests = result["contextPackage"]["changeRequests"]
            .as_array()
            .unwrap();
        assert_eq!(result["status"], "ready");
        assert_eq!(change_requests.len(), 1);
        assert_eq!(change_requests[0]["id"], "cr-1");
        assert_eq!(change_requests[0]["sourceActor"], "VideoAI");
        assert!(result["contextPackage"]["includedContext"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["type"] == "changeRequest" && entry["id"] == "cr-1"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn reads_script_segments_by_id_or_episode_query() {
        let root = make_temp_workspace("read-script-segment");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("indexes").join("script-segment-index.json"),
            r#"[
                {"id":"script-segment-episode-01","handle":"EP01-SCRIPT","episodeId":"episode-01","title":"第1集","summary":"Guard finds a letter.","text":"Chai Yong finds a sealed letter by the gate."},
                {"id":"script-segment-episode-02","handle":"EP02-SCRIPT","episodeId":"episode-02","title":"第2集","summary":"密信被调包。","text":"第二集里，宫门密信被人调包。"},
                {"id":"script-segment-episode-02-scene-02","handle":"EP02-SC02","episodeId":"episode-02","title":"第2集 第二场","summary":"Rain corridor chase.","text":"雨廊追逐，没有密信出现。"}
            ]"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let by_id = call_single_result(
            &tool,
            json!({
                "action": "read_script_segment",
                "idOrHandle": "EP02-SCRIPT"
            }),
            &context,
        )
        .await;
        let by_episode_query = call_single_result(
            &tool,
            json!({
                "action": "read_script_segment",
                "episodeId": "episode-02",
                "query": "密信"
            }),
            &context,
        )
        .await;

        assert_eq!(by_id["status"], "ready");
        assert_eq!(by_id["workspaceRoot"], json!(root.clone()));
        assert_eq!(by_id["projectPath"], json!(project_dir.clone()));
        assert_eq!(by_id["scriptSegments"].as_array().unwrap().len(), 1);
        assert_eq!(
            by_id["scriptSegments"][0]["id"],
            "script-segment-episode-02"
        );
        assert_eq!(by_episode_query["status"], "ready");
        assert_eq!(by_episode_query["workspaceRoot"], json!(root.clone()));
        assert_eq!(by_episode_query["projectPath"], json!(project_dir.clone()));
        assert_eq!(by_episode_query["filters"]["episodeId"], "episode-02");
        assert_eq!(by_episode_query["filters"]["query"], "密信");
        assert_eq!(
            by_episode_query["scriptSegments"].as_array().unwrap().len(),
            2
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn read_policy_denies_full_script_for_videoai_but_allows_script_segment() {
        let root = make_temp_workspace("read-policy-script");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(project_dir.join("script.md"), "# 第1集\n完整剧本内容").unwrap();
        std::fs::write(
            project_dir
                .join("indexes")
                .join("script-segment-index.json"),
            r#"[{"id":"seg-1","episodeId":"episode-01","text":"本镜剧情片段。"}]"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let denied = call_single_result(
            &tool,
            json!({
                "action": "read_script",
                "sourceActor": "VideoAI"
            }),
            &context,
        )
        .await;
        let segment = call_single_result(
            &tool,
            json!({
                "action": "read_script_segment",
                "idOrHandle": "seg-1",
                "sourceActor": "VideoAI"
            }),
            &context,
        )
        .await;

        assert_eq!(denied["status"], "denied");
        assert_eq!(denied["error"]["code"], "read_policy_denied");
        assert_eq!(denied["policy"]["allowedAction"], "read_script_segment");
        assert_eq!(segment["status"], "ready");
        assert_eq!(segment["scriptSegments"][0]["id"], "seg-1");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn lists_media_summaries_with_stage_kind_and_status_filters() {
        let root = make_temp_workspace("list-media");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{"id":"storyboard-1","handle":"EP01-SB01","stage":"storyboards","type":"storyboard","episodeId":"episode-01","status":"ready","mediaReference":{"id":"media-img-1","kind":"image","status":"ready","path":"media/storyboards/ep01-sb01.png","thumbnailPath":"media/thumbs/ep01-sb01.png"}}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("video.json"),
            r#"{"id":"video-1","handle":"EP01-VID01","stage":"video","type":"video","episodeId":"episode-01","status":"ready","mediaReference":{"id":"media-video-1","kind":"video","status":"ready","path":"media/video/ep01-vid01.mp4","thumbnailPath":"media/thumbs/ep01-vid01.jpg","durationSeconds":6}}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("missing-video.json"),
            r#"{"id":"video-2","handle":"EP01-VID02","stage":"video","type":"video","episodeId":"episode-01","status":"missing","mediaReference":{"id":"media-video-2","kind":"video","status":"missing","path":"media/video/missing.mp4"}}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({
                "action": "list_media",
                "stage": "video",
                "mediaKind": "video",
                "mediaStatus": "ready"
            }),
            &context,
        )
        .await;

        let media_items = result["mediaItems"].as_array().unwrap();
        assert_eq!(result["status"], "ready");
        assert_eq!(result["filters"]["stage"], "video");
        assert_eq!(result["filters"]["mediaKind"], "video");
        assert_eq!(result["filters"]["mediaStatus"], "ready");
        assert_eq!(media_items.len(), 1);
        assert_eq!(media_items[0]["id"], "media-video-1");
        assert_eq!(media_items[0]["kind"], "video");
        assert_eq!(media_items[0]["artifactHandle"], "EP01-VID01");
        assert_eq!(media_items[0]["path"], "media/video/ep01-vid01.mp4");
        assert_eq!(media_items[0]["durationSeconds"], 6);
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn validates_integrity_reports_missing_referenced_assets() {
        let root = make_temp_workspace("validate-integrity");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("character.json"),
            r#"{"id":"asset-character-1","handle":"CHAR-001","stage":"assets","type":"character","status":"ready"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{
                "id":"storyboard-1",
                "handle":"EP01-SB01",
                "stage":"storyboards",
                "type":"storyboard",
                "episodeId":"episode-01",
                "references":{
                    "characterAssetIds":["asset-character-1"],
                    "propAssetIds":["asset-prop-missing"]
                }
            }"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result =
            call_single_result(&tool, json!({ "action": "validate_integrity" }), &context).await;

        let issues = result["integrity"]["issues"].as_array().unwrap();
        assert_eq!(result["status"], "ready");
        assert_eq!(result["integrity"]["status"], "issues_found");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0]["code"], "missing_referenced_asset");
        assert_eq!(issues[0]["artifactId"], "storyboard-1");
        assert_eq!(issues[0]["artifactHandle"], "EP01-SB01");
        assert_eq!(issues[0]["missingId"], "asset-prop-missing");
        assert_eq!(issues[0]["referenceField"], "propAssetIds");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn validates_integrity_reports_missing_media_references() {
        let root = make_temp_workspace("validate-media-integrity");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("video.json"),
            r#"{
                "id":"video-1",
                "handle":"EP01-VID01",
                "stage":"video",
                "type":"video",
                "episodeId":"episode-01",
                "mediaReference":{
                    "id":"media-video-1",
                    "kind":"video",
                    "status":"missing",
                    "path":"media/video/ep01-vid01.mp4"
                }
            }"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result =
            call_single_result(&tool, json!({ "action": "validate_integrity" }), &context).await;

        let issues = result["integrity"]["issues"].as_array().unwrap();
        assert_eq!(result["status"], "ready");
        assert_eq!(result["integrity"]["status"], "issues_found");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0]["code"], "media_reference_not_ready");
        assert_eq!(issues[0]["artifactId"], "video-1");
        assert_eq!(issues[0]["artifactHandle"], "EP01-VID01");
        assert_eq!(issues[0]["mediaId"], "media-video-1");
        assert_eq!(issues[0]["mediaStatus"], "missing");
        assert_eq!(issues[0]["mediaPath"], "media/video/ep01-vid01.mp4");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn validates_integrity_reports_missing_script_segment_references() {
        let root = make_temp_workspace("validate-script-segment-integrity");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("indexes").join("script-segment-index.json"),
            r#"[{"id":"script-segment-episode-01","episodeId":"episode-01","title":"第1集","text":"A valid segment."}]"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{
                "id":"storyboard-1",
                "handle":"EP01-SB01",
                "stage":"storyboards",
                "type":"storyboard",
                "episodeId":"episode-01",
                "references":{
                    "scriptSegmentIds":["script-segment-episode-01","script-segment-missing"]
                }
            }"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result =
            call_single_result(&tool, json!({ "action": "validate_integrity" }), &context).await;

        let issues = result["integrity"]["issues"].as_array().unwrap();
        assert_eq!(result["status"], "ready");
        assert_eq!(result["integrity"]["status"], "issues_found");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0]["code"], "missing_referenced_script_segment");
        assert_eq!(issues[0]["artifactId"], "storyboard-1");
        assert_eq!(issues[0]["artifactHandle"], "EP01-SB01");
        assert_eq!(issues[0]["missingId"], "script-segment-missing");
        assert_eq!(issues[0]["referenceField"], "scriptSegmentIds");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn validates_integrity_reports_unresolved_storyboard_reference_plan_names() {
        let root = make_temp_workspace("validate-storyboard-plan-integrity");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{
                "projectId":"short-drama-1",
                "storyboardReferencePlans":[{
                    "id":"plan-episode-01-sc01-sh01",
                    "episodeId":"episode-01",
                    "sceneId":"SC01",
                    "shotId":"SH01",
                    "scriptSegmentId":"script-segment-episode-01",
                    "characterAssetIds":["asset-character-1"],
                    "locationAssetIds":[],
                    "propAssetIds":[],
                    "unresolvedLocationNames":["banquet hall"]
                }]
            }"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result =
            call_single_result(&tool, json!({ "action": "validate_integrity" }), &context).await;

        let issues = result["integrity"]["issues"].as_array().unwrap();
        assert_eq!(result["status"], "ready");
        assert_eq!(result["integrity"]["status"], "issues_found");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0]["code"], "unresolved_storyboard_reference_plan");
        assert_eq!(issues[0]["planId"], "plan-episode-01-sc01-sh01");
        assert_eq!(issues[0]["episodeId"], "episode-01");
        assert_eq!(issues[0]["referenceField"], "unresolvedLocationNames");
        assert_eq!(issues[0]["unresolvedName"], "banquet hall");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn binds_storyboard_reference_plan_placeholder_to_asset_anchor() {
        let root = make_temp_workspace("bind-storyboard-reference-asset");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{
                "projectId":"short-drama-1",
                "storyboardReferencePlans":[{
                    "id":"plan-episode-01-sc01-sh01",
                    "episodeId":"episode-01",
                    "sceneId":"SC01",
                    "shotId":"SH01",
                    "scriptSegmentId":"script-segment-episode-01",
                    "characterNames":["palace guard"],
                    "characterAssetIds":[],
                    "locationAssetIds":[],
                    "propAssetIds":[],
                    "unresolvedCharacterNames":["palace guard"]
                }]
            }"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("palace-guard.json"),
            r#"{"id":"asset-character-guard","handle":"CHAR-001","stage":"assets","type":"character","displayName":"palace guard"}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({
                "action": "bind_storyboard_reference_asset",
                "idOrHandle": "plan-episode-01-sc01-sh01",
                "referenceKind": "character",
                "assetIdOrHandle": "CHAR-001",
                "sourceActor": "AssetAI"
            }),
            &context,
        )
        .await;

        let manifest_file = std::fs::read_to_string(project_dir.join("manifest.json")).unwrap();
        let manifest_json: Value = serde_json::from_str(&manifest_file).unwrap();
        let asset_file =
            std::fs::read_to_string(project_dir.join("assets").join("palace-guard.json")).unwrap();
        let asset_json: Value = serde_json::from_str(&asset_file).unwrap();
        let plan = &manifest_json["storyboardReferencePlans"][0];
        assert_eq!(result["status"], "ready");
        assert_eq!(
            result["storyboardReferencePlan"]["id"],
            "plan-episode-01-sc01-sh01"
        );
        assert_eq!(plan["characterAssetIds"][0], "asset-character-guard");
        assert_eq!(plan["characterNames"][0], "palace guard");
        assert_eq!(
            plan["unresolvedCharacterNames"].as_array().unwrap().len(),
            0
        );
        assert_eq!(
            asset_json["usedBy"][0]["storyboardReferencePlanId"],
            "plan-episode-01-sc01-sh01"
        );
        assert_eq!(asset_json["usedBy"][0]["referenceKind"], "character");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn links_storyboard_artifact_to_reference_plan() {
        let root = make_temp_workspace("link-storyboard-reference-plan");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{
                "projectId":"short-drama-1",
                "storyboardReferencePlans":[{
                    "id":"plan-episode-01-sc01-sh01",
                    "episodeId":"episode-01",
                    "sceneId":"SC01",
                    "shotId":"SH01",
                    "scriptSegmentId":"script-segment-episode-01",
                    "characterNames":["palace guard"],
                    "locationNames":["gate courtyard"],
                    "propNames":["sealed letter"],
                    "characterAssetIds":["asset-character-guard"],
                    "locationAssetIds":["asset-location-gate"],
                    "propAssetIds":["asset-prop-letter"],
                    "unresolvedLocationNames":["gate courtyard"],
                    "requiredBeats":["guard discovers the sealed letter"],
                    "visualNotes":["wide lantern composition"],
                    "actionNotes":["slowly opens the gate"],
                    "emotionNotes":["suspicious"],
                    "cameraIntent":["push into hand close-up"]
                }]
            }"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{"id":"storyboard-1","handle":"EP01-SB01","stage":"storyboards","type":"storyboard","episodeId":"episode-01"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("guard.json"),
            r#"{"id":"asset-character-guard","handle":"CHAR-001","stage":"assets","type":"character"}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({
                "action": "link_storyboard_reference_plan",
                "idOrHandle": "EP01-SB01",
                "referencePlanId": "plan-episode-01-sc01-sh01",
                "sourceActor": "SplitAI"
            }),
            &context,
        )
        .await;

        let artifact_file =
            std::fs::read_to_string(project_dir.join("artifacts").join("storyboard.json")).unwrap();
        let artifact_json: Value = serde_json::from_str(&artifact_file).unwrap();
        assert_eq!(result["status"], "ready");
        assert_eq!(
            artifact_json["references"]["storyboardReferencePlanIds"][0],
            "plan-episode-01-sc01-sh01"
        );
        assert_eq!(
            artifact_json["references"]["scriptSegmentIds"][0],
            "script-segment-episode-01"
        );
        assert_eq!(
            artifact_json["references"]["characterAssetIds"][0],
            "asset-character-guard"
        );
        assert_eq!(
            artifact_json["references"]["locationAssetIds"][0],
            "asset-location-gate"
        );
        assert_eq!(
            artifact_json["references"]["propAssetIds"][0],
            "asset-prop-letter"
        );
        assert_eq!(
            artifact_json["references"]["referenceSnapshots"][0]["storyboardReferencePlanId"],
            "plan-episode-01-sc01-sh01"
        );
        assert_eq!(
            artifact_json["references"]["referenceSnapshots"][0]["characterNames"][0],
            "palace guard"
        );
        assert_eq!(
            artifact_json["references"]["referenceSnapshots"][0]["unresolvedLocationNames"][0],
            "gate courtyard"
        );
        assert_eq!(
            artifact_json["references"]["referenceSnapshots"][0]["actionNotes"][0],
            "slowly opens the gate"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn scriptai_upserts_storyboard_reference_plan_in_manifest() {
        let root = make_temp_workspace("upsert-storyboard-reference-plan");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{
                "projectId":"short-drama-1",
                "storyboardReferencePlans":[{
                    "id":"plan-episode-01-sc01-sh01",
                    "episodeId":"episode-01",
                    "sceneId":"SC01",
                    "shotId":"SH01",
                    "scriptSegmentId":"script-segment-episode-01",
                    "characterNames":["old guard"],
                    "visualNotes":["old composition"]
                }]
            }"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({
                "action": "upsert_storyboard_reference_plan",
                "referencePlanId": "plan-episode-01-sc01-sh01",
                "patch": {
                    "episodeId": "episode-01",
                    "sceneId": "SC01",
                    "shotId": "SH01",
                    "scriptSegmentId": "script-segment-episode-01",
                    "characterNames": ["palace guard", "masked envoy"],
                    "locationNames": ["gate courtyard"],
                    "propNames": ["sealed letter"],
                    "requiredBeats": ["guard discovers the letter"],
                    "visualNotes": ["wide lantern composition"],
                    "actionNotes": ["slow push to the letter"],
                    "emotionNotes": ["suspicious"],
                    "cameraIntent": ["dolly-in close-up"]
                },
                "reason": "ScriptAI extracted shot references from the script.",
                "sourceActor": "ScriptAI"
            }),
            &context,
        )
        .await;

        let manifest_file = std::fs::read_to_string(project_dir.join("manifest.json")).unwrap();
        let manifest_json: Value = serde_json::from_str(&manifest_file).unwrap();
        let plan = &manifest_json["storyboardReferencePlans"][0];
        assert_eq!(result["status"], "ready");
        assert_eq!(
            result["storyboardReferencePlan"]["id"],
            "plan-episode-01-sc01-sh01"
        );
        assert_eq!(plan["characterNames"][0], "palace guard");
        assert_eq!(plan["characterNames"][1], "masked envoy");
        assert_eq!(plan["locationNames"][0], "gate courtyard");
        assert_eq!(plan["propNames"][0], "sealed letter");
        assert_eq!(plan["unresolvedCharacterNames"][0], "palace guard");
        assert_eq!(plan["unresolvedCharacterNames"][1], "masked envoy");
        assert_eq!(plan["unresolvedLocationNames"][0], "gate courtyard");
        assert_eq!(plan["unresolvedPropNames"][0], "sealed letter");
        assert_eq!(plan["audit"][0]["sourceActor"], "ScriptAI");
        assert_eq!(
            plan["audit"][0]["reason"],
            "ScriptAI extracted shot references from the script."
        );

        let denied = call_single_result(
            &tool,
            json!({
                "action": "upsert_storyboard_reference_plan",
                "referencePlanId": "plan-episode-01-sc01-sh01",
                "patch": {
                    "visualNotes": ["video agent tries to rewrite the script breakdown"]
                },
                "reason": "VideoAI should not directly rewrite ScriptAI breakdown.",
                "sourceActor": "VideoAI"
            }),
            &context,
        )
        .await;
        assert_eq!(denied["status"], "denied");
        assert_eq!(denied["error"]["code"], "write_policy_denied");
        assert_eq!(denied["policy"]["allowedAction"], "request_change");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn lists_reads_and_searches_assets_as_project_artifacts() {
        let root = make_temp_workspace("asset-search");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("character.json"),
            r#"{"id":"asset-character-1","handle":"CHAR-001","stage":"assets","type":"character","title":"Chai Yong","summary":"Lead guard face reference with scar."}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let list = call_single_result(&tool, json!({ "action": "list_artifacts" }), &context).await;
        let read = call_single_result(
            &tool,
            json!({ "action": "read_artifact", "idOrHandle": "CHAR-001" }),
            &context,
        )
        .await;
        let search = call_single_result(
            &tool,
            json!({ "action": "search", "query": "scar" }),
            &context,
        )
        .await;

        assert_eq!(list["status"], "ready");
        assert_eq!(list["workspaceRoot"], json!(root.clone()));
        assert_eq!(list["projectPath"], json!(project_dir.clone()));
        assert!(list["artifacts"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["id"] == "asset-character-1" && item["stage"] == "assets"));
        assert_eq!(read["status"], "ready");
        assert_eq!(read["workspaceRoot"], json!(root.clone()));
        assert_eq!(read["projectPath"], json!(project_dir.clone()));
        assert_eq!(read["artifact"]["id"], "asset-character-1");
        assert_eq!(search["workspaceRoot"], json!(root.clone()));
        assert_eq!(search["projectPath"], json!(project_dir.clone()));
        assert!(search["results"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["label"] == "assets/character.json"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn filters_artifacts_by_stage_episode_type_and_status() {
        let root = make_temp_workspace("artifact-filters");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard-ready.json"),
            r#"{"id":"storyboard-1","handle":"EP02-SB01","stage":"storyboards","type":"storyboard","episodeId":"episode-02","status":"ready"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard-error.json"),
            r#"{"id":"storyboard-2","handle":"EP02-SB02","stage":"storyboards","type":"storyboard","episodeId":"episode-02","status":"error"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("video-ready.json"),
            r#"{"id":"video-1","handle":"EP02-VID01","stage":"video","type":"video","episodeId":"episode-02","status":"ready"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("character.json"),
            r#"{"id":"asset-character-1","handle":"CHAR-001","stage":"assets","type":"character","status":"ready"}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({
                "action": "list_artifacts",
                "stage": "storyboards",
                "episodeId": "episode-02",
                "artifactType": "storyboard",
                "status": "ready"
            }),
            &context,
        )
        .await;

        let artifacts = result["artifacts"].as_array().unwrap();
        assert_eq!(result["status"], "ready");
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0]["id"], "storyboard-1");
        assert_eq!(result["filters"]["stage"], "storyboards");
        assert_eq!(result["filters"]["artifactType"], "storyboard");
        assert_eq!(result["filters"]["status"], "ready");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn search_handles_chinese_snippets_without_utf8_boundary_panics() {
        let root = make_temp_workspace("chinese-search");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("script.md"),
            "# 第1集\n宫门夜雨中，柴勇发现密信。第二集继续追查。",
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({ "action": "search", "query": "密信" }),
            &context,
        )
        .await;

        assert_eq!(result["status"], "ready");
        assert!(result["results"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["label"] == "script.md"
                && item["snippet"].as_str().unwrap().contains("密信")));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn denies_cross_stage_direct_prompt_update_but_allows_change_request() {
        let root = make_temp_workspace("write-policy");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{"id":"storyboard-1","handle":"EP01-SB01","stage":"storyboards","type":"storyboard","status":"ready","prompt":{"positive":"old prompt"}}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let denied = call_single_result(
            &tool,
            json!({
                "action": "update_artifact_prompt",
                "idOrHandle": "EP01-SB01",
                "patch": { "prompt": { "positive": "video agent edits storyboard" } },
                "reason": "Video render found storyboard motion unclear.",
                "userInstruction": "Fix this storyboard for video.",
                "sourceActor": "VideoAI"
            }),
            &context,
        )
        .await;
        let request = call_single_result(
            &tool,
            json!({
                "action": "request_change",
                "idOrHandle": "EP01-SB01",
                "targetStage": "storyboards",
                "reason": "VideoAI found missing motion direction.",
                "suggestion": "SplitAI should add a clear dolly-in direction.",
                "sourceActor": "VideoAI"
            }),
            &context,
        )
        .await;

        assert_eq!(denied["status"], "denied");
        assert_eq!(denied["error"]["code"], "write_policy_denied");
        assert_eq!(denied["policy"]["allowedAction"], "request_change");
        assert_eq!(request["status"], "ready");

        let artifact_file =
            std::fs::read_to_string(project_dir.join("artifacts").join("storyboard.json")).unwrap();
        let artifact_json: Value = serde_json::from_str(&artifact_file).unwrap();
        assert_eq!(artifact_json["prompt"]["positive"], "old prompt");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn videoai_cannot_directly_write_script_assets_or_storyboards() {
        let root = make_temp_workspace("videoai-cross-stage-policy");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{"id":"storyboard-1","handle":"EP01-SB01","stage":"storyboards","type":"storyboard","status":"ready","prompt":{"positive":"old storyboard prompt"}}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("character.json"),
            r#"{"id":"asset-character-1","handle":"CHAR-001","stage":"assets","type":"character","status":"ready","prompt":{"positive":"old asset prompt"}}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let denied_script = call_single_result(
            &tool,
            json!({
                "action": "upsert_storyboard_reference_plan",
                "referencePlanId": "plan-episode-01-sc01-sh01",
                "patch": {
                    "episodeId": "episode-01",
                    "sceneId": "SC01",
                    "shotId": "SH01",
                    "scriptSegmentId": "seg-1"
                },
                "sourceActor": "VideoAI"
            }),
            &context,
        )
        .await;
        let denied_assets = call_single_result(
            &tool,
            json!({
                "action": "update_artifact_prompt",
                "idOrHandle": "CHAR-001",
                "patch": { "prompt": { "positive": "video agent edits asset" } },
                "reason": "Video render found asset mismatch.",
                "userInstruction": "Fix character asset directly.",
                "sourceActor": "VideoAI"
            }),
            &context,
        )
        .await;
        let denied_storyboards = call_single_result(
            &tool,
            json!({
                "action": "update_artifact_prompt",
                "idOrHandle": "EP01-SB01",
                "patch": { "prompt": { "positive": "video agent edits storyboard" } },
                "reason": "Video render found storyboard motion unclear.",
                "userInstruction": "Fix storyboard directly.",
                "sourceActor": "VideoAI"
            }),
            &context,
        )
        .await;

        assert_eq!(denied_script["status"], "denied");
        assert_eq!(denied_script["error"]["code"], "write_policy_denied");
        assert_eq!(denied_script["policy"]["targetStage"], "script");
        assert_eq!(denied_script["policy"]["requiredActor"], "ScriptAI");
        assert_eq!(denied_script["policy"]["allowedAction"], "request_change");
        assert_eq!(denied_assets["status"], "denied");
        assert_eq!(denied_assets["error"]["code"], "write_policy_denied");
        assert_eq!(denied_assets["policy"]["targetStage"], "assets");
        assert_eq!(denied_assets["policy"]["requiredActor"], "AssetAI");
        assert_eq!(denied_assets["policy"]["allowedAction"], "request_change");
        assert_eq!(denied_storyboards["status"], "denied");
        assert_eq!(denied_storyboards["error"]["code"], "write_policy_denied");
        assert_eq!(denied_storyboards["policy"]["targetStage"], "storyboards");
        assert_eq!(denied_storyboards["policy"]["requiredActor"], "SplitAI");
        assert_eq!(
            denied_storyboards["policy"]["allowedAction"],
            "request_change"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn runtime_policy_matrix_covers_mainai_and_five_specialist_agents() {
        let root = make_temp_workspace("runtime-policy-matrix");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(project_dir.join("script.md"), "# 第1集\n完整剧本").unwrap();
        std::fs::write(
            project_dir.join("focus.json"),
            r#"{"activeStage":"video","activeEpisodeId":"episode-01","activeArtifactHandle":"EP01-VID01","selectionSource":"right-panel"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir
                .join("indexes")
                .join("script-segment-index.json"),
            r#"[{"id":"seg-1","episodeId":"episode-01","text":"本镜剧情片段。"}]"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("character.json"),
            r#"{"id":"asset-character-1","handle":"CHAR-001","stage":"assets","type":"character","status":"ready","prompt":{"positive":"old asset prompt"}}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("storyboard.json"),
            r#"{"id":"storyboard-1","handle":"EP01-SB01","stage":"storyboards","type":"storyboard","status":"ready","prompt":{"positive":"old storyboard prompt"}}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("video.json"),
            r#"{"id":"video-1","handle":"EP01-VID01","stage":"video","type":"video","episodeId":"episode-01","status":"ready","prompt":{"positive":"old video prompt"},"references":{"scriptSegmentIds":["seg-1"],"characterAssetIds":["asset-character-1"],"storyboardArtifactIds":["storyboard-1"]}}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("post.json"),
            r#"{"id":"post-1","handle":"EP01-POST01","stage":"post","type":"post","status":"ready","prompt":{"positive":"old post prompt"}}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let main_awareness = call_single_result(
            &tool,
            json!({
                "action": "get_awareness",
                "sourceActor": "MainAI"
            }),
            &context,
        )
        .await;
        let script_full = call_single_result(
            &tool,
            json!({
                "action": "read_script",
                "sourceActor": "ScriptAI"
            }),
            &context,
        )
        .await;
        let asset_segment = call_single_result(
            &tool,
            json!({
                "action": "read_script_segment",
                "idOrHandle": "seg-1",
                "sourceActor": "AssetAI"
            }),
            &context,
        )
        .await;
        let split_context = call_single_result(
            &tool,
            json!({
                "action": "get_context_package",
                "agentRole": "SplitAI"
            }),
            &context,
        )
        .await;
        let video_context = call_single_result(
            &tool,
            json!({
                "action": "get_context_package",
                "agentRole": "VideoAI"
            }),
            &context,
        )
        .await;
        let editor_context = call_single_result(
            &tool,
            json!({
                "action": "get_context_package",
                "agentRole": "EditorAI"
            }),
            &context,
        )
        .await;
        let video_update = call_single_result(
            &tool,
            json!({
                "action": "update_artifact_prompt",
                "idOrHandle": "EP01-VID01",
                "patch": { "prompt": { "positive": "video agent owns video prompt" } },
                "reason": "VideoAI owns focused video prompt.",
                "userInstruction": "Update the video prompt.",
                "sourceActor": "VideoAI"
            }),
            &context,
        )
        .await;
        let editor_update = call_single_result(
            &tool,
            json!({
                "action": "update_artifact_prompt",
                "idOrHandle": "EP01-POST01",
                "patch": { "prompt": { "positive": "editor owns post prompt" } },
                "reason": "EditorAI owns post prompt.",
                "userInstruction": "Update the post prompt.",
                "sourceActor": "EditorAI"
            }),
            &context,
        )
        .await;
        let script_denied_asset = call_single_result(
            &tool,
            json!({
                "action": "update_artifact_prompt",
                "idOrHandle": "CHAR-001",
                "patch": { "prompt": { "positive": "script agent edits asset" } },
                "reason": "ScriptAI found asset mismatch.",
                "userInstruction": "Fix asset directly.",
                "sourceActor": "ScriptAI"
            }),
            &context,
        )
        .await;

        assert_eq!(main_awareness["status"], "ready");
        assert_eq!(script_full["status"], "ready");
        assert_eq!(asset_segment["status"], "ready");
        assert_eq!(split_context["status"], "ready");
        assert!(split_context["contextPackage"]["policyApplied"]
            .as_str()
            .unwrap()
            .contains("SplitAI"));
        assert_eq!(video_context["status"], "ready");
        assert!(video_context["contextPackage"]["policyApplied"]
            .as_str()
            .unwrap()
            .contains("VideoAI"));
        assert_eq!(editor_context["status"], "ready");
        assert!(editor_context["contextPackage"]["policyApplied"]
            .as_str()
            .unwrap()
            .contains("EditorAI"));
        assert_eq!(video_update["status"], "ready");
        assert_eq!(editor_update["status"], "ready");
        assert_eq!(script_denied_asset["status"], "denied");
        assert_eq!(script_denied_asset["error"]["code"], "write_policy_denied");
        assert_eq!(script_denied_asset["policy"]["targetStage"], "assets");
        assert_eq!(script_denied_asset["policy"]["requiredActor"], "AssetAI");
        assert_eq!(
            script_denied_asset["policy"]["allowedAction"],
            "request_change"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn mainai_and_five_specialist_agents_read_same_runtime_focus() {
        let root = make_temp_workspace("runtime-shared-focus");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("assets")).unwrap();
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("focus.json"),
            r#"{"activeStage":"video","activeEpisodeId":"episode-01","activeArtifactId":"video-1","activeArtifactHandle":"EP01-VID01","activeMediaItemId":"media-video-1","selectionSource":"right-panel"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir
                .join("indexes")
                .join("script-segment-index.json"),
            r#"[{"id":"seg-1","episodeId":"episode-01","text":"本镜剧情片段。"}]"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("assets").join("character.json"),
            r#"{"id":"asset-character-1","handle":"CHAR-001","stage":"assets","type":"character","status":"ready"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("video.json"),
            r#"{"id":"video-1","handle":"EP01-VID01","stage":"video","type":"video","episodeId":"episode-01","status":"ready","references":{"scriptSegmentIds":["seg-1"],"characterAssetIds":["asset-character-1"]},"mediaReference":{"id":"media-video-1","kind":"video","status":"ready","path":"media/video/ep01.mp4"}}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());
        let expected_focus = json!({
            "activeStage": "video",
            "activeEpisodeId": "episode-01",
            "activeArtifactId": "video-1",
            "activeArtifactHandle": "EP01-VID01",
            "activeMediaItemId": "media-video-1",
            "selectionSource": "right-panel"
        });

        for role in [
            "MainAI", "ScriptAI", "AssetAI", "SplitAI", "VideoAI", "EditorAI",
        ] {
            let result = call_single_result(
                &tool,
                json!({
                    "action": "get_context_package",
                    "agentRole": role
                }),
                &context,
            )
            .await;

            assert_eq!(result["status"], "ready", "role {role} should read focus");
            assert_eq!(
                result["contextPackage"]["focus"], expected_focus,
                "role {role} should read the shared right-panel focus"
            );
            assert!(result["contextPackage"]["policyApplied"]
                .as_str()
                .unwrap()
                .contains(role));
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn assetai_reads_script_segment_but_cannot_directly_write_video_or_post() {
        let root = make_temp_workspace("assetai-policy");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(project_dir.join("artifacts")).unwrap();
        std::fs::create_dir_all(project_dir.join("indexes")).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir
                .join("indexes")
                .join("script-segment-index.json"),
            r#"[{"id":"seg-assets","episodeId":"episode-01","text":"女主在宫门夜雨中拿着密信。"}]"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("video.json"),
            r#"{"id":"video-1","handle":"EP01-VID01","stage":"video","type":"video","status":"ready","prompt":{"positive":"old video prompt"}}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("artifacts").join("post.json"),
            r#"{"id":"post-1","handle":"EP01-POST01","stage":"post","type":"post","status":"ready","prompt":{"positive":"old post prompt"}}"#,
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let segment = call_single_result(
            &tool,
            json!({
                "action": "read_script_segment",
                "idOrHandle": "seg-assets",
                "sourceActor": "AssetAI"
            }),
            &context,
        )
        .await;
        let denied_video = call_single_result(
            &tool,
            json!({
                "action": "update_artifact_prompt",
                "idOrHandle": "EP01-VID01",
                "patch": { "prompt": { "positive": "asset agent edits video" } },
                "reason": "Asset analysis found mismatch.",
                "userInstruction": "Fix video directly.",
                "sourceActor": "AssetAI"
            }),
            &context,
        )
        .await;
        let denied_post = call_single_result(
            &tool,
            json!({
                "action": "create_attempt",
                "idOrHandle": "EP01-POST01",
                "runId": "post-run-1",
                "status": "running",
                "userInstruction": "Asset agent starts post attempt.",
                "sourceActor": "AssetAI"
            }),
            &context,
        )
        .await;

        assert_eq!(segment["status"], "ready");
        assert_eq!(segment["scriptSegments"][0]["id"], "seg-assets");
        assert_eq!(denied_video["status"], "denied");
        assert_eq!(denied_video["error"]["code"], "write_policy_denied");
        assert_eq!(denied_video["policy"]["targetStage"], "video");
        assert_eq!(denied_video["policy"]["requiredActor"], "VideoAI");
        assert_eq!(denied_video["policy"]["allowedAction"], "request_change");
        assert_eq!(denied_post["status"], "denied");
        assert_eq!(denied_post["error"]["code"], "write_policy_denied");
        assert_eq!(denied_post["policy"]["targetStage"], "post");
        assert_eq!(denied_post["policy"]["requiredActor"], "EditorAI");
        assert_eq!(denied_post["policy"]["allowedAction"], "request_change");

        let video_file =
            std::fs::read_to_string(project_dir.join("artifacts").join("video.json")).unwrap();
        let video_json: Value = serde_json::from_str(&video_file).unwrap();
        assert_eq!(video_json["prompt"]["positive"], "old video prompt");
        let post_file =
            std::fs::read_to_string(project_dir.join("artifacts").join("post.json")).unwrap();
        let post_json: Value = serde_json::from_str(&post_file).unwrap();
        assert!(post_json.get("attempts").is_none());
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn lists_change_requests_with_stage_status_and_actor_filters() {
        let root = make_temp_workspace("list-change-requests");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("change-requests.jsonl"),
            [
                r#"{"id":"cr-1","status":"open","sourceActor":"VideoAI","targetStage":"storyboards","targetArtifactHandle":"EP01-SB01","reason":"Need clearer camera motion.","suggestion":"Add dolly-in direction.","createdAt":1}"#,
                r#"{"id":"cr-2","status":"resolved","sourceActor":"SplitAI","targetStage":"assets","targetArtifactHandle":"CHAR-001","reason":"Need alternate costume.","suggestion":"Generate a rain cloak variant.","createdAt":2}"#,
            ]
            .join("\n"),
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let result = call_single_result(
            &tool,
            json!({
                "action": "list_change_requests",
                "targetStage": "storyboards",
                "status": "open",
                "sourceActor": "VideoAI"
            }),
            &context,
        )
        .await;

        let requests = result["changeRequests"].as_array().unwrap();
        assert_eq!(result["status"], "ready");
        assert_eq!(result["filters"]["targetStage"], "storyboards");
        assert_eq!(result["filters"]["status"], "open");
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0]["id"], "cr-1");
        assert_eq!(requests[0]["targetArtifactHandle"], "EP01-SB01");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn updates_change_request_status_without_rewriting_unmatched_requests() {
        let root = make_temp_workspace("update-change-request");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"short-drama-1"}"#,
        )
        .unwrap();
        std::fs::write(
            project_dir.join("change-requests.jsonl"),
            [
                r#"{"id":"cr-1","status":"open","sourceActor":"VideoAI","targetStage":"storyboards","targetArtifactHandle":"EP01-SB01","reason":"Need clearer camera motion.","suggestion":"Add dolly-in direction.","createdAt":1}"#,
                r#"{"id":"cr-2","status":"open","sourceActor":"SplitAI","targetStage":"assets","targetArtifactHandle":"CHAR-001","reason":"Need alternate costume.","suggestion":"Generate a rain cloak variant.","createdAt":2}"#,
            ]
            .join("\n"),
        )
        .unwrap();

        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let updated = call_single_result(
            &tool,
            json!({
                "action": "update_change_request_status",
                "idOrHandle": "cr-1",
                "status": "resolved",
                "resolution": "SplitAI added a dolly-in motion note.",
                "sourceActor": "SplitAI"
            }),
            &context,
        )
        .await;
        let resolved = call_single_result(
            &tool,
            json!({
                "action": "list_change_requests",
                "status": "resolved"
            }),
            &context,
        )
        .await;

        let file_content =
            std::fs::read_to_string(project_dir.join("change-requests.jsonl")).unwrap();
        assert_eq!(updated["status"], "ready");
        assert_eq!(updated["changeRequest"]["id"], "cr-1");
        assert_eq!(updated["changeRequest"]["status"], "resolved");
        assert_eq!(
            updated["changeRequest"]["resolution"],
            "SplitAI added a dolly-in motion note."
        );
        assert_eq!(updated["changeRequest"]["updatedBy"], "SplitAI");
        assert!(file_content.contains("\"id\":\"cr-2\""));
        assert!(file_content.contains("\"targetArtifactHandle\":\"CHAR-001\""));

        let resolved_requests = resolved["changeRequests"].as_array().unwrap();
        assert_eq!(resolved_requests.len(), 1);
        assert_eq!(resolved_requests[0]["id"], "cr-1");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn reports_no_workspace_when_tool_context_has_no_workspace_binding() {
        let tool = ShortDramaProjectTool::new();
        let context = test_context_without_workspace();

        let awareness =
            call_single_result(&tool, json!({ "action": "get_awareness" }), &context).await;

        assert_eq!(awareness["status"], "no_workspace");
        assert_eq!(awareness["source"], SOURCE);
        assert_eq!(awareness["error"]["code"], "missing_workspace");
    }

    #[tokio::test]
    async fn awareness_reports_no_project_without_treating_empty_workspace_as_ready() {
        let root = make_temp_workspace("awareness-no-project");
        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let awareness =
            call_single_result(&tool, json!({ "action": "get_awareness" }), &context).await;

        assert_eq!(awareness["status"], "no_project");
        assert_eq!(awareness["source"], SOURCE);
        assert_eq!(awareness["workspaceRoot"], json!(root.clone()));
        assert_eq!(awareness["projectPath"], json!(root.join(SHORT_DRAMA_DIR)));
        assert_eq!(awareness["recommendedNextAction"], "initialize_from_script");
        assert!(awareness["missing"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item == "manifest.json"));
        assert_eq!(awareness["stageAgentBindings"]["status"], "unbound");
        let stage_agent_bindings = awareness["stageAgentBindings"]["bindings"]
            .as_array()
            .unwrap();
        assert_eq!(stage_agent_bindings.len(), 5);
        assert_eq!(stage_agent_bindings[0]["stage"], "script");
        assert_eq!(stage_agent_bindings[0]["agentName"], "ScriptAI");
        assert_eq!(stage_agent_bindings[0]["status"], "unbound");
        assert_eq!(stage_agent_bindings[4]["stage"], "post");
        assert_eq!(stage_agent_bindings[4]["agentName"], "EditorAI");
        assert_eq!(stage_agent_bindings[4]["status"], "unbound");
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn initializes_short_drama_project_from_script_and_bootstraps_indexes() {
        let root = make_temp_workspace("initialize-from-script");
        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());
        let script = "# 第1集\n\n女主在雨夜收到密信。\n\n# Episode 2\n\n男主追到宫门。";

        let initialized = call_single_result(
            &tool,
            json!({
                "action": "initialize_from_script",
                "title": "雨夜密信",
                "scriptContent": script,
                "sourceActor": "ScriptAI",
                "userInstruction": "帮我写一个两集短剧。"
            }),
            &context,
        )
        .await;
        let project_dir = root.join(SHORT_DRAMA_DIR);

        assert_eq!(initialized["status"], "indexed");
        assert_eq!(initialized["source"], SOURCE);
        assert_eq!(initialized["projectId"], "short-drama-project");
        assert_eq!(initialized["schemaKind"], "ui-envelope-v1");
        assert_eq!(initialized["manifestVersion"], 1);
        assert_eq!(initialized["workspaceRoot"], json!(root.clone()));
        assert_eq!(initialized["projectPath"], json!(project_dir.clone()));
        assert_eq!(
            initialized["shortDramaProjectChanged"],
            json!({
                "workspaceRoot": root.clone(),
                "projectPath": project_dir.clone(),
                "action": "initialize_from_script",
                "projectState": "indexed",
                "schemaKind": "ui-envelope-v1",
                "source": "ShortDramaProject"
            })
        );
        assert_eq!(initialized["episodesDetected"], 2);
        assert!(project_dir.join("manifest.json").exists());
        assert!(project_dir.join("script.md").exists());
        assert!(project_dir.join("focus.json").exists());
        assert!(project_dir
            .join("indexes")
            .join("script-segment-index.json")
            .exists());
        assert!(project_dir
            .join("indexes")
            .join("artifact-index.json")
            .exists());
        assert!(project_dir
            .join("indexes")
            .join("media-index.json")
            .exists());
        assert!(project_dir
            .join("indexes")
            .join("search-index.json")
            .exists());
        assert_eq!(
            std::fs::read_to_string(project_dir.join("script.md")).unwrap(),
            script
        );
        let manifest_file = std::fs::read_to_string(project_dir.join("manifest.json")).unwrap();
        let manifest_json: Value = serde_json::from_str(&manifest_file).unwrap();
        assert_eq!(manifest_json["manifestVersion"], 1);
        assert_eq!(manifest_json["indexVersions"]["scriptSegment"], 1);
        assert_eq!(manifest_json["project"]["projectId"], "short-drama-project");
        assert_eq!(manifest_json["project"]["title"], "雨夜密信");
        assert_eq!(
            manifest_json["project"]["artifacts"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            manifest_json["project"]["scriptDocument"]["content"],
            script
        );

        let segment = call_single_result(
            &tool,
            json!({
                "action": "read_script_segment",
                "episodeId": "episode-01"
            }),
            &context,
        )
        .await;
        assert_eq!(segment["status"], "ready");
        assert_eq!(segment["scriptSegments"][0]["episodeId"], "episode-01");
        assert!(segment["scriptSegments"][0]["text"]
            .as_str()
            .unwrap()
            .contains("女主在雨夜收到密信"));

        let search = call_single_result(
            &tool,
            json!({
                "action": "search",
                "query": "密信"
            }),
            &context,
        )
        .await;
        assert_eq!(search["status"], "ready");
        assert!(search["results"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["label"] == "script.md"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn denies_initialize_from_script_when_project_already_exists_even_with_overwrite_policy()
    {
        let root = make_temp_workspace("initialize-existing-denied");
        let project_dir = root.join(SHORT_DRAMA_DIR);
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(
            project_dir.join("manifest.json"),
            r#"{"projectId":"existing-project","title":"Existing"}"#,
        )
        .unwrap();
        std::fs::write(project_dir.join("script.md"), "# 第1集\n\n旧剧本").unwrap();
        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let denied = call_single_result(
            &tool,
            json!({
                "action": "initialize_from_script",
                "scriptContent": "# 第1集\n\n新剧本",
                "sourceActor": "ScriptAI",
                "overwritePolicy": "create_revision",
                "userInstruction": "替换当前剧本。"
            }),
            &context,
        )
        .await;

        assert_eq!(denied["status"], "denied");
        assert_eq!(denied["error"]["code"], "project_exists");
        assert_eq!(
            std::fs::read_to_string(project_dir.join("script.md")).unwrap(),
            "# 第1集\n\n旧剧本"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn denies_initialize_from_script_for_non_script_or_main_actor() {
        let root = make_temp_workspace("initialize-denied");
        let tool = ShortDramaProjectTool::new();
        let context = test_context(root.clone());

        let denied = call_single_result(
            &tool,
            json!({
                "action": "initialize_from_script",
                "scriptContent": "# 第1集\n\n测试",
                "sourceActor": "VideoAI",
                "userInstruction": "视频代理尝试创建项目。"
            }),
            &context,
        )
        .await;

        assert_eq!(denied["status"], "denied");
        assert_eq!(denied["error"]["code"], "initialize_policy_denied");
        assert_eq!(
            denied["policy"]["allowedActors"],
            json!(["MainAI", "ScriptAI"])
        );
        assert!(!root.join(SHORT_DRAMA_DIR).exists());
        let _ = std::fs::remove_dir_all(root);
    }

    fn test_context(root: PathBuf) -> ToolUseContext {
        ToolUseContext {
            tool_call_id: None,
            agent_type: Some("test".to_string()),
            session_id: None,
            dialog_turn_id: None,
            workspace: Some(WorkspaceBinding::new(None, root)),
            unlocked_collapsed_tools: Vec::new(),
            custom_data: HashMap::new(),
            computer_use_host: None,
            cancellation_token: None,
            runtime_tool_restrictions: ToolRuntimeRestrictions::default(),
            workspace_services: None,
        }
    }

    fn test_context_without_workspace() -> ToolUseContext {
        ToolUseContext {
            tool_call_id: None,
            agent_type: Some("test".to_string()),
            session_id: None,
            dialog_turn_id: None,
            workspace: None,
            unlocked_collapsed_tools: Vec::new(),
            custom_data: HashMap::new(),
            computer_use_host: None,
            cancellation_token: None,
            runtime_tool_restrictions: ToolRuntimeRestrictions::default(),
            workspace_services: None,
        }
    }

    async fn call_single_result(
        tool: &ShortDramaProjectTool,
        input: Value,
        context: &ToolUseContext,
    ) -> Value {
        let results = tool.call_impl(&input, context).await.unwrap();
        match results.into_iter().next().unwrap() {
            ToolResult::Result { data, .. } => data,
            _ => panic!("expected tool result data"),
        }
    }

    fn make_temp_workspace(label: &str) -> PathBuf {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let root = std::env::temp_dir().join(format!("void-short-drama-tool-{label}-{millis}"));
        std::fs::create_dir_all(&root).unwrap();
        root
    }
}
