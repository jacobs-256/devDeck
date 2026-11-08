//! Registry fetching and catalog assembly.
//!
//! Unlike the plugin HTTP proxy, registry traffic is **host-initiated**: there
//! is no plugin grant involved, but the host still enforces https, caps
//! downloads, re-checks every redirect, and verifies signatures/digests before
//! anything reaches the installer.

use std::time::Duration;

use devdeck_contract::{
    DevDeckError, EntryStatus, PluginId, PluginManifest, RegistryEntry, RegistryIndex,
    SignatureEnvelope,
};
use devdeck_market::{
    verify_detached_signature, verify_sha256, InstallOptions, InstallSource, InstalledPlugin,
    RegistrySource,
};

use crate::state::{now_ms, AppState};
use serde::Serialize;
use url::Url;

const MAX_REDIRECTS: usize = 3;
const MAX_REGISTRY_BYTES: u64 = 8 * 1024 * 1024;
const MAX_SIGNATURE_BYTES: u64 = 64 * 1024;
const MAX_PACKAGE_BYTES: u64 = 128 * 1024 * 1024;
const TIMEOUT_SECS: u64 = 60;

/// One installable release as presented to the Marketplace UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub source_id: String,
    pub source_name: String,
    pub manifest: PluginManifest,
    pub download_url: String,
    pub sha256: String,
    pub size: u64,
    pub published_at: String,
    pub status: EntryStatus,
    pub signed: bool,
}

/// A source that failed to refresh; the catalog still shows the others.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceError {
    pub source_id: String,
    pub source_name: String,
    pub message: String,
}

/// Result of refreshing one or more registries.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub entries: Vec<CatalogEntry>,
    pub errors: Vec<SourceError>,
}

/// Fetch and verify a registry document.
pub async fn fetch_registry(source: &RegistrySource) -> Result<RegistryIndex, DevDeckError> {
    let bytes = fetch_optional(&source.url, MAX_REGISTRY_BYTES)
        .await?
        .ok_or_else(|| DevDeckError::NotFound(format!("registry '{}' returned 404", source.url)))?;

    match source.public_key.as_deref() {
        Some(public_key) => {
            let signature_url = format!("{}.sig", source.url);
            match fetch_optional(&signature_url, MAX_SIGNATURE_BYTES).await? {
                Some(signature_bytes) => {
                    let envelope: SignatureEnvelope = serde_json::from_slice(&signature_bytes)
                        .map_err(|err| {
                            DevDeckError::Signature(format!(
                                "invalid registry signature file: {err}"
                            ))
                        })?;
                    verify_detached_signature(public_key, &bytes, &envelope.signature).map_err(
                        |err| DevDeckError::Signature(format!("registry signature: {err}")),
                    )?;
                }
                None if source.require_signature => {
                    return Err(DevDeckError::Signature(
                        "registry signature is required but registry.json.sig is missing"
                            .to_string(),
                    ))
                }
                None => {}
            }
        }
        None if source.require_signature => {
            return Err(DevDeckError::Signature(
                "registry requires a signature but no public key is configured".to_string(),
            ))
        }
        None => {}
    }

    RegistryIndex::parse(&bytes)
}

/// Download a package and verify its digest (and declared size).
pub async fn download_package(entry: &RegistryEntry) -> Result<Vec<u8>, DevDeckError> {
    let bytes = fetch_optional(&entry.download_url, MAX_PACKAGE_BYTES)
        .await?
        .ok_or_else(|| {
            DevDeckError::NotFound(format!(
                "package {}@{} returned 404",
                entry.manifest.id, entry.manifest.version
            ))
        })?;

    verify_sha256(&bytes, &entry.sha256)?;
    if entry.size > 0 && bytes.len() as u64 != entry.size {
        return Err(DevDeckError::Integrity(format!(
            "package size mismatch for {}@{} (registry {}, downloaded {})",
            entry.manifest.id,
            entry.manifest.version,
            entry.size,
            bytes.len()
        )));
    }
    Ok(bytes)
}

