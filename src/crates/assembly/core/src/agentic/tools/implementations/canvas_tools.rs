//! Infinite canvas agent tools (P3, PRD §3.6):
//!
//! - `CanvasRead` — read-only projection of the workspace's default infinite
//!   canvas document (`.void/infinite-canvas/<documentId>.json`).
//! - `CanvasOp` — typed batch operations that are validated, ID-stamped,
//!   appended to the ops journal, and echoed back (R3).
//!
//! Both tools follow the "backend receipt, frontend landing" model proven by
//! the K2 media bridge: the canvas document's only writer is the front-end
//! `mutateDefaultDocument` path. Rust never writes the document file; the
//! ops journal (`<documentId>.ops.json`) has Rust as its only writer.

use crate::agentic::tools::framework::{
    Tool, ToolExposure, ToolResult, ToolUseContext, ValidationResult,
};
use crate::util::errors::VoidResult;
use async_trait::async_trait;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

const CANVAS_SOURCE: &str = "infinite_canvas";
const CANVAS_SCHEMA_VERSION: &str = "1";
/// Summary detail truncates prompts to keep the projection cheap.
const SUMMARY_PROMPT_MAX_CHARS: usize = 240;
/// Full detail truncates every text-bearing field at this bound.
const FULL_FIELD_MAX_CHARS: usize = 4000;

fn ok_result(data: Value, assistant: impl Into<String>) -> Vec<ToolResult> {
    vec![ToolResult::Result {
        data,
        result_for_assistant: Some(assistant.into()),
        image_attachments: None,
    }]
}

fn validation_error(message: impl Into<String>) -> ValidationResult {
    ValidationResult {
        result: false,
        message: Some(message.into()),
        error_code: Some(400),
        meta: None,
    }
}

fn valid() -> ValidationResult {
    ValidationResult {
        result: true,
        message: None,
        error_code: None,
        meta: None,
    }
}

/// Typed canvas tool failure: a normal tool result, never a panic or a hard
/// error, so the model can read the reason and adjust.
fn canvas_typed_error(code: &str, message: impl Into<String>) -> Vec<ToolResult> {
    let message = message.into();
    ok_result(
        json!({
            "status": "error",
            "source": CANVAS_SOURCE,
            "error": { "code": code, "message": message }
        }),
        message,
    )
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        value.to_string()
    } else {
        value.chars().take(max_chars).collect()
    }
}

pub(crate) fn infinite_canvas_directory(workspace_root: &Path) -> PathBuf {
    workspace_root.join(".void").join("infinite-canvas")
}

// ---------------------------------------------------------------------------
// Document snapshot (tolerant read-only parse of the front-end owned file)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub(crate) struct CanvasNodeSnapshot {
    pub node_id: String,
    pub kind: String,
    pub position: Value,
    pub size: Option<Value>,
    pub text: Option<String>,
    pub prompt: Option<String>,
    pub style_preset_id: Option<String>,
    pub has_media: bool,
    pub derived_from: Option<Value>,
    pub generation: Option<Value>,
}

#[derive(Debug, Clone)]
pub(crate) struct CanvasDocumentSnapshot {
    pub workspace_id: String,
    pub document_id: String,
    pub revision: u64,
    pub applied_seq: u64,
    pub nodes: Vec<CanvasNodeSnapshot>,
    pub edges: Vec<Value>,
}

impl CanvasDocumentSnapshot {
    pub fn node(&self, node_id: &str) -> Option<&CanvasNodeSnapshot> {
        self.nodes.iter().find(|node| node.node_id == node_id)
    }
}

/// Typed failure kinds shared by both canvas tools. All map to normal tool
/// results (`canvas_typed_error`), never to a Rust error path.
#[derive(Debug)]
pub(crate) enum CanvasDocumentReadError {
    NotFound,
    Ambiguous(Vec<String>),
    Io(String),
    Corrupted(String),
    Incompatible(String),
    Invalid(String),
}

