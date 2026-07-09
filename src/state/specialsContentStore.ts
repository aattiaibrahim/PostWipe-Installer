import { create } from "zustand";
import { SPECIALS_WORKER_URL, categoryMeta, type SpecialsCategoryMeta } from "../lib/specialsConfig";

export interface SpecialsItem {
  /** Full R2 object key, e.g. "Tweaks/Cursors/Chroma_Cursors.zip". */
  objectKey: string;
  /** Display name (filename, extension stripped, underscores spaced). */
  name: string;
  filename: string;
  ext: string;
  size: number;
}

export interface SpecialsGroup {
  folder: string;
  meta: SpecialsCategoryMeta;
  items: SpecialsItem[];
}

interface SpecialsContentState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  groups: SpecialsGroup[];
  load: (key: string) => Promise<void>;
}

function prettyName(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  return stem.replace(/_/g, " ").trim();
}

export const useSpecialsContentStore = create<SpecialsContentState>((set, get) => ({
  loaded: false,
  loading: false,
  error: null,
  groups: [],
  load: async (key) => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${SPECIALS_WORKER_URL}/list?key=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`list failed (${res.status})`);
      const data: { objects: { key: string; size: number }[] } = await res.json();

      const byFolder = new Map<string, SpecialsItem[]>();
      for (const obj of data.objects) {
        if (obj.key.endsWith("/")) continue; // folder marker
        const parts = obj.key.split("/");
        if (parts.length < 3) continue; // expect Tweaks/<folder>/<file...>
        const folder = parts[1];
        const filename = parts.slice(2).join("/");
        if (!filename) continue;
        const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
        const item: SpecialsItem = { objectKey: obj.key, name: prettyName(filename), filename, ext, size: obj.size };
        const arr = byFolder.get(folder) ?? [];
        arr.push(item);
        byFolder.set(folder, arr);
      }

      const groups: SpecialsGroup[] = [...byFolder.entries()]
        .map(([folder, items]) => ({
          folder,
          meta: categoryMeta(folder),
          items: items.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.meta.order - b.meta.order);

      set({ groups, loaded: true, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },
}));
