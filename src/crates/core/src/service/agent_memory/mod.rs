mod auto_memory;
pub mod consent;
mod instruction_context;
mod repository;
mod session_source;
mod workflow;

pub(crate) use auto_memory::build_workspace_agent_memory_prompt;
pub(crate) use auto_memory::build_workspace_memory_files_context;
pub(crate) use instruction_context::build_workspace_instruction_files_context;
pub use repository::{
    AgentMemoryRepository, AgentMemoryService, AgentMemorySource, FileAgentMemoryRepository,
    MemoryCandidateBatch, StoredAgentMemory, AGENT_MEMORY_SCHEMA_VERSION,
};
pub use session_source::{
    AgentMemorySessionSourcePort, MemorySessionSourceError, MemorySessionSourceErrorCode,
    PersistentSessionTranscript, PersistentSessionTranscriptPort,
    PersistentSessionTranscriptRequest, PersistentTranscriptMessage,
    SafePersistentSessionSourceAdapter, SafeSessionTranscript, SafeTranscriptMessage,
    UnsupportedPersistentSessionSourceAdapter,
};
pub use workflow::{
    delete_confirmation_token, AgentMemoryExtractorPort, AgentMemoryProposal, AgentMemoryWorkflow,
    DeleteMemoryConfirmation, ExistingMemoryForExtraction, ExtractedMemory, MemoryApprovalOutcome,
    MemoryApprovalStatus, MemoryCompletionOutcome, MemoryCompletionTriggerConfig,
    MemoryExtractionRequest, MemoryWorkflowError, MemoryWorkflowErrorCode,
    SessionCompletionMemoryRequest, UnsupportedAgentMemoryExtractor,
};

#[cfg(test)]
pub(crate) struct AgentMemoryTestDir(std::path::PathBuf);

#[cfg(test)]
impl AgentMemoryTestDir {
    pub(crate) fn new() -> Self {
        let path = std::env::temp_dir().join(format!("void-agent-memory-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&path).expect("create agent memory test directory");
        Self(path)
    }

    pub(crate) fn path(&self) -> &std::path::Path {
        &self.0
    }
}

#[cfg(test)]
impl Drop for AgentMemoryTestDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
