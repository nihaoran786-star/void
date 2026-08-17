//! Persistence layer
//!
//! Responsible for persistent storage and loading of data

mod agent_memory_transcript;
pub mod agent_revision_catalog;
pub mod manager;
pub mod session_branch;
pub mod team_runtime;

pub use agent_memory_transcript::PersistentAgentMemoryTranscriptAdapter;
pub use agent_revision_catalog::FileAgentRevisionCatalogStore;
pub use manager::{PersistenceManager, SessionMetadataPage};
pub use session_branch::{SessionBranchRequest, SessionBranchResult};
pub use team_runtime::FileTeamRuntimeStore;
