pub mod github_release_resolver;
pub mod html_resolver;
pub mod static_resolver;
pub mod webview_resolver;

use crate::catalog::model::ResolverSpec;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ResolveError {
    #[error("resolver type '{0}' is not implemented yet")]
    Unsupported(&'static str),
    #[error("network error while resolving URL: {0}")]
    Network(String),
    #[error("could not parse resolver output: {0}")]
    Parse(String),
    #[error("{0}")]
    NotFound(String),
}

/// Shared by resolvers that pull a raw attribute value out of a page (`html`, `webview`):
/// optionally narrows it down with a regex, then optionally joins it against a base URL.
pub(crate) fn apply_base_and_regex(
    mut value: String,
    base_url: &Option<String>,
    url_regex: &Option<String>,
) -> Result<String, ResolveError> {
    if let Some(pattern) = url_regex {
        let re = regex::Regex::new(pattern).map_err(|e| ResolveError::Parse(e.to_string()))?;
        value = re
            .find(&value)
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| ResolveError::NotFound(format!("url_regex '{pattern}' did not match '{value}'")))?;
    }

    match base_url {
        Some(base) => {
            let base = url::Url::parse(base).map_err(|e| ResolveError::Parse(e.to_string()))?;
            let joined = base.join(&value).map_err(|e| ResolveError::Parse(e.to_string()))?;
            Ok(joined.to_string())
        }
        None => Ok(value),
    }
}

pub async fn resolve(app_handle: &tauri::AppHandle, spec: &ResolverSpec) -> Result<String, ResolveError> {
    match spec {
        ResolverSpec::Static { .. } => static_resolver::resolve(spec),
        ResolverSpec::GithubRelease { .. } => github_release_resolver::resolve(spec).await,
        ResolverSpec::Html { .. } => html_resolver::resolve(spec).await,
        ResolverSpec::Webview { .. } => webview_resolver::resolve(app_handle, spec).await,
    }
}

#[cfg(test)]
mod tests {
    use super::apply_base_and_regex;

    #[test]
    fn apply_base_and_regex_joins_relative_url_against_base() {
        let result = apply_base_and_regex(
            "/files/app.exe".to_string(),
            &Some("https://example.com/download/".to_string()),
            &None,
        )
        .unwrap();
        assert_eq!(result, "https://example.com/files/app.exe");
    }

    #[test]
    fn apply_base_and_regex_narrows_with_regex_before_joining() {
        let result = apply_base_and_regex(
            "click here to get app-1.2.3-x64.exe now".to_string(),
            &None,
            &Some(r"app-[\d.]+-x64\.exe".to_string()),
        )
        .unwrap();
        assert_eq!(result, "app-1.2.3-x64.exe");
    }

    #[test]
    fn apply_base_and_regex_errors_when_regex_does_not_match() {
        let result = apply_base_and_regex("nothing useful here".to_string(), &None, &Some(r"app-[\d.]+\.exe".to_string()));
        assert!(result.is_err());
    }
}

/// These call the underlying network-hitting resolvers directly (not the top-level `resolve`
/// dispatcher) so they don't need a real `AppHandle` — only `webview_resolver` needs one, and it
/// can't be meaningfully unit-tested without a real OS window/webview anyway (see that module).
#[cfg(test)]
mod live_tests {
    use super::*;

    #[tokio::test]
    async fn github_release_resolves_7zip() {
        let spec = ResolverSpec::GithubRelease {
            repo: "ip7z/7zip".to_string(),
            asset_pattern: "7z*-x64.exe".to_string(),
        };
        let url = github_release_resolver::resolve(&spec)
            .await
            .expect("should resolve a real 7-Zip release asset");
        assert!(url.contains("7z"), "unexpected url: {url}");
        assert!(url.ends_with("-x64.exe"), "unexpected url: {url}");
    }

    #[tokio::test]
    async fn html_resolves_winrar() {
        let spec = ResolverSpec::Html {
            page_url: "https://www.win-rar.com/download.html".to_string(),
            selector: "a[href*='winrar-x64-'][href$='.exe']".to_string(),
            attr: "href".to_string(),
            base_url: Some("https://www.win-rar.com/".to_string()),
            url_regex: None,
        };
        let url = html_resolver::resolve(&spec).await.expect("should resolve a real WinRAR download link");
        assert!(url.contains("winrar-x64-"), "unexpected url: {url}");
        assert!(url.ends_with(".exe"), "unexpected url: {url}");
    }

    #[tokio::test]
    async fn html_windscribe_page_is_still_js_rendered() {
        // Documents *why* windscribe.com needs the webview resolver: confirms the plain
        // html resolver still can't see the download link (a plain fetch never runs the
        // page's JS). If this ever starts succeeding, windscribe.com started
        // server-rendering the link and the catalog entry could drop back to `html`.
        let spec = ResolverSpec::Html {
            page_url: "https://windscribe.com/download".to_string(),
            selector: "a.windows-download".to_string(),
            attr: "href".to_string(),
            base_url: None,
            url_regex: None,
        };
        let result = html_resolver::resolve(&spec).await;
        println!("windscribe html-resolver result (expected to fail): {result:?}");
    }
}
