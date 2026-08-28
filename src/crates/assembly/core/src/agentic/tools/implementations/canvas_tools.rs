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
// CanvasOp (R3): typed batch operations + ops journal + receipt
// ---------------------------------------------------------------------------

/// Anti-runaway limits (PRD §3.6.4): one batch is at most 20 operations, of
/// which at most 3 may be `begin_generation`. Oversized batches are rejected
/// whole — never partially executed.
const CANVAS_OP_MAX_OPS: usize = 20;
const CANVAS_OP_MAX_GENERATIONS: usize = 3;
/// The ops journal is bounded: only the most recent batches are kept.
const CANVAS_OPS_JOURNAL_MAX_BATCHES: usize = 200;

/// `update_node.set` whitelist (PRD §3.6.4). `mediaRef`, `derivedFrom`,
/// `generation` and `domainRef` are deliberately absent: the mediaRef
/// immutability invariant continues to hold on every path.
///
/// K3 (PRD §5.1.2) made `domainRef` writable — by the short-drama handoff in
/// the front end, and by nothing else. This gate does not move: which domain
/// object a card belongs to is the user's decision, so no agent op may set it,
/// change it, or clear it.
const UPDATE_SET_WHITELIST: [&str; 5] = ["prompt", "text", "stylePresetId", "position", "size"];

const CANVAS_OP_TOOL_IDS: [&str; 6] =
    ["generate", "upscale", "expand", "inpaint", "erase", "matting"];

/// Process-wide journal mutex: Rust is the only writer of `*.ops.json`, and
/// this lock keeps `seq` allocation and append-trim-write atomic in-process.
static CANVAS_OPS_JOURNAL_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn new_canvas_id(prefix: &str) -> String {
    format!("{prefix}-{}", uuid::Uuid::new_v4().simple())
}

fn ops_journal_path(workspace_root: &Path, document_id: &str) -> PathBuf {
    infinite_canvas_directory(workspace_root).join(format!("{document_id}.ops.json"))
}

type CanvasOpRejection = (String, String);

/// Mirror of the front-end `generationCardKind`: the card kind a generation
/// with this media kind lands into (video → video card, everything else →
/// image card).
fn generation_card_kind(media_kind: &str) -> &'static str {
    if media_kind == "video" {
        "video"
    } else {
        "image"
    }
}

fn rejection(code: &str, message: impl Into<String>) -> CanvasOpRejection {
    (code.to_string(), message.into())
}

fn ensure_allowed_keys(
    object: &Map<String, Value>,
    allowed: &[&str],
    op_index: usize,
    op_name: &str,
) -> Result<(), CanvasOpRejection> {
    for key in object.keys() {
        if !allowed.contains(&key.as_str()) {
            return Err(rejection(
                "invalid-input",
                format!(
                    "ops[{op_index}] ({op_name}): unknown field \"{key}\". Allowed fields: {}. \
                     Aliases and extra fields are rejected — use the exact field names.",
                    allowed.join(", ")
                ),
            ));
        }
    }
    Ok(())
}

fn required_string(
    object: &Map<String, Value>,
    key: &str,
    op_index: usize,
    op_name: &str,
) -> Result<String, CanvasOpRejection> {
    is_nonempty_string(object.get(key)).ok_or_else(|| {
        rejection(
            "invalid-input",
            format!("ops[{op_index}] ({op_name}): \"{key}\" must be a non-empty string."),
        )
    })
}

fn optional_string_field(
    object: &Map<String, Value>,
    key: &str,
    op_index: usize,
    op_name: &str,
) -> Result<Option<String>, CanvasOpRejection> {
    match object.get(key) {
        None => Ok(None),
        Some(Value::String(text)) if !text.trim().is_empty() => Ok(Some(text.clone())),
        Some(_) => Err(rejection(
            "invalid-input",
            format!("ops[{op_index}] ({op_name}): \"{key}\" must be a non-empty string."),
        )),
    }
}

fn required_position(
    object: &Map<String, Value>,
    op_index: usize,
    op_name: &str,
) -> Result<Value, CanvasOpRejection> {
    parse_position(object.get("position")).ok_or_else(|| {
        rejection(
            "invalid-input",
            format!(
                "ops[{op_index}] ({op_name}): \"position\" must be an object with finite \
                 numeric x and y."
            ),
        )
    })
}

fn optional_size(
    object: &Map<String, Value>,
    op_index: usize,
    op_name: &str,
) -> Result<Option<Value>, CanvasOpRejection> {
    match object.get("size") {
        None => Ok(None),
        Some(value) => parse_size(Some(value)).map(Some).ok_or_else(|| {
            rejection(
                "invalid-input",
                format!(
                    "ops[{op_index}] ({op_name}): \"size\" must be an object with finite \
                     numeric width and height."
                ),
            )
        }),
    }
}

struct GenerationReceipt {
    operation_id: String,
    node_id: String,
    binding: Value,
}

struct ValidatedCanvasOpBatch {
    normalized_ops: Vec<Value>,
    created_node_ids: Vec<String>,
    created_edge_ids: Vec<String>,
    generations: Vec<GenerationReceipt>,
}

/// Best-effort node universe for referential checks: the persisted snapshot
/// plus nodes created by journaled (possibly not yet applied) batches plus
/// nodes created earlier in the current batch. The front-end applier remains
/// the authority and re-validates against the live document.
struct KnownNodes<'a> {
    snapshot: &'a CanvasDocumentSnapshot,
    /// Journal-created node ids mapped to their card kind when the journaled
    /// op declared one (`None` = kind unknown, checks stay permissive).
    journal_created: &'a std::collections::HashMap<String, Option<String>>,
    batch_created: Vec<(String, String)>,
}

impl KnownNodes<'_> {
    fn contains(&self, node_id: &str) -> bool {
        self.snapshot.node(node_id).is_some()
            || self.journal_created.contains_key(node_id)
            || self.batch_created.iter().any(|(id, _)| id == node_id)
    }

    /// True when the snapshot proves the node already carries media.
    fn has_media_in_snapshot(&self, node_id: &str) -> bool {
        self.snapshot
            .node(node_id)
            .is_some_and(|node| node.has_media)
    }

    /// Best-effort card kind: the persisted snapshot is authoritative;
    /// journaled and in-batch creations carry the kind their op declared.
    /// `None` means the kind is unknowable here (front end re-validates).
    fn kind_of(&self, node_id: &str) -> Option<String> {
        if let Some(node) = self.snapshot.node(node_id) {
            return Some(node.kind.clone());
        }
        if let Some(kind) = self.journal_created.get(node_id) {
            return kind.clone();
        }
        self.batch_created
            .iter()
            .find(|(id, _)| id == node_id)
            .map(|(_, kind)| kind.clone())
    }
}