impl CanvasDocumentReadError {
    pub fn into_tool_results(self) -> Vec<ToolResult> {
        match self {
            Self::NotFound => canvas_typed_error(
                "document_not_found",
                "No infinite canvas document exists in this workspace yet. Ask the user to open \
                 the infinite canvas panel once so the default document is created.",
            ),
            Self::Ambiguous(names) => canvas_typed_error(
                "multiple_documents",
                format!(
                    "Expected exactly one canvas document file, found {}: {}.",
                    names.len(),
                    names.join(", ")
                ),
            ),
            Self::Io(message) => canvas_typed_error("io_error", message),
            Self::Corrupted(message) => canvas_typed_error(
                "document_corrupted",
                format!("The canvas document file is not valid JSON: {message}"),
            ),
            Self::Incompatible(version) => canvas_typed_error(
                "incompatible_schema_version",
                format!("Unknown infinite canvas schemaVersion: {version}"),
            ),
            Self::Invalid(message) => canvas_typed_error("invalid_document", message),
        }
    }
}

fn is_nonempty_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
}

fn finite_number(value: Option<&Value>) -> Option<f64> {
    value.and_then(Value::as_f64).filter(|n| n.is_finite())
}

fn parse_position(value: Option<&Value>) -> Option<Value> {
    let position = value?.as_object()?;
    let x = finite_number(position.get("x"))?;
    let y = finite_number(position.get("y"))?;
    Some(json!({ "x": x, "y": y }))
}

fn parse_size(value: Option<&Value>) -> Option<Value> {
    let size = value?.as_object()?;
    let width = finite_number(size.get("width"))?;
    let height = finite_number(size.get("height"))?;
    Some(json!({ "width": width, "height": height }))
}

/// Tolerant node parse for the read-only snapshot: a malformed entry is
/// skipped instead of failing the whole projection (the front-end document
/// service owns strict validation on its own write path).
fn parse_node_snapshot(value: &Value) -> Option<CanvasNodeSnapshot> {
    let object = value.as_object()?;
    let node_id = is_nonempty_string(object.get("nodeId"))?;
    let kind = is_nonempty_string(object.get("kind"))?;
    if !matches!(kind.as_str(), "text" | "image" | "group" | "video") {
        return None;
    }
    let position = parse_position(object.get("position"))?;
    let has_media = object
        .get("mediaRef")
        .and_then(Value::as_object)
        .is_some_and(|media_ref| {
            is_nonempty_string(media_ref.get("workspacePath")).is_some()
                && is_nonempty_string(media_ref.get("relativePath")).is_some()
        });
    Some(CanvasNodeSnapshot {
        node_id,
        kind,
        position,
        size: parse_size(object.get("size")),
        text: object
            .get("text")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        prompt: object
            .get("prompt")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        style_preset_id: is_nonempty_string(object.get("stylePresetId")),
        has_media,
        derived_from: object.get("derivedFrom").filter(|v| v.is_object()).cloned(),
        generation: object.get("generation").filter(|v| v.is_object()).cloned(),
    })
}

fn parse_edge_snapshot(value: &Value) -> Option<Value> {
    let object = value.as_object()?;
    let edge_id = is_nonempty_string(object.get("edgeId"))?;
    let source = is_nonempty_string(object.get("sourceNodeId"))?;
    let target = is_nonempty_string(object.get("targetNodeId"))?;
    Some(json!({
        "edgeId": edge_id,
        "sourceNodeId": source,
        "targetNodeId": target
    }))
}

fn parse_document_snapshot(raw: &str) -> Result<CanvasDocumentSnapshot, CanvasDocumentReadError> {
    let parsed: Value = serde_json::from_str(raw)
        .map_err(|error| CanvasDocumentReadError::Corrupted(error.to_string()))?;
    let Some(object) = parsed.as_object() else {
        return Err(CanvasDocumentReadError::Invalid(
            "Document root must be an object.".to_string(),
        ));
    };
    let schema_version = object
        .get("schemaVersion")
        .and_then(Value::as_str)
        .unwrap_or("<missing>");
    if schema_version != CANVAS_SCHEMA_VERSION {
        return Err(CanvasDocumentReadError::Incompatible(
            schema_version.to_string(),
        ));
    }
    let workspace_id = is_nonempty_string(object.get("workspaceId")).ok_or_else(|| {
        CanvasDocumentReadError::Invalid("Document workspaceId is invalid.".to_string())
    })?;
    let document_id = is_nonempty_string(object.get("documentId")).ok_or_else(|| {
        CanvasDocumentReadError::Invalid("Document documentId is invalid.".to_string())
    })?;
    let revision = object
        .get("revision")
        .and_then(Value::as_u64)
        .ok_or_else(|| {
            CanvasDocumentReadError::Invalid("Document revision is invalid.".to_string())
        })?;
    // P3 additive watermark; a broken value reads as 0 (field absent).
    let applied_seq = object
        .get("agentOps")
        .and_then(|agent_ops| agent_ops.get("appliedSeq"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let nodes = object
        .get("nodes")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(parse_node_snapshot).collect())
        .unwrap_or_default();
    let edges = object
        .get("edges")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(parse_edge_snapshot).collect())
        .unwrap_or_default();
    Ok(CanvasDocumentSnapshot {
        workspace_id,
        document_id,
        revision,
        applied_seq,
        nodes,
        edges,
    })
}

