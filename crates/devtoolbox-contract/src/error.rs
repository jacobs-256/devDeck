//! Error and validation types shared across the host, crates, and the SDK.
//!
//! Every failure that can cross the host <-> plugin boundary carries a stable
//! machine-readable `code`. Plugin authors and the Marketplace web UI are
//! expected to branch on the code, never on the human-readable message.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Errors produced by DevToolBox host services.
#[derive(Debug, thiserror::Error)]
pub enum DevToolboxError {
    #[error("invalid manifest: {0}")]
    InvalidManifest(String),

    #[error("unknown permission: {0}")]
    UnknownPermission(String),

    #[error("permission denied: {0}")]
    PermissionDenied(String),

    #[error("invalid argument: {0}")]
    InvalidArgument(String),

    #[error("plugin not found: {0}")]
    NotFound(String),

    #[error("plugin already installed: {0}")]
    AlreadyInstalled(String),

    #[error("integrity check failed: {0}")]
    Integrity(String),

    #[error("signature verification failed: {0}")]
    Signature(String),

    #[error("unsupported operation: {0}")]
    Unsupported(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("internal error: {0}")]
    Internal(String),
}

impl DevToolboxError {
    /// Stable, machine-readable identifier for this error.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidManifest(_) => "invalid_manifest",
            Self::UnknownPermission(_) => "unknown_permission",
            Self::PermissionDenied(_) => "permission_denied",
            Self::InvalidArgument(_) => "invalid_argument",
            Self::NotFound(_) => "not_found",
            Self::AlreadyInstalled(_) => "already_installed",
            Self::Integrity(_) => "integrity_check_failed",
            Self::Signature(_) => "signature_invalid",
            Self::Unsupported(_) => "unsupported",
            Self::Io(_) => "io_error",
            Self::Serde(_) => "serialization_error",
            Self::Internal(_) => "internal",
        }
    }

    /// Convenience constructor used by capability checks.
    pub fn denied(reason: impl Into<String>) -> Self {
        Self::PermissionDenied(reason.into())
    }
}

/// Severity assigned to a manifest/registry validation finding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// The document must be rejected.
    Error,
    /// The document is accepted but should be fixed by the author.
    Warning,
}

/// A single validation finding with a stable location and code.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub severity: Severity,
    /// Dotted path of the offending field, for example `permissions[2]`.
    pub field: String,
    /// Stable machine-readable identifier, for example `entry_outside_package`.
    pub code: String,
    pub message: String,
}

impl ValidationIssue {
    pub fn error(
        field: impl Into<String>,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            severity: Severity::Error,
            field: field.into(),
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn warning(
        field: impl Into<String>,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            severity: Severity::Warning,
            field: field.into(),
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn is_error(&self) -> bool {
        self.severity == Severity::Error
    }
}

/// Serializable error payload returned to the renderer / plugin SDK.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

impl From<&DevToolboxError> for ErrorPayload {
    fn from(err: &DevToolboxError) -> Self {
        Self {
            code: err.code().to_string(),
            message: err.to_string(),
            details: None,
        }
    }
}

impl From<DevToolboxError> for ErrorPayload {
    fn from(err: DevToolboxError) -> Self {
        Self::from(&err)
    }
}

impl Serialize for DevToolboxError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        ErrorPayload::from(self).serialize(serializer)
    }
}
