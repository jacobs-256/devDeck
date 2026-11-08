//! The Marketplace engine.
//!
//! Responsibilities, in the order a package goes through them:
//!
//! 1. [`signing`] — integrity (SHA-256) and authenticity (Ed25519) checks.
//! 2. [`package`] — safe ZIP extraction with size/entry limits.
//! 3. [`store`] — install, upgrade, enable/disable, uninstall, and state.
//!
//! This crate is UI- and Tauri-agnostic so the packaging CLI, CI validation,
//! and the desktop app all share exactly the same rules.

pub mod package;
pub mod signing;
pub mod sources;
pub mod store;

#[cfg(test)]
mod fixtures;

pub use package::InstallLimits;
pub use signing::{sha256_hex, verify_detached_signature, verify_sha256, KeyId};
pub use sources::{RegistrySource, SourceStore};
pub use store::{
    InstallOptions, InstallSource, InstalledPlugin, MarketplaceService, SignatureExpectation,
};
