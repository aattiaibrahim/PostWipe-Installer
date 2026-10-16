use crate::catalog::{
    loader,
    model::{Os, ResolverSpec},
};
use crate::downloader::manager::{ActiveDownload, Expectation};
use crate::downloader::DownloadManager;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

/// Specials files land in their own subfolder so they don't mix with app installers.
/// Every Specials file is served from here; mirrors SPECIALS_WORKER_URL in src/lib/specialsConfig.ts.
const SPECIALS_GATE_FILE_URL: &str = "https://postwipe-specials-gate.andrewattiaibrahim.workers.dev/file/";

pub fn specials_downloads_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let dir = postwipe_downloads_dir(app_handle)?.join("Specials");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Everything the app writes (downloads and generated scripts) lands in its own
/// `Downloads\PostWipeDownloads` subfolder instead of littering Downloads itself.
pub fn postwipe_downloads_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .download_dir()
        .map_err(|e| e.to_string())?
        .join("PostWipeDownloads");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn start_download(app_handle: AppHandle, manager: State<'_, DownloadManager>, app_id: String, os: Os) -> Result<String, String> {
    let catalog = loader::load_catalog();
    let app_entry = catalog
        .categories
        .iter()
        .flat_map(|c| &c.apps)
        .find(|a| a.id == app_id)
        .ok_or_else(|| format!("Unknown app: {app_id}"))?;

    let platform = app_entry
        .platforms
        .get(&os)
        .ok_or_else(|| format!("{} has no entry for this platform", app_entry.name))?;

    let resolver_spec = platform
        .resolver
        .clone()
        .ok_or_else(|| format!("{} has no resolver configured", app_entry.name))?;

    let filename = platform.filename.clone().unwrap_or_else(|| app_entry.id.clone());
    let dest_path = postwipe_downloads_dir(&app_handle)?.join(filename);

    let expect = Expectation { sha256: None, signer: platform.signer.clone(), hash_source: "the publisher" };
    let job_id = manager.start_download(app_handle.clone(), app_entry.id.clone(), app_entry.name.clone(), resolver_spec, dest_path, expect);
    // Counted when a download STARTS: whether it then finishes depends on the user's network,
    // which says nothing about how popular the app is.
    crate::commands::stats::record_download(&app_handle, &app_entry.id, os);
    Ok(job_id)
}

#[tauri::command]
pub fn cancel_download(manager: State<'_, DownloadManager>, job_id: String) -> bool {
    manager.cancel(&job_id)
}

#[tauri::command]
pub fn list_active_downloads(manager: State<'_, DownloadManager>) -> Vec<ActiveDownload> {
    manager.list_active()
}

#[tauri::command]
pub fn open_downloads_folder(app_handle: AppHandle) -> Result<(), String> {
    let dest_dir = postwipe_downloads_dir(&app_handle)?;
    app_handle
        .opener()
        .open_path(dest_dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Existence check for the Downloaded panel: history entries whose file was deleted from
/// disk shouldn't be shown as downloaded. Returns one bool per input path, same order.
#[tauri::command]
pub fn paths_exist(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| std::path::Path::new(p).exists()).collect()
}

/// Deletes one downloaded file (the ✕ in the Downloaded panel). Canonicalizes and refuses
/// anything outside `PostWipeDownloads`, so a stale or tampered history entry can never
/// reach into the rest of the filesystem.
#[tauri::command]
pub fn delete_download(app_handle: AppHandle, path: String) -> Result<(), String> {
    let file = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| format!("{path}: {e}"))?;
    let root = postwipe_downloads_dir(&app_handle)?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !file.starts_with(&root) {
        return Err("refusing to delete a file outside PostWipeDownloads".into());
    }
    if !file.is_file() {
        return Err(format!("{path} is not a file"));
    }
    std::fs::remove_file(&file).map_err(|e| e.to_string())
}

/// Downloads a Specials item through the Worker (the frontend builds `url` with the
/// session key already in it) into `PostWipeDownloads/Specials`. Returns the job id and
/// the destination path so the caller can offer Install once it completes.
#[tauri::command]
pub fn start_specials_download(
    app_handle: AppHandle,
    manager: State<'_, DownloadManager>,
    item_id: String,
    name: String,
    url: String,
    filename: String,
    sha256: Option<String>,
) -> Result<SpecialsDownloadHandle, String> {
    // Both come from the webview (built from the vault listing). The URL may only point at the
    // Specials gate, and the file name may only be a plain name: a listing entry like
    // `../../AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/x.exe` must not be
    // able to plant a file outside the Specials folder.
    if !url.starts_with(SPECIALS_GATE_FILE_URL) {
        return Err("Specials downloads must come from the Specials vault.".into());
    }
    let filename = crate::shell::safe_file_name(&filename)?;
    let dest = specials_downloads_dir(&app_handle)?.join(&filename);
    let spec = ResolverSpec::Static { url };
    // The vault manifest's digest for this file, when it has one: 64 hex characters or nothing.
    let sha256 = sha256.map(|h| h.to_lowercase()).filter(|h| h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit()));
    let expect = Expectation { sha256, signer: None, hash_source: "the Specials vault" };
    let job_id = manager.start_download(app_handle.clone(), item_id, name, spec, dest.clone(), expect);
    Ok(SpecialsDownloadHandle {
        job_id,
        dest_path: dest.to_string_lossy().to_string(),
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecialsDownloadHandle {
    pub job_id: String,
    pub dest_path: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadFileInfo {
    pub size: u64,
    /// Unix milliseconds of the last write (when the download finished).
    pub modified: u64,
}

/// Size and date for each Downloads-page entry, or null when the file is gone. Only answers for
/// files inside PostWipeDownloads, so the page can't be used to probe the rest of the disk.
#[tauri::command]
pub fn download_file_info(app_handle: AppHandle, paths: Vec<String>) -> Vec<Option<DownloadFileInfo>> {
    let Ok(root) = postwipe_downloads_dir(&app_handle) else {
        return paths.iter().map(|_| None).collect();
    };
    paths
        .iter()
        .map(|p| {
            let file = crate::shell::contained_in(&root, p).ok()?;
            let meta = std::fs::metadata(file).ok()?;
            if !meta.is_file() {
                return None;
            }
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            Some(DownloadFileInfo { size: meta.len(), modified })
        })
        .collect()
}

/// "Open" on the Downloads page: launches a downloaded installer/archive with its default
/// handler. Refuses anything outside PostWipeDownloads — the page names the path, so it must
/// not become a way to run arbitrary programs.
#[tauri::command]
pub fn open_download(app_handle: AppHandle, path: String) -> Result<(), String> {
    let root = postwipe_downloads_dir(&app_handle)?;
    let file = crate::shell::contained_in(&root, &path)?;
    app_handle
        .opener()
        .open_path(file.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}
