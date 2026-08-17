use super::contracts::{
    SubscriptionAccount, SubscriptionAccountStatus, SubscriptionAuthError,
    SubscriptionAuthErrorCode, SubscriptionAuthResult, SubscriptionCredential,
    SubscriptionProvider,
};
use super::ports::SubscriptionCredentialStoreAdapter;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use uuid::Uuid;

const KEYRING_SERVICE: &str = "void.subscription-auth.v1";
const MANIFEST_VERSION: u8 = 1;
const SECRET_CHUNK_BYTES: usize = 2_048;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialManifest {
    version: u8,
    set_id: String,
    access_parts: u32,
    refresh_parts: u32,
    expires_at: Option<i64>,
    account_hint: Option<String>,
    #[serde(default)]
    account_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    cleanup: Vec<SecretSet>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecretSet {
    set_id: String,
    access_parts: u32,
    refresh_parts: u32,
}

impl CredentialManifest {
    fn current_set(&self) -> SecretSet {
        SecretSet {
            set_id: self.set_id.clone(),
            access_parts: self.access_parts,
            refresh_parts: self.refresh_parts,
        }
    }
}

#[async_trait]
trait NativeCredentialVault: Send + Sync {
    async fn probe(&self) -> Result<(), ()>;
    async fn get(&self, entry: &str) -> Result<Option<Vec<u8>>, ()>;
    async fn set(&self, entry: &str, secret: Vec<u8>) -> Result<(), ()>;
    async fn delete(&self, entry: &str) -> Result<(), ()>;
}

/// Production subscription credential store backed exclusively by the native
/// OS credential vault. No token or account metadata is written to disk.
pub struct NativeSubscriptionCredentialStore {
    vault: Arc<dyn NativeCredentialVault>,
}

impl NativeSubscriptionCredentialStore {
    pub async fn new() -> SubscriptionAuthResult<Self> {
        let vault = NativeKeyringVault::connect().await?;
        Ok(Self {
            vault: Arc::new(vault),
        })
    }

    #[cfg(test)]
    fn with_vault(vault: Arc<dyn NativeCredentialVault>) -> Self {
        Self { vault }
    }

    async fn load_manifest(
        &self,
        provider: SubscriptionProvider,
    ) -> SubscriptionAuthResult<Option<CredentialManifest>> {
        let Some(bytes) = self
            .vault
            .get(&manifest_entry(provider))
            .await
            .map_err(|_| store_error("read credential manifest"))?
        else {
            return Ok(None);
        };
        let manifest = serde_json::from_slice::<CredentialManifest>(&bytes)
            .map_err(|_| store_error("parse credential manifest"))?;
        if manifest.version != MANIFEST_VERSION {
            return Err(store_error("read unsupported credential manifest version"));
        }
        Ok(Some(manifest))
    }

    async fn load_credential(
        &self,
        provider: SubscriptionProvider,
    ) -> SubscriptionAuthResult<Option<SubscriptionCredential>> {
        let Some(manifest) = self.load_manifest(provider).await? else {
            return Ok(None);
        };
        let access = self
            .read_field(provider, &manifest.set_id, "access", manifest.access_parts)
            .await?
            .ok_or_else(|| store_error("read incomplete access-token credential"))?;
        let refresh = self
            .read_field(
                provider,
                &manifest.set_id,
                "refresh",
                manifest.refresh_parts,
            )
            .await?;
        let credential = SubscriptionCredential::new(
            access,
            refresh,
            manifest.expires_at,
            manifest.account_hint.clone(),
        )
        .map(|credential| credential.with_account_id(manifest.account_id.clone()))
        .map_err(|_| store_error("read invalid subscription credential"))?;
        self.retry_cleanup(provider, &manifest).await;
        Ok(Some(credential))
    }

    async fn read_field(
        &self,
        provider: SubscriptionProvider,
        set_id: &str,
        field: &str,
        parts: u32,
    ) -> SubscriptionAuthResult<Option<String>> {
        if parts == 0 {
            return Ok(None);
        }
        let mut bytes = Vec::new();
        for index in 0..parts {
            let Some(part) = self
                .vault
                .get(&chunk_entry(provider, set_id, field, index))
                .await
                .map_err(|_| store_error("read credential secret"))?
            else {
                return Ok(None);
            };
            bytes.extend_from_slice(&part);
        }
        String::from_utf8(bytes)
            .map(Some)
            .map_err(|_| store_error("decode credential secret"))
    }

    async fn write_field(
        &self,
        provider: SubscriptionProvider,
        set_id: &str,
        field: &str,
        secret: Option<&str>,
        written: &mut Vec<String>,
    ) -> SubscriptionAuthResult<u32> {
        let Some(secret) = secret else {
            return Ok(0);
        };
        let chunks = secret_chunks(secret);
        for (index, chunk) in chunks.iter().enumerate() {
            let entry = chunk_entry(provider, set_id, field, index as u32);
            self.vault
                .set(&entry, chunk.clone())
                .await
                .map_err(|_| store_error("write credential secret"))?;
            written.push(entry);
        }
        Ok(chunks.len() as u32)
    }

    async fn delete_set(
        &self,
        provider: SubscriptionProvider,
        set: &SecretSet,
    ) -> SubscriptionAuthResult<()> {
        for (field, count) in [("access", set.access_parts), ("refresh", set.refresh_parts)] {
            for index in 0..count {
                self.vault
                    .delete(&chunk_entry(provider, &set.set_id, field, index))
                    .await
                    .map_err(|_| store_error("delete credential secret"))?;
            }
        }
        Ok(())
    }

    async fn retry_cleanup(&self, provider: SubscriptionProvider, manifest: &CredentialManifest) {
        if manifest.cleanup.is_empty() {
            return;
        }
        for set in &manifest.cleanup {
            if self.delete_set(provider, set).await.is_err() {
                return;
            }
        }
        let mut clean = manifest.clone();
        clean.cleanup.clear();
        if let Ok(bytes) = serde_json::to_vec(&clean) {
            let _ = self.vault.set(&manifest_entry(provider), bytes).await;
        }
    }
}

#[async_trait]
impl SubscriptionCredentialStoreAdapter for NativeSubscriptionCredentialStore {
    async fn ensure_available(&self) -> SubscriptionAuthResult<()> {
        self.vault
            .probe()
            .await
            .map_err(|_| store_error("access native credential vault"))
    }

    async fn load(
        &self,
        provider: SubscriptionProvider,
    ) -> SubscriptionAuthResult<Option<SubscriptionCredential>> {
        let _transaction = credential_transaction_lock().lock().await;
        self.load_credential(provider).await
    }

    async fn save(
        &self,
        provider: SubscriptionProvider,
        credential: SubscriptionCredential,
    ) -> SubscriptionAuthResult<()> {
        let _transaction = credential_transaction_lock().lock().await;
        self.ensure_available().await?;
        let previous = self.load_manifest(provider).await?;
        let set_id = Uuid::new_v4().simple().to_string();
        let mut written = Vec::new();
        let write_result = async {
            let access_parts = self
                .write_field(
                    provider,
                    &set_id,
                    "access",
                    Some(credential.access_token()),
                    &mut written,
                )
                .await?;
            let refresh_parts = self
                .write_field(
                    provider,
                    &set_id,
                    "refresh",
                    credential.refresh_token(),
                    &mut written,
                )
                .await?;
            let mut cleanup = previous
                .as_ref()
                .map(|manifest| manifest.cleanup.clone())
                .unwrap_or_default();
            if let Some(manifest) = &previous {
                cleanup.push(manifest.current_set());
            }
            let manifest = CredentialManifest {
                version: MANIFEST_VERSION,
                set_id,
                access_parts,
                refresh_parts,
                expires_at: credential.expires_at(),
                account_hint: credential.account_hint().map(ToString::to_string),
                account_id: credential.account_id().map(ToString::to_string),
                cleanup,
            };
            let bytes = serde_json::to_vec(&manifest)
                .map_err(|_| store_error("serialize credential manifest"))?;
            self.vault
                .set(&manifest_entry(provider), bytes)
                .await
                .map_err(|_| store_error("commit credential manifest"))?;
            self.retry_cleanup(provider, &manifest).await;
            Ok(())
        }
        .await;
        if write_result.is_err() {
            for entry in written {
                let _ = self.vault.delete(&entry).await;
            }
        }
        write_result
    }

    async fn delete(&self, provider: SubscriptionProvider) -> SubscriptionAuthResult<()> {
        let _transaction = credential_transaction_lock().lock().await;
        let Some(manifest) = self.load_manifest(provider).await? else {
            return Ok(());
        };
        self.delete_set(provider, &manifest.current_set()).await?;
        for set in &manifest.cleanup {
            self.delete_set(provider, set).await?;
        }
        self.vault
            .delete(&manifest_entry(provider))
            .await
            .map_err(|_| store_error("delete credential manifest"))
    }

    async fn list(&self) -> SubscriptionAuthResult<Vec<SubscriptionAccount>> {
        let _transaction = credential_transaction_lock().lock().await;
        let mut accounts = Vec::new();
        for provider in [SubscriptionProvider::Codex, SubscriptionProvider::Opencode] {
            match self.load_credential(provider).await {
                Ok(Some(credential)) => accounts.push(credential.account(provider)),
                Ok(None) => accounts.push(SubscriptionAccount {
                    provider,
                    status: SubscriptionAccountStatus::Disconnected,
                    account_hint: None,
                    expires_at: None,
                    error: None,
                }),
                Err(error) => accounts.push(SubscriptionAccount {
                    provider,
                    status: if error.retryable {
                        SubscriptionAccountStatus::VaultUnavailable
                    } else {
                        SubscriptionAccountStatus::Failed
                    },
                    account_hint: None,
                    expires_at: None,
                    error: Some(error),
                }),
            }
        }
        Ok(accounts)
    }
}

struct NativeKeyringVault {
    store: Arc<keyring_core::CredentialStore>,
}

impl NativeKeyringVault {
    async fn connect() -> SubscriptionAuthResult<Self> {
        let store = tokio::task::spawn_blocking(create_native_store)
            .await
            .map_err(|_| store_error("initialize native credential vault"))?
            .map_err(|_| store_error("initialize native credential vault"))?;
        Ok(Self { store })
    }

    fn entry(
        store: &Arc<keyring_core::CredentialStore>,
        name: &str,
    ) -> Result<keyring_core::Entry, keyring_core::Error> {
        store.build(KEYRING_SERVICE, name, None)
    }
}

#[async_trait]
impl NativeCredentialVault for NativeKeyringVault {
    async fn probe(&self) -> Result<(), ()> {
        let store = self.store.clone();
        run_keyring(move || {
            let entry = Self::entry(&store, "__availability_probe__").map_err(|_| ())?;
            match entry.get_secret() {
                Ok(_) | Err(keyring_core::Error::NoEntry) => Ok(()),
                Err(_) => Err(()),
            }
        })
        .await
    }

    async fn get(&self, entry: &str) -> Result<Option<Vec<u8>>, ()> {
        let store = self.store.clone();
        let entry = entry.to_string();
        run_keyring(move || {
            let entry = Self::entry(&store, &entry).map_err(|_| ())?;
            match entry.get_secret() {
                Ok(secret) => Ok(Some(secret)),
                Err(keyring_core::Error::NoEntry) => Ok(None),
                Err(_) => Err(()),
            }
        })
        .await
    }

    async fn set(&self, entry: &str, secret: Vec<u8>) -> Result<(), ()> {
        if secret.len() > SECRET_CHUNK_BYTES {
            return Err(());
        }
        let store = self.store.clone();
        let entry = entry.to_string();
        run_keyring(move || {
            Self::entry(&store, &entry)
                .map_err(|_| ())?
                .set_secret(&secret)
                .map_err(|_| ())
        })
        .await
    }

    async fn delete(&self, entry: &str) -> Result<(), ()> {
        let store = self.store.clone();
        let entry = entry.to_string();
        run_keyring(move || {
            let entry = Self::entry(&store, &entry).map_err(|_| ())?;
            match entry.delete_credential() {
                Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
                Err(_) => Err(()),
            }
        })
        .await
    }
}

async fn run_keyring<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, ()> + Send + 'static,
) -> Result<T, ()> {
    tokio::task::spawn_blocking(move || {
        let _guard = keyring_operation_lock().lock().map_err(|_| ())?;
        operation()
    })
    .await
    .map_err(|_| ())?
}

