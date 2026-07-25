use super::contracts::{
    SubscriptionAuthError, SubscriptionAuthErrorCode, SubscriptionAuthResult,
    SubscriptionCredential, SubscriptionProvider,
};
use super::ports::{
    DeviceAuthorizationPoll, PendingAuthorization, SubscriptionOAuthProviderAdapter,
};
use async_trait::async_trait;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::Utc;
use reqwest::{Client, StatusCode, Url};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::time::Duration;
use uuid::Uuid;

const CODEX_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_ISSUER: &str = "https://auth.openai.com";
const CODEX_SCOPE: &str = "openid profile email offline_access";
const OPENCODE_SERVER: &str = "https://console.opencode.ai";
const OPENCODE_CLIENT_ID: &str = "opencode-cli";
const DEVICE_GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";

#[derive(Clone)]
pub struct ReqwestSubscriptionOAuthAdapter {
    client: Client,
}

impl ReqwestSubscriptionOAuthAdapter {
    pub fn new() -> SubscriptionAuthResult<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            // OAuth token requests must never be replayed to another origin.
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| {
                SubscriptionAuthError::new(
                    SubscriptionAuthErrorCode::Network,
                    "Failed to initialize the subscription OAuth HTTP client",
                    true,
                )
            })?;
        Ok(Self { client })
    }

    fn codex_browser_start(redirect_uri: &str) -> SubscriptionAuthResult<PendingAuthorization> {
        validate_loopback_redirect(redirect_uri)?;
        let code_verifier = random_urlsafe(48);
        let code_challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(code_verifier.as_bytes()));
        let state = random_urlsafe(32);
        let mut url = Url::parse(&format!("{CODEX_ISSUER}/oauth/authorize")).map_err(|_| {
            SubscriptionAuthError::new(
                SubscriptionAuthErrorCode::InvalidRequest,
                "Codex authorization endpoint is invalid",
                false,
            )
        })?;
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", CODEX_CLIENT_ID)
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("scope", CODEX_SCOPE)
            .append_pair("code_challenge", &code_challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("id_token_add_organizations", "true")
            .append_pair("codex_cli_simplified_flow", "true")
            .append_pair("state", &state)
            .append_pair("originator", "void");
        Ok(PendingAuthorization::Browser {
            authorization_url: url.into(),
            redirect_uri: redirect_uri.to_string(),
            state,
            code_verifier,
        })
    }

    async fn start_opencode(&self) -> SubscriptionAuthResult<PendingAuthorization> {
        let response = self
            .client
            .post(format!("{OPENCODE_SERVER}/auth/device/code"))
            .json(&serde_json::json!({ "client_id": OPENCODE_CLIENT_ID }))
            .send()
            .await
            .map_err(network_error)?;
        ensure_success(response.status(), "OpenCode device authorization")?;
        let device = response
            .json::<OpenCodeDeviceResponse>()
            .await
            .map_err(|_| invalid_provider_response("OpenCode device authorization"))?;
        Ok(PendingAuthorization::Device {
            authorization_url: absolute_opencode_url(&device.verification_uri_complete)?,
            user_code: device.user_code,
            device_code: device.device_code,
            poll_interval_seconds: device.interval.unwrap_or(5).max(1),
        })
    }

    async fn exchange_codex(
        &self,
        pending: &PendingAuthorization,
        code: &str,
    ) -> SubscriptionAuthResult<SubscriptionCredential> {
        let PendingAuthorization::Browser {
            redirect_uri,
            code_verifier,
            ..
        } = pending
        else {
            return Err(invalid_flow(
                "Codex requires a browser authorization session",
            ));
        };
        if code.trim().is_empty() {
            return Err(invalid_flow("Codex callback did not contain a code"));
        }
        let response = self
            .client
            .post(format!("{CODEX_ISSUER}/oauth/token"))
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("redirect_uri", redirect_uri.as_str()),
                ("client_id", CODEX_CLIENT_ID),
                ("code_verifier", code_verifier.as_str()),
            ])
            .send()
            .await
            .map_err(network_error)?;
        ensure_success(response.status(), "Codex token exchange")?;
        let tokens = response
            .json::<OAuthTokenResponse>()
            .await
            .map_err(|_| invalid_provider_response("Codex token exchange"))?;
        credential_from_tokens(tokens, None)
    }

    async fn poll_opencode(
        &self,
        pending: &PendingAuthorization,
    ) -> SubscriptionAuthResult<DeviceAuthorizationPoll> {
        let PendingAuthorization::Device { device_code, .. } = pending else {
            return Err(invalid_flow(
                "OpenCode requires a device authorization session",
            ));
        };
        let response = self
            .client
            .post(format!("{OPENCODE_SERVER}/auth/device/token"))
            .json(&serde_json::json!({
                "grant_type": DEVICE_GRANT,
                "device_code": device_code,
                "client_id": OPENCODE_CLIENT_ID,
            }))
            .send()
            .await
            .map_err(network_error)?;
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|_| invalid_provider_response("OpenCode token polling"))?;
        if status.is_success() {
            let tokens = serde_json::from_str::<OAuthTokenResponse>(&body)
                .map_err(|_| invalid_provider_response("OpenCode token polling"))?;
            return credential_from_tokens(tokens, None).map(DeviceAuthorizationPoll::Authorized);
        }
        if let Ok(pending) = serde_json::from_str::<OAuthPendingResponse>(&body) {
            if matches!(pending.error.as_str(), "authorization_pending") {
                return Ok(DeviceAuthorizationPoll::Pending);
            }
            if pending.error == "slow_down" {
                return Ok(DeviceAuthorizationPoll::SlowDown);
            }
        }
        ensure_success(status, "OpenCode token polling")?;
        Err(invalid_provider_response("OpenCode token polling"))
    }

    async fn refresh_token(
        &self,
        provider: SubscriptionProvider,
        current: &SubscriptionCredential,
    ) -> SubscriptionAuthResult<SubscriptionCredential> {
        let refresh_token = current.refresh_token().ok_or_else(|| {
            SubscriptionAuthError::new(
                SubscriptionAuthErrorCode::RefreshUnavailable,
                "The subscription credential does not contain a refresh token",
                false,
            )
        })?;
        let (url, json_body) = match provider {
            SubscriptionProvider::Codex => (format!("{CODEX_ISSUER}/oauth/token"), None),
            SubscriptionProvider::Opencode => (
                format!("{OPENCODE_SERVER}/auth/device/token"),
                Some(serde_json::json!({
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": OPENCODE_CLIENT_ID,
                })),
            ),
        };
        let request = self.client.post(url);
        let request = match provider {
            SubscriptionProvider::Codex => request.form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
                ("client_id", CODEX_CLIENT_ID),
            ]),
            SubscriptionProvider::Opencode => request.json(&json_body.expect("OpenCode body")),
        };
        let response = request.send().await.map_err(network_error)?;
        ensure_success(response.status(), "Subscription token refresh")?;
        let tokens = response
            .json::<OAuthTokenResponse>()
            .await
            .map_err(|_| invalid_provider_response("Subscription token refresh"))?;
        let account_id = account_id_from_tokens(&tokens)
            .or_else(|| current.account_id().map(ToString::to_string));
        current
            .with_refreshed_tokens(
                tokens.access_token,
                tokens.refresh_token,
                expiry_from(tokens.expires_in),
            )
            .map(|credential| credential.with_account_id(account_id))
    }
}

