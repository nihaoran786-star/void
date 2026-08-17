//! MCP configuration orchestration.

use async_trait::async_trait;
use log::{info, warn};
use serde_json::Value;
use std::sync::Arc;

use crate::mcp::server::{MCPServerConfig, MCPServerType};
use crate::mcp::{MCPRuntimeError, MCPRuntimeResult};

use super::{
    config_to_cursor_format, get_mcp_remote_authorization_source,
    get_mcp_remote_authorization_value, has_mcp_remote_authorization, has_mcp_remote_oauth,
    has_mcp_remote_xaa, merge_mcp_server_config_sources, normalize_mcp_authorization_value,
    parse_cursor_format, parse_mcp_config_array, remove_mcp_authorization_keys, ConfigLocation,
};

#[async_trait]
pub trait MCPConfigStore: Send + Sync {
    async fn get_config_value(&self, key: &str) -> MCPRuntimeResult<Option<Value>>;
    async fn set_config_value(&self, key: &str, value: Value) -> MCPRuntimeResult<()>;
}

pub struct MCPConfigService {
    config_store: Arc<dyn MCPConfigStore>,
}

impl MCPConfigService {
    pub fn new(config_store: Arc<dyn MCPConfigStore>) -> Self {
        Self { config_store }
    }

    fn parse_config_array(
        &self,
        servers: &[serde_json::Value],
        location: ConfigLocation,
    ) -> Vec<MCPServerConfig> {
        parse_mcp_config_array(servers, location)
    }

    pub fn get_remote_authorization_value(config: &MCPServerConfig) -> Option<String> {
        get_mcp_remote_authorization_value(config)
    }

