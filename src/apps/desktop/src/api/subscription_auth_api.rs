//! Desktop adapter for subscription OAuth commands and loopback callbacks.

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, OnceCell};
use tokio::task::JoinHandle;
use void_core::infrastructure::subscription_auth::{
    NativeSubscriptionCredentialStore, ReqwestSubscriptionOAuthAdapter,
    StartSubscriptionAuthRequest, SubscriptionAccount, SubscriptionAuthError,
    SubscriptionAuthErrorCode, SubscriptionAuthService, SubscriptionAuthSession,
    SubscriptionAuthStatus, SubscriptionProvider,
};

const CODEX_CALLBACK_PORTS: [u16; 2] = [1455, 1457];
const CALLBACK_PATH: &str = "/auth/callback";
const CALLBACK_ACCEPT_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const CALLBACK_READ_TIMEOUT: Duration = Duration::from_secs(5);
const CALLBACK_MAX_REQUEST_BYTES: usize = 8 * 1024;
const OPENCODE_TICK_INTERVAL: Duration = Duration::from_secs(1);
const OPENCODE_LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

type SharedSubscriptionAuthService = Arc<SubscriptionAuthService>;

struct BackgroundTask {
    provider: SubscriptionProvider,
    handle: JoinHandle<()>,
}

pub struct SubscriptionAuthDesktopState {
    service: OnceCell<SharedSubscriptionAuthService>,
    tasks: Mutex<HashMap<String, BackgroundTask>>,
}

impl Default for SubscriptionAuthDesktopState {
    fn default() -> Self {
        Self {
            service: OnceCell::new(),
            tasks: Mutex::new(HashMap::new()),
        }
    }
}

impl SubscriptionAuthDesktopState {
    async fn service(&self) -> Result<SharedSubscriptionAuthService, SubscriptionAuthError> {
        get_or_initialize_service(&self.service, || async {
            let provider = ReqwestSubscriptionOAuthAdapter::new()?;
            let store = NativeSubscriptionCredentialStore::new().await?;
            Ok(Arc::new(SubscriptionAuthService::new(
                Arc::new(provider),
                Arc::new(store),
            )))
        })
        .await
    }

    async fn replace_task(
        &self,
        session_id: String,
        provider: SubscriptionProvider,
        handle: JoinHandle<()>,
    ) {
        let mut tasks = self.tasks.lock().await;
        tasks.retain(|_, task| !task.handle.is_finished());
        if let Some(previous) = tasks.insert(session_id, BackgroundTask { provider, handle }) {
            previous.handle.abort();
        }
    }

    async fn abort_task(&self, session_id: &str) {
        if let Some(task) = self.tasks.lock().await.remove(session_id) {
            task.handle.abort();
        }
    }

    async fn provider_session_ids(&self, provider: SubscriptionProvider) -> Vec<String> {
        self.tasks
            .lock()
            .await
            .iter()
            .filter_map(|(session_id, task)| {
                (task.provider == provider).then(|| session_id.clone())
            })
            .collect()
    }
}

