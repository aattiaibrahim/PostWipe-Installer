import { create } from "zustand";
import { SPECIALS_WORKER_URL, categoryMeta, displayName, type SpecialsCategoryMeta } from "../lib/specialsConfig";

export interface SpecialsItem {
  /** Full R2 object key, e.g. "Tweaks/Cursors/Chroma_Cursors.zip". */
  objectKey: string;
  /** Display name (filename, extension stripped, underscores spaced). */
  name: string;
  /** Basename only — used as the on-disk filename when downloading. */
  filename: string;
  ext: string;
  size: number;
  /** Object keys of preview images under previews/, main image first. Empty = no preview. */
  previewKeys: string[];
  /** Individual playable sound previews under previews-audio/<stem>/, when present. */
  audioPreviews: { name: string; key: string }[];
}

/** A nested folder inside a category, itself possibly containing more folders — e.g.
 *  Wallpapers & Profile Pics ▸ Profile Pics ▸ Evangelion. Recursive so arbitrary depth works. */
export interface SpecialsSubfolder {
  name: string;
  items: SpecialsItem[];
  subfolders: SpecialsSubfolder[];
}

export interface SpecialsGroup {
  folder: string;
  meta: SpecialsCategoryMeta;
  items: SpecialsItem[];
  subfolders: SpecialsSubfolder[];
}

/** Every item at or below a subfolder (used for cover collages + batch select). */
export function flattenSubfolder(sf: SpecialsSubfolder): SpecialsItem[] {
  return [...sf.items, ...sf.subfolders.flatMap(flattenSubfolder)];
}

/** Every item anywhere in a category. */
export function flattenGroup(g: SpecialsGroup): SpecialsItem[] {
  return [...g.items, ...g.subfolders.flatMap(flattenSubfolder)];
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

      // Preview images live under previews/<item stem>.<ext> (main) plus optional extra
      // angles as previews/<item stem>__2.<ext>, __3.<ext>… — index all of them by stem.
      const previewsByStem = new Map<string, { order: number; key: string }[]>();
      // Playable sound previews live under previews-audio/<item stem>/<sound>.wav.
      const audioByStem = new Map<string, { name: string; key: string }[]>();
      for (const obj of data.objects) {
        if (obj.key.endsWith("/")) continue;
        if (obj.key.startsWith("previews/")) {
          const file = obj.key.slice("previews/".length);
          const noExt = file.replace(/\.[^.]+$/, "");
          const m = noExt.match(/^(.*?)__(\d+)$/);
          const stem = m ? m[1] : noExt;
          const order = m ? parseInt(m[2], 10) : 1;
          const arr = previewsByStem.get(stem) ?? [];
          arr.push({ order, key: obj.key });
          previewsByStem.set(stem, arr);
        } else if (obj.key.startsWith("previews-audio/")) {
          const parts = obj.key.split("/");
          if (parts.length < 3) continue;
          const stem = parts[1];
          const soundFile = parts.slice(2).join("/");
          const arr = audioByStem.get(stem) ?? [];
          arr.push({ name: soundFile.replace(/\.[^.]+$/, ""), key: obj.key });
          audioByStem.set(stem, arr);
        }
      }

      // Build a nested tree per category: walk every path segment between Tweaks/<folder>/
      // and the filename, creating folder nodes as needed. Arbitrary depth (e.g. Profile
      // Pics ▸ Evangelion) is preserved instead of being flattened.
      interface MutNode {
        items: SpecialsItem[];
        subs: Map<string, MutNode>;
      }
      const makeNode = (): MutNode => ({ items: [], subs: new Map() });
      const byFolder = new Map<string, MutNode>();
      for (const obj of data.objects) {
        if (obj.key.endsWith("/")) continue; // folder marker
        const parts = obj.key.split("/");
        if (parts.length < 3 || parts[0] !== "Tweaks") continue; // content lives under Tweaks/<folder>/
        const folder = parts[1];
        const segs = parts.slice(2, -1); // nested folder names between the category and the file
        const filename = parts[parts.length - 1];
        if (!filename) continue;
        const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
        const stem = filename.replace(/\.[^.]+$/, "");
        const item: SpecialsItem = {
          objectKey: obj.key,
          name: prettyName(filename),
          filename,
          ext,
          size: obj.size,
          previewKeys: (previewsByStem.get(stem) ?? []).sort((a, b) => a.order - b.order).map((p) => p.key),
          audioPreviews: (audioByStem.get(stem) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
        };
        let node: MutNode | undefined = byFolder.get(folder);
        if (!node) {
          node = makeNode();
          byFolder.set(folder, node);
        }
        let cursor: MutNode = node;
        for (const seg of segs) {
          let child: MutNode | undefined = cursor.subs.get(seg);
          if (!child) {
            child = makeNode();
            cursor.subs.set(seg, child);
          }
          cursor = child;
        }
        cursor.items.push(item);
      }

      const byName = (a: SpecialsItem, b: SpecialsItem) => a.name.localeCompare(b.name);
      const toSubfolders = (subs: Map<string, MutNode>): SpecialsSubfolder[] =>
        [...subs.entries()]
          .map(([name, n]) => ({ name, items: n.items.sort(byName), subfolders: toSubfolders(n.subs) }))
          .sort((a, b) => a.name.localeCompare(b.name));

      const groups: SpecialsGroup[] = [...byFolder.entries()]
        .map(([folder, node]) => ({
          folder,
          meta: categoryMeta(folder),
          items: node.items.sort(byName),
          subfolders: toSubfolders(node.subs),
        }))
        .sort((a, b) => a.meta.order - b.meta.order);

      set({ groups, loaded: true, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },
}));

// Dev-only escape hatch: the vault is key-gated and the gate never persists, so the
// browser preview can't reach this UI otherwise. Lets layout work be verified with
// mock groups (window.__specialsContent.setState({loaded: true, groups: [...]})).
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__specialsContent = useSpecialsContentStore;
}
