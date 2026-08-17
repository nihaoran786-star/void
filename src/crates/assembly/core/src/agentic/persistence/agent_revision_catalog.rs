//! Atomic single-file persistence for one user or project Agent revision scope.

use crate::agentic::agent_revisions::{
    AgentRevisionCatalog, AgentRevisionCatalogMutation, AgentRevisionCatalogStore,
    AgentRevisionError, AgentRevisionErrorCode, AgentRevisionResult, AgentRevisionScope,
    AGENT_REVISION_CATALOG_SCHEMA_VERSION,
};
use crate::infrastructure::PathManager;
use fs2::FileExt;
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const MAX_AGENT_REVISION_CATALOG_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Clone)]
pub struct FileAgentRevisionCatalogStore {
    scope: AgentRevisionScope,
    catalog_path: PathBuf,
    recovery_path: PathBuf,
    lock_path: PathBuf,
}

impl FileAgentRevisionCatalogStore {
    pub fn for_scope(
        path_manager: Arc<PathManager>,
        scope: AgentRevisionScope,
    ) -> AgentRevisionResult<Self> {
        scope.validate()?;
        let catalog_path = match scope.workspace.as_ref() {
            None => path_manager.user_agent_revision_catalog_file(),
            Some(workspace) => {
                path_manager.project_agent_revision_catalog_file(&workspace.workspace_path)
            }
        };
        let parent = catalog_path.parent().ok_or_else(|| {
            AgentRevisionError::new(
                AgentRevisionErrorCode::Io,
                "Agent revision catalog path has no parent directory",
                false,
            )
        })?;
        Ok(Self {
            scope,
            catalog_path: catalog_path.clone(),
            recovery_path: parent.join("catalog.json.recovery"),
            lock_path: parent.join("catalog.lock"),
        })
    }

    pub fn catalog_path(&self) -> &Path {
        &self.catalog_path
    }

    fn with_locked_catalog<T>(
        &self,
        operation: impl FnOnce(&AgentRevisionCatalog) -> AgentRevisionResult<T>,
    ) -> AgentRevisionResult<T> {
        self.with_lock(|catalog| operation(catalog))
    }

    fn with_lock<T>(
        &self,
        operation: impl FnOnce(&mut AgentRevisionCatalog) -> AgentRevisionResult<T>,
    ) -> AgentRevisionResult<T> {
        let parent = self.catalog_path.parent().ok_or_else(|| {
            AgentRevisionError::new(
                AgentRevisionErrorCode::Io,
                "Agent revision catalog path has no parent directory",
                false,
            )
        })?;
        fs::create_dir_all(parent).map_err(|error| io_error("create catalog directory", error))?;
        let lock_file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(&self.lock_path)
            .map_err(|error| io_error("open catalog lock", error))?;
        lock_file
            .lock_exclusive()
            .map_err(|error| io_error("lock catalog", error))?;

        let result = (|| {
            crate::service::atomic_file::recover_file(&self.catalog_path, &self.recovery_path)
                .map_err(|message| {
                    let mut error = AgentRevisionError::new(
                        AgentRevisionErrorCode::RollbackFailed,
                        format!("Cannot recover Agent revision catalog: {message}"),
                        true,
                    );
                    error.recovery_path = Some(self.recovery_path.to_string_lossy().into_owned());
                    error
                })?;
            let mut catalog = self.load_locked()?;
            operation(&mut catalog)
        })();
        let _ = FileExt::unlock(&lock_file);
        result
    }

