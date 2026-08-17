use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentMemoryState {
    Candidate,
    ConsentPending,
    Committed,
    Deleted,
    Failed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentMemoryConsent {
    NotRequested,
    Pending,
    Granted,
    Denied,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentMemoryCandidate {
    pub id: String,
    pub content: String,
    pub state: AgentMemoryState,
    pub consent: AgentMemoryConsent,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemoryTransitionError {
    EmptyCandidate,
    InvalidTransition {
        from: AgentMemoryState,
        operation: &'static str,
    },
    ConsentRequired,
    PersistenceFailed(String),
}

impl fmt::Display for MemoryTransitionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyCandidate => write!(formatter, "memory candidate content is required"),
            Self::InvalidTransition { from, operation } => {
                write!(formatter, "cannot {operation} memory in state {from:?}")
            }
            Self::ConsentRequired => {
                write!(
                    formatter,
                    "explicit user consent is required before committing memory"
                )
            }
            Self::PersistenceFailed(message) => {
                write!(formatter, "memory persistence failed: {message}")
            }
        }
    }
}

impl std::error::Error for MemoryTransitionError {}

impl AgentMemoryCandidate {
    pub fn new(
        id: impl Into<String>,
        content: impl Into<String>,
    ) -> Result<Self, MemoryTransitionError> {
        let content = content.into().trim().to_string();
        if content.is_empty() {
            return Err(MemoryTransitionError::EmptyCandidate);
        }
        Ok(Self {
            id: id.into(),
            content,
            state: AgentMemoryState::Candidate,
            consent: AgentMemoryConsent::NotRequested,
            failure: None,
        })
    }

    pub fn request_consent(&mut self) -> Result<(), MemoryTransitionError> {
        if self.state != AgentMemoryState::Candidate {
            return Err(MemoryTransitionError::InvalidTransition {
                from: self.state,
                operation: "request consent for",
            });
        }
        self.state = AgentMemoryState::ConsentPending;
        self.consent = AgentMemoryConsent::Pending;
        Ok(())
    }

    pub fn resolve_consent(&mut self, approved: bool) -> Result<(), MemoryTransitionError> {
        if self.state != AgentMemoryState::ConsentPending {
            return Err(MemoryTransitionError::InvalidTransition {
                from: self.state,
                operation: "resolve consent for",
            });
        }
        self.consent = if approved {
            AgentMemoryConsent::Granted
        } else {
            AgentMemoryConsent::Denied
        };
        if !approved {
            self.state = AgentMemoryState::Deleted;
        }
        Ok(())
    }

    /// Calls the persistence boundary only after explicit consent.
    pub fn commit_with(
        &mut self,
        write: impl FnOnce(&str) -> Result<(), String>,
    ) -> Result<(), MemoryTransitionError> {
        if self.state != AgentMemoryState::ConsentPending
            || self.consent != AgentMemoryConsent::Granted
        {
            return Err(MemoryTransitionError::ConsentRequired);
        }
        match write(&self.content) {
            Ok(()) => {
                self.state = AgentMemoryState::Committed;
                self.failure = None;
                Ok(())
            }
            Err(message) => {
                self.state = AgentMemoryState::Failed;
                self.failure = Some(message.clone());
                Err(MemoryTransitionError::PersistenceFailed(message))
            }
        }
    }

    pub fn delete_with(
        &mut self,
        delete: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), MemoryTransitionError> {
        if self.state != AgentMemoryState::Committed {
            return Err(MemoryTransitionError::InvalidTransition {
                from: self.state,
                operation: "delete",
            });
        }
        match delete() {
            Ok(()) => {
                self.state = AgentMemoryState::Deleted;
                Ok(())
            }
            Err(message) => {
                self.state = AgentMemoryState::Failed;
                self.failure = Some(message.clone());
                Err(MemoryTransitionError::PersistenceFailed(message))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AgentMemoryCandidate, AgentMemoryConsent, AgentMemoryState};
    use std::cell::Cell;

    #[test]
    fn persistence_is_not_called_without_explicit_consent() {
        let mut candidate = AgentMemoryCandidate::new("memory-1", "Use focused tests").unwrap();
        let writes = Cell::new(0);

        let error = candidate
            .commit_with(|_| {
                writes.set(writes.get() + 1);
                Ok(())
            })
            .unwrap_err();

        assert_eq!(writes.get(), 0);
        assert_eq!(candidate.state, AgentMemoryState::Candidate);
        assert!(error.to_string().contains("consent"));
    }

    #[test]
    fn candidate_moves_through_consent_to_committed_and_deleted() {
        let mut candidate = AgentMemoryCandidate::new("memory-1", "Use focused tests").unwrap();
        candidate.request_consent().unwrap();
        candidate.resolve_consent(true).unwrap();
        candidate.commit_with(|_| Ok(())).unwrap();
        assert_eq!(candidate.state, AgentMemoryState::Committed);
        assert_eq!(candidate.consent, AgentMemoryConsent::Granted);

        candidate.delete_with(|| Ok(())).unwrap();
        assert_eq!(candidate.state, AgentMemoryState::Deleted);
    }

    #[test]
    fn persistence_failure_is_explicit() {
        let mut candidate = AgentMemoryCandidate::new("memory-1", "Use focused tests").unwrap();
        candidate.request_consent().unwrap();
        candidate.resolve_consent(true).unwrap();

        assert!(candidate
            .commit_with(|_| Err("disk full".to_string()))
            .is_err());
        assert_eq!(candidate.state, AgentMemoryState::Failed);
        assert_eq!(candidate.failure.as_deref(), Some("disk full"));
    }

    #[test]
    fn denied_candidate_never_becomes_committable() {
        let mut candidate = AgentMemoryCandidate::new("memory-1", "Use focused tests").unwrap();
        candidate.request_consent().unwrap();
        candidate.resolve_consent(false).unwrap();

        assert_eq!(candidate.state, AgentMemoryState::Deleted);
        assert!(candidate.commit_with(|_| Ok(())).is_err());
    }
}
