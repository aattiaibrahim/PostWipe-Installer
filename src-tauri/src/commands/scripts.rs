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

/// Pins are `.lnk` shortcuts written to the Programs ROOT (not a subfolder, not the
/// auto-run `Startup` sibling): Windows 11's All-apps list shows subfolders as collapsed
/// folder entries that are easy to miss and slow to index, while root-level `.lnk`s appear
/// as plain top-level apps and show up in Start search reliably. The path comes from the
/// `APPDATA` env var, so it resolves to whichever user is running the app — no hardcoding.
fn pin_lnk_path(script_id: &str) -> Result<PathBuf, String> {
    let spec = generator::find(script_id).ok_or_else(|| format!("Unknown script: {script_id}"))?;
    Ok(start_menu_programs_dir()?.join(format!("{}.lnk", spec.menu_label)))
}

/// Removes leftovers from the feature's earlier versions: `PostWipe-*.bat` in the auto-run
/// Startup folder (v1 pinned there by mistake), and the `Programs\PostWipe\` subfolder
/// (v2/v3, whose contents Windows 11 buried in a collapsed All-apps folder). v3 `.lnk`s in
/// the old subfolder are migrated to the Programs root rather than dropped.
pub fn cleanup_legacy_startup_pins() {
    let Ok(programs) = start_menu_programs_dir() else { return };
    if let Ok(entries) = std::fs::read_dir(programs.join("Startup")) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("PostWipe-") && name.ends_with(".bat") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    let old_dir = programs.join("PostWipe");
    if let Ok(entries) = std::fs::read_dir(&old_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            if name.to_string_lossy().ends_with(".lnk") {
                let _ = std::fs::rename(entry.path(), programs.join(&name));
            } else {
                let _ = std::fs::remove_file(entry.path());
            }
        }
        let _ = std::fs::remove_dir(&old_dir);
    }
}

#[tauri::command]
pub fn is_script_pinned(script_id: String) -> Result<bool, String> {
    Ok(pin_lnk_path(&script_id)?.exists())
}

/// PowerShell single-quoted string literal: quotes are escaped by doubling them.
fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Appends one line to %TEMP%\postwipe-pin.log. Pinning has been reported broken several
/// times with no artifacts to inspect afterwards — this log is the evidence trail for the
/// next report (what was pinned, where, and what PowerShell said).
fn pin_log(msg: &str) {
    let path = std::env::temp_dir().join("postwipe-pin.log");
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = writeln!(f, "[{ts}] {msg}");
    }
}

