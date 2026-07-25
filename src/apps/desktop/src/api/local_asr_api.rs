//! Desktop boundary for local ASR capability and input sessions.

use crate::api::app_state::AppState;
use tauri::{State, WebviewWindow};
use void_core::service::config::types::VoiceInputConfig;
use void_services_integrations::local_asr::{
    LocalAsrAppendAudioChunkRequest, LocalAsrAppendAudioChunkResponse, LocalAsrError,
    LocalAsrErrorCode, LocalAsrInputSession, LocalAsrSessionRequest,
    LocalAsrStartInputSessionRequest, LocalAsrStatus, LocalAsrStatusProvider,
    LocalAsrTranscriptionResult, LocalFilesystemAsrStatusAdapter,
};

async fn load_config(state: &State<'_, AppState>) -> Result<VoiceInputConfig, LocalAsrError> {
    state
        .config_service
        .get_config::<VoiceInputConfig>(Some("app.ai_experience.voice_input"))
        .await
        .map_err(|error| LocalAsrError {
            code: LocalAsrErrorCode::InspectionFailed,
            message: format!("Failed to read local ASR configuration: {error}"),
            retryable: true,
        })
}

fn validate_local_asr_caller(label: &str) -> Result<(), LocalAsrError> {
    if matches!(label, "main" | "compact-chat-floating") {
        return Ok(());
    }
    Err(LocalAsrError {
        code: LocalAsrErrorCode::AccessDenied,
        message: format!("Window '{label}' is not allowed to access local microphone commands."),
        retryable: false,
    })
}

#[tauri::command]
pub async fn get_local_asr_status(
    state: State<'_, AppState>,
    window: WebviewWindow,
) -> Result<LocalAsrStatus, LocalAsrError> {
    validate_local_asr_caller(window.label())?;
    let config = load_config(&state).await?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "local-asr-engine")]
        let adapter = LocalFilesystemAsrStatusAdapter::with_engine();
        #[cfg(not(feature = "local-asr-engine"))]
        let adapter = LocalFilesystemAsrStatusAdapter::without_engine();
        adapter.inspect(&config)
    })
    .await
    .map_err(|_| LocalAsrError {
        code: LocalAsrErrorCode::InspectionFailed,
        message: "Local ASR status inspection could not be completed.".to_string(),
        retryable: true,
    })
}

#[tauri::command]
pub async fn local_asr_start_input_session(
    state: State<'_, AppState>,
    window: WebviewWindow,
    request: LocalAsrStartInputSessionRequest,
) -> Result<LocalAsrInputSession, LocalAsrError> {
    validate_local_asr_caller(window.label())?;
    #[cfg(feature = "local-asr-engine")]
    {
        let config = load_config(&state).await?;
        state
            .local_asr_service
            .start_input_session(&config, request)
            .await
    }
    #[cfg(not(feature = "local-asr-engine"))]
    {
        let _ = (state, request);
        Err(engine_not_bundled())
    }
}

#[tauri::command]
pub async fn local_asr_append_audio_chunk(
    state: State<'_, AppState>,
    window: WebviewWindow,
    request: LocalAsrAppendAudioChunkRequest,
) -> Result<LocalAsrAppendAudioChunkResponse, LocalAsrError> {
    validate_local_asr_caller(window.label())?;
    #[cfg(feature = "local-asr-engine")]
    {
        state.local_asr_service.append_audio_chunk(request).await
    }
    #[cfg(not(feature = "local-asr-engine"))]
    {
        let _ = (state, request);
        Err(engine_not_bundled())
    }
}

#[tauri::command]
pub async fn local_asr_finish_input_session(
    state: State<'_, AppState>,
    window: WebviewWindow,
    request: LocalAsrSessionRequest,
) -> Result<LocalAsrTranscriptionResult, LocalAsrError> {
    validate_local_asr_caller(window.label())?;
    #[cfg(feature = "local-asr-engine")]
    {
        state.local_asr_service.finish_input_session(request).await
    }
    #[cfg(not(feature = "local-asr-engine"))]
    {
        let _ = (state, request);
        Err(engine_not_bundled())
    }
}

#[tauri::command]
pub async fn local_asr_cancel_input_session(
    state: State<'_, AppState>,
    window: WebviewWindow,
    request: LocalAsrSessionRequest,
) -> Result<(), LocalAsrError> {
    validate_local_asr_caller(window.label())?;
    #[cfg(feature = "local-asr-engine")]
    {
        state.local_asr_service.cancel_input_session(request).await
    }
    #[cfg(not(feature = "local-asr-engine"))]
    {
        let _ = (state, request);
        Err(engine_not_bundled())
    }
}

#[cfg(not(feature = "local-asr-engine"))]
fn engine_not_bundled() -> LocalAsrError {
    LocalAsrError {
        code: LocalAsrErrorCode::EngineNotBundled,
        message: "The local ASR inference engine is not enabled in this build.".to_string(),
        retryable: false,
    }
}

#[cfg(test)]
mod tests {
    use super::validate_local_asr_caller;
    use void_services_integrations::local_asr::LocalAsrErrorCode;

    #[test]
    fn limits_local_asr_commands_to_chat_windows() {
        assert!(validate_local_asr_caller("main").is_ok());
        assert!(validate_local_asr_caller("compact-chat-floating").is_ok());

        for label in ["desktop-pet", "spotlight", "settings"] {
            let error = validate_local_asr_caller(label).unwrap_err();
            assert_eq!(error.code, LocalAsrErrorCode::AccessDenied);
            assert!(error.message.contains(label));
        }
    }
}
