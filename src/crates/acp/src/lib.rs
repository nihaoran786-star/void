//! Void Agent Client Protocol integration.
//!
//! This crate owns the external ACP server surface and maps it onto Void's
//! core agentic runtime. CLI and other hosts should only start this crate.

pub mod client;
mod runtime;
mod server;

pub use agent_client_protocol as protocol;
pub use client::AcpClientService;
pub use runtime::VoidAcpRuntime;
pub use server::AcpServer;
