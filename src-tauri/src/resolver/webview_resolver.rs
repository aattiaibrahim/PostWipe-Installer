use super::ResolveError;
use crate::catalog::model::ResolverSpec;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

/// Extra time to wait for `eval_with_callback` to come back after the render wait, on top
/// of `wait_ms` itself — covers slow script execution, not page rendering.
const CALLBACK_GRACE: Duration = Duration::from_secs(10);

/// Resolves a download link on a page whose real download button only exists after
/// client-side JS runs (Windscribe, TeamSpeak, PyCharm — see `notes` on those catalog
/// entries). Unlike `html_resolver`, this loads the page in a real, hidden Tauri webview
/// (WebView2 on Windows) so the page's own JS actually executes, then reads the resolved
/// element's attribute out of the live DOM — instead of a plain HTTP fetch that only ever
/// sees the pre-JS HTML.
pub async fn resolve(app_handle: &AppHandle, spec: &ResolverSpec) -> Result<String, ResolveError> {
    let (page_url, selector, attr, base_url, url_regex, wait_ms) = match spec {
        ResolverSpec::Webview {
            page_url,
            selector,
            attr,
            base_url,
            url_regex,
            wait_ms,
        } => (page_url, selector, attr, base_url, url_regex, *wait_ms),
        _ => return Err(ResolveError::Unsupported("webview")),
    };

    let parsed_url = url::Url::parse(page_url).map_err(|e| ResolveError::Parse(e.to_string()))?;
    let label = format!("resolver-{}", uuid::Uuid::new_v4());

    let window = WebviewWindowBuilder::new(app_handle, &label, WebviewUrl::External(parsed_url))
        .visible(false)
        .build()
        .map_err(|e| ResolveError::Network(format!("failed to open hidden resolver window for {page_url}: {e}")))?;

    // Give the page's own JS time to render its real download link before we read the DOM.
    tokio::time::sleep(Duration::from_millis(wait_ms)).await;

    let (tx, rx) = oneshot::channel::<String>();
    let tx = Mutex::new(Some(tx));

    // We author this script ourselves (selector/attr come from our own catalog.json, never
    // from the remote page), so there's no need to expose any Tauri API to windscribe.com's
    // own JS — `eval_with_callback` just runs it and hands the JSON-serialized result back.
    let selector_json = serde_json::to_string(selector).map_err(|e| ResolveError::Parse(e.to_string()))?;
    let attr_json = serde_json::to_string(attr).map_err(|e| ResolveError::Parse(e.to_string()))?;
    let script = format!(
        "(function() {{ var el = document.querySelector({selector_json}); return el ? el.getAttribute({attr_json}) : null; }})()"
    );

    let eval_result = window.eval_with_callback(script, move |result_json: String| {
        if let Some(sender) = tx.lock().unwrap().take() {
            let _ = sender.send(result_json);
        }
    });
    if let Err(e) = eval_result {
        let _ = window.close();
        return Err(ResolveError::Network(format!("failed to evaluate script in resolver window: {e}")));
    }

    let result_json = tokio::time::timeout(Duration::from_millis(wait_ms) + CALLBACK_GRACE, rx).await;
    let _ = window.close();

    let result_json = result_json
        .map_err(|_| ResolveError::NotFound(format!("timed out waiting for {page_url} to render")))?
        .map_err(|_| ResolveError::NotFound(format!("resolver window for {page_url} closed unexpectedly")))?;

    let value: Option<String> = serde_json::from_str(&result_json)
        .map_err(|e| ResolveError::Parse(format!("unexpected script result '{result_json}': {e}")))?;

    let value =
        value.ok_or_else(|| ResolveError::NotFound(format!("no element matched selector '{selector}' on {page_url}")))?;

    super::apply_base_and_regex(value, base_url, url_regex)
}
