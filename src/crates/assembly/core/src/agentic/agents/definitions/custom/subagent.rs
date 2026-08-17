use crate::agentic::agents::Agent;
use crate::agentic::agents::{PromptBuilder, PromptBuilderContext, UserContextPolicy};
use crate::agentic::session::SystemPromptCacheIdentity;
use crate::util::errors::{VoidError, VoidResult};
use crate::util::FrontMatterMarkdown;
use async_trait::async_trait;
use serde_yaml::Value;
use sha2::{Digest, Sha256};

/// Subagent type: project-level or user-level
#[derive(Debug, Clone, Copy)]
pub enum CustomSubagentKind {
    /// Project subagent
    Project,
    /// User subagent
    User,
}

pub struct CustomSubagent {
    pub name: String,
    /// Localized name shown in the catalog. `name` remains the immutable
    /// runtime identity used by registry keys, cache keys, and file names.
    pub display_name: Option<String>,
    pub description: String,
    pub tools: Vec<String>,
    pub prompt: String,
    pub readonly: bool,
    pub review: bool,
    pub path: String,
    pub kind: CustomSubagentKind,
    /// Model ID to use, default "fast"
    pub model: String,
    /// Parent modes that may activate this custom persona. An empty list keeps
    /// legacy custom agents public in every scenario.
    pub allowed_parent_agent_ids: Vec<String>,
}

#[async_trait]
impl Agent for CustomSubagent {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn id(&self) -> &str {
        &self.name
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn description(&self) -> &str {
        &self.description
    }

    fn prompt_template_name(&self, _model_name: Option<&str>) -> &str {
        ""
    }

    fn system_prompt_cache_identity(&self, _model_name: Option<&str>) -> SystemPromptCacheIdentity {
        let prompt_hash = hex::encode(Sha256::digest(self.prompt_with_runtime_policy().as_bytes()));
        SystemPromptCacheIdentity::new(format!("custom_prompt_sha256:{prompt_hash}"))
    }

    async fn build_prompt(&self, context: &PromptBuilderContext) -> VoidResult<String> {
        let prompt_builder = PromptBuilder::new(context.clone());

        let prompt = prompt_builder
            .build_prompt_from_template(&self.prompt)
            .await?;

        Ok(self.append_runtime_policy(prompt))
    }

    fn default_tools(&self) -> Vec<String> {
        self.runtime_tools()
    }

    fn user_context_policy(&self) -> UserContextPolicy {
        UserContextPolicy::empty()
            .with_workspace_context()
            .with_workspace_instructions()
            .with_project_layout()
    }

    fn is_readonly(&self) -> bool {
        self.readonly
    }
}

impl CustomSubagent {
    pub fn new(
        name: String,
        description: String,
        tools: Vec<String>,
        prompt: String,
        readonly: bool,
        path: String,
        kind: CustomSubagentKind,
    ) -> Self {
        Self {
            name,
            display_name: None,
            description,
            tools,
            prompt,
            readonly,
            review: false,
            path,
            kind,
            model: "fast".to_string(),
            allowed_parent_agent_ids: Vec::new(),
        }
    }

    pub fn with_display_name(mut self, display_name: Option<String>) -> Self {
        self.display_name = Self::normalize_display_name(display_name);
        self
    }

    pub fn with_allowed_parent_agent_ids<I, S>(mut self, parent_agent_ids: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.allowed_parent_agent_ids =
            Self::normalize_parent_agent_ids(parent_agent_ids.into_iter().map(Into::into));
        self
    }

    pub fn presentation_name(&self) -> &str {
        self.display_name.as_deref().unwrap_or(&self.name)
    }

    pub fn visibility_policy(
        &self,
    ) -> crate::agentic::agents::registry::visibility::SubagentVisibilityPolicy {
        if self.allowed_parent_agent_ids.is_empty() {
            crate::agentic::agents::registry::visibility::SubagentVisibilityPolicy::public()
        } else {
            crate::agentic::agents::registry::visibility::SubagentVisibilityPolicy::restricted(
                self.allowed_parent_agent_ids.clone(),
            )
        }
    }

    fn normalize_display_name(display_name: Option<String>) -> Option<String> {
        display_name
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    }

