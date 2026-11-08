//! The plugin permission vocabulary.
//!
//! Permissions are declared in `manifest.json` and enforced by the host's
//! capability broker. The strings are a public API: renaming one is a breaking
//! change for every published plugin.

use std::collections::BTreeSet;
use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::error::DevDeckError;

/// A capability a plugin may request from the host.
///
/// `Permission::as_str` is the wire representation used in manifests, registry
/// indexes, and SDK error payloads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Permission {
    /// Per-plugin key/value storage owned by the host.
    StorageKv,
    /// HTTP requests proxied by the host (no CORS restrictions, host-side fetch).
    HttpProxy,
    /// HTTP requests issued directly by the plugin webview (subject to CORS).
    HttpExternal,
    /// Host-mediated file open/save dialogs.
    FsDialog,
    /// Read files the user granted through a dialog.
    FsRead,
    /// Write files the user granted through a dialog.
    FsWrite,
    /// Read/write inside the plugin's own data directory.
    FsPluginData,
    /// Raw TCP/UDP client and server sockets.
    NetSocket,
    /// SSH/SFTP sessions.
    NetSsh,
    /// Open a URL in the user's default browser.
    SystemOpenExternal,
    /// Reveal a path in the OS file manager.
    SystemRevealPath,
    /// Open a path with the OS default handler.
    SystemOpenPath,
    /// Desktop notifications.
    SystemNotifications,
    /// Read allowlisted environment variables.
    SystemEnvRead,
    /// Read host/browser metadata.
    SystemGetInfo,
    /// Write to the clipboard.
    ClipboardWrite,
    /// Write structured entries to the host log.
    LogWrite,
    /// Read the host theme (light/dark).
    ThemeRead,
    /// Reserved: Bluetooth access (not implemented in this build).
    Bluetooth,
    /// Reserved: serial port access (not implemented in this build).
    Serial,
    /// Reserved: USB device access (not implemented in this build).
    Usb,
}

impl Permission {
    /// Every permission understood by this build.
    pub const ALL: &'static [Permission] = &[
        Permission::StorageKv,
        Permission::HttpProxy,
        Permission::HttpExternal,
        Permission::FsDialog,
        Permission::FsRead,
        Permission::FsWrite,
        Permission::FsPluginData,
        Permission::NetSocket,
        Permission::NetSsh,
        Permission::SystemOpenExternal,
        Permission::SystemRevealPath,
        Permission::SystemOpenPath,
        Permission::SystemNotifications,
        Permission::SystemEnvRead,
        Permission::SystemGetInfo,
        Permission::ClipboardWrite,
        Permission::LogWrite,
        Permission::ThemeRead,
        Permission::Bluetooth,
        Permission::Serial,
        Permission::Usb,
    ];

    /// Wire identifier, e.g. `"storage:kv"`.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::StorageKv => "storage:kv",
            Self::HttpProxy => "http:proxy",
            Self::HttpExternal => "http:external",
            Self::FsDialog => "fs:dialog",
            Self::FsRead => "fs:read",
            Self::FsWrite => "fs:write",
            Self::FsPluginData => "fs:plugin-data",
            Self::NetSocket => "net:socket",
            Self::NetSsh => "net:ssh",
            Self::SystemOpenExternal => "system:openExternal",
            Self::SystemRevealPath => "system:revealPath",
            Self::SystemOpenPath => "system:openPath",
            Self::SystemNotifications => "system:notifications",
            Self::SystemEnvRead => "system:env:read",
            Self::SystemGetInfo => "system:getInfo",
            Self::ClipboardWrite => "clipboard:write",
            Self::LogWrite => "log:write",
            Self::ThemeRead => "theme:read",
            Self::Bluetooth => "bluetooth",
            Self::Serial => "serial",
            Self::Usb => "usb",
        }
    }

    /// Short human-readable label for the install consent screen.
    pub fn summary(self) -> &'static str {
        match self {
            Self::StorageKv => "Store plugin settings and data",
            Self::HttpProxy => "Make HTTP requests through DevDeck",
            Self::HttpExternal => "Make HTTP requests directly to allowlisted domains",
            Self::FsDialog => "Ask you to choose files to open or save",
            Self::FsRead => "Read files you selected in a dialog",
            Self::FsWrite => "Write files you selected in a dialog",
            Self::FsPluginData => "Read and write its own data folder",
            Self::NetSocket => "Open TCP/UDP sockets",
            Self::NetSsh => "Open SSH and SFTP connections",
            Self::SystemOpenExternal => "Open links in your browser",
            Self::SystemRevealPath => "Show files in your file manager",
            Self::SystemOpenPath => "Open files with their default app",
            Self::SystemNotifications => "Send desktop notifications",
            Self::SystemEnvRead => "Read specific environment variables",
            Self::SystemGetInfo => "Read app and system information",
            Self::ClipboardWrite => "Write to your clipboard",
            Self::LogWrite => "Write diagnostic log entries",
            Self::ThemeRead => "Read the current theme",
            Self::Bluetooth => "Access Bluetooth devices (not available yet)",
            Self::Serial => "Access serial ports (not available yet)",
            Self::Usb => "Access USB devices (not available yet)",
        }
    }

    /// `true` when the permission only makes sense with an allowlist.
    pub fn requires_allowlist(self) -> bool {
        matches!(self, Self::HttpExternal | Self::SystemEnvRead)
    }

    /// `true` when this build can actually satisfy the permission.
    ///
    /// Reserved permissions are accepted in manifests (so older plugins keep
    /// installing) but produce a validation warning and fail at runtime with
    /// `unsupported`.
    pub fn is_implemented(self) -> bool {
        !matches!(self, Self::Bluetooth | Self::Serial | Self::Usb)
    }

    /// Permissions considered privileged; the UI warns more loudly about these.
    pub fn is_sensitive(self) -> bool {
        matches!(
            self,
            Self::NetSocket
                | Self::NetSsh
                | Self::FsRead
                | Self::FsWrite
                | Self::Bluetooth
                | Self::Serial
                | Self::Usb
                | Self::SystemOpenPath
                | Self::SystemRevealPath
                | Self::SystemEnvRead
                | Self::FsPluginData
        )
    }
}