async fn get_or_initialize_service<Factory, Future>(
    cell: &OnceCell<SharedSubscriptionAuthService>,
    factory: Factory,
) -> Result<SharedSubscriptionAuthService, SubscriptionAuthError>
where
    Factory: FnOnce() -> Future,
    Future:
        std::future::Future<Output = Result<SharedSubscriptionAuthService, SubscriptionAuthError>>,
{
    cell.get_or_try_init(factory).await.cloned()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionStartCommandRequest {
    pub provider: SubscriptionProvider,
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionSessionCommandRequest {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionProviderCommandRequest {
    pub provider: SubscriptionProvider,
}

#[tauri::command]
pub async fn subscription_auth_list_accounts(
    state: State<'_, SubscriptionAuthDesktopState>,
) -> Result<Vec<SubscriptionAccount>, SubscriptionAuthError> {
    state.service().await?.list().await
}

#[tauri::command]
pub async fn subscription_auth_start(
    state: State<'_, SubscriptionAuthDesktopState>,
    request: SubscriptionStartCommandRequest,
) -> Result<SubscriptionAuthSession, SubscriptionAuthError> {
    let service = state.service().await?;
    match request.provider {
        SubscriptionProvider::Codex => {
            let (listener, port) = bind_codex_callback().await?;
            let snapshot = service
                .start(StartSubscriptionAuthRequest {
                    session_id: request.session_id.clone(),
                    provider: request.provider,
                    redirect_uri: Some(format!("http://localhost:{port}{CALLBACK_PATH}")),
                })
                .await?;
            if snapshot.status == SubscriptionAuthStatus::Pending {
                let task_service = service.clone();
                let session_id = request.session_id.clone();
                let handle = tokio::spawn(async move {
                    run_codex_callback(listener, port, task_service, session_id).await;
                });
                state
                    .replace_task(request.session_id, request.provider, handle)
                    .await;
            }
            Ok(snapshot)
        }
        SubscriptionProvider::Opencode => {
            let snapshot = service
                .start(StartSubscriptionAuthRequest {
                    session_id: request.session_id.clone(),
                    provider: request.provider,
                    redirect_uri: None,
                })
                .await?;
            if snapshot.status == SubscriptionAuthStatus::Pending {
                let task_service = service.clone();
                let session_id = request.session_id.clone();
                let handle = tokio::spawn(async move {
                    run_opencode_polling(task_service, session_id).await;
                });
                state
                    .replace_task(request.session_id, request.provider, handle)
                    .await;
            }
            Ok(snapshot)
        }
    }
}

#[tauri::command]
pub async fn subscription_auth_status(
    state: State<'_, SubscriptionAuthDesktopState>,
    request: SubscriptionSessionCommandRequest,
) -> Result<SubscriptionAuthSession, SubscriptionAuthError> {
    let snapshot = state.service().await?.status(&request.session_id).await?;
    if snapshot.status != SubscriptionAuthStatus::Pending {
        state.abort_task(&request.session_id).await;
    }
    Ok(snapshot)
}

#[tauri::command]
pub async fn subscription_auth_cancel(
    state: State<'_, SubscriptionAuthDesktopState>,
    request: SubscriptionSessionCommandRequest,
) -> Result<SubscriptionAuthSession, SubscriptionAuthError> {
    let snapshot = state.service().await?.cancel(&request.session_id).await?;
    state.abort_task(&request.session_id).await;
    Ok(snapshot)
}

#[tauri::command]
pub async fn subscription_auth_logout(
    state: State<'_, SubscriptionAuthDesktopState>,
    request: SubscriptionProviderCommandRequest,
) -> Result<(), SubscriptionAuthError> {
    let service = state.service().await?;
    for session_id in state.provider_session_ids(request.provider).await {
        let _ = service.cancel(&session_id).await;
        state.abort_task(&session_id).await;
    }
    service.logout(request.provider).await
}

#[tauri::command]
pub async fn subscription_auth_refresh(
    state: State<'_, SubscriptionAuthDesktopState>,
    request: SubscriptionProviderCommandRequest,
) -> Result<SubscriptionAccount, SubscriptionAuthError> {
    state.service().await?.refresh(request.provider).await
}

async fn bind_codex_callback() -> Result<(TcpListener, u16), SubscriptionAuthError> {
    for port in CODEX_CALLBACK_PORTS {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)).await {
            return Ok((listener, port));
        }
    }
    Err(desktop_error(
        SubscriptionAuthErrorCode::Network,
        "Codex callback ports 1455 and 1457 are unavailable",
        true,
    ))
}

async fn run_codex_callback(
    listener: TcpListener,
    port: u16,
    service: SharedSubscriptionAuthService,
    session_id: String,
) {
    let deadline = tokio::time::Instant::now() + CALLBACK_ACCEPT_TIMEOUT;
    loop {
        let (mut stream, peer) = match tokio::time::timeout_at(deadline, listener.accept()).await {
            Ok(Ok(connection)) => connection,
            Ok(Err(_)) => {
                fail_callback(
                    &service,
                    &session_id,
                    "Codex callback listener failed",
                    true,
                )
                .await;
                return;
            }
            Err(_) => {
                fail_callback(&service, &session_id, "Codex authorization timed out", true).await;
                return;
            }
        };
        if !peer.ip().is_loopback() {
            let _ = write_callback_response(&mut stream, false).await;
            continue;
        }

        let callback = match read_callback_request(&mut stream, port).await {
            Ok(callback) => callback,
            Err(_) => {
                let _ = write_callback_response(&mut stream, false).await;
                continue;
            }
        };
        let result = match callback {
            CallbackQuery::Code { code, state } => {
                service.complete_browser(&session_id, &code, &state).await
            }
            CallbackQuery::ProviderError { state } => {
                // Reuse core state validation. Empty code is rejected without
                // exposing the provider's untrusted error description.
                service.complete_browser(&session_id, "", &state).await
            }
        };
        match result {
            Ok(snapshot) => {
                let authorized = snapshot.status == SubscriptionAuthStatus::Authorized;
                let _ = write_callback_response(&mut stream, authorized).await;
                return;
            }
            Err(error) if error.code == SubscriptionAuthErrorCode::InvalidState => {
                // Another local process must not be able to terminate the real
                // login by racing a callback with a guessed state.
                let _ = write_callback_response(&mut stream, false).await;
            }
            Err(error) => {
                let _ = service.fail_pending(&session_id, error).await;
                let _ = write_callback_response(&mut stream, false).await;
                return;
            }
        }
    }
}

async fn run_opencode_polling(service: SharedSubscriptionAuthService, session_id: String) {
    let deadline = tokio::time::Instant::now() + OPENCODE_LOGIN_TIMEOUT;
    loop {
        tokio::time::sleep(OPENCODE_TICK_INTERVAL).await;
        if tokio::time::Instant::now() >= deadline {
            fail_callback(
                &service,
                &session_id,
                "OpenCode authorization timed out",
                true,
            )
            .await;
            return;
        }
        match service.tick(&session_id).await {
            Ok(snapshot) if snapshot.status == SubscriptionAuthStatus::Pending => {}
            _ => return,
        }
    }
}

async fn fail_callback(
    service: &SubscriptionAuthService,
    session_id: &str,
    message: &str,
    retryable: bool,
) {
    let _ = service
        .fail_pending(
            session_id,
            desktop_error(SubscriptionAuthErrorCode::Network, message, retryable),
        )
        .await;
}

enum CallbackQuery {
    Code { code: String, state: String },
    ProviderError { state: String },
}

async fn read_callback_request(
    stream: &mut TcpStream,
    port: u16,
) -> Result<CallbackQuery, SubscriptionAuthError> {
    let mut request = Vec::with_capacity(1024);
    let read = async {
        loop {
            if request.len() >= CALLBACK_MAX_REQUEST_BYTES {
                return Err(callback_request_error(
                    "Codex callback request is too large",
                ));
            }
            let remaining = CALLBACK_MAX_REQUEST_BYTES - request.len();
            let mut chunk = [0u8; 1024];
            let read_capacity = remaining.min(chunk.len());
            let count = stream
                .read(&mut chunk[..read_capacity])
                .await
                .map_err(|_| callback_request_error("Could not read Codex callback request"))?;
            if count == 0 {
                return Err(callback_request_error(
                    "Codex callback request ended before its headers",
                ));
            }
            request.extend_from_slice(&chunk[..count]);
            if request.windows(4).any(|window| window == b"\r\n\r\n") {
                return parse_callback_request(&request, port);
            }
        }
    };
    tokio::time::timeout(CALLBACK_READ_TIMEOUT, read)
        .await
        .map_err(|_| callback_request_error("Codex callback request timed out"))?
}

fn parse_callback_request(
    request: &[u8],
    port: u16,
) -> Result<CallbackQuery, SubscriptionAuthError> {
    if request.len() > CALLBACK_MAX_REQUEST_BYTES {
        return Err(callback_request_error(
            "Codex callback request is too large",
        ));
    }
    let request = std::str::from_utf8(request)
        .map_err(|_| callback_request_error("Codex callback request is not valid UTF-8"))?;
    let header_end = request
        .find("\r\n\r\n")
        .ok_or_else(|| callback_request_error("Codex callback headers are incomplete"))?;
    let mut lines = request[..header_end].split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| callback_request_error("Codex callback request line is missing"))?;
    let mut request_parts = request_line.split(' ');
    let method = request_parts.next();
    let target = request_parts.next();
    let version = request_parts.next();
    if method != Some("GET")
        || target.is_none()
        || !target.is_some_and(|target| target.starts_with('/') && !target.starts_with("//"))
        || !matches!(version, Some("HTTP/1.1" | "HTTP/1.0"))
        || request_parts.next().is_some()
    {
        return Err(callback_request_error(
            "Codex callback must be a valid HTTP GET request",
        ));
    }

    let expected_host = format!("localhost:{port}");
    let fallback_host = format!("127.0.0.1:{port}");
    let hosts = lines
        .filter_map(|line| line.split_once(':'))
        .filter(|(name, _)| name.eq_ignore_ascii_case("host"))
        .map(|(_, value)| value.trim())
        .collect::<Vec<_>>();
    if hosts.len() != 1
        || !matches!(hosts[0], value if value == expected_host || value == fallback_host)
    {
        return Err(callback_request_error("Codex callback Host is invalid"));
    }

    let url = reqwest::Url::parse(&format!("http://localhost:{port}{}", target.unwrap()))
        .map_err(|_| callback_request_error("Codex callback URL is invalid"))?;
    if url.path() != CALLBACK_PATH || url.fragment().is_some() {
        return Err(callback_request_error("Codex callback path is invalid"));
    }
    let mut code = None;
    let mut state = None;
    let mut provider_error = None;
    for (key, value) in url.query_pairs() {
        let slot = match key.as_ref() {
            "code" => &mut code,
            "state" => &mut state,
            "error" => &mut provider_error,
            _ => continue,
        };
        if slot.replace(value.into_owned()).is_some() {
            return Err(callback_request_error(
                "Codex callback contains duplicate parameters",
            ));
        }
    }
    let state = bounded_parameter(state, "state")?;
    if provider_error.is_some() {
        return Ok(CallbackQuery::ProviderError { state });
    }
    Ok(CallbackQuery::Code {
        code: bounded_parameter(code, "code")?,
        state,
    })
}