#[async_trait]
impl SubscriptionOAuthProviderAdapter for ReqwestSubscriptionOAuthAdapter {
    async fn start(
        &self,
        provider: SubscriptionProvider,
        redirect_uri: Option<&str>,
    ) -> SubscriptionAuthResult<PendingAuthorization> {
        match provider {
            SubscriptionProvider::Codex => {
                let redirect_uri = redirect_uri.ok_or_else(|| {
                    invalid_flow("Codex requires a desktop-owned loopback redirect URI")
                })?;
                Self::codex_browser_start(redirect_uri)
            }
            SubscriptionProvider::Opencode => self.start_opencode().await,
        }
    }

    async fn exchange_browser_code(
        &self,
        provider: SubscriptionProvider,
        pending: &PendingAuthorization,
        code: &str,
    ) -> SubscriptionAuthResult<SubscriptionCredential> {
        match provider {
            SubscriptionProvider::Codex => self.exchange_codex(pending, code).await,
            SubscriptionProvider::Opencode => Err(invalid_flow(
                "OpenCode device authorization does not accept a browser callback",
            )),
        }
    }

    async fn poll_device(
        &self,
        provider: SubscriptionProvider,
        pending: &PendingAuthorization,
    ) -> SubscriptionAuthResult<DeviceAuthorizationPoll> {
        match provider {
            SubscriptionProvider::Codex => Err(invalid_flow(
                "Codex browser authorization does not use device polling",
            )),
            SubscriptionProvider::Opencode => self.poll_opencode(pending).await,
        }
    }

    async fn refresh(
        &self,
        provider: SubscriptionProvider,
        current: &SubscriptionCredential,
    ) -> SubscriptionAuthResult<SubscriptionCredential> {
        self.refresh_token(provider, current).await
    }
}