    fn load_locked(&self) -> AgentRevisionResult<AgentRevisionCatalog> {
        if !self.catalog_path.exists() {
            return Ok(AgentRevisionCatalog::empty(self.scope.clone()));
        }
        let metadata =
            fs::metadata(&self.catalog_path).map_err(|error| io_error("inspect catalog", error))?;
        if metadata.len() > MAX_AGENT_REVISION_CATALOG_BYTES {
            return Err(AgentRevisionError::new(
                AgentRevisionErrorCode::Serialization,
                format!(
                    "Agent revision catalog exceeds the {MAX_AGENT_REVISION_CATALOG_BYTES}-byte limit"
                ),
                false,
            ));
        }
        let bytes =
            fs::read(&self.catalog_path).map_err(|error| io_error("read catalog", error))?;
        let catalog: AgentRevisionCatalog = serde_json::from_slice(&bytes).map_err(|error| {
            AgentRevisionError::new(
                AgentRevisionErrorCode::Serialization,
                format!("Cannot parse Agent revision catalog: {error}"),
                false,
            )
        })?;
        if catalog.schema_version != AGENT_REVISION_CATALOG_SCHEMA_VERSION {
            return Err(AgentRevisionError::new(
                AgentRevisionErrorCode::Serialization,
                format!(
                    "Unsupported Agent revision catalog schema: {}",
                    catalog.schema_version
                ),
                false,
            ));
        }
        if catalog.scope != self.scope {
            return Err(AgentRevisionError::new(
                AgentRevisionErrorCode::WorkspaceScopeMismatch,
                "Agent revision catalog scope does not match the trusted workspace facts",
                false,
            ));
        }
        for (index, definition) in catalog.definitions.iter().enumerate() {
            if catalog.definitions[index + 1..]
                .iter()
                .any(|candidate| candidate.persona_key == definition.persona_key)
            {
                return Err(AgentRevisionError::new(
                    AgentRevisionErrorCode::Serialization,
                    format!(
                        "Agent revision catalog contains a duplicate persona key: {}",
                        definition.persona_key
                    ),
                    false,
                ));
            }
        }
        Ok(catalog)
    }

    fn save_locked(&self, catalog: &AgentRevisionCatalog) -> AgentRevisionResult<()> {
        let bytes = serde_json::to_vec_pretty(catalog).map_err(|error| {
            AgentRevisionError::new(
                AgentRevisionErrorCode::Serialization,
                format!("Cannot serialize Agent revision catalog: {error}"),
                false,
            )
        })?;
        if bytes.len() as u64 > MAX_AGENT_REVISION_CATALOG_BYTES {
            return Err(AgentRevisionError::new(
                AgentRevisionErrorCode::Serialization,
                format!(
                    "Serialized Agent revision catalog exceeds the {MAX_AGENT_REVISION_CATALOG_BYTES}-byte limit"
                ),
                false,
            ));
        }
        crate::service::atomic_file::replace_file_with_recovery(
            &self.catalog_path,
            &self.recovery_path,
            &bytes,
        )
        .map_err(|message| atomic_replace_error(message, &self.recovery_path))
    }
}

impl AgentRevisionCatalogStore for FileAgentRevisionCatalogStore {
    fn scope(&self) -> &AgentRevisionScope {
        &self.scope
    }

    fn read<T>(
        &self,
        operation: impl FnOnce(&AgentRevisionCatalog) -> AgentRevisionResult<T>,
    ) -> AgentRevisionResult<T> {
        self.with_locked_catalog(operation)
    }

    fn mutate<T>(
        &self,
        operation: impl FnOnce(
            &mut AgentRevisionCatalog,
        ) -> AgentRevisionResult<AgentRevisionCatalogMutation<T>>,
    ) -> AgentRevisionResult<T> {
        self.with_lock(|catalog| {
            let mutation = operation(catalog)?;
            if mutation.changed {
                catalog.catalog_revision =
                    catalog.catalog_revision.checked_add(1).ok_or_else(|| {
                        AgentRevisionError::new(
                            AgentRevisionErrorCode::Serialization,
                            "Agent revision catalog revision overflow",
                            false,
                        )
                    })?;
                self.save_locked(catalog)?;
            }
            Ok(mutation.value)
        })
    }

    fn read_legacy_source(&self, path: &Path) -> AgentRevisionResult<String> {
        fs::read_to_string(path).map_err(|error| {
            AgentRevisionError::new(
                AgentRevisionErrorCode::SourceConflict,
                format!("Cannot read legacy Agent source: {error}"),
                true,
            )
        })
    }
}

fn io_error(operation: &str, error: std::io::Error) -> AgentRevisionError {
    AgentRevisionError::new(
        AgentRevisionErrorCode::Io,
        format!("Cannot {operation}: {error}"),
        true,
    )
}

