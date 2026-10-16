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

/// What sits behind the Liquid Glass chrome: `"wallpaper"` (a themed gradient painted by the
/// app — the default, identical everywhere) or `"native"` (the OS blurs the real desktop —
/// Acrylic on Windows, vibrancy on macOS). Disk-backed for the same reason as the theme.
fn backdrop_file(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("backdrop"))
}

#[tauri::command]
pub fn get_backdrop(app_handle: AppHandle) -> Option<String> {
    let value = std::fs::read_to_string(backdrop_file(&app_handle).ok()?).ok()?;
    match value.trim() {
        v @ ("wallpaper" | "native") => Some(v.to_string()),
        _ => None,
    }
}

#[tauri::command]
pub fn set_backdrop(app_handle: AppHandle, backdrop: String) -> Result<(), String> {
    if backdrop != "wallpaper" && backdrop != "native" {
        return Err(format!("unknown backdrop '{backdrop}'"));
    }
    std::fs::write(backdrop_file(&app_handle)?, backdrop).map_err(|e| e.to_string())
}

/// One-time UI flags ("already shown X") that must survive restarts — the packaged WebView's
/// localStorage doesn't reliably, so a flag kept there would re-show its prompt every launch.
/// Whitelisted so the frontend can't write arbitrary files into the config dir.
const FLAGS: &[&str] = &["kickstart-offered"];

fn flag_file(app_handle: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !FLAGS.contains(&name) {
        return Err(format!("unknown flag '{name}'"));
    }
    let dir = app_handle.path().app_config_dir().map_err(|e| e.to_string())?.join("flags");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

#[tauri::command]
pub fn get_flag(app_handle: AppHandle, name: String) -> Result<bool, String> {
    Ok(flag_file(&app_handle, &name)?.exists())
}

#[tauri::command]
pub fn set_flag(app_handle: AppHandle, name: String) -> Result<(), String> {
    std::fs::write(flag_file(&app_handle, &name)?, "1").map_err(|e| e.to_string())
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

/// What this computer is, so the app can show the right apps without asking: the OS it's
/// running on and the CPU vendor. Read-only — nothing is stored or sent anywhere.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    /// "windows" or "macos" (anything else reports "windows", the catalog's default).
    os: &'static str,
    /// "intel", "amd", "apple", or "unknown".
    cpu_vendor: &'static str,
    /// The processor's marketing name, e.g. "AMD Ryzen 7 7800X3D 8-Core Processor".
    cpu_name: String,
}

#[tauri::command]
pub fn detect_system() -> SystemInfo {
    let os = if cfg!(target_os = "macos") { "macos" } else { "windows" };
    let (cpu_vendor, cpu_name) = detect_cpu();
    SystemInfo { os, cpu_vendor, cpu_name }
}

/// x86 processors identify themselves through the CPUID instruction: leaf 0 holds the vendor
/// string ("GenuineIntel" / "AuthenticAMD") and leaves 0x80000002-4 the brand name. No shell
/// command, registry read or extra crate needed.
#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
// `__cpuid` became a safe fn in newer toolchains; the unsafe blocks keep older ones building.
#[allow(unused_unsafe)]
fn detect_cpu() -> (&'static str, String) {
    #[cfg(target_arch = "x86")]
    use std::arch::x86::__cpuid;
    #[cfg(target_arch = "x86_64")]
    use std::arch::x86_64::__cpuid;

    // SAFETY: CPUID is available on every x86-64 CPU and every x86 CPU Windows/macOS run on.
    let leaf0 = unsafe { __cpuid(0) };
    let mut vendor = Vec::with_capacity(12);
    for reg in [leaf0.ebx, leaf0.edx, leaf0.ecx] {
        vendor.extend_from_slice(&reg.to_le_bytes());
    }
    let vendor_id = match vendor.as_slice() {
        b"GenuineIntel" => "intel",
        b"AuthenticAMD" => "amd",
        _ => "unknown",
    };

    let mut name = Vec::with_capacity(48);
    let max_ext = unsafe { __cpuid(0x8000_0000) }.eax;
    if max_ext >= 0x8000_0004 {
        for leaf in 0x8000_0002u32..=0x8000_0004 {
            let r = unsafe { __cpuid(leaf) };
            for reg in [r.eax, r.ebx, r.ecx, r.edx] {
                name.extend_from_slice(&reg.to_le_bytes());
            }
        }
    }
    let name = String::from_utf8_lossy(&name).trim_matches(char::from(0)).trim().to_string();
    (vendor_id, name)
}

/// Apple silicon Macs: there's no Intel/AMD question to answer.
#[cfg(not(any(target_arch = "x86", target_arch = "x86_64")))]
fn detect_cpu() -> (&'static str, String) {
    #[cfg(target_os = "macos")]
    {
        let name = std::process::Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();
        ("apple", name)
    }
    #[cfg(not(target_os = "macos"))]
    {
        ("unknown", String::new())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn detects_this_cpu() {
        let info = super::detect_system();
        println!("{} / {} / {}", info.os, info.cpu_vendor, info.cpu_name);
        assert_ne!(info.cpu_vendor, "unknown");
        assert!(!info.cpu_name.is_empty());
    }
}