fn keyring_operation_lock() -> &'static StdMutex<()> {
    static LOCK: OnceLock<StdMutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| StdMutex::new(()))
}

fn credential_transaction_lock() -> &'static tokio::sync::Mutex<()> {
    static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    &LOCK
}

fn create_native_store() -> Result<Arc<keyring_core::CredentialStore>, ()> {
    #[cfg(target_os = "macos")]
    let store = apple_native_keyring_store::keychain::Store::new();
    #[cfg(target_os = "windows")]
    let store = windows_native_keyring_store::Store::new();
    #[cfg(all(
        unix,
        not(any(target_os = "macos", target_os = "ios", target_os = "android"))
    ))]
    let store = zbus_secret_service_keyring_store::Store::new();
    #[cfg(not(any(
        target_os = "macos",
        target_os = "windows",
        all(
            unix,
            not(any(target_os = "macos", target_os = "ios", target_os = "android"))
        )
    )))]
    let store: keyring_core::Result<Arc<keyring_core::CredentialStore>> =
        Err(keyring_core::Error::NoDefaultStore);
    let store = store.map_err(|_| ())?;
    let store: Arc<keyring_core::CredentialStore> = store;
    Ok(store)
}

fn provider_key(provider: SubscriptionProvider) -> &'static str {
    match provider {
        SubscriptionProvider::Codex => "codex",
        SubscriptionProvider::Opencode => "opencode",
    }
}

