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

/// The app naming itself, for hosts where pretending to be a browser backfires.
pub(crate) const APP_USER_AGENT: &str = concat!("PostWipe-Installer/", env!("CARGO_PKG_VERSION"));

/// Which User-Agent to download `url` with.
///
/// SourceForge is the exception to the browser-UA rule above, in the opposite direction:
/// a browser UA gets Cloudflare's "Just a moment..." JavaScript challenge (a 403 HTML page),
/// while a plain client gets the installer. Checked 2026-09-18 against Equalizer APO and
/// Peace: browser UA → 403 text/html; `PostWipe-Installer/x` → 206 application/octet-stream
/// with an `MZ` header. Covers the redirect too - downloads.sourceforge.net hands off to a
/// `*.dl.sourceforge.net` mirror, and the client's UA is sent on every hop.
pub(crate) fn user_agent_for(url: &str) -> &'static str {
    let host = reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_ascii_lowercase));
    match host {
        Some(h) if h == "sourceforge.net" || h.ends_with(".sourceforge.net") => APP_USER_AGENT,
        _ => BROWSER_USER_AGENT,
    }
}

#[cfg(test)]
mod user_agent_tests {
    use super::*;

    #[test]
    fn sourceforge_and_its_mirrors_get_the_app_ua() {
        for url in [
            "https://downloads.sourceforge.net/project/equalizerapo/1.4.2/EqualizerAPO-x64-1.4.2.exe",
            "https://sourceforge.net/projects/equalizerapo/files/1.4.2/EqualizerAPO-x64-1.4.2.exe/download",
            "https://netactuate.dl.sourceforge.net/project/equalizerapo/1.4.2/x.exe",
        ] {
            assert_eq!(user_agent_for(url), APP_USER_AGENT, "{url}");
        }
    }

    #[test]
    fn everything_else_keeps_the_browser_ua() {
        for url in [
            "https://download.scdn.co/SpotifySetup.exe",
            "https://notsourceforge.net/file.exe",
            "not a url",
        ] {
            assert_eq!(user_agent_for(url), BROWSER_USER_AGENT, "{url}");
        }
    }
}

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
