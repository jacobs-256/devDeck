//! Safe package extraction.
//!
//! A `.zip` from the Marketplace is untrusted input. Extraction enforces:
//!
//! * every path is relative and stays inside the destination (zip-slip),
//! * symbolic links are rejected (they could point outside the plugin dir),
//! * per-file, per-package, and entry-count limits (zip bombs),
//! * the declared uncompressed size must match what was actually written.

use std::io::Cursor;
use std::path::{Path, PathBuf};

use devdeck_contract::{
    ensure_within, is_safe_relative, resolve_within, DevDeckError, PluginManifest,
};
use serde::{Deserialize, Serialize};

/// Resource limits applied while unpacking one plugin package.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallLimits {
    pub max_files: usize,
    pub max_total_bytes: u64,
    pub max_file_bytes: u64,
}

impl Default for InstallLimits {
    fn default() -> Self {
        Self {
            max_files: 20_000,
            max_total_bytes: 512 * 1024 * 1024,
            max_file_bytes: 64 * 1024 * 1024,
        }
    }
}

/// Result of unpacking a package.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExtractedPackage {
    pub files: usize,
    pub total_bytes: u64,
}

/// Unpack a ZIP archive into `dest`.
pub fn extract_zip(
    bytes: &[u8],
    dest: &Path,
    limits: &InstallLimits,
) -> Result<ExtractedPackage, DevDeckError> {
    std::fs::create_dir_all(dest)?;
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|err| {
        DevDeckError::InvalidArgument(format!("package is not a valid zip archive: {err}"))
    })?;

    if archive.len() > limits.max_files {
        return Err(DevDeckError::InvalidArgument(format!(
            "package contains {} entries, the limit is {}",
            archive.len(),
            limits.max_files
        )));
    }

    let mut files = 0usize;
    let mut total_bytes = 0u64;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|err| {
            DevDeckError::InvalidArgument(format!("unreadable zip entry #{index}: {err}"))
        })?;

        let raw_name = entry.name().to_string();
        let trimmed = raw_name.trim_end_matches('/');
        if trimmed.is_empty() {
            continue;
        }
        if !is_safe_relative(trimmed) {
            return Err(DevDeckError::InvalidArgument(format!(
                "package contains an unsafe path: '{raw_name}'"
            )));
        }

        if let Some(mode) = entry.unix_mode() {
            match mode & 0o170000 {
                0 | 0o040000 | 0o100000 => {}
                0o120000 => {
                    return Err(DevDeckError::InvalidArgument(format!(
                        "symbolic links are not allowed in packages: '{raw_name}'"
                    )));
                }
                _ => {
                    return Err(DevDeckError::InvalidArgument(format!(
                        "unsupported file type in package: '{raw_name}'"
                    )));
                }
            }
        }

        let target = resolve_within(dest, trimmed)?;
        if entry.is_dir() {
            std::fs::create_dir_all(&target)?;
            continue;
        }

        let declared_size = entry.size();
        if declared_size > limits.max_file_bytes {
            return Err(DevDeckError::InvalidArgument(format!(
                "'{raw_name}' is larger than the {} byte per-file limit",
                limits.max_file_bytes
            )));
        }

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = std::fs::File::create(&target)?;
        let copied = std::io::copy(&mut entry, &mut out)?;
        if copied != declared_size {
            return Err(DevDeckError::Integrity(format!(
                "'{raw_name}' unpacked {copied} bytes but the archive declared {declared_size}"
            )));
        }

        total_bytes = total_bytes
            .checked_add(copied)
            .ok_or_else(|| DevDeckError::InvalidArgument("package size overflow".to_string()))?;
        if total_bytes > limits.max_total_bytes {
            return Err(DevDeckError::InvalidArgument(format!(
                "package exceeds the {} byte limit",
                limits.max_total_bytes
            )));
        }

        files += 1;
        if files > limits.max_files {
            return Err(DevDeckError::InvalidArgument(format!(
                "package contains more than {} files",
                limits.max_files
            )));
        }
    }

    Ok(ExtractedPackage { files, total_bytes })
}

/// Copy a directory tree (used for `dev` installs and for repacking).
pub fn copy_directory(
    src: &Path,
    dest: &Path,
    limits: &InstallLimits,
) -> Result<ExtractedPackage, DevDeckError> {
    std::fs::create_dir_all(dest)?;
    let mut files = 0usize;
    let mut total_bytes = 0u64;
    copy_inner(src, dest, limits, &mut files, &mut total_bytes)?;
    Ok(ExtractedPackage { files, total_bytes })
}

fn copy_inner(
    src: &Path,
    dest: &Path,
    limits: &InstallLimits,
    files: &mut usize,
    total_bytes: &mut u64,
) -> Result<(), DevDeckError> {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(src)?
        .map(|entry| entry.map(|e| e.path()))
        .collect::<Result<_, _>>()?;
    entries.sort();

    for path in entries {
        let metadata = std::fs::symlink_metadata(&path)?;
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| DevDeckError::InvalidArgument("non-UTF-8 path".to_string()))?;
        if metadata.file_type().is_symlink() {
            return Err(DevDeckError::InvalidArgument(format!(
                "symbolic links are not allowed in packages: '{name}'"
            )));
        }
        let target = dest.join(name);
        if metadata.is_dir() {
            std::fs::create_dir_all(&target)?;
            copy_inner(&path, &target, limits, files, total_bytes)?;
            continue;
        }
        if !metadata.is_file() {
            continue;
        }
        let size = metadata.len();
        if size > limits.max_file_bytes {
            return Err(DevDeckError::InvalidArgument(format!(
                "'{name}' is larger than the per-file limit"
            )));
        }
        std::fs::copy(&path, &target)?;
        *files += 1;
        *total_bytes = total_bytes
            .checked_add(size)
            .ok_or_else(|| DevDeckError::InvalidArgument("package size overflow".to_string()))?;
        if *total_bytes > limits.max_total_bytes {
            return Err(DevDeckError::InvalidArgument(
                "package exceeds the total size limit".to_string(),
            ));
        }
        if *files > limits.max_files {
            return Err(DevDeckError::InvalidArgument(
                "package contains too many files".to_string(),
            ));
        }
    }
    Ok(())
}

/// Read and validate `manifest.json` from an unpacked package root.
pub fn read_manifest(dir: &Path) -> Result<PluginManifest, DevDeckError> {
    let path = dir.join("manifest.json");
    let bytes = std::fs::read(&path).map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            DevDeckError::InvalidManifest(
                "package is missing manifest.json at its root".to_string(),
            )
        } else {
            DevDeckError::Io(err)
        }
    })?;
    let manifest = PluginManifest::from_slice(&bytes)?;
    manifest.validate_strict()?;
    Ok(manifest)
}

/// Assert that the entry point (and optional icon) exist inside the package.
pub fn validate_layout(dir: &Path, manifest: &PluginManifest) -> Result<(), DevDeckError> {
    let entry = resolve_within(dir, &manifest.entry)?;
    let canonical_entry = ensure_within(dir, &entry).map_err(|_| {
        DevDeckError::InvalidManifest(format!(
            "entry '{}' is missing from the package",
            manifest.entry
        ))
    })?;
    if !canonical_entry.is_file() {
        return Err(DevDeckError::InvalidManifest(format!(
            "entry '{}' is not a file",
            manifest.entry
        )));
    }

    if let Some(icon) = &manifest.icon {
        let icon_path = resolve_within(dir, icon)?;
        ensure_within(dir, &icon_path).map_err(|_| {
            DevDeckError::InvalidManifest(format!("icon '{icon}' is missing from the package"))
        })?;
    }

    Ok(())
}
