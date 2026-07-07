use super::events;
use super::job::{self, DownloadError};
use crate::catalog::model::ResolverSpec;
use crate::resolver;
use dashmap::DashMap;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const MAX_CONCURRENT_DOWNLOADS: usize = 3;

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

        tokio::spawn(async move {
            let _permit = semaphore.acquire().await;

            events::resolving(&app_handle, &job_id_task, &app_id, &app_name);
            let url = match resolver::resolve(&resolver_spec).await {
                Ok(url) => url,
                Err(err) => {
                    events::failed(&app_handle, &job_id_task, &app_id, &app_name, err.to_string());
                    jobs.remove(&job_id_task);
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
