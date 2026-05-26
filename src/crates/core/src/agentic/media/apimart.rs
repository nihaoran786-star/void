use crate::agentic::media::capabilities::APIMART_BASE_URL;
use crate::service::config::{get_global_config_service, MediaProviderConfig};
use crate::util::errors::{VoidError, VoidResult};
use reqwest::multipart;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct ApimartClient {
    http: reqwest::Client,
    base_url: String,
    token: String,
}

impl ApimartClient {
    pub async fn from_config() -> VoidResult<Self> {
        let config_service = get_global_config_service().await?;
        let media = config_service
            .get_config::<MediaProviderConfig>(Some("ai.media"))
            .await
            .unwrap_or_default();
        Self::new(media.apimart_token)
    }

    pub fn new(token: String) -> VoidResult<Self> {
        let token = token.trim().to_string();
        if token.is_empty() {
            return Err(VoidError::config("media_provider_not_configured"));
        }

        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|error| {
                VoidError::tool(format!("Failed to create APIMart client: {error}"))
            })?;

        Ok(Self {
            http,
            base_url: APIMART_BASE_URL.to_string(),
            token,
        })
    }

    pub async fn submit_image_generation(&self, payload: Value) -> VoidResult<Value> {
        self.post_json("/v1/images/generations", payload).await
    }

    pub async fn submit_video_generation(&self, payload: Value) -> VoidResult<Value> {
        self.post_json("/v1/videos/generations", payload).await
    }

    pub async fn get_task_status(
        &self,
        task_id: &str,
        language: Option<&str>,
    ) -> VoidResult<Value> {
        let mut url = format!("{}/v1/tasks/{}", self.base_url, task_id);
        if let Some(language) = language.filter(|value| !value.trim().is_empty()) {
            url.push_str("?language=");
            url.push_str(language);
        }

        let response = self
            .http
            .get(url)
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|error| {
                VoidError::http(format!("APIMart task status request failed: {error}"))
            })?;
        read_json_response(response).await
    }

    pub async fn upload_image(&self, path: &Path) -> VoidResult<Value> {
        let bytes = tokio::fs::read(path)
            .await
            .map_err(|error| VoidError::io(format!("Failed to read upload image: {error}")))?;
        let filename = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("image")
            .to_string();

        let part = multipart::Part::bytes(bytes).file_name(filename);
        let form = multipart::Form::new().part("file", part);
        let response = self
            .http
            .post(format!("{}/v1/uploads/images", self.base_url))
            .bearer_auth(&self.token)
            .multipart(form)
            .send()
            .await
            .map_err(|error| {
                VoidError::http(format!("APIMart upload image request failed: {error}"))
            })?;
        read_json_response(response).await
    }

    pub async fn generate_speech(&self, payload: Value) -> VoidResult<Vec<u8>> {
        let response = self
            .http
            .post(format!("{}/v1/audio/speech", self.base_url))
            .bearer_auth(&self.token)
            .json(&payload)
            .send()
            .await
            .map_err(|error| VoidError::http(format!("APIMart speech request failed: {error}")))?;
        let status = response.status();
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        let bytes = response.bytes().await.map_err(|error| {
            VoidError::http(format!("Failed to read APIMart speech response: {error}"))
        })?;
        if !status.is_success() {
            let body = String::from_utf8_lossy(&bytes);
            return Err(VoidError::http(format!(
                "APIMart speech error {status} ({content_type}): {body}"
            )));
        }
        Ok(bytes.to_vec())
    }

    pub async fn transcribe_audio(
        &self,
        path: &Path,
        mut fields: Vec<(&'static str, String)>,
    ) -> VoidResult<Value> {
        let bytes = tokio::fs::read(path).await.map_err(|error| {
            VoidError::io(format!("Failed to read transcription audio: {error}"))
        })?;
        let filename = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("audio")
            .to_string();

        let mut form =
            multipart::Form::new().part("file", multipart::Part::bytes(bytes).file_name(filename));
        for (key, value) in fields.drain(..) {
            form = form.text(key, value);
        }
        let response = self
            .http
            .post(format!("{}/v1/audio/transcriptions", self.base_url))
            .bearer_auth(&self.token)
            .multipart(form)
            .send()
            .await
            .map_err(|error| {
                VoidError::http(format!("APIMart transcription request failed: {error}"))
            })?;
        read_json_or_text_response(response).await
    }

    async fn post_json(&self, path: &str, payload: Value) -> VoidResult<Value> {
        let response = self
            .http
            .post(format!("{}{}", self.base_url, path))
            .bearer_auth(&self.token)
            .json(&payload)
            .send()
            .await
            .map_err(|error| VoidError::http(format!("APIMart request failed: {error}")))?;
        read_json_response(response).await
    }
}

pub fn resolve_workspace_path(
    workspace_root: Option<&Path>,
    input_path: &str,
) -> VoidResult<PathBuf> {
    let path = PathBuf::from(input_path);
    if path.is_absolute() {
        return Ok(path);
    }

    let root = workspace_root.ok_or_else(|| {
        VoidError::validation("relative media file paths require a workspace root")
    })?;
    Ok(root.join(path))
}

pub fn provider_not_configured_result(tool_name: &str) -> Value {
    json!({
        "status": "error",
        "source": "apimart",
        "tool": tool_name,
        "error": {
            "code": "provider_not_configured",
            "message": "APIMart media token is not configured in Settings > Providers."
        }
    })
}

async fn read_json_response(response: reqwest::Response) -> VoidResult<Value> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| VoidError::http(format!("Failed to read APIMart response: {error}")))?;
    if !status.is_success() {
        return Err(VoidError::http(format!("APIMart error {status}: {body}")));
    }
    serde_json::from_str(&body)
        .map_err(|error| VoidError::parse(format!("APIMart returned invalid JSON: {error}")))
}

async fn read_json_or_text_response(response: reqwest::Response) -> VoidResult<Value> {
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response
        .text()
        .await
        .map_err(|error| VoidError::http(format!("Failed to read APIMart response: {error}")))?;
    if !status.is_success() {
        return Err(VoidError::http(format!("APIMart error {status}: {body}")));
    }
    if content_type.contains("application/json") {
        serde_json::from_str(&body)
            .map_err(|error| VoidError::parse(format!("APIMart returned invalid JSON: {error}")))
    } else {
        Ok(json!({ "text": body }))
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_workspace_path;
    use std::path::Path;

    #[test]
    fn resolves_relative_media_paths_under_workspace() {
        let path = resolve_workspace_path(Some(Path::new("C:/repo")), "assets/a.png").unwrap();
        assert_eq!(path, Path::new("C:/repo").join("assets/a.png"));
    }
}
