//! Filesystem sandbox re-exports plus a small reusable sandbox handle.

use std::path::{Path, PathBuf};

pub use devtoolbox_contract::{ensure_within, resolve_within};

use devtoolbox_contract::DevToolboxError;

/// A reusable sandbox rooted at a directory.
#[derive(Debug, Clone)]
pub struct PathSandbox {
    root: PathBuf,
}

impl PathSandbox {
    pub fn new(root: impl Into<PathBuf>) -> Result<Self, DevToolboxError> {
        let root = root.into();
        std::fs::create_dir_all(&root)?;
        Ok(Self {
            root: root.canonicalize()?,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Resolve a relative path inside the sandbox.
    pub fn resolve(&self, relative: &str) -> Result<PathBuf, DevToolboxError> {
        resolve_within(&self.root, relative)
    }

    /// Resolve and assert the target still lives inside the sandbox after
    /// symlink resolution.
    pub fn resolve_existing(&self, relative: &str) -> Result<PathBuf, DevToolboxError> {
        let joined = self.resolve(relative)?;
        ensure_within(&self.root, &joined)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sandbox_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let sandbox = PathSandbox::new(dir.path()).unwrap();
        std::fs::write(sandbox.resolve("note.txt").unwrap(), b"hi").unwrap();
        let resolved = sandbox.resolve_existing("note.txt").unwrap();
        assert!(resolved.starts_with(dir.path().canonicalize().unwrap()));
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

        let sandbox = PathSandbox::new(dir.path()).unwrap();
        assert!(sandbox.resolve_existing("link.txt").is_err());
    }
}
