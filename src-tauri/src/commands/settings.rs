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

/// Where the remembered Specials key lives. Stored as `<app version>\n<key>` so an
/// app UPDATE invalidates it and the vault returns to its locked default.
fn vault_file(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("vault"))
}

/// The remembered vault key, or None when the vault should be locked — which is the
/// default (no file), after an explicit lock (file removed), or whenever the stored
/// version doesn't match the running one (i.e. the app was updated).
#[tauri::command]
pub fn get_vault_key(app_handle: AppHandle) -> Option<String> {
    let path = vault_file(&app_handle).ok()?;
    let raw = std::fs::read_to_string(&path).ok()?;
    let (stored_version, key) = raw.split_once('\n')?;
    if stored_version.trim() != app_handle.package_info().version.to_string() {
        // Updated since the key was saved — re-lock and drop it.
        let _ = std::fs::remove_file(&path);
        return None;
    }
    let key = key.trim();
    if key.is_empty() {
        None
    } else {
        Some(key.to_string())
    }
}

/// Remember the validated vault key so the app stays unlocked across launches.
#[tauri::command]
pub fn set_vault_key(app_handle: AppHandle, key: String) -> Result<(), String> {
    let path = vault_file(&app_handle)?;
    let body = format!("{}\n{}", app_handle.package_info().version, key.trim());
    std::fs::write(path, body).map_err(|e| e.to_string())
}

/// Forget the remembered key (the padlock in Settings) — the vault locks again.
#[tauri::command]
pub fn clear_vault_key(app_handle: AppHandle) -> Result<(), String> {
    let path = vault_file(&app_handle)?;
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        // Already absent = already locked; that's a success, not an error.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
