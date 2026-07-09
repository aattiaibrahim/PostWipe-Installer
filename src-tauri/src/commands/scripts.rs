use crate::scripts::generator;
use std::path::PathBuf;
use tauri::AppHandle;

#[tauri::command]
pub fn generate_script(app_handle: AppHandle, script_id: String) -> Result<String, String> {
    let spec = generator::find(&script_id).ok_or_else(|| format!("Unknown script: {script_id}"))?;
    let dest_dir = crate::commands::download::postwipe_downloads_dir(&app_handle)?;
    let dest_path = dest_dir.join(spec.filename);
    std::fs::write(&dest_path, spec.content).map_err(|e| e.to_string())?;
    Ok(dest_path.to_string_lossy().to_string())
}

/// Checks whether this script was already generated in a *previous* session and is still
/// sitting in Downloads. Without this, "Pin to Start" only ever unlocked after clicking
/// "Generate Script" again on every fresh app launch, even if the file was already there —
/// easy to mistake for the feature being broken.
#[tauri::command]
pub fn find_generated_script(app_handle: AppHandle, script_id: String) -> Result<Option<String>, String> {
    let spec = generator::find(&script_id).ok_or_else(|| format!("Unknown script: {script_id}"))?;
    let dest_dir = crate::commands::download::postwipe_downloads_dir(&app_handle)?;
    let dest_path = dest_dir.join(spec.filename);
    Ok(if dest_path.exists() {
        Some(dest_path.to_string_lossy().to_string())
    } else {
        None
    })
}

fn start_menu_programs_dir() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA")
        .map_err(|_| "Pin to Start is only supported on Windows.".to_string())?;
    Ok(PathBuf::from(appdata)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs"))
}

/// Windows-only: `...\Start Menu\Programs\PostWipe`. Entries here show up in the Start
/// menu's all-apps list and search, and run ONLY when the user clicks them. This is
/// deliberately NOT the sibling `Programs\Startup` folder, whose contents auto-run at
/// every login — the feature's first version pinned there by mistake, giving the user a
/// PowerShell/UAC prompt on every boot.
fn pin_dir() -> Result<PathBuf, String> {
    Ok(start_menu_programs_dir()?.join("PostWipe"))
}

fn pin_bat_path(script_id: &str) -> Result<PathBuf, String> {
    let spec = generator::find(script_id).ok_or_else(|| format!("Unknown script: {script_id}"))?;
    Ok(pin_dir()?.join(format!("{}.bat", spec.menu_label)))
}

/// Removes any `PostWipe-*.bat` the old, misconceived version of this feature left in the
/// auto-run Startup folder. Called once at app launch so affected machines heal themselves.
pub fn cleanup_legacy_startup_pins() {
    let Ok(programs) = start_menu_programs_dir() else { return };
    let Ok(entries) = std::fs::read_dir(programs.join("Startup")) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("PostWipe-") && name.ends_with(".bat") {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[tauri::command]
pub fn is_script_pinned(script_id: String) -> Result<bool, String> {
    Ok(pin_bat_path(&script_id)?.exists())
}

/// Writes a small `.bat` wrapper into the Start menu's PostWipe folder that invokes the
/// already-generated script via PowerShell when clicked. Re-checks the script still exists
/// on disk at pin time — if the user deleted it from Downloads after generating it, this
/// fails with a clear error instead of pinning a broken Start menu entry.
#[tauri::command]
pub fn pin_script_to_start_menu(script_id: String, script_path: String) -> Result<(), String> {
    if !std::path::Path::new(&script_path).exists() {
        return Err(format!(
            "{script_path} no longer exists — generate the script again before pinning it."
        ));
    }
    let bat_path = pin_bat_path(&script_id)?;
    if let Some(dir) = bat_path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let bat_content = format!("@echo off\r\npowershell -ExecutionPolicy Bypass -File \"{script_path}\"\r\n");
    std::fs::write(&bat_path, bat_content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn unpin_script_from_start_menu(script_id: String) -> Result<(), String> {
    let bat_path = pin_bat_path(&script_id)?;
    if bat_path.exists() {
        std::fs::remove_file(&bat_path).map_err(|e| e.to_string())?;
    }
    // Keep the Start menu tidy: drop the PostWipe folder once its last pin is gone.
    if let Ok(dir) = pin_dir() {
        if std::fs::read_dir(&dir).map(|mut d| d.next().is_none()).unwrap_or(false) {
            let _ = std::fs::remove_dir(&dir);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Exercises the real filesystem paths used by pin/unpin, on the real Start menu on
    /// this machine — not a temp dir — since the whole point is to prove the actual
    /// location the running app writes to is correct, writable, and NOT the auto-run
    /// Startup folder.
    #[test]
    fn pin_then_unpin_round_trips_in_the_start_menu_not_the_startup_folder() {
        // Uses a real script id because pin_bat_path derives the menu label from the spec.
        let script_id = "restart-audio-service";
        let script_path = std::env::temp_dir().join("postwipe-selftest-pin.ps1");
        std::fs::write(&script_path, "# test\n").unwrap();

        // If the user actually has this pinned, don't stomp it.
        if is_script_pinned(script_id.to_string()).unwrap() {
            std::fs::remove_file(&script_path).ok();
            return;
        }

        pin_script_to_start_menu(script_id.to_string(), script_path.to_string_lossy().to_string()).unwrap();
        assert!(is_script_pinned(script_id.to_string()).unwrap(), "should report pinned right after pinning");

        let bat_path = pin_bat_path(script_id).unwrap();
        assert!(bat_path.exists(), "bat should exist at {}", bat_path.display());
        assert!(
            !bat_path.to_string_lossy().contains("Startup"),
            "pin must NOT land in the auto-run Startup folder: {}",
            bat_path.display()
        );
        let content = std::fs::read_to_string(&bat_path).unwrap();
        assert!(content.contains("powershell"), "bat should invoke powershell: {content}");

        unpin_script_from_start_menu(script_id.to_string()).unwrap();
        assert!(!is_script_pinned(script_id.to_string()).unwrap(), "should report unpinned after unpinning");
        assert!(!bat_path.exists(), "bat should be gone after unpinning");

        std::fs::remove_file(&script_path).ok();
    }

    #[test]
    fn pin_fails_clearly_when_the_script_file_no_longer_exists() {
        let result = pin_script_to_start_menu(
            "restart-audio-service".to_string(),
            std::env::temp_dir()
                .join("postwipe-selftest-does-not-exist.ps1")
                .to_string_lossy()
                .to_string(),
        );
        assert!(result.is_err(), "pinning a nonexistent script should fail, not silently succeed");
    }

    #[test]
    fn legacy_startup_pins_are_cleaned_up() {
        let startup = start_menu_programs_dir().unwrap().join("Startup");
        let legacy = startup.join("PostWipe-selftest-legacy.bat");
        std::fs::write(&legacy, "@echo off\r\n").unwrap();

        cleanup_legacy_startup_pins();

        assert!(!legacy.exists(), "legacy Startup-folder pin should have been removed");
    }
}
