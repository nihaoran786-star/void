//! Integration service owner crate.
//!
//! Heavy external integrations live here behind feature groups so local checks
//! can opt into only the integration family they need.

#[cfg(feature = "announcement")]
pub mod announcement;

#[cfg(feature = "file-watch")]
pub mod file_watch;

pub mod external_config_sources;

#[cfg(feature = "local-asr")]
pub mod local_asr;

#[cfg(feature = "git")]
pub mod git;

#[cfg(feature = "mcp")]
pub mod mcp;

#[cfg(feature = "remote-connect")]
pub mod remote_connect;

#[cfg(feature = "remote-ssh")]
pub mod remote_ssh;

#[cfg(all(windows, feature = "git"))]
#[link(name = "advapi32")]
unsafe extern "system" {}