/// Scans `<workspace>/.void/infinite-canvas/` for the single default document
/// file (`*.json` that is not an `*.ops.json` journal).
async fn locate_default_document_file(dir: &Path) -> Result<PathBuf, CanvasDocumentReadError> {
    let mut entries = match tokio::fs::read_dir(dir).await {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(CanvasDocumentReadError::NotFound)
        }
        Err(error) => return Err(CanvasDocumentReadError::Io(error.to_string())),
    };
    let mut candidates: Vec<PathBuf> = Vec::new();
    loop {
        match entries.next_entry().await {
            Ok(Some(entry)) => {
                let path = entry.path();
                let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                    continue;
                };
                if name.ends_with(".json") && !name.ends_with(".ops.json") {
                    candidates.push(path);
                }
            }
            Ok(None) => break,
            Err(error) => return Err(CanvasDocumentReadError::Io(error.to_string())),
        }
    }
    candidates.sort();
    match candidates.len() {
        0 => Err(CanvasDocumentReadError::NotFound),
        1 => Ok(candidates.remove(0)),
        _ => Err(CanvasDocumentReadError::Ambiguous(
            candidates
                .iter()
                .filter_map(|path| path.file_name())
                .map(|name| name.to_string_lossy().to_string())
                .collect(),
        )),
    }
}

pub(crate) async fn read_default_document_snapshot(
    workspace_root: &Path,
) -> Result<(PathBuf, CanvasDocumentSnapshot), CanvasDocumentReadError> {
    let dir = infinite_canvas_directory(workspace_root);
    let path = locate_default_document_file(&dir).await?;
    let raw = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| CanvasDocumentReadError::Io(error.to_string()))?;
    let snapshot = parse_document_snapshot(&raw)?;
    Ok((path, snapshot))
}

/// Workspace gate shared by both tools: remote workspaces stay fail-closed
/// (same posture as the front-end document service) and a missing workspace
/// binding is a typed failure, not a panic.
fn workspace_root_or_typed_error(context: &ToolUseContext) -> Result<PathBuf, Vec<ToolResult>> {
    if context.is_remote() {
        return Err(canvas_typed_error(
            "workspace_unavailable",
            "Infinite canvas tools are not available for remote workspaces (fail-closed).",
        ));
    }
    match context.workspace_root() {
        Some(root) => Ok(root.to_path_buf()),
        None => Err(canvas_typed_error(
            "workspace_unavailable",
            "No workspace is bound to this session, so the canvas document cannot be located.",
        )),
    }
}

// ---------------------------------------------------------------------------
// CanvasRead (R2)
// ---------------------------------------------------------------------------

fn project_node(node: &CanvasNodeSnapshot, detail_full: bool) -> Value {
    let mut projected = Map::new();
    projected.insert("nodeId".to_string(), json!(node.node_id));
    projected.insert("kind".to_string(), json!(node.kind));
    projected.insert("position".to_string(), node.position.clone());
    if let Some(size) = &node.size {
        projected.insert("size".to_string(), size.clone());
    }
    projected.insert("hasMedia".to_string(), json!(node.has_media));
    if let Some(prompt) = &node.prompt {
        let max_chars = if detail_full {
            FULL_FIELD_MAX_CHARS
        } else {
            SUMMARY_PROMPT_MAX_CHARS
        };
        projected.insert("prompt".to_string(), json!(truncate_chars(prompt, max_chars)));
    }
    if let Some(style_preset_id) = &node.style_preset_id {
        projected.insert("stylePresetId".to_string(), json!(style_preset_id));
    }
    if let Some(generation) = &node.generation {
        projected.insert("generation".to_string(), generation.clone());
    }
    if let Some(derived_from) = &node.derived_from {
        projected.insert("derivedFrom".to_string(), derived_from.clone());
    }
    if detail_full {
        if let Some(text) = &node.text {
            projected.insert(
                "text".to_string(),
                json!(truncate_chars(text, FULL_FIELD_MAX_CHARS)),
            );
        }
    }
    Value::Object(projected)
}

