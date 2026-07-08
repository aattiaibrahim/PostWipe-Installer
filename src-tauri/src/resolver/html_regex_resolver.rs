use super::html_resolver::{BROWSER_USER_AGENT, REQUEST_TIMEOUT};
use super::ResolveError;
use crate::catalog::model::ResolverSpec;

/// Like `html`, but runs a regex over the raw page body instead of matching a CSS
/// selector. Exists for download URLs that live outside element attributes — e.g.
/// majorgeeks.com embeds its per-session tokenized file URL only inside an HTML
/// comment, which no selector can reach. The first regex match is returned verbatim,
/// so the pattern should match the complete URL.
pub async fn resolve(spec: &ResolverSpec) -> Result<String, ResolveError> {
    let (page_url, url_regex) = match spec {
        ResolverSpec::HtmlRegex { page_url, url_regex } => (page_url, url_regex),
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

    let re = regex::Regex::new(url_regex).map_err(|e| ResolveError::Parse(e.to_string()))?;
    re.find(&body)
        .map(|m| m.as_str().to_string())
        .ok_or_else(|| ResolveError::NotFound(format!("url_regex '{url_regex}' matched nothing on {page_url}")))
}
