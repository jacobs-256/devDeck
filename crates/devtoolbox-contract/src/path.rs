//! Filesystem path sandboxing shared by the installer and the capability broker.
//!
//! Plugin packages are attacker-controlled archives and plugin ids come from
//! the network, so every path built from either must pass through these
//! helpers. Keeping one implementation in the contract crate means the
//! installer and the runtime sandbox can never drift apart.

use std::path::{Component, Path, PathBuf};

use crate::error::DevToolboxError;

/// Resolve `relative` under `root`, rejecting absolute paths, parent
/// traversal, Windows separators, and NUL bytes.
///
/// The result is **not** canonicalized: the target may not exist yet (install
/// staging, save dialogs). Use [`ensure_within`] when it must already exist.
pub fn resolve_within(root: &Path, relative: &str) -> Result<PathBuf, DevToolboxError> {
    if relative.is_empty() {
        return Err(DevToolboxError::InvalidArgument(
            "path must not be empty".to_string(),
        ));
    }
    if relative.contains('\0') || relative.contains('\\') {
        return Err(DevToolboxError::InvalidArgument(format!(
            "path '{relative}' contains forbidden characters"
        )));
    }

    let mut out = root.to_path_buf();
    let mut depth = 0usize;
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_str().ok_or_else(|| {
                    DevToolboxError::InvalidArgument("path must be valid UTF-8".to_string())
                })?;
                if part.contains('\0') {
                    return Err(DevToolboxError::InvalidArgument(
                        "path contains a NUL byte".to_string(),
                    ));
                }
                out.push(part);
                depth += 1;
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(DevToolboxError::InvalidArgument(format!(
                    "path '{relative}' escapes its sandbox"
                )));
            }
        }
    }

    if depth == 0 {
        return Err(DevToolboxError::InvalidArgument(format!(
            "path '{relative}' does not name a file"
        )));
    }
    Ok(out)
}

/// Canonicalize `candidate` and assert that it lives under `root`.
///
/// Symlinks are resolved, so a plugin cannot publish `link -> /etc` and read the
/// host filesystem.
pub fn ensure_within(root: &Path, candidate: &Path) -> Result<PathBuf, DevToolboxError> {
    let canonical_root = root.canonicalize()?;
    let canonical_candidate = candidate.canonicalize()?;
    if canonical_candidate.starts_with(&canonical_root) {
        Ok(canonical_candidate)
    } else {
        Err(DevToolboxError::denied(format!(
            "'{}' is outside the sandbox '{}'",
            candidate.display(),
            root.display()
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn joins_safe_segments() {
        let root = Path::new("/tmp/sandbox");
        assert_eq!(
            resolve_within(root, "a/b/c.txt").unwrap(),
            PathBuf::from("/tmp/sandbox/a/b/c.txt")
        );
        assert_eq!(
            resolve_within(root, "./a/./b").unwrap(),
            PathBuf::from("/tmp/sandbox/a/b")
        );
    }

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        let root = Path::new("/tmp/sandbox");
        for bad in [
            "../etc/passwd",
            "a/../../etc/passwd",
            "/etc/passwd",
            "C:\\Windows",
            "a\\b",
            "",
            ".",
        ] {
            assert!(
                resolve_within(root, bad).is_err(),
                "{bad:?} should be rejected"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_is_detected() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.txt"), b"secret").unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("secret.txt"),
            dir.path().join("link.txt"),
        )
        .unwrap();

        let candidate = dir.path().join("link.txt");
        assert!(ensure_within(dir.path(), &candidate).is_err());
    }
}
