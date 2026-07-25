use super::contracts::{
    SubscriptionAccount, SubscriptionAuthError, SubscriptionAuthErrorCode, SubscriptionAuthResult,
    SubscriptionCredential, SubscriptionProvider,
};
use super::ports::SubscriptionCredentialStoreAdapter;
use async_trait::async_trait;

/// Explicit production gate until the desktop assembly supplies an
/// OS-credential-vault-backed implementation.
///
/// Void's current encrypted OAuth vault is intentionally MCP-specific and
/// stores `rmcp::StoredCredentials`. Reinterpreting its fields for subscription
/// tokens would create an unsafe and incompatible persistence contract.
#[derive(Debug, Default)]
pub struct UnsupportedSubscriptionCredentialStore;

impl UnsupportedSubscriptionCredentialStore {
    fn unsupported<T>() -> SubscriptionAuthResult<T> {
        Err(SubscriptionAuthError::new(
            SubscriptionAuthErrorCode::CredentialStoreUnsupported,
            "Subscription OAuth requires an OS credential vault adapter; secure storage is not wired",
            false,
        ))
    }
}

#[async_trait]
impl SubscriptionCredentialStoreAdapter for UnsupportedSubscriptionCredentialStore {
    async fn ensure_available(&self) -> SubscriptionAuthResult<()> {
        Self::unsupported()
    }

    async fn load(
        &self,
        _provider: SubscriptionProvider,
    ) -> SubscriptionAuthResult<Option<SubscriptionCredential>> {
        Self::unsupported()
    }

    async fn save(
        &self,
        _provider: SubscriptionProvider,
        _credential: SubscriptionCredential,
    ) -> SubscriptionAuthResult<()> {
        Self::unsupported()
    }

    async fn delete(&self, _provider: SubscriptionProvider) -> SubscriptionAuthResult<()> {
        Self::unsupported()
    }

    async fn list(&self) -> SubscriptionAuthResult<Vec<SubscriptionAccount>> {
        Self::unsupported()
    }
}
