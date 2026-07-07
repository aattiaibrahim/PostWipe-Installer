mod catalog;
mod commands;
mod downloader;
mod resolver;
mod scripts;

use commands::catalog::list_categories;
use commands::download::{cancel_download, list_active_downloads, open_downloads_folder, start_download};
use commands::scripts::generate_script;
use downloader::DownloadManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(DownloadManager::new())
        .invoke_handler(tauri::generate_handler![
            list_categories,
            start_download,
            cancel_download,
            list_active_downloads,
            open_downloads_folder,
            generate_script
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
