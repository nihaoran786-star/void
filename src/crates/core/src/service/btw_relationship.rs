use crate::infrastructure::app_paths::PathManager;
use crate::service::atomic_file::replace_file;
use crate::service::session::{BtwHydrationState, BtwSessionRecord};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Persists only portable BTW lineage. Transient child runtime remains owned by
/// the conversation coordinator and is intentionally not recreated here.
#[derive(Clone)]
pub struct BtwRelationshipRepository {
    path_manager: Arc<PathManager>,
}

impl BtwRelationshipRepository {
    pub fn new(path_manager: Arc<PathManager>) -> Self {
        Self { path_manager }
    }

    fn dir(&self, workspace_root: &Path) -> PathBuf {
        self.path_manager
            .project_sessions_dir(workspace_root)
            .join("btw")
    }

    fn record_path(
        &self,
        workspace_root: &Path,
        child_session_id: &str,
    ) -> Result<PathBuf, String> {
        if child_session_id.is_empty()
            || !child_session_id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        {
            return Err("invalid BTW child session id".to_string());
        }
        Ok(self
            .dir(workspace_root)
            .join(format!("{child_session_id}.json")))
    }

    pub fn save(&self, workspace_root: &Path, record: &BtwSessionRecord) -> Result<(), String> {
        let path = self.record_path(workspace_root, &record.child_session_id)?;
        let data = serde_json::to_vec_pretty(record).map_err(|error| error.to_string())?;
        replace_file(&path, &data)
    }

    pub fn list_for_parent(
        &self,
        workspace_root: &Path,
        parent_session_id: &str,
    ) -> Result<Vec<BtwSessionRecord>, String> {
        let dir = self.dir(workspace_root);
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut records = Vec::new();
        for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            let extension = path.extension().and_then(|value| value.to_str());
            if !matches!(extension, Some("json" | "txt")) {
                continue;
            }
            let child_id = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
            let mut record = BtwSessionRecord::from_persisted(&raw, parent_session_id, child_id);
            if record.parent_session_id != parent_session_id {
                continue;
            }
            if matches!(
                record.hydration_state,
                BtwHydrationState::Loading | BtwHydrationState::Ready
            ) {
                record.hydration_state = BtwHydrationState::RuntimeUnavailable;
                record.hydration_detail =
                    Some("persisted BTW relationship restored; start a new turn to resume".into());
            }
            records.push(record);
        }
        records.sort_by(|left, right| left.child_session_id.cmp(&right.child_session_id));
        Ok(records)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn rejects_path_traversal_child_ids() {
        let manager = Arc::new(PathManager::with_user_root_for_tests(
            std::env::temp_dir().join("void-btw-path-test"),
        ));
        let repository = BtwRelationshipRepository::new(manager);
        let mut record = BtwSessionRecord::loading("parent", "../escape");
        record.mark_ready();
        assert!(repository.save(Path::new("workspace"), &record).is_err());
    }

    #[test]
    fn saved_records_restore_lineage_and_legacy_records_remain_stale() {
        let root = std::env::temp_dir().join(format!("void-btw-{}", Uuid::new_v4()));
        let workspace = root.join("workspace");
        fs::create_dir_all(&workspace).unwrap();
        let manager = Arc::new(PathManager::with_user_root_for_tests(root.join("config")));
        let repository = BtwRelationshipRepository::new(manager.clone());

        let mut current = BtwSessionRecord::loading("parent", "current-child");
        current.mark_ready();
        repository.save(&workspace, &current).unwrap();

        let legacy_dir = manager.project_sessions_dir(&workspace).join("btw");
        fs::write(legacy_dir.join("legacy-child.txt"), "old side question").unwrap();

        let records = repository.list_for_parent(&workspace, "parent").unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(
            records
                .iter()
                .find(|record| record.child_session_id == "current-child")
                .map(|record| &record.hydration_state),
            Some(&BtwHydrationState::RuntimeUnavailable)
        );
        assert_eq!(
            records
                .iter()
                .find(|record| record.child_session_id == "legacy-child")
                .and_then(|record| record.legacy_text.as_deref()),
            Some("old side question")
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn saving_the_same_child_twice_replaces_the_windows_safe_sidecar() {
        let root = std::env::temp_dir().join(format!("void-btw-update-{}", Uuid::new_v4()));
        let workspace = root.join("workspace");
        fs::create_dir_all(&workspace).unwrap();
        let manager = Arc::new(PathManager::with_user_root_for_tests(root.join("config")));
        let repository = BtwRelationshipRepository::new(manager);
        let mut record = BtwSessionRecord::loading("parent", "child");
        repository.save(&workspace, &record).unwrap();
        record.child_session_name = Some("Updated title".to_string());
        record.mark_ready();
        repository.save(&workspace, &record).unwrap();

        let records = repository.list_for_parent(&workspace, "parent").unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(
            records[0].child_session_name.as_deref(),
            Some("Updated title")
        );
        assert_eq!(
            records[0].hydration_state,
            BtwHydrationState::RuntimeUnavailable
        );
        fs::remove_dir_all(root).unwrap();
    }
}