fn atomic_replace_error(message: String, recovery_path: &Path) -> AgentRevisionError {
    if message.contains("cannot restore recovery file:") {
        let mut error = AgentRevisionError::new(
            AgentRevisionErrorCode::RollbackFailed,
            format!("Cannot atomically replace Agent revision catalog: {message}"),
            true,
        );
        error.recovery_path = Some(recovery_path.to_string_lossy().into_owned());
        error
    } else {
        AgentRevisionError::new(
            AgentRevisionErrorCode::Io,
            format!("Cannot atomically replace Agent revision catalog: {message}"),
            true,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentic::agent_revisions::{
        AgentDraftStatus, AgentRevisionContent, AgentRevisionErrorCode, AgentRevisionScope,
        AgentRevisionService, AgentRevisionWorkspaceBackend, AgentRevisionWorkspaceFacts,
        AgentValidationEvidenceInput, AgentValidationStatus, LegacyAgentImport,
        OpenAgentRevisionDraftRequest, PublishAgentRevisionRequest,
        RecordAgentRevisionValidationRequest, SaveAgentRevisionDraftRequest,
    };
    use std::fs;
    use uuid::Uuid;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "void-agent-revision-{label}-{}-{}",
                std::process::id(),
                Uuid::new_v4()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn content(persona_key: &str, prompt: &str) -> AgentRevisionContent {
        AgentRevisionContent {
            persona_key: persona_key.to_string(),
            display_name: "Agent".to_string(),
            description: "Test Agent".to_string(),
            prompt: prompt.to_string(),
            tools: vec!["Read".to_string()],
            readonly: true,
            review: false,
            model: "fast".to_string(),
            allowed_parent_agent_ids: vec!["agentic".to_string()],
        }
    }

    fn user_service(
        directory: &TestDirectory,
    ) -> AgentRevisionService<FileAgentRevisionCatalogStore> {
        let path_manager = Arc::new(PathManager::with_user_root_for_tests(
            directory.0.join("user-root"),
        ));
        let store =
            FileAgentRevisionCatalogStore::for_scope(path_manager, AgentRevisionScope::user())
                .unwrap();
        AgentRevisionService::new(store)
    }

    fn user_store(directory: &TestDirectory) -> FileAgentRevisionCatalogStore {
        FileAgentRevisionCatalogStore::for_scope(
            Arc::new(PathManager::with_user_root_for_tests(
                directory.0.join("user-root"),
            )),
            AgentRevisionScope::user(),
        )
        .unwrap()
    }

    fn open_legacy(
        service: &AgentRevisionService<FileAgentRevisionCatalogStore>,
        legacy_path: &Path,
        raw: &str,
        persona_key: &str,
        runtime_alias: &str,
    ) -> crate::agentic::agent_revisions::AgentDraftRecord {
        service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some(persona_key.to_string()),
                initial_content: None,
                legacy_import: Some(LegacyAgentImport {
                    source_path: legacy_path.to_path_buf(),
                    raw_document: raw.to_string(),
                    runtime_revision_alias: runtime_alias.to_string(),
                    content: content(persona_key, "Pinned v3"),
                }),
                idempotency_key: format!("open-{persona_key}"),
            })
            .unwrap()
    }

    #[test]
    fn importing_legacy_agent_preserves_the_source_and_runtime_revision_alias() {
        let directory = TestDirectory::new("legacy-import");
        let legacy_path = directory.0.join("legacy.md");
        let raw = "---\nname: legacy\ndescription: Legacy\n---\nPinned v3\n";
        fs::write(&legacy_path, raw).unwrap();
        let service = user_service(&directory);

        let draft = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some("user::void::legacy".to_string()),
                initial_content: None,
                legacy_import: Some(LegacyAgentImport {
                    source_path: legacy_path.clone(),
                    raw_document: raw.to_string(),
                    runtime_revision_alias: "legacy-runtime-v3".to_string(),
                    content: content("user::void::legacy", "Pinned v3"),
                }),
                idempotency_key: "open-legacy".to_string(),
            })
            .expect("legacy Agent should import");

        assert_eq!(fs::read_to_string(&legacy_path).unwrap(), raw);
        let definition = service.get_definition(&draft.definition_id).unwrap();
        assert_eq!(definition.default_revision_id, draft.base_revision_id);
        assert_eq!(
            definition.latest_published_revision_id,
            draft.base_revision_id
        );
        assert_eq!(definition.revisions.len(), 1);
        assert_eq!(
            definition.revisions[0].legacy_runtime_revision_aliases,
            vec!["legacy-runtime-v3".to_string()]
        );
    }

    #[test]
    fn changed_legacy_source_stops_authoring_without_overwriting_either_source() {
        let directory = TestDirectory::new("legacy-source-conflict");
        let legacy_path = directory.0.join("legacy.md");
        let original = "legacy v3";
        fs::write(&legacy_path, original).unwrap();
        let service = user_service(&directory);
        let draft = open_legacy(
            &service,
            &legacy_path,
            original,
            "user::void::legacy",
            "runtime-v3",
        );
        fs::write(&legacy_path, "external v5").unwrap();

        let error = service
            .save_draft(SaveAgentRevisionDraftRequest {
                definition_id: draft.definition_id,
                draft_id: draft.draft_id,
                expected_draft_revision_id: draft.draft_revision_id,
                content: content("user::void::legacy", "proposed v4"),
                idempotency_key: "save-v4".to_string(),
            })
            .unwrap_err();

        assert_eq!(error.code, AgentRevisionErrorCode::SourceConflict);
        assert_eq!(fs::read_to_string(&legacy_path).unwrap(), "external v5");
    }

    #[test]
    fn restart_resolves_legacy_alias_and_new_immutable_revision_independently() {
        let directory = TestDirectory::new("restart-resolution");
        let legacy_path = directory.0.join("legacy.md");
        let raw = "legacy v3";
        fs::write(&legacy_path, raw).unwrap();
        let store = user_store(&directory);
        let service = AgentRevisionService::new(store.clone());
        let draft = open_legacy(
            &service,
            &legacy_path,
            raw,
            "user::void::legacy",
            "runtime-v3",
        );
        let saved = service
            .save_draft(SaveAgentRevisionDraftRequest {
                definition_id: draft.definition_id.clone(),
                draft_id: draft.draft_id.clone(),
                expected_draft_revision_id: draft.draft_revision_id,
                content: content("user::void::legacy", "Published v4"),
                idempotency_key: "save-v4".to_string(),
            })
            .unwrap();
        let validated = service
            .record_validation(RecordAgentRevisionValidationRequest {
                definition_id: saved.definition_id.clone(),
                draft_id: saved.draft_id.clone(),
                draft_revision_id: saved.draft_revision_id.clone(),
                evidence: AgentValidationEvidenceInput {
                    status: AgentValidationStatus::Passed,
                    debug_session_id: Some("debug-v4".to_string()),
                    test_case_id: None,
                    capability_snapshot: vec!["Read".to_string()],
                    message: None,
                },
                idempotency_key: "validate-v4".to_string(),
            })
            .unwrap();
        assert_eq!(validated.status, AgentDraftStatus::Validated);
        let published = service
            .publish(PublishAgentRevisionRequest {
                definition_id: saved.definition_id,
                draft_id: saved.draft_id,
                expected_base_revision_id: saved.base_revision_id,
                expected_draft_revision_id: saved.draft_revision_id,
                idempotency_key: "publish-v4".to_string(),
            })
            .unwrap();
        drop(service);

        let restarted = AgentRevisionService::new(user_store(&directory));
        let v3 = restarted
            .resolve_published_revision("user::void::legacy", "runtime-v3")
            .unwrap()
            .unwrap();
        let v4 = restarted
            .resolve_published_revision("user::void::legacy", &published.revision.revision_id)
            .unwrap()
            .unwrap();
        assert_eq!(v3.content.prompt, "Pinned v3");
        assert_eq!(v4.content.prompt, "Published v4");
        assert_ne!(v3.revision_id, v4.revision_id);
    }

    #[test]
    fn user_and_project_catalogs_with_same_persona_suffix_never_alias() {
        let directory = TestDirectory::new("scope-isolation");
        let path_manager = Arc::new(PathManager::with_user_root_for_tests(
            directory.0.join("user-root"),
        ));
        let workspace = directory.0.join("workspace");
        fs::create_dir_all(&workspace).unwrap();
        let user_source = directory.0.join("user.md");
        let project_source = directory.0.join("project.md");
        fs::write(&user_source, "user source").unwrap();
        fs::write(&project_source, "project source").unwrap();
        let user = AgentRevisionService::new(
            FileAgentRevisionCatalogStore::for_scope(
                path_manager.clone(),
                AgentRevisionScope::user(),
            )
            .unwrap(),
        );
        let project = AgentRevisionService::new(
            FileAgentRevisionCatalogStore::for_scope(
                path_manager,
                AgentRevisionScope::local_project("workspace-1", workspace),
            )
            .unwrap(),
        );
        open_legacy(
            &user,
            &user_source,
            "user source",
            "user::void::shared",
            "user-v3",
        );
        open_legacy(
            &project,
            &project_source,
            "project source",
            "project::void::shared",
            "project-v3",
        );

        assert!(user
            .resolve_published_revision("user::void::shared", "user-v3")
            .unwrap()
            .is_some());
        assert!(project
            .resolve_published_revision("project::void::shared", "project-v3")
            .unwrap()
            .is_some());
        assert!(user
            .resolve_published_revision("project::void::shared", "project-v3")
            .unwrap()
            .is_none());
        assert!(project
            .resolve_published_revision("user::void::shared", "user-v3")
            .unwrap()
            .is_none());
    }

    #[test]
    fn interrupted_replacement_recovers_and_failed_recovery_preserves_old_catalog() {
        let directory = TestDirectory::new("atomic-recovery");
        let store = user_store(&directory);
        let service = AgentRevisionService::new(store.clone());
        let draft = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some("user::void::stable".to_string()),
                initial_content: Some(content("user::void::stable", "v1")),
                legacy_import: None,
                idempotency_key: "open-stable".to_string(),
            })
            .unwrap();
        fs::rename(&store.catalog_path, &store.recovery_path).unwrap();

        let recovered = AgentRevisionService::new(user_store(&directory))
            .get_definition(&draft.definition_id)
            .unwrap();
        assert_eq!(recovered.persona_key, "user::void::stable");

        fs::create_dir(&store.recovery_path).unwrap();
        let error = service
            .save_draft(SaveAgentRevisionDraftRequest {
                definition_id: draft.definition_id.clone(),
                draft_id: draft.draft_id.clone(),
                expected_draft_revision_id: draft.draft_revision_id.clone(),
                content: content("user::void::stable", "must not persist"),
                idempotency_key: "failed-save".to_string(),
            })
            .unwrap_err();
        assert_eq!(error.code, AgentRevisionErrorCode::RollbackFailed);
        assert_eq!(
            error.recovery_path.as_deref(),
            Some(store.recovery_path.to_string_lossy().as_ref())
        );
        fs::remove_dir(&store.recovery_path).unwrap();
        let unchanged = AgentRevisionService::new(user_store(&directory))
            .get_definition(&draft.definition_id)
            .unwrap();
        let persisted_draft = unchanged
            .drafts
            .iter()
            .find(|candidate| candidate.draft_id == draft.draft_id)
            .unwrap();
        assert_eq!(persisted_draft.content.prompt, "v1");
    }

    #[test]
    fn project_catalog_requires_matching_workspace_id_and_rejects_remote_backend() {
        let directory = TestDirectory::new("workspace-authority");
        let path_manager = Arc::new(PathManager::with_user_root_for_tests(
            directory.0.join("user-root"),
        ));
        let workspace = directory.0.join("workspace");
        fs::create_dir_all(&workspace).unwrap();
        let service = AgentRevisionService::new(
            FileAgentRevisionCatalogStore::for_scope(
                path_manager.clone(),
                AgentRevisionScope::local_project("workspace-a", workspace.clone()),
            )
            .unwrap(),
        );
        let draft = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some("project::void::scoped".to_string()),
                initial_content: Some(content("project::void::scoped", "project")),
                legacy_import: None,
                idempotency_key: "open-project".to_string(),
            })
            .unwrap();

        let wrong_identity = AgentRevisionService::new(
            FileAgentRevisionCatalogStore::for_scope(
                path_manager.clone(),
                AgentRevisionScope::local_project("workspace-b", workspace.clone()),
            )
            .unwrap(),
        )
        .get_definition(&draft.definition_id)
        .unwrap_err();
        assert_eq!(
            wrong_identity.code,
            AgentRevisionErrorCode::WorkspaceScopeMismatch
        );

        let remote = FileAgentRevisionCatalogStore::for_scope(
            path_manager,
            AgentRevisionScope {
                level: crate::agentic::agent_revisions::AgentRevisionLevel::Project,
                workspace: Some(AgentRevisionWorkspaceFacts {
                    workspace_id: "workspace-a".to_string(),
                    workspace_path: workspace,
                    backend: AgentRevisionWorkspaceBackend::Remote,
                }),
            },
        )
        .err()
        .expect("remote project authoring must fail closed");
        assert_eq!(
            remote.code,
            AgentRevisionErrorCode::UnsupportedRemoteProject
        );
    }

    #[test]
    fn catalog_only_definition_reopens_the_same_draft_without_a_legacy_file() {
        let directory = TestDirectory::new("catalog-only-reopen");
        let first = AgentRevisionService::new(user_store(&directory));
        let opened = first
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some("user::void::catalog-only".to_string()),
                initial_content: Some(content("user::void::catalog-only", "v1")),
                legacy_import: None,
                idempotency_key: "open-first".to_string(),
            })
            .unwrap();
        drop(first);

        let reopened = AgentRevisionService::new(user_store(&directory))
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some("user::void::catalog-only".to_string()),
                initial_content: None,
                legacy_import: None,
                idempotency_key: "open-after-restart".to_string(),
            })
            .unwrap();

        assert_eq!(reopened.draft_id, opened.draft_id);
        assert_eq!(reopened.draft_revision_id, opened.draft_revision_id);
        assert_eq!(reopened.content, opened.content);
    }

    #[test]
    fn atomic_replace_error_distinguishes_rollback_failure_and_reports_recovery_path() {
        let recovery = PathBuf::from(r"D:\workspace\.void\agent-definitions\catalog.json.recovery");
        let rollback = atomic_replace_error(
            "cannot promote persistence file: denied; cannot restore recovery file: busy"
                .to_string(),
            &recovery,
        );
        assert_eq!(rollback.code, AgentRevisionErrorCode::RollbackFailed);
        assert_eq!(
            rollback.recovery_path.as_deref(),
            Some(recovery.to_string_lossy().as_ref())
        );

        let ordinary = atomic_replace_error("access denied".to_string(), &recovery);
        assert_eq!(ordinary.code, AgentRevisionErrorCode::Io);
        assert!(ordinary.recovery_path.is_none());
    }

    #[test]
    fn persisted_catalog_rejects_duplicate_persona_keys() {
        let directory = TestDirectory::new("duplicate-persona");
        let store = user_store(&directory);
        let service = AgentRevisionService::new(store.clone());
        let opened = service
            .open_draft(OpenAgentRevisionDraftRequest {
                definition_id: None,
                persona_key: Some("user::void::unique".to_string()),
                initial_content: Some(content("user::void::unique", "v1")),
                legacy_import: None,
                idempotency_key: "open-unique".to_string(),
            })
            .unwrap();
        let mut catalog: AgentRevisionCatalog =
            serde_json::from_slice(&fs::read(&store.catalog_path).unwrap()).unwrap();
        let mut duplicate = catalog.definitions[0].clone();
        duplicate.definition_id = "agent-def-duplicate".to_string();
        catalog.definitions.push(duplicate);
        fs::write(&store.catalog_path, serde_json::to_vec(&catalog).unwrap()).unwrap();

        let error = service.get_definition(&opened.definition_id).unwrap_err();
        assert_eq!(error.code, AgentRevisionErrorCode::Serialization);
    }
}
