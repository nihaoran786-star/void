use std::fs;
use std::path::Path;
use uuid::Uuid;

/// Replaces a file without relying on same-path rename overwrite semantics.
/// The previous file is restored if promoting the temporary file fails.
pub(crate) fn replace_file(path: &Path, data: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "persistence path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let nonce = Uuid::new_v4();
    let temp = parent.join(format!(".{nonce}.tmp"));
    let backup = parent.join(format!(".{nonce}.bak"));
    fs::write(&temp, data).map_err(|error| error.to_string())?;

    let had_previous = path.exists();
    if had_previous {
        fs::rename(path, &backup).map_err(|error| {
            let _ = fs::remove_file(&temp);
            error.to_string()
        })?;
    }

    if let Err(error) = fs::rename(&temp, path) {
        if had_previous {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temp);
        return Err(error.to_string());
    }
    if had_previous {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

fn validate_recovery_paths<'a>(target: &'a Path, recovery: &Path) -> Result<&'a Path, String> {
    if target == recovery {
        return Err("persistence target and recovery paths must differ".to_string());
    }
    let target_parent = target
        .parent()
        .ok_or_else(|| "persistence target path has no parent".to_string())?;
    let recovery_parent = recovery
        .parent()
        .ok_or_else(|| "persistence recovery path has no parent".to_string())?;
    if target_parent != recovery_parent {
        return Err("persistence target and recovery paths must share a directory".to_string());
    }
    Ok(target_parent)
}

/// Restores an interrupted replacement without searching for sidecar files.
///
/// A present target is authoritative. The exact recovery file is only promoted
/// when the target is missing, or removed when both paths coexist.
pub(crate) fn recover_file(target: &Path, recovery: &Path) -> Result<(), String> {
    validate_recovery_paths(target, recovery)?;
    let target_exists = target.try_exists().map_err(|error| error.to_string())?;
    let recovery_exists = recovery.try_exists().map_err(|error| error.to_string())?;

    match (target_exists, recovery_exists) {
        (false, true) => fs::rename(recovery, target).map_err(|error| error.to_string()),
        (true, true) => fs::remove_file(recovery).map_err(|error| error.to_string()),
        _ => Ok(()),
    }
}

/// Replaces `target` while retaining one deterministic recovery sidecar.
///
/// The recovery path is exact and caller-owned. Promotion failure immediately
/// restores the prior target; if that rollback fails the recovery sidecar is
/// deliberately retained for the next `recover_file` call.
pub(crate) fn replace_file_with_recovery(
    target: &Path,
    recovery: &Path,
    data: &[u8],
) -> Result<(), String> {
    let parent = validate_recovery_paths(target, recovery)?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    recover_file(target, recovery)?;

    let temp = parent.join(format!(".{}.tmp", Uuid::new_v4()));
    fs::write(&temp, data).map_err(|error| {
        let _ = fs::remove_file(&temp);
        error.to_string()
    })?;

    let had_previous = target.try_exists().map_err(|error| {
        let _ = fs::remove_file(&temp);
        error.to_string()
    })?;
    if had_previous {
        fs::rename(target, recovery).map_err(|error| {
            let _ = fs::remove_file(&temp);
            error.to_string()
        })?;
    }

    if let Err(promote_error) = fs::rename(&temp, target) {
        let _ = fs::remove_file(&temp);
        if had_previous {
            if let Err(rollback_error) = fs::rename(recovery, target) {
                return Err(format!(
                    "cannot promote persistence file: {promote_error}; cannot restore recovery file: {rollback_error}"
                ));
            }
        }
        return Err(promote_error.to_string());
    }

    if had_previous {
        let _ = fs::remove_file(recovery);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "void-atomic-file-{label}-{}-{}",
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

    #[test]
    fn recovery_only_is_promoted_to_the_exact_target() {
        let directory = TestDirectory::new("recover-only");
        let target = directory.0.join("record.json");
        let recovery = directory.0.join("record.json.recovery");
        fs::write(&recovery, b"old").unwrap();

        recover_file(&target, &recovery).unwrap();

        assert_eq!(fs::read(&target).unwrap(), b"old");
        assert!(!recovery.exists());
    }

    #[test]
    fn existing_target_wins_and_only_exact_recovery_is_cleaned() {
        let directory = TestDirectory::new("coexist");
        let target = directory.0.join("record.json");
        let recovery = directory.0.join("record.json.recovery");
        let unrelated = directory.0.join("record.json.recovery.keep");
        fs::write(&target, b"new").unwrap();
        fs::write(&recovery, b"old").unwrap();
        fs::write(&unrelated, b"keep").unwrap();

        recover_file(&target, &recovery).unwrap();

        assert_eq!(fs::read(&target).unwrap(), b"new");
        assert!(!recovery.exists());
        assert_eq!(fs::read(&unrelated).unwrap(), b"keep");
    }

    #[test]
    fn replacement_cleans_the_recovery_sidecar() {
        let directory = TestDirectory::new("replace");
        let target = directory.0.join("record.json");
        let recovery = directory.0.join("record.json.recovery");
        fs::write(&target, b"old").unwrap();

        replace_file_with_recovery(&target, &recovery, b"new").unwrap();

        assert_eq!(fs::read(&target).unwrap(), b"new");
        assert!(!recovery.exists());
    }

    #[test]
    fn rejects_same_or_cross_directory_recovery_paths() {
        let directory = TestDirectory::new("paths");
        let target = directory.0.join("record.json");
        assert!(recover_file(&target, &target).is_err());
        assert!(recover_file(&target, &directory.0.join("other/recovery")).is_err());
    }
}
