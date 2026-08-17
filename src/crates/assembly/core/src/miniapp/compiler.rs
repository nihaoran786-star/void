//! MiniApp compiler compatibility facade.

pub use void_product_domains::miniapp::compiler::{MiniAppCompileError, MiniAppCompileResult};

use crate::miniapp::types::{MiniAppPermissions, MiniAppSource};
use crate::util::errors::{VoidError, VoidResult};

/// Compile MiniApp source into full HTML with Import Map, Runtime Adapter, and CSP injected.
pub fn compile(
    source: &MiniAppSource,
    permissions: &MiniAppPermissions,
    app_id: &str,
    app_data_dir: &str,
    workspace_dir: &str,
    theme: &str,
) -> VoidResult<String> {
    void_product_domains::miniapp::compiler::compile(
        source,
        permissions,
        app_id,
        app_data_dir,
        workspace_dir,
        theme,
    )
    .map_err(|e| VoidError::validation(e.to_string()))
}
