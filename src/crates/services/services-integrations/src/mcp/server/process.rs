//! MCP server process management
//!
//! Handles starting, stopping, monitoring, and restarting MCP server processes.

use super::connection::MCPConnection;
use super::{MCPServerConfig, MCPServerStatus, MCPServerTransport, MCPServerType};
use crate::mcp::protocol::{InitializeResult, MCPMessage, MCPServerInfo, MCPTransport};
use crate::mcp::server::{is_mcp_auth_error_message, merge_mcp_remote_headers};
use crate::mcp::{MCPRuntimeError, MCPRuntimeResult};
use log::{debug, error, info, warn};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::process::Child;
use tokio::sync::{mpsc, RwLock};
use void_services_core::process_manager;

const PROCESS_TREE_GRACEFUL_TIMEOUT: Duration = Duration::from_millis(750);
const PROCESS_TREE_TERMINATION_TIMEOUT: Duration = Duration::from_secs(5);

enum ProcessTreeTerminationOutcome {
    Terminated,
    Failed(String),
    TimedOut,
}

/// MCP server process.
pub struct MCPServerProcess {
    id: String,
    name: String,
    server_type: MCPServerType,
    status: Arc<RwLock<MCPServerStatus>>,
    child: Option<Child>,
    connection: Option<Arc<MCPConnection>>,
    server_info: Option<MCPServerInfo>,
    start_time: Option<Instant>,
    restart_count: u32,
    max_restarts: u32,
    health_check_interval: Duration,
    last_ping_time: Arc<RwLock<Option<Instant>>>,
    last_error_message: Arc<RwLock<Option<String>>>,
    message_rx: Option<mpsc::UnboundedReceiver<MCPMessage>>,
}

impl MCPServerProcess {
    /// Creates a new server process instance.
    pub fn new(id: String, name: String, server_type: MCPServerType) -> Self {
        Self {
            id,
            name,
            server_type,
            status: Arc::new(RwLock::new(MCPServerStatus::Uninitialized)),
            child: None,
            connection: None,
            server_info: None,
            start_time: None,
            restart_count: 0,
            max_restarts: 3,
            health_check_interval: Duration::from_secs(30),
            last_ping_time: Arc::new(RwLock::new(None)),
            last_error_message: Arc::new(RwLock::new(None)),
            message_rx: None,
        }
    }

    /// Starts the server process.
    pub async fn start(
        &mut self,
        command: &str,
        args: &[String],
        env: &std::collections::HashMap<String, String>,
    ) -> MCPRuntimeResult<()> {
        info!("Starting MCP server: name={} id={}", self.name, self.id);
        self.set_status(MCPServerStatus::Starting).await;

        #[cfg(windows)]
        let (final_command, final_args) = {
            let node_commands = ["npm", "npx", "node", "yarn", "pnpm"];
            let is_node_command = node_commands
                .iter()
                .any(|&cmd| command.eq_ignore_ascii_case(cmd));

            if is_node_command {
                debug!("Using cmd.exe for Node.js command: command={}", command);
                let mut cmd_args = vec!["/c".to_string(), command.to_string()];
                cmd_args.extend_from_slice(args);
                ("cmd.exe".to_string(), cmd_args)
            } else {
                (command.to_string(), args.to_vec())
            }
        };

        #[cfg(not(windows))]
        let (final_command, final_args) = (command.to_string(), args.to_vec());

        let mut cmd = process_manager::create_tokio_command(&final_command);
        cmd.args(&final_args);
        cmd.envs(env);
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        process_manager::configure_process_group(&mut cmd);

        let child = cmd.spawn().map_err(|e| {
            error!(
                "Failed to spawn MCP server process: command={} error={}",
                final_command, e
            );
            MCPRuntimeError::process(format!(
                "Failed to start MCP server '{}': {}",
                final_command, e
            ))
        });
        let mut child = match child {
            Ok(c) => c,
            Err(e) => {
                self.set_status_with_error(MCPServerStatus::Failed, Some(e.to_string()))
                    .await;
                return Err(e);
            }
        };

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| MCPRuntimeError::process("Failed to capture stdin".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| MCPRuntimeError::process("Failed to capture stdout".to_string()))?;

        let (tx, rx) = mpsc::unbounded_channel();

        let connection = Arc::new(MCPConnection::new(stdin, rx));
        self.message_rx = None; // The connection already owns rx

        MCPTransport::start_receive_loop(stdout, tx);

        self.connection = Some(connection.clone());
        self.child = Some(child);
        self.start_time = Some(Instant::now());

        if let Err(e) = self.handshake().await {
            error!(
                "MCP server handshake failed: name={} id={} error={}",
                self.name, self.id, e
            );
            let _ = self.stop().await;
            self.set_status_with_error(MCPServerStatus::Failed, Some(e.to_string()))
                .await;
            return Err(e);
        }

        self.set_status_with_error(MCPServerStatus::Connected, None)
            .await;
        self.restart_count = 0;
        info!(
            "MCP server started successfully: name={} id={}",
            self.name, self.id
        );

        self.start_health_check();

        Ok(())
    }