pub struct CanvasReadTool;

impl CanvasReadTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CanvasReadTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for CanvasReadTool {
    fn name(&self) -> &str {
        "CanvasRead"
    }

    async fn description(&self) -> VoidResult<String> {
        Ok("Read a projection of the workspace's default infinite canvas document \
            (workspaceId, documentId, revision, node summaries, edges in reference order, \
            and the agent ops appliedSeq watermark). detail=summary (default) truncates \
            prompts; detail=full adds full text fields. Freshness: this reads the last \
            persisted document — the front end persists asynchronously, so a CanvasOp you \
            just submitted may not be reflected yet; re-read shortly if your plan depends \
            on the latest state. Media contents are never echoed."
            .to_string())
    }

    fn short_description(&self) -> String {
        "Read the default infinite canvas document projection (last persisted state)."
            .to_string()
    }

    fn default_exposure(&self) -> ToolExposure {
        ToolExposure::Collapsed
    }

    fn is_readonly(&self) -> bool {
        true
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "detail": {
                    "type": "string",
                    "enum": ["summary", "full"],
                    "default": "summary",
                    "description": "summary = node summaries with truncated prompts; full = adds complete text fields (each truncated at 4000 chars)."
                }
            }
        })
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        match input.get("detail") {
            None | Some(Value::Null) => valid(),
            Some(Value::String(detail)) if detail == "summary" || detail == "full" => valid(),
            Some(other) => {
                validation_error(format!("detail must be \"summary\" or \"full\", got {other}"))
            }
        }
    }

    async fn call_impl(
        &self,
        input: &Value,
        context: &ToolUseContext,
    ) -> VoidResult<Vec<ToolResult>> {
        let workspace_root = match workspace_root_or_typed_error(context) {
            Ok(root) => root,
            Err(results) => return Ok(results),
        };
        let detail_full = input.get("detail").and_then(Value::as_str) == Some("full");
        let snapshot = match read_default_document_snapshot(&workspace_root).await {
            Ok((_, snapshot)) => snapshot,
            Err(error) => return Ok(error.into_tool_results()),
        };

        let nodes: Vec<Value> = snapshot
            .nodes
            .iter()
            .map(|node| project_node(node, detail_full))
            .collect();
        let node_count = nodes.len();
        let edge_count = snapshot.edges.len();
        let data = json!({
            "status": "ok",
            "source": CANVAS_SOURCE,
            "detail": if detail_full { "full" } else { "summary" },
            "workspaceId": snapshot.workspace_id,
            "documentId": snapshot.document_id,
            "revision": snapshot.revision,
            "agentOps": { "appliedSeq": snapshot.applied_seq },
            "nodes": nodes,
            "edges": snapshot.edges,
        });
        Ok(ok_result(
            data,
            format!(
                "Infinite canvas document {}: {} node(s), {} edge(s), revision {}, appliedSeq {}. \
                 This is the last persisted state; a just-submitted CanvasOp may not be reflected yet.",
                snapshot.document_id,
                node_count,
                edge_count,
                snapshot.revision,
                snapshot.applied_seq
            ),
        ))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod canvas_read_tests {
    use super::{CanvasReadTool, Tool, ToolResult};
    use crate::agentic::tools::framework::ToolUseContext;
    use crate::agentic::tools::ToolRuntimeRestrictions;
    use crate::agentic::WorkspaceBinding;
    use serde_json::{json, Value};
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};

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

    fn temp_workspace(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "void-canvas-read-{tag}-{}",
            uuid::Uuid::new_v4().simple()
        ))
    }

    async fn write_document(root: &Path, document_id: &str, document: &Value) {
        let dir = root.join(".void").join("infinite-canvas");
        tokio::fs::create_dir_all(&dir).await.expect("canvas dir");
        tokio::fs::write(
            dir.join(format!("{document_id}.json")),
            serde_json::to_vec_pretty(document).expect("document json"),
        )
        .await
        .expect("write document");
    }

    fn sample_document() -> Value {
        json!({
            "documentId": "doc-1",
            "schemaVersion": "1",
            "workspaceId": "workspace-1",
            "revision": 7,
            "nodes": [
                {
                    "nodeId": "node-image-1",
                    "kind": "image",
                    "position": { "x": 10, "y": 20 },
                    "size": { "width": 320, "height": 240 },
                    "prompt": "p".repeat(500),
                    "stylePresetId": "cinematic:sp-1",
                    "mediaRef": {
                        "workspacePath": "C:/ws",
                        "relativePath": "media/generated/batch-1/image-001.png"
                    },
                    "derivedFrom": {
                        "sourceNodeId": "node-src",
                        "toolId": "generate",
                        "operationId": "op-derived"
                    }
                },
                {
                    "nodeId": "node-text-1",
                    "kind": "text",
                    "position": { "x": 0, "y": 0 },
                    "text": "t".repeat(5000)
                },
                {
                    "nodeId": "node-video-1",
                    "kind": "video",
                    "position": { "x": 400, "y": 0 },
                    "prompt": "make it move",
                    "generation": {
                        "operationId": "op-video",
                        "toolId": "generate",
                        "resultMode": "self",
                        "status": "pending",
                        "mediaKind": "video"
                    }
                }
            ],
            "edges": [
                { "edgeId": "edge-1", "sourceNodeId": "node-image-1", "targetNodeId": "node-video-1" }
            ],
            "viewport": { "x": 0, "y": 0, "zoom": 1 },
            "updatedAt": "2026-08-24T00:00:00.000Z",
            "agentOps": { "appliedSeq": 3 }
        })
    }

    fn result_data(results: &[ToolResult]) -> &Value {
        match results.first().expect("one tool result") {
            ToolResult::Result { data, .. } => data,
            other => panic!("expected a data-bearing result, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn summary_projection_exposes_identity_watermark_and_node_summaries() {
        let root = temp_workspace("summary");
        write_document(&root, "doc-1", &sample_document()).await;
        // A journal file next to the document must never be mistaken for it.
        tokio::fs::write(
            root.join(".void")
                .join("infinite-canvas")
                .join("doc-1.ops.json"),
            b"{\"batches\":[]}",
        )
        .await
        .expect("write journal");

        let results = CanvasReadTool::new()
            .call_impl(&json!({}), &test_context(root.clone()))
            .await
            .expect("tool results");
        let data = result_data(&results);

        assert_eq!(data["status"], "ok");
        assert_eq!(data["detail"], "summary");
        assert_eq!(data["workspaceId"], "workspace-1");
        assert_eq!(data["documentId"], "doc-1");
        assert_eq!(data["revision"], 7);
        assert_eq!(data["agentOps"]["appliedSeq"], 3);

        let nodes = data["nodes"].as_array().expect("nodes");
        assert_eq!(nodes.len(), 3);
        let image = &nodes[0];
        assert_eq!(image["nodeId"], "node-image-1");
        assert_eq!(image["kind"], "image");
        assert_eq!(image["hasMedia"], true);
        assert_eq!(image["position"]["x"], 10.0);
        assert_eq!(image["size"]["width"], 320.0);
        assert_eq!(image["stylePresetId"], "cinematic:sp-1");
        assert_eq!(image["derivedFrom"]["operationId"], "op-derived");
        // Prompts are truncated at 240 chars in summary detail.
        assert_eq!(
            image["prompt"].as_str().expect("prompt").chars().count(),
            240
        );
        // Summary never carries text bodies.
        assert!(nodes[1].get("text").is_none());
        assert_eq!(nodes[1]["hasMedia"], false);
        assert_eq!(nodes[2]["kind"], "video");
        assert_eq!(nodes[2]["generation"]["mediaKind"], "video");

        // Edges are echoed in document order (= reference order).
        assert_eq!(data["edges"][0]["edgeId"], "edge-1");

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn full_projection_adds_truncated_text_fields() {
        let root = temp_workspace("full");
        write_document(&root, "doc-1", &sample_document()).await;

        let results = CanvasReadTool::new()
            .call_impl(&json!({ "detail": "full" }), &test_context(root.clone()))
            .await
            .expect("tool results");
        let data = result_data(&results);

        assert_eq!(data["detail"], "full");
        let text_node = &data["nodes"][1];
        // Full detail includes text, truncated at 4000 chars.
        assert_eq!(
            text_node["text"].as_str().expect("text").chars().count(),
            4000
        );
        // Full detail keeps the prompt (bounded at 4000 too; 500 fits whole).
        assert_eq!(
            data["nodes"][0]["prompt"]
                .as_str()
                .expect("prompt")
                .chars()
                .count(),
            500
        );

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn projection_never_echoes_media_refs_or_media_content() {
        let root = temp_workspace("no-media");
        write_document(&root, "doc-1", &sample_document()).await;

        let results = CanvasReadTool::new()
            .call_impl(&json!({ "detail": "full" }), &test_context(root.clone()))
            .await
            .expect("tool results");
        let serialized = serde_json::to_string(result_data(&results)).expect("json");

        assert!(!serialized.contains("mediaRef"));
        assert!(!serialized.contains("image-001.png"));
        assert!(!serialized.contains("base64"));

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn missing_document_is_a_typed_not_found_result() {
        let root = temp_workspace("missing");

        let results = CanvasReadTool::new()
            .call_impl(&json!({}), &test_context(root.clone()))
            .await
            .expect("tool results");
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "document_not_found");
        assert!(data["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("open")));

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn corrupted_document_is_a_typed_corrupted_result() {
        let root = temp_workspace("corrupted");
        let dir = root.join(".void").join("infinite-canvas");
        tokio::fs::create_dir_all(&dir).await.expect("dir");
        tokio::fs::write(dir.join("doc-1.json"), b"{ not json")
            .await
            .expect("write corrupted");

        let results = CanvasReadTool::new()
            .call_impl(&json!({}), &test_context(root.clone()))
            .await
            .expect("tool results");
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "document_corrupted");

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn unknown_schema_version_is_a_typed_incompatible_result() {
        let root = temp_workspace("incompatible");
        let mut document = sample_document();
        document["schemaVersion"] = json!("99");
        write_document(&root, "doc-1", &document).await;

        let results = CanvasReadTool::new()
            .call_impl(&json!({}), &test_context(root.clone()))
            .await
            .expect("tool results");
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "incompatible_schema_version");
        assert!(data["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("99")));

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn context_without_workspace_is_a_typed_unavailable_result() {
        let mut context = test_context(PathBuf::from("unused"));
        context.workspace = None;

        let results = CanvasReadTool::new()
            .call_impl(&json!({}), &context)
            .await
            .expect("tool results");
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "workspace_unavailable");
    }

    #[tokio::test]
    async fn remote_workspace_stays_fail_closed() {
        let session_identity =
            crate::service::remote_ssh::workspace_state::workspace_session_identity(
                "/home/wsp/projects/test",
                Some("conn-1"),
                Some("127.0.0.1"),
            )
            .expect("remote session identity");
        let mut context = test_context(PathBuf::from("unused"));
        context.workspace = Some(WorkspaceBinding::new_remote(
            None,
            PathBuf::from("/home/wsp/projects/test"),
            "conn-1".to_string(),
            "test-remote".to_string(),
            session_identity,
        ));

        let results = CanvasReadTool::new()
            .call_impl(&json!({}), &context)
            .await
            .expect("tool results");
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "workspace_unavailable");
        assert!(data["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("fail-closed")));
    }

    #[tokio::test]
    async fn detail_input_is_validated_strictly() {
        let tool = CanvasReadTool::new();

        assert!(tool.validate_input(&json!({}), None).await.result);
        assert!(
            tool.validate_input(&json!({ "detail": "summary" }), None)
                .await
                .result
        );
        assert!(
            tool.validate_input(&json!({ "detail": "full" }), None)
                .await
                .result
        );
        assert!(
            !tool
                .validate_input(&json!({ "detail": "everything" }), None)
                .await
                .result
        );
    }

    #[tokio::test]
    async fn description_states_freshness_semantics() {
        let description = CanvasReadTool::new()
            .description()
            .await
            .expect("description");

        assert!(description.contains("last persisted"));
        assert!(description.contains("may not be reflected yet"));
    }
}
