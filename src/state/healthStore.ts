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

  finish: (report) =>
    set({ running: false, report, byKey: index(report), finishedAt: Date.now(), loaded: true }),

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