    /// Starts a remote server (Streamable HTTP).
    pub async fn start_remote(
        &mut self,
        data_dir: impl Into<PathBuf>,
        config: &MCPServerConfig,
    ) -> MCPRuntimeResult<()> {
        let url = config.url.as_deref().ok_or_else(|| {
            MCPRuntimeError::configuration(format!(
                "Remote MCP server '{}' is missing a URL",
                self.id
            ))
        })?;
        let transport = config.resolved_transport();
        if transport != MCPServerTransport::StreamableHttp {
            return Err(MCPRuntimeError::not_implemented(format!(
                "Remote MCP transport '{}' is not yet supported",
                transport.as_str()
            )));
        }
        info!(
            "Starting remote MCP server: name={} id={} transport={} url={}",
            self.name,
            self.id,
            transport.as_str(),
            url
        );
        self.set_status(MCPServerStatus::Starting).await;

        let merged_headers = merge_mcp_remote_headers(&config.headers, &config.env);

        let connection = Arc::new(
            MCPConnection::new_remote_with_data_dir(
                data_dir,
                &self.id,
                url.to_string(),
                merged_headers,
                true,
            )
            .await?,
        );
        self.connection = Some(connection.clone());
        self.start_time = Some(Instant::now());

        if let Err(e) = self.handshake().await {
            error!(
                "Remote MCP server handshake failed: name={} id={} url={} error={}",
                self.name, self.id, url, e
            );
            self.connection = None;
            self.message_rx = None;
            self.child = None;
            self.server_info = None;
            if is_mcp_auth_error_message(&e.to_string()) {
                self.set_status_with_error(MCPServerStatus::NeedsAuth, Some(e.to_string()))
                    .await;
            } else {
                self.set_status_with_error(MCPServerStatus::Failed, Some(e.to_string()))
                    .await;
            }
            return Err(e);
        }

        self.set_status_with_error(MCPServerStatus::Connected, None)
            .await;
        self.restart_count = 0;
        info!(
            "Remote MCP server started successfully: name={} id={}",
            self.name, self.id
        );

        self.start_health_check();

        Ok(())
    }

    /// Performs the handshake (`initialize`).
    async fn handshake(&mut self) -> MCPRuntimeResult<()> {
        let connection = self
            .connection
            .as_ref()
            .ok_or_else(|| MCPRuntimeError::mcp("Connection not established".to_string()))?;

        debug!(
            "Initiating handshake with MCP server: name={} id={}",
            self.name, self.id
        );

        let result: InitializeResult = connection
            .initialize("Void", env!("CARGO_PKG_VERSION"))
            .await?;

        info!(
            "Handshake successful: server_name={} protocol={} resources={} prompts={} tools={}",
            result.server_info.name,
            result.protocol_version,
            result.capabilities.resources.is_some(),
            result.capabilities.prompts.is_some(),
            result.capabilities.tools.is_some()
        );

        self.server_info = Some(result.server_info);
        Ok(())
    }

