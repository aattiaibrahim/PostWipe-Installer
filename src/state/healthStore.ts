import { create } from "zustand";
import type { Os } from "../types/catalog";
import {
  clearLocalHealth,
  loadCatalogHealth,
  runHealthCheck,
  type EntryHealth,
  type HealthReport,
  type HealthStatus,
} from "../lib/tauriCommands";

/** One printed line in the live-check terminal. */
export interface CheckLine {
  appId: string;
  status: HealthStatus;
  detail: string;
}

interface HealthState {
  report: HealthReport | null;
  /** Keyed `${appId}:${os}` so a lookup per row is O(1) — the catalog is ~120 entries and
   *  every row re-reads this on each render. */
  byKey: Record<string, EntryHealth>;
  loaded: boolean;

  /** Live-check (Settings) state. */
  running: boolean;
  done: number;
  total: number;
  lines: CheckLine[];
  finishedAt: number | null;
  /** Which OS the last live check actually swept — the summary line says so, because a
   *  Windows-only run reporting 81 of the catalog's 121 entries otherwise reads like
   *  entries went missing. */
  checkedOs: Os | null;

  load: () => Promise<void>;
  start: (total: number) => void;
  push: (line: CheckLine) => void;
  finish: (report: HealthReport) => void;
  run: (os: Os) => Promise<void>;
  reset: () => Promise<void>;
}

function index(report: HealthReport | null): Record<string, EntryHealth> {
  const map: Record<string, EntryHealth> = {};
  for (const entry of report?.entries ?? []) map[`${entry.app_id}:${entry.os}`] = entry;
  return map;
}

export const useHealthStore = create<HealthState>((set, get) => ({
  report: null,
  byKey: {},
  loaded: false,
  running: false,
  done: 0,
  total: 0,
  lines: [],
  finishedAt: null,
  checkedOs: null,

  load: async () => {
    const report = await loadCatalogHealth();
    set({ report, byKey: index(report), loaded: true });
  },

  start: (total) => set({ running: true, done: 0, total, lines: [], finishedAt: null }),

  push: (line) =>
    set((s) => ({
      done: s.done + 1,
      // Terminal output is append-only and the sweep is bounded (~60 entries), so no cap
      // is needed — but keep the array copy shallow to avoid re-cloning every line.
      lines: [...s.lines, line],
    })),

  /* MERGE, never replace. A live check only covers the OS you're running, so assigning its
     report wholesale would drop every badge for the other platform the moment the sweep
     finished — and they'd stay gone until the next launch re-read the published file. The
     Rust loader does the same overlay on startup; this keeps the two consistent. */
  finish: (report) =>
    set((s) => {
      const entries = [...(s.report?.entries ?? [])];
      for (const entry of report.entries) {
        const at = entries.findIndex((e) => e.app_id === entry.app_id && e.os === entry.os);
        if (at === -1) entries.push(entry);
        else entries[at] = entry;
      }
      const merged: HealthReport = { ...report, entries };
      return {
        running: false,
        report: merged,
        byKey: index(merged),
        checkedOs: report.entries[0]?.os ?? s.checkedOs,
        finishedAt: Date.now(),
        loaded: true,
      };
    }),

  run: async (os) => {
    if (get().running) return;
    // `start` normally arrives via the health-check:start event; set running immediately so
    // the button can't be double-fired in the gap before the backend emits it.
    set({ running: true, done: 0, total: 0, lines: [], finishedAt: null });
    try {
      const report = await runHealthCheck(os);
      get().finish(report);
    } catch (err) {
      set((s) => ({
        running: false,
        lines: [...s.lines, { appId: "", status: "unknown", detail: `check failed: ${String(err)}` }],
      }));
    }
  },

  reset: async () => {
    await clearLocalHealth();
    set({ lines: [], done: 0, total: 0, finishedAt: null });
    await get().load();
  },
}));

/** Health of one (app, os) pair, or null when it was never checked (bookmarks, scripts,
 *  and anything added since the last sweep). Null means "show no badge" — never a guess. */
export function useEntryHealth(appId: string, os: Os): EntryHealth | null {
  return useHealthStore((s) => s.byKey[`${appId}:${os}`] ?? null);
}