#[allow(clippy::too_many_lines)]
fn validate_and_normalize_canvas_ops(
    ops: &[Value],
    workspace_id: &str,
    document_id: &str,
    snapshot: &CanvasDocumentSnapshot,
    journal_created: &std::collections::HashMap<String, Option<String>>,
) -> Result<ValidatedCanvasOpBatch, CanvasOpRejection> {
    if ops.is_empty() || ops.len() > CANVAS_OP_MAX_OPS {
        return Err(rejection(
            "invalid-input",
            format!(
                "ops must contain between 1 and {CANVAS_OP_MAX_OPS} operations per batch \
                 (got {}). Split larger changes across multiple CanvasOp calls.",
                ops.len()
            ),
        ));
    }
    let generation_count = ops
        .iter()
        .filter(|op| op.get("op").and_then(Value::as_str) == Some("begin_generation"))
        .count();
    if generation_count > CANVAS_OP_MAX_GENERATIONS {
        return Err(rejection(
            "invalid-input",
            format!(
                "at most {CANVAS_OP_MAX_GENERATIONS} begin_generation operations are allowed \
                 per batch (got {generation_count})."
            ),
        ));
    }

    let mut known = KnownNodes {
        snapshot,
        journal_created,
        batch_created: Vec::new(),
    };
    let mut normalized_ops = Vec::with_capacity(ops.len());
    let mut created_node_ids = Vec::new();
    let mut created_edge_ids = Vec::new();
    let mut generations = Vec::new();

    for (op_index, op) in ops.iter().enumerate() {
        let Some(object) = op.as_object() else {
            return Err(rejection(
                "invalid-input",
                format!("ops[{op_index}] must be an object with an \"op\" field."),
            ));
        };
        let op_name = required_string(object, "op", op_index, "op")?;
        match op_name.as_str() {
            "add_node" => {
                ensure_allowed_keys(
                    object,
                    &["op", "kind", "position", "size", "text", "prompt", "stylePresetId"],
                    op_index,
                    "add_node",
                )?;
                let kind = required_string(object, "kind", op_index, "add_node")?;
                if !matches!(kind.as_str(), "text" | "image" | "video") {
                    // Group cards have no renderer; the AI must not create
                    // nodes the canvas cannot display (PRD §3.6.4).
                    return Err(rejection(
                        "invalid-input",
                        format!(
                            "ops[{op_index}] (add_node): kind \"{kind}\" is not allowed. \
                             Allowed kinds: text, image, video (group is rejected)."
                        ),
                    ));
                }
                let position = required_position(object, op_index, "add_node")?;
                let size = optional_size(object, op_index, "add_node")?;
                let text = optional_string_field(object, "text", op_index, "add_node")?;
                let prompt = optional_string_field(object, "prompt", op_index, "add_node")?;
                let style_preset_id =
                    optional_string_field(object, "stylePresetId", op_index, "add_node")?;

                let node_id = new_canvas_id("node");
                let mut normalized = Map::new();
                normalized.insert("op".to_string(), json!("add_node"));
                normalized.insert("nodeId".to_string(), json!(node_id));
                normalized.insert("kind".to_string(), json!(kind));
                normalized.insert("position".to_string(), position);
                if let Some(size) = size {
                    normalized.insert("size".to_string(), size);
                }
                if let Some(text) = text {
                    normalized.insert("text".to_string(), json!(text));
                }
                if let Some(prompt) = prompt {
                    normalized.insert("prompt".to_string(), json!(prompt));
                }
                if let Some(style_preset_id) = style_preset_id {
                    normalized.insert("stylePresetId".to_string(), json!(style_preset_id));
                }
                known.batch_created.push((node_id.clone(), kind));
                created_node_ids.push(node_id);
                normalized_ops.push(Value::Object(normalized));
            }
            "update_node" => {
                ensure_allowed_keys(object, &["op", "nodeId", "set"], op_index, "update_node")?;
                let node_id = required_string(object, "nodeId", op_index, "update_node")?;
                let Some(set) = object.get("set").and_then(Value::as_object) else {
                    return Err(rejection(
                        "invalid-input",
                        format!("ops[{op_index}] (update_node): \"set\" must be an object."),
                    ));
                };
                if set.is_empty() {
                    return Err(rejection(
                        "invalid-input",
                        format!(
                            "ops[{op_index}] (update_node): \"set\" must contain at least one \
                             whitelisted field ({}).",
                            UPDATE_SET_WHITELIST.join(", ")
                        ),
                    ));
                }
                for key in set.keys() {
                    if !UPDATE_SET_WHITELIST.contains(&key.as_str()) {
                        return Err(rejection(
                            "invalid-input",
                            format!(
                                "ops[{op_index}] (update_node): field \"{key}\" is not writable. \
                                 Writable fields: {}. mediaRef, derivedFrom, generation and \
                                 domainRef can never be changed through CanvasOp.",
                                UPDATE_SET_WHITELIST.join(", ")
                            ),
                        ));
                    }
                }
                let mut normalized_set = Map::new();
                for (key, value) in set {
                    match key.as_str() {
                        "prompt" | "text" | "stylePresetId" => {
                            if !value.is_string() {
                                return Err(rejection(
                                    "invalid-input",
                                    format!(
                                        "ops[{op_index}] (update_node): \"{key}\" must be a string."
                                    ),
                                ));
                            }
                            normalized_set.insert(key.clone(), value.clone());
                        }
                        "position" => {
                            let position =
                                parse_position(Some(value)).ok_or_else(|| {
                                    rejection(
                                        "invalid-input",
                                        format!(
                                            "ops[{op_index}] (update_node): \"position\" must \
                                             have finite numeric x and y."
                                        ),
                                    )
                                })?;
                            normalized_set.insert(key.clone(), position);
                        }
                        "size" => {
                            let size = parse_size(Some(value)).ok_or_else(|| {
                                rejection(
                                    "invalid-input",
                                    format!(
                                        "ops[{op_index}] (update_node): \"size\" must have \
                                         finite numeric width and height."
                                    ),
                                )
                            })?;
                            normalized_set.insert(key.clone(), size);
                        }
                        _ => unreachable!("whitelist checked above"),
                    }
                }
                if !known.contains(&node_id) {
                    return Err(rejection(
                        "invalid-input",
                        format!(
                            "ops[{op_index}] (update_node): node \"{node_id}\" was not found in \
                             the last persisted document or in pending agent batches. Run \
                             CanvasRead to get current node ids."
                        ),
                    ));
                }
                normalized_ops.push(json!({
                    "op": "update_node",
                    "nodeId": node_id,
                    "set": Value::Object(normalized_set)
                }));
            }
            "connect" => {
                ensure_allowed_keys(
                    object,
                    &["op", "sourceNodeId", "targetNodeId"],
                    op_index,
                    "connect",
                )?;
                let source = required_string(object, "sourceNodeId", op_index, "connect")?;
                let target = required_string(object, "targetNodeId", op_index, "connect")?;
                // C4: a self-loop edge is always wrong — the front-end applier
                // would skip it (`self_edge`), so the receipt must never
                // pretend such an edge was created. Reject before journaling.
                if source == target {
                    return Err(rejection(
                        "invalid-input",
                        format!(
                            "ops[{op_index}] (connect): sourceNodeId and targetNodeId are both \
                             \"{source}\" — self-loop edges are not allowed."
                        ),
                    ));
                }
                for (label, node_id) in [("sourceNodeId", &source), ("targetNodeId", &target)] {
                    if !known.contains(node_id) {
                        return Err(rejection(
                            "invalid-input",
                            format!(
                                "ops[{op_index}] (connect): {label} \"{node_id}\" was not found. \
                                 Run CanvasRead to get current node ids."
                            ),
                        ));
                    }
                }
                // C4 idempotency, aligned with the front-end `already_exists`
                // skip: a same-direction edge that already exists in the
                // snapshot is echoed back with the EXISTING edge id and an
                // `alreadyExists` marker — no fresh edge id, no entry in
                // `createdEdgeIds`, so the receipt never reports a phantom
                // edge (the front-end applier skips the op as a no-op).
                let existing_edge_id = snapshot.edges.iter().find_map(|edge| {
                    let object = edge.as_object()?;
                    let same_direction = object.get("sourceNodeId").and_then(Value::as_str)
                        == Some(source.as_str())
                        && object.get("targetNodeId").and_then(Value::as_str)
                            == Some(target.as_str());
                    if !same_direction {
                        return None;
                    }
                    object
                        .get("edgeId")
                        .and_then(Value::as_str)
                        .map(ToString::to_string)
                });
                if let Some(edge_id) = existing_edge_id {
                    normalized_ops.push(json!({
                        "op": "connect",
                        "edgeId": edge_id,
                        "sourceNodeId": source,
                        "targetNodeId": target,
                        "alreadyExists": true
                    }));
                } else {
                    let edge_id = new_canvas_id("edge");
                    created_edge_ids.push(edge_id.clone());
                    normalized_ops.push(json!({
                        "op": "connect",
                        "edgeId": edge_id,
                        "sourceNodeId": source,
                        "targetNodeId": target
                    }));
                }
            }
            "disconnect" => {
                ensure_allowed_keys(object, &["op", "edgeId"], op_index, "disconnect")?;
                let edge_id = required_string(object, "edgeId", op_index, "disconnect")?;
                // Removing a missing edge is a no-op by the idempotency rules,
                // so no existence check is enforced here.
                normalized_ops.push(json!({ "op": "disconnect", "edgeId": edge_id }));
            }
            "delete_node" => {
                ensure_allowed_keys(object, &["op", "nodeId"], op_index, "delete_node")?;
                let node_id = required_string(object, "nodeId", op_index, "delete_node")?;
                // Deletion protection (PRD §3.6.4): cards that carry media can
                // only be deleted by the user in the UI. The front-end applier
                // double-checks this against the live document.
                if known.has_media_in_snapshot(&node_id) {
                    return Err(rejection(
                        "delete_protected",
                        format!(
                            "ops[{op_index}] (delete_node): node \"{node_id}\" carries media and \
                             cannot be deleted by the agent. Only blank cards and failed \
                             placeholders may be deleted; ask the user to delete real media \
                             cards in the canvas UI."
                        ),
                    ));
                }
                normalized_ops.push(json!({ "op": "delete_node", "nodeId": node_id }));
            }
            "begin_generation" => {
                ensure_allowed_keys(
                    object,
                    &[
                        "op",
                        "mode",
                        "nodeId",
                        "sourceNodeId",
                        "toolId",
                        "mediaKind",
                        "prompt",
                        "stylePresetId",
                    ],
                    op_index,
                    "begin_generation",
                )?;
                let mode = required_string(object, "mode", op_index, "begin_generation")?;
                if mode != "self" && mode != "derived" {
                    return Err(rejection(
                        "invalid-input",
                        format!(
                            "ops[{op_index}] (begin_generation): mode must be \"self\" or \
                             \"derived\", got \"{mode}\"."
                        ),
                    ));
                }
                let tool_id = required_string(object, "toolId", op_index, "begin_generation")?;
                if !CANVAS_OP_TOOL_IDS.contains(&tool_id.as_str()) {
                    return Err(rejection(
                        "invalid-input",
                        format!(
                            "ops[{op_index}] (begin_generation): toolId \"{tool_id}\" is not \
                             allowed. Allowed toolIds: {}.",
                            CANVAS_OP_TOOL_IDS.join(", ")
                        ),
                    ));
                }
                let media_kind =
                    optional_string_field(object, "mediaKind", op_index, "begin_generation")?
                        .unwrap_or_else(|| "image".to_string());
                if media_kind != "image" && media_kind != "video" {
                    return Err(rejection(
                        "invalid-input",
                        format!(
                            "ops[{op_index}] (begin_generation): mediaKind must be \"image\" or \
                             \"video\", got \"{media_kind}\"."
                        ),
                    ));
                }
                if media_kind == "video" && tool_id != "generate" {
                    return Err(rejection(
                        "invalid-input",
                        format!(
                            "ops[{op_index}] (begin_generation): mediaKind \"video\" is only \
                             allowed with toolId \"generate\"."
                        ),
                    ));
                }
                let prompt =
                    optional_string_field(object, "prompt", op_index, "begin_generation")?;
                let style_preset_id =
                    optional_string_field(object, "stylePresetId", op_index, "begin_generation")?;

                let operation_id = new_canvas_id("op");
                let mut normalized = Map::new();
                normalized.insert("op".to_string(), json!("begin_generation"));
                normalized.insert("mode".to_string(), json!(mode));
                normalized.insert("operationId".to_string(), json!(operation_id));
                normalized.insert("toolId".to_string(), json!(tool_id));
                normalized.insert("mediaKind".to_string(), json!(media_kind));

                let target_node_id: String;
                let mut source_node_id: Option<String> = None;
                if mode == "self" {
                    if object.get("sourceNodeId").is_some() {
                        return Err(rejection(
                            "invalid-input",
                            format!(
                                "ops[{op_index}] (begin_generation): mode \"self\" takes \
                                 \"nodeId\" only; \"sourceNodeId\" belongs to mode \"derived\"."
                            ),
                        ));
                    }
                    let node_id =
                        required_string(object, "nodeId", op_index, "begin_generation")?;
                    if !known.contains(&node_id) {
                        return Err(rejection(
                            "invalid-input",
                            format!(
                                "ops[{op_index}] (begin_generation): node \"{node_id}\" was not \
                                 found. Run CanvasRead to get current node ids."
                            ),
                        ));
                    }
                    // Self mode is reserved for the first generation into a
                    // blank card; a card that already has media must derive.
                    if known.has_media_in_snapshot(&node_id) {
                        return Err(rejection(
                            "self_target_has_media",
                            format!(
                                "ops[{op_index}] (begin_generation): node \"{node_id}\" already \
                                 has media, so mode \"self\" is not allowed. Use mode \
                                 \"derived\" with sourceNodeId \"{node_id}\" instead — existing \
                                 media is never overwritten."
                            ),
                        ));
                    }
                    // C2: a self generation can only land into a blank card
                    // whose kind matches the generation media kind. A text or
                    // group card (or an image card asked for video and vice
                    // versa) would spend money on a Generate call whose result
                    // can never land — the front-end applier skips it as
                    // `target_kind_mismatch`. Reject BEFORE the paid call,
                    // with the same code the front end uses.
                    let expected_kind = generation_card_kind(&media_kind);
                    if let Some(kind) = known.kind_of(&node_id) {
                        if kind != expected_kind {
                            return Err(rejection(
                                "target_kind_mismatch",
                                format!(
                                    "ops[{op_index}] (begin_generation): node \"{node_id}\" is a \
                                     \"{kind}\" card, but a {media_kind} generation in mode \
                                     \"self\" needs a blank \"{expected_kind}\" card — the \
                                     result could never land there. Use add_node to create a \
                                     {expected_kind} card, or pick an existing blank \
                                     {expected_kind} card."
                                ),
                            ));
                        }
                    }
                    target_node_id = node_id;
                } else {
                    if object.get("nodeId").is_some() {
                        return Err(rejection(
                            "invalid-input",
                            format!(
                                "ops[{op_index}] (begin_generation): mode \"derived\" takes \
                                 \"sourceNodeId\" only; the placeholder nodeId is generated by \
                                 the tool."
                            ),
                        ));
                    }
                    let source =
                        required_string(object, "sourceNodeId", op_index, "begin_generation")?;
                    if !known.contains(&source) {
                        return Err(rejection(
                            "invalid-input",
                            format!(
                                "ops[{op_index}] (begin_generation): sourceNodeId \"{source}\" \
                                 was not found. Run CanvasRead to get current node ids."
                            ),
                        ));
                    }
                    let placeholder_id = new_canvas_id("node");
                    let derived_edge_id = new_canvas_id("edge");
                    normalized.insert("sourceNodeId".to_string(), json!(source));
                    normalized.insert("edgeId".to_string(), json!(derived_edge_id));
                    known.batch_created.push((
                        placeholder_id.clone(),
                        generation_card_kind(&media_kind).to_string(),
                    ));
                    created_node_ids.push(placeholder_id.clone());
                    created_edge_ids.push(derived_edge_id);
                    source_node_id = Some(source);
                    target_node_id = placeholder_id;
                }
                normalized.insert("nodeId".to_string(), json!(target_node_id));
                if let Some(prompt) = &prompt {
                    normalized.insert("prompt".to_string(), json!(prompt));
                }
                if let Some(style_preset_id) = &style_preset_id {
                    normalized.insert("stylePresetId".to_string(), json!(style_preset_id));
                }
                normalized_ops.push(Value::Object(normalized));

                // Machine-assembled §3.2 binding: field-for-field the shape
                // the front-end InfiniteCanvasAgentTaskTypes binding declares
                // (workspaceId, documentId, nodeId, resultMode, sourceNodeId?,
                // toolId, operationId, stylePresetId?) plus the P3 mediaKind
                // marker for video. The model copies it verbatim.
                let mut binding = Map::new();
                binding.insert("workspaceId".to_string(), json!(workspace_id));
                binding.insert("documentId".to_string(), json!(document_id));
                binding.insert("nodeId".to_string(), json!(target_node_id));
                binding.insert("resultMode".to_string(), json!(mode));
                if let Some(source) = &source_node_id {
                    binding.insert("sourceNodeId".to_string(), json!(source));
                }
                binding.insert("toolId".to_string(), json!(tool_id));
                binding.insert("operationId".to_string(), json!(operation_id));
                if let Some(style_preset_id) = &style_preset_id {
                    binding.insert("stylePresetId".to_string(), json!(style_preset_id));
                }
                if media_kind == "video" {
                    binding.insert("mediaKind".to_string(), json!("video"));
                }
                generations.push(GenerationReceipt {
                    operation_id,
                    node_id: target_node_id,
                    binding: Value::Object(binding),
                });
            }
            other => {
                return Err(rejection(
                    "invalid-input",
                    format!(
                        "ops[{op_index}]: unknown op \"{other}\". Allowed ops: add_node, \
                         update_node, connect, disconnect, delete_node, begin_generation."
                    ),
                ));
            }
        }
    }

    Ok(ValidatedCanvasOpBatch {
        normalized_ops,
        created_node_ids,
        created_edge_ids,
        generations,
    })
}

