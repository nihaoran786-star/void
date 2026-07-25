//! Desktop boundary for local ASR capability inspection.

use crate::api::app_state::AppState;
use tauri::State;
use void_core::service::config::types::VoiceInputConfig;
use void_core::service::local_asr::{
    LocalAsrStatus, LocalAsrStatusProvider, LocalFilesystemAsrStatusAdapter,
};

#[tauri::command]
pub async fn get_local_asr_status(state: State<'_, AppState>) -> Result<LocalAsrStatus, String> {
    let config = state
        .config_service
        .get_config::<VoiceInputConfig>(Some("app.ai_experience.voice_input"))
        .await
        .map_err(|error| format!("Failed to read local ASR configuration: {error}"))?;

    tauri::async_runtime::spawn_blocking(move || LocalFilesystemAsrStatusAdapter.inspect(&config))
        .await
        .map_err(|_| "Local ASR status inspection could not be completed.".to_string())
}
