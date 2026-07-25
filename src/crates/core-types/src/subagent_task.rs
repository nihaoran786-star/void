use serde::{Deserialize, Serialize};
use std::fmt;

pub const SUBAGENT_TASK_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubagentTaskStatus {
    Created,
    Running,
    Blocked,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}

impl SubagentTaskStatus {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }

    pub fn can_transition_to(self, next: Self) -> bool {
        use SubagentTaskStatus::*;

        matches!(
            (self, next),
            (Created, Running | Blocked | Failed | Cancelled | Interrupted)
                | (Running, Blocked | Completed | Failed | Cancelled | Interrupted)
                | (Blocked, Running | Completed | Failed | Cancelled | Interrupted)
                | (Interrupted, Running | Failed | Cancelled)
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubagentTaskDeliveryState {
    Pending,
    Delivering,
    Delivered,
    Failed,
}

impl SubagentTaskDeliveryState {
    pub fn can_transition_to(self, next: Self) -> bool {
        matches!(
            (self, next),
            (Self::Pending, Self::Delivering)
                | (Self::Delivering, Self::Delivered)
                | (Self::Delivering, Self::Failed)
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubagentTaskTransitionError {
    message: String,
}

impl SubagentTaskTransitionError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for SubagentTaskTransitionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for SubagentTaskTransitionError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubagentTaskRecord {
    pub schema_version: u32,
    pub task_id: String,
    pub parent_session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub child_session_id: Option<String>,
    pub objective: String,
    pub status: SubagentTaskStatus,
    pub owner: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure: Option<String>,
    pub delivery_state: SubagentTaskDeliveryState,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivered_at: Option<u64>,
}

impl SubagentTaskRecord {
    pub fn new(
        task_id: String,
        parent_session_id: String,
        objective: String,
        owner: String,
        created_at: u64,
    ) -> Self {
        Self {
            schema_version: SUBAGENT_TASK_SCHEMA_VERSION,
            task_id,
            parent_session_id,
            child_session_id: None,
            objective,
            status: SubagentTaskStatus::Created,
            owner,
            progress: None,
            result: None,
            failure: None,
            delivery_state: SubagentTaskDeliveryState::Pending,
            created_at,
            updated_at: created_at,
            completed_at: None,
            delivered_at: None,
        }
    }

    pub fn transition_status(
        &mut self,
        next: SubagentTaskStatus,
        updated_at: u64,
    ) -> Result<(), SubagentTaskTransitionError> {
        if !self.status.can_transition_to(next) {
            return Err(SubagentTaskTransitionError::new(format!(
                "invalid subagent task status transition: {:?} -> {:?}",
                self.status, next
            )));
        }

        self.status = next;
        self.updated_at = updated_at;
        match next {
            SubagentTaskStatus::Running => {
                self.result = None;
                self.failure = None;
                self.completed_at = None;
            }
            SubagentTaskStatus::Completed => {
                self.failure = None;
                self.completed_at = Some(updated_at);
            }
            SubagentTaskStatus::Failed | SubagentTaskStatus::Cancelled => {
                self.result = None;
                self.completed_at = Some(updated_at);
            }
            SubagentTaskStatus::Created
            | SubagentTaskStatus::Blocked
            | SubagentTaskStatus::Interrupted => {}
        }
        Ok(())
    }

    pub fn transition_delivery(
        &mut self,
        next: SubagentTaskDeliveryState,
        updated_at: u64,
    ) -> Result<(), SubagentTaskTransitionError> {
        if !self.delivery_state.can_transition_to(next) {
            return Err(SubagentTaskTransitionError::new(format!(
                "invalid subagent task delivery transition: {:?} -> {:?}",
                self.delivery_state, next
            )));
        }
        if next == SubagentTaskDeliveryState::Delivering && !self.status.is_terminal() {
            return Err(SubagentTaskTransitionError::new(
                "only terminal subagent tasks can claim delivery",
            ));
        }

        self.delivery_state = next;
        self.updated_at = updated_at;
        if next == SubagentTaskDeliveryState::Delivered {
            self.delivered_at = Some(updated_at);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_transition_matrix_is_explicit() {
        use SubagentTaskStatus::*;

        let statuses = [
            Created,
            Running,
            Blocked,
            Completed,
            Failed,
            Cancelled,
            Interrupted,
        ];
        let allowed = [
            (Created, Running),
            (Created, Blocked),
            (Created, Failed),
            (Created, Cancelled),
            (Created, Interrupted),
            (Running, Blocked),
            (Running, Completed),
            (Running, Failed),
            (Running, Cancelled),
            (Running, Interrupted),
            (Blocked, Running),
            (Blocked, Completed),
            (Blocked, Failed),
            (Blocked, Cancelled),
            (Blocked, Interrupted),
            (Interrupted, Running),
            (Interrupted, Failed),
            (Interrupted, Cancelled),
        ];

        for from in statuses {
            for to in statuses {
                assert_eq!(
                    from.can_transition_to(to),
                    allowed.contains(&(from, to)),
                    "unexpected transition {from:?} -> {to:?}"
                );
            }
        }
    }

    #[test]
    fn delivery_transition_matrix_prevents_duplicate_claims() {
        use SubagentTaskDeliveryState::*;

        assert!(Pending.can_transition_to(Delivering));
        assert!(Delivering.can_transition_to(Delivered));
        assert!(Delivering.can_transition_to(Failed));
        assert!(!Delivering.can_transition_to(Delivering));
        assert!(!Delivered.can_transition_to(Delivering));
        assert!(!Failed.can_transition_to(Delivering));
    }

    #[test]
    fn record_round_trips_as_stable_json() {
        let mut task = SubagentTaskRecord::new(
            "bg-subagent-1".into(),
            "parent-1".into(),
            "inspect runtime".into(),
            "execution-1".into(),
            10,
        );
        task.child_session_id = Some("child-1".into());
        task.transition_status(SubagentTaskStatus::Running, 11)
            .expect("created task should run");
        task.progress = Some("started".into());

        let json = serde_json::to_string(&task).expect("serialize task");
        let restored: SubagentTaskRecord =
            serde_json::from_str(&json).expect("deserialize task");

        assert_eq!(restored, task);
        assert!(json.contains("\"status\":\"running\""));
        assert!(json.contains("\"delivery_state\":\"pending\""));
    }

    #[test]
    fn interrupted_task_can_resume_and_complete_without_stale_failure() {
        let mut task = SubagentTaskRecord::new(
            "bg-subagent-1".into(),
            "parent-1".into(),
            "inspect runtime".into(),
            "execution-1".into(),
            10,
        );
        task.transition_status(SubagentTaskStatus::Running, 11)
            .expect("created task should run");
        task.transition_status(SubagentTaskStatus::Interrupted, 12)
            .expect("running task should be interrupted");
        task.failure = Some("runtime restarted".into());

        task.transition_status(SubagentTaskStatus::Running, 13)
            .expect("interrupted task should resume");
        assert_eq!(task.failure, None);
        assert_eq!(task.result, None);
        assert_eq!(task.completed_at, None);

        task.failure = Some("stale failure".into());
        task.result = Some("done".into());
        task.transition_status(SubagentTaskStatus::Completed, 14)
            .expect("resumed task should complete");
        assert_eq!(task.failure, None);
        assert_eq!(task.result.as_deref(), Some("done"));
        assert_eq!(task.completed_at, Some(14));

        let mut failed = SubagentTaskRecord::new(
            "bg-subagent-2".into(),
            "parent-1".into(),
            "inspect runtime".into(),
            "execution-2".into(),
            20,
        );
        failed
            .transition_status(SubagentTaskStatus::Running, 21)
            .expect("created task should run");
        failed.result = Some("stale result".into());
        failed
            .transition_status(SubagentTaskStatus::Failed, 22)
            .expect("running task should fail");
        assert_eq!(failed.result, None);
    }
}