struct JournalState {
    batches: Vec<Value>,
    last_seq: u64,
    /// Nodes created by journaled (possibly not yet applied) batches, mapped
    /// to the card kind their op declared (`None` when unknowable).
    created_nodes: std::collections::HashMap<String, Option<String>>,
}

/// Reads the journal tolerantly: a missing file is an empty journal, and a
/// corrupted file is treated as empty (the journal only backs "apply while
/// the panel was closed"; the worst case is a re-issuable no-op).
async fn read_ops_journal(path: &Path) -> JournalState {
    let mut state = JournalState {
        batches: Vec::new(),
        last_seq: 0,
        created_nodes: std::collections::HashMap::new(),
    };
    let raw = match tokio::fs::read_to_string(path).await {
        Ok(raw) => raw,
        Err(_) => return state,
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
        log::warn!(
            "Infinite canvas ops journal is corrupted; treating as empty: {}",
            path.display()
        );
        return state;
    };
    let Some(batches) = parsed.get("batches").and_then(Value::as_array) else {
        return state;
    };
    for batch in batches {
        let Some(seq) = batch.get("seq").and_then(Value::as_u64) else {
            continue;
        };
        state.last_seq = state.last_seq.max(seq);
        if let Some(ops) = batch.get("ops").and_then(Value::as_array) {
            for op in ops {
                let Some(node_id) = op.get("nodeId").and_then(Value::as_str) else {
                    continue;
                };
                match op.get("op").and_then(Value::as_str) {
                    Some("add_node") => {
                        let kind = op
                            .get("kind")
                            .and_then(Value::as_str)
                            .map(ToString::to_string);
                        state.created_nodes.insert(node_id.to_string(), kind);
                    }
                    Some("begin_generation") => {
                        // Derived mode created the placeholder with the media
                        // kind's card kind; self mode targets an existing node
                        // whose kind matched the media kind at validation, so
                        // recording that kind is correct either way.
                        let media_kind = op
                            .get("mediaKind")
                            .and_then(Value::as_str)
                            .unwrap_or("image");
                        state.created_nodes.insert(
                            node_id.to_string(),
                            Some(generation_card_kind(media_kind).to_string()),
                        );
                    }
                    _ => {}
                }
            }
        }
        state.batches.push(batch.clone());
    }
    state
}

