//! Commands behind the download-health badges.
//!
//! Two sources, deliberately:
//!   * `load_catalog_health` — ONE request at launch for the file the weekly CI sweep
//!     publishes. Instant, costs the vendors nothing, and (unlike the catalog, which is
//!     compiled into the binary) it updates between releases, so a link that rots in
//!     October is flagged without shipping a new build.
//!   * `run_health_check` — the Settings button. Really resolves and fetches every entry
//!     for THIS machine's OS, streaming each result to the terminal view as it lands.
//!     Slower, but it's the user's own network, which is the only verdict that truly
//!     matters for whether their download will work.
//!
//! A local run outranks the published file and is cached to disk, so the badges keep the
//! better answer across restarts.

use crate::catalog::model::Os;
use crate::health::{self, EntryHealth, HealthReport, HealthStatus};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

/// Published by `.github/workflows/link-health.yml` on master. Public repo, so this is an
/// unauthenticated read with no token and no rate limit worth worrying about.
const PUBLISHED_HEALTH_URL: &str =
    "https://raw.githubusercontent.com/aattiaibrahim/PostWipe-Installer/master/health.json";

const FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

/// Published data older than this is dropped rather than shown. A stale report is worse
/// than none: it would grey out a download the vendor fixed weeks ago. The sweep runs
/// weekly, so this tolerates three missed runs before the badges simply disappear.
const MAX_REPORT_AGE_SECS: u64 = 28 * 24 * 60 * 60;

/// The two caches are kept SEPARATE on purpose. A local check only ever covers the OS the
/// user is running, so storing it over the published report would wipe every badge for the
/// other platform the moment they flip the OS filter. Keeping both lets the loader overlay
/// the user's own (better) results on top of the full-catalog published ones.
fn cache_file(app_handle: &AppHandle, source: &str) -> Result<PathBuf, String> {
    let dir = app_handle.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(if source == "local" { "health-local.json" } else { "health-published.json" }))
}

fn read_cached(app_handle: &AppHandle, source: &str) -> Option<HealthReport> {
    let raw = std::fs::read_to_string(cache_file(app_handle, source).ok()?).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_cached(app_handle: &AppHandle, report: &HealthReport) {
    // Best-effort: losing the cache costs one extra fetch next launch, nothing more.
    if let Ok(path) = cache_file(app_handle, &report.source) {
        if let Ok(json) = serde_json::to_string(report) {
            let _ = std::fs::write(path, json);
        }
    }
}

fn is_fresh(report: &HealthReport) -> bool {
    health::now_unix().saturating_sub(report.generated_at) < MAX_REPORT_AGE_SECS
}

/// The health report to badge the catalog with, or `None` when nothing trustworthy is
/// available — in which case the UI shows no badges at all rather than inventing a status.
///
/// Order of preference: a local live check the user ran (most authoritative — their own
/// network), then freshly published CI data, then whatever was cached last launch.
#[tauri::command]
pub async fn load_catalog_health(app_handle: AppHandle) -> Option<HealthReport> {
    // The weekly published sweep: the whole catalog, both platforms, one request.
    let fetched = async {
        let client = reqwest::Client::builder().timeout(FETCH_TIMEOUT).build().ok()?;
        let response = client.get(PUBLISHED_HEALTH_URL).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        response.json::<HealthReport>().await.ok()
    }
    .await;

    let published = match fetched {
        Some(report) if is_fresh(&report) => {
            write_cached(&app_handle, &report);
            Some(report)
        }
        // Offline, or the published file is stale/missing — fall back to the last copy we
        // saw, but still refuse to show anything past its shelf life.
        _ => read_cached(&app_handle, "published").filter(is_fresh),
    };

    let local = read_cached(&app_handle, "local").filter(is_fresh);

    match (published, local) {
        (Some(published), Some(local)) => {
            // Overlay the user's own results — checked on their network, so more relevant —
            // while keeping published coverage for everything the local run didn't touch
            // (the other OS, and anything that resolver-less entry set doesn't include).
            let mut entries = published.entries;
            for entry in &local.entries {
                match entries.iter_mut().find(|e| e.app_id == entry.app_id && e.os == entry.os) {
                    Some(existing) => *existing = entry.clone(),
                    None => entries.push(entry.clone()),
                }
            }
            Some(HealthReport { generated_at: local.generated_at, source: "local".to_string(), entries })
        }
        (published, local) => published.or(local),
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent<'a> {
    done: usize,
    total: usize,
    app_id: &'a str,
    os: Os,
    status: HealthStatus,
    detail: &'a str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartEvent {
    total: usize,
    os: Os,
}

/// Run a real check of every download for `os` (defaulting to the running OS), emitting
/// `health-check:start`, `health-check:progress` per entry and `health-check:done`.
///
/// Returns the finished report; the caller gets the same data the events streamed, so the
/// UI can render either the live terminal or just the final badges.
#[tauri::command]
pub async fn run_health_check(app_handle: AppHandle, os: Option<Os>) -> Result<HealthReport, String> {
    let catalog = crate::catalog::loader::load_catalog();

    let target_os = os.unwrap_or(if cfg!(target_os = "macos") { Os::Macos } else { Os::Windows });
    let total = health::checkable_entries(&catalog, Some(target_os)).len();

    let _ = app_handle.emit("health-check:start", StartEvent { total, os: target_os });

    let mut done = 0usize;
    let report = health::sweep(
        &catalog,
        Some(target_os),
        health::DEFAULT_CONCURRENCY,
        "local",
        |entry: &EntryHealth| {
            done += 1;
            let _ = app_handle.emit(
                "health-check:progress",
                ProgressEvent {
                    done,
                    total,
                    app_id: &entry.app_id,
                    os: entry.os,
                    status: entry.status,
                    detail: &entry.detail,
                },
            );
        },
    )
    .await;

    write_cached(&app_handle, &report);
    let _ = app_handle.emit("health-check:done", &report);
    Ok(report)
}

/// Drop a local check so the badges fall back to the published CI data on next load.
#[tauri::command]
pub fn clear_local_health(app_handle: AppHandle) -> Result<(), String> {
    let path = cache_file(&app_handle, "local")?;
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
