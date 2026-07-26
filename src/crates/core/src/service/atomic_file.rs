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
