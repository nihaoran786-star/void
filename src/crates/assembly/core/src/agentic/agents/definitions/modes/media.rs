//! Media Mode
//!
//! A media creation orchestration mode for image/video planning without provider execution.

use crate::agentic::agents::{Agent, UserContextPolicy};
use async_trait::async_trait;

pub struct MediaMode {
    default_tools: Vec<String>,
}

impl Default for MediaMode {
    fn default() -> Self {
        Self::new()
    }
}

impl MediaMode {
    pub fn new() -> Self {
        Self {
            default_tools: vec![
                "Task".to_string(),
                "Read".to_string(),
                "Grep".to_string(),
                "Glob".to_string(),
                "WebSearch".to_string(),
                "WebFetch".to_string(),
                "TodoWrite".to_string(),
                "Skill".to_string(),
                "AskUserQuestion".to_string(),
                "ControlHub".to_string(),
                "ShortDramaProject".to_string(),
                "GenerateImage".to_string(),
                "GenerateVideo".to_string(),
                "GetMediaTaskStatus".to_string(),
                "UploadMediaImage".to_string(),
                "GenerateSpeech".to_string(),
                "TranscribeAudio".to_string(),
            ],
        }
    }
}

#[async_trait]
impl Agent for MediaMode {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn id(&self) -> &str {
        "Media"
    }

    fn name(&self) -> &str {
        "Media"
    }

    fn description(&self) -> &str {
        "media creation mode for planning images, videos, storyboards, and production workflows"
    }

    fn prompt_template_name(&self, _model_name: Option<&str>) -> &str {
        "media_mode"
    }

    fn default_tools(&self) -> Vec<String> {
        self.default_tools.clone()
    }

    fn user_context_policy(&self) -> UserContextPolicy {
        UserContextPolicy::empty()
            .with_workspace_context()
            .with_workspace_instructions()
            .with_project_layout()
    }

    fn is_readonly(&self) -> bool {
        false
    }
}
