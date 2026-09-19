import { useEffect } from "react";
import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { cancelInstall, installDownloads, isTauri, type InstallState } from "../lib/tauriCommands";
import { useDownloadQueueStore } from "./downloadQueueStore";

/** One app in an "Install for me" run. It starts as a download job, then becomes a file. */
export interface InstallItem {
  jobId: string;
  appId: string;
  appName: string;
  path?: string;
  phase: "downloading" | InstallState;
  detail?: string | null;
  admin?: boolean;
  mode?: string;
}

interface InstallStoreState {
  stage: "idle" | "downloading" | "installing" | "done";
  sessionId: string | null;
  items: InstallItem[];
  /** Starts a run: the download jobs to wait for, then install. */
  begin: (jobs: { jobId: string; appId: string; appName: string }[]) => void;
  cancel: () => void;
  dismiss: () => void;
}

const TERMINAL_DOWNLOAD = new Set(["completed", "failed", "cancelled"]);

export const useInstallStore = create<InstallStoreState>((set, get) => ({
  stage: "idle",
  sessionId: null,
  items: [],
  begin: (jobs) => {
    set({
      stage: "downloading",
      sessionId: null,
      items: jobs.map((j) => ({ ...j, phase: "downloading" })),
    });
    // Some may have finished already (or none started at all).
    syncFromQueue();
  },
  cancel: () => {
    const { sessionId, stage, items } = get();
    if (stage === "downloading") {
      // Nothing has run yet: just don't install when the downloads finish.
      set({
        stage: "done",
        items: items.map((i) => (i.phase === "downloading" || i.phase === "waiting" ? { ...i, phase: "skipped", detail: "Cancelled." } : i)),
      });
      return;
    }
    if (sessionId) void cancelInstall(sessionId).catch(() => {});
  },
  dismiss: () => set({ stage: "idle", sessionId: null, items: [] }),
}));

if (import.meta.env.DEV) {
  (window as unknown as { __installStore: typeof useInstallStore }).__installStore = useInstallStore;
}

type StepPayload = { sessionId: string; path: string; state: InstallState; detail: string | null };
/** Events that arrived before install_downloads returned our session id (the backend starts
 *  right away), replayed once it's known. */
let early: { step?: StepPayload; finished?: string }[] = [];

function onStep(p: StepPayload) {
  const { sessionId, stage } = useInstallStore.getState();
  if (sessionId === null && stage === "installing") early.push({ step: p });
  else if (p.sessionId === sessionId) applyStep(p.path, p.state, p.detail);
}

function onFinished(id: string) {
  const { sessionId, stage } = useInstallStore.getState();
  if (sessionId === null && stage === "installing") early.push({ finished: id });
  else if (id === sessionId) useInstallStore.setState({ stage: "done" });
}

function applyStep(path: string, state: InstallState, detail: string | null | undefined) {
  useInstallStore.setState((s) => ({
    items: s.items.map((i) => (i.path === path ? { ...i, phase: state, detail: detail ?? i.detail } : i)),
  }));
}

/** Browser preview only: plays a plausible install so the page can be checked without Windows. */
function simulate(paths: string[]) {
  const states: InstallState[] = ["installed", "installed", "opened", "installed", "failed"];
  paths.forEach((path, n) => {
    window.setTimeout(() => applyStep(path, "running", null), 700 + n * 1400);
    window.setTimeout(() => {
      const state = states[n % states.length];
      applyStep(path, state, state === "failed" ? "The installer stopped with code 1603." : state === "opened" ? "Opened its installer. Finish it there." : null);
    }, 1500 + n * 1400);
  });
  window.setTimeout(() => useInstallStore.setState({ stage: "done" }), 1800 + paths.length * 1400);
}

async function startInstalling() {
  const { items } = useInstallStore.getState();
  const ready = items.filter((i) => i.phase === "waiting" && i.path);
  if (ready.length === 0) {
    useInstallStore.setState({ stage: "done" });
    return;
  }
  early = [];
  useInstallStore.setState({ stage: "installing" });
  if (!isTauri) return simulate(ready.map((i) => i.path!));
  try {
    const plan = await installDownloads(ready.map((i) => i.path!));
    useInstallStore.setState((s) => ({
      sessionId: plan.sessionId,
      items: s.items.map((i) => {
        const step = plan.steps.find((p) => p.path === i.path);
        return step ? { ...i, phase: step.state, detail: step.detail, admin: step.admin, mode: step.mode } : i;
      }),
    }));
    const replay = early;
    early = [];
    for (const e of replay) {
      if (e.step) onStep(e.step);
      if (e.finished) onFinished(e.finished);
    }
    // A plan with nothing runnable finishes immediately (no "finished" event would come).
    if (plan.steps.every((p) => p.state !== "waiting")) useInstallStore.setState({ stage: "done" });
  } catch (err) {
    useInstallStore.setState((s) => ({
      stage: "done",
      items: s.items.map((i) => (i.phase === "waiting" ? { ...i, phase: "failed", detail: String(err) } : i)),
    }));
  }
}

/** Moves finished downloads of the current run along; installs once none are left. */
function syncFromQueue() {
  const { stage, items } = useInstallStore.getState();
  if (stage !== "downloading") return;
  const jobs = useDownloadQueueStore.getState().jobs;
  let changed = false;
  const next = items.map((item) => {
    if (item.phase !== "downloading") return item;
    const job = jobs[item.jobId];
    if (!job || !TERMINAL_DOWNLOAD.has(job.status)) return item;
    changed = true;
    if (job.status === "completed" && job.destPath) return { ...item, phase: "waiting" as const, path: job.destPath };
    if (job.status === "cancelled") return { ...item, phase: "skipped" as const, detail: "Download cancelled." };
    return { ...item, phase: "failed" as const, detail: job.error ? `Download failed: ${job.error}` : "Download failed." };
  });
  if (changed) useInstallStore.setState({ items: next });
  if (next.every((i) => i.phase !== "downloading")) void startInstalling();
}

/** Mounted once (App): follows the downloads of the current run, starts installing when they
 *  have all finished, and applies the backend's progress events. */
export function useInstallRunner() {
  useEffect(() => useDownloadQueueStore.subscribe(syncFromQueue), []);

  useEffect(() => {
    if (!isTauri) return;
    const offStep = listen<StepPayload>("install://step", (e) => onStep(e.payload));
    const offDone = listen<string>("install://finished", (e) => onFinished(e.payload));
    return () => {
      void offStep.then((f) => f());
      void offDone.then((f) => f());
    };
  }, []);
}