fn manifest_entry(provider: SubscriptionProvider) -> String {
    format!("{}/manifest", provider_key(provider))
}

fn chunk_entry(provider: SubscriptionProvider, set_id: &str, field: &str, index: u32) -> String {
    format!("{}/{set_id}/{field}/{index}", provider_key(provider))
}

fn secret_chunks(secret: &str) -> Vec<Vec<u8>> {
    if secret.is_empty() {
        return vec![Vec::new()];
    }
    secret
        .as_bytes()
        .chunks(SECRET_CHUNK_BYTES)
        .map(<[u8]>::to_vec)
        .collect()
}

fn store_error(operation: &str) -> SubscriptionAuthError {
    SubscriptionAuthError::new(
        SubscriptionAuthErrorCode::CredentialStoreFailed,
        format!("Native credential vault could not {operation}"),
        true,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[derive(Default)]
    struct MemoryVault {
        available: AtomicBool,
        entries: StdMutex<HashMap<String, Vec<u8>>>,
    }

    impl MemoryVault {
        fn available() -> Self {
            Self {
                available: AtomicBool::new(true),
                entries: StdMutex::new(HashMap::new()),
            }
        }
    }

    #[async_trait]
    impl NativeCredentialVault for MemoryVault {
        async fn probe(&self) -> Result<(), ()> {
            self.available
                .load(Ordering::Relaxed)
                .then_some(())
                .ok_or(())
        }

        async fn get(&self, entry: &str) -> Result<Option<Vec<u8>>, ()> {
            self.probe().await?;
            Ok(self.entries.lock().unwrap().get(entry).cloned())
        }

        async fn set(&self, entry: &str, secret: Vec<u8>) -> Result<(), ()> {
            self.probe().await?;
            self.entries
                .lock()
                .unwrap()
                .insert(entry.to_string(), secret);
            Ok(())
        }

        async fn delete(&self, entry: &str) -> Result<(), ()> {
            self.probe().await?;
            self.entries.lock().unwrap().remove(entry);
            Ok(())
        }
    }

    fn credential(access: String, refresh: Option<String>) -> SubscriptionCredential {
        SubscriptionCredential::new(
            access,
            refresh,
            Some(4_102_444_800),
            Some("user@example.test".to_string()),
        )
        .unwrap()
        .with_account_id(Some("acct_test".to_string()))
    }

    #[tokio::test]
    async fn native_store_roundtrips_chunked_secrets_and_lists_metadata() {
        let vault = Arc::new(MemoryVault::available());
        let store = NativeSubscriptionCredentialStore::with_vault(vault.clone());
        let access = format!("access-{}", "a".repeat(4_500));
        let refresh = format!("refresh-{}", "r".repeat(2_600));

        store
            .save(
                SubscriptionProvider::Codex,
                credential(access.clone(), Some(refresh.clone())),
            )
            .await
            .unwrap();

        let loaded = store
            .load(SubscriptionProvider::Codex)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(loaded.access_token(), access);
        assert_eq!(loaded.refresh_token(), Some(refresh.as_str()));
        assert_eq!(loaded.account_id(), Some("acct_test"));
        assert_eq!(
            store.list().await.unwrap(),
            vec![
                SubscriptionAccount {
                    provider: SubscriptionProvider::Codex,
                    status: SubscriptionAccountStatus::Connected,
                    account_hint: Some("user@example.test".to_string()),
                    expires_at: Some(4_102_444_800),
                    error: None,
                },
                SubscriptionAccount {
                    provider: SubscriptionProvider::Opencode,
                    status: SubscriptionAccountStatus::Disconnected,
                    account_hint: None,
                    expires_at: None,
                    error: None,
                }
            ]
        );

        let entries = vault.entries.lock().unwrap();
        let manifest = entries.get("codex/manifest").unwrap();
        assert!(!String::from_utf8_lossy(manifest).contains("access-"));
        assert!(!String::from_utf8_lossy(manifest).contains("refresh-"));
        assert!(entries.keys().any(|name| name.ends_with("/access/2")));
        assert!(entries.keys().any(|name| name.ends_with("/refresh/1")));
    }

    #[test]
    fn legacy_manifest_without_account_id_remains_readable() {
        let manifest: CredentialManifest = serde_json::from_value(serde_json::json!({
            "version": 1,
            "setId": "legacy",
            "accessParts": 1,
            "refreshParts": 0,
            "expiresAt": null,
            "accountHint": "user@example.test"
        }))
        .expect("legacy manifest should deserialize");

        assert_eq!(manifest.account_id, None);
        assert_eq!(manifest.account_hint.as_deref(), Some("user@example.test"));
    }

    #[tokio::test]
    async fn replacing_and_deleting_credentials_cleans_old_secret_sets() {
        let vault = Arc::new(MemoryVault::available());
        let store = NativeSubscriptionCredentialStore::with_vault(vault.clone());
        store
            .save(
                SubscriptionProvider::Opencode,
                credential("old-access".to_string(), Some("old-refresh".to_string())),
            )
            .await
            .unwrap();
        let old_names = vault
            .entries
            .lock()
            .unwrap()
            .keys()
            .filter(|name| name.contains("/access/") || name.contains("/refresh/"))
            .cloned()
            .collect::<Vec<_>>();

        store
            .save(
                SubscriptionProvider::Opencode,
                credential("new-access".to_string(), None),
            )
            .await
            .unwrap();
        let entries = vault.entries.lock().unwrap();
        assert!(old_names.iter().all(|name| !entries.contains_key(name)));
        drop(entries);

        store.delete(SubscriptionProvider::Opencode).await.unwrap();
        assert!(vault.entries.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn unavailable_native_vault_returns_typed_retryable_error() {
        let vault = Arc::new(MemoryVault::default());
        let store = NativeSubscriptionCredentialStore::with_vault(vault);
        let error = store.ensure_available().await.unwrap_err();
        assert_eq!(error.code, SubscriptionAuthErrorCode::CredentialStoreFailed);
        assert!(error.retryable);
    }
}
