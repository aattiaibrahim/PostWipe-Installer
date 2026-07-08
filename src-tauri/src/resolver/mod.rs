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
    async fn windscribe_download_page_is_js_rendered_but_has_a_stable_redirect() {
        // The marketing page (windscribe.com/download) really is JS-rendered — a plain fetch
        // sees an empty Next.js shell with no .exe link anywhere. But windscribe.com also
        // exposes a stable, versionless redirect endpoint that isn't gated behind any JS at
        // all, so the `static` resolver can just point at that instead of needing a webview.
        let marketing_page = reqwest::get("https://windscribe.com/download").await.unwrap().text().await.unwrap();
        assert!(
            !marketing_page.contains(".exe"),
            "windscribe.com/download started containing a direct .exe link — the marketing page may no longer be JS-only"
        );

        let spec = ResolverSpec::Static {
            url: "https://windscribe.com/install/desktop/windows".to_string(),
        };
        let url = static_resolver::resolve(&spec).unwrap();
        let response = reqwest::get(&url).await.expect("should follow the redirect to a real installer");
        assert!(response.url().as_str().ends_with(".exe"), "unexpected final url: {}", response.url());
    }

    #[tokio::test]
    async fn html_resolves_pycharm_via_jetbrains_stable_download_api() {
        // jetbrains.com/pycharm/download itself is JS-rendered, but JetBrains publishes a
        // stable, versionless API (the same one their own site's download button calls) that
        // 302s straight to the current installer — no scraping or JS execution needed.
        let spec = ResolverSpec::Static {
            url: "https://data.services.jetbrains.com/products/download?code=PCC&platform=windows".to_string(),
        };
        let url = static_resolver::resolve(&spec).unwrap();
        let response = reqwest::get(&url).await.expect("should follow the redirect to a real installer");
        assert!(response.url().as_str().ends_with(".exe"), "unexpected final url: {}", response.url());
    }

    #[tokio::test]
    async fn html_resolves_teamspeak_data_url_attribute() {
        // teamspeak.com/en/downloads is NOT actually JS-rendered — the real download URL is
        // right there in the static HTML, just on a <button data-url="..."> instead of an
        // <a href="...">, which is why the original `a.download-windows` selector never
        // matched anything (wrong tag, wrong attribute, wrong class).
        let spec = ResolverSpec::Html {
            page_url: "https://teamspeak.com/en/downloads/#ts3client".to_string(),
            selector: "button[data-url*='TeamSpeak3-Client-win64']".to_string(),
            attr: "data-url".to_string(),
            base_url: None,
            url_regex: None,
        };
        let url = html_resolver::resolve(&spec).await.expect("should resolve a real TeamSpeak download link");
        assert!(url.contains("TeamSpeak3-Client-win64"), "unexpected url: {url}");
        assert!(url.ends_with(".exe"), "unexpected url: {url}");
    }

    #[tokio::test]
    async fn html_resolves_cpuz_latest_via_download_host_rewrite() {
        // cpuid.com's software pages list every version, newest first, so the first
        // '-en.exe' match is the current release — but its href points at www.cpuid.com,
        // which serves an HTML interstitial instead of the binary. The url_regex extracts
        // just the filename and base_url rejoins it against download.cpuid.com, which
        // serves the real installer.
        let spec = ResolverSpec::Html {
            page_url: "https://www.cpuid.com/softwares/cpu-z.html".to_string(),
            selector: "a[href*='cpu-z_'][href$='-en.exe']".to_string(),
            attr: "href".to_string(),
            base_url: Some("https://download.cpuid.com/cpu-z/".to_string()),
            url_regex: Some(r"cpu-z_[^/]*-en\.exe".to_string()),
        };
        let url = html_resolver::resolve(&spec).await.expect("should resolve the current CPU-Z installer");
        assert!(url.starts_with("https://download.cpuid.com/cpu-z/cpu-z_"), "unexpected url: {url}");
        assert!(url.ends_with("-en.exe"), "unexpected url: {url}");
    }

    #[tokio::test]
    async fn html_resolves_hwmonitor_latest_via_download_host_rewrite() {
        let spec = ResolverSpec::Html {
            page_url: "https://www.cpuid.com/softwares/hwmonitor.html".to_string(),
            selector: "a[href*='hwmonitor_'][href$='.exe']".to_string(),
            attr: "href".to_string(),
            base_url: Some("https://download.cpuid.com/hwmonitor/".to_string()),
            url_regex: Some(r"hwmonitor_[^/]*\.exe".to_string()),
        };
        let url = html_resolver::resolve(&spec).await.expect("should resolve the current HWMonitor installer");
        assert!(url.starts_with("https://download.cpuid.com/hwmonitor/hwmonitor_"), "unexpected url: {url}");
        assert!(url.ends_with(".exe"), "unexpected url: {url}");
    }

    #[tokio::test]
    async fn html_resolves_hwinfo_latest_installer() {
        let spec = ResolverSpec::Html {
            page_url: "https://www.hwinfo.com/download/".to_string(),
            selector: "a[href*='files/hwi64_'][href$='.exe']".to_string(),
            attr: "href".to_string(),
            base_url: None,
            url_regex: None,
        };
        let url = html_resolver::resolve(&spec).await.expect("should resolve the current HWiNFO installer");
        assert!(url.contains("hwinfo.com/files/hwi64_"), "unexpected url: {url}");
        assert!(url.ends_with(".exe"), "unexpected url: {url}");
    }

    #[tokio::test]
    async fn html_resolves_putty_latest_installer() {
        // PuTTY's 'latest/' directory alias stays current but the .msi filename inside it is
        // versioned, so a pinned static URL 404s after every release — scraping their own
        // latest.html page (plain static HTML) tracks the version automatically.
        let spec = ResolverSpec::Html {
            page_url: "https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html".to_string(),
            selector: "a[href*='w64'][href$='installer.msi']".to_string(),
            attr: "href".to_string(),
            base_url: None,
            url_regex: None,
        };
        let url = html_resolver::resolve(&spec).await.expect("should resolve the current PuTTY installer");
        assert!(url.contains("w64"), "unexpected url: {url}");
        assert!(url.ends_with("installer.msi"), "unexpected url: {url}");
    }
}