    /// Stops the server process.
    pub async fn stop(&mut self) -> MCPRuntimeResult<()> {
        info!("Stopping MCP server: name={} id={}", self.name, self.id);
        self.set_status(MCPServerStatus::Stopping).await;

        // Release the transport first so stdio handles cannot keep the server alive while the
        // process tree is being terminated.
        self.connection = None;
        self.message_rx = None;

        let termination_outcome = if let Some(mut child) = self.child.take() {
            match tokio::time::timeout(
                PROCESS_TREE_TERMINATION_TIMEOUT,
                process_manager::terminate_child_process_tree(
                    &mut child,
                    PROCESS_TREE_GRACEFUL_TIMEOUT,
                ),
            )
            .await
            {
                Ok(Ok(())) => ProcessTreeTerminationOutcome::Terminated,
                Ok(Err(error)) => {
                    warn!(
                        "Failed to terminate MCP server process tree; scheduling cleanup: name={} id={} error={}",
                        self.name, self.id, error
                    );
                    process_manager::spawn_child_process_tree_cleanup(
                        child,
                        PROCESS_TREE_GRACEFUL_TIMEOUT,
                    );
                    ProcessTreeTerminationOutcome::Failed(error.to_string())
                }
                Err(_) => {
                    warn!(
                        "Timed out terminating MCP server process tree; scheduling cleanup: name={} id={} timeout_ms={}",
                        self.name,
                        self.id,
                        PROCESS_TREE_TERMINATION_TIMEOUT.as_millis()
                    );
                    process_manager::spawn_child_process_tree_cleanup(
                        child,
                        PROCESS_TREE_GRACEFUL_TIMEOUT,
                    );
                    ProcessTreeTerminationOutcome::TimedOut
                }
            }
        } else {
            ProcessTreeTerminationOutcome::Terminated
        };

        self.finish_stop(termination_outcome).await
    }

    async fn finish_stop(
        &self,
        termination_outcome: ProcessTreeTerminationOutcome,
    ) -> MCPRuntimeResult<()> {
        let failure_message = match termination_outcome {
            ProcessTreeTerminationOutcome::Terminated => {
                self.set_status(MCPServerStatus::Stopped).await;
                info!("MCP server stopped: name={} id={}", self.name, self.id);
                return Ok(());
            }
            ProcessTreeTerminationOutcome::Failed(error) => format!(
                "Failed to terminate MCP server process tree for server '{}': {}",
                self.id, error
            ),
            ProcessTreeTerminationOutcome::TimedOut => format!(
                "Timed out terminating MCP server process tree for server '{}' after {} ms",
                self.id,
                PROCESS_TREE_TERMINATION_TIMEOUT.as_millis()
            ),
        };

        self.set_status_with_error(MCPServerStatus::Failed, Some(failure_message.clone()))
            .await;
        Err(MCPRuntimeError::process(failure_message))
    }

    /// Restarts the server.
    pub async fn restart(
        &mut self,
        command: &str,
        args: &[String],
        env: &std::collections::HashMap<String, String>,
    ) -> MCPRuntimeResult<()> {
        if self.restart_count >= self.max_restarts {
            error!(
                "Max restart attempts reached: name={} id={} max_restarts={}",
                self.name, self.id, self.max_restarts
            );
            self.set_status_with_error(
                MCPServerStatus::Failed,
                Some(format!(
                    "Max restart attempts ({}) reached",
                    self.max_restarts
                )),
            )
            .await;
            return Err(MCPRuntimeError::mcp(format!(
                "Max restart attempts ({}) reached",
                self.max_restarts
            )));
        }

        self.restart_count += 1;
        info!(
            "Restarting MCP server: name={} id={} attempt={}/{}",
            self.name, self.id, self.restart_count, self.max_restarts
        );

        self.stop().await?;
        tokio::time::sleep(Duration::from_secs(1)).await;
        self.start(command, args, env).await
    }

    /// Sets status.
    async fn set_status(&self, status: MCPServerStatus) {
        self.set_status_with_error(status, None).await;
    }

    async fn set_status_with_error(&self, status: MCPServerStatus, error: Option<String>) {
        let mut current_status = self.status.write().await;
        *current_status = status;
        let mut last_error_message = self.last_error_message.write().await;
        *last_error_message = error;
    }

    /// Gets status.
    pub async fn status(&self) -> MCPServerStatus {
        *self.status.read().await
    }

    /// Returns the last status/error detail associated with the process.
    pub async fn status_message(&self) -> Option<String> {
        self.last_error_message.read().await.clone()
    }

    /// Returns the connection.
    pub fn connection(&self) -> Option<Arc<MCPConnection>> {
        self.connection.clone()
    }

    /// Returns server info.
    pub fn server_info(&self) -> Option<&MCPServerInfo> {
        self.server_info.as_ref()
    }

