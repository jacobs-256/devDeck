//! Per-plugin key/value storage (`storage:kv`).
//!
//! Each plugin gets an isolated JSON document under
//! `<data>/plugin-data/<plugin-id>/kv.json`. The host never exposes paths or
//! raw files to plugins, only keys.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

use devtoolbox_contract::{DevToolboxError, PluginId};
use serde_json::Value;

const MAX_KEY_LEN: usize = 128;
const MAX_VALUE_BYTES: usize = 1024 * 1024;
const MAX_TOTAL_BYTES: usize = 8 * 1024 * 1024;

type PluginMap = BTreeMap<String, BTreeMap<String, Value>>;
type PluginMapGuard<'a> = std::sync::MutexGuard<'a, PluginMap>;

/// Host-owned storage for one plugin namespace.
#[derive(Debug)]
pub struct PluginStorage {
    root: PathBuf,
    cache: Mutex<PluginMap>,
}

impl PluginStorage {
    pub fn new(root: impl Into<PathBuf>) -> Result<Self, DevToolboxError> {
        let root = root.into();
        std::fs::create_dir_all(&root)?;
        Ok(Self {
            root,
            cache: Mutex::new(BTreeMap::new()),
        })
    }

    fn plugin_dir(&self, id: &PluginId) -> PathBuf {
        self.root.join(id.as_str())
    }

    fn file_path(&self, id: &PluginId) -> PathBuf {
        self.plugin_dir(id).join("kv.json")
    }

    pub fn get(&self, id: &PluginId, key: &str) -> Result<Option<Value>, DevToolboxError> {
        validate_key(key)?;
        let mut cache = self.lock()?;
        let map = self.load_locked(&mut cache, id)?;
        Ok(map.get(key).cloned())
    }

    pub fn set(&self, id: &PluginId, key: &str, value: Value) -> Result<(), DevToolboxError> {
        validate_key(key)?;
        let encoded = serde_json::to_vec(&value)?;
        if encoded.len() > MAX_VALUE_BYTES {
            return Err(DevToolboxError::InvalidArgument(format!(
                "value for '{key}' exceeds the 1 MiB limit"
            )));
        }

        let mut cache = self.lock()?;
        let map = self.load_locked(&mut cache, id)?;
        map.insert(key.to_string(), value);
        let serialized = serde_json::to_vec(map)?;
        if serialized.len() > MAX_TOTAL_BYTES {
            map.remove(key);
            return Err(DevToolboxError::InvalidArgument(
                "plugin storage quota (8 MiB) exceeded".to_string(),
            ));
        }
        self.persist(id, map)?;
        Ok(())
    }

    pub fn delete(&self, id: &PluginId, key: &str) -> Result<bool, DevToolboxError> {
        validate_key(key)?;
        let mut cache = self.lock()?;
        let map = self.load_locked(&mut cache, id)?;
        let removed = map.remove(key).is_some();
        if removed {
            self.persist(id, map)?;
        }
        Ok(removed)
    }

    pub fn keys(&self, id: &PluginId) -> Result<Vec<String>, DevToolboxError> {
        let mut cache = self.lock()?;
        let map = self.load_locked(&mut cache, id)?;
        Ok(map.keys().cloned().collect())
    }

    pub fn clear(&self, id: &PluginId) -> Result<(), DevToolboxError> {
        let mut cache = self.lock()?;
        cache.insert(id.to_string(), BTreeMap::new());
        let path = self.file_path(id);
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        Ok(())
    }

    fn lock(&self) -> Result<PluginMapGuard<'_>, DevToolboxError> {
        self.cache
            .lock()
            .map_err(|_| DevToolboxError::Internal("storage lock poisoned".to_string()))
    }

    fn load_locked<'a>(
        &self,
        cache: &'a mut PluginMap,
        id: &PluginId,
    ) -> Result<&'a mut BTreeMap<String, Value>, DevToolboxError> {
        let key = id.to_string();
        if !cache.contains_key(&key) {
            let path = self.file_path(id);
            let map = match std::fs::read(&path) {
                Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
                Err(err) => return Err(err.into()),
            };
            cache.insert(key.clone(), map);
        }
        Ok(cache.get_mut(&key).expect("inserted above"))
    }

    fn persist(&self, id: &PluginId, map: &BTreeMap<String, Value>) -> Result<(), DevToolboxError> {
        let dir = self.plugin_dir(id);
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("kv.json");
        let tmp = dir.join(".kv.json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(map)?)?;
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }
}

fn validate_key(key: &str) -> Result<(), DevToolboxError> {
    if key.is_empty() || key.len() > MAX_KEY_LEN {
        return Err(DevToolboxError::InvalidArgument(format!(
            "storage key must be 1-{MAX_KEY_LEN} characters"
        )));
    }
    if key.chars().any(|c| c.is_control()) {
        return Err(DevToolboxError::InvalidArgument(
            "storage key must not contain control characters".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn id() -> PluginId {
        PluginId::new("market-demo").unwrap()
    }

    #[test]
    fn set_get_delete_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let storage = PluginStorage::new(dir.path()).unwrap();
        storage.set(&id(), "greeting", json!("hi")).unwrap();
        assert_eq!(storage.get(&id(), "greeting").unwrap(), Some(json!("hi")));
        assert!(storage.delete(&id(), "greeting").unwrap());
        assert_eq!(storage.get(&id(), "greeting").unwrap(), None);
    }

    #[test]
    fn survives_reopen() {
        let dir = tempfile::tempdir().unwrap();
        {
            let storage = PluginStorage::new(dir.path()).unwrap();
            storage
                .set(&id(), "k", json!({ "nested": [1, 2, 3] }))
                .unwrap();
        }
        let storage = PluginStorage::new(dir.path()).unwrap();
        assert_eq!(
            storage.get(&id(), "k").unwrap(),
            Some(json!({ "nested": [1, 2, 3] }))
        );
    }

    #[test]
    fn namespaces_are_isolated() {
        let dir = tempfile::tempdir().unwrap();
        let storage = PluginStorage::new(dir.path()).unwrap();
        let other = PluginId::new("market-other").unwrap();
        storage.set(&id(), "k", json!(1)).unwrap();
        assert_eq!(storage.get(&other, "k").unwrap(), None);
    }

    #[test]
    fn rejects_empty_and_oversized_keys() {
        let dir = tempfile::tempdir().unwrap();
        let storage = PluginStorage::new(dir.path()).unwrap();
        assert!(storage.get(&id(), "").is_err());
        assert!(storage.get(&id(), &"k".repeat(MAX_KEY_LEN + 1)).is_err());
    }

    #[test]
    fn clear_removes_everything() {
        let dir = tempfile::tempdir().unwrap();
        let storage = PluginStorage::new(dir.path()).unwrap();
        storage.set(&id(), "a", json!(1)).unwrap();
        storage.clear(&id()).unwrap();
        assert!(storage.keys(&id()).unwrap().is_empty());
    }
}
