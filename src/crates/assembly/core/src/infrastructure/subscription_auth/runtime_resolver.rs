use super::{
    NativeSubscriptionCredentialStore, ReqwestSubscriptionOAuthAdapter, SubscriptionAuthError,
    SubscriptionAuthErrorCode, SubscriptionAuthResult, SubscriptionCredential,
    SubscriptionCredentialStoreAdapter, SubscriptionOAuthProviderAdapter, SubscriptionProvider,
};
use chrono::Utc;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

const REFRESH_LEEWAY_SECONDS: i64 = 300;
const CODEX_BASE_URL: &str = "https://chatgpt.com/backend-api/codex";
const CODEX_REQUEST_URL: &str = "https://chatgpt.com/backend-api/codex/responses";
const OPENCODE_BASE_URL: &str = "https://opencode.ai/zen/v1";
const OPENCODE_REQUEST_URL: &str = "https://opencode.ai/zen/v1/chat/completions";

/// Secret-bearing runtime projection. It is intentionally non-serializable and
/// has no `Debug` implementation so access tokens cannot enter config or logs.
pub(crate) struct ResolvedSubscriptionAuth {
    pub(crate) api_key: String,
    pub(crate) base_url: String,
    pub(crate) request_url: String,
    pub(crate) format: String,
    pub(crate) extra_headers: HashMap<String, String>,
}

pub(crate) struct SubscriptionRuntimeResolver {
    store: Arc<dyn SubscriptionCredentialStoreAdapter>,
    provider: Arc<dyn SubscriptionOAuthProviderAdapter>,
}

impl SubscriptionRuntimeResolver {
    pub(crate) fn new(
        store: Arc<dyn SubscriptionCredentialStoreAdapter>,
        provider: Arc<dyn SubscriptionOAuthProviderAdapter>,
    ) -> Self {
        Self { store, provider }
    }

    pub(crate) async fn native() -> SubscriptionAuthResult<Self> {
        Ok(Self::new(
            Arc::new(NativeSubscriptionCredentialStore::new().await?),
            Arc::new(ReqwestSubscriptionOAuthAdapter::new()?),
        ))
    }

    pub(crate) async fn resolve(
        &self,
        provider: SubscriptionProvider,
    ) -> SubscriptionAuthResult<ResolvedSubscriptionAuth> {
        let mut credential = self.store.load(provider).await?.ok_or_else(|| {
            SubscriptionAuthError::new(
                SubscriptionAuthErrorCode::RefreshUnavailable,
                format!(
                    "{} subscription is not connected; connect it in Account settings",
                    provider_label(provider)
                ),
                false,
            )
        })?;

        let needs_codex_account_id =
            provider == SubscriptionProvider::Codex && credential.account_id().is_none();
        if credential
            .expires_at()
            .is_some_and(|expires_at| expires_at <= Utc::now().timestamp() + REFRESH_LEEWAY_SECONDS)
            || needs_codex_account_id
        {
            credential = self.provider.refresh(provider, &credential).await?;
            self.store.save(provider, credential.clone()).await?;
        }

        project_runtime_auth(provider, credential)
    }
}

pub(crate) async fn resolve_native_subscription_auth(
    provider: SubscriptionProvider,
) -> SubscriptionAuthResult<ResolvedSubscriptionAuth> {
    SubscriptionRuntimeResolver::native()
        .await?
        .resolve(provider)
        .await
}

fn provider_label(provider: SubscriptionProvider) -> &'static str {
    match provider {
        SubscriptionProvider::Codex => "Codex",
        SubscriptionProvider::Opencode => "OpenCode",
    }
}