    fn normalize_parent_agent_ids<I>(parent_agent_ids: I) -> Vec<String>
    where
        I: IntoIterator<Item = String>,
    {
        let mut normalized: Vec<String> = parent_agent_ids
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect();
        normalized.sort();
        normalized.dedup();
        normalized
    }

    pub fn from_file(path: &str, kind: CustomSubagentKind) -> VoidResult<Self> {
        let (metadata, content) = FrontMatterMarkdown::load(path)?;
        let name = metadata
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| VoidError::Agent("Missing name field".to_string()))?
            .to_string();
        let display_name = Self::normalize_display_name(
            metadata
                .get("displayName")
                .and_then(|v| v.as_str())
                .map(str::to_string),
        );
        let description = metadata
            .get("description")
            .and_then(|v| v.as_str())
            .ok_or_else(|| VoidError::Agent("Missing description field".to_string()))?
            .to_string();
        let tools: Vec<String> = metadata
            .get("tools")
            .and_then(|v| v.as_str())
            .map(|s| s.split(',').map(|x| x.trim().to_string()).collect())
            .unwrap_or_else(|| Self::DEFAULT_TOOLS.iter().map(|s| s.to_string()).collect());

        let readonly = metadata
            .get("readonly")
            .and_then(|v| v.as_bool())
            .unwrap_or(Self::DEFAULT_READONLY);

        let review = metadata
            .get("review")
            .and_then(|v| v.as_bool())
            .unwrap_or(Self::DEFAULT_REVIEW);

        let model = metadata
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or(Self::DEFAULT_MODEL)
            .to_string();
        let allowed_parent_agent_ids = Self::normalize_parent_agent_ids(
            metadata
                .get("allowedParentAgentIds")
                .and_then(|value| value.as_sequence())
                .into_iter()
                .flatten()
                .filter_map(|value| value.as_str().map(str::to_string)),
        );

        Ok(Self {
            name,
            display_name,
            description,
            tools,
            prompt: content,
            readonly,
            review,
            path: path.to_string(),
            kind,
            model,
            allowed_parent_agent_ids,
        })
    }

