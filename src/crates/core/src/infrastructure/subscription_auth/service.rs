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
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use uuid::Uuid;

struct SessionRecord {
    snapshot: SubscriptionAuthSession,
    pending: Option<PendingAuthorization>,
    generation: u64,
    poll_interval: Option<Duration>,
    next_poll_at: Option<Instant>,
}

pub trait SubscriptionAuthClock: Send + Sync {
    fn now(&self) -> Instant;
}

struct SystemSubscriptionAuthClock;

impl SubscriptionAuthClock for SystemSubscriptionAuthClock {
    fn now(&self) -> Instant {
        Instant::now()
    }
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
    clock: Arc<dyn SubscriptionAuthClock>,
}

impl SubscriptionAuthService {
    pub fn new(
        provider: Arc<dyn SubscriptionOAuthProviderAdapter>,
        store: Arc<dyn SubscriptionCredentialStoreAdapter>,
    ) -> Self {
        Self::with_clock(provider, store, Arc::new(SystemSubscriptionAuthClock))
    }

    fn with_clock(
        provider: Arc<dyn SubscriptionOAuthProviderAdapter>,
        store: Arc<dyn SubscriptionCredentialStoreAdapter>,
        clock: Arc<dyn SubscriptionAuthClock>,
    ) -> Self {
        Self {
            provider,
            store,
            sessions: Mutex::new(HashMap::new()),
            commit_lock: Mutex::new(()),
            next_generation: AtomicU64::new(1),
            clock,
        }
    }

    pub async fn start(
        &self,
        request: StartSubscriptionAuthRequest,
    ) -> SubscriptionAuthResult<SubscriptionAuthSession> {
        Uuid::parse_str(&request.session_id).map_err(|_| {
            SubscriptionAuthError::new(
                SubscriptionAuthErrorCode::InvalidRequest,
                "Subscription authorization session_id must be a UUID",
                false,
            )
        })?;
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        let placeholder = SubscriptionAuthSession {
            session_id: request.session_id.clone(),
            provider: request.provider,
            status: SubscriptionAuthStatus::Pending,
            authorization_url: None,
            user_code: None,
            error: None,
        };
        {
            let _commit = self.commit_lock.lock().await;
            let mut sessions = self.sessions.lock().await;
            if sessions.contains_key(&request.session_id) {
                return Err(SubscriptionAuthError::new(
                    SubscriptionAuthErrorCode::InvalidRequest,
                    "Subscription authorization session_id is already in use",
                    false,
                ));
            }
            sessions.insert(
                request.session_id.clone(),
                SessionRecord {
                    snapshot: placeholder,
                    pending: None,
                    generation,
                    poll_interval: None,
                    next_poll_at: None,
                },
            );
        }
        let provider_result = match self.store.ensure_available().await {
            Ok(()) => {
                self.provider
                    .start(request.provider, request.redirect_uri.as_deref())
                    .await
            }
            Err(error) => Err(error),
        };
        let _commit = self.commit_lock.lock().await;
        if let Some(snapshot) = self.stale_snapshot(&request.session_id, generation).await? {
            return Ok(snapshot);
        }
        match provider_result {
            Ok(pending) => {
                let (poll_interval, next_poll_at) = poll_schedule(&pending, self.clock.now());
                let mut sessions = self.sessions.lock().await;
                let record = sessions
                    .get_mut(&request.session_id)
                    .ok_or_else(session_not_found)?;
                record.snapshot.authorization_url = Some(pending.authorization_url().to_string());
                record.snapshot.user_code = pending.user_code().map(ToString::to_string);
                record.pending = Some(pending);
                record.poll_interval = poll_interval;
                record.next_poll_at = next_poll_at;
                Ok(record.snapshot.clone())
            }
            Err(error) => {
                self.finish(&request.session_id, generation, Err(error))
                    .await
            }
        }
    }

    /// Cached status only. It never performs provider network I/O.
    pub async fn status(
        &self,
        session_id: &str,
    ) -> SubscriptionAuthResult<SubscriptionAuthSession> {
        let sessions = self.sessions.lock().await;
        sessions
            .get(session_id)
            .map(|record| record.snapshot.clone())
            .ok_or_else(session_not_found)
    }

