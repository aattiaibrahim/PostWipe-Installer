//! Catalog health: does each entry still resolve to a real, downloadable file?
//!
//! One implementation feeds three consumers, so they can never disagree:
//!   * the weekly CI sweep (`full_catalog_sweep`, which publishes `health.json`),
//!   * the badges the app shows at launch (read from that published file),
//!   * the on-demand live check in Settings (runs this against the user's own network).
//!
//! The important design decision here is the THREE-WAY status rather than pass/fail.
//! The first scheduled run reported 6 broken entries; re-testing from a normal home
//! connection showed 3 of them (Tarkov 403, Prime95, PuTTY) were perfectly fine — GitHub
//! runner IPs get bot-blocked and rate-limited. A binary checker would have greyed out
//! three working downloads for a week. So a failure the checker cannot distinguish from
//! "the network hated us" is reported as `Unknown`, never `Broken`.

use crate::catalog::model::{Catalog, Os, ResolverSpec};
use crate::resolver::{
    github_release_resolver, html_regex_resolver, html_resolver, static_resolver, ResolveError,
};
use futures_util::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// How many entries to check at once. The sweep is ~60 entries per OS; serial would take
/// minutes, and much above this the shared vendor CDNs start answering 429 — which this
/// module would then honestly (but uselessly) report as `Unknown`.
pub const DEFAULT_CONCURRENCY: usize = 6;

/// Pause before re-testing anything that didn't come back clean. Vendors rate-limit in
/// bursts (TeamSpeak answered 429 on one run and fine on the next), so a single blip must
/// not be allowed to mark an entry.
const RECHECK_PAUSE: Duration = Duration::from_secs(4);

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    /// Resolved, and the resolved URL served something that isn't a web page.
    Ok,
    /// Could not be verified either way — bot-block, rate limit, timeout, dead connection,
    /// or a resolver that needs a real browser. NOT evidence the download is broken.
    Unknown,
    /// Definitively wrong: a 404, a web page where a binary should be, a regex that no
    /// longer matches, or a release with no matching asset. These are the ones worth fixing.
    Broken,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryHealth {
    pub app_id: String,
    pub os: Os,
    pub status: HealthStatus,
    /// Human-readable reason, shown in the tooltip and the live-check terminal.
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthReport {
    /// Unix seconds. The UI turns this into "checked 3 days ago" and stops trusting a
    /// report that has gone stale.
    pub generated_at: u64,
    /// `"ci"` for the published weekly sweep, `"local"` for a live check the user ran.
    pub source: String,
    pub entries: Vec<EntryHealth>,
}

impl HealthReport {
    pub fn counts(&self) -> (usize, usize, usize) {
        let mut ok = 0;
        let mut unknown = 0;
        let mut broken = 0;
        for entry in &self.entries {
            match entry.status {
                HealthStatus::Ok => ok += 1,
                HealthStatus::Unknown => unknown += 1,
                HealthStatus::Broken => broken += 1,
            }
        }
        (ok, unknown, broken)
    }
}

pub fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// The same client configuration the downloader uses. This matters more than it looks:
/// a `curl`-with-flags check once passed while the app itself 403'd, precisely because the
/// verifying client didn't match the real one. A health check that lies is worse than none.
pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .user_agent(html_resolver::BROWSER_USER_AGENT)
        .build()
        .expect("reqwest client with static config should always build")
}

/// Resolve one spec and confirm the result actually serves a file.
pub async fn check_spec(spec: &ResolverSpec, client: &reqwest::Client) -> (HealthStatus, String) {
    let resolved = match spec {
        ResolverSpec::Static { .. } => static_resolver::resolve(spec),
        ResolverSpec::GithubRelease { .. } => github_release_resolver::resolve(spec).await,
        ResolverSpec::Html { .. } => html_resolver::resolve(spec).await,
        ResolverSpec::HtmlRegex { .. } => html_regex_resolver::resolve(spec).await,
        // A webview spec runs a real browser against a JS-rendered page. Driving one per
        // entry inside a bulk sweep is slow and flaky, and it can't run headlessly in CI at
        // all — so it's honestly reported as unverified everywhere rather than checked in
        // one place and guessed at in another.
        ResolverSpec::Webview { .. } => {
            return (
                HealthStatus::Unknown,
                "needs a real browser page — verify this one by hand".to_string(),
            )
        }
    };

    let url = match resolved {
        Ok(url) => url,
        // Network here means we never got a usable answer out of the vendor: DNS, TLS,
        // timeout, or GitHub's API rate limit (which surfaces as a 403 through
        // `error_for_status`). None of that says the download is dead.
        Err(err @ ResolveError::Network(_)) => {
            return (HealthStatus::Unknown, format!("couldn't reach the vendor: {err}"))
        }
        // Parse/NotFound/Unsupported mean we DID read the page and what we expected wasn't
        // there — a renamed file, a changed layout, a pulled release. That's real breakage.
        Err(err) => return (HealthStatus::Broken, format!("resolve failed: {err}")),
    };

    // GET rather than HEAD — several hosts reject HEAD — but the body is dropped unread.
    match client.get(&url).send().await {
        Ok(response) if response.status().is_success() => {
            let content_type = response
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            if content_type.contains("text/html") {
                // Landing pages, consent walls and "your download will begin shortly"
                // interstitials all look like success but hand the user HTML.
                (
                    HealthStatus::Broken,
                    format!("served a web page instead of a file ({url})"),
                )
            } else {
                (HealthStatus::Ok, url)
            }
        }
        Ok(response) => {
            let status = response.status();
            // 403 is overwhelmingly bot-detection rather than a missing file, 429 is an
            // explicit rate limit, and 5xx is the vendor having a bad day.
            let transient = status.as_u16() == 403
                || status.as_u16() == 408
                || status.as_u16() == 429
                || status.is_server_error();
            if transient {
                (
                    HealthStatus::Unknown,
                    format!("vendor answered {status} — likely a bot-block or rate limit"),
                )
            } else {
                (HealthStatus::Broken, format!("{url} returned {status}"))
            }
        }
        // A connection that never completed is indistinguishable from a blocked one.
        Err(err) => (
            HealthStatus::Unknown,
            format!("couldn't reach the download: {err}"),
        ),
    }
}

