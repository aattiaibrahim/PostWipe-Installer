use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// PowerShell single-quoted literal (quotes escaped by doubling).
fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

#[cfg(windows)]
fn no_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
}
#[cfg(not(windows))]
fn no_window(_cmd: &mut Command) {}

fn run(program: &str, args: &[&str]) -> Result<(), String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    no_window(&mut cmd);
    let out = cmd.output().map_err(|e| format!("failed to run {program}: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Extracts a `.zip` to a sibling folder named after the archive; returns that folder.
fn expand_zip(zip: &Path) -> Result<PathBuf, String> {
    let stem = zip.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "specials-item".into());
    let dest = zip.parent().unwrap_or(Path::new(".")).join(&stem);
    run(
        "powershell",
        &[
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &format!(
                "Expand-Archive -LiteralPath {} -DestinationPath {} -Force",
                ps_quote(&zip.to_string_lossy()),
                ps_quote(&dest.to_string_lossy())
            ),
        ],
    )?;
    Ok(dest)
}

/// Recursively collect files with any of the given extensions under `dir`.
fn find_by_ext(dir: &Path, exts: &[&str]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&d) else { continue };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if p
                .extension()
                .map(|e| exts.iter().any(|x| e.eq_ignore_ascii_case(x)))
                .unwrap_or(false)
            {
                out.push(p);
            }
        }
    }
    out
}

/// Installs a downloaded Specials item by type:
/// - `cursor`: unzip, then apply install.inf via InstallHinfSection (right-click → Install).
///   Cursor schemes write to HKCU and normally don't need admin; if one does, that's surfaced
///   rather than forced. Multiple `.inf` variants (e.g. color sets) → open the folder to choose.
/// - `font` / `sound`: unzip and open the folder so the user runs the per-file Install/apply.
/// Async wrapper: the body shells out to an elevated PowerShell install that BLOCKS until the
/// UAC install finishes. Running that on the command thread froze the whole UI, so it's offloaded
/// to a blocking task and awaited instead.
#[tauri::command]
pub async fn install_specials_item(app_handle: AppHandle, archive_path: String, install_type: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || install_specials_item_impl(app_handle, archive_path, install_type))
        .await
        .map_err(|e| format!("install task failed: {e}"))?
}

fn install_specials_item_impl(app_handle: AppHandle, archive_path: String, install_type: String) -> Result<String, String> {
    let archive = PathBuf::from(&archive_path);
    if !archive.exists() {
        return Err(format!("{archive_path} not found — download it again."));
    }

    let is_zip = archive.extension().map(|e| e.eq_ignore_ascii_case("zip")).unwrap_or(false);
    // Non-zip archives (e.g. .rar) can't be expanded without extra tooling — just reveal it.
    if !is_zip {
        reveal(&app_handle, &archive);
        return Ok("Opened the download folder — extract and apply it manually.".into());
    }

    let folder = expand_zip(&archive)?;

    match install_type.as_str() {
        "cursor" => {
            let infs = find_by_ext(&folder, &["inf"]);
            match infs.len() {
                0 => {
                    open_folder(&app_handle, &folder);
                    let has_windows_cursors = !find_by_ext(&folder, &["cur", "ani"]).is_empty();
                    if has_windows_cursors {
                        Ok("This pack has no install.inf — opened the folder. Apply it via Mouse settings ▸ Pointers ▸ Browse to these .cur/.ani files.".into())
                    } else {
                        Ok("This pack has no Windows installer (it looks like a Linux/macOS cursor set) — opened the folder so you can see what's inside.".into())
                    }
                }
                // One or many variants: the frontend uses list_cursor_variants + a picker for
                // the multi-inf case; landing here means a single scheme — apply it directly.
                _ => match apply_inf_and_equip(&infs[0]) {
                    Ok(msg) => Ok(msg),
                    Err(e) => {
                        open_folder(&app_handle, &folder);
                        Err(format!("Couldn't install ({e}). Opened the folder — right-click install.inf ▸ Install."))
                    }
                },
            }
        }
        // font / sound / anything else: extract and let the user apply from the folder.
        _ => {
            open_folder(&app_handle, &folder);
            Ok("Extracted — opened the folder. Right-click the files ▸ Install (fonts) or apply the sound set.".into())
        }
    }
}

#[derive(serde::Serialize)]
pub struct CursorVariant {
    pub label: String,
    pub inf_path: String,
}

