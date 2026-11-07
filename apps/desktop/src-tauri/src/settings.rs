//! Small persisted app settings (theme, and future UI preferences).
//!
//! Kept in `<data>/settings.json` with atomic writes so a crash cannot leave a
//! truncated file behind.

use std::path::PathBuf;

use devtoolbox_contract::DevToolboxError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingsFile {
    #[serde(default = "default_schema")]
    schema_version: u32,
    #[serde(default = "default_theme")]
    theme: String,
    #[serde(default = "default_language")]
    language: String,
}

fn default_schema() -> u32 {
    1
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_language() -> String {
    "en".to_string()
}

impl Default for SettingsFile {
    fn default() -> Self {
        Self {
            schema_version: 1,
            theme: default_theme(),
            language: default_language(),
        }
    }
}

#[derive(Debug)]
pub struct SettingsStore {
    path: PathBuf,
    file: SettingsFile,
}

impl SettingsStore {
    pub fn open(root: &std::path::Path) -> Result<Self, DevToolboxError> {
        std::fs::create_dir_all(root)?;
        let path = root.join("settings.json");
        let file = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|err| {
                DevToolboxError::InvalidArgument(format!("settings.json is unreadable: {err}"))
            })?,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => SettingsFile::default(),
            Err(err) => return Err(err.into()),
        };
        Ok(Self { path, file })
    }

    pub fn theme(&self) -> String {
        self.file.theme.clone()
    }

    pub fn language(&self) -> String {
        self.file.language.clone()
    }

    pub fn set_language(&mut self, language: &str) -> Result<(), DevToolboxError> {
        if language != "en" && language != "zh-CN" {
            return Err(DevToolboxError::InvalidArgument(
                "language must be 'en' or 'zh-CN'".to_string(),
            ));
        }
        self.file.language = language.to_string();
        self.save()
    }

    pub fn set_theme(&mut self, theme: &str) -> Result<(), DevToolboxError> {
        if theme != "light" && theme != "dark" {
            return Err(DevToolboxError::InvalidArgument(
                "theme must be 'light' or 'dark'".to_string(),
            ));
        }
        self.file.theme = theme.to_string();
        self.save()
    }

    fn save(&self) -> Result<(), DevToolboxError> {
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&self.file)?)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_dark_and_persists_theme() {
        let dir = tempfile::tempdir().unwrap();
        {
            let store = SettingsStore::open(dir.path()).unwrap();
            assert_eq!(store.theme(), "dark");
        }
        {
            let mut store = SettingsStore::open(dir.path()).unwrap();
            store.set_theme("light").unwrap();
        }
        let store = SettingsStore::open(dir.path()).unwrap();
        assert_eq!(store.theme(), "light");
    }

    #[test]
    fn persists_language() {
        let dir = tempfile::tempdir().unwrap();
        {
            let store = SettingsStore::open(dir.path()).unwrap();
            assert_eq!(store.language(), "en");
        }
        {
            let mut store = SettingsStore::open(dir.path()).unwrap();
            store.set_language("zh-CN").unwrap();
            assert_eq!(
                store.set_language("fr").unwrap_err().code(),
                "invalid_argument"
            );
        }
        assert_eq!(SettingsStore::open(dir.path()).unwrap().language(), "zh-CN");
    }

    #[test]
    fn rejects_unknown_themes() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = SettingsStore::open(dir.path()).unwrap();
        assert_eq!(
            store.set_theme("neon").unwrap_err().code(),
            "invalid_argument"
        );
        assert_eq!(store.theme(), "dark");
    }
}
