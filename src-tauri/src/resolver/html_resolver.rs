use super::ResolveError;
use crate::catalog::model::ResolverSpec;
use scraper::{Html, Selector};
use std::time::Duration;

pub(crate) const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
/// Some vendor sites (e.g. teamspeak.com) sit behind bot-protection that 403s reqwest's
/// default user agent outright. A realistic desktop-browser UA gets treated like any other
/// visitor's browser.
pub(crate) const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

pub async fn resolve(spec: &ResolverSpec) -> Result<String, ResolveError> {
    let (page_url, selector, attr, base_url, url_regex) = match spec {
        ResolverSpec::Html {
            page_url,
            selector,
            attr,
            base_url,
            url_regex,
        } => (page_url, selector, attr, base_url, url_regex),
        _ => return Err(ResolveError::Unsupported("html")),
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

    let document = Html::parse_document(&body);
    let parsed_selector =
        Selector::parse(selector).map_err(|e| ResolveError::Parse(format!("invalid selector '{selector}': {e:?}")))?;

    let element = document
        .select(&parsed_selector)
        .next()
        .ok_or_else(|| ResolveError::NotFound(format!("no element matched selector '{selector}' on {page_url}")))?;

    let value = element
        .value()
        .attr(attr)
        .ok_or_else(|| ResolveError::NotFound(format!("matched element has no '{attr}' attribute")))?
        .to_string();

    super::apply_base_and_regex(value, base_url, url_regex)
}
