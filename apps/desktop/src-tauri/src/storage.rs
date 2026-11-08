//! Per-plugin key/value storage (`storage:kv`).
//!
//! Every plugin owns an isolated directory, `<data>/plugin-data/<plugin-id>/kv/`,
//! with one compact JSON document per key. Updating a key only rewrites that
//! key's file, so a large cached blob can no longer slow down unrelated keys,
//! and a damaged entry only affects itself.
//!
//! Earlier releases stored the whole namespace in `<plugin-id>/kv.json`. Those
//! documents are migrated once at startup and renamed to `kv.json.migrated`, so
//! a rollback or a support session can still recover the original bytes.
//!
//! The host never exposes paths or raw files to plugins, only keys.

use std::collections::BTreeMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use devdeck_contract::{DevDeckError, PluginId};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

const KV_DIR: &str = "kv";
const LEGACY_FILE: &str = "kv.json";
const LEGACY_BACKUP: &str = "kv.json.migrated";
const LEGACY_CORRUPT: &str = "kv.json.corrupt";

const MAX_KEY_LEN: usize = 128;
const MAX_VALUE_BYTES: usize = 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 8 * 1024 * 1024;

/// Decoded form of one on-disk entry.
///
/// The key lives inside the document because the file name is a hash; `keys()`
/// needs the original spelling to answer the plugin.
#[derive(Debug, Deserialize)]
struct StoredEntry {
    key: String,
    value: Value,
}

#[derive(Serialize)]
struct EntryRef<'a> {
    key: &'a str,
    value: &'a Value,
}

/// Host-owned storage for one plugin namespace.
#[derive(Debug)]
pub struct PluginStorage {
    root: PathBuf,
    /// One lock per plugin. Calls for different plugins never block each
    /// other; calls for the same plugin serialize so quota accounting and
    /// read-modify-write sequences stay consistent.
    locks: Mutex<BTreeMap<String, Arc<Mutex<()>>>>,
}

impl PluginStorage {
    pub fn new(root: impl Into<PathBuf>) -> Result<Self, DevDeckError> {
        let root = root.into();
        std::fs::create_dir_all(&root)?;
        let storage = Self {
            root,
            locks: Mutex::new(BTreeMap::new()),
        };
        storage.migrate_legacy();
        Ok(storage)
    }

    pub fn get(&self, id: &PluginId, key: &str) -> Result<Option<Value>, DevDeckError> {
        validate_key(key)?;
        let lock = self.lock_for(id)?;
        let _guard = lock
            .lock()
            .map_err(|_| DevDeckError::Internal("storage lock poisoned".to_string()))?;

        let path = entry_path(&self.kv_dir(id), key);
        match read_entry(&path) {
            Ok(Some(entry)) => {
                if entry.key != key {
                    return Err(DevDeckError::Internal(format!(
                        "storage hash collision between '{key}' and '{}'",
                        entry.key
                    )));
                }
                Ok(Some(entry.value))
            }
            Ok(None) => Ok(None),
            Err(err) => Err(err),
        }
    }

    pub fn set(&self, id: &PluginId, key: &str, value: Value) -> Result<(), DevDeckError> {
        validate_key(key)?;
        let value_len = serde_json::to_vec(&value)?.len();
        if value_len > MAX_VALUE_BYTES {
            return Err(DevDeckError::InvalidArgument(format!(
                "value for '{key}' is {value_len} bytes, over the 1 MiB per-value limit; \
                 store large blobs with the 'fs:plugin-data' permission instead"
            )));
        }
        let encoded = encode_entry(key, &value)?;

        let lock = self.lock_for(id)?;
        let _guard = lock
            .lock()
            .map_err(|_| DevDeckError::Internal("storage lock poisoned".to_string()))?;

        let kv_dir = self.kv_dir(id);
        std::fs::create_dir_all(&kv_dir)?;
        let path = entry_path(&kv_dir, key);
        let used = used_bytes(&kv_dir, Some(&path))?;
        let next = used.saturating_add(encoded.len() as u64);
        if next > MAX_TOTAL_BYTES {
            return Err(DevDeckError::InvalidArgument(format!(
                "plugin storage quota (8 MiB) exceeded: this write needs {} bytes and \
                 {used} bytes are already in use; delete unused keys or move large \
                 values to the 'fs:plugin-data' permission",
                encoded.len()
            )));
        }

        write_atomic(&path, &encoded)?;
        Ok(())
    }

