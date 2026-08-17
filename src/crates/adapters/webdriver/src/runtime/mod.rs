use std::sync::Arc;
use std::sync::OnceLock;

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;
use tauri::Listener;
use tauri::Manager;

use crate::platform;
use crate::server::response::WebDriverErrorResponse;
use crate::server::AppState;

pub(crate) mod api;
pub(crate) mod script;

const BRIDGE_EVENT: &str = "void_webdriver_result";
static BRIDGE_STATE: OnceLock<Arc<AppState>> = OnceLock::new();

#[derive(Debug, Deserialize)]
pub(crate) struct BridgeResponse {
    #[serde(rename = "channel")]
    pub(crate) _channel: BridgeChannel,
    #[serde(rename = "requestId")]
    pub(crate) request_id: String,
    pub(crate) ok: bool,
    pub(crate) value: Option<Value>,
    pub(crate) error: Option<BridgeError>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum BridgeChannel {
    VoidWebdriverResult,
}

#[derive(Debug, Deserialize)]
pub(crate) struct BridgeError {
    pub(crate) message: Option<String>,
    pub(crate) stack: Option<String>,
}

pub fn register_listener(app: AppHandle, state: Arc<AppState>) {
    let _ = BRIDGE_STATE.set(state.clone());
    app.listen_any(BRIDGE_EVENT, move |event| {
        let Ok(payload) = serde_json::from_str::<BridgeResponse>(event.payload()) else {
            return;
        };
        log::debug!(
            "Embedded WebDriver bridge received event payload: request_id={}, ok={}",
            payload.request_id,
            payload.ok
        );
        dispatch_bridge_response(&state, payload);
    });
}

pub fn handle_invoke_payload(payload: Value) -> Result<(), String> {
    let state = BRIDGE_STATE
        .get()
        .ok_or_else(|| "Embedded WebDriver bridge state is not initialized".to_string())?;
    if payload.get("channel").and_then(Value::as_str) != Some("void_webdriver_result") {
        return Ok(());
    }
    let request_id = payload
        .get("requestId")
        .and_then(Value::as_str)
        .ok_or_else(|| "Invalid bridge payload: missing requestId".to_string())?;
    let request_is_pending = state
        .pending_requests
        .lock()
        .map_err(|_| "Failed to lock pending WebDriver requests".to_string())?
        .contains_key(request_id);
    if !request_is_pending {
        log::debug!("Ignoring stale WebDriver bridge response: request_id={request_id}");
        return Ok(());
    }
    let payload = serde_json::from_value::<BridgeResponse>(payload)
        .map_err(|error| format!("Invalid bridge payload: {error}"))?;
    log::debug!(
        "Embedded WebDriver bridge received invoke payload: request_id={}, ok={}",
        payload.request_id,
        payload.ok
    );
    dispatch_bridge_response(state, payload);
    Ok(())
}

fn dispatch_bridge_response(state: &Arc<AppState>, payload: BridgeResponse) {
    let maybe_sender = state
        .pending_requests
        .lock()
        .ok()
        .and_then(|mut pending| pending.remove(&payload.request_id));

    if let Some(sender) = maybe_sender {
        let _ = sender.send(payload);
    }
}

pub async fn run_script(
    state: Arc<AppState>,
    session_id: &str,
    script_source: &str,
    args: Vec<Value>,
    async_mode: bool,
) -> Result<Value, WebDriverErrorResponse> {
    let session = state.sessions.read().await.get_cloned(session_id)?;
    let timeout_ms = session.timeouts.script.max(5_000);
    let webview = state
        .app
        .get_webview(&session.current_window)
        .ok_or_else(|| {
            WebDriverErrorResponse::no_such_window(format!(
                "Webview not found: {}",
                session.current_window
            ))
        })?;

    let frame_context = script::serialize_frame_context(&session.frame_context);

    platform::evaluator::evaluate_script(
        state,
        webview,
        timeout_ms,
        script_source,
        &args,
        async_mode,
        &frame_context,
    )
    .await
}