/// Reads the cursor scheme's display name out of an install.inf ([Strings] SCHEME_NAME).
fn inf_scheme_name(inf: &Path) -> Option<String> {
    let raw = std::fs::read(inf).ok()?;
    // .inf files are frequently UTF-16LE; fall back to lossy UTF-8 otherwise.
    let text = if raw.len() >= 2 && raw[0] == 0xFF && raw[1] == 0xFE {
        String::from_utf16_lossy(
            &raw[2..raw.len() - raw.len() % 2]
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect::<Vec<_>>(),
        )
    } else {
        String::from_utf8_lossy(&raw).to_string()
    };
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("SCHEME_NAME") {
            let value = rest.trim_start().strip_prefix('=')?.trim();
            let value = value.trim_matches('"').trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

/// Extracts the pack (if needed) and lists every install.inf variant inside it, labeled by
/// the scheme name from the inf itself (falling back to its folder name). The UI shows these
/// as a "which one do you want?" picker before applying.
#[tauri::command]
pub async fn list_cursor_variants(archive_path: String) -> Result<Vec<CursorVariant>, String> {
    tauri::async_runtime::spawn_blocking(move || list_cursor_variants_impl(archive_path))
        .await
        .map_err(|e| format!("variant scan failed: {e}"))?
}

fn list_cursor_variants_impl(archive_path: String) -> Result<Vec<CursorVariant>, String> {
    let archive = PathBuf::from(&archive_path);
    if !archive.exists() {
        return Err(format!("{archive_path} not found — download it again."));
    }
    let is_zip = archive.extension().map(|e| e.eq_ignore_ascii_case("zip")).unwrap_or(false);
    if !is_zip {
        return Ok(Vec::new());
    }
    let folder = expand_zip(&archive)?;
    let mut infs = find_by_ext(&folder, &["inf"]);
    infs.sort();

    let variants: Vec<CursorVariant> = infs
        .into_iter()
        .map(|inf| {
            let label = inf_scheme_name(&inf)
                .or_else(|| {
                    inf.parent()
                        .filter(|p| *p != folder)
                        .and_then(|p| p.file_name())
                        .map(|n| n.to_string_lossy().to_string())
                })
                .unwrap_or_else(|| {
                    inf.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "Cursor scheme".into())
                });
            CursorVariant { label, inf_path: inf.to_string_lossy().to_string() }
        })
        .collect();
    Ok(variants)
}

/// Applies one specific install.inf chosen in the variant picker. Async for the same reason as
/// install_specials_item — the elevated install blocks until UAC completes.
#[tauri::command]
pub async fn apply_cursor_variant(app_handle: AppHandle, inf_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || apply_cursor_variant_impl(app_handle, inf_path))
        .await
        .map_err(|e| format!("install task failed: {e}"))?
}

fn apply_cursor_variant_impl(app_handle: AppHandle, inf_path: String) -> Result<String, String> {
    let inf = PathBuf::from(&inf_path);
    if !inf.exists() {
        return Err(format!("{inf_path} not found — reinstall the pack."));
    }
    match apply_inf_and_equip(&inf) {
        Ok(msg) => Ok(msg),
        Err(e) => {
            reveal(&app_handle, &inf);
            Err(format!("Couldn't install ({e}). Opened the folder — right-click the .inf ▸ Install."))
        }
    }
}

/// Right-click "Install" for an .inf is `InstallHinfSection DefaultInstall`. 132 = quiet, no reboot.
///
/// Cursor-pack .inf files copy their files into `%WINDIR%\Cursors` (`DestinationDirs = 10`),
/// which needs administrator rights — Explorer's right-click ▸ Install elevates via UAC.
/// Running rundll32 UNelevated is why every install reported "failed" (GitHub issue #1):
/// SetupAPI couldn't write the destination. So: elevate exactly like Explorer does (the user
/// sees the standard UAC prompt), then confirm the scheme actually landed in the registry.
fn apply_inf(inf: &Path) -> Result<(), String> {
    // The inf path is passed UNQUOTED after the mode flag — InstallHinfSection treats the
    // rest of the line as the path (same as the shell's own `%1` install verb), and it does
    // not understand quotes around paths with spaces.
    let ps = format!(
        "$p = Start-Process rundll32.exe -ArgumentList {} -Verb RunAs -PassThru -Wait; exit $p.ExitCode",
        ps_quote(&format!(
            "setupapi.dll,InstallHinfSection DefaultInstall 132 {}",
            inf.to_string_lossy()
        )),
    );
    run("powershell", &["-NoProfile", "-NonInteractive", "-Command", &ps]).map_err(|e| {
        if e.to_lowercase().contains("cancel") {
            "the Windows admin prompt was declined — cursor schemes install into Windows\\Cursors, which needs it".to_string()
        } else {
            e
        }
    })?;

    // rundll32's exit code is not trustworthy — verify the scheme is really registered.
    if let Some(name) = inf_scheme_name(inf) {
        run(
            "reg",
            &["query", r"HKCU\Control Panel\Cursors\Schemes", "/v", &name],
        )
        .map_err(|_| format!("Windows finished but the \"{name}\" scheme didn't register — try right-clicking the .inf ▸ Install"))?;
    }
    Ok(())
}

