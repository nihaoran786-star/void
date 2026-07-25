//! Backend contracts and adapters for Codex/OpenCode subscription OAuth.
//!
//! Desktop callback registration and Web UI exposure are intentionally outside
//! this module. Production credential persistence remains feature-gated until
//! an OS credential vault adapter is assembled.

mod contracts;
mod credential_store_adapter;
mod ports;
mod provider_adapter;
mod service;

pub use contracts::{
    StartSubscriptionAuthRequest, SubscriptionAccount, SubscriptionAccountStatus,
    SubscriptionAuthError, SubscriptionAuthErrorCode, SubscriptionAuthResult,
    SubscriptionAuthSession, SubscriptionAuthStatus, SubscriptionCredential, SubscriptionProvider,
};
pub use credential_store_adapter::{
    NativeSubscriptionCredentialStore, UnsupportedSubscriptionCredentialStore,
};
pub use ports::{
    DeviceAuthorizationPoll, PendingAuthorization, SubscriptionCredentialStoreAdapter,
    SubscriptionOAuthProviderAdapter,
};
pub use provider_adapter::ReqwestSubscriptionOAuthAdapter;
pub use service::SubscriptionAuthService;
