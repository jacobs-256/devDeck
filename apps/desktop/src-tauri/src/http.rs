//! Host-side HTTP proxy (`http:proxy` / `http:external`).
//!
//! The allowlist is re-checked on **every** redirect hop, so a permitted host
//! cannot bounce the request to an unlisted one. Response bodies are capped to
//! keep a malicious server from exhausting memory.

use std::collections::BTreeMap;
use std::time::Duration;

use devdeck_contract::{DevDeckError, PluginId};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::state::AppState;

const MAX_REDIRECTS: usize = 3;
const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS: u64 = 15_000;
const MAX_TIMEOUT_MS: u64 = 60_000;

/// Headers a plugin may never set: they would let it forge the transport.
const FORBIDDEN_HEADERS: &[&str] = &[
    "host",
    "content-length",
    "connection",
    "transfer-encoding",
    "upgrade",
    "proxy-authorization",
];

const ALLOWED_METHODS: &[&str] = &["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestParams {
    pub url: String,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    /// Legacy SDK hint: `text`, `json`, or `arrayBuffer`.
    #[serde(default)]
    pub response_type: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub data: Value,
    pub truncated: bool,
    pub final_url: String,
}

/// Execute an allowlisted HTTP request on behalf of a plugin.
pub async fn execute(
    state: &AppState,
    plugin_id: &PluginId,
    params: HttpRequestParams,
) -> Result<HttpResponse, DevDeckError> {
    let method = params
        .method
        .as_deref()
        .unwrap_or("GET")
        .trim()
        .to_ascii_uppercase();
    if !ALLOWED_METHODS.contains(&method.as_str()) {
        return Err(DevDeckError::InvalidArgument(format!(
            "HTTP method '{method}' is not allowed"
        )));
    }

    let timeout = Duration::from_millis(
        params
            .timeout_ms
            .unwrap_or(DEFAULT_TIMEOUT_MS)
            .clamp(1, MAX_TIMEOUT_MS),
    );
    let response_type = match params.response_type.as_deref() {
        None | Some("text") | Some("json") => params.response_type.clone(),
        Some("arrayBuffer") => {
            return Err(DevDeckError::Unsupported(
                "responseType 'arrayBuffer' is not supported over the JSON bridge; use http:external from the webview instead"
                    .to_string(),
            ))
        }
        Some(other) => {
            return Err(DevDeckError::InvalidArgument(format!(
                "unknown responseType '{other}'"
            )))
        }
    };

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|err| DevDeckError::Internal(format!("failed to build HTTP client: {err}")))?;

    let mut current = params.url.clone();

    for hop in 0..=MAX_REDIRECTS {
        // Authorize this hop. The guard is dropped before the await so the
        // future stays Send and the broker is never held during I/O.
        let url = {
            let broker = state.broker()?;
            broker.authorize_http(plugin_id, &current)?
        };

        let method = reqwest::Method::from_bytes(method.as_bytes())
            .map_err(|err| DevDeckError::InvalidArgument(format!("invalid HTTP method: {err}")))?;

        let mut builder = client.request(method, url.clone());
        for (name, value) in &params.headers {
            let lower = name.to_ascii_lowercase();
            if FORBIDDEN_HEADERS.contains(&lower.as_str()) {
                continue;
            }
            builder = builder.header(lower, value);
        }
        if let Some(body) = &params.body {
            builder = builder.body(body.clone());
        }

        let response = builder.send().await.map_err(|err| {
            DevDeckError::Internal(format!(
                "HTTP request to {} failed: {err}",
                url.host_str().unwrap_or("host")
            ))
        })?;

        let status = response.status();
        if status.is_redirection() {
            if hop == MAX_REDIRECTS {
                return Err(DevDeckError::denied("too many HTTP redirects (limit is 3)"));
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
            let next = url.join(location).map_err(|err| {
                DevDeckError::InvalidArgument(format!("invalid redirect target: {err}"))
            })?;
            current = next.to_string();
            continue;
        }

        let mut headers = BTreeMap::new();
        for (name, value) in response.headers() {
            if let Ok(value) = value.to_str() {
                headers.insert(name.as_str().to_string(), value.to_string());
            }
        }

        let (bytes, truncated) = read_capped(response).await?;
        let data = match response_type.as_deref() {
            Some("json") => serde_json::from_slice::<Value>(&bytes)
                .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).to_string())),
            Some("text") => Value::String(String::from_utf8_lossy(&bytes).to_string()),
            _ => decode_body(&bytes, headers.get("content-type")),
        };

        return Ok(HttpResponse {
            status: status.as_u16(),
            headers,
            data,
            truncated,
            final_url: url.to_string(),
        });
    }

    Err(DevDeckError::Internal(
        "redirect loop without a response".to_string(),
    ))
}

async fn read_capped(mut response: reqwest::Response) -> Result<(Vec<u8>, bool), DevDeckError> {
    let mut buffer: Vec<u8> = Vec::new();
    let mut truncated = false;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|err| DevDeckError::Internal(format!("failed to read response body: {err}")))?
    {
        if buffer.len() + chunk.len() > MAX_RESPONSE_BYTES {
            let remaining = MAX_RESPONSE_BYTES.saturating_sub(buffer.len());
            buffer.extend_from_slice(&chunk[..remaining]);
            truncated = true;
            break;
        }
        buffer.extend_from_slice(&chunk);
    }
    Ok((buffer, truncated))
}

fn decode_body(bytes: &[u8], content_type: Option<&String>) -> Value {
    let looks_json = content_type
        .map(|value| {
            let lower = value.to_ascii_lowercase();
            lower.contains("json") || lower.contains("+json")
        })
        .unwrap_or(false);

    if looks_json {
        if let Ok(value) = serde_json::from_slice::<Value>(bytes) {
            return value;
        }
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => Value::String(text.to_string()),
        Err(_) => Value::String(format!("<{} bytes of binary data>", bytes.len())),
    }
}