    /// Backend-controlled OpenCode polling tick. Calls before `next_poll_at`
    /// are cheap cached reads.
    pub async fn tick(&self, session_id: &str) -> SubscriptionAuthResult<SubscriptionAuthSession> {
        let now = self.clock.now();
        let (provider, pending, current, generation, interval) = {
            let mut sessions = self.sessions.lock().await;
            let record = sessions.get_mut(session_id).ok_or_else(session_not_found)?;
            let interval = record.poll_interval;
            if record.snapshot.status != SubscriptionAuthStatus::Pending
                || record.snapshot.provider != SubscriptionProvider::Opencode
                || record.next_poll_at.is_none_or(|next| now < next)
            {
                return Ok(record.snapshot.clone());
            }
            if let Some(interval) = interval {
                record.next_poll_at = Some(now + interval);
            }
            (
                record.snapshot.provider,
                record.pending.clone(),
                record.snapshot.clone(),
                record.generation,
                interval.unwrap_or(Duration::from_secs(5)),
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
            Ok(DeviceAuthorizationPoll::Pending) => self.status(session_id).await,
            Ok(DeviceAuthorizationPoll::SlowDown) => {
                let mut sessions = self.sessions.lock().await;
                let record = sessions.get_mut(session_id).ok_or_else(session_not_found)?;
                if record.generation == generation
                    && record.snapshot.status == SubscriptionAuthStatus::Pending
                {
                    let slowed = interval + Duration::from_secs(5);
                    record.poll_interval = Some(slowed);
                    record.next_poll_at = Some(self.clock.now() + slowed);
                }
                Ok(record.snapshot.clone())
            }
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
            record.poll_interval = None;
            record.next_poll_at = None;
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
        record.poll_interval = None;
        record.next_poll_at = None;
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

fn poll_schedule(
    pending: &PendingAuthorization,
    now: Instant,
) -> (Option<Duration>, Option<Instant>) {
    match pending {
        PendingAuthorization::Device {
            poll_interval_seconds,
            ..
        } => {
            let interval = Duration::from_secs((*poll_interval_seconds).max(1));
            (Some(interval), Some(now + interval))
        }
        PendingAuthorization::Browser { .. } => (None, None),
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
    use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};
    use std::sync::Mutex as StdMutex;
    use tokio::sync::Notify;

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
                    poll_interval_seconds: 5,
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

    struct BlockingStore {
        entered: Notify,
        release: Notify,
        inner: MemoryStore,
    }

    impl BlockingStore {
        fn new() -> Self {
            Self {
                entered: Notify::new(),
                release: Notify::new(),
                inner: MemoryStore::default(),
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
            let credentials = self.credentials.lock().await;
            Ok([
                SubscriptionProvider::Codex,
                SubscriptionProvider::Opencode,
            ]
            .into_iter()
            .map(|provider| {
                credentials.get(&provider).map_or(
                    SubscriptionAccount {
                        provider,
                        status: crate::infrastructure::subscription_auth::SubscriptionAccountStatus::Disconnected,
                        account_hint: None,
                        expires_at: None,
                        error: None,
                    },
                    |credential| credential.account(provider),
                )
            })
            .collect())
        }
    }

    #[async_trait]
    impl SubscriptionCredentialStoreAdapter for BlockingStore {
        async fn ensure_available(&self) -> SubscriptionAuthResult<()> {
            self.entered.notify_one();
            self.release.notified().await;
            Ok(())
        }

        async fn load(
            &self,
            provider: SubscriptionProvider,
        ) -> SubscriptionAuthResult<Option<SubscriptionCredential>> {
            self.inner.load(provider).await
        }

        async fn save(
            &self,
            provider: SubscriptionProvider,
            credential: SubscriptionCredential,
        ) -> SubscriptionAuthResult<()> {
            self.inner.save(provider, credential).await
        }

        async fn delete(&self, provider: SubscriptionProvider) -> SubscriptionAuthResult<()> {
            self.inner.delete(provider).await
        }

        async fn list(&self) -> SubscriptionAuthResult<Vec<SubscriptionAccount>> {
            self.inner.list().await
        }
    }

    struct ScriptedPollProvider {
        polls: AtomicUsize,
        block_poll: bool,
        poll_entered: Notify,
        poll_release: Notify,
    }

    impl ScriptedPollProvider {
        fn slowing() -> Self {
            Self {
                polls: AtomicUsize::new(0),
                block_poll: false,
                poll_entered: Notify::new(),
                poll_release: Notify::new(),
            }
        }

        fn blocking() -> Self {
            Self {
                polls: AtomicUsize::new(0),
                block_poll: true,
                poll_entered: Notify::new(),
                poll_release: Notify::new(),
            }
        }
    }

    #[async_trait]
    impl SubscriptionOAuthProviderAdapter for ScriptedPollProvider {
        async fn start(
            &self,
            _provider: SubscriptionProvider,
            _redirect_uri: Option<&str>,
        ) -> SubscriptionAuthResult<PendingAuthorization> {
            Ok(PendingAuthorization::Device {
                authorization_url: "http://authorize.test/opencode".to_string(),
                user_code: "ABCD-EFGH".to_string(),
                device_code: "device-secret".to_string(),
                poll_interval_seconds: 5,
            })
        }

        async fn exchange_browser_code(
            &self,
            _provider: SubscriptionProvider,
            _pending: &PendingAuthorization,
            _code: &str,
        ) -> SubscriptionAuthResult<SubscriptionCredential> {
            Err(SubscriptionAuthError::new(
                SubscriptionAuthErrorCode::InvalidRequest,
                "browser flow unsupported by test provider",
                false,
            ))
        }

        async fn poll_device(
            &self,
            _provider: SubscriptionProvider,
            _pending: &PendingAuthorization,
        ) -> SubscriptionAuthResult<DeviceAuthorizationPoll> {
            self.poll_entered.notify_one();
            if self.block_poll {
                self.poll_release.notified().await;
                return Ok(DeviceAuthorizationPoll::Pending);
            }
            match self.polls.fetch_add(1, AtomicOrdering::Relaxed) {
                0 => Ok(DeviceAuthorizationPoll::SlowDown),
                _ => Ok(DeviceAuthorizationPoll::Authorized(credential()?)),
            }
        }

        async fn refresh(
            &self,
            _provider: SubscriptionProvider,
            _current: &SubscriptionCredential,
        ) -> SubscriptionAuthResult<SubscriptionCredential> {
            credential()
        }
    }

    struct FakeClock(StdMutex<Instant>);

    impl FakeClock {
        fn new() -> Self {
            Self(StdMutex::new(Instant::now()))
        }

        fn advance(&self, duration: Duration) {
            let mut now = self.0.lock().unwrap();
            *now += duration;
        }
    }

    impl SubscriptionAuthClock for FakeClock {
        fn now(&self) -> Instant {
            *self.0.lock().unwrap()
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

    fn request(provider: SubscriptionProvider) -> StartSubscriptionAuthRequest {
        StartSubscriptionAuthRequest {
            session_id: Uuid::new_v4().to_string(),
            provider,
            redirect_uri: (provider == SubscriptionProvider::Codex)
                .then(|| "http://localhost:1455/auth/callback".to_string()),
        }
    }

    #[tokio::test]
    async fn opencode_status_is_cached_and_backend_tick_authorizes_on_schedule() {
        let store = Arc::new(MemoryStore::default());
        let clock = Arc::new(FakeClock::new());
        let service =
            SubscriptionAuthService::with_clock(Arc::new(MockProvider), store, clock.clone());
        let started = service
            .start(request(SubscriptionProvider::Opencode))
            .await
            .unwrap();
        assert_eq!(started.status, SubscriptionAuthStatus::Pending);
        assert_eq!(started.user_code.as_deref(), Some("ABCD-EFGH"));

        assert_eq!(
            service.status(&started.session_id).await.unwrap().status,
            SubscriptionAuthStatus::Pending
        );
        assert_eq!(
            service.tick(&started.session_id).await.unwrap().status,
            SubscriptionAuthStatus::Pending
        );
        clock.advance(Duration::from_secs(5));
        let authorized = service.tick(&started.session_id).await.unwrap();
        assert_eq!(authorized.status, SubscriptionAuthStatus::Authorized);
        assert_eq!(
            service
                .list()
                .await
                .unwrap()
                .into_iter()
                .filter(|account| {
                    account.status
                        == crate::infrastructure::subscription_auth::SubscriptionAccountStatus::Connected
                })
                .count(),
            1
        );

        let refreshed = service
            .refresh(SubscriptionProvider::Opencode)
            .await
            .unwrap();
        assert_eq!(refreshed.expires_at, Some(4_102_444_800));
        service
            .logout(SubscriptionProvider::Opencode)
            .await
            .unwrap();
        assert!(service.list().await.unwrap().into_iter().all(|account| {
            account.status
                == crate::infrastructure::subscription_auth::SubscriptionAccountStatus::Disconnected
        }));
    }

    #[tokio::test]
    async fn codex_rejects_wrong_callback_state_and_drops_pending_secrets() {
        let service = service(Arc::new(MemoryStore::default()));
        let started = service
            .start(request(SubscriptionProvider::Codex))
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
            .start(request(SubscriptionProvider::Codex))
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
            .start(request(SubscriptionProvider::Codex))
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
        assert!(service.list().await.unwrap().into_iter().all(|account| {
            account.status
                == crate::infrastructure::subscription_auth::SubscriptionAccountStatus::Disconnected
        }));
    }

    #[tokio::test]
    async fn unsupported_store_blocks_login_before_external_authorization() {
        let service = service(Arc::new(
            crate::infrastructure::subscription_auth::UnsupportedSubscriptionCredentialStore,
        ));
        let failed = service
            .start(request(SubscriptionProvider::Codex))
            .await
            .expect("placeholder should remain queryable");
        assert_eq!(failed.status, SubscriptionAuthStatus::Failed);
        assert_eq!(
            failed.error.unwrap().code,
            SubscriptionAuthErrorCode::CredentialStoreUnsupported
        );
        assert_eq!(
            service.status(&failed.session_id).await.unwrap().status,
            SubscriptionAuthStatus::Failed
        );
    }

    #[tokio::test]
    async fn cancel_during_vault_preflight_prevents_provider_start_commit() {
        let store = Arc::new(BlockingStore::new());
        let service = Arc::new(SubscriptionAuthService::new(
            Arc::new(MockProvider),
            store.clone(),
        ));
        let request = request(SubscriptionProvider::Codex);
        let session_id = request.session_id.clone();
        let start_service = service.clone();
        let start = tokio::spawn(async move { start_service.start(request).await.unwrap() });
        store.entered.notified().await;
        service.cancel(&session_id).await.unwrap();
        store.release.notify_one();

        assert_eq!(
            start.await.unwrap().status,
            SubscriptionAuthStatus::Cancelled
        );
        assert_eq!(
            service.status(&session_id).await.unwrap().status,
            SubscriptionAuthStatus::Cancelled
        );
    }

    #[tokio::test]
    async fn cancel_during_poll_returns_latest_cancelled_snapshot() {
        let provider = Arc::new(ScriptedPollProvider::blocking());
        let clock = Arc::new(FakeClock::new());
        let service = Arc::new(SubscriptionAuthService::with_clock(
            provider.clone(),
            Arc::new(MemoryStore::default()),
            clock.clone(),
        ));
        let started = service
            .start(request(SubscriptionProvider::Opencode))
            .await
            .unwrap();
        clock.advance(Duration::from_secs(5));
        let tick_service = service.clone();
        let session_id = started.session_id.clone();
        let tick = tokio::spawn(async move { tick_service.tick(&session_id).await.unwrap() });
        provider.poll_entered.notified().await;
        service.cancel(&started.session_id).await.unwrap();
        provider.poll_release.notify_one();

        assert_eq!(
            tick.await.unwrap().status,
            SubscriptionAuthStatus::Cancelled
        );
    }

    #[tokio::test]
    async fn opencode_slow_down_adds_five_seconds_before_next_poll() {
        let provider = Arc::new(ScriptedPollProvider::slowing());
        let clock = Arc::new(FakeClock::new());
        let service = SubscriptionAuthService::with_clock(
            provider.clone(),
            Arc::new(MemoryStore::default()),
            clock.clone(),
        );
        let started = service
            .start(request(SubscriptionProvider::Opencode))
            .await
            .unwrap();
        clock.advance(Duration::from_secs(5));
        assert_eq!(
            service.tick(&started.session_id).await.unwrap().status,
            SubscriptionAuthStatus::Pending
        );
        clock.advance(Duration::from_secs(9));
        assert_eq!(
            service.tick(&started.session_id).await.unwrap().status,
            SubscriptionAuthStatus::Pending
        );
        assert_eq!(provider.polls.load(AtomicOrdering::Relaxed), 1);
        clock.advance(Duration::from_secs(1));
        assert_eq!(
            service.tick(&started.session_id).await.unwrap().status,
            SubscriptionAuthStatus::Authorized
        );
    }
}
