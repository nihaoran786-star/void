use super::contracts::{
    StartSubscriptionAuthRequest, SubscriptionAccount, SubscriptionAuthError,
    SubscriptionAuthErrorCode, SubscriptionAuthResult, SubscriptionAuthSession,
    SubscriptionAuthStatus, SubscriptionProvider,
};
use super::ports::{
    DeviceAuthorizationPoll, PendingAuthorization, SubscriptionCredentialStoreAdapter,
    SubscriptionOAuthProviderAdapter,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

struct SessionRecord {
    snapshot: SubscriptionAuthSession,
    pending: Option<PendingAuthorization>,
    generation: u64,
}

/// Application-level subscription authentication orchestration.
///
/// It owns only transient login sessions. Provider I/O and durable credential
/// storage remain behind explicit adapters.
pub struct SubscriptionAuthService {
    provider: Arc<dyn SubscriptionOAuthProviderAdapter>,
    store: Arc<dyn SubscriptionCredentialStoreAdapter>,
    sessions: Mutex<HashMap<String, SessionRecord>>,
    commit_lock: Mutex<()>,
    next_generation: AtomicU64,
}

impl SubscriptionAuthService {
    pub fn new(
        provider: Arc<dyn SubscriptionOAuthProviderAdapter>,
        store: Arc<dyn SubscriptionCredentialStoreAdapter>,
    ) -> Self {
        Self {
            provider,
            store,
            sessions: Mutex::new(HashMap::new()),
            commit_lock: Mutex::new(()),
            next_generation: AtomicU64::new(1),
        }
    }

    pub async fn start(
        &self,
        request: StartSubscriptionAuthRequest,
    ) -> SubscriptionAuthResult<SubscriptionAuthSession> {
        self.store.ensure_available().await?;
        let pending = self
            .provider
            .start(request.provider, request.redirect_uri.as_deref())
            .await?;
        let session_id = Uuid::new_v4().to_string();
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        let snapshot = SubscriptionAuthSession {
            session_id: session_id.clone(),
            provider: request.provider,
            status: SubscriptionAuthStatus::Pending,
            authorization_url: Some(pending.authorization_url().to_string()),
            user_code: pending.user_code().map(ToString::to_string),
            error: None,
        };
        self.sessions.lock().await.insert(
            session_id,
            SessionRecord {
                snapshot: snapshot.clone(),
                pending: Some(pending),
                generation,
            },
        );
        Ok(snapshot)
    }

    /// Returns current state and advances OpenCode device authorization by one
    /// poll. Codex remains pending until the desktop callback calls
    /// `complete_browser`.
    pub async fn status(
        &self,
        session_id: &str,
    ) -> SubscriptionAuthResult<SubscriptionAuthSession> {
        let (provider, pending, current, generation) = {
            let sessions = self.sessions.lock().await;
            let record = sessions.get(session_id).ok_or_else(session_not_found)?;
            (
                record.snapshot.provider,
                record.pending.clone(),
                record.snapshot.clone(),
                record.generation,
            )
        };
        if current.status != SubscriptionAuthStatus::Pending
            || provider != SubscriptionProvider::Opencode
        {
            return Ok(current);
        }
        let Some(pending) = pending else {
            return Ok(current);
        };
        match self.provider.poll_device(provider, &pending).await {
            Ok(DeviceAuthorizationPoll::Pending) => Ok(current),
            Ok(DeviceAuthorizationPoll::Authorized(credential)) => {
                let _commit = self.commit_lock.lock().await;
                if let Some(snapshot) = self.stale_snapshot(session_id, generation).await? {
                    return Ok(snapshot);
                }
                let store_result = self.store.save(provider, credential).await;
                self.finish(session_id, generation, store_result.map(|_| ()))
                    .await
            }
            Err(error) => {
                let _commit = self.commit_lock.lock().await;
                self.finish(session_id, generation, Err(error)).await
            }
        }
    }

    /// Completes a desktop-owned loopback callback. The caller must pass the
    /// exact state from the callback query; display text is never parsed.
    pub async fn complete_browser(
        &self,
        session_id: &str,
        code: &str,
        callback_state: &str,
    ) -> SubscriptionAuthResult<SubscriptionAuthSession> {
        let (provider, pending, generation) = {
            let sessions = self.sessions.lock().await;
            let record = sessions.get(session_id).ok_or_else(session_not_found)?;
            if record.snapshot.status != SubscriptionAuthStatus::Pending {
                return Ok(record.snapshot.clone());
            }
            (
                record.snapshot.provider,
                record.pending.clone().ok_or_else(|| {
                    SubscriptionAuthError::new(
                        SubscriptionAuthErrorCode::InvalidRequest,
                        "Authorization session no longer has pending state",
                        false,
                    )
                })?,
                record.generation,
            )
        };
        if pending.expected_state() != Some(callback_state) {
            let _commit = self.commit_lock.lock().await;
            return self
                .finish(
                    session_id,
                    generation,
                    Err(SubscriptionAuthError::new(
                        SubscriptionAuthErrorCode::InvalidState,
                        "OAuth callback state did not match the pending session",
                        false,
                    )),
                )
                .await;
        }
        let exchange_result = self
            .provider
            .exchange_browser_code(provider, &pending, code)
            .await;
        let _commit = self.commit_lock.lock().await;
        if let Some(snapshot) = self.stale_snapshot(session_id, generation).await? {
            return Ok(snapshot);
        }
        let result = match exchange_result {
            Ok(credential) => self.store.save(provider, credential).await,
            Err(error) => Err(error),
        };
        self.finish(session_id, generation, result).await
    }

    pub async fn cancel(
        &self,
        session_id: &str,
    ) -> SubscriptionAuthResult<SubscriptionAuthSession> {
        let _commit = self.commit_lock.lock().await;
        let mut sessions = self.sessions.lock().await;
        let record = sessions.get_mut(session_id).ok_or_else(session_not_found)?;
        if record.snapshot.status == SubscriptionAuthStatus::Pending {
            record.snapshot.status = SubscriptionAuthStatus::Cancelled;
            record.snapshot.authorization_url = None;
            record.snapshot.user_code = None;
            record.pending = None;
            record.generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        }
        Ok(record.snapshot.clone())
    }

    pub async fn list(&self) -> SubscriptionAuthResult<Vec<SubscriptionAccount>> {
        self.store.list().await
    }

    pub async fn logout(&self, provider: SubscriptionProvider) -> SubscriptionAuthResult<()> {
        let _commit = self.commit_lock.lock().await;
        self.store.delete(provider).await
    }

    pub async fn refresh(
        &self,
        provider: SubscriptionProvider,
    ) -> SubscriptionAuthResult<SubscriptionAccount> {
        let _commit = self.commit_lock.lock().await;
        let current = self.store.load(provider).await?.ok_or_else(|| {
            SubscriptionAuthError::new(
                SubscriptionAuthErrorCode::RefreshUnavailable,
                "No subscription credential is stored for this provider",
                false,
            )
        })?;
        let refreshed = self.provider.refresh(provider, &current).await?;
        let account = refreshed.account(provider);
        self.store.save(provider, refreshed).await?;
        Ok(account)
    }

    async fn finish(
        &self,
        session_id: &str,
        generation: u64,
        result: SubscriptionAuthResult<()>,
    ) -> SubscriptionAuthResult<SubscriptionAuthSession> {
        let mut sessions = self.sessions.lock().await;
        let record = sessions.get_mut(session_id).ok_or_else(session_not_found)?;
        if record.generation != generation
            || record.snapshot.status != SubscriptionAuthStatus::Pending
        {
            return Ok(record.snapshot.clone());
        }
        record.pending = None;
        record.snapshot.authorization_url = None;
        record.snapshot.user_code = None;
        match result {
            Ok(()) => {
                record.snapshot.status = SubscriptionAuthStatus::Authorized;
                record.snapshot.error = None;
            }
            Err(error) => {
                record.snapshot.status = SubscriptionAuthStatus::Failed;
                record.snapshot.error = Some(error);
            }
        }
        Ok(record.snapshot.clone())
    }

    async fn stale_snapshot(
        &self,
        session_id: &str,
        generation: u64,
    ) -> SubscriptionAuthResult<Option<SubscriptionAuthSession>> {
        let sessions = self.sessions.lock().await;
        let record = sessions.get(session_id).ok_or_else(session_not_found)?;
        Ok((record.generation != generation
            || record.snapshot.status != SubscriptionAuthStatus::Pending)
            .then(|| record.snapshot.clone()))
    }
}

fn session_not_found() -> SubscriptionAuthError {
    SubscriptionAuthError::new(
        SubscriptionAuthErrorCode::SessionNotFound,
        "Subscription authorization session was not found",
        false,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::subscription_auth::contracts::SubscriptionCredential;
    use async_trait::async_trait;

    #[derive(Default)]
    struct MockProvider;

    #[async_trait]
    impl SubscriptionOAuthProviderAdapter for MockProvider {
        async fn start(
            &self,
            provider: SubscriptionProvider,
            _redirect_uri: Option<&str>,
        ) -> SubscriptionAuthResult<PendingAuthorization> {
            Ok(match provider {
                SubscriptionProvider::Codex => PendingAuthorization::Browser {
                    authorization_url: "http://authorize.test/codex".to_string(),
                    redirect_uri: "http://localhost:1455/auth/callback".to_string(),
                    state: "expected-state".to_string(),
                    code_verifier: "verifier-secret".to_string(),
                },
                SubscriptionProvider::Opencode => PendingAuthorization::Device {
                    authorization_url: "http://authorize.test/opencode".to_string(),
                    user_code: "ABCD-EFGH".to_string(),
                    device_code: "device-secret".to_string(),
                },
            })
        }

        async fn exchange_browser_code(
            &self,
            _provider: SubscriptionProvider,
            _pending: &PendingAuthorization,
            _code: &str,
        ) -> SubscriptionAuthResult<SubscriptionCredential> {
            credential()
        }

        async fn poll_device(
            &self,
            _provider: SubscriptionProvider,
            _pending: &PendingAuthorization,
        ) -> SubscriptionAuthResult<DeviceAuthorizationPoll> {
            Ok(DeviceAuthorizationPoll::Authorized(credential()?))
        }

        async fn refresh(
            &self,
            _provider: SubscriptionProvider,
            current: &SubscriptionCredential,
        ) -> SubscriptionAuthResult<SubscriptionCredential> {
            current.with_refreshed_tokens("refreshed-access".to_string(), None, Some(4_102_444_800))
        }
    }

    #[derive(Default)]
    struct MemoryStore {
        credentials: Mutex<HashMap<SubscriptionProvider, SubscriptionCredential>>,
    }

    #[async_trait]
    impl SubscriptionCredentialStoreAdapter for MemoryStore {
        async fn ensure_available(&self) -> SubscriptionAuthResult<()> {
            Ok(())
        }

        async fn load(
            &self,
            provider: SubscriptionProvider,
        ) -> SubscriptionAuthResult<Option<SubscriptionCredential>> {
            Ok(self.credentials.lock().await.get(&provider).cloned())
        }

        async fn save(
            &self,
            provider: SubscriptionProvider,
            credential: SubscriptionCredential,
        ) -> SubscriptionAuthResult<()> {
            self.credentials.lock().await.insert(provider, credential);
            Ok(())
        }

        async fn delete(&self, provider: SubscriptionProvider) -> SubscriptionAuthResult<()> {
            self.credentials.lock().await.remove(&provider);
            Ok(())
        }

        async fn list(&self) -> SubscriptionAuthResult<Vec<SubscriptionAccount>> {
            Ok(self
                .credentials
                .lock()
                .await
                .iter()
                .map(|(provider, credential)| credential.account(*provider))
                .collect())
        }
    }

    fn credential() -> SubscriptionAuthResult<SubscriptionCredential> {
        SubscriptionCredential::new(
            "access-secret".to_string(),
            Some("refresh-secret".to_string()),
            Some(4_102_444_799),
            Some("user@example.test".to_string()),
        )
    }

    fn service(store: Arc<dyn SubscriptionCredentialStoreAdapter>) -> SubscriptionAuthService {
        SubscriptionAuthService::new(Arc::new(MockProvider), store)
    }

    #[tokio::test]
    async fn opencode_status_authorizes_then_list_refresh_and_logout_work() {
        let store = Arc::new(MemoryStore::default());
        let service = service(store);
        let started = service
            .start(StartSubscriptionAuthRequest {
                provider: SubscriptionProvider::Opencode,
                redirect_uri: None,
            })
            .await
            .unwrap();
        assert_eq!(started.status, SubscriptionAuthStatus::Pending);
        assert_eq!(started.user_code.as_deref(), Some("ABCD-EFGH"));

        let authorized = service.status(&started.session_id).await.unwrap();
        assert_eq!(authorized.status, SubscriptionAuthStatus::Authorized);
        assert_eq!(service.list().await.unwrap().len(), 1);

        let refreshed = service
            .refresh(SubscriptionProvider::Opencode)
            .await
            .unwrap();
        assert_eq!(refreshed.expires_at, Some(4_102_444_800));
        service
            .logout(SubscriptionProvider::Opencode)
            .await
            .unwrap();
        assert!(service.list().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn codex_rejects_wrong_callback_state_and_drops_pending_secrets() {
        let service = service(Arc::new(MemoryStore::default()));
        let started = service
            .start(StartSubscriptionAuthRequest {
                provider: SubscriptionProvider::Codex,
                redirect_uri: Some("http://localhost:1455/auth/callback".to_string()),
            })
            .await
            .unwrap();
        let failed = service
            .complete_browser(&started.session_id, "code", "wrong-state")
            .await
            .unwrap();
        assert_eq!(failed.status, SubscriptionAuthStatus::Failed);
        assert_eq!(
            failed.error.unwrap().code,
            SubscriptionAuthErrorCode::InvalidState
        );
        assert_eq!(
            service.status(&started.session_id).await.unwrap().status,
            SubscriptionAuthStatus::Failed
        );
    }

    #[tokio::test]
    async fn cancel_is_terminal_and_idempotent() {
        let service = service(Arc::new(MemoryStore::default()));
        let started = service
            .start(StartSubscriptionAuthRequest {
                provider: SubscriptionProvider::Codex,
                redirect_uri: Some("http://localhost:1455/auth/callback".to_string()),
            })
            .await
            .unwrap();
        let cancelled = service.cancel(&started.session_id).await.unwrap();
        assert_eq!(cancelled.status, SubscriptionAuthStatus::Cancelled);
        assert_eq!(
            service.cancel(&started.session_id).await.unwrap().status,
            SubscriptionAuthStatus::Cancelled
        );
    }

    #[tokio::test]
    async fn cancelled_generation_rejects_a_stale_authorization_commit() {
        let service = service(Arc::new(MemoryStore::default()));
        let started = service
            .start(StartSubscriptionAuthRequest {
                provider: SubscriptionProvider::Codex,
                redirect_uri: Some("http://localhost:1455/auth/callback".to_string()),
            })
            .await
            .unwrap();
        let generation = service
            .sessions
            .lock()
            .await
            .get(&started.session_id)
            .unwrap()
            .generation;
        service.cancel(&started.session_id).await.unwrap();

        let stale = service
            .finish(&started.session_id, generation, Ok(()))
            .await
            .unwrap();
        assert_eq!(stale.status, SubscriptionAuthStatus::Cancelled);
        assert!(service.list().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn unsupported_store_blocks_login_before_external_authorization() {
        let service = service(Arc::new(
            crate::infrastructure::subscription_auth::UnsupportedSubscriptionCredentialStore,
        ));
        let error = service
            .start(StartSubscriptionAuthRequest {
                provider: SubscriptionProvider::Codex,
                redirect_uri: Some("http://localhost:1455/auth/callback".to_string()),
            })
            .await
            .expect_err("production storage gate must fail closed");
        assert_eq!(
            error.code,
            SubscriptionAuthErrorCode::CredentialStoreUnsupported
        );
    }
}
