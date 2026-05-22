//! MCP server configuration types.

use crate::util::errors::VoidError;

pub use void_services_integrations::mcp::server::{
    MCPServerConfig, MCPServerConfigValidationError, MCPServerOAuthConfig, MCPServerTransport,
    MCPServerXaaConfig,
};

impl From<MCPServerConfigValidationError> for VoidError {
    fn from(error: MCPServerConfigValidationError) -> Self {
        Self::Configuration(error.to_string())
    }
}
