use super::html_resolver::{BROWSER_USER_AGENT, REQUEST_TIMEOUT};
use super::ResolveError;
use crate::catalog::model::ResolverSpec;

/// Like `html`, but runs a regex over the raw page body instead of matching a CSS
/// selector. Exists for download URLs that live outside element attributes — e.g.
/// majorgeeks.com embeds its per-session tokenized file URL only inside an HTML
/// comment, which no selector can reach. Without `base_url` the first regex match is
/// returned verbatim, so the pattern must match the complete URL; with `base_url` the
/// match may be a relative path/filename that gets joined onto the base (e.g. the RSI
/// Launcher's `latest.yml` names only `RSI Launcher-Setup-<ver>.exe`).
pub async fn resolve(spec: &ResolverSpec) -> Result<String, ResolveError> {
    let (page_url, url_regex, base_url) = match spec {
        ResolverSpec::HtmlRegex {
            page_url,
            url_regex,
            base_url,
        } => (page_url, url_regex, base_url),
        _ => return Err(ResolveError::Unsupported("html_regex")),
    };

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| ResolveError::Network(e.to_string()))?;

    let body = client
        .get(page_url)
        .header("User-Agent", BROWSER_USER_AGENT)
        .send()
        .await
        .map_err(|e| ResolveError::Network(e.to_string()))?
        .error_for_status()
        .map_err(|e| ResolveError::Network(e.to_string()))?
        .text()
        .await
        .map_err(|e| ResolveError::Network(e.to_string()))?;

    // Regex-narrow the body to the match, then join onto base_url when present. The shared
    // helper handles the URL join (and percent-encodes spaces, e.g. the RSI filename).
    super::apply_base_and_regex(body, base_url, &Some(url_regex.clone()))
}