    pub fn delete(&self, id: &PluginId, key: &str) -> Result<bool, DevDeckError> {
        validate_key(key)?;
        let lock = self.lock_for(id)?;
        let _guard = lock
            .lock()
            .map_err(|_| DevDeckError::Internal("storage lock poisoned".to_string()))?;

        let path = entry_path(&self.kv_dir(id), key);
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(true),
            Err(err) if err.kind() == ErrorKind::NotFound => Ok(false),
            Err(err) => Err(err.into()),
        }
    }

    pub fn keys(&self, id: &PluginId) -> Result<Vec<String>, DevDeckError> {
        let lock = self.lock_for(id)?;
        let _guard = lock
            .lock()
            .map_err(|_| DevDeckError::Internal("storage lock poisoned".to_string()))?;

        let kv_dir = self.kv_dir(id);
        let entries = match std::fs::read_dir(&kv_dir) {
            Ok(entries) => entries,
            Err(err) if err.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(err) => return Err(err.into()),
        };

        let mut keys = Vec::new();
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            // A plugin may delete a data file through `fs:plugin-data` while
            // this scan runs; a vanished entry is simply gone, not an error.
            if let Some(stored) = read_entry(&path)? {
                keys.push(stored.key);
            }
        }
        keys.sort();
        Ok(keys)
    }

    pub fn clear(&self, id: &PluginId) -> Result<(), DevDeckError> {
        let lock = self.lock_for(id)?;
        let _guard = lock
            .lock()
            .map_err(|_| DevDeckError::Internal("storage lock poisoned".to_string()))?;

        let plugin_dir = self.root.join(id.as_str());
        match std::fs::remove_dir_all(plugin_dir.join(KV_DIR)) {
            Ok(()) => {}
            Err(err) if err.kind() == ErrorKind::NotFound => {}
            Err(err) => return Err(err.into()),
        }

        // `clear` is also the escape hatch for a damaged namespace, so drop the
        // legacy documents too instead of leaving them for the next migration.
        for name in [LEGACY_FILE, LEGACY_BACKUP, LEGACY_CORRUPT] {
            match std::fs::remove_file(plugin_dir.join(name)) {
                Ok(()) => {}
                Err(err) if err.kind() == ErrorKind::NotFound => {}
                Err(err) => return Err(err.into()),
            }
        }
        Ok(())
    }

    fn kv_dir(&self, id: &PluginId) -> PathBuf {
        self.root.join(id.as_str()).join(KV_DIR)
    }

    fn lock_for(&self, id: &PluginId) -> Result<Arc<Mutex<()>>, DevDeckError> {
        let mut locks = self
            .locks
            .lock()
            .map_err(|_| DevDeckError::Internal("storage lock map poisoned".to_string()))?;
        Ok(locks
            .entry(id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone())
    }

    /// One-time migration of `<plugin-id>/kv.json` into per-key files.
    ///
    /// Best effort: a broken legacy document must never stop the app from
    /// starting, so failures are reported on stderr and the file is renamed to
    /// a `.corrupt` sidecar for manual recovery.
    fn migrate_legacy(&self) {
        let entries = match std::fs::read_dir(&self.root) {
            Ok(entries) => entries,
            Err(err) => {
                eprintln!(
                    "devdeck: cannot scan plugin storage at {}: {err}",
                    self.root.display()
                );
                return;
            }
        };

        for entry in entries.flatten() {
            let plugin_dir = entry.path();
            if !plugin_dir.is_dir() {
                continue;
            }
            let legacy = plugin_dir.join(LEGACY_FILE);
            if !legacy.is_file() {
                continue;
            }
            if let Err(err) = migrate_one(&plugin_dir, &legacy) {
                eprintln!("devdeck: could not migrate {}: {err}", legacy.display());
            }
        }
    }
}