/// Download, verify, and install a plugin from a configured registry.
///
/// This is the implementation behind the `plugin_install_from_registry`
/// command; keeping it free of Tauri types makes the whole pipeline testable.
pub async fn install_from_registry(
    state: &AppState,
    source_id: &str,
    plugin_id: &PluginId,
    version: Option<&str>,
) -> Result<InstalledPlugin, DevDeckError> {
    let source = state.sources()?.get(source_id).ok_or_else(|| {
        DevDeckError::NotFound(format!("registry source '{source_id}' is not configured"))
    })?;

    let index = match state.cached_registry(source_id) {
        Some(index) => index,
        None => {
            let index = fetch_registry(&source).await?;
            state.cache_registry(source_id, index.clone());
            index
        }
    };

    let entry = match version {
        Some(version) => index.find(plugin_id, version),
        None => index.latest(plugin_id),
    }
    .ok_or_else(|| {
        DevDeckError::NotFound(format!(
            "plugin '{plugin_id}' is not available from registry '{}'",
            source.name
        ))
    })?;

    if entry.status != EntryStatus::Active {
        return Err(DevDeckError::Unsupported(format!(
            "release '{plugin_id}' {} is not installable (status {:?})",
            entry.manifest.version, entry.status
        )));
    }

    let source_is_file = Url::parse(&source.url).is_ok_and(|url| url.scheme() == "file");
    if entry.download_url.starts_with("file:") && !source_is_file {
        return Err(DevDeckError::denied(
            "remote registries cannot point at local files".to_string(),
        ));
    }
    if entry.download_url.starts_with("file:") {
        let path = Url::parse(&entry.download_url)
            .ok()
            .and_then(|url| url.to_file_path().ok())
            .ok_or_else(|| {
                DevDeckError::InvalidArgument("invalid local package URL".to_string())
            })?;
        if !path
            .extension()
            .and_then(std::ffi::OsStr::to_str)
            .is_some_and(|ext| ext.eq_ignore_ascii_case("zip"))
        {
            return Err(DevDeckError::InvalidArgument(
                "file package URLs must point to a .zip file".to_string(),
            ));
        }
    }

    let bytes = download_package(entry).await?;

    let mut options = InstallOptions::new().with_sha256(entry.sha256.clone());
    match &entry.signature {
        Some(signature) => {
            let public_key = source.public_key.as_ref().ok_or_else(|| {
                DevDeckError::Signature(
                    "package is signed but the registry source has no public key".to_string(),
                )
            })?;
            // Verify eagerly so the error names the failing artifact.
            verify_detached_signature(public_key, &bytes, &signature.signature)
                .map_err(|err| DevDeckError::Signature(format!("package signature: {err}")))?;
            options = options.with_signature(public_key.clone(), signature.signature.clone());
        }
        None if source.require_signature => {
            return Err(DevDeckError::Signature(format!(
                "package '{plugin_id}' {} is unsigned and the source requires signatures",
                entry.manifest.version
            )))
        }
        None => {}
    }

    let installed = {
        let mut market = state.market()?;
        market.install_zip(
            &bytes,
            InstallSource::Registry(source.id.clone()),
            &options,
            now_ms(),
        )?
    };
    state.rebuild_grants()?;
    Ok(installed)
}

/// Project a registry entry into the UI catalog.
pub fn catalog_entry(source: &RegistrySource, entry: &RegistryEntry) -> CatalogEntry {
    CatalogEntry {
        source_id: source.id.clone(),
        source_name: source.name.clone(),
        manifest: entry.manifest.clone(),
        download_url: entry.download_url.clone(),
        sha256: entry.sha256.clone(),
        size: entry.size,
        published_at: entry.published_at.clone(),
        status: entry.status,
        signed: entry.signature.is_some() && source.public_key.is_some(),
    }
}

