use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use thiserror::Error;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(100);
const MAX_CONNECT_RETRIES: u32 = 2;

#[derive(Debug, Error)]
pub enum DownloadError {
    #[error("download was cancelled")]
    Cancelled,
    #[error("network error: {0}")]
    Network(String),
    #[error("filesystem error: {0}")]
    Io(String),
}

impl From<std::io::Error> for DownloadError {
    fn from(err: std::io::Error) -> Self {
        DownloadError::Io(err.to_string())
    }
}

fn part_path(dest: &Path) -> PathBuf {
    let mut os_string = dest.as_os_str().to_owned();
    os_string.push(".part");
    PathBuf::from(os_string)
}

async fn send_with_retry(client: &reqwest::Client, url: &str) -> Result<reqwest::Response, DownloadError> {
    let mut attempt = 0;
    loop {
        match client.get(url).send().await {
            Ok(response) => return response.error_for_status().map_err(|e| DownloadError::Network(e.to_string())),
            Err(err) if attempt < MAX_CONNECT_RETRIES && (err.is_connect() || err.is_timeout()) => {
                attempt += 1;
            }
            Err(err) => return Err(DownloadError::Network(err.to_string())),
        }
    }
}

/// Streams `url` to `dest`, writing through a `.part` sibling file that's
/// atomically renamed on success so a cancelled/failed download never leaves
/// a half-written file at the final path.
pub async fn run(
    url: &str,
    dest: &Path,
    cancel: &CancellationToken,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> Result<(), DownloadError> {
    let client = reqwest::Client::new();
    let response = send_with_retry(&client, url).await?;
    let total_bytes = response.content_length();

    let part = part_path(dest);
    let mut file = tokio::fs::File::create(&part).await?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                drop(file);
                let _ = tokio::fs::remove_file(&part).await;
                return Err(DownloadError::Cancelled);
            }
            chunk = stream.next() => {
                match chunk {
                    Some(Ok(bytes)) => {
                        file.write_all(&bytes).await?;
                        downloaded += bytes.len() as u64;
                        if last_emit.elapsed() >= PROGRESS_EMIT_INTERVAL {
                            on_progress(downloaded, total_bytes);
                            last_emit = Instant::now();
                        }
                    }
                    Some(Err(err)) => {
                        drop(file);
                        let _ = tokio::fs::remove_file(&part).await;
                        return Err(DownloadError::Network(err.to_string()));
                    }
                    None => break,
                }
            }
        }
    }

    on_progress(downloaded, total_bytes);
    file.flush().await?;
    drop(file);
    tokio::fs::rename(&part, dest).await?;
    Ok(())
}
