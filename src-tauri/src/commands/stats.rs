//! Anonymous community download counts, for the Home page's "Popular" shelf.
//!
//! Only the catalog app id and the OS are sent — never an account, device id, or anything
//! about the machine — and only for public CATALOG downloads (never Specials vault items,
//! which are private to people with the key). Users can switch it off in Settings; the choice
//! is disk-backed like the theme, because an opt-out that silently reset when the WebView
//! dropped localStorage would be worse than no opt-out at all.

use crate::catalog::model::Os;
use crate::commands::account::AccountState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

fn pref_file(app_handle: &AppHandle) -> Option<PathBuf> {
    let dir = app_handle.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("share-download-stats"))
}

/// On unless the user has explicitly turned it off.
pub fn sharing_enabled(app_handle: &AppHandle) -> bool {
    pref_file(app_handle)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|v| v.trim() != "off")
        .unwrap_or(true)
}

#[tauri::command]
pub fn get_share_stats(app_handle: AppHandle) -> bool {
    sharing_enabled(&app_handle)
}

#[tauri::command]
pub fn set_share_stats(app_handle: AppHandle, enabled: bool) -> Result<(), String> {
    let path = pref_file(&app_handle).ok_or("Couldn't find the settings folder.")?;
    std::fs::write(path, if enabled { "on" } else { "off" }).map_err(|e| e.to_string())
}

/// Fire-and-forget: a stats request must never slow down or fail a download.
pub fn record_download(app_handle: &AppHandle, app_id: &str, os: Os) {
    if !sharing_enabled(app_handle) {
        return;
    }
    let Some(state) = app_handle.try_state::<AccountState>() else { return };
    let url = format!("{}/api/stats/download", state.0.base());
    let body = serde_json::json!({ "appId": app_id, "os": os });
    tauri::async_runtime::spawn(async move {
        if let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(8)).build() {
            let _ = client.post(url).json(&body).send().await;
        }
    });
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PopularApp {
    pub app_id: String,
    pub count: u64,
}

#[derive(Debug, Deserialize)]
struct PopularResponse {
    apps: Vec<PopularApp>,
}

/// The most-downloaded apps for `os` over the last 30 days. An empty list (rather than an
/// error) when the service can't be reached, so Home just hides the shelf.
#[tauri::command]
pub async fn stats_popular(state: State<'_, AccountState>, os: Os) -> Result<Vec<PopularApp>, String> {
    let os = match os {
        Os::Windows => "windows",
        Os::Macos => "macos",
    };
    let url = format!("{}/api/stats/popular?os={os}&days=30&limit=12", state.0.base());
    let client = reqwest::Client::builder().timeout(Duration::from_secs(8)).build().map_err(|e| e.to_string())?;
    let Ok(res) = client.get(url).send().await else { return Ok(Vec::new()) };
    if !res.status().is_success() {
        return Ok(Vec::new());
    }
    Ok(res.json::<PopularResponse>().await.map(|r| r.apps).unwrap_or_default())
}
