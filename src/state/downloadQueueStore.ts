import { create } from "zustand";
import type { DownloadJobState } from "../types/download";

interface DownloadQueueState {
  jobs: Record<string, DownloadJobState>;
  upsertJob: (patch: Partial<DownloadJobState> & { jobId: string }) => void;
}

export const useDownloadQueueStore = create<DownloadQueueState>((set) => ({
  jobs: {},
  upsertJob: (patch) =>
    set((state) => {
      const existing = state.jobs[patch.jobId];
      return {
        jobs: {
          ...state.jobs,
          [patch.jobId]: {
            appId: existing?.appId ?? patch.appId ?? "",
            appName: existing?.appName ?? patch.appName ?? "",
            status: existing?.status ?? "queued",
            bytesDownloaded: existing?.bytesDownloaded ?? 0,
            totalBytes: existing?.totalBytes ?? null,
            ...patch,
          },
        },
      };
    }),
}));
