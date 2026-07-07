use crate::catalog::{loader, model::Os};
use crate::downloader::manager::ActiveDownload;
use crate::downloader::DownloadManager;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

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
    let dest_dir = app_handle.path().download_dir().map_err(|e| e.to_string())?;
    let dest_path = dest_dir.join(filename);

    Ok(manager.start_download(app_handle.clone(), app_entry.id.clone(), app_entry.name.clone(), resolver_spec, dest_path))
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
    let dest_dir = app_handle.path().download_dir().map_err(|e| e.to_string())?;
    app_handle
        .opener()
        .open_path(dest_dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}
