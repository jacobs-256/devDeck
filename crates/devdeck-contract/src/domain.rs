//! HTTP domain allowlist patterns.
//!
//! Manifests declare `httpDomains` such as `"api.ip2location.io"` or
//! `"*.example.com"`. The capability broker uses the same parser, so a pattern
//! that validates here is enforced identically at runtime.

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::error::DevDeckError;

/// A validated domain pattern: an exact host, or a single-level-prefix wildcard.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct DomainPattern {
    host: String,
    wildcard: bool,
}

impl DomainPattern {
    /// Parse and validate a pattern taken from a manifest.
    pub fn parse(raw: &str) -> Result<Self, DevDeckError> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(DevDeckError::InvalidArgument(
                "http domain must not be empty".to_string(),
            ));
        }
        if trimmed != trimmed.to_ascii_lowercase() {
            return Err(DevDeckError::InvalidArgument(format!(
                "http domain '{trimmed}' must be lowercase"
            )));
        }
        if trimmed.contains("://")
            || trimmed.contains('/')
            || trimmed.contains(':')
            || trimmed.contains('@')
            || trimmed.contains(' ')
            || trimmed.contains('?')
            || trimmed.contains('#')
        {
            return Err(DevDeckError::InvalidArgument(format!(
                "http domain '{trimmed}' must be a bare hostname (no scheme, path, port, or query)"
            )));
        }

        let (host, wildcard) = match trimmed.strip_prefix("*.") {
            Some(rest) => (rest, true),
            None => (trimmed, false),
        };

        if wildcard && !host.contains('.') {
            return Err(DevDeckError::InvalidArgument(format!(
                "wildcard domain '{trimmed}' must target a registrable-looking host such as '*.example.com'"
            )));
        }
        validate_hostname(host).map_err(|reason| {
            DevDeckError::InvalidArgument(format!("invalid http domain '{trimmed}': {reason}"))
        })?;

        Ok(Self {
            host: host.to_string(),
            wildcard,
        })
    }

    /// The hostname without the wildcard prefix.
    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn is_wildcard(&self) -> bool {
        self.wildcard
    }

    /// Match a hostname as it appears in a URL (lowercase, no port).
    pub fn matches(&self, host: &str) -> bool {
        let host = host.trim_end_matches('.').to_ascii_lowercase();
        if self.wildcard {
            host.len() > self.host.len()
                && host.ends_with(&self.host)
                && host.as_bytes()[host.len() - self.host.len() - 1] == b'.'
        } else {
            host == self.host
        }
    }
}

impl fmt::Display for DomainPattern {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.wildcard {
            write!(f, "*.{}", self.host)
        } else {
            f.write_str(&self.host)
        }
    }
}

impl TryFrom<String> for DomainPattern {
    type Error = DevDeckError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(&value)
    }
}

impl From<DomainPattern> for String {
    fn from(value: DomainPattern) -> Self {
        value.to_string()
    }
}

fn validate_hostname(host: &str) -> Result<(), &'static str> {
    if host.is_empty() {
        return Err("hostname is empty");
    }
    if host.len() > 253 {
        return Err("hostname is longer than 253 characters");
    }
    if host.starts_with('.') || host.ends_with('.') {
        return Err("hostname must not start or end with a dot");
    }
    if host.contains("..") {
        return Err("hostname contains an empty label");
    }
    for label in host.split('.') {
        if label.is_empty() || label.len() > 63 {
            return Err("hostname label must be 1-63 characters");
        }
        let bytes = label.as_bytes();
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if !(first.is_ascii_alphanumeric()) || !(last.is_ascii_alphanumeric()) {
            return Err("hostname labels must start and end with a letter or digit");
        }
        if !bytes
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-')
        {
            return Err("hostname labels may only contain a-z, 0-9, and '-'");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_host_matches_only_itself() {
        let pattern = DomainPattern::parse("api.ip2location.io").unwrap();
        assert!(pattern.matches("api.ip2location.io"));
        assert!(pattern.matches("API.ip2location.io"));
        assert!(!pattern.matches("evil-api.ip2location.io"));
        assert!(!pattern.matches("ip2location.io"));
        assert!(!pattern.matches("api.ip2location.io.evil.test"));
    }

    #[test]
    fn wildcard_matches_subdomains_not_apex() {
        let pattern = DomainPattern::parse("*.example.com").unwrap();
        assert!(pattern.matches("api.example.com"));
        assert!(pattern.matches("deep.api.example.com"));
        assert!(!pattern.matches("example.com"));
        assert!(!pattern.matches("notexample.com"));
        assert!(!pattern.matches("example.com.evil.test"));
    }

    #[test]
    fn rejects_non_host_inputs() {
        for raw in [
            "",
            "https://example.com",
            "example.com/path",
            "example.com:443",
            "*.com",
            "*.*.example.com",
            "exa mple.com",
            "-example.com",
            "example-.com",
        ] {
            assert!(
                DomainPattern::parse(raw).is_err(),
                "{raw:?} should be rejected"
            );
        }
    }

    #[test]
    fn serializes_as_wire_string() {
        let pattern = DomainPattern::parse("*.example.com").unwrap();
        assert_eq!(
            serde_json::to_string(&pattern).unwrap(),
            "\"*.example.com\""
        );
        let back: DomainPattern = serde_json::from_str("\"api.example.com\"").unwrap();
        assert_eq!(back.host(), "api.example.com");
        assert!(!back.is_wildcard());
    }
}
