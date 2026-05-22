use super::types::AnnouncementState;
use crate::infrastructure::app_paths::PathManager;
use crate::util::errors::{VoidError, VoidResult};
use std::sync::Arc;

pub struct AnnouncementStateStore {
    inner: void_services_integrations::announcement::AnnouncementStateStore,
}

impl AnnouncementStateStore {
    pub fn new(path_manager: &Arc<PathManager>) -> Self {
        Self {
            inner: void_services_integrations::announcement::AnnouncementStateStore::new(
                path_manager.user_config_dir(),
            ),
        }
    }

    /// Load state from disk.  Returns a default state if the file does not exist.
    pub async fn load(&self) -> VoidResult<AnnouncementState> {
        self.inner.load().await.map_err(map_state_store_error)
    }

    /// Persist state to disk.
    pub async fn save(&self, state: &AnnouncementState) -> VoidResult<()> {
        self.inner.save(state).await.map_err(map_state_store_error)
    }
}

fn map_state_store_error(
    err: void_services_integrations::announcement::AnnouncementStateStoreError,
) -> VoidError {
    match err {
        void_services_integrations::announcement::AnnouncementStateStoreError::Io(err) => {
            VoidError::Io(err)
        }
        void_services_integrations::announcement::AnnouncementStateStoreError::Serialization(
            err,
        ) => VoidError::Serialization(err),
    }
}
