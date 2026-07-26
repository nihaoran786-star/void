//! Desktop command boundary for read-only external CLI configuration discovery.

use void_core::service::external_config_sources::{
    discover_external_config_sources, ExternalConfigSourcesSnapshot,
};

#[tauri::command]
pub async fn discover_external_config_source_summaries(
) -> Result<ExternalConfigSourcesSnapshot, String> {
    tauri::async_runtime::spawn_blocking(discover_external_config_sources)
        .await
        .map_err(|_| "External configuration discovery could not be completed.".to_string())
}