/// Atomic journal write: serialize to a temp file in the same directory,
/// then rename over the target.
async fn write_ops_journal_atomic(
    path: &Path,
    document_id: &str,
    workspace_id: &str,
    batches: &[Value],
) -> Result<(), String> {
    let payload = json!({
        "schemaVersion": "1",
        "documentId": document_id,
        "workspaceId": workspace_id,
        "batches": batches,
    });
    let bytes = serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| error.to_string())?;
    }
    let temp_path = path.with_extension(format!("tmp-{}", uuid::Uuid::new_v4().simple()));
    tokio::fs::write(&temp_path, bytes)
        .await
        .map_err(|error| error.to_string())?;
    if let Err(error) = tokio::fs::rename(&temp_path, path).await {
        let _ = tokio::fs::remove_file(&temp_path).await;
        return Err(error.to_string());
    }
    Ok(())
}

pub struct CanvasOpTool;

impl CanvasOpTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CanvasOpTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for CanvasOpTool {
    fn name(&self) -> &str {
        "CanvasOp"
    }

    async fn description(&self) -> VoidResult<String> {
        Ok("Submit a typed batch of infinite canvas operations (add_node, update_node, \
            connect, disconnect, delete_node, begin_generation). The tool validates the \
            batch, generates node/edge/operation ids, appends the batch to the canvas ops \
            journal and returns a receipt. IMPORTANT SEMANTICS: \"accepted\" means the \
            instructions were registered, NOT that they are applied — the canvas applies \
            them asynchronously when the panel is open (or reconciles on next open). \
            Generated ids can be referenced in later calls immediately. Limits: at most 20 \
            operations per batch, at most 3 begin_generation; add_node kinds are text, \
            image, video (group is rejected); update_node may only set prompt, text, \
            stylePresetId, position, size; delete_node only removes cards without media — \
            real media cards must be deleted by the user in the UI. For begin_generation \
            the receipt contains a machine-assembled binding JSON: copy it verbatim into \
            the infinite_canvas parameter of GenerateImage (mediaKind image) or \
            GenerateVideo (mediaKind video). Standard flow: CanvasRead → CanvasOp with \
            begin_generation → GenerateImage/GenerateVideo with the returned binding."
            .to_string())
    }

    fn short_description(&self) -> String {
        "Register typed infinite canvas operations; receipt = accepted, not yet applied."
            .to_string()
    }

    fn default_exposure(&self) -> ToolExposure {
        ToolExposure::Collapsed
    }

