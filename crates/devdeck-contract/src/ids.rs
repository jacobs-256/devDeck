//! Identifier types with strict, documented shapes.
//!
//! Plugin ids are part of the public marketplace namespace, so they are kept
//! deliberately boring: lowercase ASCII, digits, and single hyphens.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::error::DevDeckError;

/// Maximum length of a slug (plugin id or category id).
pub const MAX_SLUG_LEN: usize = 64;

/// Returns `true` when `value` is a valid lowercase slug.
///
/// Rules: 1..=64 characters, starts and ends with `[a-z0-9]`, interior
/// characters are `[a-z0-9-]`, and `--` is rejected to keep ids readable.
pub fn is_valid_slug(value: &str) -> bool {
    if value.is_empty() || value.len() > MAX_SLUG_LEN {
        return false;
    }
    let bytes = value.as_bytes();
    let first = bytes[0];
    let last = bytes[bytes.len() - 1];
    if !(first.is_ascii_lowercase() || first.is_ascii_digit()) {
        return false;
    }
    if !(last.is_ascii_lowercase() || last.is_ascii_digit()) {
        return false;
    }
    if value.contains("--") {
        return false;
    }
    bytes
        .iter()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-')
}

/// A validated plugin identifier.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct PluginId(String);

impl PluginId {
    pub fn new(value: impl Into<String>) -> Result<Self, DevDeckError> {
        let value = value.into();
        if !is_valid_slug(&value) {
            return Err(DevDeckError::InvalidArgument(format!(
                "plugin id '{value}' must match [a-z0-9]([a-z0-9-]{{0,62}}[a-z0-9])?"
            )));
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

impl fmt::Display for PluginId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl FromStr for PluginId {
    type Err = DevDeckError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}

impl TryFrom<String> for PluginId {
    type Error = DevDeckError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::new(value)
    }
}

impl From<PluginId> for String {
    fn from(value: PluginId) -> Self {
        value.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_marketplace_shaped_ids() {
        for id in ["market-emoji-search", "devdeck-ssh", "a", "a1", "x-y-z"] {
            assert!(is_valid_slug(id), "{id} should be valid");
        }
    }

    #[test]
    fn rejects_malformed_ids() {
        for id in [
            "",
            "-leading",
            "trailing-",
            "Upper",
            "with space",
            "double--dash",
            "dot.dot",
            "x".repeat(65).as_str(),
        ] {
            assert!(!is_valid_slug(id), "{id:?} should be invalid");
        }
    }

    #[test]
    fn rejects_non_ascii() {
        assert!(!is_valid_slug("插件"));
    }

    #[test]
    fn serde_round_trip() {
        let id = PluginId::new("market-ip-lookup").unwrap();
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, "\"market-ip-lookup\"");
        let back: PluginId = serde_json::from_str(&json).unwrap();
        assert_eq!(back, id);
    }

    #[test]
    fn serde_rejects_invalid() {
        assert!(serde_json::from_str::<PluginId>("\"Bad Id\"").is_err());
    }
}
