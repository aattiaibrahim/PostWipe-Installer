pub mod github_release_resolver;
pub mod html_regex_resolver;
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
/// First line-ish of a fetched body, for error messages. Keeps failures readable in logs,
/// issues and the UI instead of pasting an entire page.
fn truncate_for_error(value: &str) -> String {
    let flat: String = value.chars().map(|c| if c.is_whitespace() { ' ' } else { c }).collect();
    let trimmed = flat.trim();
    match trimmed.char_indices().nth(120) {
        Some((idx, _)) => format!("{}…", &trimmed[..idx]),
        None => trimmed.to_string(),
    }
}

pub(crate) fn apply_base_and_regex(
    mut value: String,
    base_url: &Option<String>,
    url_regex: &Option<String>,
) -> Result<String, ResolveError> {
    if let Some(pattern) = url_regex {
        let re = regex::Regex::new(pattern).map_err(|e| ResolveError::Parse(e.to_string()))?;
        value = re.find(&value).map(|m| m.as_str().to_string()).ok_or_else(|| {
            // `value` here is often a WHOLE page body — quoting it in full produced
            // multi-megabyte error messages (a failing sweep dumped 1.8 MB of HTML).
            ResolveError::NotFound(format!(
                "url_regex '{pattern}' did not match the {} chars fetched, starting: {}",
                value.len(),
                truncate_for_error(&value)
            ))
        })?;
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

/// A resolved download, with the publisher's SHA-256 when the source provides one.
pub struct Resolved {
    pub url: String,
    pub sha256: Option<String>,
}

pub async fn resolve_download(app_handle: &tauri::AppHandle, spec: &ResolverSpec) -> Result<Resolved, ResolveError> {
    match spec {
        ResolverSpec::GithubRelease { .. } => github_release_resolver::resolve_with_digest(spec).await,
        _ => resolve(app_handle, spec).await.map(|url| Resolved { url, sha256: None }),
    }
}

pub async fn resolve(app_handle: &tauri::AppHandle, spec: &ResolverSpec) -> Result<String, ResolveError> {
    match spec {
        ResolverSpec::Static { .. } => static_resolver::resolve(spec),
        ResolverSpec::GithubRelease { .. } => github_release_resolver::resolve(spec).await,
        ResolverSpec::Html { .. } => html_resolver::resolve(spec).await,
        ResolverSpec::HtmlRegex { .. } => html_regex_resolver::resolve(spec).await,
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
    fn apply_base_and_regex_encodes_spaces_when_joining_rsi_filename() {
        // The RSI Launcher's latest.yml names a file WITH A SPACE; joining it onto the base
        // must percent-encode the space or the download 404s.
        let body = "version: 2.15.4\nfiles:\n  - url: RSI Launcher-Setup-2.15.4.exe\n";
        let result = apply_base_and_regex(
            body.to_string(),
            &Some("https://install.robertsspaceindustries.com/rel/2/".to_string()),
            &Some(r"RSI Launcher-Setup-[0-9.]+\.exe".to_string()),
        )
        .unwrap();
        assert_eq!(
            result,
            "https://install.robertsspaceindustries.com/rel/2/RSI%20Launcher-Setup-2.15.4.exe"
        );
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
    async fn windscribe_resolves_from_their_own_github_releases() {
        // windscribe.com/download is JS-rendered (a Next.js shell with no installer URL in
        // the raw HTML at all), and the /install/desktop/<os> redirect that used to sidestep
        // that stopped redirecting in September 2026 — it now answers 200 text/html and
        // bounces to that same JS page, which is how this entry silently broke.
        //
        // Windscribe's desktop client is open source and their own org publishes the same
        // signed builds per release, so that's the source now: no JS, no scraping, and the
        // version tracks itself.
        let spec = ResolverSpec::GithubRelease {
            repo: "Windscribe/Desktop-App".to_string(),
            asset_pattern: "Windscribe_*_amd64.exe".to_string(),
        };
        let url = github_release_resolver::resolve(&spec)
            .await
            .expect("should resolve a real Windscribe installer");
        assert!(url.contains("Windscribe_"), "unexpected url: {url}");
        assert!(url.ends_with("_amd64.exe"), "unexpected url: {url}");
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
    async fn html_regex_resolves_ddu_from_majorgeeks_and_url_downloads() {
        // wagnardsoft.com and guru3d.com both sit behind Cloudflare JS challenges, so DDU
        // comes from majorgeeks.com's mirror page instead. Its per-session tokenized file
        // URL only appears inside an HTML comment (no selector can reach it), hence the
        // html_regex resolver. The token rotates per fetch, so this also GETs the resolved
        // URL to prove a cookie-less two-step resolve→download actually works.
        let spec = ResolverSpec::HtmlRegex {
            page_url: "https://www.majorgeeks.com/mg/getmirror/display_driver_uninstaller,1.html".to_string(),
            url_regex: r"https://files[0-9]+\.majorgeeks\.com/[a-f0-9]+/drivers/DDU[^<>\x22]*?_setup\.exe".to_string(),
            base_url: None,
        };
        let url = html_regex_resolver::resolve(&spec).await.expect("should resolve the current DDU installer");
        assert!(url.ends_with("_setup.exe"), "unexpected url: {url}");

        let client = reqwest::Client::new();
        let response = client
            .head(&url)
            .send()
            .await
            .expect("resolved DDU url should be reachable");
        assert!(response.status().is_success(), "unexpected status: {}", response.status());
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        assert!(
            !content_type.contains("text/html"),
            "resolved DDU url served HTML, not a binary: {content_type}"
        );
    }

    #[tokio::test]
    async fn static_resolves_asrock_timing_configurator() {
        // timingconfigurator.com is dead DNS; the tool is ASRock's, hosted (pinned at its
        // long-final v4.0.4) on ASRock's own download server.
        let spec = ResolverSpec::Static {
            url: "https://download.asrock.com/Utility/Formula/TimingConfigurator(v4.0.4).zip".to_string(),
        };
        let url = static_resolver::resolve(&spec).unwrap();
        let response = reqwest::Client::new().head(&url).send().await.expect("ASRock url should be reachable");
        assert!(response.status().is_success(), "unexpected status: {}", response.status());
    }

    /// Resolves EVERY catalog entry through the real resolver code, then fetches each
    /// resolved URL with the same client configuration the downloader uses (same
    /// User-Agent — a curl-with-flags check once passed while the app 403'd, precisely
    /// because the verification client didn't match the app's).
    ///
    /// The checking and classification live in `crate::health` so that this sweep, the
    /// badges the app shows at launch, and the live check in Settings can never disagree
    /// about what "broken" means. This test is the CI half: it also writes `health.json`,
    /// which the workflow commits and the shipped app reads.
    ///
    /// `#[ignore]`d because it hammers ~40 vendor sites; run manually before releases:
    /// `cargo test --lib -- --ignored --nocapture full_catalog_sweep`
    #[tokio::test]
    #[ignore = "hits every vendor site in the catalog — run manually"]
    async fn full_catalog_sweep_every_entry_resolves_and_downloads() {
        use crate::health::{self, HealthStatus};

        let catalog = crate::catalog::loader::load_catalog();
        let report = health::sweep(&catalog, None, health::DEFAULT_CONCURRENCY, "ci", |_| {}).await;
        let (ok, unknown, broken) = report.counts();

        // Written next to the crate so the workflow can commit it to master; the app then
        // fetches it at launch and badges the catalog without making a single vendor request.
        let json = serde_json::to_string_pretty(&report).expect("report should serialise");
        std::fs::write("health.json", json).expect("should be able to write health.json");

        // Printed (use --nocapture) so the scheduled health check can paste it into an issue.
        println!("--- catalog sweep: {} entr(ies) checked, {broken} broken, {unknown} unverified, {ok} ok ---", report.entries.len());
        for entry in &report.entries {
            match entry.status {
                HealthStatus::Ok => {}
                HealthStatus::Unknown => println!("UNCOVERED  {}/{:?}: {}", entry.app_id, entry.os, entry.detail),
                HealthStatus::Broken => println!("BROKEN     {}/{:?}: {}", entry.app_id, entry.os, entry.detail),
            }
        }

        // Only definitive breakage fails the sweep. Bot-blocks and dead connections land in
        // Unknown on purpose — the first scheduled run called 6 entries broken and 3 of them
        // (Tarkov, Prime95, PuTTY) worked fine from a normal connection minutes later.
        let broken_list: Vec<String> = report
            .entries
            .iter()
            .filter(|e| e.status == HealthStatus::Broken)
            .map(|e| format!("{}/{:?}: {}", e.app_id, e.os, e.detail))
            .collect();
        assert!(broken_list.is_empty(), "catalog sweep failures:\n{}", broken_list.join("\n"));
    }

    /// Feeds scripts/collect-signers.mjs: resolves every signable Windows download (exe/msi) to
    /// its current URL and writes `target/signable-urls.json`. The script then reads just each
    /// installer's signature block over HTTP ranges to learn who signed it.
    ///
    /// `cargo test --lib -- --ignored --nocapture dump_signable_windows_urls`
    #[tokio::test]
    #[ignore = "resolves every Windows download against vendor sites — run manually"]
    async fn dump_signable_windows_urls() {
        use crate::catalog::model::Os;

        let catalog = crate::catalog::loader::load_catalog();
        let mut out = Vec::new();
        for app in catalog.categories.iter().flat_map(|c| &c.apps) {
            let Some(platform) = app.platforms.get(&Os::Windows) else { continue };
            let Some(spec) = &platform.resolver else { continue };
            let filename = platform.filename.clone().unwrap_or_default().to_lowercase();
            if !(filename.ends_with(".exe") || filename.ends_with(".msi")) {
                continue;
            }
            let url = match spec {
                ResolverSpec::Static { .. } => super::static_resolver::resolve(spec),
                ResolverSpec::GithubRelease { .. } => super::github_release_resolver::resolve(spec).await,
                ResolverSpec::Html { .. } => super::html_resolver::resolve(spec).await,
                ResolverSpec::HtmlRegex { .. } => super::html_regex_resolver::resolve(spec).await,
                ResolverSpec::Webview { .. } => continue,
            };
            match url {
                Ok(url) => out.push(serde_json::json!({ "appId": app.id, "filename": filename, "url": url })),
                Err(e) => println!("SKIP {}: {e}", app.id),
            }
        }
        std::fs::create_dir_all("target").unwrap();
        std::fs::write("target/signable-urls.json", serde_json::to_string_pretty(&out).unwrap()).unwrap();
        println!("wrote {} urls", out.len());
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