#[derive(Deserialize)]
struct OpenCodeDeviceResponse {
    device_code: String,
    user_code: String,
    verification_uri_complete: String,
    #[serde(default)]
    interval: Option<u64>,
}

#[derive(Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
    #[serde(default)]
    id_token: Option<String>,
}

#[derive(Deserialize)]
struct OAuthPendingResponse {
    error: String,
}

fn credential_from_tokens(
    tokens: OAuthTokenResponse,
    account_hint: Option<String>,
) -> SubscriptionAuthResult<SubscriptionCredential> {
    let account_id = account_id_from_tokens(&tokens);
    SubscriptionCredential::new(
        tokens.access_token,
        tokens.refresh_token,
        expiry_from(tokens.expires_in),
        account_hint,
    )
    .map(|credential| credential.with_account_id(account_id))
}

const MAX_JWT_BYTES: usize = 32 * 1024;
const MAX_JWT_PAYLOAD_BYTES: usize = 16 * 1024;
const MAX_ACCOUNT_ID_BYTES: usize = 256;

fn account_id_from_tokens(tokens: &OAuthTokenResponse) -> Option<String> {
    tokens
        .id_token
        .as_deref()
        .and_then(account_id_from_jwt)
        .or_else(|| account_id_from_jwt(&tokens.access_token))
}

fn account_id_from_jwt(token: &str) -> Option<String> {
    if token.is_empty() || token.len() > MAX_JWT_BYTES {
        return None;
    }
    let mut segments = token.split('.');
    let header = segments.next()?;
    let payload = segments.next()?;
    let signature = segments.next()?;
    if header.is_empty() || payload.is_empty() || signature.is_empty() || segments.next().is_some()
    {
        return None;
    }
    let decoded = URL_SAFE_NO_PAD.decode(payload).ok()?;
    if decoded.len() > MAX_JWT_PAYLOAD_BYTES {
        return None;
    }
    let claims = serde_json::from_slice::<serde_json::Value>(&decoded).ok()?;
    let account_id = [
        claims.get("chatgpt_account_id"),
        claims.get("account_id"),
        claims
            .get("https://api.openai.com/auth")
            .and_then(|auth| auth.get("chatgpt_account_id")),
    ]
    .into_iter()
    .flatten()
    .find_map(|value| value.as_str().and_then(validate_account_id));
    account_id
}

fn validate_account_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()
        && trimmed.len() <= MAX_ACCOUNT_ID_BYTES
        && trimmed
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.')))
    .then(|| trimmed.to_string())
}

fn expiry_from(expires_in: Option<i64>) -> Option<i64> {
    expires_in.map(|seconds| Utc::now().timestamp() + seconds)
}

fn random_urlsafe(bytes: usize) -> String {
    let mut value = Vec::with_capacity(bytes);
    while value.len() < bytes {
        value.extend_from_slice(Uuid::new_v4().as_bytes());
    }
    value.truncate(bytes);
    URL_SAFE_NO_PAD.encode(value)
}

fn validate_loopback_redirect(redirect_uri: &str) -> SubscriptionAuthResult<()> {
    let url = Url::parse(redirect_uri)
        .map_err(|_| invalid_flow("Codex redirect URI must be a valid loopback URL"))?;
    let allowed = url.scheme() == "http"
        && url.host_str() == Some("localhost")
        && matches!(url.port(), Some(1455 | 1457))
        && url.path() == "/auth/callback"
        && url.query().is_none()
        && url.fragment().is_none();
    if !allowed {
        return Err(invalid_flow(
            "Codex redirect URI must be http://localhost:1455/auth/callback or the registered 1457 fallback",
        ));
    }
    Ok(())
}

fn absolute_opencode_url(value: &str) -> SubscriptionAuthResult<String> {
    let absolute = if value.starts_with("http://") || value.starts_with("https://") {
        value.to_string()
    } else {
        format!("{OPENCODE_SERVER}/{}", value.trim_start_matches('/'))
    };
    Url::parse(&absolute)
        .ok()
        .filter(|url| {
            url.scheme() == "https"
                && url.host_str() == Some("console.opencode.ai")
                && url.username().is_empty()
                && url.password().is_none()
        })
        .map(Into::into)
        .ok_or_else(|| {
            SubscriptionAuthError::new(
                SubscriptionAuthErrorCode::ProviderRejected,
                "OpenCode returned an untrusted verification URL",
                false,
            )
        })
}

fn ensure_success(status: StatusCode, operation: &str) -> SubscriptionAuthResult<()> {
    if status.is_success() {
        Ok(())
    } else {
        Err(SubscriptionAuthError::new(
            SubscriptionAuthErrorCode::ProviderRejected,
            format!("{operation} was rejected with HTTP {}", status.as_u16()),
            status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS,
        ))
    }
}