fn project_runtime_auth(
    provider: SubscriptionProvider,
    credential: SubscriptionCredential,
) -> SubscriptionAuthResult<ResolvedSubscriptionAuth> {
    match provider {
        SubscriptionProvider::Codex => {
            let mut extra_headers = HashMap::new();
            let account_id = credential.account_id().ok_or_else(|| {
                SubscriptionAuthError::new(
                    SubscriptionAuthErrorCode::RefreshUnavailable,
                    "Codex subscription account identifier is unavailable; reconnect the account",
                    false,
                )
            })?;
            extra_headers.insert("ChatGPT-Account-ID".to_string(), account_id.to_string());
            extra_headers.insert("originator".to_string(), "codex_cli_rs".to_string());
            extra_headers.insert(
                "OpenAI-Beta".to_string(),
                "responses=experimental".to_string(),
            );
            extra_headers.insert("session_id".to_string(), Uuid::new_v4().to_string());
            extra_headers.insert("User-Agent".to_string(), "codex_cli_rs/0.0.0".to_string());
            Ok(ResolvedSubscriptionAuth {
                api_key: credential.access_token().to_string(),
                base_url: CODEX_BASE_URL.to_string(),
                request_url: CODEX_REQUEST_URL.to_string(),
                format: "responses".to_string(),
                extra_headers,
            })
        }
        SubscriptionProvider::Opencode => Ok(ResolvedSubscriptionAuth {
            api_key: credential.access_token().to_string(),
            base_url: OPENCODE_BASE_URL.to_string(),
            request_url: OPENCODE_REQUEST_URL.to_string(),
            format: "openai".to_string(),
            extra_headers: HashMap::new(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::subscription_auth::{
        DeviceAuthorizationPoll, PendingAuthorization, SubscriptionAccount,
    };
    use async_trait::async_trait;
    use std::sync::Mutex;

    struct MemoryStore {
        credential: Mutex<Option<SubscriptionCredential>>,
        saved: Mutex<Vec<SubscriptionCredential>>,
    }

    impl MemoryStore {
        fn with_credential(credential: Option<SubscriptionCredential>) -> Self {
            Self {
                credential: Mutex::new(credential),
                saved: Mutex::new(Vec::new()),
            }
        }
    }

    #[async_trait]
    impl SubscriptionCredentialStoreAdapter for MemoryStore {
        async fn ensure_available(&self) -> SubscriptionAuthResult<()> {
            Ok(())
        }

        async fn load(
            &self,
            _provider: SubscriptionProvider,
        ) -> SubscriptionAuthResult<Option<SubscriptionCredential>> {
            Ok(self.credential.lock().unwrap().clone())
        }

        async fn save(
            &self,
            _provider: SubscriptionProvider,
            credential: SubscriptionCredential,
        ) -> SubscriptionAuthResult<()> {
            self.saved.lock().unwrap().push(credential);
            Ok(())
        }

        async fn delete(&self, _provider: SubscriptionProvider) -> SubscriptionAuthResult<()> {
            Ok(())
        }

        async fn list(&self) -> SubscriptionAuthResult<Vec<SubscriptionAccount>> {
            Ok(Vec::new())
        }
    }

    struct RefreshProvider {
        refreshed: SubscriptionCredential,
        calls: Mutex<usize>,
    }

    #[async_trait]
    impl SubscriptionOAuthProviderAdapter for RefreshProvider {
        async fn start(
            &self,
            _provider: SubscriptionProvider,
            _redirect_uri: Option<&str>,
        ) -> SubscriptionAuthResult<PendingAuthorization> {
            unreachable!("not used by runtime resolution")
        }

        async fn exchange_browser_code(
            &self,
            _provider: SubscriptionProvider,
            _pending: &PendingAuthorization,
            _code: &str,
        ) -> SubscriptionAuthResult<SubscriptionCredential> {
            unreachable!("not used by runtime resolution")
        }

        async fn poll_device(
            &self,
            _provider: SubscriptionProvider,
            _pending: &PendingAuthorization,
        ) -> SubscriptionAuthResult<DeviceAuthorizationPoll> {
            unreachable!("not used by runtime resolution")
        }

        async fn refresh(
            &self,
            _provider: SubscriptionProvider,
            _current: &SubscriptionCredential,
        ) -> SubscriptionAuthResult<SubscriptionCredential> {
            *self.calls.lock().unwrap() += 1;
            Ok(self.refreshed.clone())
        }
    }

    fn credential(access: &str, expires_at: Option<i64>) -> SubscriptionCredential {
        SubscriptionCredential::new(
            access.to_string(),
            Some("refresh-secret".to_string()),
            expires_at,
            None,
        )
        .unwrap()
        .with_account_id(Some("acct_test".to_string()))
    }

    #[tokio::test]
    async fn fresh_codex_credential_projects_runtime_endpoint_without_refreshing() {
        let store = Arc::new(MemoryStore::with_credential(Some(credential(
            "access-secret",
            Some(Utc::now().timestamp() + 3_600),
        ))));
        let provider = Arc::new(RefreshProvider {
            refreshed: credential("unused", None),
            calls: Mutex::new(0),
        });
        let resolved = SubscriptionRuntimeResolver::new(store.clone(), provider.clone())
            .resolve(SubscriptionProvider::Codex)
            .await
            .unwrap();

        assert_eq!(resolved.api_key, "access-secret");
        assert_eq!(resolved.base_url, CODEX_BASE_URL);
        assert_eq!(resolved.request_url, CODEX_REQUEST_URL);
        assert_eq!(resolved.format, "responses");
        assert_eq!(resolved.extra_headers["originator"], "codex_cli_rs");
        assert_eq!(resolved.extra_headers["ChatGPT-Account-ID"], "acct_test");
        assert_eq!(*provider.calls.lock().unwrap(), 0);
        assert!(store.saved.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn expiring_credential_is_refreshed_saved_and_used_for_opencode() {
        let store = Arc::new(MemoryStore::with_credential(Some(credential(
            "stale-secret",
            Some(Utc::now().timestamp() + 10),
        ))));
        let provider = Arc::new(RefreshProvider {
            refreshed: credential("fresh-secret", Some(Utc::now().timestamp() + 7_200)),
            calls: Mutex::new(0),
        });
        let resolved = SubscriptionRuntimeResolver::new(store.clone(), provider.clone())
            .resolve(SubscriptionProvider::Opencode)
            .await
            .unwrap();

        assert_eq!(resolved.api_key, "fresh-secret");
        assert_eq!(resolved.base_url, OPENCODE_BASE_URL);
        assert_eq!(resolved.request_url, OPENCODE_REQUEST_URL);
        assert_eq!(resolved.format, "openai");
        assert_eq!(*provider.calls.lock().unwrap(), 1);
        assert_eq!(store.saved.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn legacy_codex_credential_without_account_id_is_refreshed_and_saved() {
        let legacy = SubscriptionCredential::new(
            "legacy-access".to_string(),
            Some("refresh-secret".to_string()),
            Some(Utc::now().timestamp() + 3_600),
            None,
        )
        .unwrap();
        let store = Arc::new(MemoryStore::with_credential(Some(legacy)));
        let provider = Arc::new(RefreshProvider {
            refreshed: credential("fresh-access", Some(Utc::now().timestamp() + 7_200)),
            calls: Mutex::new(0),
        });

        let resolved = SubscriptionRuntimeResolver::new(store.clone(), provider.clone())
            .resolve(SubscriptionProvider::Codex)
            .await
            .unwrap();

        assert_eq!(resolved.api_key, "fresh-access");
        assert_eq!(resolved.extra_headers["ChatGPT-Account-ID"], "acct_test");
        assert_eq!(*provider.calls.lock().unwrap(), 1);
        assert_eq!(store.saved.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn codex_without_account_id_after_refresh_fails_before_transport() {
        let missing_id = SubscriptionCredential::new(
            "access".to_string(),
            Some("refresh-secret".to_string()),
            Some(Utc::now().timestamp() + 3_600),
            None,
        )
        .unwrap();
        let store = Arc::new(MemoryStore::with_credential(Some(missing_id.clone())));
        let provider = Arc::new(RefreshProvider {
            refreshed: missing_id,
            calls: Mutex::new(0),
        });

        let error = SubscriptionRuntimeResolver::new(store, provider)
            .resolve(SubscriptionProvider::Codex)
            .await
            .err()
            .expect("missing account id must fail before transport");

        assert_eq!(error.code, SubscriptionAuthErrorCode::RefreshUnavailable);
        assert!(error.message.contains("reconnect"));
    }

    #[tokio::test]
    async fn missing_credential_returns_typed_account_guidance() {
        let store = Arc::new(MemoryStore::with_credential(None));
        let provider = Arc::new(RefreshProvider {
            refreshed: credential("unused", None),
            calls: Mutex::new(0),
        });
        let error = SubscriptionRuntimeResolver::new(store, provider)
            .resolve(SubscriptionProvider::Codex)
            .await
            .err()
            .expect("missing credential should fail");

        assert_eq!(error.code, SubscriptionAuthErrorCode::RefreshUnavailable);
        assert!(error.message.contains("Account settings"));
    }
}
