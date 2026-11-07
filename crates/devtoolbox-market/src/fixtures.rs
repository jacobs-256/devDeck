//! Test fixtures: build real plugin packages in memory.

use std::io::{Cursor, Write};

use serde_json::json;
use zip::write::SimpleFileOptions;

/// A valid schema-2 manifest for `market-demo`.
pub fn sample_manifest(version: &str) -> serde_json::Value {
    json!({
        "schemaVersion": 2,
        "id": "market-demo",
        "name": "Demo Plugin",
        "description": "A plugin used by the marketplace tests",
        "version": version,
        "sdkVersion": "2.0",
        "entry": "package/index.html",
        "categoryId": "text-tools",
        "author": "DevToolBox",
        "license": "Apache-2.0",
        "permissions": ["storage:kv", "log:write"]
    })
}

/// Build a ZIP archive from `(path, contents)` pairs.
pub fn zip_files(files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut buffer = Cursor::new(Vec::new());
    {
        let mut writer = zip::ZipWriter::new(&mut buffer);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o644);
        for (name, contents) in files {
            writer.start_file(*name, options).unwrap();
            writer.write_all(contents).unwrap();
        }
        writer.finish().unwrap();
    }
    buffer.into_inner()
}

/// A complete plugin package for the given manifest.
pub fn plugin_zip(manifest: &serde_json::Value) -> Vec<u8> {
    zip_files(&[
        ("manifest.json", manifest.to_string().as_bytes()),
        (
            "package/index.html",
            b"<!doctype html><html><body>demo</body></html>",
        ),
    ])
}

/// A single-entry archive, used for malicious-input tests.
pub fn zip_with(name: &str, contents: &[u8]) -> Vec<u8> {
    zip_files(&[(name, contents)])
}