fn migrate_one(plugin_dir: &Path, legacy: &Path) -> Result<(), DevDeckError> {
    let bytes = std::fs::read(legacy)?;
    let map: BTreeMap<String, Value> = match serde_json::from_slice(&bytes) {
        Ok(map) => map,
        Err(_) => {
            move_aside(legacy, &plugin_dir.join(LEGACY_CORRUPT))?;
            return Ok(());
        }
    };

    let kv_dir = plugin_dir.join(KV_DIR);
    std::fs::create_dir_all(&kv_dir)?;
    for (key, value) in &map {
        let path = entry_path(&kv_dir, key);
        // A crash mid-migration leaves a partial set of files plus the legacy
        // document. Never overwrite a key that is already in the new layout:
        // it may be newer than the legacy snapshot.
        if path.exists() {
            continue;
        }
        write_atomic(&path, &encode_entry(key, value)?)?;
    }

    move_aside(legacy, &plugin_dir.join(LEGACY_BACKUP))?;
    Ok(())
}

fn move_aside(from: &Path, to: &Path) -> Result<(), DevDeckError> {
    if to.exists() {
        std::fs::remove_file(to)?;
    }
    std::fs::rename(from, to)?;
    Ok(())
}

fn encode_entry(key: &str, value: &Value) -> Result<Vec<u8>, DevDeckError> {
    Ok(serde_json::to_vec(&EntryRef { key, value })?)
}

fn read_entry(path: &Path) -> Result<Option<StoredEntry>, DevDeckError> {
    match std::fs::read(path) {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(entry) => Ok(Some(entry)),
            Err(err) => Err(DevDeckError::InvalidArgument(format!(
                "storage entry '{}' is unreadable: {err}",
                path.display()
            ))),
        },
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.into()),
    }
}

/// Number of bytes held by finished entries, optionally skipping one path that
/// is about to be replaced.
fn used_bytes(kv_dir: &Path, exclude: Option<&Path>) -> Result<u64, DevDeckError> {
    let entries = match std::fs::read_dir(kv_dir) {
        Ok(entries) => entries,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(0),
        Err(err) => return Err(err.into()),
    };

    let mut total = 0u64;
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        if Some(path.as_path()) == exclude {
            continue;
        }
        // Temporary files from an interrupted write are ignored: they are
        // replaced by the next write and never counted against the quota twice.
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let metadata = entry.metadata()?;
        if metadata.is_file() {
            total = total.saturating_add(metadata.len());
        }
    }
    Ok(total)
}

fn entry_path(kv_dir: &Path, key: &str) -> PathBuf {
    kv_dir.join(format!("{}.json", entry_hash(key)))
}

