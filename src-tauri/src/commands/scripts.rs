use crate::scripts::generator;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn generate_script(app_handle: AppHandle, script_id: String) -> Result<String, String> {
    let spec = generator::find(&script_id).ok_or_else(|| format!("Unknown script: {script_id}"))?;
    let dest_dir = app_handle.path().download_dir().map_err(|e| e.to_string())?;
    let dest_path = dest_dir.join(spec.filename);
    std::fs::write(&dest_path, spec.content).map_err(|e| e.to_string())?;
    Ok(dest_path.to_string_lossy().to_string())
}
