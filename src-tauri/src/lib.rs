mod catalog;
mod commands;
mod downloader;
mod resolver;
mod scripts;

use commands::catalog::list_categories;
use commands::download::{
    cancel_download, delete_download, list_active_downloads, open_downloads_folder, paths_exist, start_download,
    start_specials_download,
};
use commands::scripts::{
    cleanup_legacy_startup_pins, find_generated_script, generate_script, is_script_pinned, pin_script_to_start_menu,
    unpin_script_from_start_menu,
};
use commands::settings::{get_theme, set_theme};
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

/// Windows 11 native rounded corners for the frameless window. The old approach — a CSS
/// `clip-path` rounding the page — only *drew* rounded content while the window itself
/// stayed an opaque rectangle, so the corners showed as square wedges. Asking DWM for
/// `DWMWCP_ROUND` clips the real window (content, shadows, maximize squaring all handled
/// by the OS). On Windows 10 the call fails harmlessly and corners stay square, which is
/// what every Win10 app looks like anyway.
#[cfg(windows)]
fn apply_native_rounded_corners(app: &tauri::App) {
    use tauri::Manager;
    use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND};
    for (_label, window) in app.webview_windows() {
        if let Ok(hwnd) = window.hwnd() {
            let preference: i32 = DWMWCP_ROUND;
            unsafe {
                let _ = DwmSetWindowAttribute(
                    hwnd.0 as _,
                    DWMWA_WINDOW_CORNER_PREFERENCE as u32,
                    &preference as *const i32 as *const core::ffi::c_void,
                    std::mem::size_of::<i32>() as u32,
                );
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();
    // Heals machines the feature's first version affected: it wrote pins into the
    // auto-run Startup folder instead of the Start menu, prompting at every boot.
    cleanup_legacy_startup_pins();

    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(windows)]
            apply_native_rounded_corners(_app);
            Ok(())
        })
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
            delete_download,
            generate_script,
            find_generated_script,
            is_script_pinned,
            pin_script_to_start_menu,
            unpin_script_from_start_menu,
            start_specials_download,
            install_specials_item,
            specials_item_installed,
            list_cursor_variants,
            apply_cursor_variant,
            get_theme,
            set_theme
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
