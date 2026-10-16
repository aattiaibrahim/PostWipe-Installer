use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusPayload {
    pub job_id: String,
    pub app_id: String,
    pub app_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dest_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// What verify.rs confirmed about a finished file ("Verified: signed by Valve Corp.").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub job_id: String,
    pub app_id: String,
    pub bytes_downloaded: u64,
    pub total_bytes: Option<u64>,
}

fn emit(app_handle: &AppHandle, event: &str, payload: impl Serialize + Clone) {
    let _ = app_handle.emit(event, payload);
}

pub fn queued(app_handle: &AppHandle, job_id: &str, app_id: &str, app_name: &str) {
    emit(
        app_handle,
        "download://queued",
        StatusPayload {
            job_id: job_id.to_string(),
            app_id: app_id.to_string(),
            app_name: app_name.to_string(),
            dest_path: None,
            error: None,
            verification: None,
        },
    );
}

pub fn resolving(app_handle: &AppHandle, job_id: &str, app_id: &str, app_name: &str) {
    emit(
        app_handle,
        "download://resolving",
        StatusPayload {
            job_id: job_id.to_string(),
            app_id: app_id.to_string(),
            app_name: app_name.to_string(),
            dest_path: None,
            error: None,
            verification: None,
        },
    );
}

pub fn started(app_handle: &AppHandle, job_id: &str, app_id: &str, app_name: &str) {
    emit(
        app_handle,
        "download://started",
        StatusPayload {
            job_id: job_id.to_string(),
            app_id: app_id.to_string(),
            app_name: app_name.to_string(),
            dest_path: None,
            error: None,
            verification: None,
        },
    );
}

pub fn progress(app_handle: &AppHandle, job_id: &str, app_id: &str, bytes_downloaded: u64, total_bytes: Option<u64>) {
    emit(
        app_handle,
        "download://progress",
        ProgressPayload {
            job_id: job_id.to_string(),
            app_id: app_id.to_string(),
            bytes_downloaded,
            total_bytes,
        },
    );
}

pub fn completed(app_handle: &AppHandle, job_id: &str, app_id: &str, app_name: &str, dest_path: &str, verification: String) {
    emit(
        app_handle,
        "download://completed",
        StatusPayload {
            job_id: job_id.to_string(),
            app_id: app_id.to_string(),
            app_name: app_name.to_string(),
            dest_path: Some(dest_path.to_string()),
            error: None,
            verification: Some(verification),
        },
    );
}

pub fn cancelled(app_handle: &AppHandle, job_id: &str, app_id: &str, app_name: &str) {
    emit(
        app_handle,
        "download://cancelled",
        StatusPayload {
            job_id: job_id.to_string(),
            app_id: app_id.to_string(),
            app_name: app_name.to_string(),
            dest_path: None,
            error: None,
            verification: None,
        },
    );
}

pub fn failed(app_handle: &AppHandle, job_id: &str, app_id: &str, app_name: &str, error: String) {
    emit(
        app_handle,
        "download://failed",
        StatusPayload {
            job_id: job_id.to_string(),
            app_id: app_id.to_string(),
            app_name: app_name.to_string(),
            dest_path: None,
            error: Some(error),
            verification: None,
        },
    );
}
