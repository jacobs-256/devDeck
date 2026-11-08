//! Small persisted app settings (theme, and future UI preferences).
//!
//! Kept in `<data>/settings.json` with atomic writes so a crash cannot leave a
//! truncated file behind.

use std::path::PathBuf;

use devdeck_contract::DevDeckError;
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
    #[serde(default = "default_text_size")]
    text_size: String,
    #[serde(default = "default_close_behavior")]
    close_behavior: String,
    #[serde(default = "default_tray_enabled")]
    tray_enabled: bool,
    #[serde(default = "default_service_port")]
    service_port: u16,
    #[serde(default = "default_service_auto_port")]
    service_auto_port: bool,
}

fn default_schema() -> u32 {
    1
}

fn default_theme() -> String {
    "auto".to_string()
}

fn default_language() -> String {
    "auto".to_string()
}

fn default_text_size() -> String {
    "default".to_string()
}

fn default_close_behavior() -> String {
    "ask".to_string()
}

fn default_tray_enabled() -> bool {
    true
}

fn default_service_port() -> u16 {
    8765
}

fn default_service_auto_port() -> bool {
    true
}

impl Default for SettingsFile {
    fn default() -> Self {
        Self {
            schema_version: 1,
            theme: default_theme(),
            language: default_language(),
            text_size: default_text_size(),
            close_behavior: default_close_behavior(),
            tray_enabled: default_tray_enabled(),
            service_port: default_service_port(),
            service_auto_port: default_service_auto_port(),
        }
    }
}

/// Desktop-only preferences (tray, close button, local service).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSettings {
    pub close_behavior: String,
    pub tray_enabled: bool,
    pub service_port: u16,
    pub service_auto_port: bool,
}

#[derive(Debug)]
pub struct SettingsStore {
    path: PathBuf,
    file: SettingsFile,
}

impl SettingsStore {
    pub fn open(root: &std::path::Path) -> Result<Self, DevDeckError> {
        std::fs::create_dir_all(root)?;
        let path = root.join("settings.json");
        let file = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|err| {
                DevDeckError::InvalidArgument(format!("settings.json is unreadable: {err}"))
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

    pub fn text_size(&self) -> String {
        self.file.text_size.clone()
    }

    pub fn set_text_size(&mut self, size: &str) -> Result<(), DevDeckError> {
        if !matches!(size, "small" | "default" | "large" | "xlarge") {
            return Err(DevDeckError::InvalidArgument(
                "text size must be small, default, large, or xlarge".to_string(),
            ));
        }
        self.file.text_size = size.to_string();
        self.save()
    }

    pub fn desktop(&self) -> DesktopSettings {
        DesktopSettings {
            close_behavior: self.file.close_behavior.clone(),
            tray_enabled: self.file.tray_enabled,
            service_port: self.file.service_port,
            service_auto_port: self.file.service_auto_port,
        }
    }

    pub fn set_desktop(&mut self, next: &DesktopSettings) -> Result<(), DevDeckError> {
        if !matches!(next.close_behavior.as_str(), "ask" | "tray" | "quit") {
            return Err(DevDeckError::InvalidArgument(
                "close behavior must be ask, tray, or quit".to_string(),
            ));
        }
        if next.service_port < 1024 {
            return Err(DevDeckError::InvalidArgument(
                "service port must be between 1024 and 65535".to_string(),
            ));
        }
        self.file.close_behavior = next.close_behavior.clone();
        self.file.tray_enabled = next.tray_enabled;
        self.file.service_port = next.service_port;
        self.file.service_auto_port = next.service_auto_port;
        self.save()
    }

    pub fn set_language(&mut self, language: &str) -> Result<(), DevDeckError> {
        if language != "en" && language != "zh-CN" && language != "auto" {
            return Err(DevDeckError::InvalidArgument(
                "language must be 'en' or 'zh-CN'".to_string(),
            ));
        }
        self.file.language = language.to_string();
        self.save()
    }

    pub fn set_theme(&mut self, theme: &str) -> Result<(), DevDeckError> {
        if theme != "light" && theme != "dark" && theme != "auto" {
            return Err(DevDeckError::InvalidArgument(
                "theme must be 'light' or 'dark'".to_string(),
            ));
        }
        self.file.theme = theme.to_string();
        self.save()
    }

    fn save(&self) -> Result<(), DevDeckError> {
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
    fn defaults_to_auto_and_persists_theme() {
        let dir = tempfile::tempdir().unwrap();
        {
            let store = SettingsStore::open(dir.path()).unwrap();
            assert_eq!(store.theme(), "auto");
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
            assert_eq!(store.language(), "auto");
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
    fn persists_auto_theme_language_and_text_size() {
        let dir = tempfile::tempdir().unwrap();
        {
            let mut store = SettingsStore::open(dir.path()).unwrap();
            store.set_theme("auto").unwrap();
            store.set_language("auto").unwrap();
            store.set_text_size("large").unwrap();
        }
        let store = SettingsStore::open(dir.path()).unwrap();
        assert_eq!(store.theme(), "auto");
        assert_eq!(store.language(), "auto");
        assert_eq!(store.text_size(), "large");
    }

    #[test]
    fn rejects_unknown_text_sizes() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = SettingsStore::open(dir.path()).unwrap();
        assert_eq!(
            store.set_text_size("huge").unwrap_err().code(),
            "invalid_argument"
        );
    }

    #[test]
    fn persists_desktop_settings() {
        let dir = tempfile::tempdir().unwrap();
        {
            let mut store = SettingsStore::open(dir.path()).unwrap();
            let settings = DesktopSettings {
                close_behavior: "tray".to_string(),
                tray_enabled: true,
                service_port: 9000,
                service_auto_port: false,
            };
            store.set_desktop(&settings).unwrap();
        }
        let desktop = SettingsStore::open(dir.path()).unwrap().desktop();
        assert_eq!(desktop.close_behavior, "tray");
        assert!(desktop.tray_enabled);
        assert_eq!(desktop.service_port, 9000);
        assert!(!desktop.service_auto_port);
    }

    #[test]
    fn rejects_unknown_themes() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = SettingsStore::open(dir.path()).unwrap();
        assert_eq!(
            store.set_theme("neon").unwrap_err().code(),
            "invalid_argument"
        );
        assert_eq!(store.theme(), "auto");
    }
}
