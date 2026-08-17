use super::{apply_goal_token_usage_event, goal_mode_from_custom_metadata, goal_mode_patch};
use crate::agentic::events::{AgenticEvent, EventSubscriber};
use crate::agentic::session::SessionManager;
use crate::util::errors::VoidResult;
use log::warn;
use std::path::Path;
use std::sync::Arc;

pub struct GoalTokenUsageSubscriber {
    session_manager: Arc<SessionManager>,
}

impl GoalTokenUsageSubscriber {
    pub fn new(session_manager: Arc<SessionManager>) -> Self {
        Self { session_manager }
    }
}

#[async_trait::async_trait]
impl EventSubscriber for GoalTokenUsageSubscriber {
    async fn on_event(&self, event: &AgenticEvent) -> VoidResult<()> {
        let AgenticEvent::TokenUsageUpdated { session_id, .. } = event else {
            return Ok(());
        };

        let Some(session) = self.session_manager.get_session(session_id) else {
            return Ok(());
        };
        let Some(workspace_path) = session.config.workspace_path.as_deref() else {
            warn!(
                "Skipping goal token accounting for session without workspace path: session_id={}",
                session_id
            );
            return Ok(());
        };

        let metadata = self
            .session_manager
            .load_session_metadata(Path::new(workspace_path), session_id)
            .await?;
        let existing = goal_mode_from_custom_metadata(
            metadata
                .as_ref()
                .and_then(|value| value.custom_metadata.as_ref()),
        );
        let updated = apply_goal_token_usage_event(existing.clone(), event)?;

        if updated != existing {
            if let Some(state) = updated.as_ref() {
                self.session_manager
                    .merge_session_custom_metadata(session_id, goal_mode_patch(state))
                    .await?;
            }
        }

        Ok(())
    }
}