    const DEFAULT_TOOLS: &'static [&'static str] =
        &["LS", "Read", "Glob", "Grep", "ShortDramaProject"];
    const SHORT_DRAMA_STAGE_AGENT_NAMES: &'static [&'static str] =
        &["ScriptAI", "AssetAI", "SplitAI", "VideoAI", "EditorAI"];
    const DEFAULT_READONLY: bool = true;
    const DEFAULT_REVIEW: bool = false;
    const DEFAULT_MODEL: &'static str = "fast";

    fn has_short_drama_project_tool(&self) -> bool {
        self.tools.iter().any(|tool| tool == "ShortDramaProject")
    }

    fn is_short_drama_stage_agent(&self) -> bool {
        Self::SHORT_DRAMA_STAGE_AGENT_NAMES
            .iter()
            .any(|name| self.name.eq_ignore_ascii_case(name))
    }

    fn has_short_drama_skill_access(&self) -> bool {
        self.name.eq_ignore_ascii_case("AssetAI") || self.name.eq_ignore_ascii_case("SplitAI")
    }

    fn runtime_tools(&self) -> Vec<String> {
        let mut tools = self.tools.clone();
        if self.is_short_drama_stage_agent() && self.has_short_drama_project_tool() {
            if self.has_short_drama_skill_access()
                && !tools.iter().any(|current| current == "Skill")
            {
                tools.push("Skill".to_string());
            } else if !self.has_short_drama_skill_access() {
                tools.retain(|current| current != "Skill");
            }
            for tool in self.short_drama_media_tools() {
                if !tools.iter().any(|current| current == tool) {
                    tools.push((*tool).to_string());
                }
            }
        }
        tools
    }

    fn short_drama_media_tools(&self) -> &'static [&'static str] {
        if self.name.eq_ignore_ascii_case("AssetAI") || self.name.eq_ignore_ascii_case("SplitAI") {
            &["GenerateImage", "GetMediaTaskStatus", "UploadMediaImage"]
        } else if self.name.eq_ignore_ascii_case("VideoAI") {
            &["GenerateVideo", "GetMediaTaskStatus", "UploadMediaImage"]
        } else if self.name.eq_ignore_ascii_case("EditorAI") {
            &["GenerateSpeech", "TranscribeAudio", "GetMediaTaskStatus"]
        } else {
            &[]
        }
    }

    fn append_runtime_policy(&self, prompt: String) -> String {
        if self.has_short_drama_project_tool() {
            let role_policy = if self.name.eq_ignore_ascii_case("AssetAI") {
                format!("\n\n{SHORT_DRAMA_ASSET_AI_POLICY}")
            } else if self.name.eq_ignore_ascii_case("SplitAI") {
                format!("\n\n{SHORT_DRAMA_SPLIT_AI_POLICY}")
            } else {
                String::new()
            };
            format!(
                "{prompt}\n\n{}{role_policy}",
                SHORT_DRAMA_CUSTOM_SUBAGENT_POLICY
            )
        } else {
            prompt
        }
    }

    fn prompt_with_runtime_policy(&self) -> String {
        self.append_runtime_policy(self.prompt.clone())
    }

    /// Prompt fragment used when this custom subagent overlays an existing
    /// parent mode. The parent mode remains responsible for user context,
    /// model selection, tools, and execution policy.
    pub fn runtime_prompt_overlay(&self) -> String {
        self.prompt_with_runtime_policy()
    }

    /// Check if tools match default values
    fn is_default_tools(tools: &[String]) -> bool {
        if tools.len() != Self::DEFAULT_TOOLS.len() {
            return false;
        }
        tools
            .iter()
            .zip(Self::DEFAULT_TOOLS.iter())
            .all(|(a, b)| a == *b)
    }

    /// Save current subagent as markdown file with YAML front matter
    ///
    /// # Parameters
    /// - `model`: Override model value, None uses self.model
    ///
    /// Fields equal to default values are not saved
    pub fn save_to_file(&self, model: Option<&str>) -> VoidResult<()> {
        let model = model.unwrap_or(&self.model);

        let mut metadata = serde_yaml::Mapping::new();
        metadata.insert(
            Value::String("name".into()),
            Value::String(self.name.clone()),
        );
        metadata.insert(
            Value::String("description".into()),
            Value::String(self.description.clone()),
        );
        if let Some(display_name) = Self::normalize_display_name(self.display_name.clone()) {
            metadata.insert(
                Value::String("displayName".into()),
                Value::String(display_name),
            );
        }
        let allowed_parent_agent_ids =
            Self::normalize_parent_agent_ids(self.allowed_parent_agent_ids.clone());
        if !allowed_parent_agent_ids.is_empty() {
            metadata.insert(
                Value::String("allowedParentAgentIds".into()),
                Value::Sequence(
                    allowed_parent_agent_ids
                        .into_iter()
                        .map(Value::String)
                        .collect(),
                ),
            );
        }
        if !Self::is_default_tools(&self.tools) {
            metadata.insert(
                Value::String("tools".into()),
                Value::String(self.tools.join(", ")),
            );
        }
        if self.readonly != Self::DEFAULT_READONLY {
            metadata.insert(Value::String("readonly".into()), Value::Bool(self.readonly));
        }
        if self.review != Self::DEFAULT_REVIEW {
            metadata.insert(Value::String("review".into()), Value::Bool(self.review));
        }
        if model != Self::DEFAULT_MODEL {
            metadata.insert(
                Value::String("model".into()),
                Value::String(model.to_string()),
            );
        }
        let metadata = Value::Mapping(metadata);
        FrontMatterMarkdown::save(&self.path, &metadata, &self.prompt).map_err(VoidError::Agent)
    }
}

const SHORT_DRAMA_CUSTOM_SUBAGENT_POLICY: &str = r#"# AI short drama runtime tool policy

When working with an AI short drama project, use the ShortDramaProject tool as the controlled runtime surface for `.void/short-drama` state. Do not directly read or write `.void/short-drama` files as a substitute for the tool when the goal is to inspect, update, or coordinate short drama artifacts.