    /// Starts health checks.
    fn start_health_check(&self) {
        let status = self.status.clone();
        let last_ping = self.last_ping_time.clone();
        let last_error_message = self.last_error_message.clone();
        let connection = self.connection.clone();
        let interval = self.health_check_interval;
        let server_name = self.name.clone();

        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);

            loop {
                ticker.tick().await;

                let current_status = *status.read().await;
                if !matches!(
                    current_status,
                    MCPServerStatus::Connected | MCPServerStatus::Healthy
                ) {
                    debug!(
                        "Health check stopped: server_name={} status={:?}",
                        server_name, current_status
                    );
                    break;
                }

                if let Some(conn) = &connection {
                    match conn.ping().await {
                        Ok(_) => {
                            *status.write().await = MCPServerStatus::Healthy;
                            *last_ping.write().await = Some(Instant::now());
                            *last_error_message.write().await = None;
                        }
                        Err(e) => {
                            warn!(
                                "Health check failed: server_name={} error={}",
                                server_name, e
                            );
                            if is_mcp_auth_error_message(&e.to_string()) {
                                *status.write().await = MCPServerStatus::NeedsAuth;
                            } else {
                                *status.write().await = MCPServerStatus::Reconnecting;
                            }
                            *last_error_message.write().await = Some(e.to_string());
                        }
                    }
                } else {
                    break;
                }
            }
        });
    }

    /// Returns the id.
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Returns the name.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Returns the server type.
    pub fn server_type(&self) -> MCPServerType {
        self.server_type
    }

    /// Returns uptime.
    pub fn uptime(&self) -> Option<Duration> {
        self.start_time.map(|t| t.elapsed())
    }
}

impl Drop for MCPServerProcess {
    fn drop(&mut self) {
        self.connection = None;
        self.message_rx = None;
        if let Some(child) = self.child.take() {
            process_manager::spawn_child_process_tree_cleanup(child, PROCESS_TREE_GRACEFUL_TIMEOUT);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_pid_file(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should follow the Unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "void-mcp-process-tree-{label}-{}-{nonce}.pid",
            std::process::id()
        ))
    }

