export type DownloadStatus = "queued" | "resolving" | "downloading" | "completed" | "failed" | "cancelled";

export interface DownloadJobState {
  jobId: string;
  appId: string;
  appName: string;
  status: DownloadStatus;
  bytesDownloaded: number;
  totalBytes: number | null;
  destPath?: string;
  error?: string;
  verification?: string;
}

export interface StatusEventPayload {
  jobId: string;
  appId: string;
  appName: string;
  destPath?: string;
  error?: string;
  /** What the app confirmed about a finished file: "Verified: signed by Valve Corp." */
  verification?: string;
}

export interface ProgressEventPayload {
  jobId: string;
  appId: string;
  bytesDownloaded: number;
  totalBytes: number | null;
}