/// Every (app, os) pair in the catalog that has a resolver to check, in catalog order.
///
/// Specs are cloned rather than borrowed: the sweep hands each one to a future that
/// outlives this call, and a borrow there makes the closure fail Tauri's higher-ranked
/// lifetime bound. They're small, and there are ~120 of them.
pub fn checkable_entries(catalog: &Catalog, only_os: Option<Os>) -> Vec<(String, Os, ResolverSpec)> {
    let mut out = Vec::new();
    for category in &catalog.categories {
        for app in &category.apps {
            for (os, platform) in &app.platforms {
                if let Some(wanted) = only_os {
                    if *os != wanted {
                        continue;
                    }
                }
                // Link/script/placeholder entries have nothing to download.
                let Some(spec) = &platform.resolver else { continue };
                out.push((app.id.clone(), *os, spec.clone()));
            }
        }
    }
    out
}

/// Check every entry, calling `on_result` once per entry with its FINAL status.
///
/// Anything that doesn't come back clean on the first pass is held back, re-checked after
/// a pause, and only then reported — so a transient blip never reaches the caller as a
/// result at all. Clean entries stream out immediately, which keeps the live-check terminal
/// scrolling instead of appearing to hang.
pub async fn sweep<F>(
    catalog: &Catalog,
    only_os: Option<Os>,
    concurrency: usize,
    source: &str,
    mut on_result: F,
) -> HealthReport
where
    F: FnMut(&EntryHealth),
{
    let client = client();
    let targets = checkable_entries(catalog, only_os);

    let mut entries: Vec<EntryHealth> = Vec::with_capacity(targets.len());
    let mut suspects: Vec<(String, Os, ResolverSpec)> = Vec::new();

    let mut first_pass = stream::iter(targets.into_iter().map(|(app_id, os, spec)| {
        let client = client.clone();
        async move {
            let (status, detail) = check_spec(&spec, &client).await;
            (app_id, os, spec, status, detail)
        }
    }))
    .buffer_unordered(concurrency);

    while let Some((app_id, os, spec, status, detail)) = first_pass.next().await {
        if status == HealthStatus::Ok {
            let entry = EntryHealth { app_id, os, status, detail };
            on_result(&entry);
            entries.push(entry);
        } else {
            let _ = detail;
            suspects.push((app_id, os, spec));
        }
    }

    if !suspects.is_empty() {
        tokio::time::sleep(RECHECK_PAUSE).await;
        let mut second_pass = stream::iter(suspects.into_iter().map(|(app_id, os, spec)| {
            let client = client.clone();
            async move {
                let (status, detail) = check_spec(&spec, &client).await;
                EntryHealth { app_id, os, status, detail }
            }
        }))
        .buffer_unordered(concurrency);

        while let Some(entry) = second_pass.next().await {
            on_result(&entry);
            entries.push(entry);
        }
    }

    // Catalog order, so the published file and the issue body read predictably.
    entries.sort_by(|a, b| a.app_id.cmp(&b.app_id).then(format!("{:?}", a.os).cmp(&format!("{:?}", b.os))));

    HealthReport {
        generated_at: now_unix(),
        source: source.to_string(),
        entries,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_split_by_status() {
        let report = HealthReport {
            generated_at: 0,
            source: "test".to_string(),
            entries: vec![
                EntryHealth { app_id: "a".into(), os: Os::Windows, status: HealthStatus::Ok, detail: String::new() },
                EntryHealth { app_id: "b".into(), os: Os::Windows, status: HealthStatus::Unknown, detail: String::new() },
                EntryHealth { app_id: "c".into(), os: Os::Macos, status: HealthStatus::Broken, detail: String::new() },
                EntryHealth { app_id: "d".into(), os: Os::Macos, status: HealthStatus::Broken, detail: String::new() },
            ],
        };
        assert_eq!(report.counts(), (1, 1, 2));
    }

    #[test]
    fn only_entries_with_a_resolver_are_checkable() {
        let catalog = crate::catalog::loader::load_catalog();
        let all = checkable_entries(&catalog, None);
        assert!(!all.is_empty(), "the catalog should have downloadable entries");

        // Bookmarks and scripts carry no resolver and must never be health-checked — a
        // bookmark has nothing to download, so marking it red would be nonsense.
        let windows_only = checkable_entries(&catalog, Some(Os::Windows));
        assert!(windows_only.len() < all.len(), "filtering by OS should narrow the set");
        assert!(windows_only.iter().all(|(_, os, _)| *os == Os::Windows));
    }

    #[test]
    fn webview_specs_are_unknown_not_broken() {
        // Guards the rule that keeps the sweep honest: anything we can't actually verify
        // must land in Unknown, never Broken.
        let spec = ResolverSpec::Webview {
            page_url: "https://example.com".to_string(),
            selector: "a".to_string(),
            attr: "href".to_string(),
            base_url: None,
            url_regex: None,
            wait_ms: 1,
        };
        let client = client();
        let (status, _) = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(check_spec(&spec, &client));
        assert_eq!(status, HealthStatus::Unknown);
    }
}