fn bounded_parameter(value: Option<String>, name: &str) -> Result<String, SubscriptionAuthError> {
    let value = value
        .filter(|value| !value.trim().is_empty() && value.len() <= 4096)
        .ok_or_else(|| {
            callback_request_error(&format!("Codex callback {name} is missing or invalid"))
        })?;
    Ok(value)
}

async fn write_callback_response(stream: &mut TcpStream, authorized: bool) -> std::io::Result<()> {
    let (status, title, message) = if authorized {
        (
            "200 OK",
            "Authorization complete",
            "You can close this window and return to Void.",
        )
    } else {
        (
            "400 Bad Request",
            "Authorization failed",
            "Return to Void to retry authorization.",
        )
    };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>{title}</title></head><body><main><h1>{title}</h1><p>{message}</p></main></body></html>"
    );
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes()).await?;
    stream.shutdown().await
}

fn callback_request_error(message: &str) -> SubscriptionAuthError {
    desktop_error(SubscriptionAuthErrorCode::InvalidRequest, message, false)
}

fn desktop_error(
    code: SubscriptionAuthErrorCode,
    message: &str,
    retryable: bool,
) -> SubscriptionAuthError {
    SubscriptionAuthError::new(code, message, retryable)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn request(target: &str, host: &str) -> Vec<u8> {
        format!("GET {target} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n").into_bytes()
    }

    #[test]
    fn callback_parser_accepts_exact_path_code_and_state() {
        let parsed = parse_callback_request(
            &request(
                "/auth/callback?code=abc%20123&state=state-value",
                "localhost:1455",
            ),
            1455,
        )
        .expect("valid callback");
        match parsed {
            CallbackQuery::Code { code, state } => {
                assert_eq!(code, "abc 123");
                assert_eq!(state, "state-value");
            }
            CallbackQuery::ProviderError { .. } => panic!("expected code callback"),
        }
    }

    #[test]
    fn callback_parser_rejects_wrong_method_host_path_and_duplicates() {
        let cases = [
            b"POST /auth/callback?code=a&state=b HTTP/1.1\r\nHost: localhost:1455\r\n\r\n".to_vec(),
            request("/auth/callback?code=a&state=b", "evil.example"),
            request("/other?code=a&state=b", "localhost:1455"),
            request("/auth/callback?code=a&code=b&state=c", "localhost:1455"),
        ];
        for request in cases {
            assert!(parse_callback_request(&request, 1455).is_err());
        }
    }

    #[test]
    fn callback_parser_rejects_oversized_or_incomplete_requests() {
        assert!(parse_callback_request(&vec![b'a'; CALLBACK_MAX_REQUEST_BYTES + 1], 1455).is_err());
        assert!(parse_callback_request(
            b"GET /auth/callback?code=a&state=b HTTP/1.1\r\nHost: localhost:1455\r\n",
            1455,
        )
        .is_err());
    }

    #[tokio::test]
    async fn retryable_service_initialization_failure_is_not_cached() {
        let cell = OnceCell::new();
        let attempts = AtomicUsize::new(0);
        let first = get_or_initialize_service(&cell, || async {
            attempts.fetch_add(1, Ordering::Relaxed);
            Err(desktop_error(
                SubscriptionAuthErrorCode::CredentialStoreFailed,
                "vault temporarily unavailable",
                true,
            ))
        })
        .await;
        let Err(error) = first else {
            panic!("first initialization must fail");
        };
        assert!(error.retryable);

        let service = get_or_initialize_service(&cell, || async {
            attempts.fetch_add(1, Ordering::Relaxed);
            Ok(Arc::new(SubscriptionAuthService::new(
                Arc::new(ReqwestSubscriptionOAuthAdapter::new().unwrap()),
                Arc::new(
                    void_core::infrastructure::subscription_auth::UnsupportedSubscriptionCredentialStore,
                ),
            )))
        })
        .await
        .expect("second initialization should succeed");
        let cached = get_or_initialize_service(&cell, || async {
            attempts.fetch_add(1, Ordering::Relaxed);
            Err(desktop_error(
                SubscriptionAuthErrorCode::CredentialStoreFailed,
                "must not run",
                true,
            ))
        })
        .await
        .expect("successful service is cached");

        assert!(Arc::ptr_eq(&service, &cached));
        assert_eq!(attempts.load(Ordering::Relaxed), 2);
    }
}
