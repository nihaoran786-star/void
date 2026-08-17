use super::contracts::{
    SubscriptionAccount, SubscriptionAuthResult, SubscriptionCredential, SubscriptionProvider,
};
use async_trait::async_trait;
use std::fmt;

#[derive(Clone)]
pub enum PendingAuthorization {
    Browser {
        authorization_url: String,
        redirect_uri: String,
        state: String,
        code_verifier: String,
    },
    Device {
        authorization_url: String,
        user_code: String,
        device_code: String,
        poll_interval_seconds: u64,
    },
}

impl PendingAuthorization {
    pub fn authorization_url(&self) -> &str {
        match self {
            Self::Browser {
                authorization_url, ..
            }
            | Self::Device {
                authorization_url, ..
            } => authorization_url,
        }
    }

    pub fn user_code(&self) -> Option<&str> {
        match self {
            Self::Browser { .. } => None,
            Self::Device { user_code, .. } => Some(user_code),
        }
    }

    pub(crate) fn expected_state(&self) -> Option<&str> {
        match self {
            Self::Browser { state, .. } => Some(state),
            Self::Device { .. } => None,
        }
    }
}

impl fmt::Debug for PendingAuthorization {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Browser { redirect_uri, .. } => formatter
                .debug_struct("BrowserAuthorization")
                .field("authorization_url", &"[REDACTED]")
                .field("redirect_uri", redirect_uri)
                .field("state", &"[REDACTED]")
                .field("code_verifier", &"[REDACTED]")
                .finish(),
            Self::Device {
                authorization_url,
                user_code,
                ..
            } => formatter
                .debug_struct("DeviceAuthorization")
                .field("authorization_url", authorization_url)
                .field("user_code", user_code)
                .field("device_code", &"[REDACTED]")
                .finish(),
        }
    }
}

#[derive(Debug)]
pub enum DeviceAuthorizationPoll {
    Pending,
    SlowDown,
    Authorized(SubscriptionCredential),
}

#[async_trait]
pub trait SubscriptionOAuthProviderAdapter: Send + Sync {
    async fn start(
        &self,
        provider: SubscriptionProvider,
        redirect_uri: Option<&str>,
    ) -> SubscriptionAuthResult<PendingAuthorization>;

    async fn exchange_browser_code(
        &self,
        provider: SubscriptionProvider,
        pending: &PendingAuthorization,
        code: &str,
    ) -> SubscriptionAuthResult<SubscriptionCredential>;

    async fn poll_device(
        &self,
        provider: SubscriptionProvider,
        pending: &PendingAuthorization,
    ) -> SubscriptionAuthResult<DeviceAuthorizationPoll>;

    async fn refresh(
        &self,
        provider: SubscriptionProvider,
        current: &SubscriptionCredential,
    ) -> SubscriptionAuthResult<SubscriptionCredential>;
}

#[async_trait]
pub trait SubscriptionCredentialStoreAdapter: Send + Sync {
    /// Fails before an external authorization is started when secure
    /// persistence is not available.
    async fn ensure_available(&self) -> SubscriptionAuthResult<()>;

    async fn load(
        &self,
        provider: SubscriptionProvider,
    ) -> SubscriptionAuthResult<Option<SubscriptionCredential>>;

    async fn save(
        &self,
        provider: SubscriptionProvider,
        credential: SubscriptionCredential,
    ) -> SubscriptionAuthResult<()>;

    async fn delete(&self, provider: SubscriptionProvider) -> SubscriptionAuthResult<()>;

    async fn list(&self) -> SubscriptionAuthResult<Vec<SubscriptionAccount>>;
}