impl fmt::Display for Permission {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for Permission {
    type Err = DevDeckError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::ALL
            .iter()
            .copied()
            .find(|p| p.as_str() == value)
            .ok_or_else(|| DevDeckError::UnknownPermission(value.to_string()))
    }
}

impl TryFrom<String> for Permission {
    type Error = DevDeckError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl Serialize for Permission {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for Permission {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = String::deserialize(deserializer)?;
        raw.parse().map_err(serde::de::Error::custom)
    }
}

/// An ordered, duplicate-free set of permissions.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct PermissionSet(BTreeSet<Permission>);

impl PermissionSet {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&mut self, permission: Permission) -> bool {
        self.0.insert(permission)
    }

    pub fn contains(&self, permission: Permission) -> bool {
        self.0.contains(&permission)
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &Permission> {
        self.0.iter()
    }

    pub fn as_strings(&self) -> Vec<&'static str> {
        self.0.iter().map(|p| p.as_str()).collect()
    }
}

impl FromIterator<Permission> for PermissionSet {
    fn from_iter<T: IntoIterator<Item = Permission>>(iter: T) -> Self {
        Self(iter.into_iter().collect())
    }
}

impl IntoIterator for PermissionSet {
    type Item = Permission;
    type IntoIter = std::collections::btree_set::IntoIter<Permission>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_names_are_stable() {
        assert_eq!(Permission::StorageKv.as_str(), "storage:kv");
        assert_eq!(Permission::HttpExternal.as_str(), "http:external");
        assert_eq!(Permission::SystemEnvRead.as_str(), "system:env:read");
        assert_eq!(
            Permission::SystemOpenExternal.as_str(),
            "system:openExternal"
        );
    }

    #[test]
    fn every_permission_round_trips() {
        for permission in Permission::ALL {
            let raw = permission.as_str();
            assert_eq!(raw.parse::<Permission>().unwrap(), *permission);
            let json = serde_json::to_string(permission).unwrap();
            assert_eq!(json, format!("\"{raw}\""));
            let back: Permission = serde_json::from_str(&json).unwrap();
            assert_eq!(back, *permission);
        }
    }

    #[test]
    fn unknown_permission_is_an_error() {
        let err = "net:quic".parse::<Permission>().unwrap_err();
        assert_eq!(err.code(), "unknown_permission");
    }

    #[test]
    fn permission_set_dedupes_and_sorts() {
        let set: PermissionSet = [
            Permission::LogWrite,
            Permission::StorageKv,
            Permission::LogWrite,
        ]
        .into_iter()
        .collect();
        assert_eq!(set.len(), 2);
        assert_eq!(set.as_strings(), vec!["storage:kv", "log:write"]);
    }
}
