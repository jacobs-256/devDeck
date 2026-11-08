//! Capability enforcement for Marketplace plugins.
//!
//! Design rule: **the host never trusts the renderer or the plugin**. Every
//! privileged operation goes through [`CapabilityBroker`], which answers two
//! questions:
//!
//! 1. Did the manifest declare this permission?
//! 2. Is this specific request inside the allowlist (host, path, env var)?
//!
//! A `Grant` is derived from a validated manifest at install time and kept in
//! memory. Revoking the grant revokes every capability at once.

pub mod broker;
pub mod path;

pub use broker::{CapabilityBroker, Grant, GrantSummary};
pub use path::{ensure_within, resolve_within, PathSandbox};