fn network_error(_error: reqwest::Error) -> SubscriptionAuthError {
    SubscriptionAuthError::new(
        SubscriptionAuthErrorCode::Network,
        "Subscription OAuth network request failed",
        true,
    )
}

fn invalid_provider_response(operation: &str) -> SubscriptionAuthError {
    SubscriptionAuthError::new(
        SubscriptionAuthErrorCode::ProviderRejected,
        format!("{operation} returned an invalid response"),
        false,
    )
}

fn invalid_flow(message: &str) -> SubscriptionAuthError {
    SubscriptionAuthError::new(SubscriptionAuthErrorCode::InvalidRequest, message, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jwt(payload: serde_json::Value) -> String {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"none"}"#);
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
        format!("{header}.{payload}.signature")
    }

    #[test]
    fn codex_start_uses_s256_pkce_and_redacts_secrets() {
        let pending = ReqwestSubscriptionOAuthAdapter::codex_browser_start(
            "http://localhost:1455/auth/callback",
        )
        .expect("valid loopback redirect");
        let PendingAuthorization::Browser {
            state,
            code_verifier,
            ..
        } = &pending
        else {
            panic!("expected browser flow");
        };
        let debug = format!("{pending:?}");
        assert!(pending
            .authorization_url()
            .contains("code_challenge_method=S256"));
        assert!(pending.authorization_url().contains("state="));
        assert!(!debug.contains(state));
        assert!(!debug.contains(code_verifier));
        assert!(debug.contains("[REDACTED]"));
    }

    #[test]
    fn codex_start_rejects_non_loopback_redirects() {
        let error = ReqwestSubscriptionOAuthAdapter::codex_browser_start(
            "https://example.com/oauth/callback",
        )
        .expect_err("remote redirect must be rejected");
        assert_eq!(error.code, SubscriptionAuthErrorCode::InvalidRequest);
    }

    #[test]
    fn opencode_verification_url_rejects_untrusted_origins() {
        assert_eq!(
            absolute_opencode_url("https://evil.example/device")
                .unwrap_err()
                .code,
            SubscriptionAuthErrorCode::ProviderRejected
        );
        assert_eq!(
            absolute_opencode_url("/device?user_code=ABCD").unwrap(),
            "https://console.opencode.ai/device?user_code=ABCD"
        );
    }

    #[test]
    fn credential_debug_never_contains_tokens() {
        let credential = SubscriptionCredential::new(
            "access-secret".to_string(),
            Some("refresh-secret".to_string()),
            None,
            None,
        )
        .unwrap();
        let debug = format!("{credential:?}");
        assert!(!debug.contains("access-secret"));
        assert!(!debug.contains("refresh-secret"));
    }

    #[test]
    fn extracts_only_bounded_official_account_id_claims() {
        let nested = jwt(serde_json::json!({
            "https://api.openai.com/auth": {
                "chatgpt_account_id": "acct_nested-123"
            }
        }));
        assert_eq!(
            account_id_from_jwt(&nested).as_deref(),
            Some("acct_nested-123")
        );
        let direct = jwt(serde_json::json!({ "account_id": "acct.direct" }));
        assert_eq!(account_id_from_jwt(&direct).as_deref(), Some("acct.direct"));
        let unrelated = jwt(serde_json::json!({ "organization_id": "org_ignored" }));
        assert_eq!(account_id_from_jwt(&unrelated), None);
        let unsafe_value = jwt(serde_json::json!({ "chatgpt_account_id": "acct/unsafe" }));
        assert_eq!(account_id_from_jwt(&unsafe_value), None);
    }

    #[test]
    fn malformed_or_oversized_jwt_payload_is_ignored_without_exposing_token() {
        assert_eq!(account_id_from_jwt("not-a-jwt"), None);
        let oversized = format!(
            "header.{}.signature",
            URL_SAFE_NO_PAD.encode(vec![b'a'; MAX_JWT_PAYLOAD_BYTES + 1])
        );
        assert_eq!(account_id_from_jwt(&oversized), None);
        let token = jwt(serde_json::json!({ "chatgpt_account_id": "acct_secret" }));
        let credential = credential_from_tokens(
            OAuthTokenResponse {
                access_token: token.clone(),
                refresh_token: Some("refresh-secret".to_string()),
                expires_in: Some(3_600),
                id_token: None,
            },
            None,
        )
        .unwrap();
        assert_eq!(credential.account_id(), Some("acct_secret"));
        assert!(!format!("{credential:?}").contains(&token));
    }
}
