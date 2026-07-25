use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionProvider {
    Codex,
    Opencode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionAuthStatus {
    Pending,
    Authorized,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionAuthErrorCode {
    InvalidRequest,
    InvalidState,
    SessionNotFound,
    ProviderRejected,
    Network,
    RefreshUnavailable,
    CredentialStoreUnsupported,
    CredentialStoreFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionAuthError {
    pub code: SubscriptionAuthErrorCode,
    pub message: String,
    pub retryable: bool,
}

impl SubscriptionAuthError {
    pub fn new(
        code: SubscriptionAuthErrorCode,
        message: impl Into<String>,
        retryable: bool,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
        }
    }
}

impl fmt::Display for SubscriptionAuthError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for SubscriptionAuthError {}

pub type SubscriptionAuthResult<T> = Result<T, SubscriptionAuthError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSubscriptionAuthRequest {
    pub provider: SubscriptionProvider,
    /// Codex requires a loopback callback URI owned by the desktop shell.
    /// OpenCode uses a device flow and ignores this field.
    pub redirect_uri: Option<String>,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionAuthSession {
    pub session_id: String,
    pub provider: SubscriptionProvider,
    pub status: SubscriptionAuthStatus,
    pub authorization_url: Option<String>,
    pub user_code: Option<String>,
    pub error: Option<SubscriptionAuthError>,
}

impl fmt::Debug for SubscriptionAuthSession {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SubscriptionAuthSession")
            .field("session_id", &self.session_id)
            .field("provider", &self.provider)
            .field("status", &self.status)
            .field(
                "authorization_url",
                &self.authorization_url.as_ref().map(|_| "[REDACTED]"),
            )
            .field("user_code", &self.user_code)
            .field("error", &self.error)
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionAccount {
    pub provider: SubscriptionProvider,
    pub account_hint: Option<String>,
    pub expires_at: Option<i64>,
}

/// Secret-bearing value exchanged only between the provider and credential
/// store adapters. It is deliberately non-serializable and redacted in Debug.
#[derive(Clone, PartialEq, Eq)]
pub struct SubscriptionCredential {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: Option<i64>,
    account_hint: Option<String>,
}

impl SubscriptionCredential {
    pub fn new(
        access_token: String,
        refresh_token: Option<String>,
        expires_at: Option<i64>,
        account_hint: Option<String>,
    ) -> SubscriptionAuthResult<Self> {
        if access_token.trim().is_empty() {
            return Err(SubscriptionAuthError::new(
                SubscriptionAuthErrorCode::ProviderRejected,
                "OAuth response did not contain an access token",
                false,
            ));
        }
        Ok(Self {
            access_token,
            refresh_token,
            expires_at,
            account_hint,
        })
    }

    pub(crate) fn refresh_token(&self) -> Option<&str> {
        self.refresh_token.as_deref()
    }

    pub(crate) fn access_token(&self) -> &str {
        &self.access_token
    }

    pub(crate) fn expires_at(&self) -> Option<i64> {
        self.expires_at
    }

    pub(crate) fn account_hint(&self) -> Option<&str> {
        self.account_hint.as_deref()
    }

    pub fn account(&self, provider: SubscriptionProvider) -> SubscriptionAccount {
        SubscriptionAccount {
            provider,
            account_hint: self.account_hint.clone(),
            expires_at: self.expires_at,
        }
    }

    pub(crate) fn with_refreshed_tokens(
        &self,
        access_token: String,
        refresh_token: Option<String>,
        expires_at: Option<i64>,
    ) -> SubscriptionAuthResult<Self> {
        Self::new(
            access_token,
            refresh_token.or_else(|| self.refresh_token.clone()),
            expires_at,
            self.account_hint.clone(),
        )
    }
}

impl fmt::Debug for SubscriptionCredential {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SubscriptionCredential")
            .field("access_token", &"[REDACTED]")
            .field(
                "refresh_token",
                &self.refresh_token.as_ref().map(|_| "[REDACTED]"),
            )
            .field("expires_at", &self.expires_at)
            .field("account_hint", &self.account_hint)
            .finish()
    }
}
