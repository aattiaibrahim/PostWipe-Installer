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

/// Checks whether this script was already generated in a *previous* session and is still
/// sitting in Downloads. Without this, "Pin to Startup" only ever unlocked after clicking
/// "Generate Script" again on every fresh app launch, even if the file was already there —
/// easy to mistake for the feature being broken.
#[tauri::command]
pub fn find_generated_script(app_handle: AppHandle, script_id: String) -> Result<Option<String>, String> {
    let spec = generator::find(&script_id).ok_or_else(|| format!("Unknown script: {script_id}"))?;
    let dest_dir = app_handle.path().download_dir().map_err(|e| e.to_string())?;
    let dest_path = dest_dir.join(spec.filename);
    Ok(if dest_path.exists() {
        Some(dest_path.to_string_lossy().to_string())
    } else {
        None
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Exercises the real filesystem path used by pin/unpin, on the real Windows Startup
    /// folder on this machine — not a temp dir — since the whole point is to prove the
    /// actual location the running app writes to is correct and writable.
    #[test]
    fn pin_then_unpin_round_trips_on_the_real_startup_folder() {
        let script_id = "postwipe-selftest-pin";
        let script_path = std::env::temp_dir().join("postwipe-selftest-pin.ps1");
        std::fs::write(&script_path, "# test\n").unwrap();

        assert!(!is_script_pinned(script_id.to_string()).unwrap(), "should start unpinned");

        pin_script_to_startup(script_id.to_string(), script_path.to_string_lossy().to_string()).unwrap();
        assert!(is_script_pinned(script_id.to_string()).unwrap(), "should report pinned right after pinning");

        let bat_path = startup_bat_path(script_id).unwrap();
        assert!(bat_path.exists(), "bat file should actually exist at {}", bat_path.display());
        let content = std::fs::read_to_string(&bat_path).unwrap();
        assert!(content.contains("powershell"), "bat should invoke powershell: {content}");
        assert!(
            content.contains(&script_path.to_string_lossy().to_string()),
            "bat should reference the script path: {content}"
        );

        unpin_script_from_startup(script_id.to_string()).unwrap();
        assert!(!is_script_pinned(script_id.to_string()).unwrap(), "should report unpinned after unpinning");
        assert!(!bat_path.exists(), "bat file should be gone after unpinning");

        std::fs::remove_file(&script_path).ok();
    }

    #[test]
    fn pin_fails_clearly_when_the_script_file_no_longer_exists() {
        let result = pin_script_to_startup(
            "postwipe-selftest-missing".to_string(),
            std::env::temp_dir()
                .join("postwipe-selftest-does-not-exist.ps1")
                .to_string_lossy()
                .to_string(),
        );
        assert!(result.is_err(), "pinning a nonexistent script should fail, not silently succeed");
    }
}
