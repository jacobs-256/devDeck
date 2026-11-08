//! `plugin://localhost/<plugin-id>/<path>` — serves installed plugin assets.
//!
//! Restrictions, in order: the plugin must be installed, enabled, and the
//! resolved file must stay inside its directory after symlink resolution. Only
//! files that actually exist are served, and responses are never cached so a
//! reinstall can't leave a stale script in the webview cache.

use std::borrow::Cow;

use devdeck_contract::{ensure_within, resolve_within, PluginId};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::Manager;

use crate::state::AppState;

type Body = Cow<'static, [u8]>;

/// CSP applied to every plugin document.
///
/// `connect-src 'none'` is the important part: plugins cannot call `fetch`,
/// `XMLHttpRequest`, `WebSocket`, or `EventSource` directly, so all network
/// access must go through the capability broker (`http.request`,
/// `socket.*`, `ssh.*`). Inline scripts stay allowed because plugins are
/// untrusted-but-sandboxed documents and several published plugins ship a theme
/// bootstrap inline.
pub const PLUGIN_CSP: &str = "default-src 'self' data: blob:; \
script-src 'self' 'unsafe-inline'; \
style-src 'self' 'unsafe-inline'; \
img-src 'self' data: blob:; \
font-src 'self' data:; \
media-src 'self' data: blob:; \
connect-src 'none'; \
frame-src 'none'; \
child-src 'none'; \
object-src 'none'; \
base-uri 'none'; \
form-action 'none'";

fn security_headers(response: tauri::http::response::Builder) -> tauri::http::response::Builder {
    response
        .header("Content-Security-Policy", PLUGIN_CSP)
        .header("Referrer-Policy", "no-referrer")
        .header("X-Content-Type-Options", "nosniff")
}

pub fn serve(app: &tauri::AppHandle, request: Request<Vec<u8>>) -> Response<Body> {
    match resolve_request(app, &request) {
        Ok((mime, bytes)) => security_headers(
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::CACHE_CONTROL, "no-store"),
        )
        .body(Cow::Owned(bytes))
        .expect("valid plugin response"),
        Err(status) => Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(Cow::Borrowed(&b""[..]))
            .expect("valid error response"),
    }
}

fn resolve_request(
    app: &tauri::AppHandle,
    request: &Request<Vec<u8>>,
) -> Result<(String, Vec<u8>), StatusCode> {
    let uri = request.uri();
    // macOS/Linux serve `plugin://localhost/<id>/…`; WebView2 on Windows maps
    // custom schemes to `http://plugin.localhost/<id>/…`.
    if !matches!(uri.host(), Some("localhost") | Some("plugin.localhost")) {
        return Err(StatusCode::NOT_FOUND);
    }

    let path = uri.path().trim_start_matches('/');
    let (raw_id, relative) = path.split_once('/').ok_or(StatusCode::NOT_FOUND)?;
    let plugin_id = PluginId::new(raw_id).map_err(|_| StatusCode::NOT_FOUND)?;

    let state = app.state::<AppState>();
    let plugin = {
        let market = state
            .market()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        market.get(&plugin_id)
    }
    .ok_or(StatusCode::NOT_FOUND)?;

    if !plugin.enabled {
        return Err(StatusCode::FORBIDDEN);
    }

    let target = resolve_within(&plugin.dir, relative).map_err(|_| StatusCode::BAD_REQUEST)?;
    let canonical = ensure_within(&plugin.dir, &target).map_err(|_| StatusCode::FORBIDDEN)?;
    let bytes = std::fs::read(&canonical).map_err(|_| StatusCode::NOT_FOUND)?;
    let mime = mime_guess::from_path(&canonical)
        .first_or_octet_stream()
        .to_string();

    Ok((mime, bytes))
}

#[cfg(test)]
mod tests {
    use super::PLUGIN_CSP;

    #[test]
    fn plugin_csp_blocks_direct_network_access() {
        assert!(PLUGIN_CSP.contains("connect-src 'none'"));
        assert!(PLUGIN_CSP.contains("object-src 'none'"));
        assert!(PLUGIN_CSP.contains("base-uri 'none'"));
        assert!(!PLUGIN_CSP.contains("connect-src *"));
    }
}
