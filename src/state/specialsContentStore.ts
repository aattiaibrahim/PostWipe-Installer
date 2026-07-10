import { create } from "zustand";
import { SPECIALS_WORKER_URL, categoryMeta, displayName, type SpecialsCategoryMeta } from "../lib/specialsConfig";

export interface SpecialsItem {
  /** Full R2 object key, e.g. "Tweaks/Cursors/Chroma_Cursors.zip". */
  objectKey: string;
  /** Display name (filename, extension stripped, underscores spaced). */
  name: string;
  filename: string;
  ext: string;
  size: number;
  /** Object key of a preview image under previews/, when one exists for this item. */
  previewKey?: string;
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

// Curated map + heuristic cleanup live in specialsConfig (the raw upload filenames are wild).
const prettyName = displayName;

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

      // Preview images live under previews/<item stem>.<ext> — index them by stem so
      // items can be matched to their thumbnail.
      const previewByStem = new Map<string, string>();
      for (const obj of data.objects) {
        if (obj.key.startsWith("previews/") && !obj.key.endsWith("/")) {
          const file = obj.key.slice("previews/".length);
          const stem = file.replace(/\.[^.]+$/, "");
          previewByStem.set(stem, obj.key);
        }
      }

      const byFolder = new Map<string, SpecialsItem[]>();
      for (const obj of data.objects) {
        if (obj.key.endsWith("/")) continue; // folder marker
        const parts = obj.key.split("/");
        if (parts.length < 3 || parts[0] !== "Tweaks") continue; // content lives under Tweaks/<folder>/
        const folder = parts[1];
        const filename = parts.slice(2).join("/");
        if (!filename) continue;
        const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
        const stem = filename.replace(/\.[^.]+$/, "");
        const item: SpecialsItem = {
          objectKey: obj.key,
          name: prettyName(filename),
          filename,
          ext,
          size: obj.size,
          previewKey: previewByStem.get(stem),
        };
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