    #[cfg(windows)]
    fn spawn_test_process_tree(pid_file: &Path) -> Child {
        let pid_file = pid_file.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$child = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-Command', 'Start-Sleep -Seconds 300') -WindowStyle Hidden -PassThru; \
             Set-Content -LiteralPath '{pid_file}' -Value $child.Id; \
             Wait-Process -Id $child.Id"
        );
        let mut command = process_manager::create_tokio_command("powershell.exe");
        command.args(["-NoProfile", "-Command", &script]);
        process_manager::configure_process_group(&mut command);
        command.spawn().expect("test process tree should start")
    }

    #[cfg(unix)]
    fn spawn_test_process_tree(pid_file: &Path) -> Child {
        let pid_file = pid_file.to_string_lossy().replace('\'', "'\\''");
        let script = format!("sleep 300 & echo $! > '{pid_file}'; wait");
        let mut command = process_manager::create_tokio_command("sh");
        command.args(["-c", &script]);
        process_manager::configure_process_group(&mut command);
        command.spawn().expect("test process tree should start")
    }

    async fn read_descendant_pid(pid_file: &Path) -> u32 {
        for _ in 0..100 {
            if let Ok(raw_pid) = tokio::fs::read_to_string(pid_file).await {
                if let Ok(pid) = raw_pid.trim().parse() {
                    return pid;
                }
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        panic!(
            "test descendant did not publish its PID at {}",
            pid_file.display()
        );
    }

    #[cfg(windows)]
    async fn process_is_running(pid: u32) -> bool {
        let mut command = process_manager::create_tokio_command("powershell.exe");
        command.args([
            "-NoProfile",
            "-Command",
            &format!(
                "if (Get-Process -Id {pid} -ErrorAction SilentlyContinue) {{ exit 0 }} else {{ exit 1 }}"
            ),
        ]);
        command
            .status()
            .await
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[cfg(unix)]
    async fn process_is_running(pid: u32) -> bool {
        let mut command = process_manager::create_tokio_command("kill");
        command.args(["-0", &pid.to_string()]);
        command
            .status()
            .await
            .map(|status| status.success())
            .unwrap_or(false)
    }

    async fn wait_until_process_stops(pid: u32) -> bool {
        for _ in 0..100 {
            if !process_is_running(pid).await {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        false
    }

    #[cfg(windows)]
    async fn cleanup_test_process_tree(parent_pid: u32, descendant_pid: u32) {
        for pid in [parent_pid, descendant_pid] {
            let mut command = process_manager::create_tokio_command("taskkill");
            command
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());
            let _ = command.status().await;
        }
    }

    #[cfg(unix)]
    async fn cleanup_test_process_tree(parent_pid: u32, descendant_pid: u32) {
        for pid in [format!("-{parent_pid}"), descendant_pid.to_string()] {
            let mut command = process_manager::create_tokio_command("kill");
            command
                .args(["-KILL", &pid])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());
            let _ = command.status().await;
        }
    }

    async fn assert_tree_stopped_and_cleanup(
        parent_pid: u32,
        descendant_pid: u32,
        pid_file: &Path,
    ) {
        let parent_stopped = wait_until_process_stops(parent_pid).await;
        let descendant_stopped = wait_until_process_stops(descendant_pid).await;
        cleanup_test_process_tree(parent_pid, descendant_pid).await;
        let _ = tokio::fs::remove_file(pid_file).await;

        assert!(
            parent_stopped,
            "test parent process {parent_pid} remained alive"
        );
        assert!(
            descendant_stopped,
            "test descendant process {descendant_pid} remained alive"
        );
    }

    #[tokio::test]
    async fn stop_terminates_the_entire_local_process_tree() {
        let pid_file = test_pid_file("stop");
        let child = spawn_test_process_tree(&pid_file);
        let parent_pid = child.id().expect("test parent should expose a PID");
        let descendant_pid = read_descendant_pid(&pid_file).await;

        let mut process = MCPServerProcess::new(
            "tree-stop".to_string(),
            "Tree Stop".to_string(),
            MCPServerType::Local,
        );
        process.child = Some(child);
        process.stop().await.expect("stop should complete");

        assert_tree_stopped_and_cleanup(parent_pid, descendant_pid, &pid_file).await;
    }

    #[tokio::test]
    async fn drop_terminates_the_entire_local_process_tree() {
        let pid_file = test_pid_file("drop");
        let child = spawn_test_process_tree(&pid_file);
        let parent_pid = child.id().expect("test parent should expose a PID");
        let descendant_pid = read_descendant_pid(&pid_file).await;

        let mut process = MCPServerProcess::new(
            "tree-drop".to_string(),
            "Tree Drop".to_string(),
            MCPServerType::Local,
        );
        process.child = Some(child);
        drop(process);

        assert_tree_stopped_and_cleanup(parent_pid, descendant_pid, &pid_file).await;
    }

    #[tokio::test]
    async fn stop_failure_sets_failed_status_and_returns_process_error() {
        let process = MCPServerProcess::new(
            "failure-server".to_string(),
            "Failure Server".to_string(),
            MCPServerType::Local,
        );

        let error = process
            .finish_stop(ProcessTreeTerminationOutcome::Failed(
                "synthetic termination failure".to_string(),
            ))
            .await
            .expect_err("termination failure must be returned");

        assert_eq!(process.status().await, MCPServerStatus::Failed);
        let status_message = process
            .status_message()
            .await
            .expect("failure status should include a message");
        assert!(status_message.contains("failure-server"));
        assert!(status_message.contains("Failed to terminate"));
        assert!(error.to_string().contains("failure-server"));
        assert!(error.to_string().contains("synthetic termination failure"));
    }

    #[tokio::test]
    async fn stop_timeout_sets_failed_status_and_returns_distinct_process_error() {
        let process = MCPServerProcess::new(
            "timeout-server".to_string(),
            "Timeout Server".to_string(),
            MCPServerType::Local,
        );

        let error = process
            .finish_stop(ProcessTreeTerminationOutcome::TimedOut)
            .await
            .expect_err("termination timeout must be returned");

        assert_eq!(process.status().await, MCPServerStatus::Failed);
        let status_message = process
            .status_message()
            .await
            .expect("timeout status should include a message");
        assert!(status_message.contains("timeout-server"));
        assert!(status_message.contains("Timed out terminating"));
        assert!(status_message.contains(&PROCESS_TREE_TERMINATION_TIMEOUT.as_millis().to_string()));
        assert!(error.to_string().contains("timeout-server"));
        assert!(!error.to_string().contains("synthetic termination failure"));
    }
}
