mod catalog;
mod commands;
mod downloader;
mod resolver;
mod scripts;

use commands::catalog::list_categories;
use commands::download::{
    cancel_download, list_active_downloads, open_downloads_folder, paths_exist, start_download, start_specials_download,
};
use commands::scripts::{
    cleanup_legacy_startup_pins, find_generated_script, generate_script, is_script_pinned, pin_script_to_start_menu,
    unpin_script_from_start_menu,
};
use commands::specials::{apply_cursor_variant, install_specials_item, list_cursor_variants, specials_item_installed};
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
    // Heals machines the feature's first version affected: it wrote pins into the
    // auto-run Startup folder instead of the Start menu, prompting at every boot.
    cleanup_legacy_startup_pins();

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
            paths_exist,
            generate_script,
            find_generated_script,
            is_script_pinned,
            pin_script_to_start_menu,
            unpin_script_from_start_menu,
            start_specials_download,
            install_specials_item,
            specials_item_installed,
            list_cursor_variants,
            apply_cursor_variant
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