    /// CanvasOp never spends money and only appends to the agent ops journal;
    /// the paid GenerateImage/GenerateVideo calls keep their own approval
    /// gates (plan §2.4 "花钱闸门不变").
    fn needs_permissions(&self, _input: Option<&Value>) -> bool {
        false
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "workspaceId": {
                    "type": "string",
                    "description": "Must match the CanvasRead workspaceId."
                },
                "documentId": {
                    "type": "string",
                    "description": "Must match the CanvasRead documentId."
                },
                "ops": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": CANVAS_OP_MAX_OPS,
                    "description": "Atomic batch (1..=20): any invalid operation rejects the whole batch. Ops: {op:\"add_node\", kind:\"text|image|video\", position:{x,y}, size?, text?, prompt?, stylePresetId?} | {op:\"update_node\", nodeId, set:{prompt?,text?,stylePresetId?,position?,size?}} | {op:\"connect\", sourceNodeId, targetNodeId} | {op:\"disconnect\", edgeId} | {op:\"delete_node\", nodeId} | {op:\"begin_generation\", mode:\"self|derived\", nodeId (self) or sourceNodeId (derived), toolId:\"generate|upscale|expand|inpaint|erase|matting\", mediaKind?:\"image|video\" (video only with generate), prompt?, stylePresetId?}.",
                    "items": { "type": "object" }
                }
            },
            "required": ["workspaceId", "documentId", "ops"]
        })
    }

    async fn validate_input(
        &self,
        input: &Value,
        _context: Option<&ToolUseContext>,
    ) -> ValidationResult {
        let Some(object) = input.as_object() else {
            return validation_error("input must be an object");
        };
        if is_nonempty_string(object.get("workspaceId")).is_none() {
            return validation_error("workspaceId is required");
        }
        if is_nonempty_string(object.get("documentId")).is_none() {
            return validation_error("documentId is required");
        }
        match object.get("ops").and_then(Value::as_array) {
            None => validation_error("ops must be an array"),
            Some(ops) if ops.is_empty() || ops.len() > CANVAS_OP_MAX_OPS => validation_error(
                format!("ops must contain between 1 and {CANVAS_OP_MAX_OPS} operations"),
            ),
            Some(_) => valid(),
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
        let Some(object) = input.as_object() else {
            return Ok(canvas_typed_error("invalid-input", "input must be an object"));
        };
        for key in object.keys() {
            if !matches!(key.as_str(), "workspaceId" | "documentId" | "ops") {
                return Ok(canvas_typed_error(
                    "invalid-input",
                    format!(
                        "unknown field \"{key}\". CanvasOp takes exactly workspaceId, \
                         documentId and ops."
                    ),
                ));
            }
        }
        let Some(workspace_id) = is_nonempty_string(object.get("workspaceId")) else {
            return Ok(canvas_typed_error(
                "invalid-input",
                "workspaceId is required and must be a non-empty string.",
            ));
        };
        let Some(document_id) = is_nonempty_string(object.get("documentId")) else {
            return Ok(canvas_typed_error(
                "invalid-input",
                "documentId is required and must be a non-empty string.",
            ));
        };
        let Some(ops) = object.get("ops").and_then(Value::as_array) else {
            return Ok(canvas_typed_error(
                "invalid-input",
                "ops is required and must be an array of operation objects.",
            ));
        };

        // Read-only snapshot check: the document must belong to this
        // workspace root and carry the exact identity the caller targets.
        let snapshot = match read_default_document_snapshot(&workspace_root).await {
            Ok((_, snapshot)) => snapshot,
            Err(error) => return Ok(error.into_tool_results()),
        };
        if snapshot.workspace_id != workspace_id {
            return Ok(canvas_typed_error(
                "workspace_mismatch",
                format!(
                    "workspaceId \"{workspace_id}\" does not match the canvas document's \
                     workspaceId \"{}\". Run CanvasRead and use its ids.",
                    snapshot.workspace_id
                ),
            ));
        }
        if snapshot.document_id != document_id {
            return Ok(canvas_typed_error(
                "document_mismatch",
                format!(
                    "documentId \"{document_id}\" does not match the canvas document's \
                     documentId \"{}\". Run CanvasRead and use its ids.",
                    snapshot.document_id
                ),
            ));
        }

        // Journal read + seq allocation + append happen under one in-process
        // lock so seq stays monotonic and appends never interleave.
        let journal_path = ops_journal_path(&workspace_root, &document_id);
        let _guard = CANVAS_OPS_JOURNAL_LOCK.lock().await;
        let journal = read_ops_journal(&journal_path).await;

        let validated = match validate_and_normalize_canvas_ops(
            ops,
            &workspace_id,
            &document_id,
            &snapshot,
            &journal.created_nodes,
        ) {
            Ok(validated) => validated,
            Err((code, message)) => return Ok(canvas_typed_error(&code, message)),
        };

        // Seq floor also honors the document watermark, so even after a
        // journal reset the new batch stays above what was already applied.
        let seq = journal.last_seq.max(snapshot.applied_seq) + 1;
        let batch_id = new_canvas_id("batch");
        let mut batches = journal.batches;
        batches.push(json!({
            "seq": seq,
            "batchId": batch_id,
            "createdAt": chrono::Utc::now().to_rfc3339(),
            "ops": validated.normalized_ops,
        }));
        if batches.len() > CANVAS_OPS_JOURNAL_MAX_BATCHES {
            let excess = batches.len() - CANVAS_OPS_JOURNAL_MAX_BATCHES;
            batches.drain(0..excess);
        }
        if let Err(message) =
            write_ops_journal_atomic(&journal_path, &document_id, &workspace_id, &batches).await
        {
            return Ok(canvas_typed_error(
                "io_error",
                format!("Failed to write the canvas ops journal: {message}"),
            ));
        }
        drop(_guard);

        let generations: Vec<Value> = validated
            .generations
            .iter()
            .map(|generation| {
                json!({
                    "operationId": generation.operation_id,
                    "nodeId": generation.node_id,
                    "binding": generation.binding,
                })
            })
            .collect();
        let generation_count = generations.len();
        let data = json!({
            "status": "accepted",
            "source": CANVAS_SOURCE,
            "workspaceId": workspace_id,
            "documentId": document_id,
            "seq": seq,
            "batchId": batch_id,
            "opCount": validated.normalized_ops.len(),
            "ops": validated.normalized_ops,
            "createdNodeIds": validated.created_node_ids,
            "createdEdgeIds": validated.created_edge_ids,
            "generations": generations,
            "note": "Operations accepted and journaled — they take effect when the canvas panel applies them (accepted does not mean applied yet). For each generation, pass binding verbatim as the infinite_canvas parameter of GenerateImage (image) or GenerateVideo (video)."
        });
        Ok(ok_result(
            data,
            format!(
                "CanvasOp batch accepted (seq {seq}, {} op(s), {generation_count} \
                 generation(s)). The operations are registered and will take effect when \
                 the canvas is open; \"accepted\" does not mean \"applied\" yet. Use the \
                 returned ids in follow-up calls, and copy each generations[].binding \
                 verbatim into the infinite_canvas parameter of GenerateImage or \
                 GenerateVideo.",
                validated.normalized_ops.len()
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

#[cfg(test)]
mod canvas_op_tests {
    use super::{CanvasOpTool, Tool, ToolResult, CANVAS_OPS_JOURNAL_MAX_BATCHES};
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
            "void-canvas-op-{tag}-{}",
            uuid::Uuid::new_v4().simple()
        ))
    }

    fn sample_document() -> Value {
        json!({
            "documentId": "doc-1",
            "schemaVersion": "1",
            "workspaceId": "workspace-1",
            "revision": 4,
            "nodes": [
                {
                    "nodeId": "node-blank",
                    "kind": "image",
                    "position": { "x": 0, "y": 0 },
                    "prompt": "a blank card"
                },
                {
                    "nodeId": "node-media",
                    "kind": "image",
                    "position": { "x": 200, "y": 0 },
                    "mediaRef": {
                        "workspacePath": "C:/ws",
                        "relativePath": "media/generated/batch-1/image-001.png"
                    }
                },
                {
                    "nodeId": "node-video-blank",
                    "kind": "video",
                    "position": { "x": 400, "y": 0 },
                    "prompt": "a blank video card"
                },
                {
                    "nodeId": "node-text",
                    "kind": "text",
                    "position": { "x": 600, "y": 0 },
                    "text": "a note"
                }
            ],
            "edges": [],
            "viewport": { "x": 0, "y": 0, "zoom": 1 },
            "updatedAt": "2026-08-24T00:00:00.000Z"
        })
    }

    async fn write_document(root: &Path, document: &Value) {
        let dir = root.join(".void").join("infinite-canvas");
        tokio::fs::create_dir_all(&dir).await.expect("canvas dir");
        tokio::fs::write(
            dir.join("doc-1.json"),
            serde_json::to_vec_pretty(document).expect("document json"),
        )
        .await
        .expect("write document");
    }

    fn journal_path(root: &Path) -> PathBuf {
        root.join(".void")
            .join("infinite-canvas")
            .join("doc-1.ops.json")
    }

    async fn read_journal(root: &Path) -> Value {
        let raw = tokio::fs::read_to_string(journal_path(root))
            .await
            .expect("journal file");
        serde_json::from_str(&raw).expect("journal json")
    }

    fn result_data(results: &[ToolResult]) -> &Value {
        match results.first().expect("one tool result") {
            ToolResult::Result { data, .. } => data,
            other => panic!("expected a data-bearing result, got {other:?}"),
        }
    }

    fn base_input(ops: Value) -> Value {
        json!({
            "workspaceId": "workspace-1",
            "documentId": "doc-1",
            "ops": ops
        })
    }

    async fn call(root: &Path, input: &Value) -> Vec<ToolResult> {
        CanvasOpTool::new()
            .call_impl(input, &test_context(root.to_path_buf()))
            .await
            .expect("tool results")
    }

    // —— limits & whole-batch rejection ————————————————————————————————

    #[tokio::test]
    async fn rejects_batches_over_the_op_limit_without_journaling() {
        let root = temp_workspace("op-limit");
        write_document(&root, &sample_document()).await;
        let ops: Vec<Value> = (0..21)
            .map(|index| {
                json!({
                    "op": "add_node",
                    "kind": "text",
                    "position": { "x": index, "y": 0 }
                })
            })
            .collect();

        let results = call(&root, &base_input(json!(ops))).await;
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "invalid-input");
        assert!(!journal_path(&root).exists(), "no batch may be journaled");

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn rejects_more_than_three_begin_generation_ops() {
        let root = temp_workspace("gen-limit");
        write_document(&root, &sample_document()).await;
        let generation = json!({
            "op": "begin_generation",
            "mode": "derived",
            "sourceNodeId": "node-media",
            "toolId": "generate"
        });
        let ops = json!([generation, generation, generation, generation]);

        let results = call(&root, &base_input(ops)).await;
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "invalid-input");
        assert!(data["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("begin_generation")));
        assert!(!journal_path(&root).exists());

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn one_invalid_op_rejects_the_whole_batch_atomically() {
        let root = temp_workspace("atomic");
        write_document(&root, &sample_document()).await;
        let ops = json!([
            { "op": "add_node", "kind": "text", "position": { "x": 0, "y": 0 } },
            { "op": "add_node", "kind": "group", "position": { "x": 10, "y": 0 } }
        ]);

        let results = call(&root, &base_input(ops)).await;
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert!(
            !journal_path(&root).exists(),
            "the valid op must not be journaled when a sibling op is invalid"
        );

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    // —— per-op validation ————————————————————————————————————————————

    #[tokio::test]
    async fn rejects_group_kind_and_unknown_kinds_on_add_node() {
        let root = temp_workspace("group");
        write_document(&root, &sample_document()).await;

        for kind in ["group", "audio"] {
            let results = call(
                &root,
                &base_input(json!([
                    { "op": "add_node", "kind": kind, "position": { "x": 0, "y": 0 } }
                ])),
            )
            .await;
            let data = result_data(&results);
            assert_eq!(data["status"], "error");
            assert_eq!(data["error"]["code"], "invalid-input");
        }

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn update_node_enforces_the_set_whitelist() {
        let root = temp_workspace("whitelist");
        write_document(&root, &sample_document()).await;

        for forbidden in ["mediaRef", "derivedFrom", "generation", "domainRef", "nodeId"] {
            let results = call(
                &root,
                &base_input(json!([
                    { "op": "update_node", "nodeId": "node-blank", "set": { forbidden: "x" } }
                ])),
            )
            .await;
            let data = result_data(&results);
            assert_eq!(data["status"], "error");
            assert_eq!(data["error"]["code"], "invalid-input");
            assert!(data["error"]["message"]
                .as_str()
                .is_some_and(|message| message.contains(forbidden)));
        }

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn rejects_field_aliases_and_unknown_op_fields() {
        let root = temp_workspace("aliases");
        write_document(&root, &sample_document()).await;

        // snake_case alias for nodeId is rejected, with a correction hint.
        let alias = call(
            &root,
            &base_input(json!([
                { "op": "delete_node", "node_id": "node-blank" }
            ])),
        )
        .await;
        assert_eq!(result_data(&alias)["error"]["code"], "invalid-input");

        // Unknown extra field on a valid op is rejected.
        let extra = call(
            &root,
            &base_input(json!([
                { "op": "disconnect", "edgeId": "edge-1", "force": true }
            ])),
        )
        .await;
        assert_eq!(result_data(&extra)["error"]["code"], "invalid-input");

        // Unknown op name is rejected.
        let unknown = call(
            &root,
            &base_input(json!([{ "op": "move_node", "nodeId": "node-blank" }])),
        )
        .await;
        assert_eq!(result_data(&unknown)["error"]["code"], "invalid-input");

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn accepts_a_whitelisted_update_and_journals_it_normalized() {
        let root = temp_workspace("update-ok");
        write_document(&root, &sample_document()).await;

        let results = call(
            &root,
            &base_input(json!([
                {
                    "op": "update_node",
                    "nodeId": "node-blank",
                    "set": {
                        "prompt": "new prompt",
                        "position": { "x": 42, "y": 24 }
                    }
                }
            ])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "accepted");
        let journal = read_journal(&root).await;
        let op = &journal["batches"][0]["ops"][0];
        assert_eq!(op["op"], "update_node");
        assert_eq!(op["nodeId"], "node-blank");
        assert_eq!(op["set"]["prompt"], "new prompt");
        assert_eq!(op["set"]["position"]["x"], 42.0);

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    // —— delete protection ————————————————————————————————————————————

    #[tokio::test]
    async fn refuses_to_delete_a_card_that_carries_media() {
        let root = temp_workspace("delete-media");
        write_document(&root, &sample_document()).await;

        let results = call(
            &root,
            &base_input(json!([{ "op": "delete_node", "nodeId": "node-media" }])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "delete_protected");
        assert!(data["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("UI")));
        assert!(!journal_path(&root).exists());

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn allows_deleting_blank_cards_and_treats_missing_targets_as_noop() {
        let root = temp_workspace("delete-blank");
        write_document(&root, &sample_document()).await;

        let results = call(
            &root,
            &base_input(json!([
                { "op": "delete_node", "nodeId": "node-blank" },
                { "op": "delete_node", "nodeId": "node-that-never-existed" }
            ])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "accepted");
        assert_eq!(data["opCount"], 2);

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    // —— workspace / document identity gates ——————————————————————————

    #[tokio::test]
    async fn rejects_workspace_and_document_mismatches() {
        let root = temp_workspace("mismatch");
        write_document(&root, &sample_document()).await;
        let op = json!([{ "op": "delete_node", "nodeId": "node-blank" }]);

        let wrong_workspace = call(
            &root,
            &json!({ "workspaceId": "workspace-other", "documentId": "doc-1", "ops": op }),
        )
        .await;
        assert_eq!(
            result_data(&wrong_workspace)["error"]["code"],
            "workspace_mismatch"
        );

        let wrong_document = call(
            &root,
            &json!({ "workspaceId": "workspace-1", "documentId": "doc-other", "ops": op }),
        )
        .await;
        assert_eq!(
            result_data(&wrong_document)["error"]["code"],
            "document_mismatch"
        );
        assert!(!journal_path(&root).exists());

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    // —— begin_generation receipts & bindings ————————————————————————

    #[tokio::test]
    async fn self_generation_on_a_blank_card_returns_a_verbatim_image_binding() {
        let root = temp_workspace("gen-self");
        write_document(&root, &sample_document()).await;

        let results = call(
            &root,
            &base_input(json!([
                {
                    "op": "begin_generation",
                    "mode": "self",
                    "nodeId": "node-blank",
                    "toolId": "generate",
                    "prompt": "a cyberpunk cat",
                    "stylePresetId": "cinematic:sp-1"
                }
            ])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "accepted");
        assert_eq!(data["generations"].as_array().map(Vec::len), Some(1));
        let generation = &data["generations"][0];
        assert_eq!(generation["nodeId"], "node-blank");
        let operation_id = generation["operationId"].as_str().expect("operation id");
        assert!(operation_id.starts_with("op-"));

        // The binding must be field-for-field the front-end
        // InfiniteCanvasAgentTaskTypes binding shape (K2 §3.2): no extra
        // keys, no aliases, image bindings carry no mediaKind. (Key order is
        // serde-sorted; the contract is the exact key set.)
        let binding = generation["binding"].as_object().expect("binding");
        let mut keys: Vec<&str> = binding.keys().map(String::as_str).collect();
        keys.sort_unstable();
        let mut expected = vec![
            "workspaceId",
            "documentId",
            "nodeId",
            "resultMode",
            "toolId",
            "operationId",
            "stylePresetId",
        ];
        expected.sort_unstable();
        assert_eq!(keys, expected);
        assert_eq!(binding["workspaceId"], "workspace-1");
        assert_eq!(binding["documentId"], "doc-1");
        assert_eq!(binding["nodeId"], "node-blank");
        assert_eq!(binding["resultMode"], "self");
        assert_eq!(binding["toolId"], "generate");
        assert_eq!(binding["operationId"], operation_id);
        assert_eq!(binding["stylePresetId"], "cinematic:sp-1");

        // The journaled op carries the same generated operation id.
        let journal = read_journal(&root).await;
        assert_eq!(
            journal["batches"][0]["ops"][0]["operationId"],
            operation_id
        );

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn self_generation_on_a_media_card_is_rejected() {
        let root = temp_workspace("gen-self-media");
        write_document(&root, &sample_document()).await;

        let results = call(
            &root,
            &base_input(json!([
                {
                    "op": "begin_generation",
                    "mode": "self",
                    "nodeId": "node-media",
                    "toolId": "generate"
                }
            ])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "self_target_has_media");
        assert!(data["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("derived")));

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn derived_video_generation_creates_placeholder_edge_and_video_binding() {
        let root = temp_workspace("gen-derived-video");
        write_document(&root, &sample_document()).await;

        let results = call(
            &root,
            &base_input(json!([
                {
                    "op": "begin_generation",
                    "mode": "derived",
                    "sourceNodeId": "node-media",
                    "toolId": "generate",
                    "mediaKind": "video",
                    "prompt": "make it move"
                }
            ])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "accepted");
        let created_nodes = data["createdNodeIds"].as_array().expect("created nodes");
        let created_edges = data["createdEdgeIds"].as_array().expect("created edges");
        assert_eq!(created_nodes.len(), 1);
        assert_eq!(created_edges.len(), 1);
        let placeholder_id = created_nodes[0].as_str().expect("placeholder id");
        assert!(placeholder_id.starts_with("node-"));
        assert!(created_edges[0]
            .as_str()
            .is_some_and(|edge| edge.starts_with("edge-")));

        let generation = &data["generations"][0];
        assert_eq!(generation["nodeId"], placeholder_id);
        let binding = generation["binding"].as_object().expect("binding");
        let mut keys: Vec<&str> = binding.keys().map(String::as_str).collect();
        keys.sort_unstable();
        let mut expected = vec![
            "workspaceId",
            "documentId",
            "nodeId",
            "resultMode",
            "sourceNodeId",
            "toolId",
            "operationId",
            "mediaKind",
        ];
        expected.sort_unstable();
        assert_eq!(keys, expected);
        assert_eq!(binding["resultMode"], "derived");
        assert_eq!(binding["sourceNodeId"], "node-media");
        assert_eq!(binding["nodeId"], placeholder_id);
        assert_eq!(binding["mediaKind"], "video");

        // The journaled op carries mode, placeholder, edge and mediaKind so
        // the front-end applier can land the placeholder without guessing.
        let journal = read_journal(&root).await;
        let op = &journal["batches"][0]["ops"][0];
        assert_eq!(op["mode"], "derived");
        assert_eq!(op["nodeId"], placeholder_id);
        assert_eq!(op["sourceNodeId"], "node-media");
        assert_eq!(op["mediaKind"], "video");
        assert!(op["edgeId"].as_str().is_some());

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    // —— C2: self mode enforces card kind vs media kind, before the paid call —

    #[tokio::test]
    async fn self_generation_on_a_text_card_is_rejected_as_target_kind_mismatch() {
        let root = temp_workspace("gen-self-text");
        write_document(&root, &sample_document()).await;

        let results = call(
            &root,
            &base_input(json!([
                {
                    "op": "begin_generation",
                    "mode": "self",
                    "nodeId": "node-text",
                    "toolId": "generate",
                    "prompt": "a cat"
                }
            ])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "target_kind_mismatch");
        assert!(data["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("text") && message.contains("image")));
        // Rejected before the money gate: nothing journaled, no binding.
        assert!(!journal_path(&root).exists());

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn self_video_generation_requires_a_video_card() {
        let root = temp_workspace("gen-self-kind");
        write_document(&root, &sample_document()).await;

        // Video generation aimed at a blank IMAGE card: rejected.
        let wrong = call(
            &root,
            &base_input(json!([
                {
                    "op": "begin_generation",
                    "mode": "self",
                    "nodeId": "node-blank",
                    "toolId": "generate",
                    "mediaKind": "video"
                }
            ])),
        )
        .await;
        assert_eq!(result_data(&wrong)["error"]["code"], "target_kind_mismatch");
        assert!(!journal_path(&root).exists());

        // Image generation aimed at a blank VIDEO card: rejected too.
        let wrong_image = call(
            &root,
            &base_input(json!([
                {
                    "op": "begin_generation",
                    "mode": "self",
                    "nodeId": "node-video-blank",
                    "toolId": "generate"
                }
            ])),
        )
        .await;
        assert_eq!(
            result_data(&wrong_image)["error"]["code"],
            "target_kind_mismatch"
        );

        // Matching kinds are accepted: video generation on the video card.
        let matched = call(
            &root,
            &base_input(json!([
                {
                    "op": "begin_generation",
                    "mode": "self",
                    "nodeId": "node-video-blank",
                    "toolId": "generate",
                    "mediaKind": "video"
                }
            ])),
        )
        .await;
        let matched_data = result_data(&matched);
        assert_eq!(matched_data["status"], "accepted");
        assert_eq!(matched_data["generations"][0]["binding"]["mediaKind"], "video");

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn self_generation_kind_gate_covers_journal_created_nodes() {
        let root = temp_workspace("gen-self-journal-kind");
        write_document(&root, &sample_document()).await;

        // Kind checks also hold for nodes that only exist in the ops journal
        // (created by an earlier accepted batch the canvas has not applied).
        let results = call(
            &root,
            &base_input(json!([
                { "op": "add_node", "kind": "text", "position": { "x": 0, "y": 0 } },
                {
                    "op": "begin_generation",
                    "mode": "self",
                    "nodeId": "node-blank",
                    "toolId": "generate"
                }
            ])),
        )
        .await;
        // The whole batch is fine (node-blank is an image card, image gen).
        assert_eq!(result_data(&results)["status"], "accepted");

        // But referencing a freshly created TEXT node as self target fails.
        // First create the text node in its own batch to get its id.
        let created = call(
            &root,
            &base_input(json!([
                { "op": "add_node", "kind": "text", "position": { "x": 10, "y": 0 } }
            ])),
        )
        .await;
        let text_node_id = result_data(&created)["createdNodeIds"][0]
            .as_str()
            .expect("created node id")
            .to_string();
        let mismatch = call(
            &root,
            &base_input(json!([
                {
                    "op": "begin_generation",
                    "mode": "self",
                    "nodeId": text_node_id,
                    "toolId": "generate"
                }
            ])),
        )
        .await;
        assert_eq!(
            result_data(&mismatch)["error"]["code"],
            "target_kind_mismatch"
        );

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    // —— C4: connect self-loop rejection and duplicate-edge idempotency ———

    #[tokio::test]
    async fn connect_rejects_self_loop_edges_without_journaling() {
        let root = temp_workspace("connect-self-loop");
        write_document(&root, &sample_document()).await;

        let results = call(
            &root,
            &base_input(json!([
                { "op": "connect", "sourceNodeId": "node-blank", "targetNodeId": "node-blank" }
            ])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "invalid-input");
        assert!(data["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("self-loop")));
        assert!(!journal_path(&root).exists());

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn connect_duplicate_same_direction_edge_is_idempotent_not_a_phantom_edge() {
        let root = temp_workspace("connect-duplicate");
        let mut document = sample_document();
        document["edges"] = json!([
            { "edgeId": "edge-existing", "sourceNodeId": "node-blank", "targetNodeId": "node-media" }
        ]);
        write_document(&root, &document).await;

        let results = call(
            &root,
            &base_input(json!([
                { "op": "connect", "sourceNodeId": "node-blank", "targetNodeId": "node-media" }
            ])),
        )
        .await;
        let data = result_data(&results);

        // Accepted with idempotent semantics (front-end skips it as
        // already_exists): the receipt reuses the existing edge id, marks the
        // op, and reports NO created edge.
        assert_eq!(data["status"], "accepted");
        assert_eq!(data["createdEdgeIds"].as_array().map(Vec::len), Some(0));
        assert_eq!(data["ops"][0]["edgeId"], "edge-existing");
        assert_eq!(data["ops"][0]["alreadyExists"], true);

        // The REVERSE direction is a different edge and is still created.
        let reverse = call(
            &root,
            &base_input(json!([
                { "op": "connect", "sourceNodeId": "node-media", "targetNodeId": "node-blank" }
            ])),
        )
        .await;
        let reverse_data = result_data(&reverse);
        assert_eq!(reverse_data["status"], "accepted");
        assert_eq!(reverse_data["createdEdgeIds"].as_array().map(Vec::len), Some(1));

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn video_media_kind_requires_the_generate_tool() {
        let root = temp_workspace("video-toolid");
        write_document(&root, &sample_document()).await;

        let results = call(
            &root,
            &base_input(json!([
                {
                    "op": "begin_generation",
                    "mode": "derived",
                    "sourceNodeId": "node-media",
                    "toolId": "upscale",
                    "mediaKind": "video"
                }
            ])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "invalid-input");
        assert!(data["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("generate")));

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    // —— journal: seq monotonicity, atomic append, trim, id reuse —————

    #[tokio::test]
    async fn journal_appends_are_atomic_with_monotonic_seq() {
        let root = temp_workspace("journal-seq");
        write_document(&root, &sample_document()).await;

        let first = call(
            &root,
            &base_input(json!([
                { "op": "add_node", "kind": "image", "position": { "x": 0, "y": 0 } }
            ])),
        )
        .await;
        let first_data = result_data(&first);
        assert_eq!(first_data["seq"], 1);

        let second = call(
            &root,
            &base_input(json!([
                { "op": "add_node", "kind": "text", "position": { "x": 100, "y": 0 } }
            ])),
        )
        .await;
        let second_data = result_data(&second);
        assert_eq!(second_data["seq"], 2);

        let journal = read_journal(&root).await;
        assert_eq!(journal["schemaVersion"], "1");
        assert_eq!(journal["documentId"], "doc-1");
        assert_eq!(journal["workspaceId"], "workspace-1");
        let batches = journal["batches"].as_array().expect("batches");
        assert_eq!(batches.len(), 2);
        // The first batch survives the second append untouched.
        assert_eq!(batches[0]["seq"], 1);
        assert_eq!(batches[0]["batchId"], first_data["batchId"]);
        assert_eq!(batches[0]["ops"][0]["kind"], "image");
        assert_eq!(batches[1]["seq"], 2);
        assert_eq!(batches[1]["ops"][0]["kind"], "text");

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn journal_is_trimmed_to_the_bounded_batch_count() {
        let root = temp_workspace("journal-trim");
        write_document(&root, &sample_document()).await;
        let dir = root.join(".void").join("infinite-canvas");
        tokio::fs::create_dir_all(&dir).await.expect("dir");
        let prefilled: Vec<Value> = (1..=CANVAS_OPS_JOURNAL_MAX_BATCHES as u64)
            .map(|seq| {
                json!({
                    "seq": seq,
                    "batchId": format!("batch-prefill-{seq}"),
                    "createdAt": "2026-08-24T00:00:00.000Z",
                    "ops": [{ "op": "delete_node", "nodeId": format!("node-x-{seq}") }]
                })
            })
            .collect();
        tokio::fs::write(
            journal_path(&root),
            serde_json::to_vec(&json!({
                "schemaVersion": "1",
                "documentId": "doc-1",
                "workspaceId": "workspace-1",
                "batches": prefilled
            }))
            .expect("prefill json"),
        )
        .await
        .expect("write prefill");

        let results = call(
            &root,
            &base_input(json!([
                { "op": "add_node", "kind": "text", "position": { "x": 0, "y": 0 } }
            ])),
        )
        .await;
        let data = result_data(&results);
        assert_eq!(data["seq"], CANVAS_OPS_JOURNAL_MAX_BATCHES as u64 + 1);

        let journal = read_journal(&root).await;
        let batches = journal["batches"].as_array().expect("batches");
        assert_eq!(batches.len(), CANVAS_OPS_JOURNAL_MAX_BATCHES);
        // The oldest batch was dropped; the newest is the appended one.
        assert_eq!(batches[0]["seq"], 2);
        assert_eq!(
            batches[batches.len() - 1]["seq"],
            CANVAS_OPS_JOURNAL_MAX_BATCHES as u64 + 1
        );

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn ids_from_an_earlier_receipt_are_usable_before_the_canvas_applies_them() {
        let root = temp_workspace("journal-id-reuse");
        write_document(&root, &sample_document()).await;

        let first = call(
            &root,
            &base_input(json!([
                { "op": "add_node", "kind": "image", "position": { "x": 0, "y": 0 } }
            ])),
        )
        .await;
        let new_node_id = result_data(&first)["createdNodeIds"][0]
            .as_str()
            .expect("created node id")
            .to_string();

        // The document snapshot still knows nothing about the new node, but
        // the journal does — referencing the receipt id must be accepted.
        let second = call(
            &root,
            &base_input(json!([
                { "op": "connect", "sourceNodeId": "node-media", "targetNodeId": new_node_id }
            ])),
        )
        .await;
        let second_data = result_data(&second);

        assert_eq!(second_data["status"], "accepted");
        assert_eq!(second_data["createdEdgeIds"].as_array().map(Vec::len), Some(1));

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn connect_to_a_completely_unknown_node_is_rejected() {
        let root = temp_workspace("connect-unknown");
        write_document(&root, &sample_document()).await;

        let results = call(
            &root,
            &base_input(json!([
                { "op": "connect", "sourceNodeId": "node-media", "targetNodeId": "node-ghost" }
            ])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "invalid-input");
        assert!(data["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("node-ghost")));

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    // —— receipt semantics & tool posture ————————————————————————————

    #[tokio::test]
    async fn receipt_states_accepted_is_not_applied() {
        let root = temp_workspace("receipt-semantics");
        write_document(&root, &sample_document()).await;

        let results = call(
            &root,
            &base_input(json!([
                { "op": "add_node", "kind": "text", "position": { "x": 0, "y": 0 } }
            ])),
        )
        .await;
        let data = result_data(&results);
        assert_eq!(data["status"], "accepted");
        assert!(data["note"]
            .as_str()
            .is_some_and(|note| note.contains("does not mean applied")));

        let description = CanvasOpTool::new().description().await.expect("description");
        assert!(description.contains("NOT that they are applied"));
        assert!(description.contains("verbatim"));

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn canvas_op_never_writes_the_document_file() {
        let root = temp_workspace("doc-untouched");
        let document = sample_document();
        write_document(&root, &document).await;
        let document_path = root
            .join(".void")
            .join("infinite-canvas")
            .join("doc-1.json");
        let before = tokio::fs::read_to_string(&document_path)
            .await
            .expect("document before");

        let _ = call(
            &root,
            &base_input(json!([
                { "op": "add_node", "kind": "image", "position": { "x": 0, "y": 0 } },
                { "op": "delete_node", "nodeId": "node-blank" }
            ])),
        )
        .await;

        let after = tokio::fs::read_to_string(&document_path)
            .await
            .expect("document after");
        assert_eq!(
            before, after,
            "the canvas document's only writer is the front end"
        );

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn canvas_op_requires_no_permission_prompt_and_is_not_readonly() {
        let tool = CanvasOpTool::new();
        assert!(!tool.is_readonly());
        assert!(!tool.needs_permissions(None));
    }

    #[tokio::test]
    async fn corrupted_journal_is_treated_as_empty_but_seq_honors_the_watermark() {
        let root = temp_workspace("journal-corrupted");
        let mut document = sample_document();
        document["agentOps"] = json!({ "appliedSeq": 41 });
        write_document(&root, &document).await;
        let dir = root.join(".void").join("infinite-canvas");
        tokio::fs::create_dir_all(&dir).await.expect("dir");
        tokio::fs::write(journal_path(&root), b"{ not json")
            .await
            .expect("write corrupted journal");

        let results = call(
            &root,
            &base_input(json!([
                { "op": "add_node", "kind": "text", "position": { "x": 0, "y": 0 } }
            ])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "accepted");
        // Seq floor = document appliedSeq, so a reset journal can never hand
        // out seqs the front end would skip as already applied.
        assert_eq!(data["seq"], 42);

        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn missing_document_is_a_typed_not_found_result() {
        let root = temp_workspace("no-doc");

        let results = call(
            &root,
            &base_input(json!([
                { "op": "add_node", "kind": "text", "position": { "x": 0, "y": 0 } }
            ])),
        )
        .await;
        let data = result_data(&results);

        assert_eq!(data["status"], "error");
        assert_eq!(data["error"]["code"], "document_not_found");

        let _ = tokio::fs::remove_dir_all(root).await;
    }
}
