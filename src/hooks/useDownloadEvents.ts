import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../lib/tauriCommands";
import { useDownloadQueueStore } from "../state/downloadQueueStore";
import type { ProgressEventPayload, StatusEventPayload } from "../types/download";

export function useDownloadEvents() {
  const upsertJob = useDownloadQueueStore((s) => s.upsertJob);

  useEffect(() => {
    if (!isTauri) return;

    const unlistenPromises = [
      listen<StatusEventPayload>("download://queued", (e) =>
        upsertJob({ jobId: e.payload.jobId, appId: e.payload.appId, appName: e.payload.appName, status: "queued" }),
      ),
      listen<StatusEventPayload>("download://resolving", (e) => upsertJob({ jobId: e.payload.jobId, status: "resolving" })),
      listen<StatusEventPayload>("download://started", (e) => upsertJob({ jobId: e.payload.jobId, status: "downloading" })),
      listen<ProgressEventPayload>("download://progress", (e) =>
        upsertJob({ jobId: e.payload.jobId, bytesDownloaded: e.payload.bytesDownloaded, totalBytes: e.payload.totalBytes }),
      ),
      listen<StatusEventPayload>("download://completed", (e) =>
        upsertJob({ jobId: e.payload.jobId, status: "completed", destPath: e.payload.destPath }),
      ),
      listen<StatusEventPayload>("download://failed", (e) =>
        upsertJob({ jobId: e.payload.jobId, status: "failed", error: e.payload.error }),
      ),
      listen<StatusEventPayload>("download://cancelled", (e) => upsertJob({ jobId: e.payload.jobId, status: "cancelled" })),
    ];

    return () => {
      unlistenPromises.forEach((p) => p.then((unlisten) => unlisten()));
    };
  }, [upsertJob]);
}
