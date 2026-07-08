use crate::scripts::generator;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn generate_script(app_handle: AppHandle, script_id: String) -> Result<String, String> {
    let spec = generator::find(&script_id).ok_or_else(|| format!("Unknown script: {script_id}"))?;
    let dest_dir = app_handle.path().download_dir().map_err(|e| e.to_string())?;
    let dest_path = dest_dir.join(spec.filename);
    std::fs::write(&dest_path, spec.content).map_err(|e| e.to_string())?;
    Ok(dest_path.to_string_lossy().to_string())
}

/// Windows-only: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`. Anything in
/// here runs (once, unelevated) at login — no registry/task-scheduler entry needed.
fn startup_dir() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA")
        .map_err(|_| "Pin to Startup is only supported on Windows.".to_string())?;
    Ok(PathBuf::from(appdata)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Startup"))
}

fn startup_bat_path(script_id: &str) -> Result<PathBuf, String> {
    Ok(startup_dir()?.join(format!("PostWipe-{script_id}.bat")))
}

#[tauri::command]
pub fn is_script_pinned(script_id: String) -> Result<bool, String> {
    Ok(startup_bat_path(&script_id)?.exists())
}

/// Writes a tiny `.bat` wrapper into the Windows Startup folder that invokes the already
/// -generated script via PowerShell. Re-checks the script still exists on disk at pin time —
/// if the user deleted it from Downloads after generating it, this fails with a clear error
/// instead of silently pinning a broken shortcut that would no-op at next login.
#[tauri::command]
pub fn pin_script_to_startup(script_id: String, script_path: String) -> Result<(), String> {
    if !std::path::Path::new(&script_path).exists() {
        return Err(format!(
            "{script_path} no longer exists — generate the script again before pinning it."
        ));
    }
    let bat_path = startup_bat_path(&script_id)?;
    let bat_content = format!("@echo off\r\npowershell -ExecutionPolicy Bypass -File \"{script_path}\"\r\n");
    std::fs::write(&bat_path, bat_content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn unpin_script_from_startup(script_id: String) -> Result<(), String> {
    let bat_path = startup_bat_path(&script_id)?;
    if bat_path.exists() {
        std::fs::remove_file(&bat_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