Check every ShortDramaProject response for `status/source/error`. Use awareness, search, read, focus, context package, integrity, revision/attempt, and ChangeRequest actions instead of assuming empty arrays or missing fields mean success.

If `get_awareness` returns `status: "no_project"` or an empty project state, treat the right-side short drama page as a persistent empty workspace. ScriptAI may call `initialize_from_script` after it has complete script content to save as `scriptContent`. MainAI may also initialize. AssetAI, SplitAI, VideoAI, and EditorAI must not initialize projects; they should request MainAI or ScriptAI to create the script project first.

Never silently overwrite an existing short drama project. If `manifest.json` or `script.md` exists, do not call `initialize_from_script` to replace it. First inspect the current project and current script scope with `get_awareness`, `get_context_package`, `read_script`, or `read_script_segment` as your role allows.

If you are ScriptAI and the user asks to expand, rewrite, polish, continue, or modify the current script, you are a project script specialist rather than a generic copywriting chat assistant. Read the current script first with `read_script` for full-script work, or `read_script_segment` for scoped episode/scene work. If `read_script` returns `status: "ready"` and `content`, that content is the current workspace script; do not say you cannot see it. Until a dedicated script update/revision tool is available, do not claim that the right-side script page or `.void/short-drama/script.md` has changed. Return a clearly labeled proposed replacement, patch, or revision plan and state that applying it requires a script update tool or explicit replacement workflow.

Keep your stage write scope narrow. Read upstream dependencies through the context package, but rely on ShortDramaProject runtime policy to enforce permissions. Cross-stage problems must become a ChangeRequest rather than direct edits to another stage.

Media execution tools:
- If the user asks you to actually generate, inspect, upload, transcribe, voice, render, or poll media, use the explicit media tool when it is available. Do not simulate provider calls in prose, and do not claim a result exists until a tool or runtime action returns it.
- AssetAI must read the current script, asset requirements, StoryboardReferencePlan entries, and existing asset anchors before asset generation. If `read_script` returns `status: "ready"` and `content`, that `content` is the current script even when the rendered tool card is visually collapsed or truncated; extract characters, locations, props, costumes, and reusable visual anchors from it instead of asking the user to paste the script again. For character, location, and prop images, first create or update the asset anchor with `ShortDramaProject` action `upsert_asset_artifact`, prepare a stable prompt, and call `GenerateImage` when that tool is available. Generate one media job per short drama asset artifact unless the tool explicitly supports per-output `short_drama` coordinates; do not batch different characters, locations, and props into one media job because the right-side assets page needs one artifact coordinate per generated output. When calling `GenerateImage` for a short drama asset, include `short_drama` metadata with `projectId`, `stage: "assets"`, `artifactId`, `artifactHandle`, and `outputMediaLabel` so the media completion can attach the generated image to the right-side assets page automatically. If a generated image result is already available in the tool response, call `upsert_asset_artifact` again with `patch.mediaReference` such as `{ "mediaItemId": "...", "kind": "image", "previewUrl": "...", "thumbnailUrl": "...", "label": "..." }` for that asset; do not leave successful asset images only inside the chat transcript. Use `UploadMediaImage` only when a provider/model needs a public reference URL or the user explicitly asks to publish/upload a reference image.
- SplitAI must read the focused script segment, StoryboardReferencePlan, and referenced character/location/prop assets before storyboard or keyframe generation. For storyboard images and keyframes, call `GenerateImage` when that tool is available and include `short_drama` metadata with `projectId`, `stage: "storyboards"`, `artifactId` or `artifactHandle`, and `outputMediaLabel`. Generate one media job per storyboard artifact unless the tool explicitly supports per-output `short_drama` coordinates. If required assets or script beats are missing, create a ChangeRequest for AssetAI or ScriptAI instead of inventing references.
- VideoAI must read the focused script segment, storyboard artifact/image, referenced assets, and motion intent before video generation. For shot videos, transitions, and motion consistency tests, call `GenerateVideo` when that tool is available and include `short_drama` metadata with `projectId`, `stage: "video"`, `artifactId` or `artifactHandle`, and `outputMediaLabel`. Generate one media job per video artifact unless the tool explicitly supports per-output `short_drama` coordinates. Poll asynchronous jobs with `GetMediaTaskStatus` until the task reaches completed, failed, or cancelled. Do not say a video is ready while the task is queued or running.
- EditorAI must read video and post-production context before subtitle, sound, or final-structure work. Use `TranscribeAudio` only for audio transcription or SRT/VTT text generation, and use `GenerateSpeech` only for voice audio generation when those tools are available. These tools do not burn subtitles into video, mix audio, cut clips, or render final episodes. If no dedicated editing/rendering tool is available, return an edit decision list, subtitle text/plan, sound plan, or ChangeRequest; do not claim a final cut/render has been produced.
- If a required media tool is not available in your current session, state the missing tool name and provide the smallest executable prompt, artifact update, or ChangeRequest for MainAI to run. Lack of a tool is not permission to fabricate provider job IDs, media URLs, file paths, or completion states.