/// Creates a Start menu shortcut (`.lnk`) pointing at the already-generated script and
/// returns the shortcut's full path (shown in the UI so "where did it go" is never a
/// mystery). Re-checks the script still exists on disk at pin time — if the user deleted
/// it after generating it, this fails with a clear error instead of pinning a dead shortcut.
#[tauri::command]
pub fn pin_script_to_start_menu(script_id: String, script_path: String) -> Result<String, String> {
    if !std::path::Path::new(&script_path).exists() {
        pin_log(&format!("PIN {script_id}: script missing at {script_path}"));
        return Err(format!(
            "{script_path} no longer exists — generate the script again before pinning it."
        ));
    }
    let lnk_path = pin_lnk_path(&script_id)?;
    if let Some(dir) = lnk_path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }

    // .lnk creation needs COM (WScript.Shell); PowerShell is the lightest way to reach it.
    let ps_script = format!(
        "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut({lnk}); $s.TargetPath = {target}; $s.WorkingDirectory = {workdir}; $s.Save()",
        lnk = ps_quote(&lnk_path.to_string_lossy()),
        target = ps_quote(&script_path),
        workdir = ps_quote(
            &std::path::Path::new(&script_path)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default()
        ),
    );

    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &ps_script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — don't flash a console
    }
    let output = cmd.output().map_err(|e| {
        pin_log(&format!("PIN {script_id}: PowerShell didn't start: {e}"));
        format!("failed to run PowerShell: {e}")
    })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        pin_log(&format!("PIN {script_id}: PowerShell exit {:?}: {stderr}", output.status.code()));
        return Err(format!("shortcut creation failed: {stderr}"));
    }
    if !lnk_path.exists() {
        pin_log(&format!("PIN {script_id}: PowerShell succeeded but {} missing", lnk_path.display()));
        return Err("shortcut creation reported success but no .lnk was written".to_string());
    }
    pin_log(&format!("PIN {script_id}: OK -> {}", lnk_path.display()));
    Ok(lnk_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn unpin_script_from_start_menu(script_id: String) -> Result<(), String> {
    let lnk_path = pin_lnk_path(&script_id)?;
    if lnk_path.exists() {
        std::fs::remove_file(&lnk_path).map_err(|e| e.to_string())?;
        pin_log(&format!("UNPIN {script_id}: removed {}", lnk_path.display()));
    } else {
        pin_log(&format!("UNPIN {script_id}: nothing at {}", lnk_path.display()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// These tests mutate the REAL Start menu, and cargo runs tests on parallel threads —
    /// unserialized, the migration test once moved the user's actual pin into the path of
    /// the round-trip test's unpin step, which deleted it. Every test touching the Start
    /// menu must hold this lock.
    static START_MENU_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// Exercises the real filesystem paths used by pin/unpin, on the real Start menu on
    /// this machine — not a temp dir — since the whole point is to prove the actual
    /// location the running app writes to is correct, writable, and NOT the auto-run
    /// Startup folder.
    #[test]
    fn pin_then_unpin_round_trips_a_real_lnk_in_the_start_menu() {
        let _guard = START_MENU_LOCK.lock().unwrap();
        // Uses a real script id because pin_lnk_path derives the menu label from the spec.
        let script_id = "restart-audio-service";
        let script_path = std::env::temp_dir().join("postwipe-selftest-pin.bat");
        std::fs::write(&script_path, "@echo off\r\n").unwrap();

        // If the user actually has this pinned, don't stomp it.
        if is_script_pinned(script_id.to_string()).unwrap() {
            std::fs::remove_file(&script_path).ok();
            return;
        }

        pin_script_to_start_menu(script_id.to_string(), script_path.to_string_lossy().to_string()).unwrap();
        assert!(is_script_pinned(script_id.to_string()).unwrap(), "should report pinned right after pinning");

        let lnk_path = pin_lnk_path(script_id).unwrap();
        assert!(lnk_path.exists(), "lnk should exist at {}", lnk_path.display());
        assert!(
            !lnk_path.to_string_lossy().contains("Startup"),
            "pin must NOT land in the auto-run Startup folder: {}",
            lnk_path.display()
        );
        // Shell Link binary format starts with header size 0x4C — proves a real .lnk was
        // written by COM, not a text file with a .lnk name.
        let bytes = std::fs::read(&lnk_path).unwrap();
        assert!(bytes.len() > 76, "lnk suspiciously small: {} bytes", bytes.len());
        assert_eq!(bytes[0], 0x4C, "not a Shell Link header: first byte {:#x}", bytes[0]);

        unpin_script_from_start_menu(script_id.to_string()).unwrap();
        assert!(!is_script_pinned(script_id.to_string()).unwrap(), "should report unpinned after unpinning");
        assert!(!lnk_path.exists(), "lnk should be gone after unpinning");

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
        let _guard = START_MENU_LOCK.lock().unwrap();
        let startup = start_menu_programs_dir().unwrap().join("Startup");
        let legacy = startup.join("PostWipe-selftest-legacy.bat");
        std::fs::write(&legacy, "@echo off\r\n").unwrap();

        cleanup_legacy_startup_pins();

        assert!(!legacy.exists(), "legacy Startup-folder pin should have been removed");
    }

    /// Pins from the previous version lived in `Programs\PostWipe\` — Windows 11 buries
    /// subfolder items in a collapsed All-apps folder, so cleanup must MOVE them to the
    /// Programs root (where the user can actually find them), not delete them.
    #[test]
    fn old_subfolder_lnk_pins_migrate_to_programs_root() {
        let _guard = START_MENU_LOCK.lock().unwrap();
        let programs = start_menu_programs_dir().unwrap();
        let old_dir = programs.join("PostWipe");
        std::fs::create_dir_all(&old_dir).unwrap();
        let old_lnk = old_dir.join("PostWipe Selftest Migrate.lnk");
        std::fs::write(&old_lnk, b"L").unwrap();

        cleanup_legacy_startup_pins();

        let migrated = programs.join("PostWipe Selftest Migrate.lnk");
        assert!(!old_lnk.exists(), "old subfolder lnk should be gone");
        assert!(migrated.exists(), "lnk should have moved to the Programs root");
        std::fs::remove_file(&migrated).ok();
    }
}