/// Keep one active entry per plugin id, preferring the highest version.
pub fn merge_catalog(entries: Vec<CatalogEntry>) -> Vec<CatalogEntry> {
    let mut sorted: Vec<CatalogEntry> = entries
        .into_iter()
        .filter(|entry| entry.status == EntryStatus::Active)
        .collect();
    sorted.sort_by(|a, b| {
        a.manifest
            .id
            .cmp(&b.manifest.id)
            .then_with(|| compare_versions(&b.manifest.version, &a.manifest.version))
            .then_with(|| a.source_id.cmp(&b.source_id))
    });

    let mut seen = std::collections::BTreeSet::new();
    sorted
        .into_iter()
        .filter(|entry| seen.insert(entry.manifest.id.to_string()))
        .collect()
}

fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    match (semver::Version::parse(a), semver::Version::parse(b)) {
        (Ok(a), Ok(b)) => a.cmp(&b),
        _ => a.cmp(b),
    }
}

fn http_client() -> Result<reqwest::Client, DevDeckError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(concat!("DevDeck/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|err| {
            DevDeckError::Internal(format!("failed to build registry HTTP client: {err}"))
        })
}

fn ensure_scheme(url: &Url) -> Result<(), DevDeckError> {
    match url.scheme() {
        "https" => Ok(()),
        "http" if is_loopback(url) => Ok(()),
        "file" => Ok(()),
        other => Err(DevDeckError::denied(format!(
            "registry downloads must use https or a local file, got '{other}'"
        ))),
    }
}

fn is_loopback(url: &Url) -> bool {
    matches!(
        url.host_str(),
        Some("localhost") | Some("127.0.0.1") | Some("[::1]") | Some("::1")
    )
}

/// Fetch a URL with a byte cap, https enforcement, and manual redirects.
/// Returns `Ok(None)` for 404 so optional artifacts (`.sig`) stay optional.
async fn fetch_optional(url: &str, max_bytes: u64) -> Result<Option<Vec<u8>>, DevDeckError> {
    let mut current = Url::parse(url)
        .map_err(|err| DevDeckError::InvalidArgument(format!("invalid URL: {err}")))?;

    if current.scheme() == "file" {
        let path = current
            .to_file_path()
            .map_err(|_| DevDeckError::InvalidArgument("invalid local file URL".to_string()))?;
        let metadata = match std::fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(err) => {
                return Err(DevDeckError::Internal(format!(
                    "failed to read {}: {err}",
                    path.display()
                )))
            }
        };
        if !metadata.is_file() {
            return Err(DevDeckError::InvalidArgument(format!(
                "{} is not a file",
                path.display()
            )));
        }
        if metadata.len() > max_bytes {
            return Err(DevDeckError::InvalidArgument(format!(
                "local artifact {} exceeds the {max_bytes} byte limit",
                path.display()
            )));
        }
        return std::fs::read(&path).map(Some).map_err(|err| {
            DevDeckError::Internal(format!("failed to read {}: {err}", path.display()))
        });
    }

    let client = http_client()?;

    for hop in 0..=MAX_REDIRECTS {
        ensure_scheme(&current)?;
        let response =
            client.get(current.clone()).send().await.map_err(|err| {
                DevDeckError::Internal(format!("failed to fetch {current}: {err}"))
            })?;

        let status = response.status();
        if status.is_redirection() {
            if hop == MAX_REDIRECTS {
                return Err(DevDeckError::denied("too many registry redirects"));
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| {
                    DevDeckError::InvalidArgument(
                        "redirect response is missing a Location header".to_string(),
                    )
                })?;
            current = current.join(location).map_err(|err| {
                DevDeckError::InvalidArgument(format!("invalid redirect target: {err}"))
            })?;
            continue;
        }

        if status == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !status.is_success() {
            return Err(DevDeckError::Internal(format!(
                "{current} returned HTTP {}",
                status.as_u16()
            )));
        }
        if let Some(length) = response.content_length() {
            if length > max_bytes {
                return Err(DevDeckError::InvalidArgument(format!(
                    "download from {current} exceeds the {max_bytes} byte limit"
                )));
            }
        }

        let bytes = read_capped(response, max_bytes).await?;
        return Ok(Some(bytes));
    }

    Err(DevDeckError::Internal(
        "registry redirect loop without a response".to_string(),
    ))
}