/// Installs the .inf, then equips the scheme it registered. Equipping is best-effort: the
/// .inf install alone already matches the old behavior (scheme available, user selects it
/// by hand), so an equip failure downgrades the success message instead of failing.
fn apply_inf_and_equip(inf: &Path) -> Result<String, String> {
    apply_inf(inf)?;
    let equipped = inf_scheme_name(inf).map(|n| equip_scheme(&n).is_ok()).unwrap_or(false);
    Ok(if equipped {
        "Cursor scheme installed and equipped — your pointer has changed.".into()
    } else {
        "Cursor scheme installed. Select it under Mouse settings ▸ Pointers ▸ Scheme.".into()
    })
}

/// Makes a registered scheme the ACTIVE pointer set — what the Mouse control panel does on
/// Apply: copy the scheme's cursor paths into the live `HKCU\Control Panel\Cursors` values,
/// then broadcast SPI_SETCURSORS so everything picks the change up immediately (no logoff).
/// Runs as the user (HKCU only) — no elevation needed.
fn equip_scheme(name: &str) -> Result<(), String> {
    // A scheme value is one comma-separated string; slot order is fixed (it's the order
    // main.cpl reads and writes). Older packs stop at Hand — Pin/Person slots then reset
    // to empty, which Windows renders as the default pointer for those two.
    let ps = format!(
        r#"$n = {name}
$s = (Get-ItemProperty 'HKCU:\Control Panel\Cursors\Schemes' -ErrorAction Stop).$n
if (-not $s) {{ throw "scheme '$n' is not registered" }}
$parts = $s -split ','
$slots = 'Arrow','Help','AppStarting','Wait','Crosshair','IBeam','NWPen','No','SizeNS','SizeWE','SizeNWSE','SizeNESW','SizeAll','UpArrow','Hand','Pin','Person'
$k = 'HKCU:\Control Panel\Cursors'
Set-ItemProperty -Path $k -Name '(default)' -Value $n
New-ItemProperty -Path $k -Name 'Scheme Source' -Value 1 -PropertyType DWord -Force | Out-Null
for ($i = 0; $i -lt $slots.Count; $i++) {{
    $v = if ($i -lt $parts.Count) {{ $parts[$i].Trim() }} else {{ '' }}
    New-ItemProperty -Path $k -Name $slots[$i] -Value $v -PropertyType ExpandString -Force | Out-Null
}}
Add-Type -Namespace Win32 -Name Spi -MemberDefinition '[DllImport("user32.dll", SetLastError = true)] public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, string pvParam, uint fWinIni);'
if (-not [Win32.Spi]::SystemParametersInfo(0x0057, 0, $null, 3)) {{ throw "SystemParametersInfo failed" }}"#,
        name = ps_quote(name)
    );
    run("powershell", &["-NoProfile", "-NonInteractive", "-Command", &ps])
}

fn open_folder(app_handle: &AppHandle, dir: &Path) {
    let _ = app_handle.opener().open_path(dir.to_string_lossy().to_string(), None::<&str>);
}

fn reveal(app_handle: &AppHandle, file: &Path) {
    if let Some(parent) = file.parent() {
        open_folder(app_handle, parent);
    }
}

/// Whether the extracted install folder for an already-downloaded archive exists — lets the
/// UI show "Installed"/"Extracted" state across restarts. (Best-effort: presence of the folder.)
#[tauri::command]
pub fn specials_item_installed(app_handle: AppHandle, filename: String) -> Result<bool, String> {
    let stem = Path::new(&filename).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    if stem.is_empty() {
        return Ok(false);
    }
    let dir = crate::commands::download::specials_downloads_dir(&app_handle)?.join(stem);
    Ok(dir.is_dir())
}
