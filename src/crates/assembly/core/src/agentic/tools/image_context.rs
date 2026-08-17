//! Image context provider and shared in-memory image storage.
//!
//! Through dependency injection mode, tools can access image context without
//! directly depending on specific implementations.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, LazyLock};
use std::time::{SystemTime, UNIX_EPOCH};

/// Image context data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageContextData {
    pub id: String,
    pub image_path: Option<String>,
    pub data_url: Option<String>,
    pub mime_type: String,
    pub image_name: String,
    pub file_size: usize,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub source: String,
}

static IMAGE_STORAGE: LazyLock<DashMap<String, (ImageContextData, u64)>> =
    LazyLock::new(DashMap::new);
const DEFAULT_IMAGE_MAX_AGE_SECS: u64 = 300;

/// Image context provider trait
///
/// Types that implement this trait can provide image data access capabilities to tools
pub trait ImageContextProvider: Send + Sync + std::fmt::Debug {
    /// Get image context data by image_id
    fn get_image(&self, image_id: &str) -> Option<ImageContextData>;

    /// Optional: delete image context (clean up after use)
    fn remove_image(&self, image_id: &str) {
        // Default implementation: do nothing
        let _ = image_id;
    }
}

/// Optional wrapper type, for convenience
pub type ImageContextProviderRef = Arc<dyn ImageContextProvider>;

pub fn store_image_context(image: ImageContextData) {
    let image_id = image.id.clone();
    let timestamp = current_unix_timestamp();
    IMAGE_STORAGE.insert(image_id, (image, timestamp));
    cleanup_expired_images(DEFAULT_IMAGE_MAX_AGE_SECS);
}

pub fn store_image_contexts(images: Vec<ImageContextData>) {
    for image in images {
        store_image_context(image);
    }
}

pub fn get_image_context(image_id: &str) -> Option<ImageContextData> {
    IMAGE_STORAGE
        .get(image_id)
        .map(|entry| entry.value().0.clone())
}

pub fn find_image_context_by_reference(reference: &str) -> Option<ImageContextData> {
    let trimmed = reference.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(image) = get_image_context(trimmed) {
        return Some(image);
    }

    let file_name = std::path::Path::new(trimmed)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(trimmed);

    let mut matched: Option<ImageContextData> = None;
    for entry in IMAGE_STORAGE.iter() {
        let image = &entry.value().0;
        if image.image_name == trimmed || image.image_name == file_name {
            if matched.is_some() {
                return None;
            }
            matched = Some(image.clone());
        }
    }

    matched
}

pub fn remove_image_context(image_id: &str) {
    IMAGE_STORAGE.remove(image_id);
}

pub fn format_image_context_reference(image: &ImageContextData) -> String {
    let size_label = if image.file_size > 0 {
        format!(" ({:.1}KB)", image.file_size as f64 / 1024.0)
    } else {
        String::new()
    };

    if let Some(image_path) = &image.image_path {
        format!(
            "[Image: {}{}]\nPath: {}",
            image.image_name, size_label, image_path
        )
    } else {
        format!(
            "[Image: {}{} (from clipboard)]\nImage ID: {}",
            image.image_name, size_label, image.id
        )
    }
}

#[derive(Debug)]
pub struct GlobalImageContextProvider;

impl ImageContextProvider for GlobalImageContextProvider {
    fn get_image(&self, image_id: &str) -> Option<ImageContextData> {
        get_image_context(image_id)
    }

    fn remove_image(&self, image_id: &str) {
        remove_image_context(image_id);
    }
}

pub fn create_image_context_provider() -> GlobalImageContextProvider {
    GlobalImageContextProvider
}

fn cleanup_expired_images(max_age_secs: u64) {
    let now = current_unix_timestamp();
    let expired_keys: Vec<String> = IMAGE_STORAGE
        .iter()
        .filter(|entry| now.saturating_sub(entry.value().1) > max_age_secs)
        .map(|entry| entry.key().clone())
        .collect();

    for key in expired_keys {
        IMAGE_STORAGE.remove(&key);
    }
}

fn current_unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::{
        cleanup_expired_images, find_image_context_by_reference, get_image_context,
        remove_image_context, store_image_context, ImageContextData, IMAGE_STORAGE,
    };

    fn image(id: &str, image_path: Option<&str>, image_name: &str) -> ImageContextData {
        ImageContextData {
            id: id.to_string(),
            image_path: image_path.map(ToString::to_string),
            data_url: None,
            mime_type: "image/png".to_string(),
            image_name: image_name.to_string(),
            file_size: 10,
            width: Some(1),
            height: Some(1),
            source: "test".to_string(),
        }
    }

    fn unique_name(prefix: &str) -> String {
        format!("{prefix}-{}.png", uuid::Uuid::new_v4())
    }

    #[test]
    fn image_context_lookup_matches_id_full_filename_and_basename() {
        let id = format!("img-{}", uuid::Uuid::new_v4());
        let image_name = unique_name("frame");
        let image_path = format!("workspace/assets/{image_name}");
        let lookup_path = format!("other/path/{image_name}");
        store_image_context(image(&id, Some(&image_path), &image_name));

        assert_eq!(
            find_image_context_by_reference(&id).map(|image| image.id),
            Some(id.clone())
        );
        assert_eq!(
            find_image_context_by_reference(&image_name).map(|image| image.id),
            Some(id.clone())
        );
        assert_eq!(
            find_image_context_by_reference(&lookup_path).map(|image| image.id),
            Some(id.clone())
        );

        remove_image_context(&id);
    }

    #[test]
    fn image_context_lookup_returns_none_for_same_name_collision() {
        let id_1 = format!("img-{}", uuid::Uuid::new_v4());
        let id_2 = format!("img-{}", uuid::Uuid::new_v4());
        let image_name = unique_name("collision");
        let path_1 = format!("workspace/a/{image_name}");
        let path_2 = format!("workspace/b/{image_name}");
        let lookup_path = format!("other/path/{image_name}");
        store_image_context(image(&id_1, Some(&path_1), &image_name));
        store_image_context(image(&id_2, Some(&path_2), &image_name));

        assert!(find_image_context_by_reference(&image_name).is_none());
        assert!(find_image_context_by_reference(&lookup_path).is_none());
        assert_eq!(
            find_image_context_by_reference(&id_1).map(|image| image.id),
            Some(id_1.clone())
        );

        remove_image_context(&id_1);
        remove_image_context(&id_2);
    }

    #[test]
    fn image_context_expiration_removes_stale_entries() {
        let id = format!("img-{}", uuid::Uuid::new_v4());
        let image_name = unique_name("expired");
        IMAGE_STORAGE.insert(
            id.clone(),
            (
                image(
                    &id,
                    Some(&format!("workspace/assets/{image_name}")),
                    &image_name,
                ),
                0,
            ),
        );

        cleanup_expired_images(300);

        assert!(get_image_context(&id).is_none());
        assert!(find_image_context_by_reference(&image_name).is_none());

        remove_image_context(&id);
    }
}
