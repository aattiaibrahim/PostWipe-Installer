use super::events;
use super::job::{self, DownloadError};
use crate::catalog::model::ResolverSpec;
use crate::resolver;
use dashmap::DashMap;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

// High enough that "Download All" feels genuinely parallel, low enough not to open
// dozens of sockets at once — the rest of the queue starts as slots free up.
const MAX_CONCURRENT_DOWNLOADS: usize = 6;
/// Last-resort safety net for the whole resolve+download job. job::run already
/// has its own connect/stall timeouts, so this only guards against something
/// unforeseen holding a semaphore permit forever (e.g. a pathologically slow
/// multi-GB transfer or a bug we haven't anticipated).
const JOB_SAFETY_TIMEOUT: Duration = Duration::from_secs(30 * 60);

struct JobHandle {
    app_id: String,
    app_name: String,
    cancel_token: CancellationToken,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveDownload {
    pub job_id: String,
    pub app_id: String,
    pub app_name: String,
}

pub struct DownloadManager {
    semaphore: Arc<Semaphore>,
    jobs: Arc<DashMap<String, JobHandle>>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_DOWNLOADS)),
            jobs: Arc::new(DashMap::new()),
        }
    }

    /// Resolution (which may hit the network for `github_release`/`html` specs) happens
    /// inside the spawned task so the caller gets a job id back immediately and the
    /// frontend can show a "resolving" state instead of blocking on it.
    pub fn start_download(
        &self,
        app_handle: AppHandle,
        app_id: String,
        app_name: String,
        resolver_spec: ResolverSpec,
        dest: PathBuf,
    ) -> String {
        let job_id = Uuid::new_v4().to_string();
        let cancel_token = CancellationToken::new();

        self.jobs.insert(
            job_id.clone(),
            JobHandle {
                app_id: app_id.clone(),
                app_name: app_name.clone(),
                cancel_token: cancel_token.clone(),
            },
        );

        events::queued(&app_handle, &job_id, &app_id, &app_name);

        let semaphore = self.semaphore.clone();
        let jobs = self.jobs.clone();
        let job_id_task = job_id.clone();

        tauri::async_runtime::spawn(async move {
            let _permit = semaphore.acquire().await;

            let job_body = async {
                events::resolving(&app_handle, &job_id_task, &app_id, &app_name);
                let url = match resolver::resolve(&app_handle, &resolver_spec).await {
                    Ok(url) => url,
                    Err(err) => {
                        events::failed(&app_handle, &job_id_task, &app_id, &app_name, err.to_string());
                        return;
                    }
                };

                events::started(&app_handle, &job_id_task, &app_id, &app_name);

                let progress_handle = app_handle.clone();
                let progress_job_id = job_id_task.clone();
                let progress_app_id = app_id.clone();
                let result = job::run(&url, &dest, &cancel_token, |downloaded, total| {
                    events::progress(&progress_handle, &progress_job_id, &progress_app_id, downloaded, total);
                })
                .await;

                match result {
                    Ok(()) => events::completed(&app_handle, &job_id_task, &app_id, &app_name, &dest.to_string_lossy()),
                    Err(DownloadError::Cancelled) => events::cancelled(&app_handle, &job_id_task, &app_id, &app_name),
                    Err(err) => events::failed(&app_handle, &job_id_task, &app_id, &app_name, err.to_string()),
                }
            };

            if tokio::time::timeout(JOB_SAFETY_TIMEOUT, job_body).await.is_err() {
                events::failed(
                    &app_handle,
                    &job_id_task,
                    &app_id,
                    &app_name,
                    format!("job exceeded the {}-minute safety limit and was aborted", JOB_SAFETY_TIMEOUT.as_secs() / 60),
                );
            }

            jobs.remove(&job_id_task);
        });

        job_id
    }

    pub fn cancel(&self, job_id: &str) -> bool {
        match self.jobs.get(job_id) {
            Some(job) => {
                job.cancel_token.cancel();
                true
            }
            None => false,
        }
    }

    pub fn list_active(&self) -> Vec<ActiveDownload> {
        self.jobs
            .iter()
            .map(|entry| ActiveDownload {
                job_id: entry.key().clone(),
                app_id: entry.app_id.clone(),
                app_name: entry.app_name.clone(),
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    /// Regression test for a real crash: `start_download` is a synchronous Tauri
    /// command, and Tauri does not guarantee sync commands run on a thread with an
    /// active Tokio runtime. Calling `tokio::spawn` directly from such a thread
    /// panics with "there is no reactor running" — and because that panic happens
    /// across a native WebView2 callback boundary, it can't unwind and aborts the
    /// whole process. `tauri::async_runtime::spawn` doesn't have this requirement
    /// (it falls back to its own runtime if none is set), which is what
    /// `DownloadManager::start_download` uses instead. This test spawns from a
    /// plain OS thread with no Tokio context at all, exactly reproducing the
    /// conditions that crashed the app.
    #[test]
    fn async_runtime_spawn_works_without_ambient_tokio_context() {
        let handle = std::thread::spawn(|| {
            tauri::async_runtime::spawn(async {});
        });
        handle.join().expect("spawning from a non-tokio thread must not panic");
    }
}
