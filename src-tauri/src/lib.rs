mod catalog;
mod commands;
mod downloader;
mod resolver;
mod scripts;

use commands::catalog::list_categories;
use commands::download::{cancel_download, list_active_downloads, open_downloads_folder, start_download};
use commands::scripts::generate_script;
use downloader::DownloadManager;

/// Writes any Rust panic (message + backtrace) to a fixed log file so a crash
/// report actually exists to inspect afterward, instead of just vanishing
/// when the window closes.
fn install_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
        let log_path = std::env::temp_dir().join("postwipe-installer-crash.log");
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let backtrace = std::backtrace::Backtrace::force_capture();
        let entry = format!("\n=== panic at unix time {timestamp} ===\n{panic_info}\nbacktrace:\n{backtrace}\n");
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
            use std::io::Write;
            let _ = file.write_all(entry.as_bytes());
        }
        eprintln!("{entry}");
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();

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
