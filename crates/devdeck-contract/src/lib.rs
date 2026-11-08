//! Stable contracts shared by the DevDeck host, its Rust crates, and the
//! JavaScript plugin SDK.
//!
//! Everything in this crate is deliberately free of Tauri, filesystem, and
//! network dependencies: it is the vocabulary of the ecosystem. Third-party
//! tooling (packagers, registry generators, validators) can depend on this
//! crate without pulling in the desktop application.

pub mod domain;
pub mod error;
pub mod ids;
pub mod manifest;
pub mod path;
pub mod permission;
pub mod registry;

pub use domain::DomainPattern;
pub use error::{DevDeckError, ErrorPayload, Severity, ValidationIssue};
pub use ids::{is_valid_slug, PluginId, MAX_SLUG_LEN};
pub use manifest::{
    current_schema_version, is_safe_relative, PluginAuthor, PluginManifest, CURRENT_SCHEMA_VERSION,
};
pub use path::{ensure_within, resolve_within};
pub use permission::{Permission, PermissionSet};
pub use registry::{EntryStatus, RegistryEntry, RegistryIndex, SignatureEnvelope};

/// Version of the manifest/registry contract implemented by this crate.
pub const CONTRACT_VERSION: u32 = 2;

/// Highest manifest schema version understood by this build.
pub const SUPPORTED_MANIFEST_SCHEMA: u32 = 2;

/// Lowest manifest schema version still accepted (legacy 1.x plugins).
pub const MIN_SUPPORTED_MANIFEST_SCHEMA: u32 = 1;

/// SDK version advertised to plugin authors.
pub const SDK_VERSION: &str = "2.0";

/// Major version of the SDK that plugins must target to be considered native.
pub const SDK_MAJOR: u32 = 2;