/// Stable, filesystem-safe name for a key.
///
/// Keys may contain slashes, `..`, or non-ASCII text, so they are hashed
/// instead of escaped; the original key is stored inside the document. The
/// 128-bit prefix keeps names short while making collisions practically
/// impossible.
fn entry_hash(key: &str) -> String {
    let digest = Sha256::digest(key.as_bytes());
    digest[..16]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), DevDeckError> {
    let parent = path.parent().ok_or_else(|| {
        DevDeckError::Internal("storage path has no parent directory".to_string())
    })?;
    std::fs::create_dir_all(parent)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

fn validate_key(key: &str) -> Result<(), DevDeckError> {
    if key.is_empty() || key.len() > MAX_KEY_LEN {
        return Err(DevDeckError::InvalidArgument(format!(
            "storage key must be 1-{MAX_KEY_LEN} characters"
        )));
    }
    if key.chars().any(|c| c.is_control()) {
        return Err(DevDeckError::InvalidArgument(
            "storage key must not contain control characters".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Arc;
    use std::thread;

    fn id() -> PluginId {
        PluginId::new("market-demo").unwrap()
    }

    fn other() -> PluginId {
        PluginId::new("market-other").unwrap()
    }

    fn open(root: &Path) -> PluginStorage {
        PluginStorage::new(root).unwrap()
    }

    #[test]
    fn set_get_delete_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());
        storage.set(&id(), "greeting", json!("hi")).unwrap();
        assert_eq!(storage.get(&id(), "greeting").unwrap(), Some(json!("hi")));
        assert!(storage.delete(&id(), "greeting").unwrap());
        assert_eq!(storage.get(&id(), "greeting").unwrap(), None);
        assert!(!storage.delete(&id(), "greeting").unwrap());
    }

    #[test]
    fn survives_reopen() {
        let dir = tempfile::tempdir().unwrap();
        {
            let storage = open(dir.path());
            storage
                .set(&id(), "k", json!({ "nested": [1, 2, 3] }))
                .unwrap();
        }
        let storage = open(dir.path());
        assert_eq!(
            storage.get(&id(), "k").unwrap(),
            Some(json!({ "nested": [1, 2, 3] }))
        );
    }

    #[test]
    fn namespaces_are_isolated() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());
        storage.set(&id(), "k", json!(1)).unwrap();
        assert_eq!(storage.get(&other(), "k").unwrap(), None);
        storage.set(&other(), "k", json!(2)).unwrap();
        assert_eq!(storage.get(&id(), "k").unwrap(), Some(json!(1)));
    }

    #[test]
    fn rejects_empty_and_oversized_keys() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());
        assert!(storage.get(&id(), "").is_err());
        assert!(storage.get(&id(), &"k".repeat(MAX_KEY_LEN + 1)).is_err());
    }

    #[test]
    fn clear_removes_everything() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());
        storage.set(&id(), "a", json!(1)).unwrap();
        storage.clear(&id()).unwrap();
        assert!(storage.keys(&id()).unwrap().is_empty());
        assert_eq!(storage.get(&id(), "a").unwrap(), None);
    }

    #[test]
    fn keys_are_stored_one_file_each_and_compactly() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());
        storage.set(&id(), "alpha", json!(1)).unwrap();
        storage.set(&id(), "beta", json!(2)).unwrap();

        let kv_dir = dir.path().join("market-demo").join(KV_DIR);
        let mut names: Vec<String> = std::fs::read_dir(&kv_dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names.len(), 2);
        assert!(names.iter().all(|name| name.ends_with(".json")));

        let bytes = std::fs::read(entry_path(&kv_dir, "alpha")).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert_eq!(text, r#"{"key":"alpha","value":1}"#);
        assert!(!text.contains('\n'), "entries must be written compactly");
    }

    #[test]
    fn rewriting_one_key_does_not_touch_another() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());
        let kv_dir = dir.path().join("market-demo").join(KV_DIR);

        storage
            .set(&id(), "blob", json!("x".repeat(256 * 1024)))
            .unwrap();
        storage
            .set(&id(), "settings", json!({ "size": "sm" }))
            .unwrap();

        let settings_path = entry_path(&kv_dir, "settings");
        let settings_before = std::fs::read(&settings_path).unwrap();
        let blob_before = std::fs::read(entry_path(&kv_dir, "blob")).unwrap();

        storage
            .set(&id(), "blob", json!("y".repeat(256 * 1024)))
            .unwrap();

        assert_eq!(std::fs::read(&settings_path).unwrap(), settings_before);
        assert_ne!(
            std::fs::read(entry_path(&kv_dir, "blob")).unwrap(),
            blob_before
        );
        assert_eq!(
            storage.get(&id(), "settings").unwrap(),
            Some(json!({ "size": "sm" }))
        );
    }

    #[test]
    fn rejects_values_over_the_per_value_limit() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());
        let too_big = json!("x".repeat(MAX_VALUE_BYTES + 1));
        let err = storage.set(&id(), "blob", too_big).unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
        assert!(err.to_string().contains("fs:plugin-data"));
        assert_eq!(storage.get(&id(), "blob").unwrap(), None);
    }

    #[test]
    fn enforces_the_eight_mib_quota() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());
        let chunk = "x".repeat(MAX_VALUE_BYTES - 8);

        for index in 0..7 {
            storage
                .set(&id(), &format!("blob-{index}"), json!(chunk))
                .unwrap();
        }

        let err = storage.set(&id(), "blob-7", json!(chunk)).unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
        assert!(err.to_string().contains("8 MiB"));
        assert_eq!(storage.keys(&id()).unwrap().len(), 7);
    }

    #[test]
    fn migrates_the_legacy_document() {
        let dir = tempfile::tempdir().unwrap();
        let plugin_dir = dir.path().join("market-demo");
        std::fs::create_dir_all(&plugin_dir).unwrap();
        std::fs::write(
            plugin_dir.join(LEGACY_FILE),
            br#"{"greeting":"hi","nested":{"n":[1,2,3]}}"#,
        )
        .unwrap();

        let storage = open(dir.path());
        assert_eq!(storage.get(&id(), "greeting").unwrap(), Some(json!("hi")));
        assert_eq!(
            storage.get(&id(), "nested").unwrap(),
            Some(json!({ "n": [1, 2, 3] }))
        );
        assert!(!plugin_dir.join(LEGACY_FILE).exists());
        assert!(plugin_dir.join(LEGACY_BACKUP).is_file());
    }

    #[test]
    fn migration_keeps_newer_values() {
        let dir = tempfile::tempdir().unwrap();
        let plugin_dir = dir.path().join("market-demo");
        std::fs::create_dir_all(&plugin_dir).unwrap();
        std::fs::write(plugin_dir.join(LEGACY_FILE), br#"{"greeting":"old"}"#).unwrap();

        {
            let storage = open(dir.path());
            assert_eq!(storage.get(&id(), "greeting").unwrap(), Some(json!("old")));
            storage.set(&id(), "greeting", json!("newer")).unwrap();
        }

        // A stale legacy snapshot reappearing (for example after a downgrade)
        // must not overwrite the per-key store.
        std::fs::write(plugin_dir.join(LEGACY_FILE), br#"{"greeting":"stale"}"#).unwrap();
        let storage = open(dir.path());
        assert_eq!(
            storage.get(&id(), "greeting").unwrap(),
            Some(json!("newer"))
        );
    }

    #[test]
    fn corrupt_legacy_document_is_quarantined() {
        let dir = tempfile::tempdir().unwrap();
        let plugin_dir = dir.path().join("market-demo");
        std::fs::create_dir_all(&plugin_dir).unwrap();
        std::fs::write(plugin_dir.join(LEGACY_FILE), b"{not json").unwrap();

        let storage = open(dir.path());
        assert!(storage.keys(&id()).unwrap().is_empty());
        assert!(!plugin_dir.join(LEGACY_FILE).exists());
        assert!(plugin_dir.join(LEGACY_CORRUPT).is_file());
    }

    #[test]
    fn corrupt_entry_only_breaks_its_own_key() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());
        storage.set(&id(), "a", json!(1)).unwrap();
        storage.set(&id(), "b", json!(2)).unwrap();

        let kv_dir = dir.path().join("market-demo").join(KV_DIR);
        std::fs::write(entry_path(&kv_dir, "a"), b"garbage").unwrap();

        assert!(storage.get(&id(), "a").is_err());
        assert_eq!(storage.get(&id(), "b").unwrap(), Some(json!(2)));
        assert!(storage.keys(&id()).is_err());
    }

    #[test]
    fn keys_with_separators_cannot_escape_the_plugin_directory() {
        let dir = tempfile::tempdir().unwrap();
        let storage = open(dir.path());
        let key = "../../escape";
        storage.set(&id(), key, json!(1)).unwrap();
        assert_eq!(storage.get(&id(), key).unwrap(), Some(json!(1)));

        let kv_dir = dir.path().join("market-demo").join(KV_DIR);
        assert_eq!(std::fs::read_dir(&kv_dir).unwrap().count(), 1);
        assert!(!dir.path().join("escape.json").exists());
        assert!(!dir.path().join("market-demo").join("escape.json").exists());
    }

    #[test]
    fn concurrent_writes_to_one_plugin_stay_consistent() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Arc::new(open(dir.path()));

        let mut handles = Vec::new();
        for worker in 0..8 {
            let storage = Arc::clone(&storage);
            handles.push(thread::spawn(move || {
                for index in 0..20 {
                    let key = format!("w{worker}-k{index}");
                    storage.set(&id(), &key, json!({ "index": index })).unwrap();
                }
            }));
        }
        for handle in handles {
            handle.join().unwrap();
        }

        assert_eq!(storage.keys(&id()).unwrap().len(), 160);
        for worker in 0..8 {
            for index in 0..20 {
                let key = format!("w{worker}-k{index}");
                assert_eq!(
                    storage.get(&id(), &key).unwrap(),
                    Some(json!({ "index": index }))
                );
            }
        }
    }
}