Stage guidance:
- ScriptAI owns script structure, episode/scene/shot breakdown, dialogue, motivation, and StoryboardReferencePlan drafts. In a no_project or empty workspace, ScriptAI may write the first complete script and call `initialize_from_script` with that scriptContent. In an existing project, ScriptAI must base script revisions on the current `script.md` content and must not pretend chat-only prose has been saved. It may request downstream review but should not directly edit assets, storyboards, video, or post artifacts.
- AssetAI owns character, location, and prop assets. It should read script segments and StoryboardReferencePlan requirements, create/update anchors through `upsert_asset_artifact`, bind placeholders to asset anchors, attach generated image `mediaReference` metadata to the asset artifact, and request script clarification through ChangeRequest when needed.
- SplitAI owns storyboard prompts, keyframes, and storyboard images. Before generation, it should read the current script segment, StoryboardReferencePlan, and referenced assets. It should request AssetAI or ScriptAI changes instead of editing their stages directly.
- VideoAI owns shot videos, transitions, and motion consistency. It should trace videos back to script segments, storyboard artifacts, and referenced character/location/prop assets. Storyboard or asset problems become ChangeRequest items.
- EditorAI owns editing, subtitles, sound, and final episode structure. It should read video and post-production context and request upstream fixes instead of directly rewriting script, assets, storyboards, or video artifacts.
"#;

const SHORT_DRAMA_ASSET_AI_POLICY: &str = r#"# AssetAI fixed production workflow

Your first responsibility is to read the current script and extract production assets before generating images: 角色、场景、道具、服装, reusable visual anchors, and episode-specific states such as hairstyle, makeup, costume, injury, age, and emotion. Keep different episode or story states as separate asset artifacts. Do not invent missing identity details; request clarification from ScriptAI or MainAI through ChangeRequest.

For every character identity board, invoke both `short-drama-character-board` and `cinematic-style-repair` before `GenerateImage`. The character-board skill controls the 16:9 identity-study layout and strict identity consistency; the cinematic skill controls credible light, skin, materials, and imaging style without breaking the board layout.

For scene images, character-shot images, prop images, and all other asset images, invoke `cinematic-style-repair` before `GenerateImage`. Do not invoke unrelated skills.

Create or update one asset anchor per output before generation. Preserve the existing short-drama coordinates in the media request, and attach every successful result to its asset with `upsert_asset_artifact` and `patch.mediaReference`; do not leave completed images only in the conversation.
"#;

const SHORT_DRAMA_SPLIT_AI_POLICY: &str = r#"# SplitAI fixed storyboard image workflow

Keep the existing storyboard breakdown, shot design, keyframe planning, referenced asset checks, short-drama coordinates, and ChangeRequest behavior unchanged.

