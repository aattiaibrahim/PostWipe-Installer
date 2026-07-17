use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Small key/value prefs the app persists itself, independent of the WebView's
/// localStorage — WebView2/WKWebView don't reliably keep localStorage across
/// restarts for a packaged app, which is why the theme kept resetting. We write
/// a plain file in the app config dir so the choice truly survives a relaunch.
fn theme_file(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("theme"))
}

/// The saved theme id (e.g. "dracula"), or None if the user has never chosen one.
#[tauri::command]
pub fn get_theme(app_handle: AppHandle) -> Option<String> {
    let path = theme_file(&app_handle).ok()?;
    let value = std::fs::read_to_string(path).ok()?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Persist the chosen theme id to disk. Best-effort: a write failure just means
/// the next launch falls back to the default, so surface the error but don't panic.
#[tauri::command]
pub fn set_theme(app_handle: AppHandle, theme: String) -> Result<(), String> {
    let path = theme_file(&app_handle)?;
    std::fs::write(path, theme.trim()).map_err(|e| e.to_string())
}