async fn read_capped(
    mut response: reqwest::Response,
    max_bytes: u64,
) -> Result<Vec<u8>, DevDeckError> {
    let mut buffer: Vec<u8> = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|err| DevDeckError::Internal(format!("failed to read download: {err}")))?
    {
        if buffer.len() as u64 + chunk.len() as u64 > max_bytes {
            return Err(DevDeckError::InvalidArgument(
                "download exceeds the configured size limit".to_string(),
            ));
        }
        buffer.extend_from_slice(&chunk);
    }
    Ok(buffer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reads_local_file_artifacts() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("registry.local.json");
        std::fs::write(&path, b"{\"schemaVersion\":1,\"plugins\":[]}").unwrap();
        let url = Url::from_file_path(&path).unwrap().to_string();
        let bytes = fetch_optional(&url, 1024).await.unwrap().unwrap();
        assert_eq!(bytes, b"{\"schemaVersion\":1,\"plugins\":[]}");

        let missing = Url::from_file_path(dir.path().join("missing.json"))
            .unwrap()
            .to_string();
        assert!(fetch_optional(&missing, 1024).await.unwrap().is_none());
    }
    use devdeck_contract::PluginManifest;
    use serde_json::json;

    fn entry(id: &str, version: &str, source: &str, status: EntryStatus) -> CatalogEntry {
        let manifest: PluginManifest = serde_json::from_value(json!({
            "id": id,
            "name": id,
            "description": "test",
            "version": version,
            "sdkVersion": "2.0",
            "entry": "package/index.html",
            "categoryId": "tools",
            "author": "Test",
            "license": "MIT",
            "permissions": [],
            "httpDomains": []
        }))
        .unwrap();
        CatalogEntry {
            source_id: source.to_string(),
            source_name: source.to_string(),
            manifest,
            download_url: "https://example.com/x.zip".to_string(),
            sha256: "a".repeat(64),
            size: 1,
            published_at: String::new(),
            status,
            signed: false,
        }
    }

    #[test]
    fn merge_keeps_highest_version_per_plugin() {
        let merged = merge_catalog(vec![
            entry("market-a", "1.0.0", "one", EntryStatus::Active),
            entry("market-a", "1.10.0", "two", EntryStatus::Active),
            entry("market-a", "2.0.0", "two", EntryStatus::Yanked),
            entry("market-b", "0.1.0", "one", EntryStatus::Active),
        ]);
        assert_eq!(merged.len(), 2);
        let a = merged
            .iter()
            .find(|e| e.manifest.id.as_str() == "market-a")
            .unwrap();
        assert_eq!(a.manifest.version, "1.10.0");
    }

    fn serve_registry(body: &'static str, expected_requests: usize) -> String {
        use std::io::{BufRead, BufReader, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming().take(expected_requests) {
                let Ok(mut stream) = stream else { continue };
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut request_line = String::new();
                if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
                    continue;
                }
                loop {
                    let mut header = String::new();
                    if reader.read_line(&mut header).unwrap_or(0) == 0 || header == "\r\n" {
                        break;
                    }
                }
                let response = if request_line.contains(".sig") {
                    "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        .to_string()
                } else {
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    )
                };
                let _ = stream.write_all(response.as_bytes());
            }
        });
        format!("http://127.0.0.1:{port}/registry.json")
    }

    #[test]
    fn fetches_and_parses_a_local_registry() {
        let url = serve_registry(r#"{"schemaVersion":2,"name":"Local","plugins":[]}"#, 1);
        let source = RegistrySource {
            id: "local".to_string(),
            name: "Local".to_string(),
            url,
            public_key: None,
            require_signature: false,
            added_at_ms: 1,
        };
        let index = tauri::async_runtime::block_on(fetch_registry(&source)).unwrap();
        assert_eq!(index.plugins.len(), 0);
        assert_eq!(index.name.as_deref(), Some("Local"));
    }

    #[test]
    fn signed_registries_without_a_signature_are_rejected() {
        let url = serve_registry(r#"{"schemaVersion":2,"plugins":[]}"#, 2);
        let source = RegistrySource {
            id: "local".to_string(),
            name: "Local".to_string(),
            url,
            public_key: Some(devdeck_market::signing::encode_base64(&[7u8; 32])),
            require_signature: true,
            added_at_ms: 1,
        };
        let error = tauri::async_runtime::block_on(fetch_registry(&source)).unwrap_err();
        assert_eq!(error.code(), "signature_invalid");
    }

    fn bind_local() -> (std::net::TcpListener, u16) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        (listener, port)
    }

    fn serve_on(
        listener: std::net::TcpListener,
        routes: Vec<(String, String, Vec<u8>)>,
        expected_requests: usize,
    ) {
        use std::io::{BufRead, BufReader, Write};

        std::thread::spawn(move || {
            for stream in listener.incoming().take(expected_requests) {
                let Ok(mut stream) = stream else { continue };
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut request_line = String::new();
                if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
                    continue;
                }
                loop {
                    let mut header = String::new();
                    if reader.read_line(&mut header).unwrap_or(0) == 0 || header == "\r\n" {
                        break;
                    }
                }

                let path = request_line.split_whitespace().nth(1).unwrap_or("/");
                let found = routes.iter().find(|(route, _, _)| route == path);
                let response = match found {
                    Some((_, content_type, body)) => {
                        let mut response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            body.len()
                        )
                        .into_bytes();
                        response.extend_from_slice(body);
                        response
                    }
                    None => {
                        b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                            .to_vec()
                    }
                };
                let _ = stream.write_all(&response);
            }
        });
    }

    fn build_plugin_zip(version: &str) -> Vec<u8> {
        use std::io::{Cursor, Write};

        let manifest = serde_json::json!({
            "schemaVersion": 2,
            "id": "market-demo",
            "name": "Demo",
            "description": "demo plugin",
            "version": version,
            "sdkVersion": "2.0",
            "entry": "package/index.html",
            "categoryId": "tools",
            "author": "Test",
            "license": "MIT",
            "permissions": ["storage:kv"],
            "httpDomains": []
        });

        let mut buffer = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut buffer);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            writer.start_file("manifest.json", options).unwrap();
            writer.write_all(manifest.to_string().as_bytes()).unwrap();
            writer.start_file("package/index.html", options).unwrap();
            writer
                .write_all(b"<!doctype html><html><body>demo</body></html>")
                .unwrap();
            writer.finish().unwrap();
        }
        buffer.into_inner()
    }

    #[test]
    fn installs_a_plugin_from_a_local_registry() {
        use devdeck_contract::Permission;
        use devdeck_market::signing::sha256_hex;

        let zip = build_plugin_zip("1.0.0");
        let sha256 = sha256_hex(&zip);
        let zip_size = zip.len();

        let (listener, port) = bind_local();
        let base = format!("http://127.0.0.1:{port}");
        let registry_body = serde_json::json!({
            "schemaVersion": 2,
            "name": "Local",
            "plugins": [{
                "manifest": {
                    "schemaVersion": 2,
                    "id": "market-demo",
                    "name": "Demo",
                    "description": "demo plugin",
                    "version": "1.0.0",
                    "sdkVersion": "2.0",
                    "entry": "package/index.html",
                    "categoryId": "tools",
                    "author": "Test",
                    "license": "MIT",
                    "permissions": ["storage:kv"],
                    "httpDomains": []
                },
                "downloadUrl": format!("{base}/plugin.zip"),
                "sha256": sha256,
                "size": zip_size,
                "status": "active"
            }]
        })
        .to_string();
        serve_on(
            listener,
            vec![
                (
                    "/registry.json".to_string(),
                    "application/json".to_string(),
                    registry_body.into_bytes(),
                ),
                (
                    "/plugin.zip".to_string(),
                    "application/zip".to_string(),
                    zip,
                ),
            ],
            2,
        );

        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(
            dir.path(),
            std::sync::Arc::new(|_| {}),
            std::sync::Arc::new(|_| {}),
        )
        .unwrap();
        let source = state
            .sources()
            .unwrap()
            .add(
                Some("Local"),
                &format!("{base}/registry.json"),
                None,
                false,
                1,
            )
            .unwrap();
        let id = PluginId::new("market-demo").unwrap();

        let installed =
            tauri::async_runtime::block_on(install_from_registry(&state, &source.id, &id, None))
                .unwrap();

        assert_eq!(installed.manifest.id.as_str(), "market-demo");
        assert_eq!(installed.manifest.version, "1.0.0");
        assert!(installed.dir.join("package/index.html").is_file());
        assert_eq!(state.market().unwrap().list().len(), 1);
        assert!(state
            .broker()
            .unwrap()
            .require(&id, Permission::StorageKv)
            .is_ok());
    }

    #[test]
    fn installs_a_plugin_from_a_local_file_registry() {
        use devdeck_market::signing::sha256_hex;

        let zip = build_plugin_zip("1.0.0");
        let sha256 = sha256_hex(&zip);
        let dir = tempfile::tempdir().unwrap();
        let package_path = dir.path().join("market-demo-1.0.0.zip");
        std::fs::write(&package_path, &zip).unwrap();
        let registry_path = dir.path().join("registry.local.json");
        let registry_body = serde_json::json!({
            "schemaVersion": 2,
            "name": "Local file",
            "plugins": [{
                "manifest": {
                    "schemaVersion": 2,
                    "id": "market-demo",
                    "name": "Demo",
                    "description": "demo plugin",
                    "version": "1.0.0",
                    "sdkVersion": "2.0",
                    "entry": "package/index.html",
                    "categoryId": "tools",
                    "author": "Test",
                    "license": "MIT",
                    "permissions": ["storage:kv"],
                    "httpDomains": []
                },
                "downloadUrl": Url::from_file_path(&package_path).unwrap().to_string(),
                "sha256": sha256,
                "size": zip.len(),
                "status": "active"
            }]
        })
        .to_string();
        std::fs::write(&registry_path, registry_body).unwrap();
        let registry_url = Url::from_file_path(&registry_path).unwrap().to_string();

        let state = AppState::new(
            dir.path(),
            std::sync::Arc::new(|_| {}),
            std::sync::Arc::new(|_| {}),
        )
        .unwrap();
        let source = state
            .sources()
            .unwrap()
            .add(Some("Local file"), &registry_url, None, false, 1)
            .unwrap();
        let id = PluginId::new("market-demo").unwrap();
        let installed =
            tauri::async_runtime::block_on(install_from_registry(&state, &source.id, &id, None))
                .unwrap();
        assert_eq!(installed.manifest.id.as_str(), "market-demo");
        assert!(installed.dir.join("package/index.html").is_file());
    }

    #[test]
    fn http_is_only_allowed_for_loopback() {
        assert!(ensure_scheme(&Url::parse("https://example.com/r.json").unwrap()).is_ok());
        assert!(ensure_scheme(&Url::parse("http://localhost:8080/r.json").unwrap()).is_ok());
        assert!(ensure_scheme(&Url::parse("http://127.0.0.1/r.json").unwrap()).is_ok());
        assert!(ensure_scheme(&Url::parse("http://example.com/r.json").unwrap()).is_err());
        assert!(ensure_scheme(&Url::parse("file:///tmp/registry.local.json").unwrap()).is_ok());
    }

    fn signing_fixture() -> (ed25519_dalek::SigningKey, String, String) {
        use ed25519_dalek::SigningKey;
        let key = SigningKey::from_bytes(&[9u8; 32]);
        let public_key = devdeck_market::signing::encode_base64(key.verifying_key().as_bytes());
        let key_id = devdeck_market::KeyId::from_public_key_base64(&public_key)
            .unwrap()
            .as_str()
            .to_string();
        (key, public_key, key_id)
    }

    fn sign(key: &ed25519_dalek::SigningKey, bytes: &[u8]) -> String {
        use ed25519_dalek::Signer;
        devdeck_market::signing::encode_base64(&key.sign(bytes).to_bytes())
    }

    fn signed_registry(base: &str, zip: &[u8], key_id: &str, package_signature: String) -> Vec<u8> {
        let sha256 = devdeck_market::signing::sha256_hex(zip);
        serde_json::json!({
            "schemaVersion": 2,
            "name": "Signed Local",
            "plugins": [{
                "manifest": {
                    "schemaVersion": 2,
                    "id": "market-demo",
                    "name": "Demo",
                    "description": "demo plugin",
                    "version": "1.0.0",
                    "sdkVersion": "2.0",
                    "entry": "package/index.html",
                    "categoryId": "tools",
                    "author": "Test",
                    "license": "MIT",
                    "permissions": ["storage:kv"],
                    "httpDomains": []
                },
                "downloadUrl": format!("{base}/plugin.zip"),
                "sha256": sha256,
                "size": zip.len(),
                "status": "active",
                "signature": { "keyId": key_id, "signature": package_signature }
            }]
        })
        .to_string()
        .into_bytes()
    }

    fn signed_source(
        state: &AppState,
        base: &str,
        public_key: &str,
    ) -> devdeck_market::RegistrySource {
        state
            .sources()
            .unwrap()
            .add(
                Some("Signed"),
                &format!("{base}/registry.json"),
                Some(public_key),
                true,
                1,
            )
            .unwrap()
    }

    #[test]
    fn installs_a_signed_plugin_from_a_signed_registry() {
        use devdeck_contract::Permission;

        let (key, public_key, key_id) = signing_fixture();
        let zip = build_plugin_zip("1.0.0");
        let package_signature = sign(&key, &zip);

        let (listener, port) = bind_local();
        let base = format!("http://127.0.0.1:{port}");
        let registry_body = signed_registry(&base, &zip, &key_id, package_signature);
        let registry_signature = serde_json::json!({
            "keyId": key_id,
            "signature": sign(&key, &registry_body),
        })
        .to_string()
        .into_bytes();

        serve_on(
            listener,
            vec![
                (
                    "/registry.json".to_string(),
                    "application/json".to_string(),
                    registry_body,
                ),
                (
                    "/registry.json.sig".to_string(),
                    "application/json".to_string(),
                    registry_signature,
                ),
                (
                    "/plugin.zip".to_string(),
                    "application/zip".to_string(),
                    zip,
                ),
            ],
            3,
        );

        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(
            dir.path(),
            std::sync::Arc::new(|_| {}),
            std::sync::Arc::new(|_| {}),
        )
        .unwrap();
        let source = signed_source(&state, &base, &public_key);
        let id = PluginId::new("market-demo").unwrap();

        let installed =
            tauri::async_runtime::block_on(install_from_registry(&state, &source.id, &id, None))
                .unwrap();

        assert_eq!(installed.manifest.version, "1.0.0");
        assert!(installed.dir.join("package/index.html").is_file());
        assert!(state
            .broker()
            .unwrap()
            .require(&id, Permission::StorageKv)
            .is_ok());
    }

    #[test]
    fn rejects_a_package_with_an_invalid_signature() {
        let (key, public_key, key_id) = signing_fixture();
        let zip = build_plugin_zip("1.0.0");

        let (listener, port) = bind_local();
        let base = format!("http://127.0.0.1:{port}");
        let wrong_signature = sign(&key, b"not the package");
        let registry_body = signed_registry(&base, &zip, &key_id, wrong_signature);

        let registry_signature = serde_json::json!({
            "keyId": key_id,
            "signature": sign(&key, &registry_body),
        })
        .to_string()
        .into_bytes();

        serve_on(
            listener,
            vec![
                (
                    "/registry.json".to_string(),
                    "application/json".to_string(),
                    registry_body,
                ),
                (
                    "/registry.json.sig".to_string(),
                    "application/json".to_string(),
                    registry_signature,
                ),
                (
                    "/plugin.zip".to_string(),
                    "application/zip".to_string(),
                    zip,
                ),
            ],
            3,
        );

        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(
            dir.path(),
            std::sync::Arc::new(|_| {}),
            std::sync::Arc::new(|_| {}),
        )
        .unwrap();
        let source = signed_source(&state, &base, &public_key);
        let id = PluginId::new("market-demo").unwrap();

        let error =
            tauri::async_runtime::block_on(install_from_registry(&state, &source.id, &id, None))
                .unwrap_err();
        assert_eq!(error.code(), "signature_invalid");
        assert!(state.market().unwrap().list().is_empty());
    }

    #[test]
    fn rejects_a_registry_with_an_invalid_signature() {
        let (key, public_key, key_id) = signing_fixture();
        let zip = build_plugin_zip("1.0.0");
        let package_signature = sign(&key, &zip);

        let (listener, port) = bind_local();
        let base = format!("http://127.0.0.1:{port}");
        let registry_body = signed_registry(&base, &zip, &key_id, package_signature);
        let wrong_registry_signature = serde_json::json!({
            "keyId": key_id,
            "signature": sign(&key, b"different bytes"),
        })
        .to_string()
        .into_bytes();

        serve_on(
            listener,
            vec![
                (
                    "/registry.json".to_string(),
                    "application/json".to_string(),
                    registry_body,
                ),
                (
                    "/registry.json.sig".to_string(),
                    "application/json".to_string(),
                    wrong_registry_signature,
                ),
                (
                    "/plugin.zip".to_string(),
                    "application/zip".to_string(),
                    zip,
                ),
            ],
            2,
        );

        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(
            dir.path(),
            std::sync::Arc::new(|_| {}),
            std::sync::Arc::new(|_| {}),
        )
        .unwrap();
        let source = signed_source(&state, &base, &public_key);
        let id = PluginId::new("market-demo").unwrap();

        let error =
            tauri::async_runtime::block_on(install_from_registry(&state, &source.id, &id, None))
                .unwrap_err();
        assert_eq!(error.code(), "signature_invalid");
    }

    /// Manual acceptance harness for the real Marketplace pipeline.
    ///
    /// ```bash
    /// DEVDECK_ACCEPT_REGISTRY=http://127.0.0.1:8765/registry.json \
    /// DEVDECK_ACCEPT_PUBKEY=<base64 public key> \
    /// cargo test -p devdeck-desktop manual_signed_registry_acceptance -- --ignored --nocapture
    /// ```
    #[test]
    #[ignore = "manual acceptance: needs DEVDECK_ACCEPT_REGISTRY and DEVDECK_ACCEPT_PUBKEY"]
    fn manual_signed_registry_acceptance() {
        let registry_url = std::env::var("DEVDECK_ACCEPT_REGISTRY")
            .expect("set DEVDECK_ACCEPT_REGISTRY to the served registry.json URL");
        let public_key = std::env::var("DEVDECK_ACCEPT_PUBKEY")
            .expect("set DEVDECK_ACCEPT_PUBKEY to the marketplace public key");
        let plugin_id = std::env::var("DEVDECK_ACCEPT_PLUGIN")
            .unwrap_or_else(|_| "market-emoji-search".to_string());

        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(
            dir.path(),
            std::sync::Arc::new(|_| {}),
            std::sync::Arc::new(|_| {}),
        )
        .unwrap();

        let source = state
            .sources()
            .unwrap()
            .add(
                Some("Acceptance"),
                &registry_url,
                Some(&public_key),
                true,
                1,
            )
            .unwrap();
        let id = PluginId::new(&plugin_id).unwrap();

        let installed =
            tauri::async_runtime::block_on(install_from_registry(&state, &source.id, &id, None))
                .expect("signed registry install");

        println!(
            "installed {} {} from {}",
            installed.manifest.id, installed.manifest.version, source.name
        );
        assert!(installed.dir.join(&installed.manifest.entry).is_file());

        let grant = state
            .broker()
            .unwrap()
            .summary(&id)
            .expect("capability grant");
        println!("granted permissions: {:?}", grant.permissions);
        println!("host pins: {}", grant.http_domains.join(", "));

        assert!(!grant.permissions.is_empty());
    }
}
