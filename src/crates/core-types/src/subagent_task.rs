use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;

pub const SUBAGENT_TASK_SCHEMA_VERSION: u32 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SubagentTaskExecutionMode {
    Synchronous,
    #[default]
    Background,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SubagentTaskContextMode {
    #[default]
    Fresh,
    Fork,
}

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
            (
                Created,
                Running | Blocked | Failed | Cancelled | Interrupted
            ) | (
                Running,
                Blocked | Completed | Failed | Cancelled | Interrupted
            ) | (
                Blocked,
                Running | Completed | Failed | Cancelled | Interrupted
            ) | (Interrupted, Running | Failed | Cancelled)
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubagentTaskDeliveryState {
    NotRequired,
    Pending,
    Delivering,
    Delivered,
    Failed,
    Blocked,
}

impl SubagentTaskDeliveryState {
    pub fn can_transition_to(self, next: Self) -> bool {
        matches!(
            (self, next),
            (Self::Pending, Self::Delivering)
                | (Self::Failed, Self::Delivering)
                | (Self::Delivering, Self::Delivered)
                | (Self::Delivering, Self::Failed)
                | (Self::Delivering, Self::Blocked)
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SubagentTaskReplaySafety {
    #[default]
    Idempotent,
    UnsafeExternalSideEffect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SubagentTaskRecoveryState {
    #[default]
    None,
    Queued,
    Blocked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubagentTaskRecoveryBlockCode {
    MissingCheckpoint,
    InvalidCheckpoint,
    MissingLaunchSpec,
    InvalidLaunchSpec,
    MissingChildSession,
    UnsafeDeliveryReplay,
    ResumeFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubagentTaskRecoveryBlock {
    pub code: SubagentTaskRecoveryBlockCode,
    pub detail: String,
}

/// Durable inputs required to resume an interrupted background subagent in its
/// existing child session. Session configuration and transcript remain owned by
/// session persistence; this record only keeps launch facts that cannot be
/// reconstructed from the child session itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubagentTaskLaunchSpec {
    pub agent_type: String,
    pub parent_dialog_turn_id: String,
    pub parent_tool_call_id: String,
    #[serde(default)]
    pub context: BTreeMap<String, String>,
    pub allow_subagent_spawn: bool,
    pub nesting_depth: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u64>,
}

impl SubagentTaskLaunchSpec {
    pub fn validate(&self) -> Result<(), SubagentTaskTransitionError> {
        if self.agent_type.trim().is_empty()
            || self.parent_dialog_turn_id.trim().is_empty()
            || self.parent_tool_call_id.trim().is_empty()
        {
            return Err(SubagentTaskTransitionError::new(
                "subagent launch spec is missing agent or parent turn identity",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubagentTaskDeliveryLease {
    pub lease_id: String,
    pub owner: String,
    pub acquired_at: u64,
    pub expires_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubagentTaskDeliveryReceipt {
    pub idempotency_key: String,
    pub lease_id: String,
    pub external_receipt: String,
    pub delivered_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubagentTaskCheckpointRef {
    pub checkpoint_id: String,
    pub session_id: String,
    pub checkpoint_version: u32,
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
    #[serde(default)]
    pub execution_mode: SubagentTaskExecutionMode,
    #[serde(default)]
    pub context_mode: SubagentTaskContextMode,
    pub status: SubagentTaskStatus,
    pub owner: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure: Option<String>,
    pub delivery_state: SubagentTaskDeliveryState,
    #[serde(default)]
    pub delivery_replay_safety: SubagentTaskReplaySafety,
    #[serde(default)]
    pub delivery_idempotency_key: String,
    #[serde(default)]
    pub delivery_attempts: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivery_lease: Option<SubagentTaskDeliveryLease>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivery_receipt: Option<SubagentTaskDeliveryReceipt>,
    #[serde(default)]
    pub recovery_state: SubagentTaskRecoveryState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recovery_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub durable_checkpoint: Option<SubagentTaskCheckpointRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch_spec: Option<SubagentTaskLaunchSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recovery_block: Option<SubagentTaskRecoveryBlock>,
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
        Self::new_typed(
            task_id,
            parent_session_id,
            objective,
            owner,
            SubagentTaskExecutionMode::Background,
            SubagentTaskContextMode::Fresh,
            SubagentTaskReplaySafety::Idempotent,
            created_at,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn new_typed(
        task_id: String,
        parent_session_id: String,
        objective: String,
        owner: String,
        execution_mode: SubagentTaskExecutionMode,
        context_mode: SubagentTaskContextMode,
        delivery_replay_safety: SubagentTaskReplaySafety,
        created_at: u64,
    ) -> Self {
        let delivery_idempotency_key = format!("subagent-delivery:{parent_session_id}:{task_id}");
        let delivery_state = match execution_mode {
            SubagentTaskExecutionMode::Synchronous => SubagentTaskDeliveryState::NotRequired,
            SubagentTaskExecutionMode::Background => SubagentTaskDeliveryState::Pending,
        };
        Self {
            schema_version: SUBAGENT_TASK_SCHEMA_VERSION,
            task_id,
            parent_session_id,
            child_session_id: None,
            objective,
            execution_mode,
            context_mode,
            status: SubagentTaskStatus::Created,
            owner,
            progress: None,
            result: None,
            failure: None,
            delivery_state,
            delivery_replay_safety,
            delivery_idempotency_key,
            delivery_attempts: 0,
            delivery_lease: None,
            delivery_receipt: None,
            recovery_state: SubagentTaskRecoveryState::None,
            recovery_reason: None,
            durable_checkpoint: None,
            launch_spec: None,
            recovery_block: None,
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
        if self.status == SubagentTaskStatus::Interrupted
            && next == SubagentTaskStatus::Running
            && self.durable_checkpoint.is_none()
        {
            return Err(SubagentTaskTransitionError::new(
                "interrupted subagent task cannot resume without a durable checkpoint",
            ));
        }
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
                self.recovery_state = SubagentTaskRecoveryState::None;
                self.recovery_reason = None;
                self.recovery_block = None;
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

    pub fn upgrade_legacy_fields(&mut self) {
        if self.delivery_idempotency_key.is_empty() {
            self.delivery_idempotency_key = format!(
                "subagent-delivery:{}:{}",
                self.parent_session_id, self.task_id
            );
        }
        self.schema_version = SUBAGENT_TASK_SCHEMA_VERSION;
    }

    pub fn block_recovery(
        &mut self,
        code: SubagentTaskRecoveryBlockCode,
        detail: impl Into<String>,
        now: u64,
    ) {
        let detail = detail.into();
        self.status = SubagentTaskStatus::Blocked;
        self.recovery_state = SubagentTaskRecoveryState::Blocked;
        self.recovery_reason = Some(detail.clone());
        self.recovery_block = Some(SubagentTaskRecoveryBlock { code, detail });
        self.updated_at = now;
    }

    pub fn claim_delivery(
        &mut self,
        lease_id: String,
        lease_owner: String,
        now: u64,
        lease_duration_ms: u64,
    ) -> Result<bool, SubagentTaskTransitionError> {
        if self.delivery_receipt.is_some()
            || self.delivery_state == SubagentTaskDeliveryState::Delivered
        {
            return Ok(false);
        }
        if !self.status.is_terminal() {
            return Ok(false);
        }

        match self.delivery_state {
            SubagentTaskDeliveryState::Pending | SubagentTaskDeliveryState::Failed => {
                if self.delivery_state == SubagentTaskDeliveryState::Failed
                    && self.delivery_replay_safety
                        == SubagentTaskReplaySafety::UnsafeExternalSideEffect
                {
                    self.delivery_state = SubagentTaskDeliveryState::Blocked;
                    self.delivery_lease = None;
                    self.recovery_state = SubagentTaskRecoveryState::Blocked;
                    self.recovery_reason = Some(
                        "failed delivery cannot be replayed without idempotency guarantees"
                            .to_string(),
                    );
                    self.recovery_block = Some(SubagentTaskRecoveryBlock {
                        code: SubagentTaskRecoveryBlockCode::UnsafeDeliveryReplay,
                        detail:
                            "failed delivery cannot be replayed without idempotency guarantees"
                                .to_string(),
                    });
                    self.updated_at = now;
                    return Ok(false);
                }
            }
            SubagentTaskDeliveryState::Delivering => {
                let expired = self
                    .delivery_lease
                    .as_ref()
                    .is_none_or(|lease| lease.expires_at <= now);
                if !expired {
                    return Ok(false);
                }
                if self.delivery_replay_safety == SubagentTaskReplaySafety::UnsafeExternalSideEffect
                {
                    self.delivery_state = SubagentTaskDeliveryState::Blocked;
                    self.delivery_lease = None;
                    self.recovery_state = SubagentTaskRecoveryState::Blocked;
                    self.recovery_reason = Some(
                        "delivery lease expired after an unsafe external side effect; blind replay is prohibited"
                            .to_string(),
                    );
                    self.updated_at = now;
                    return Ok(false);
                }
            }
            SubagentTaskDeliveryState::NotRequired
            | SubagentTaskDeliveryState::Delivered
            | SubagentTaskDeliveryState::Blocked => return Ok(false),
        }

        self.delivery_state = SubagentTaskDeliveryState::Delivering;
        self.delivery_attempts = self.delivery_attempts.saturating_add(1);
        self.delivery_lease = Some(SubagentTaskDeliveryLease {
            lease_id,
            owner: lease_owner,
            acquired_at: now,
            expires_at: now.saturating_add(lease_duration_ms.max(1)),
        });
        self.recovery_state = SubagentTaskRecoveryState::None;
        self.recovery_reason = None;
        self.recovery_block = None;
        self.updated_at = now;
        Ok(true)
    }

    pub fn complete_delivery(
        &mut self,
        lease_id: &str,
        external_receipt: String,
        now: u64,
    ) -> Result<(), SubagentTaskTransitionError> {
        if self.delivery_state == SubagentTaskDeliveryState::Delivered {
            return Err(SubagentTaskTransitionError::new(
                "subagent task delivery is already complete",
            ));
        }
        let lease = self.delivery_lease.as_ref().ok_or_else(|| {
            SubagentTaskTransitionError::new("subagent task delivery has no active lease")
        })?;
        if lease.lease_id != lease_id {
            return Err(SubagentTaskTransitionError::new(
                "subagent task delivery lease does not match",
            ));
        }
        self.transition_delivery(SubagentTaskDeliveryState::Delivered, now)?;
        self.delivery_receipt = Some(SubagentTaskDeliveryReceipt {
            idempotency_key: self.delivery_idempotency_key.clone(),
            lease_id: lease_id.to_string(),
            external_receipt,
            delivered_at: now,
        });
        self.delivery_lease = None;
        self.recovery_state = SubagentTaskRecoveryState::None;
        self.recovery_reason = None;
        Ok(())
    }

    pub fn fail_delivery(
        &mut self,
        lease_id: &str,
        reason: String,
        now: u64,
    ) -> Result<(), SubagentTaskTransitionError> {
        let lease = self.delivery_lease.as_ref().ok_or_else(|| {
            SubagentTaskTransitionError::new("subagent task delivery has no active lease")
        })?;
        if lease.lease_id != lease_id {
            return Err(SubagentTaskTransitionError::new(
                "subagent task delivery lease does not match",
            ));
        }
        self.transition_delivery(SubagentTaskDeliveryState::Failed, now)?;
        self.delivery_lease = None;
        if self.delivery_replay_safety == SubagentTaskReplaySafety::Idempotent {
            self.recovery_state = SubagentTaskRecoveryState::Queued;
            self.recovery_reason = Some(reason);
            self.recovery_block = None;
        } else {
            self.recovery_state = SubagentTaskRecoveryState::Blocked;
            self.recovery_reason = Some(reason.clone());
            self.recovery_block = Some(SubagentTaskRecoveryBlock {
                code: SubagentTaskRecoveryBlockCode::UnsafeDeliveryReplay,
                detail: reason,
            });
        }
        Ok(())
    }

    pub fn mark_recovery_after_restart(&mut self, now: u64) -> bool {
        let before = self.clone();
        if matches!(
            self.status,
            SubagentTaskStatus::Created | SubagentTaskStatus::Running
        ) {
            self.status = SubagentTaskStatus::Interrupted;
            self.failure = Some("runtime restarted before task completion".to_string());
        }

        if self.status == SubagentTaskStatus::Interrupted {
            if self.durable_checkpoint.is_some() {
                self.recovery_state = SubagentTaskRecoveryState::Queued;
                self.recovery_reason =
                    Some("interrupted task has a durable checkpoint and may resume".to_string());
                self.recovery_block = None;
            } else {
                self.block_recovery(
                    SubagentTaskRecoveryBlockCode::MissingCheckpoint,
                    "interrupted task has no durable checkpoint and cannot resume",
                    now,
                );
            }
        } else if self.status.is_terminal() {
            match self.delivery_state {
                SubagentTaskDeliveryState::Pending => {
                    self.recovery_state = SubagentTaskRecoveryState::Queued;
                    self.recovery_reason = Some("terminal task has a pending delivery".to_string());
                }
                SubagentTaskDeliveryState::Failed => {
                    if self.delivery_replay_safety == SubagentTaskReplaySafety::Idempotent {
                        self.recovery_state = SubagentTaskRecoveryState::Queued;
                        self.recovery_reason =
                            Some("failed delivery is eligible for idempotent retry".to_string());
                        self.recovery_block = None;
                    } else {
                        self.delivery_state = SubagentTaskDeliveryState::Blocked;
                        self.block_recovery(
                            SubagentTaskRecoveryBlockCode::UnsafeDeliveryReplay,
                            "failed delivery cannot be replayed without idempotency guarantees",
                            now,
                        );
                    }
                }
                SubagentTaskDeliveryState::Delivering
                    if self
                        .delivery_lease
                        .as_ref()
                        .is_none_or(|lease| lease.expires_at <= now) =>
                {
                    if self.delivery_replay_safety
                        == SubagentTaskReplaySafety::UnsafeExternalSideEffect
                    {
                        self.delivery_state = SubagentTaskDeliveryState::Blocked;
                        self.delivery_lease = None;
                        self.recovery_state = SubagentTaskRecoveryState::Blocked;
                        self.recovery_reason = Some(
                            "expired delivery cannot be replayed without idempotency guarantees"
                                .to_string(),
                        );
                        self.recovery_block = Some(SubagentTaskRecoveryBlock {
                            code: SubagentTaskRecoveryBlockCode::UnsafeDeliveryReplay,
                            detail:
                                "expired delivery cannot be replayed without idempotency guarantees"
                                    .to_string(),
                        });
                    } else {
                        self.recovery_state = SubagentTaskRecoveryState::Queued;
                        self.recovery_reason =
                            Some("expired delivery lease is eligible for safe reclaim".to_string());
                        self.recovery_block = None;
                    }
                }
                _ => {}
            }
        }
        let changed = *self != before;
        if changed {
            self.updated_at = now;
        }
        changed
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
        assert!(Failed.can_transition_to(Delivering));
        assert!(!Delivering.can_transition_to(Delivering));
        assert!(!Delivered.can_transition_to(Delivering));
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
        let restored: SubagentTaskRecord = serde_json::from_str(&json).expect("deserialize task");

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
        assert!(task
            .transition_status(SubagentTaskStatus::Running, 13)
            .is_err());
        assert_eq!(task.status, SubagentTaskStatus::Interrupted);
        task.durable_checkpoint = Some(SubagentTaskCheckpointRef {
            checkpoint_id: "checkpoint-1".into(),
            session_id: "child-1".into(),
            checkpoint_version: 1,
        });

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

    #[test]
    fn expired_lease_is_reclaimable_only_for_idempotent_delivery() {
        let mut safe = SubagentTaskRecord::new(
            "safe".into(),
            "parent".into(),
            "deliver".into(),
            "owner".into(),
            1,
        );
        safe.transition_status(SubagentTaskStatus::Running, 2)
            .unwrap();
        safe.transition_status(SubagentTaskStatus::Completed, 3)
            .unwrap();
        assert!(safe
            .claim_delivery("lease-1".into(), "worker-1".into(), 4, 10)
            .unwrap());
        assert!(!safe
            .claim_delivery("lease-2".into(), "worker-2".into(), 5, 10)
            .unwrap());
        assert!(safe
            .claim_delivery("lease-2".into(), "worker-2".into(), 14, 10)
            .unwrap());
        assert_eq!(safe.delivery_attempts, 2);

        let mut unsafe_task = safe.clone();
        unsafe_task.task_id = "unsafe".into();
        unsafe_task.delivery_replay_safety = SubagentTaskReplaySafety::UnsafeExternalSideEffect;
        unsafe_task.delivery_lease.as_mut().unwrap().expires_at = 20;
        assert!(!unsafe_task
            .claim_delivery("lease-3".into(), "worker-3".into(), 20, 10)
            .unwrap());
        assert_eq!(
            unsafe_task.delivery_state,
            SubagentTaskDeliveryState::Blocked
        );
        assert_eq!(
            unsafe_task.recovery_state,
            SubagentTaskRecoveryState::Blocked
        );
    }

    #[test]
    fn persisted_receipt_prevents_duplicate_delivery() {
        let mut task = SubagentTaskRecord::new(
            "safe".into(),
            "parent".into(),
            "deliver".into(),
            "owner".into(),
            1,
        );
        task.transition_status(SubagentTaskStatus::Running, 2)
            .unwrap();
        task.transition_status(SubagentTaskStatus::Completed, 3)
            .unwrap();
        task.claim_delivery("lease-1".into(), "worker-1".into(), 4, 10)
            .unwrap();
        task.complete_delivery("lease-1", "dialog-turn:stable".into(), 5)
            .unwrap();

        assert!(task.delivery_receipt.is_some());
        assert!(!task
            .claim_delivery("lease-2".into(), "worker-2".into(), 20, 10)
            .unwrap());
        assert!(task
            .complete_delivery("lease-1", "duplicate".into(), 21)
            .is_err());
    }

    #[test]
    fn idempotent_failed_delivery_is_queued_and_reclaimable_after_restart() {
        let mut task = SubagentTaskRecord::new(
            "safe".into(),
            "parent".into(),
            "deliver".into(),
            "owner".into(),
            1,
        );
        task.transition_status(SubagentTaskStatus::Running, 2)
            .unwrap();
        task.transition_status(SubagentTaskStatus::Completed, 3)
            .unwrap();
        task.claim_delivery("lease-1".into(), "worker-1".into(), 4, 10)
            .unwrap();
        task.fail_delivery("lease-1", "connection reset".into(), 5)
            .unwrap();

        assert_eq!(task.recovery_state, SubagentTaskRecoveryState::Queued);
        assert!(task.mark_recovery_after_restart(20));
        assert!(task
            .claim_delivery("lease-2".into(), "worker-2".into(), 21, 10)
            .unwrap());
        assert_eq!(task.delivery_attempts, 2);
    }

    #[test]
    fn legacy_v2_record_defaults_new_recovery_fields() {
        let task = SubagentTaskRecord::new(
            "legacy".into(),
            "parent".into(),
            "inspect".into(),
            "owner".into(),
            1,
        );
        let mut value = serde_json::to_value(task).unwrap();
        let object = value.as_object_mut().unwrap();
        object.insert("schema_version".into(), serde_json::json!(2));
        object.remove("launch_spec");
        object.remove("recovery_block");

        let restored: SubagentTaskRecord = serde_json::from_value(value).unwrap();
        assert!(restored.launch_spec.is_none());
        assert!(restored.recovery_block.is_none());
    }

    #[test]
    fn synchronous_fork_uses_same_record_without_delivery() {
        let task = SubagentTaskRecord::new_typed(
            "subagent-sync".into(),
            "parent".into(),
            "inspect inherited context".into(),
            "owner".into(),
            SubagentTaskExecutionMode::Synchronous,
            SubagentTaskContextMode::Fork,
            SubagentTaskReplaySafety::Idempotent,
            1,
        );

        assert_eq!(
            task.execution_mode,
            SubagentTaskExecutionMode::Synchronous
        );
        assert_eq!(task.context_mode, SubagentTaskContextMode::Fork);
        assert_eq!(
            task.delivery_state,
            SubagentTaskDeliveryState::NotRequired
        );
    }
}