Before every storyboard image or keyframe `GenerateImage` call, invoke `cinematic-style-repair` and apply its cinematic lighting, material, skin, lens, and imaging guidance to the current storyboard prompt. Do not invoke unrelated skills. Preserve the existing `projectId`, `stage: "storyboards"`, `artifactId` or `artifactHandle`, and `outputMediaLabel` metadata so each generated image remains attached to its original storyboard artifact.
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    struct TestTempDir {
        path: PathBuf,
    }

    impl TestTempDir {
        fn new(prefix: &str) -> Self {
            let path = std::env::temp_dir().join(format!("{prefix}-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).expect("temp dir should be created");
            Self { path }
        }

        fn join(&self, name: &str) -> String {
            self.path.join(name).to_string_lossy().to_string()
        }
    }

    impl Drop for TestTempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn review_metadata_round_trips_through_front_matter() {
        let dir = TestTempDir::new("void-subagent-test");
        let path = dir.join("review-agent.md");
        let mut subagent = CustomSubagent::new(
            "ReviewExtra".to_string(),
            "Additional code reviewer".to_string(),
            vec!["Read".to_string(), "Grep".to_string()],
            "Review the selected files.".to_string(),
            true,
            path.clone(),
            CustomSubagentKind::User,
        );
        subagent.review = true;

        subagent
            .save_to_file(None)
            .expect("review subagent should save");

        let saved = fs::read_to_string(&path).expect("saved subagent should be readable");
        assert!(saved.contains("review: true"));

        let loaded = CustomSubagent::from_file(&path, CustomSubagentKind::User)
            .expect("review subagent should load");
        assert!(loaded.review);
        assert!(loaded.readonly);
    }

    #[test]
    fn localized_identity_and_scenario_visibility_round_trip_without_changing_runtime_identity() {
        let dir = TestTempDir::new("void-subagent-localized-identity-test");
        let path = dir.join("generated-agent.md");
        let subagent = CustomSubagent::new(
            "custom-0123456789abcdef".to_string(),
            "分析产品资料并给出结论".to_string(),
            vec!["Read".to_string()],
            "你是一名产品分析智能体。".to_string(),
            true,
            path.clone(),
            CustomSubagentKind::User,
        )
        .with_display_name(Some("  产品分析师  ".to_string()))
        .with_allowed_parent_agent_ids([
            "Media".to_string(),
            "agentic".to_string(),
            "agentic".to_string(),
            " ".to_string(),
        ]);

        subagent
            .save_to_file(None)
            .expect("localized subagent should save");

        let saved = fs::read_to_string(&path).expect("saved subagent should be readable");
        assert!(saved.contains("name: custom-0123456789abcdef"));
        assert!(saved.contains("displayName: 产品分析师"));
        let agentic_index = saved
            .find("- agentic")
            .expect("agentic visibility should be saved");
        let media_index = saved
            .find("- Media")
            .expect("media visibility should be saved");
        assert!(media_index < agentic_index);

        let loaded = CustomSubagent::from_file(&path, CustomSubagentKind::User)
            .expect("localized subagent should load");
        assert_eq!(loaded.name, "custom-0123456789abcdef");
        assert_eq!(loaded.presentation_name(), "产品分析师");
        assert_eq!(
            loaded.allowed_parent_agent_ids,
            vec!["Media".to_string(), "agentic".to_string()]
        );
        assert_eq!(
            loaded
                .visibility_policy()
                .summary()
                .allowed_parent_agent_ids,
            vec!["Media".to_string(), "agentic".to_string()]
        );
    }

    #[test]
    fn display_name_is_presentation_only_and_does_not_change_prompt_cache_identity() {
        let dir = TestTempDir::new("void-subagent-cache-identity-test");
        let build = |display_name: &str| {
            CustomSubagent::new(
                "custom-stable-runtime-id".to_string(),
                "Stable description".to_string(),
                vec!["Read".to_string()],
                "Stable prompt".to_string(),
                true,
                dir.join(display_name),
                CustomSubagentKind::User,
            )
            .with_display_name(Some(display_name.to_string()))
        };

        let first = build("中文展示名");
        let second = build("另一个展示名");

        assert_eq!(
            first.system_prompt_cache_identity(None).scope_key,
            second.system_prompt_cache_identity(None).scope_key
        );
    }

    #[tokio::test]
    async fn short_drama_tool_policy_is_appended_for_custom_subagents_with_tool_access() {
        let dir = TestTempDir::new("void-subagent-short-drama-policy-test");
        let subagent = CustomSubagent::new(
            "SplitAI".to_string(),
            "Storyboard specialist".to_string(),
            vec!["ShortDramaProject".to_string()],
            "You are SplitAI.".to_string(),
            true,
            dir.join("split-ai.md"),
            CustomSubagentKind::User,
        );
        let context = PromptBuilderContext::new("", None, None);

        let prompt = subagent
            .build_prompt(&context)
            .await
            .expect("custom subagent prompt should build");

        assert!(prompt.contains("ShortDramaProject"));
        assert!(prompt.contains(".void/short-drama"));
        assert!(prompt.contains("ChangeRequest"));
        assert!(prompt.contains("status/source/error"));
        assert!(prompt.contains("initialize_from_script"));
        assert!(prompt.contains("no_project"));
        assert!(prompt.contains("read_script"));
        assert!(prompt.contains("do not claim that the right-side script page"));
        assert!(prompt.contains("ScriptAI"));
        assert!(prompt.contains("AssetAI"));
        assert!(prompt.contains("SplitAI"));
        assert!(prompt.contains("VideoAI"));
        assert!(prompt.contains("EditorAI"));
        assert!(prompt.contains("GenerateImage"));
        assert!(prompt.contains("GenerateVideo"));
        assert!(prompt.contains("GetMediaTaskStatus"));
        assert!(prompt.contains("UploadMediaImage"));
        assert!(prompt.contains("TranscribeAudio"));
        assert!(prompt.contains("GenerateSpeech"));
        assert!(prompt.contains("missing tool name"));
        assert!(prompt.contains("Do not say a video is ready"));
        assert!(prompt.contains("read_script` returns `status: \"ready\"` and `content`"));
        assert!(prompt.contains("instead of asking the user to paste the script again"));
        assert!(prompt.contains("upsert_asset_artifact"));
        assert!(
            prompt.contains("do not leave successful asset images only inside the chat transcript")
        );
        assert!(prompt.contains("These tools do not burn subtitles into video"));
    }

    #[tokio::test]
    async fn asset_ai_prompt_requires_fixed_asset_workflow() {
        let dir = TestTempDir::new("void-subagent-asset-ai-policy-test");
        let subagent = CustomSubagent::new(
            "AssetAI".to_string(),
            "Asset specialist".to_string(),
            vec!["ShortDramaProject".to_string()],
            "You are AssetAI.".to_string(),
            true,
            dir.join("asset-ai.md"),
            CustomSubagentKind::User,
        );
        let context = PromptBuilderContext::new("", None, None);

        let prompt = subagent
            .build_prompt(&context)
            .await
            .expect("AssetAI prompt should build");

        assert!(prompt.contains("short-drama-character-board"));
        assert!(prompt.contains("cinematic-style-repair"));
        assert!(prompt.contains("角色、场景、道具、服装"));
        assert!(prompt.contains("episode-specific"));
        assert!(prompt.contains("GenerateImage"));
        assert!(prompt.contains("patch.mediaReference"));
    }

    #[tokio::test]
    async fn split_ai_prompt_requires_cinematic_skill_without_replacing_storyboard_workflow() {
        let dir = TestTempDir::new("void-subagent-split-ai-policy-test");
        let subagent = CustomSubagent::new(
            "SplitAI".to_string(),
            "Storyboard specialist".to_string(),
            vec!["ShortDramaProject".to_string()],
            "You are SplitAI. Break the script into storyboard shots.".to_string(),
            true,
            dir.join("split-ai.md"),
            CustomSubagentKind::User,
        );
        let context = PromptBuilderContext::new("", None, None);

        let prompt = subagent
            .build_prompt(&context)
            .await
            .expect("SplitAI prompt should build");

        assert!(prompt.contains("Break the script into storyboard shots"));
        assert!(prompt.contains("cinematic-style-repair"));
        assert!(prompt.contains("Before every storyboard image or keyframe"));
        assert!(prompt.contains("GenerateImage"));
        assert!(prompt.contains("stage: \"storyboards\""));
        assert!(prompt.contains("ChangeRequest behavior unchanged"));
    }

    #[test]
    fn short_drama_stage_agents_receive_stage_scoped_media_runtime_tools() {
        let dir = TestTempDir::new("void-subagent-short-drama-tools-test");
        let asset_agent = CustomSubagent::new(
            "AssetAI".to_string(),
            "Asset specialist".to_string(),
            vec!["ShortDramaProject".to_string()],
            "You are AssetAI.".to_string(),
            true,
            dir.join("asset-ai.md"),
            CustomSubagentKind::User,
        );
        let split_agent = CustomSubagent::new(
            "SplitAI".to_string(),
            "Storyboard specialist".to_string(),
            vec!["ShortDramaProject".to_string()],
            "You are SplitAI.".to_string(),
            true,
            dir.join("split-ai.md"),
            CustomSubagentKind::User,
        );
        let video_agent = CustomSubagent::new(
            "VideoAI".to_string(),
            "Video specialist".to_string(),
            vec!["ShortDramaProject".to_string(), "Skill".to_string()],
            "You are VideoAI.".to_string(),
            true,
            dir.join("video-ai.md"),
            CustomSubagentKind::User,
        );
        let editor_agent = CustomSubagent::new(
            "EditorAI".to_string(),
            "Post specialist".to_string(),
            vec!["ShortDramaProject".to_string(), "Skill".to_string()],
            "You are EditorAI.".to_string(),
            true,
            dir.join("editor-ai.md"),
            CustomSubagentKind::User,
        );
        let script_agent = CustomSubagent::new(
            "ScriptAI".to_string(),
            "Script specialist".to_string(),
            vec!["ShortDramaProject".to_string(), "Skill".to_string()],
            "You are ScriptAI.".to_string(),
            true,
            dir.join("script-ai.md"),
            CustomSubagentKind::User,
        );

        let asset_tools = asset_agent.default_tools();
        let split_tools = split_agent.default_tools();
        let video_tools = video_agent.default_tools();
        let editor_tools = editor_agent.default_tools();
        let script_tools = script_agent.default_tools();

        assert!(asset_tools.contains(&"ShortDramaProject".to_string()));
        assert!(asset_tools.contains(&"Skill".to_string()));
        assert!(asset_tools.contains(&"GenerateImage".to_string()));
        assert!(asset_tools.contains(&"UploadMediaImage".to_string()));
        assert!(asset_tools.contains(&"GetMediaTaskStatus".to_string()));
        assert!(!asset_tools.contains(&"GenerateVideo".to_string()));
        assert!(!asset_tools.contains(&"GenerateSpeech".to_string()));

        assert!(split_tools.contains(&"GenerateImage".to_string()));
        assert!(split_tools.contains(&"Skill".to_string()));
        assert!(!split_tools.contains(&"GenerateVideo".to_string()));

        assert!(video_tools.contains(&"GenerateVideo".to_string()));
        assert!(!video_tools.contains(&"Skill".to_string()));
        assert!(video_tools.contains(&"GetMediaTaskStatus".to_string()));
        assert!(!video_tools.contains(&"GenerateImage".to_string()));
        assert!(!video_tools.contains(&"TranscribeAudio".to_string()));

        assert!(editor_tools.contains(&"GenerateSpeech".to_string()));
        assert!(!editor_tools.contains(&"Skill".to_string()));
        assert!(editor_tools.contains(&"TranscribeAudio".to_string()));
        assert!(editor_tools.contains(&"GetMediaTaskStatus".to_string()));
        assert!(!editor_tools.contains(&"GenerateImage".to_string()));
        assert!(!editor_tools.contains(&"GenerateVideo".to_string()));

        assert!(script_tools.contains(&"ShortDramaProject".to_string()));
        assert!(!script_tools.contains(&"Skill".to_string()));
    }

    #[test]
    fn regular_custom_subagents_do_not_receive_short_drama_media_runtime_tools() {
        let dir = TestTempDir::new("void-subagent-regular-tools-test");
        let subagent = CustomSubagent::new(
            "ResearchAI".to_string(),
            "Research specialist".to_string(),
            vec!["ShortDramaProject".to_string()],
            "You are ResearchAI.".to_string(),
            true,
            dir.join("research-ai.md"),
            CustomSubagentKind::User,
        );

        let tools = subagent.default_tools();

        assert_eq!(tools, vec!["ShortDramaProject".to_string()]);
        assert!(!tools.contains(&"GenerateImage".to_string()));
    }
}