    pub fn get_remote_authorization_source(config: &MCPServerConfig) -> Option<&'static str> {
        get_mcp_remote_authorization_source(config)
    }

    pub fn has_remote_authorization(config: &MCPServerConfig) -> bool {
        has_mcp_remote_authorization(config)
    }

    pub fn has_remote_oauth(config: &MCPServerConfig) -> bool {
        has_mcp_remote_oauth(config)
    }

    pub fn has_remote_xaa(config: &MCPServerConfig) -> bool {
        has_mcp_remote_xaa(config)
    }

    pub async fn load_all_configs(&self) -> MCPRuntimeResult<Vec<MCPServerConfig>> {
        let builtin_configs = self.load_builtin_configs().await?;
        let user_configs = match self.load_user_configs().await {
            Ok(user_configs) => user_configs,
            Err(e) => {
                warn!("Failed to load user-level MCP configs: {}", e);
                Vec::new()
            }
        };

        let project_configs = match self.load_project_configs().await {
            Ok(project_configs) => project_configs,
            Err(e) => {
                warn!("Failed to load project-level MCP configs: {}", e);
                Vec::new()
            }
        };

        Ok(merge_mcp_server_config_sources([
            builtin_configs,
            user_configs,
            project_configs,
        ]))
    }

    async fn load_builtin_configs(&self) -> MCPRuntimeResult<Vec<MCPServerConfig>> {
        Ok(Vec::new())
    }

    async fn load_user_configs(&self) -> MCPRuntimeResult<Vec<MCPServerConfig>> {
        match self.config_store.get_config_value("mcp_servers").await? {
            Some(config_value)
                if config_value
                    .get("mcpServers")
                    .and_then(|v| v.as_object())
                    .is_some() =>
            {
                Ok(parse_cursor_format(&config_value))
            }
            Some(config_value) => {
                if let Some(servers) = config_value.as_array() {
                    return Ok(self.parse_config_array(servers, ConfigLocation::User));
                }

                warn!("Invalid MCP config format, returning empty list");
                Ok(Vec::new())
            }
            None => Ok(Vec::new()),
        }
    }

    async fn load_project_configs(&self) -> MCPRuntimeResult<Vec<MCPServerConfig>> {
        match self
            .config_store
            .get_config_value("project.mcp_servers")
            .await?
        {
            Some(config_value)
                if config_value
                    .get("mcpServers")
                    .and_then(|v| v.as_object())
                    .is_some() =>
            {
                let mut configs = parse_cursor_format(&config_value);
                for config in &mut configs {
                    config.location = ConfigLocation::Project;
                }
                Ok(configs)
            }
            Some(config_value) => {
                if let Some(servers) = config_value.as_array() {
                    Ok(self.parse_config_array(servers, ConfigLocation::Project))
                } else {
                    Ok(Vec::new())
                }
            }
            None => Ok(Vec::new()),
        }
    }

    pub async fn get_server_config(
        &self,
        server_id: &str,
    ) -> MCPRuntimeResult<Option<MCPServerConfig>> {
        let all_configs = self.load_all_configs().await?;
        Ok(all_configs.into_iter().find(|c| c.id == server_id))
    }

    pub async fn save_server_config(&self, config: &MCPServerConfig) -> MCPRuntimeResult<()> {
        match config.location {
            ConfigLocation::BuiltIn => Err(MCPRuntimeError::configuration(
                "Cannot modify built-in MCP server configuration",
            )),
            ConfigLocation::User => self.save_user_config(config).await,
            ConfigLocation::Project => self.save_project_config(config).await,
        }
    }

    pub async fn set_remote_authorization(
        &self,
        server_id: &str,
        authorization_value: &str,
    ) -> MCPRuntimeResult<MCPServerConfig> {
        let mut config = self.get_server_config(server_id).await?.ok_or_else(|| {
            MCPRuntimeError::not_found(format!("MCP server config not found: {}", server_id))
        })?;

        if config.server_type != MCPServerType::Remote {
            return Err(MCPRuntimeError::validation(format!(
                "MCP server '{}' is not a remote server",
                server_id
            )));
        }

        let normalized = normalize_mcp_authorization_value(authorization_value)
            .ok_or_else(|| MCPRuntimeError::validation("Authorization value cannot be empty"))?;

        remove_mcp_authorization_keys(&mut config.headers);
        remove_mcp_authorization_keys(&mut config.env);
        config
            .headers
            .insert("Authorization".to_string(), normalized);

        self.save_server_config(&config).await?;
        Ok(config)
    }

    pub async fn clear_remote_authorization(
        &self,
        server_id: &str,
    ) -> MCPRuntimeResult<MCPServerConfig> {
        let mut config = self.get_server_config(server_id).await?.ok_or_else(|| {
            MCPRuntimeError::not_found(format!("MCP server config not found: {}", server_id))
        })?;

        if config.server_type != MCPServerType::Remote {
            return Err(MCPRuntimeError::validation(format!(
                "MCP server '{}' is not a remote server",
                server_id
            )));
        }

        remove_mcp_authorization_keys(&mut config.headers);
        remove_mcp_authorization_keys(&mut config.env);
        self.save_server_config(&config).await?;
        Ok(config)
    }

    async fn save_user_config(&self, config: &MCPServerConfig) -> MCPRuntimeResult<()> {
        let mut current_value = self
            .config_store
            .get_config_value("mcp_servers")
            .await?
            .unwrap_or_else(|| serde_json::json!({ "mcpServers": {} }));

        let root = current_value
            .as_object_mut()
            .ok_or_else(|| MCPRuntimeError::validation("MCP config root must be an object"))?;
        let mcp_servers = root
            .entry("mcpServers")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .ok_or_else(|| MCPRuntimeError::validation("mcpServers must be an object"))?;
        mcp_servers.insert(config.id.clone(), config_to_cursor_format(config));

        self.config_store
            .set_config_value("mcp_servers", current_value)
            .await?;
        info!(
            "Saved user-level MCP server config (Cursor format): {}",
            config.id
        );
        Ok(())
    }

    /// Inserts one user-level server without replacing any existing entry.
    /// Callers are responsible for serializing mutations through their shared service lock.
    pub async fn insert_user_config_if_absent(
        &self,
        config: &MCPServerConfig,
    ) -> MCPRuntimeResult<()> {
        let mut current_value = self
            .config_store
            .get_config_value("mcp_servers")
            .await?
            .unwrap_or_else(|| serde_json::json!({ "mcpServers": {} }));
        let root = current_value
            .as_object_mut()
            .ok_or_else(|| MCPRuntimeError::validation("MCP config root must be an object"))?;
        let mcp_servers = root
            .entry("mcpServers")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .ok_or_else(|| MCPRuntimeError::validation("mcpServers must be an object"))?;

        if mcp_servers.contains_key(&config.id) {
            return Err(MCPRuntimeError::validation(format!(
                "MCP_CONNECTOR_ALREADY_INSTALLED: {}",
                config.id
            )));
        }
        mcp_servers.insert(config.id.clone(), config_to_cursor_format(config));
        self.config_store
            .set_config_value("mcp_servers", current_value)
            .await?;
        Ok(())
    }

    async fn save_project_config(&self, config: &MCPServerConfig) -> MCPRuntimeResult<()> {
        let mut configs = self.load_project_configs().await.unwrap_or_default();

        if let Some(existing) = configs.iter_mut().find(|c| c.id == config.id) {
            *existing = config.clone();
        } else {
            configs.push(config.clone());
        }

        let value = serde_json::to_value(&configs).map_err(|e| {
            MCPRuntimeError::serialization(format!("Failed to serialize MCP config: {}", e))
        })?;

        self.config_store
            .set_config_value("project.mcp_servers", value)
            .await?;
        Ok(())
    }

    pub async fn delete_server_config(&self, server_id: &str) -> MCPRuntimeResult<()> {
        let mut current_value = self
            .config_store
            .get_config_value("mcp_servers")
            .await?
            .unwrap_or_else(|| serde_json::json!({ "mcpServers": {} }));
        let root = current_value
            .as_object_mut()
            .ok_or_else(|| MCPRuntimeError::validation("MCP config root must be an object"))?;
        let mcp_servers = root
            .get_mut("mcpServers")
            .and_then(Value::as_object_mut)
            .ok_or_else(|| {
                MCPRuntimeError::not_found(format!("MCP server config not found: {}", server_id))
            })?;

        if mcp_servers.remove(server_id).is_none() {
            return Err(MCPRuntimeError::not_found(format!(
                "MCP server config not found: {}",
                server_id
            )));
        }

        self.config_store
            .set_config_value("mcp_servers", current_value)
            .await?;
        info!("Deleted MCP server config: {}", server_id);
        Ok(())
    }
}
